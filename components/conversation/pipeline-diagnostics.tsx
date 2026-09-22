"use client";
import { useEffect, useState, type ReactNode } from "react";
import type { ConversationMode } from "@/lib/translation/modes";
import type { PipelineTiming } from "@/lib/translation/conversation-pipeline";
import type { SharedSession } from "@/types/session";
import { TONE_HOLD_MS, TONE_MODEL, TONE_WINDOW_SECONDS, TTS_MODEL, type SpeechOptions, type SpeechMetadata } from "@/lib/audio/speech-options";
export type PipelineState = {
  active: ConversationMode; desired: ConversationMode; switching: boolean; directAudio: string;
  reason: string; contextTurns: number; timing: PipelineTiming | null;
  receivedTiming: { transport: number; request: number; playback: number };
  speechOptions: SpeechOptions; outgoingSpeech: SpeechMetadata | null; incomingSpeech: SpeechMetadata | null;
  synthesis: { model: string; stability: string; headersMs: number; playback: string } | null;
  audioLatency: { request: number; total: number } | null;
};
const toneLabel = (speech: SpeechMetadata | null | undefined) => speech ? `${speech.tone.status} · ${speech.tone.tone} · ${speech.tone.strength} · ${speech.tone.model}` : "—";
const label = (mode: string) => mode === "context" ? "2 · Transcript → LLM → ElevenLabs" : "1 · OpenAI live speech";
export function PipelineDiagnostics({ room, read, children }: { room: SharedSession; read: () => PipelineState; children?: ReactNode }) {
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
      <dt>My tone sampling</dt><dd>{`${TONE_MODEL} · every ${TONE_WINDOW_SECONDS} s of speech · held ${TONE_HOLD_MS / 1000} s`}</dd>
      <dt>My last tone request</dt><dd>{state?.outgoingSpeech?.tone.status === "estimated" ? `${state.outgoingSpeech.tone.analysisMs} ms` : "—"}</dd>
      <dt>Incoming tone</dt><dd>{toneLabel(state?.incomingSpeech)}</dd>
      <dt>Incoming actual ElevenLabs model</dt><dd>{state?.synthesis?.model || "—"}</dd>
      <dt>Incoming playback</dt><dd>{state?.synthesis?.playback || "—"}</dd>
      <dt>Incoming stability</dt><dd>{state?.synthesis?.stability === "0" ? "0 · creative (tone tag)" : state?.synthesis?.stability || "—"}</dd>
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
    <p>Tone is sampled from recent speech and never delays a sentence; without a recent estimate it is neutral. Response headers are not the first audible sound. Outgoing and incoming timings describe different sentences; do not add them together. Tone is experimental; strength is not a calibrated confidence score.</p>
    {children}
  </details>;
}
