"use client";
import { useEffect, useState } from "react";
import { GoogleSignIn } from "@/components/account/google-sign-in";
import { FINAL_TIER, VOICE_TIERS } from "@/lib/voice/consent";
import { rememberVoiceAsked, rememberVoiceDecision } from "./voice-intro";
import type { Participant } from "@/types/session";
import type { Translate } from "@/lib/i18n/strings";

// One checkbox for the choice a speaker actually has, and nothing else in the way. Ticking it
// is the explicit agreement: the disclosure sits above it, so the box is never the first time
// recording is mentioned. Nothing is captured until it is ticked.
export function VoiceConsent({ sessionId, me, seconds, t, onConsent, onRefresh, onUseClone }: {
  sessionId: string;
  t: Translate;
  me: Participant;
  seconds: number;
  onConsent: () => void;
  onRefresh: () => void;
  onUseClone: (useClone: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // The box answers the tap at once. Session state is polled, so a purely controlled checkbox
  // would untick itself for a second and read as a failure. The timer is a safety net: a refused
  // agreement must not leave the box claiming something the server never recorded.
  const server = me.consented && me.useClone;
  const [pending, setPending] = useState<boolean | null>(null);
  if (pending !== null && pending === server) setPending(null);
  useEffect(() => {
    if (pending === null) return;
    const timer = setTimeout(() => setPending(null), 5000);
    return () => clearTimeout(timer);
  }, [pending]);
  // reset keeps the agreement and starts the tiers over; otherwise the agreement is withdrawn.
  async function act(reset: boolean) {
    setBusy(true); setFailed(false);
    try {
      const response = await fetch("/api/voice", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, reset }),
      });
      if (!response.ok) throw new Error(`voice ${response.status}`);
      // Remember the refusal: forgetting it would reopen the dialog.
      if (!reset) rememberVoiceDecision("declined");
      onRefresh();
    } catch { setFailed(true); }
    finally { setBusy(false); }
  }
  if (!me.hasAccount) return <div className="voice-consent">
    <p>{t("voiceSignInNote")}</p>
    <GoogleSignIn className="demo-button" returnTo={`/session/${sessionId}`} label={t("keepVoiceAction")} onStart={rememberVoiceAsked} />
  </div>;
  const next = VOICE_TIERS.find(step => step.tier > me.voiceTier);
  // Unticking keeps the recorded voice: only the separate removal below deletes it.
  async function toggle(on: boolean) {
    setPending(on);
    if (!on) { onUseClone(false); return; }
    setBusy(true);
    // One intent, two server facts. A speaker who turned the voice off earlier keeps that
    // refusal in their profile, so agreeing again would otherwise leave the voice unused.
    if (!me.consented) { rememberVoiceDecision("accepted"); await onConsent(); }
    if (!me.useClone) onUseClone(true);
    setBusy(false);
  }
  return <div className="voice-consent">
    <p>{t("voiceDisclosure")}</p>
    <label className="setting-toggle">
      <input type="checkbox" disabled={busy} checked={pending ?? server} onChange={event => void toggle(event.target.checked)} />
      <span>{t("useMyVoice")}<em>{t("useMyVoiceNote")}</em></span>
    </label>
    {me.consented && <p role="status" className="setting-status">{me.voiceStatus === "verification_required"
      ? t("voiceVerification")
      : me.voiceStatus === "ready"
        ? next ? t("voiceReady", { tier: me.voiceTier, final: FINAL_TIER, seconds, target: next.seconds }) : t("voiceFinal")
        : next ? t("voiceLearning", { seconds, target: next.seconds }) : t("voiceLearningShort")}</p>}
    {me.consented && <details className="voice-remove"><summary>{t("removeVoice")}</summary>
      <button className="demo-button" disabled={busy || me.voiceStatus === "learning"} onClick={() => void act(false)}>
        {t("deleteVoice")}
      </button>
      {me.voiceTier > 0 && <button className="demo-button" disabled={busy || me.voiceStatus === "learning"} onClick={() => void act(true)}>
        {t("rebuildVoice")}
      </button>}
    </details>}
    {failed && <p role="alert">{t("errorRetry")}</p>}
  </div>;
}
