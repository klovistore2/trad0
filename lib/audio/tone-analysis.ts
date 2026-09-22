import { isToneResult, TONE_HOLD_MS, TONE_MODEL, type SpeechOptions, type ToneResult } from "./speech-options";
const neutral = (status: ToneResult["status"]): ToneResult => ({ tone: "neutral", strength: "low", status, model: TONE_MODEL, analysisMs: 0 });
// Holds the speaker's current tone. Windows arrive every few seconds of speech; one request at
// a time, since the next window follows soon. Sentences read the latest result, never wait.
export class ToneTracker {
  private latest?: { tone: ToneResult; at: number };
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
      this.latest = { tone: { ...data, analysisMs: Math.round(performance.now() - started) }, at: Date.now() };
      this.failure = undefined;
    })().catch(() => { if (!controller.signal.aborted) this.failure = "unavailable"; })
      .finally(() => { if (this.request === controller) this.request = undefined; });
  }
  current(options: SpeechOptions, now = Date.now()): ToneResult {
    if (!options.emotion) return neutral("disabled");
    if (!this.latest || now - this.latest.at > TONE_HOLD_MS) return neutral(this.failure ?? "no_audio");
    return this.latest.tone;
  }
  reset() { this.request?.abort(); this.request = undefined; this.latest = undefined; this.failure = undefined; }
}
