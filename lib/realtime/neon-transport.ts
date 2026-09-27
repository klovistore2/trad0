import type { PeerEvent, PeerTransport, ReceivedEvent } from "@/types/session";
import type { StringKey } from "@/lib/i18n/strings";

export const pollDelay = (failures: number) => failures ? Math.min(5000, 500 * 2 ** failures) : 500;

export class NeonPeerTransport implements PeerTransport {
  private sessionId = "";
  private controller = new AbortController();
  private timer?: ReturnType<typeof setTimeout>;
  // None on a fresh page: the server then sends recent finished sentences and where to go on from.
  private cursor: string | null = null;
  private subscribers = new Set<(event: ReceivedEvent) => void>();
  private sending = Promise.resolve();
  private floor: (slot: number | null) => void = () => {};
  private claimedAt = 0;
  // The newest subtitle waiting for each sentence: an older one still queued would only be
  // overwritten on the other screen, so it is dropped rather than sent over a slow network.
  private latest = new Map<string, string>();
  // Failed polls in a row: retries space out during an outage instead of hammering every 500 ms.
  private failures = 0;
  // Problems are reported as keys: the page shows them in the reader's language.
  constructor(private onError: (message: StringKey) => void) {}
  onFloor(cb: (slot: number | null) => void) { this.floor = cb; }
  async connect(sessionId: string) {
    this.sessionId = sessionId;
    await this.poll();
  }
  subscribe(cb: (event: ReceivedEvent) => void) { this.subscribers.add(cb); return () => { this.subscribers.delete(cb); }; }
  private async poll() {
    if (this.controller.signal.aborted) return;
    const startedAt = Date.now();
    try {
      const query = this.cursor === null ? "" : `?after=${this.cursor}`;
      const response = await fetch(`/api/sessions/${this.sessionId}/events${query}`, { signal: this.controller.signal, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        if ([401, 403, 404].includes(response.status)) { this.onError("conversationEnded"); this.disconnect(); return; }
        throw new Error(`events ${response.status}`);
      }
      for (const event of data.events as ReceivedEvent[]) {
        this.subscribers.forEach(cb => cb(event));
        this.cursor = event.seq;
      }
      if (typeof data.cursor === "string") this.cursor = data.cursor;
      // A poll issued before our own claim landed carries a stale floor: ignore it.
      if ("floor" in data && startedAt > this.claimedAt) this.floor(data.floor);
      this.failures = 0;
    } catch {
      if (!this.controller.signal.aborted) { this.failures++; this.onError("errorConnection"); }
    } finally {
      // 500 ms while healthy; 1, 2, 4 then 5 s at most while polls keep failing.
      if (!this.controller.signal.aborted) this.timer = setTimeout(() => void this.poll(), pollDelay(this.failures));
    }
  }
  send(event: PeerEvent): Promise<void> {
    this.latest.set(event.turnId, event.id);
    this.sending = this.sending.then(async () => {
      if (this.controller.signal.aborted) return;
      // A finished sentence is always sent; a subtitle only if nothing newer of it is waiting.
      if (event.committed) this.latest.delete(event.turnId);
      else if (this.latest.get(event.turnId) !== event.id) return;
      // Retrying the same event ID is idempotent on the server.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await fetch(`/api/sessions/${this.sessionId}/events`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(event), signal: this.controller.signal,
          });
          if (!response.ok) throw new Error(`send ${response.status}`);
          return;
        } catch (error) {
          if (this.controller.signal.aborted) return;
          if (attempt === 1) throw error;
        }
      }
    }).catch(() => { if (!this.controller.signal.aborted) this.onError("errorSend"); });
    return this.sending;
  }
  takeFloor() { return this.claimFloor("POST"); }
  releaseFloor() { return this.claimFloor("DELETE"); }
  private async claimFloor(method: string) {
    const response = await fetch(`/api/sessions/${this.sessionId}/floor`, { method, signal: this.controller.signal });
    const data = await response.json();
    if (!response.ok) throw new Error(`floor ${response.status}`);
    this.claimedAt = Date.now();
    this.floor(data.floor);
    return data.floor as number | null;
  }
  disconnect() { this.controller.abort(); clearTimeout(this.timer); this.subscribers.clear(); }
}
