// Records the speaker's own turns for voice cloning, driven by the floor: recording is
// paused whenever the microphone is closed, so no silence and no other voice is captured.
// Nothing leaves the browser until a tier is reached; the buffer lives in memory only.
export class SpeechRecorder {
  private recorder?: MediaRecorder;
  private stream?: MediaStream;
  private chunks: Blob[] = [];
  private segments: Blob[] = [];
  private activeMs = 0;
  private resumedAt = 0;

  get seconds() {
    return (this.activeMs + (this.resumedAt ? Date.now() - this.resumedAt : 0)) / 1000;
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
    if (this.resumedAt) { this.activeMs += Date.now() - this.resumedAt; this.resumedAt = 0; }
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
