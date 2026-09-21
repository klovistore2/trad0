import type { SessionStatus, TranscriptEvent, TranslationProvider, TranslationSessionConfig } from "@/types/translation";
import { parseTranslationMessage } from "./events";

export class OpenAITranslationProvider implements TranslationProvider {
  private stream?: MediaStream;
  private peer?: RTCPeerConnection;
  private channel?: RTCDataChannel;
  private controller = new AbortController();
  private timer?: ReturnType<typeof setTimeout>;
  private pendingLanguage?: string;
  private original: (event: TranscriptEvent) => void = () => {};
  private translated: (event: TranscriptEvent) => void = () => {};
  private status: (status: SessionStatus, message?: string) => void = () => {};
  onOriginalTranscript(cb: typeof this.original) { this.original = cb; }
  onTranslatedText(cb: typeof this.translated) { this.translated = cb; }
  onStatus(cb: typeof this.status) { this.status = cb; }

  private fail(status: SessionStatus, message: string) {
    if (this.controller.signal.aborted) return;
    void this.disconnect();
    this.status(status, message);
  }

  async connect({ targetLanguage, sessionId, microphoneEnabled = true }: TranslationSessionConfig) {
    const signal = this.controller.signal;
    this.status("connecting");
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
      this.fail("microphone_denied", "Ouvrez ce site en HTTPS dans Safari ou Chrome pour utiliser le micro.");
      return;
    }
    this.timer = setTimeout(() => this.fail("network_error", "La connexion prend trop de temps. Réessayez."), 30_000);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      // Permission may resolve after cancellation or navigation.
      if (signal.aborted) { stream.getTracks().forEach(track => track.stop()); return; }
      this.stream = stream;
      // Apply the turn state before negotiation, so waiting for the floor never leaks audio.
      this.setMicrophoneEnabled(microphoneEnabled);
      stream.getAudioTracks().forEach(track => track.addEventListener("ended", () => this.fail("microphone_denied", "Le micro a été déconnecté. Réessayez.")));
      const tokenResponse = await fetch("/api/openai/realtime-token", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetLanguage, sessionId }), signal,
      });
      const token: unknown = await tokenResponse.json();
      if (!tokenResponse.ok || !token || typeof token !== "object" || !("value" in token) || typeof token.value !== "string") {
        const message = token && typeof token === "object" && "error" in token && typeof token.error === "string" ? token.error : "La traduction est indisponible. Réessayez.";
        this.fail("provider_error", message);
        return;
      }
      if (signal.aborted) return;
      const peer = new RTCPeerConnection();
      this.peer = peer;
      stream.getAudioTracks().forEach(track => peer.addTrack(track, stream));
      // Milestone 1: do not play the remote translated audio track yet.
      const channel = peer.createDataChannel("oai-events");
      this.channel = channel;
      channel.onopen = () => {
        if (signal.aborted) return;
        clearTimeout(this.timer);
        if (this.pendingLanguage) this.setTargetLanguage(this.pendingLanguage);
        this.status("listening");
      };
      channel.onmessage = ({ data }: MessageEvent<unknown>) => {
        if (signal.aborted || typeof data !== "string") return;
        const event = parseTranslationMessage(data);
        if (event?.kind === "original") this.original({ delta: event.delta, quality: "unknown" });
        if (event?.kind === "translation") this.translated({ delta: event.delta, quality: "unknown" });
        if (event?.kind === "error") this.fail("provider_error", "La traduction a été interrompue. Réessayez.");
        if (event?.kind === "closed") this.fail("network_error", "La session est terminée. Reconnectez-vous.");
      };
      channel.onerror = () => this.fail("network_error", "Connexion perdue. Réessayez.");
      channel.onclose = () => this.fail("network_error", "Connexion perdue. Réessayez.");
      peer.onconnectionstatechange = () => {
        if (["failed", "disconnected", "closed"].includes(peer.connectionState)) this.fail("network_error", "Connexion perdue. Réessayez.");
      };
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const response = await fetch("https://api.openai.com/v1/realtime/translations/calls", {
        method: "POST", headers: { Authorization: `Bearer ${token.value}`, "Content-Type": "application/sdp" }, body: offer.sdp, signal,
      });
      if (!response.ok) { this.fail("provider_error", "Impossible de démarrer la traduction. Réessayez."); return; }
      const sdp = await response.text();
      if (!signal.aborted) await peer.setRemoteDescription({ type: "answer", sdp });
    } catch (error) {
      if (signal.aborted) return;
      const denied = error instanceof DOMException && ["NotAllowedError", "NotFoundError", "NotReadableError"].includes(error.name);
      this.fail(denied ? "microphone_denied" : "network_error", denied
        ? "Autorisez le micro dans votre navigateur, puis réessayez."
        : "Impossible de se connecter. Vérifiez votre connexion et réessayez.");
    }
  }

  getStream() { return this.stream; }

  setTargetLanguage(language: string) {
    this.pendingLanguage = language;
    if (this.controller.signal.aborted || this.channel?.readyState !== "open") return;
    // Documented translation session update; keeps the microphone and clone recorder intact.
    this.channel.send(JSON.stringify({ type: "session.update", session: { audio: { output: { language } } } }));
    this.pendingLanguage = undefined;
  }

  setMicrophoneEnabled(enabled: boolean) {
    this.stream?.getAudioTracks().forEach(track => { track.enabled = enabled; });
  }

  async disconnect() {
    this.controller.abort();
    clearTimeout(this.timer);
    this.stream?.getTracks().forEach(track => track.stop());
    this.channel?.close();
    this.peer?.close();
    this.stream = undefined;
    this.peer = undefined;
    this.channel = undefined;
  }
}
