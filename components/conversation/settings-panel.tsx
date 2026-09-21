"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { VoiceConsent } from "./voice-consent";
import { ShareSession } from "./share-session";
import { AudioDiagnostics, type AudioState } from "./audio-diagnostics";
import type { Participant } from "@/types/session";
import type { VoiceStatus } from "@/types/voice";

// Everything that is not the conversation itself lives here, so the call screen stays bare.
export function SettingsPanel({ id, english, me, peer, speechSeconds, onConsent, onRefresh, onUseClone, readAudioState, onTestTone, voiceStatus, received, onClose }: {
  id: string;
  english: boolean;
  me: Participant;
  peer: Participant;
  speechSeconds: number;
  onConsent: () => void;
  onRefresh: () => void;
  onUseClone: (useClone: boolean) => void;
  readAudioState: () => AudioState;
  onTestTone: () => void;
  voiceStatus: VoiceStatus;
  received: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [closing, setClosing] = useState(false);
  const [message, setMessage] = useState("");
  return <section className="settings">
    <h1>{english ? "Settings" : "Paramètres"}</h1>
    <button className="primary-button" onClick={onClose}>{english ? "Back to the conversation" : "Retour à la conversation"}</button>

    <div className="settings-group">
      <h2>{english ? "My voice" : "Ma voix"}</h2>
      <VoiceConsent sessionId={id} me={me} seconds={speechSeconds} english={english} onConsent={onConsent} onRefresh={onRefresh} onUseClone={onUseClone} />
    </div>

    <div className="settings-group">
      <h2>{english ? "Invite" : "Inviter"}</h2>
      <ShareSession id={id} />
    </div>

    <div className="settings-group">
      <h2>{english ? "Developer" : "Développement"}</h2>
      <AudioDiagnostics read={readAudioState} onTestTone={onTestTone} voiceStatus={voiceStatus} received={received} english={english} me={me} peer={peer} />
    </div>

    <div className="settings-group settings-danger">
      <h2>{english ? "End" : "Terminer"}</h2>
      <p>{english ? "Closes the conversation for both of you and deletes both voice clones." : "Ferme la conversation pour vous deux et supprime les deux clones de voix."}</p>
      <button className="demo-button" disabled={closing} onClick={async () => {
        setClosing(true); setMessage("");
        try {
          const response = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error);
          router.push("/");
        } catch (error) { setMessage(error instanceof Error ? error.message : "Réessayez."); setClosing(false); }
      }}>{english ? "End session & delete voices" : "Terminer la session et supprimer les voix"}</button>
      {message && <p role="alert">{message}</p>}
    </div>
  </section>;
}
