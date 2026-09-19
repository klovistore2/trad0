import type { PeerEvent, PeerTransport, ReceivedEvent } from "@/types/session";

export class NeonPeerTransport implements PeerTransport {
  private sessionId = "";
  private controller = new AbortController();
  private timer?: ReturnType<typeof setTimeout>;
  private cursor = "0";
  private subscribers = new Set<(event: ReceivedEvent) => void>();
  private sending = Promise.resolve();
  private floor: (slot: number) => void = () => {};
  private claimedAt = 0;
  constructor(private onError: (message: string) => void) {}
  onFloor(cb: (slot: number) => void) { this.floor = cb; }
  async connect(sessionId: string) {
    this.sessionId = sessionId;
    await this.poll();
  }
  subscribe(cb: (event: ReceivedEvent) => void) { this.subscribers.add(cb); return () => { this.subscribers.delete(cb); }; }
  private async poll() {
    if (this.controller.signal.aborted) return;
    const startedAt = Date.now();
    try {
      const response = await fetch(`/api/sessions/${this.sessionId}/events?after=${this.cursor}`, { signal: this.controller.signal, cache: "no-store" });
      const data = await response.json();
      if (!response.ok) {
        if ([401, 403, 404].includes(response.status)) { this.onError(data.error || "La conversation est terminée."); this.disconnect(); return; }
        throw new Error(data.error || "Connexion perdue. Réessayez.");
      }
      for (const event of data.events as ReceivedEvent[]) {
        this.subscribers.forEach(cb => cb(event));
        this.cursor = event.seq;
      }
      // A poll issued before our own claim landed carries a stale floor: ignore it.
      if (typeof data.floor === "number" && startedAt > this.claimedAt) this.floor(data.floor);
    } catch (error) {
      if (!this.controller.signal.aborted) this.onError(error instanceof Error ? error.message : "Connexion perdue.");
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
          if (!response.ok) throw new Error("Le message n’a pas pu être envoyé. Reconnectez-vous.");
          return;
        } catch (error) {
          if (this.controller.signal.aborted) return;
          if (attempt === 1) throw error;
        }
      }
    }).catch(error => { if (!this.controller.signal.aborted) this.onError(error instanceof Error ? error.message : "Envoi impossible."); });
    return this.sending;
  }
  async takeFloor() {
    const response = await fetch(`/api/sessions/${this.sessionId}/floor`, { method: "POST", signal: this.controller.signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Impossible de prendre la parole.");
    this.claimedAt = Date.now();
    this.floor(data.floor);
    return data.floor as number;
  }
  disconnect() { this.controller.abort(); clearTimeout(this.timer); this.subscribers.clear(); }
}
