// Counts observed speech without accessing, recording or retaining audio.
export class SpeechClock {
  private total = 0;
  private first: number | null = null;
  private last = 0;
  heard(now = Date.now()) {
    if (this.first !== null && now - this.last > 1500) this.pause(this.last + 1500);
    if (this.first === null) this.first = now;
    this.last = now;
  }
  pause(now = Date.now()) {
    if (this.first !== null) this.total += Math.max(0, Math.min(now, this.last + 1500) - this.first);
    this.first = null;
  }
  get seconds() { return (this.total + (this.first === null ? 0 : Math.max(0, Math.min(Date.now(), this.last + 1500) - this.first))) / 1000; }
}
