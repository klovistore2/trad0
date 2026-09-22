import { wav } from "@/lib/elevenlabs/voice-provider";

type Signal = { epoch: string; targetEpoch: string | null; description: RTCSessionDescriptionInit | null };
// Only the translated OpenAI track is forwarded. No raw microphone ever enters this connection.
export class PeerAudioLink {
  private epoch = crypto.randomUUID();
  private remoteEpoch = "";
  private connection?: RTCPeerConnection;
  private sender?: RTCRtpSender;
  private outgoing: MediaStreamTrack | null = null;
  private remote?: MediaStream;
  private audio = new Audio();
  private controller = new AbortController();
  private timer?: ReturnType<typeof setTimeout>;
  private announced = false;
  private answered = false;
  private ready = false;
  private muted = false;
  private source?: string;
  private context?: AudioContext;
  private analyser?: AnalyserNode;
  private outgoingContext?: AudioContext;
  private outgoingAnalyser?: AnalyserNode;
  isSendingAudio() {
    if (!this.outgoingAnalyser || this.outgoingContext?.state !== "running") return false;
    const values = new Float32Array(this.outgoingAnalyser.fftSize);
    this.outgoingAnalyser.getFloatTimeDomainData(values);
    return values.some(value => Math.abs(value) > 0.008);
  }
  private monitor?: ReturnType<typeof setInterval>;
  private audible = false;
  private quietAt = 0;
  private disconnectedAt = 0;
  private waitingAt = 0;
  private incomingEnabled = true;
  status = "waiting";
  lastFailure = "";
  constructor(private id: string, private slot: number, private changed: (playing: boolean) => void, private failed: (message: string) => void) {
    this.audio.setAttribute("playsinline", ""); this.audio.autoplay = false;
  }
  async start() { await this.poll(); }
  async unlock() {
    // Called synchronously from the same gesture as the ElevenLabs media element.
    if (!this.ready) {
      this.source = wav(0.05, 0); this.audio.src = this.source;
      await this.audio.play(); this.ready = true;
    }
    await Promise.all([this.context?.resume(), this.outgoingContext?.resume()]);
    if (this.remote) { this.audio.srcObject = this.remote; await this.audio.play(); }
  }
  setMuted(muted: boolean) { this.muted = muted; this.audio.muted = muted || !this.incomingEnabled; }
  setIncomingEnabled(enabled: boolean) { this.incomingEnabled = enabled; this.setMuted(this.muted); }
  async setTrack(track: MediaStreamTrack | null) {
    // A caller can only provide the remote translation track, never getUserMedia's track.
    this.outgoing = track;
    void this.outgoingContext?.close(); this.outgoingContext = undefined; this.outgoingAnalyser = undefined;
    if (track && typeof AudioContext !== "undefined") {
      const context = new AudioContext(); this.outgoingContext = context;
      const analyser = context.createAnalyser(); analyser.fftSize = 512; this.outgoingAnalyser = analyser;
      context.createMediaStreamSource(new MediaStream([track])).connect(analyser);
      // Pull the remote track through a running audio graph. Without a rendering
      // sink Chromium can receive RTP without decoding any samples to forward.
      // The local sink is silent: only the other phone plays the translation.
      const silent = context.createGain(); silent.gain.value = 0;
      analyser.connect(silent).connect(context.destination);
      if (this.ready) void context.resume();
    }
    try { await this.sender?.replaceTrack(track); }
    catch { this.fail("Could not forward translated audio. Use translation with context."); }
  }
  private async post(description?: RTCSessionDescriptionInit) {
    const response = await fetch(`/api/sessions/${this.id}/audio-link`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ epoch: this.epoch, ...(this.remoteEpoch ? { targetEpoch: this.remoteEpoch } : {}), description }), signal: this.controller.signal,
    });
    if (!response.ok) throw new Error("Audio connection unavailable.");
  }
  private async create(iceServers: RTCIceServer[]) {
    this.connection?.close(); this.sender = undefined; this.answered = false;
    const pc = new RTCPeerConnection({ iceServers }); this.connection = pc;
    if (this.slot === 0) {
      const transceiver = pc.addTransceiver("audio", { direction: "sendrecv" });
      this.sender = transceiver.sender;
      if (this.outgoing) await this.sender.replaceTrack(this.outgoing);
    }
    pc.ontrack = event => {
      if (this.controller.signal.aborted || this.connection !== pc) return;
      this.remote = new MediaStream([event.track]);
      this.audio.srcObject = this.remote;
      if (this.ready) void this.audio.play().catch(() => { this.ready = false; this.failed("Touch the sound icon to resume translated audio."); });
      this.monitorAudio(this.remote);
    };
    pc.onconnectionstatechange = () => {
      if (this.controller.signal.aborted || this.connection !== pc) return;
      this.status = pc.connectionState;
      if (pc.connectionState === "connected") { this.disconnectedAt = 0; this.waitingAt = 0; this.lastFailure = ""; }
      if (pc.connectionState === "disconnected" && !this.disconnectedAt) this.disconnectedAt = Date.now();
      if (pc.connectionState === "failed") this.fail("Direct audio could not connect. Translation with context is available.");
    };
    return pc;
  }
  private async description(pc: RTCPeerConnection, description: RTCSessionDescriptionInit) {
    await pc.setLocalDescription(description);
    // Non-trickle ICE keeps the signalling adapter small. Only SDP text is stored, never audio.
    if (pc.iceGatheringState !== "complete") await new Promise<void>(resolve => {
      const done = () => { clearTimeout(timeout); pc.removeEventListener("icegatheringstatechange", check); this.controller.signal.removeEventListener("abort", done); resolve(); };
      const check = () => { if (pc.iceGatheringState === "complete") done(); };
      const timeout = setTimeout(done, 5000);
      pc.addEventListener("icegatheringstatechange", check); this.controller.signal.addEventListener("abort", done, { once: true });
    });
    if (!this.controller.signal.aborted && pc.localDescription) await this.post(pc.localDescription.toJSON());
  }
  private async poll() {
    if (this.controller.signal.aborted) return;
    try {
      if (!this.announced) { await this.post(); this.announced = true; }
      const response = await fetch(`/api/sessions/${this.id}/audio-link`, { signal: this.controller.signal, cache: "no-store" });
      if ([401, 403, 404].includes(response.status)) { this.dispose(); return; }
      if (!response.ok) throw new Error("Audio signalling unavailable.");
      const data: { peer: Signal | null; iceServers: RTCIceServer[] } = await response.json();
      if (this.controller.signal.aborted) return;
      const remote = data.peer;
      if (remote) {
        if (!this.waitingAt && this.status !== "connected") this.waitingAt = Date.now();
        if (this.slot === 0 && (remote.epoch !== this.remoteEpoch || !this.connection)) {
          this.remoteEpoch = remote.epoch;
          const pc = await this.create(data.iceServers);
          await this.description(pc, await pc.createOffer());
        } else if (this.slot === 1 && remote.description?.type === "offer" && remote.targetEpoch === this.epoch && (remote.epoch !== this.remoteEpoch || !this.connection)) {
          this.remoteEpoch = remote.epoch;
          const pc = await this.create(data.iceServers);
          await pc.setRemoteDescription(remote.description);
          // Reuse the offered audio transceiver. addTransceiver before applying
          // an offer creates an unassociated sender that cannot send in this answer.
          const transceiver = pc.getTransceivers().find(item => item.receiver.track.kind === "audio");
          if (!transceiver) throw new Error("Missing offered audio track.");
          transceiver.direction = "sendrecv";
          this.sender = transceiver.sender;
          await this.sender.replaceTrack(this.outgoing);
          await this.description(pc, await pc.createAnswer());
        } else if (this.slot === 0 && !this.answered && remote.targetEpoch === this.epoch && remote.description?.type === "answer") {
          await this.connection?.setRemoteDescription(remote.description); this.answered = true;
        }
        if (this.waitingAt && Date.now() - this.waitingAt > 25_000) this.fail("Direct audio is unavailable on this network. Switching to translation with context.");
        if (this.status === "disconnected" && Date.now() - this.disconnectedAt > 15_000) this.fail("Direct audio was disconnected. Switching to translation with context.");
      }
    } catch { if (!this.controller.signal.aborted) this.lastFailure = "Audio signalling temporarily unavailable"; }
    finally { if (!this.controller.signal.aborted) this.timer = setTimeout(() => void this.poll(), this.status === "connected" ? 3000 : 1000); }
  }
  private monitorAudio(stream: MediaStream) {
    clearInterval(this.monitor); void this.context?.close();
    if (typeof AudioContext === "undefined") return;
    const context = new AudioContext(); this.context = context;
    const analyser = context.createAnalyser(); analyser.fftSize = 512; this.analyser = analyser;
    // The analyser does not play sound. Playback always uses the media element.
    context.createMediaStreamSource(stream).connect(analyser);
    const values = new Float32Array(analyser.fftSize);
    this.monitor = setInterval(() => {
      analyser.getFloatTimeDomainData(values);
      const active = values.some(value => Math.abs(value) > 0.008);
      if (active) this.quietAt = Date.now();
      const audible = this.ready && !this.muted && this.incomingEnabled && Date.now() - this.quietAt < 400;
      if (audible !== this.audible) { this.audible = audible; this.changed(audible); }
    }, 100);
    if (this.ready) void context.resume();
  }
  private fail(message: string) {
    if (this.status === "unavailable") return;
    this.status = "unavailable"; this.lastFailure = message; this.failed(message);
  }
  dispose() {
    this.controller.abort(); clearTimeout(this.timer); clearInterval(this.monitor);
    this.audio.pause(); this.audio.srcObject = null; this.connection?.close(); void this.context?.close(); void this.outgoingContext?.close();
    if (this.source) URL.revokeObjectURL(this.source);
    this.changed(false);
  }
}
