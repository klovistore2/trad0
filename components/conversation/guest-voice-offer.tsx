"use client";
import { useState } from "react";
import { GoogleSignIn } from "@/components/account/google-sign-in";
import type { Translate } from "@/lib/i18n/strings";
export function GuestVoiceOffer({ id, seconds, t }: { id: string; seconds: number; t: Translate }) {
  const [dismissed, setDismissed] = useState(false);
  if (seconds < 30 || dismissed) return null;
  return <aside className="guest-voice-offer" aria-label={t("keepVoiceTitle")}>
    <p>{t("keepVoiceBody")}</p>
    <GoogleSignIn className="demo-button" returnTo={`/session/${id}`} label={t("keepVoiceAction")} />
    <button className="demo-button" onClick={() => setDismissed(true)}>{t("notNow")}</button>
  </aside>;
}
