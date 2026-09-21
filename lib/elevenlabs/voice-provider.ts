import type { VoiceProvider, VoiceStatus } from "@/types/voice";

// A short WAV built in memory: used to prime playback during a gesture, and as a local test beep.
function wav(seconds: number, frequency: number, rate = 8000) {
  const samples = Math.floor(seconds * rate);
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  text(0, "RIFF"); view.setUint32(4, 36 + samples * 2, true); text(8, "WAVEfmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) {
    const fade = Math.min(1, Math.min(i, samples - i) / (rate * 0.02));
    view.setInt16(44 + i * 2, frequency ? Math.round(Math.sin((i * 2 * Math.PI * frequency) / rate) * 9000 * fade) : 0, true);
  }
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

export class ElevenLabsVoiceProvider implements VoiceProvider {
  private element?: HTMLAudioElement;
  private active?: AbortController;
  private source?: string;
  private ready = false;
  private failure = "";
  private voiceSource = "";
  private latency = { request: 0, total: 0 };
  constructor(private onStatus: (status: VoiceStatus, message?: string) => void = () => {}) {}

  private audio() {
    if (!this.element) {
      const element = new Audio();
      element.preload = "auto";
      // Media playback, not Web Audio: this is what keeps sound alive on a silenced iPhone.
      element.setAttribute("playsinline", "");
      this.element = element;
    }
    return this.element;
  }
  private play(source: string) {
    const element = this.audio();
    if (this.source) URL.revokeObjectURL(this.source);
    this.source = source;
    element.src = source;
    return element.play();
  }

  async unlock() {
    if (this.ready) return;
    try {
      await this.play(wav(0.05, 0));
      this.ready = true;
    } catch {
      throw new Error("Touchez l’écran pour entendre la traduction.");
    }
  }
  get contextState() { return this.ready ? "running" : "absent"; }
  get lastFailure() { return this.failure; }
  get lastVoice() { return this.voiceSource; }
  get lastLatency() { return this.latency; }
  async testTone() {
    await this.unlock();
    await this.play(wav(0.4, 440));
  }
  stop() {
    this.active?.abort();
    this.active = undefined;
    this.element?.pause();
    this.onStatus("idle");
  }
  dispose() {
    this.stop();
    if (this.source) URL.revokeObjectURL(this.source);
    this.source = undefined;
    this.element = undefined;
  }

  async speakStream({ textStream, language, sessionId, signal }: Parameters<VoiceProvider["speakStream"]>[0]) {
    this.stop();
    const controller = new AbortController();
    this.active = controller;
    const cancel = () => controller.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) controller.abort();
    try {
      if (controller.signal.aborted) return;
      const startedAt = Date.now();
      await this.unlock();
      this.onStatus("loading");
      let text = "";
      for await (const chunk of textStream) text += chunk;
      if (!text.trim() || controller.signal.aborted) return;
      const response = await fetch("/api/elevenlabs/speak", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, text, language }), signal: controller.signal,
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        this.failure = `speech HTTP ${response.status}`;
        throw new Error(detail.error || "La voix est indisponible. Le texte reste accessible.");
      }
      this.voiceSource = response.headers.get("x-voice-source") || "unknown";
      this.latency = { request: Date.now() - startedAt, total: 0 };
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      if (!blob.size) { this.failure = "empty audio"; throw new Error("Aucun son reçu. Réessayez."); }
      const element = this.audio();
      await this.play(URL.createObjectURL(blob));
      this.latency = { request: this.latency.request, total: Date.now() - startedAt };
      this.onStatus("playing");
      await new Promise<void>((resolve, reject) => {
        const settle = (error?: Error) => {
          element.onended = null; element.onerror = null;
          controller.signal.removeEventListener("abort", onAbort);
          if (error) reject(error); else resolve();
        };
        const onAbort = () => settle();
        controller.signal.addEventListener("abort", onAbort, { once: true });
        element.onended = () => settle();
        element.onerror = () => { this.failure = "audio element error"; settle(new Error("La lecture a été interrompue.")); };
      });
      if (!controller.signal.aborted) { this.failure = ""; this.onStatus("idle"); }
    } catch (error) {
      if (!controller.signal.aborted) {
        this.element?.pause();
        const message = error instanceof Error ? error.message : "La voix est indisponible.";
        this.onStatus("error", message);
        throw new Error(message);
      }
    } finally { signal?.removeEventListener("abort", cancel); }
  }
}
