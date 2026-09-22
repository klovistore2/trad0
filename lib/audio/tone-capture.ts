import { TONE_WINDOW_SECONDS } from "./speech-options";
export function pcmWav(chunks: Float32Array[], rate: number): Blob | null {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  if (length < rate * 0.35) return null;
  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
  write(0, "RIFF"); view.setUint32(4, buffer.byteLength - 8, true); write(8, "WAVEfmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, "data"); view.setUint32(40, length * 2, true);
  let offset = 44;
  for (const chunk of chunks) for (const sample of chunk) { view.setInt16(offset, Math.round(Math.max(-1, Math.min(1, sample)) * 32767), true); offset += 2; }
  return new Blob([buffer], { type: "audio/wav" });
}

// Speaking level below which audio is treated as silence.
const SILENCE_RMS = 0.01;
// This much silence ends an utterance: a short one is analysed right away.
const SPEECH_GAP_SECONDS = 0.7;
function rms(chunks: Float32Array[]) {
  let sum = 0, count = 0;
  for (const chunk of chunks) for (const sample of chunk) { sum += sample * sample; count++; }
  return count ? Math.sqrt(sum / count) : 0;
}

// Starts listening when the speaker starts talking and hands over the first seconds at once, so
// the estimate is ready by the time the sentence is translated. Longer speech is re-sampled.
export class ToneCapture {
  private context?: AudioContext;
  private source?: MediaStreamAudioSourceNode;
  private node?: AudioWorkletNode;
  private stream?: MediaStream;
  private chunks: Float32Array[] = [];
  private length = 0;
  private fresh = 0;
  private silence = 0;
  private speaking = false;
  private generation = 0;
  private paused = false;
  constructor(private onWindow: (audio: Blob) => void, private windowSeconds = TONE_WINDOW_SECONDS) {}
  setWindow(seconds: number) { this.windowSeconds = seconds; }
  listen(stream: MediaStream) {
    this.paused = false;
    if (this.stream === stream) return;
    this.stop(); this.stream = stream;
    const generation = this.generation;
    void (async () => {
      try {
        const context = new AudioContext({ sampleRate: 16000 }); this.context = context;
        await context.audioWorklet.addModule("/tone-capture.js");
        if (generation !== this.generation) return;
        const node = new AudioWorkletNode(context, "tone-capture"); this.node = node;
        node.port.onmessage = ({ data }: MessageEvent<Float32Array>) => {
          if (generation !== this.generation || this.paused) return;
          this.add(data, context.sampleRate);
        };
        this.source = context.createMediaStreamSource(stream);
        this.source.connect(node); node.connect(context.destination); // Processor outputs silence.
        await context.resume();
      } catch { if (generation === this.generation) this.stop(); }
    })();
  }
  add(data: Float32Array, rate: number) {
    const voiced = rms([data]) >= SILENCE_RMS;
    if (!this.speaking && !voiced) return;
    this.speaking = true;
    this.chunks.push(data); this.length += data.length; this.fresh += data.length;
    this.silence = voiced ? 0 : this.silence + data.length;
    while (this.length - this.chunks[0].length >= rate * this.windowSeconds) this.length -= this.chunks.shift()!.length;
    if (this.fresh >= rate * this.windowSeconds) this.emit(rate);
    else if (this.silence >= rate * SPEECH_GAP_SECONDS) this.endUtterance(rate);
  }
  // A closed microphone ends the turn: a short turn still gets one estimate from what it said.
  pause() {
    if (!this.paused) this.endUtterance(this.context?.sampleRate ?? 16000);
    this.paused = true;
  }
  private endUtterance(rate: number) {
    if (this.speaking && this.fresh - this.silence >= rate) this.emit(rate);
    this.chunks = []; this.length = 0; this.fresh = 0; this.silence = 0; this.speaking = false;
  }
  private emit(rate: number) {
    this.fresh = 0;
    if (rms(this.chunks) < SILENCE_RMS) return;
    const audio = pcmWav(this.chunks, rate);
    if (audio) this.onWindow(audio);
  }
  stop() {
    this.generation++; this.source?.disconnect(); this.node?.disconnect();
    if (this.node) this.node.port.onmessage = null;
    if (this.context) void this.context.close().catch(() => {});
    this.context = undefined; this.source = undefined; this.node = undefined; this.stream = undefined;
    this.chunks = []; this.length = 0; this.fresh = 0; this.silence = 0; this.speaking = false; this.paused = false;
  }
}
