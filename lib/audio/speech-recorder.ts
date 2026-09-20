// Records the speaker's own turns for voice cloning, driven by the floor: recording is
// paused whenever the microphone is closed, so no silence and no other voice is captured.
// Nothing leaves the browser until a tier is reached; the buffer lives in memory only.
// Speech keeps flowing between words, so a pause shorter than this stays one stretch.
const SPEECH_TAIL_MS = 1500;

export class SpeechRecorder {
  private recorder?: MediaRecorder;
  private stream?: MediaStream;
  private chunks: Blob[] = [];
  private segments: Blob[] = [];
  private activeMs = 0;
  private resumedAt = 0;
  private speakingSince: number | null = null;
  private lastHeard = 0;

  // Counts speech, not an open microphone. Holding the floor while reading the screen or
  // waiting for the other person must not push the clone tiers forward.
  get seconds() {
    let total = this.activeMs;
    if (this.speakingSince !== null) {
      total += Math.max(0, Math.min(Date.now(), this.lastHeard + SPEECH_TAIL_MS) - this.speakingSince);
    }
    return total / 1000;
  }

  // Called on every transcript fragment: the provider only produces them while someone talks.
  heard() {
    if (!this.resumedAt) return;
    const now = Date.now();
    this.settle(now);
    if (this.speakingSince === null) this.speakingSince = now;
    this.lastHeard = now;
  }

  private settle(now = Date.now()) {
    if (this.speakingSince === null) return;
    if (now - this.lastHeard <= SPEECH_TAIL_MS) return;
    this.activeMs += (this.lastHeard + SPEECH_TAIL_MS) - this.speakingSince;
    this.speakingSince = null;
  }

  // Called whenever this device holds the floor. A new stream cannot continue the previous
  // container, so the finished recording is kept whole as its own segment.
  listen(stream: MediaStream) {
    if (typeof MediaRecorder === "undefined") return;
    if (this.recorder && this.stream === stream) {
      if (this.recorder.state === "paused") this.recorder.resume();
      if (!this.resumedAt) this.resumedAt = Date.now();
      return;
    }
    this.close();
    try {
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 64000 });
      recorder.ondataavailable = event => { if (event.data.size) this.chunks.push(event.data); };
      recorder.onerror = () => this.close();
      recorder.start(1000);
      this.recorder = recorder;
      this.stream = stream;
      this.resumedAt = Date.now();
    } catch { this.close(); }
  }

  pause() {
    // Close the stretch in progress rather than crediting the silence that follows it.
    if (this.speakingSince !== null) {
      this.activeMs += Math.max(0, Math.min(Date.now(), this.lastHeard + SPEECH_TAIL_MS) - this.speakingSince);
      this.speakingSince = null;
    }
    this.resumedAt = 0;
    if (this.recorder?.state === "recording") this.recorder.pause();
  }

  // The first chunk carries the container header, so the accumulated chunks form a valid file.
  samples() {
    const current = this.chunks.length ? [new Blob(this.chunks, { type: this.recorder?.mimeType || "audio/webm" })] : [];
    return [...this.segments, ...current];
  }

  // Once a final clone exists there is nothing left to improve, so the audio is dropped.
  discard() {
    this.segments = [];
    this.chunks = [];
  }

  private close() {
    this.pause();
    if (this.chunks.length) {
      this.segments.push(new Blob(this.chunks, { type: this.recorder?.mimeType || "audio/webm" }));
      this.chunks = [];
    }
    try { if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop(); } catch { /* already gone */ }
    this.recorder = undefined;
    this.stream = undefined;
  }

  stop() { this.close(); }
}
