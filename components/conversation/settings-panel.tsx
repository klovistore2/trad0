"use client";
import type { ModePreference } from "@/lib/translation/modes";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { VoiceConsent } from "./voice-consent";
import { ShareSession } from "./share-session";
import { AudioDiagnostics, type AudioState } from "./audio-diagnostics";
import type { Participant } from "@/types/session";
import type { VoiceStatus } from "@/types/voice";
import type { SpeechOptions } from "@/lib/audio/speech-options";

// Everything that is not the conversation itself lives here, so the call screen stays bare.
export function SettingsPanel({ id, me, peer, speechSeconds, onMode, onConsent, onRefresh, onUseClone, readAudioState, onTestTone, voiceStatus, received, onClose, speechOptions, onSpeechOptions }: {
  speechOptions: SpeechOptions;
  onSpeechOptions: (options: SpeechOptions) => void;
  id: string;
  me: Participant;
  peer: Participant;
  speechSeconds: number;
  onMode: (mode: ModePreference) => void;
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
    <h1>{"Settings"}</h1>
    <button className="primary-button" onClick={onClose}>{"Back to the conversation"}</button>

    <div className="settings-group">
      <h2>Translation</h2>
      <label htmlFor="translation-mode">My outgoing speech</label>
      <select id="translation-mode" className="language-picker" value={me.preferredMode} onChange={event => onMode(event.target.value as ModePreference)}>
        <option value="auto">Automatic · use context when my clone is ready</option>
        <option value="direct">Mode 1 · OpenAI live speech</option>
        <option value="context">Mode 2 · translation with context + ElevenLabs</option>
      </select>
      <p>Changes apply between sentences. Mode 2 works with a standard voice, without an account or voice cloning.</p>
    </div>
    <div className="settings-group">
      <h2>{"My voice"}</h2>
      <VoiceConsent sessionId={id} me={me} seconds={speechSeconds} onConsent={onConsent} onRefresh={onRefresh} onUseClone={onUseClone} />
      <label className="setting-toggle">
        <input type="checkbox" checked={speechOptions.emotion} onChange={event => onSpeechOptions({ ...speechOptions, emotion: event.target.checked })} />
        <span>Match my tone of voice<em>Slightly slower: a short excerpt of your speech is sent to OpenAI to estimate how you said it. Separate from voice cloning, and available without an account.</em></span>
      </label>
    </div>

    <div className="settings-group">
      <h2>{"Invite"}</h2>
      <ShareSession id={id} />
    </div>

    <div className="settings-group">
      <h2>{"Developer"}</h2>
      <AudioDiagnostics read={readAudioState} onTestTone={onTestTone} voiceStatus={voiceStatus} received={received} me={me} peer={peer} />
    </div>

    <div className="settings-group settings-danger">
      <h2>{"End"}</h2>
      <p>{"Closes the conversation and clears its temporary data. Voices saved to accounts are kept."}</p>
      <button className="demo-button" disabled={closing} onClick={async () => {
        setClosing(true); setMessage("");
        try {
          const response = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error);
          router.push("/");
        } catch (error) { setMessage(error instanceof Error ? error.message : "Réessayez."); setClosing(false); }
      }}>{"End session & delete voices"}</button>
      {message && <p role="alert">{message}</p>}
    </div>
  </section>;
}
