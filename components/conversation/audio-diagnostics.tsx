"use client";
import { useEffect, useState } from "react";
import type { VoiceStatus } from "@/types/voice";

type AudioState = { context: string; queued: number; speaking: boolean; running: boolean; sound: boolean };

// Development aid: tells apart an OS-level mute, a suspended context and a pipeline that never fired.
export function AudioDiagnostics({ read, onTestTone, voiceStatus, received, english }: {
  read: () => AudioState;
  onTestTone: () => void;
  voiceStatus: VoiceStatus;
  received: number;
  english: boolean;
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
  const yes = english ? "yes" : "oui";
  const no = english ? "no" : "non";
  return <details className="audio-diagnostics" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{english ? "Sound diagnostics" : "Diagnostic du son"}</summary>
    <button className="demo-button" onClick={onTestTone}>{english ? "Play a test beep" : "Jouer un bip de test"}</button>
    <dl>
      <div><dt>{english ? "Audio context" : "Contexte audio"}</dt><dd>{state?.context ?? "—"}</dd></div>
      <div><dt>{english ? "Playback" : "Lecture"}</dt><dd>{voiceStatus}</dd></div>
      <div><dt>{english ? "Sentences received" : "Phrases reçues"}</dt><dd>{received}</dd></div>
      <div><dt>{english ? "Waiting to play" : "En attente de lecture"}</dt><dd>{state?.queued ?? "—"}</dd></div>
      <div><dt>{english ? "Session active" : "Session active"}</dt><dd>{state ? (state.running ? yes : no) : "—"}</dd></div>
      <div><dt>{english ? "Sound on" : "Son activé"}</dt><dd>{state ? (state.sound ? yes : no) : "—"}</dd></div>
    </dl>
    <p>{english
      ? "If the beep is silent while the context is running, the phone itself is muting playback — check the ring/silent switch and the volume during playback."
      : "Si le bip est inaudible alors que le contexte est « running », c’est le téléphone qui coupe la lecture : vérifier l’interrupteur silencieux et le volume pendant la lecture."}</p>
  </details>;
}
