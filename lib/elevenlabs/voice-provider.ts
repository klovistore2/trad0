import type { VoiceProvider, VoiceStatus } from "@/types/voice";
import { pcm16ToFloat32 } from "@/lib/audio/pcm";

export class ElevenLabsVoiceProvider implements VoiceProvider {
  private context?: AudioContext;
  private active?: AbortController;
  private sources = new Set<AudioBufferSourceNode>();
  private nextTime = 0;
  constructor(private onStatus: (status: VoiceStatus, message?: string) => void = () => {}) {}

  async unlock() {
    this.context ??= new AudioContext();
    await this.context.resume();
    if (this.context.state !== "running") throw new Error("Touchez Activer le son pour écouter la traduction.");
  }
  get contextState() { return this.context?.state ?? "absent"; }
  // A local beep separates an OS-level mute from a broken pipeline: no network, same output path.
  async testTone() {
    await this.unlock();
    const context = this.context!;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 440;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.45);
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.start(context.currentTime);
    oscillator.stop(context.currentTime + 0.5);
  }
  stop() {
    this.active?.abort();
    this.active = undefined;
    for (const source of this.sources) source.stop();
    this.sources.clear();
    this.nextTime = 0;
    this.onStatus("idle");
  }
  dispose() { this.stop(); void this.context?.close(); this.context = undefined; }

  async speakStream({ textStream, language, sessionId, signal }: Parameters<VoiceProvider["speakStream"]>[0]) {
    this.stop();
    const controller = new AbortController();
    this.active = controller;
    const cancel = () => controller.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) controller.abort();
    try {
      if (controller.signal.aborted) return;
      await this.unlock();
      this.onStatus("loading");
      const response = await fetch("/api/elevenlabs/token", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }), signal: controller.signal,
      });
      const credentials = await response.json();
      if (!response.ok) throw new Error(credentials.error || "La voix est indisponible.");
      if (controller.signal.aborted) return;
      const params = new URLSearchParams({ model_id: credentials.model, single_use_token: credentials.token, output_format: "pcm_24000", language_code: language });
      await new Promise<void>((resolve, reject) => {
        const socket = new WebSocket(`wss://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(credentials.voiceId)}/stream-input?${params}`);
        let finished = false;
        let finalReceived = false;
        let pendingByte: number | undefined;
        let receivedAudio = false;
        let timer: ReturnType<typeof setTimeout>;
        let playbackTimer: ReturnType<typeof setTimeout>;
        const finish = (error?: Error) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer); clearTimeout(playbackTimer);
          controller.signal.removeEventListener("abort", abort);
          socket.close();
          if (error) reject(error); else resolve();
        };
        const abort = () => finish();
        controller.signal.addEventListener("abort", abort, { once: true });
        const timeout = () => {
          clearTimeout(timer);
          timer = setTimeout(() => finish(new Error("La lecture prend trop de temps. Réessayez.")), 20_000);
        };
        timeout();
        socket.onopen = async () => {
          try {
            socket.send(JSON.stringify({ text: " " }));
            for await (const text of textStream) {
              if (finished || controller.signal.aborted) return;
              socket.send(JSON.stringify({ text }));
            }
            if (!finished) socket.send(JSON.stringify({ text: "" }));
          } catch { finish(new Error("La lecture a été interrompue.")); }
        };
        socket.onmessage = ({ data }: MessageEvent<string>) => {
          if (finished || controller.signal.aborted) return;
          timeout();
          try {
            const event = JSON.parse(data);
            if (event.error) throw new Error("La synthèse vocale a échoué. Le texte reste accessible.");
            if (typeof event.audio === "string" && event.audio) {
              const raw = atob(event.audio);
              const bytes = new Uint8Array(raw.length + (pendingByte === undefined ? 0 : 1));
              let offset = 0;
              if (pendingByte !== undefined) bytes[offset++] = pendingByte;
              for (let i = 0; i < raw.length; i++) bytes[offset + i] = raw.charCodeAt(i);
              pendingByte = bytes.length % 2 ? bytes[bytes.length - 1] : undefined;
              const samples = pcm16ToFloat32(bytes.subarray(0, bytes.length - bytes.length % 2));
              const context = this.context;
              if (!context || context.state !== "running") throw new Error("Touchez Activer le son pour reprendre la lecture.");
              if (samples.length) {
                const buffer = context.createBuffer(1, samples.length, 24_000);
                buffer.copyToChannel(samples, 0);
                const source = context.createBufferSource();
                source.buffer = buffer; source.connect(context.destination);
                this.nextTime = Math.max(context.currentTime + 0.025, this.nextTime);
                source.start(this.nextTime); this.nextTime += buffer.duration;
                this.sources.add(source);
                source.onended = () => { this.sources.delete(source); source.disconnect(); };
                receivedAudio = true;
                this.onStatus("playing");
              }
            }
            if (event.isFinal || event.is_final) {
              finalReceived = true;
              clearTimeout(timer);
              if (!receivedAudio || pendingByte !== undefined) throw new Error("Aucun son lisible reçu. Réessayez.");
              const delay = Math.max(0, this.nextTime - (this.context?.currentTime ?? 0));
              playbackTimer = setTimeout(() => finish(), delay * 1000 + 50);
            }
          } catch (error) { finish(error instanceof Error ? error : new Error("La lecture a été interrompue.")); }
        };
        socket.onerror = () => finish(new Error("Connexion audio perdue. Réessayez."));
        socket.onclose = () => { if (!finalReceived) finish(new Error("La lecture a été interrompue.")); };
      });
      if (!controller.signal.aborted) this.onStatus("idle");
    } catch (error) {
      if (!controller.signal.aborted) {
        for (const source of this.sources) source.stop();
        this.sources.clear(); this.nextTime = 0;
        const message = error instanceof Error ? error.message : "La voix est indisponible.";
        this.onStatus("error", message);
        throw new Error(message);
      }
    } finally { signal?.removeEventListener("abort", cancel); }
  }
}
