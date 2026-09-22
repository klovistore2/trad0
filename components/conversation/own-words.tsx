"use client";
import { useState } from "react";
import type { Language } from "@/types/session";
import type { Translate } from "@/lib/i18n/strings";

// A speaker's double check: what the microphone understood, and what the other person receives.
// Seeing only the translation hides a misheard word behind a plausible sentence, so the speaker's
// own words come first and the panel starts open.
export function OwnWords({ original, translation, mine, theirs, t }: {
  original: string;
  translation: string;
  mine: Language;
  theirs: Language;
  t: Translate;
}) {
  const [showOriginal, setShowOriginal] = useState(true);
  const [open, setOpen] = useState(true);
  if (!original && !translation) return null;
  const text = showOriginal ? original : translation;
  return <details className="original" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{t("myWords")}</summary>
    <div className="own-words-switch">
      <button type="button" className="demo-button" aria-pressed={showOriginal} onClick={() => setShowOriginal(true)}>
        {t("whatISaid")}
      </button>
      <button type="button" className="demo-button" aria-pressed={!showOriginal} onClick={() => setShowOriginal(false)}>
        {t("whatTheyReceive")}
      </button>
    </div>
    <p lang={showOriginal ? mine : theirs}>{text || t("nothingYet")}</p>
  </details>;
}
