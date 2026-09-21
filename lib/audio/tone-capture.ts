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

export class ToneCapture {
  private context?: AudioContext;
  private source?: MediaStreamAudioSourceNode;
  private node?: AudioWorkletNode;
  private stream?: MediaStream;
  private chunks: Float32Array[] = [];
  private length = 0;
  private generation = 0;
  listen(stream: MediaStream) {
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
          if (generation !== this.generation) return;
          this.chunks.push(data); this.length += data.length;
          while (this.length > context.sampleRate * 8 && this.chunks.length) this.length -= this.chunks.shift()!.length;
        };
        this.source = context.createMediaStreamSource(stream);
        this.source.connect(node); node.connect(context.destination); // Processor outputs silence.
        await context.resume();
      } catch { if (generation === this.generation) this.stop(); }
    })();
  }
  take() {
    const result = pcmWav(this.chunks, this.context?.sampleRate ?? 16000);
    this.chunks = []; this.length = 0;
    return result;
  }
  stop() {
    this.generation++; this.source?.disconnect(); this.node?.disconnect();
    if (this.node) this.node.port.onmessage = null;
    if (this.context) void this.context.close().catch(() => {});
    this.context = undefined; this.source = undefined; this.node = undefined; this.stream = undefined;
    this.chunks = []; this.length = 0;
  }
}
