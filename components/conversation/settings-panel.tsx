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
import { PipelineDiagnostics, type PipelineState } from "./pipeline-diagnostics";
import type { SharedSession } from "@/types/session";

// Everything that is not the conversation itself lives here, so the call screen stays bare.
export function SettingsPanel({ id, me, peer, speechSeconds, onMode, onConsent, onRefresh, onUseClone, readAudioState, onTestTone, voiceStatus, received, onClose, speechOptions, onSpeechOptions, room, readPipelineState }: {
  speechOptions: SpeechOptions;
  onSpeechOptions: (options: SpeechOptions) => void;
  room: SharedSession;
  readPipelineState: () => PipelineState;
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
    <div className="settings-group speech-experiments">
      <h2>Speech experiments · mode 2</h2>
      <p>These settings control the voice the other person hears when you speak. Saved on this device; applied to new sentences.</p>
      <label htmlFor="speech-model">ElevenLabs model</label>
      <select id="speech-model" className="language-picker" value={speechOptions.ttsModel} onChange={event => onSpeechOptions({ ...speechOptions, ttsModel: event.target.value as SpeechOptions["ttsModel"] })}>
        <option value="auto">Automatic · v3 for Thai or emotion</option>
        <option value="eleven_flash_v2_5">Flash v2.5 · fastest</option>
        <option value="eleven_v3_conversational">v3 Conversational · expressive, realtime</option>
        <option value="eleven_v3">v3 · expressive</option>
      </select>
      {(peer.language === "th" || speechOptions.emotion) && <p>Thai and emotion tags require v3. Flash will be replaced by v3 Conversational for those sentences.</p>}
      <label className="tone-toggle"><input type="checkbox" checked={speechOptions.emotion} onChange={event => onSpeechOptions({ ...speechOptions, emotion: event.target.checked })} /> Estimate my vocal tone</label>
      <p>When enabled in mode 2, short microphone excerpts are sent to OpenAI to estimate vocal delivery, separately from cloning. The app keeps audio only in memory. Ambiguous or late results use no emotion tag.</p>
      {speechOptions.emotion && <>
        <label htmlFor="tone-model">Audio analysis model</label>
        <select id="tone-model" className="language-picker" value={speechOptions.toneModel} onChange={event => onSpeechOptions({ ...speechOptions, toneModel: event.target.value as SpeechOptions["toneModel"] })}>
          <option value="gpt-audio-mini">OpenAI · GPT Audio Mini</option>
          <option value="gpt-audio">OpenAI · GPT Audio</option>
        </select>
        <label htmlFor="tone-wait">Maximum extra wait after translation</label>
        <select id="tone-wait" className="language-picker" value={speechOptions.toneWaitMs} onChange={event => onSpeechOptions({ ...speechOptions, toneWaitMs: Number(event.target.value) })}>
          <option value={0}>0 ms · only use results already ready</option>
          <option value={250}>250 ms</option>
          <option value={1000}>1 second · compare tone more often</option>
        </select>
      </>}
      {me.activeMode !== "context" && <p>These options apply in mode 2. Select “Mode 2” above to compare them.</p>}
      <PipelineDiagnostics room={room} read={readPipelineState} />
    </div>
    <div className="settings-group">
      <h2>{"My voice"}</h2>
      <VoiceConsent sessionId={id} me={me} seconds={speechSeconds} onConsent={onConsent} onRefresh={onRefresh} onUseClone={onUseClone} />
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
