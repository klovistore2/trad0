import { isToneResult, TONE_HOLD_MS, TONE_MODEL, type SpeechOptions, type ToneResult } from "./speech-options";
const neutral = (status: ToneResult["status"]): ToneResult => ({ tone: "neutral", strength: "low", status, model: TONE_MODEL, analysisMs: 0 });
// Holds the speaker's current tone. Windows arrive every few seconds of speech; one request at
// a time, since the next window follows soon. Sentences read the latest result, never wait.
export class ToneTracker {
  private latest?: { tone: ToneResult; at: number };
  // How many analyses in a row must agree before the tone changes, and how long it holds.
  private confirmations = 1;
  private holdMs = TONE_HOLD_MS;
  private candidate?: { tone: ToneResult["tone"]; count: number };
  private failure?: ToneResult["status"];
  private request?: AbortController;
  constructor(private sessionId: string) {}
  sample(audio: Blob) {
    if (this.request) return;
    const controller = new AbortController(); this.request = controller;
    const started = performance.now();
    void (async () => {
      const form = new FormData(); form.set("sessionId", this.sessionId); form.set("model", TONE_MODEL); form.set("audio", audio, "tone.wav");
      const response = await fetch("/api/audio/tone", { method: "POST", body: form, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
      const data: unknown = response.ok ? await response.json() : null;
      if (controller.signal.aborted) return;
      if (!isToneResult(data) || data.status !== "estimated") { this.failure = "unavailable"; return; }
      this.failure = undefined;
      this.consider({ ...data, analysisMs: Math.round(performance.now() - started) }, Date.now());
    })().catch(() => { if (!controller.signal.aborted) this.failure = "unavailable"; })
      .finally(() => { if (this.request === controller) this.request = undefined; });
  }
  tune(confirmations: number, holdSeconds: number) { this.confirmations = confirmations; this.holdMs = holdSeconds * 1000; }
  consider(estimate: ToneResult, now: number) {
    const current = this.latest && now - this.latest.at <= this.holdMs ? this.latest.tone.tone : undefined;
    const count = estimate.tone === current ? this.confirmations : this.candidate?.tone === estimate.tone ? this.candidate.count + 1 : 1;
    if (count >= this.confirmations) { this.latest = { tone: estimate, at: now }; this.candidate = undefined; }
    else this.candidate = { tone: estimate.tone, count };
  }
  current(options: SpeechOptions, now = Date.now()): ToneResult {
    if (!options.emotion) return neutral("disabled");
    if (!this.latest || now - this.latest.at > this.holdMs) return neutral(this.failure ?? "no_audio");
    return this.latest.tone;
  }
  reset() { this.request?.abort(); this.request = undefined; this.latest = undefined; this.candidate = undefined; this.failure = undefined; }
}
