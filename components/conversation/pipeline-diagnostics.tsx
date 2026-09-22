"use client";
import { useEffect, useState, type ReactNode } from "react";
import type { ConversationMode } from "@/lib/translation/modes";
import type { PipelineTiming } from "@/lib/translation/conversation-pipeline";
import type { SharedSession } from "@/types/session";
import { DEFAULT_TONE_TUNING, TONE_MODEL, TTS_MODEL, type SpeechOptions, type SpeechMetadata, type ToneTuning } from "@/lib/audio/speech-options";
export type PipelineState = {
  active: ConversationMode; desired: ConversationMode; switching: boolean; directAudio: string;
  reason: string; contextTurns: number; timing: PipelineTiming | null;
  receivedTiming: { transport: number; request: number; playback: number };
  speechOptions: SpeechOptions; outgoingSpeech: SpeechMetadata | null; incomingSpeech: SpeechMetadata | null;
  synthesis: { model: string; stability: string; style: string; headersMs: number; playback: string } | null;
  audioLatency: { request: number; total: number } | null;
};
const toneLabel = (speech: SpeechMetadata | null | undefined) => speech ? `${speech.tone.status} · ${speech.tone.tone} · ${speech.tone.strength} · ${speech.tone.model}` : "—";
const label = (mode: string) => mode === "context" ? "2 · Transcript → LLM → ElevenLabs" : "1 · OpenAI live speech";
const STRENGTHS = ["low", "medium", "high"] as const;
// Temporary tuning desk: each slider changes this phone's outgoing tone from the next sentence on.
function ToneTuningPanel({ tuning, onTuning }: { tuning: ToneTuning; onTuning: (next: ToneTuning) => void }) {
  const slider = (label: string, value: number, min: number, max: number, step: number, shown: string, set: (value: number) => ToneTuning) =>
    <label className="tuning-row">
      <span>{label}<b>{shown}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={event => onTuning(set(Number(event.target.value)))} />
    </label>;
  return <fieldset className="tone-tuning">
    <legend>Tone tuning · my outgoing speech</legend>
    {slider("Tagged sentence stability", tuning.stability, 0, 1, 0.05, tuning.stability.toFixed(2), stability => ({ ...tuning, stability }))}
    {slider("Style exaggeration", tuning.style, 0, 1, 0.05, tuning.style.toFixed(2), style => ({ ...tuning, style }))}
    {slider("Minimum strength for a tag", STRENGTHS.indexOf(tuning.minStrength), 0, 2, 1, tuning.minStrength, index => ({ ...tuning, minStrength: STRENGTHS[index] }))}
    {slider("Agreeing analyses before a change", tuning.confirmations, 1, 3, 1, String(tuning.confirmations), confirmations => ({ ...tuning, confirmations }))}
    {slider("Analysis window", tuning.windowSeconds, 2, 6, 1, `${tuning.windowSeconds} s`, windowSeconds => ({ ...tuning, windowSeconds }))}
    {slider("Tone held for", tuning.holdSeconds, 5, 30, 5, `${tuning.holdSeconds} s`, holdSeconds => ({ ...tuning, holdSeconds }))}
    <button type="button" className="demo-button" onClick={() => onTuning(DEFAULT_TONE_TUNING)}>Reset to validated defaults</button>
  </fieldset>;
}
export function PipelineDiagnostics({ room, read, tuning, onTuning, children }: { room: SharedSession; read: () => PipelineState; tuning?: ToneTuning; onTuning?: (next: ToneTuning) => void; children?: ReactNode }) {
  const [state, setState] = useState<PipelineState | null>(null);
  useEffect(() => { const update = () => setState(read()); update(); const timer = setInterval(update, 500); return () => clearInterval(timer); }, [read]);
  return <details className="pipeline-diagnostics">
    <summary>DEV · {label(state?.active ?? room.me.activeMode)}
      {state?.speechOptions.emotion && ` · tone ${state.outgoingSpeech?.tone.status === "estimated" ? `${state.outgoingSpeech.tone.tone} (${state.outgoingSpeech.tone.strength})` : state.outgoingSpeech?.tone.status ?? "waiting"}`}</summary>
    <dl>
      <dt>My outgoing speech</dt><dd>{label(state?.active ?? room.me.activeMode)}</dd>
      <dt>Their outgoing speech</dt><dd>{label(room.peer?.activeMode ?? "direct")}</dd>
      <dt>Transition</dt><dd>{state?.switching ? "Connecting…" : state && state.active !== state.desired ? `Next sentence → ${label(state.desired)}` : "None"}</dd>
      <dt>Transcription</dt><dd>{room.models?.transcription}</dd>
      <dt>Translation</dt><dd>{state?.active === "context" ? room.models?.translation : room.models?.realtime}</dd>
      <dt>My output voice</dt><dd>{state?.active === "direct" ? "OpenAI" : room.me.useClone && room.me.voiceTier > 0 ? "ElevenLabs · clone" : `ElevenLabs · standard ${room.me.voiceRange ?? "neutral"}`}</dd>
      <dt>My speaking model</dt><dd>{TTS_MODEL}</dd>
      <dt>My tone analysis</dt><dd>{toneLabel(state?.outgoingSpeech)}</dd>
      <dt>My tone sampling</dt><dd>{tuning ? `${TONE_MODEL} · every ${tuning.windowSeconds} s of speech · held ${tuning.holdSeconds} s · ${tuning.confirmations} to change` : TONE_MODEL}</dd>
      <dt>My last tone request</dt><dd>{state?.outgoingSpeech?.tone.status === "estimated" ? `${state.outgoingSpeech.tone.analysisMs} ms` : "—"}</dd>
      <dt>Incoming tone</dt><dd>{toneLabel(state?.incomingSpeech)}</dd>
      <dt>Incoming actual ElevenLabs model</dt><dd>{state?.synthesis?.model || "—"}</dd>
      <dt>Incoming playback</dt><dd>{state?.synthesis?.playback || "—"}</dd>
      <dt>Incoming stability / style</dt><dd>{state?.synthesis?.stability && !["default", "unknown"].includes(state.synthesis.stability) ? `${state.synthesis.stability} / ${state.synthesis.style} · tone tag` : state?.synthesis?.stability || "—"}</dd>
      <dt>ElevenLabs response headers (server)</dt><dd>{state?.synthesis?.headersMs ?? "—"} ms</dd>
      <dt>Incoming speech request → playback started</dt><dd>{state?.audioLatency?.total || "—"} ms</dd>
      <dt>My clone</dt><dd>{room.me.hasAccount ? room.me.consented ? `${room.me.voiceStatus} · tier ${room.me.voiceTier}` : "Awaiting consent" : "Account required"}</dd>
      <dt>Original turns in memory</dt><dd>{state?.contextTurns ?? 0}</dd>
      <dt>Context used / last outgoing sentence</dt><dd>{state?.timing?.contextTurns ?? "—"}</dd>
      <dt>Sentence wait / LLM / publish</dt><dd>{state?.timing ? `${state.timing.waitMs} / ${state.timing.translationMs} / ${state.timing.publishMs} ms` : "—"}</dd>
      <dt>Incoming transport / speech request / audio start</dt><dd>{state ? `${state.receivedTiming.transport} / ${state.receivedTiming.request} / ${state.receivedTiming.playback} ms` : "—"}</dd>
      <dt>Direct audio connection</dt><dd>{state?.directAudio}</dd>
      <dt>Fallback / failure</dt><dd>{state?.reason || "None"}</dd>
    </dl>
    {tuning && onTuning && <ToneTuningPanel tuning={tuning} onTuning={onTuning} />}
    <p>Tone is sampled from recent speech and never delays a sentence; without a recent estimate it is neutral. Response headers are not the first audible sound. Outgoing and incoming timings describe different sentences; do not add them together. Tone is experimental; strength is not a calibrated confidence score.</p>
    {children}
  </details>;
}
