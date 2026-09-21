import { isToneResult, type SpeechOptions, type ToneResult } from "./speech-options";
export type ToneJob = { finish: (waitMs: number) => Promise<{ tone: ToneResult; extraWaitMs: number }>; cancel: () => void };
export function startToneAnalysis(sessionId: string, options: SpeechOptions, audio: Blob | null, signal: AbortSignal): ToneJob {
  const started = performance.now();
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) cancel();
  const fallback = (status: ToneResult["status"]): ToneResult => ({ tone: "unknown", strength: "low", status, model: options.toneModel, analysisMs: Math.round(performance.now() - started) });
  let settled: ToneResult | undefined;
  const task = (async () => {
    if (!options.emotion) return fallback("disabled");
    if (!audio || controller.signal.aborted) return fallback("no_audio");
    const form = new FormData(); form.set("sessionId", sessionId); form.set("model", options.toneModel); form.set("audio", audio, "tone.wav");
    const response = await fetch("/api/audio/tone", { method: "POST", body: form, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) });
    if (!response.ok) return fallback("unavailable");
    const data: unknown = await response.json();
    if (!isToneResult(data)) return fallback("unavailable");
    return { ...data, analysisMs: Math.round(performance.now() - started) };
  })().catch(() => fallback("unavailable")).then(result => { settled = result; return result; }).finally(() => signal.removeEventListener("abort", cancel));
  return { cancel, async finish(waitMs) {
    const waitStarted = performance.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tone = settled ?? await Promise.race([task, new Promise<ToneResult>(resolve => { timer = setTimeout(() => resolve(fallback("timeout")), waitMs); })]);
    clearTimeout(timer); cancel();
    return { tone, extraWaitMs: Math.round(performance.now() - waitStarted) };
  } };
}
