"use client";
import { useState } from "react";
import type { Language } from "@/types/session";

// A speaker's double check: what the microphone understood, and what the other person receives.
// Seeing only the translation hides a misheard word behind a plausible sentence.
export function OwnWords({ original, translation, mine, theirs, english }: {
  original: string;
  translation: string;
  mine: Language;
  theirs: Language;
  english: boolean;
}) {
  const [showOriginal, setShowOriginal] = useState(false);
  if (!original && !translation) return null;
  const text = showOriginal ? original : translation;
  return <details className="original">
    <summary>{english ? "My words" : "Mes mots"}</summary>
    <div className="own-words-switch">
      <button type="button" className="demo-button" aria-pressed={!showOriginal} onClick={() => setShowOriginal(false)}>
        {english ? "What they receive" : "Ce que l’autre reçoit"}
      </button>
      <button type="button" className="demo-button" aria-pressed={showOriginal} onClick={() => setShowOriginal(true)}>
        {english ? "What I said" : "Ce que j’ai dit"}
      </button>
    </div>
    <p lang={showOriginal ? mine : theirs}>{text || (english ? "Nothing recognised yet." : "Rien de reconnu pour l’instant.")}</p>
  </details>;
}
