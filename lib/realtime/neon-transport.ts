import type { PeerEvent, PeerTransport, ReceivedEvent } from "@/types/session";
import type { StringKey } from "@/lib/i18n/strings";

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
    } catch {
      if (!this.controller.signal.aborted) this.onError("errorConnection");
    } finally {
      if (!this.controller.signal.aborted) this.timer = setTimeout(() => void this.poll(), 500);
    }
  }
  send(event: PeerEvent): Promise<void> {
    this.sending = this.sending.then(async () => {
      if (this.controller.signal.aborted) return;
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
