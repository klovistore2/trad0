import type { PeerEvent } from "@/types/session";

// Subtitles are batched; a pause or sentence boundary commits the speech chunk once.
export class TurnPublisher {
  private turnId = crypto.randomUUID();
  private text = "";
  private publishTimer?: ReturnType<typeof setTimeout>;
  private commitTimer?: ReturnType<typeof setTimeout>;
  constructor(private send: (event: PeerEvent) => void) {}
  append(delta: string) {
    this.text += delta;
    if (!this.publishTimer) this.publishTimer = setTimeout(() => { this.publishTimer = undefined; this.publish(false); }, 250);
    clearTimeout(this.commitTimer);
    if (this.text.length >= 3500 || /[.!?。！？]\s*$/.test(this.text)) this.commit();
    else this.commitTimer = setTimeout(() => this.commit(), 1000);
  }
  private publish(committed: boolean) {
    if (this.text.trim()) this.send({ id: crypto.randomUUID(), turnId: this.turnId, text: this.text.slice(0, 4000), committed });
  }
  commit() {
    clearTimeout(this.publishTimer); clearTimeout(this.commitTimer); this.publishTimer = undefined;
    this.publish(true); this.text = ""; this.turnId = crypto.randomUUID();
  }
  dispose() { clearTimeout(this.publishTimer); clearTimeout(this.commitTimer); this.text = ""; }
}
