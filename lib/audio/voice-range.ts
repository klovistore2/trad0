import { classifyRange, estimatePitch, medianPitch, type VoiceRange } from "./pitch";

// Listens to the live microphone only to estimate vocal range, then stops.
// Nothing is recorded, kept or sent; only the resulting "low" or "high" leaves the device.
export class VoiceRangeDetector {
  private context?: AudioContext;
  private analyser?: AnalyserNode;
  private source?: MediaStreamAudioSourceNode;
  private timer?: ReturnType<typeof setInterval>;
  private frame?: Float32Array<ArrayBuffer>;
  private pitches: number[] = [];
  private decided: VoiceRange | null = null;
  constructor(private onDetected: (range: VoiceRange) => void) {}

  listen(stream: MediaStream) {
    if (this.source || this.decided || typeof AudioContext === "undefined") return;
    try {
      const context = new AudioContext();
      this.context = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      this.analyser = analyser;
      this.source = context.createMediaStreamSource(stream);
      this.source.connect(analyser);
      this.frame = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      this.timer = setInterval(() => this.sample(), 100);
    } catch { this.release(); }
  }
  private sample() {
    if (!this.analyser || !this.frame || !this.context || this.decided) return;
    this.analyser.getFloatTimeDomainData(this.frame);
    const pitch = estimatePitch(this.frame, this.context.sampleRate);
    if (pitch) this.pitches.push(pitch);
    const range = classifyRange(this.pitches);
    if (!range) return;
    this.decided = range;
    this.release();
    this.onDetected(range);
  }
  get state() {
    return { frames: this.pitches.length, median: Math.round(medianPitch(this.pitches)), range: this.decided };
  }
  private release() {
    clearInterval(this.timer); this.timer = undefined;
    this.source?.disconnect(); this.source = undefined;
    this.analyser = undefined; this.frame = undefined;
    void this.context?.close().catch(() => {}); this.context = undefined;
  }
  stop() { this.release(); }
}
