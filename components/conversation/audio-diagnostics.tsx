"use client";
import { useEffect, useState } from "react";
import { FINAL_TIER, VOICE_TIERS } from "@/lib/voice/consent";
import type { Participant } from "@/types/session";
import type { VoiceStatus } from "@/types/voice";

export type AudioState = {
  context: string; stopped: string; failure: string; voice: string;
  range: { frames: number; median: number; range: string | null };
  timing: { transport: number; request: number; playback: number };
  speech: number;
  queued: number; speaking: boolean; running: boolean; sound: boolean;
};

const cloneLabels: Record<Participant["voiceStatus"], string> = {
  none: "aucun clone · voix standard",
  learning: "clonage en cours…",
  ready: "clone actif",
  verification_required: "vérification ElevenLabs requise",
};

// Development panel: shows where cloning stands and which voice is actually speaking.
export function AudioDiagnostics({ read, onTestTone, voiceStatus, received, me, peer }: {
  read: () => AudioState;
  onTestTone: () => void;
  voiceStatus: VoiceStatus;
  received: number;
  me: Participant;
  peer: Participant;
}) {
  const [state, setState] = useState<AudioState | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const update = () => setState(read());
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [open, read]);
  const yes = "yes";
  const no = "no";
  const detected = state?.range;
  const rangeLabel = detected?.range
    ? `${detected.range === "low" ? "grave" : "aigu"} · ${detected.median} Hz`
    : detected?.frames
      ? `analyse… ${detected.frames} trames${detected.median ? ` · ${detected.median} Hz` : ""}`
      : "en attente de parole";
  const nextTier = VOICE_TIERS.find(step => step.tier > me.voiceTier);
  const row = (label: string, value: string | number) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>;
  return <details className="audio-diagnostics" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{"Voice & sound diagnostics"}</summary>
    <button className="demo-button" onClick={onTestTone}>{"Play a test beep"}</button>
    <dl>
      {row("Voix entendue ici", state?.voice ?? "—")}
      {row("Latence transport", state?.timing.transport ? `${state.timing.transport} ms` : "—")}
      {row("Latence voix", state?.timing.playback ? `${state.timing.request} ms jusqu’au serveur · ${state.timing.playback} ms jusqu’au son` : "—")}
      {row("Latence totale", state?.timing.playback ? `${state.timing.transport + state.timing.playback} ms` : "—")}
      {row("Mon clone", `${cloneLabels[me.voiceStatus]} · palier ${me.voiceTier}/${FINAL_TIER}`)}
      {row("Consentement donné", me.consented ? "oui" : "non")}
      {row("Parole cumulée", me.consented
        ? `${state?.speech ?? 0} s${nextTier ? ` · prochain palier à ${nextTier.seconds} s` : " · palier final atteint"}`
        : "capture inactive")}
      {row("Mon registre détecté", rangeLabel)}
      {row("Clone de l’autre", `${cloneLabels[peer.voiceStatus]} · palier ${peer.voiceTier}/${FINAL_TIER}`)}
      {row("Registre de l’autre", peer.voiceRange === "low" ? "grave" : peer.voiceRange === "high" ? "aigu" : "non détecté")}
      {row("Contexte audio", state?.context ?? "—")}
      {row("Lecture", voiceStatus)}
      {row("Phrases reçues", received)}
      {row("En attente de lecture", state?.queued ?? "—")}
      {row("Session active", state ? (state.running ? yes : no) : "—")}
      {row("Dernier changement", state?.stopped ?? "—")}
      {row("Dernier échec audio", state?.failure ?? "—")}
    </dl>
    <p>{"« Voix entendue ici » reports what the other participant's words were spoken with: clone, or a standard voice matched to their detected range."}</p>
  </details>;
}
