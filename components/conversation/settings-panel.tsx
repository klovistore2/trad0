"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { VoiceConsent } from "./voice-consent";
import type { Participant } from "@/types/session";
import type { SpeechOptions } from "@/lib/audio/speech-options";
import { AddCredits } from "@/components/account/add-credits";
import { creditEstimate } from "@/lib/billing/prices";
import { FINAL_TIER } from "@/lib/voice/consent";

// Everything that is not the conversation itself lives here, so the call screen stays bare.
export function SettingsPanel({ id, me, credits, toneWindowSeconds, speechSeconds, onConsent, onRefresh, onUseClone, onClose, speechOptions, onSpeechOptions }: {
  credits?: { sessionUsed: number; balance: number } | null;
  toneWindowSeconds: number;
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
  // Only the payer's own options are known here: tone if ticked, and the clones still to come.
  const tone = speechOptions.emotion && me.hasAccount;
  const estimate = credits && creditEstimate({ balance: credits.balance, tone, toneWindowSeconds,
    clonesToCome: me.hasAccount && me.consented ? Math.max(0, FINAL_TIER - me.voiceTier) : 0 });
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

    {credits && <div className="settings-group">
      <h2>{"Credits"}</h2>
      <p className="credit-line">{"Credits left"}<b>{credits.balance}</b></p>
      {estimate && <p className="credit-line">{"Conversation time left"}<b>{`≈ ${estimate.minutes} min`}</b></p>}
      {estimate && <p className="setting-note">{`Estimate for your options: ${estimate.perMinute} credits per minute`
        + (tone ? `, tone matching included (one analysis every ${toneWindowSeconds} s of your speech, if you speak half the time)` : "")
        + (estimate.cloneCost ? `, and ${estimate.cloneCost} set aside for your voice clone` : "") + "."}</p>}
      <p className="credit-line">{"Used in this conversation"}<b>{credits.sessionUsed}</b></p>
      <AddCredits label={"Add credits"} soon={"Payment is coming soon."} />
      <p className="setting-note">{"You pay for the whole conversation, including your guest's voice and tone."}</p>
    </div>}

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
