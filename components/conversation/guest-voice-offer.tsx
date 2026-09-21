"use client";
import Link from "next/link";
import { useState } from "react";
import type { Translate } from "@/lib/i18n/strings";
export function GuestVoiceOffer({ id, seconds, t }: { id: string; seconds: number; t: Translate }) {
  const [dismissed, setDismissed] = useState(false);
  if (seconds < 30 || dismissed) return null;
  return <aside className="guest-voice-offer" aria-label={t("keepVoiceTitle")}>
    <p>{t("keepVoiceBody")}</p>
    <Link className="demo-button" href={`/compte?returnTo=${encodeURIComponent(`/session/${id}`)}`}>{t("keepVoiceAction")}</Link>
    <button className="demo-button" onClick={() => setDismissed(true)}>{t("notNow")}</button>
  </aside>;
}
