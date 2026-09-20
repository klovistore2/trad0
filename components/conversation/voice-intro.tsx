"use client";
import { useEffect, useRef, useSyncExternalStore } from "react";

const storageKey = "a-deux-voice-consent";
type Decision = "accepted" | "declined";
// "unknown" is the server and hydration snapshot: nothing is rendered until the browser answers.
type Snapshot = Decision | null | "unknown";

let cached: Snapshot = "unknown";
const listeners = new Set<() => void>();

function read(): Decision | null {
  try {
    const value = localStorage.getItem(storageKey);
    return value === "accepted" || value === "declined" ? value : null;
  } catch { return null; }
}
function publish(next: Snapshot) {
  cached = next;
  listeners.forEach(listener => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const sync = () => publish(read());
  window.addEventListener("storage", sync);
  return () => { listeners.delete(listener); window.removeEventListener("storage", sync); };
}
function snapshot(): Snapshot {
  if (cached === "unknown") cached = read();
  return cached;
}
// Settings and the dialog write the same memory, so changing your mind in one is honoured by
// the other. Withdrawing records a refusal rather than forgetting, or the dialog would reopen.
export function rememberVoiceDecision(value: Decision) {
  // The choice still applies to this session if storage is unavailable.
  try { localStorage.setItem(storageKey, value); } catch { /* private mode */ }
  publish(value);
}

// Asked once, on the first conversation, then remembered: later conversations never ask again.
export function VoiceIntro({ consented, english, onAccept }: {
  consented: boolean;
  english: boolean;
  onAccept: () => void;
}) {
  const decision = useSyncExternalStore(subscribe, snapshot, () => "unknown" as Snapshot);
  const applied = useRef(false);
  useEffect(() => {
    if (decision !== "accepted" || consented || applied.current) return;
    applied.current = true;
    onAccept();
  }, [decision, consented, onAccept]);
  if (consented || decision !== null) return null;
  const choose = (value: Decision) => {
    rememberVoiceDecision(value);
    if (value === "accepted") onAccept();
  };
  return <div className="modal-backdrop">
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="voice-intro-title">
      <h2 id="voice-intro-title">{english ? "Speak with your own voice" : "Parler avec votre voix"}</h2>
      <p>{english
        ? "The other person can hear your translated words in your own voice instead of a standard one. Your voice is learned from this conversation and sent to ElevenLabs to create it."
        : "L’autre personne peut entendre vos mots traduits avec votre voix plutôt qu’une voix standard. Votre voix est apprise à partir de cette conversation, puis transmise à ElevenLabs pour la créer."}</p>
      <p>{english
        ? "Only your own turns are captured, never the other person. The recording stays in this browser and the clone is deleted when the session ends. You can change this in settings at any time."
        : "Seuls vos tours de parole sont captés, jamais ceux de l’autre personne. L’enregistrement reste dans ce navigateur et le clone est supprimé à la fin de la session. Vous pouvez revenir sur ce choix à tout moment dans les paramètres."}</p>
      <button className="primary-button" onClick={() => choose("accepted")}>{english ? "Use my voice" : "Utiliser ma voix"}</button>
      <button className="demo-button" onClick={() => choose("declined")}>{english ? "Not now — keep a standard voice" : "Pas maintenant — garder une voix standard"}</button>
    </div>
  </div>;
}
