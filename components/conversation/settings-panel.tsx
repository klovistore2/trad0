"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { VoiceConsent } from "./voice-consent";
import type { Participant } from "@/types/session";
import type { SpeechOptions } from "@/lib/audio/speech-options";
import type { Translate } from "@/lib/i18n/strings";
import { AddCredits } from "@/components/account/add-credits";
import { creditEstimate } from "@/lib/billing/prices";
import { FINAL_TIER } from "@/lib/voice/consent";

// Everything that is not the conversation itself lives here, so the call screen stays bare.
// It reads in the person's own language: a guest may consent to their voice here.
export function SettingsPanel({ id, me, credits, toneWindowSeconds, speechSeconds, home, t, onConsent, onRefresh, onUseClone, onClose, speechOptions, onSpeechOptions }: {
  credits?: { sessionUsed: number; balance: number } | null;
  toneWindowSeconds: number;
  speechOptions: SpeechOptions;
  onSpeechOptions: (options: SpeechOptions) => void;
  id: string;
  me: Participant;
  speechSeconds: number;
  home: string;
  t: Translate;
  onConsent: () => void;
  onRefresh: () => void;
  onUseClone: (useClone: boolean) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [closing, setClosing] = useState(false);
  // Ending closes the conversation for both people at once: a second, explicit tap confirms it.
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);
  // Only the payer's own options are known here: tone if ticked, and the clones still to come.
  const tone = speechOptions.emotion && me.hasAccount;
  const estimate = credits && creditEstimate({ balance: credits.balance, tone, toneWindowSeconds,
    clonesToCome: me.hasAccount && me.consented ? Math.max(0, FINAL_TIER - me.voiceTier) : 0 });
  async function end() {
    setClosing(true); setFailed(false);
    try {
      const response = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(`end ${response.status}`);
      router.push(home);
    } catch { setFailed(true); setClosing(false); setConfirming(false); }
  }
  return <section className="settings">
    <h1>{t("settings")}</h1>
    <button className="primary-button" onClick={onClose}>{t("backToConversation")}</button>

    <div className="settings-group">
      <h2>{t("myVoice")}</h2>
      <VoiceConsent sessionId={id} me={me} seconds={speechSeconds} t={t} onConsent={onConsent} onRefresh={onRefresh} onUseClone={onUseClone} />
      {me.hasAccount && <label className="setting-toggle">
        <input type="checkbox" checked={speechOptions.emotion} onChange={event => onSpeechOptions({ ...speechOptions, emotion: event.target.checked })} />
        <span>{t("matchTone")}<em>{t("matchToneNote")}</em></span>
      </label>}
    </div>

    {credits && <div className="settings-group">
      <h2>{t("credits")}</h2>
      <p className="credit-line">{t("creditsLeft")}<b>{credits.balance}</b></p>
      {estimate && <p className="credit-line">{t("timeLeft")}<b>{t("minutesLeft", { minutes: estimate.minutes })}</b></p>}
      {estimate && <p className="setting-note">{t("creditRate", { rate: estimate.perMinute })}
        {estimate.cloneCost ? ` ${t("creditCloneReserve", { credits: estimate.cloneCost })}` : ""}</p>}
      <p className="credit-line">{t("usedHere")}<b>{credits.sessionUsed}</b></p>
      <AddCredits label={t("addCredits")} soon={t("paymentSoon")} />
      <p className="setting-note">{t("youPay")}</p>
    </div>}

    <div className="settings-group settings-danger">
      {confirming
        ? <>
            <p role="alert">{t("endConfirm")}</p>
            <button className="demo-button" disabled={closing} onClick={() => void end()}>{t("endYes")}</button>
            <button className="demo-button end-cancel" disabled={closing} onClick={() => setConfirming(false)}>{t("cancel")}</button>
          </>
        : <button className="demo-button" onClick={() => setConfirming(true)}>{t("endConversation")}</button>}
      {failed && <p role="alert">{t("errorEnd")}</p>}
    </div>
  </section>;
}
