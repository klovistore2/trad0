"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { VoiceConsent } from "./voice-consent";
import type { Participant } from "@/types/session";
import type { SpeechOptions } from "@/lib/audio/speech-options";

// Everything that is not the conversation itself lives here, so the call screen stays bare.
export function SettingsPanel({ id, me, speechSeconds, onConsent, onRefresh, onUseClone, onClose, speechOptions, onSpeechOptions }: {
  speechOptions: SpeechOptions;
  onSpeechOptions: (options: SpeechOptions) => void;
  id: string;
  me: Participant;
  speechSeconds: number;
  onConsent: () => void;
  onRefresh: () => void;
  onUseClone: (useClone: boolean) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [closing, setClosing] = useState(false);
  const [message, setMessage] = useState("");
  return <section className="settings">
    <h1>{"Settings"}</h1>
    <button className="primary-button" onClick={onClose}>{"Back to the conversation"}</button>

    <div className="settings-group">
      <h2>{"My voice"}</h2>
      <VoiceConsent sessionId={id} me={me} seconds={speechSeconds} onConsent={onConsent} onRefresh={onRefresh} onUseClone={onUseClone} />
      {me.hasAccount && <label className="setting-toggle">
        <input type="checkbox" checked={speechOptions.emotion} onChange={event => onSpeechOptions({ ...speechOptions, emotion: event.target.checked })} />
        <span>Match my tone of voice<em>No added delay: a few seconds of your speech are analysed now and then to estimate how you are speaking. Separate from your own voice.</em></span>
      </label>}
    </div>

    <div className="settings-group settings-danger">
      <h2>{"End"}</h2>
      <button className="demo-button" disabled={closing} onClick={async () => {
        setClosing(true); setMessage("");
        try {
          const response = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error);
          router.push("/");
        } catch (error) { setMessage(error instanceof Error ? error.message : "Réessayez."); setClosing(false); }
      }}>{"End the conversation"}</button>
      {message && <p role="alert">{message}</p>}
    </div>
  </section>;
}
