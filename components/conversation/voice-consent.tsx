"use client";
import { useEffect, useRef, useState } from "react";
import { VOICE_CONSENT } from "@/lib/voice/consent";
import type { Participant } from "@/types/session";

type State = "idle" | "permission" | "recording" | "uploading" | "ready" | "error";
export function VoiceConsent({ sessionId, voiceStatus, english, onRecord, onBusy }: { sessionId: string; voiceStatus: Participant["voiceStatus"]; english: boolean; onRecord: () => void; onBusy: (busy: boolean) => void }) {
  const [state, setState] = useState<State>("idle"); const [message, setMessage] = useState(""); const [seconds, setSeconds] = useState(0);
  const capture = useRef<{ recorder: MediaRecorder; stream: MediaStream } | null>(null);
  const operation = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const busy = useRef(false);
  function cancel() {
    operation.current?.abort(); operation.current = null; clearInterval(timer.current);
    const current = capture.current; capture.current = null;
    if (current?.recorder.state === "recording") current.recorder.stop();
    current?.stream.getTracks().forEach(track => track.stop()); busy.current = false;
  }
  useEffect(() => { onBusy(["permission", "recording", "uploading"].includes(state)); }, [state, onBusy]);
  useEffect(() => {
    const hide = () => { if (document.hidden) { cancel(); setState("idle"); } };
    document.addEventListener("visibilitychange", hide);
    return () => { document.removeEventListener("visibilitychange", hide); cancel(); };
  }, []);
  async function record() {
    if (busy.current) return;
    busy.current = true; onRecord(); setMessage(""); setSeconds(0); setState("permission");
    const controller = new AbortController(); operation.current = controller;
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error(english ? "Voice recording requires HTTPS and a supported browser." : "L’enregistrement nécessite HTTPS et un navigateur compatible.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (controller.signal.aborted) { stream.getTracks().forEach(track => track.stop()); return; }
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 64000 });
      capture.current = { recorder, stream };
      const chunks: Blob[] = []; const started = Date.now();
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = async () => {
        clearInterval(timer.current); stream.getTracks().forEach(track => track.stop()); capture.current = null;
        if (controller.signal.aborted) return;
        const duration = Math.min(65, (Date.now() - started) / 1000);
        setState("uploading");
        try {
          const blob = new Blob(chunks, { type: recorder.mimeType });
          const form = new FormData(); form.set("sessionId", sessionId); form.set("consent", VOICE_CONSENT); form.set("seconds", String(duration));
          form.set("sample", blob, recorder.mimeType.includes("mp4") ? "voice.m4a" : recorder.mimeType.includes("ogg") ? "voice.ogg" : "voice.webm");
          const response = await fetch("/api/voice/clone", { method: "POST", body: form, signal: controller.signal });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error);
          setState("ready"); setMessage(data.status === "verification_required" ? (english ? "ElevenLabs requires verification. The standard voice remains active." : "ElevenLabs demande une vérification. La voix standard reste active.") : (english ? "Your voice is ready for this session." : "Votre voix est prête pour cette session."));
        } catch (error) { if (!controller.signal.aborted) { setState("error"); setMessage(error instanceof Error ? error.message : "Voice unavailable."); } }
        finally { chunks.length = 0; busy.current = false; }
      };
      recorder.onerror = () => { cancel(); setState("error"); setMessage(english ? "Recording failed. Try again." : "Enregistrement interrompu. Réessayez."); };
      recorder.start(1000); setState("recording");
      timer.current = setInterval(() => { const elapsed = Math.floor((Date.now() - started) / 1000); setSeconds(elapsed); if (elapsed >= 60 && recorder.state === "recording") recorder.stop(); }, 250);
    } catch (error) {
      cancel(); setState("error"); setMessage(error instanceof Error ? error.message : "Microphone unavailable.");
    }
  }
  const active = ["permission", "recording", "uploading"].includes(state);
  return <details className="voice-consent"><summary>{voiceStatus === "ready" ? (english ? "✓ Your voice is active" : "✓ Votre voix est active") : (english ? "Use my voice" : "Utiliser ma voix")}</summary>
    <p>{english ? "Record your own voice, alone in a quiet place, for 30–60 seconds. With your permission, the sample is sent to ElevenLabs to clone your voice for this conversation." : "Enregistrez votre propre voix, seul au calme, pendant 30 à 60 secondes. Avec votre accord, cet extrait est envoyé à ElevenLabs pour cloner votre voix dans cette conversation."}</p>
    <p>{english ? "End the session to delete the voice clone. Expired sessions are handled by the server cleanup task. No permanent profile is saved." : "Terminez la session pour supprimer le clone. Les sessions expirées sont traitées par la tâche de purge du serveur. Aucun profil permanent n’est créé."}</p>
    {voiceStatus === "ready" || voiceStatus === "verification_required" ? <button className="demo-button" disabled={active} onClick={async () => {
      setState("uploading");
      try { const response = await fetch("/api/voice", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setState("idle"); setMessage(english ? "Voice deleted." : "Voix supprimée."); }
      catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Try again."); }
    }}>{english ? "Delete my voice" : "Supprimer ma voix"}</button>
    : active ? <><p role="status">{state === "permission" ? (english ? "Allow the microphone…" : "Autorisez le micro…") : state === "recording" ? `${seconds} / 60 s` : (english ? "Creating your voice…" : "Création de votre voix…")}</p>
      {state === "recording" && seconds >= 30 && <button className="demo-button" onClick={() => capture.current?.recorder.stop()}>{english ? "Finish & create my voice" : "Terminer et créer ma voix"}</button>}
      {state !== "uploading" && <button className="demo-button" onClick={() => { cancel(); setState("idle"); }}>{english ? "Cancel" : "Annuler"}</button>}
    </> : <button className="demo-button" onClick={() => void record()}>{english ? "I agree · record my voice for this session" : "J’accepte · enregistrer ma voix pour cette session"}</button>}
    {message && <p role="status">{message}</p>}
  </details>;
}
