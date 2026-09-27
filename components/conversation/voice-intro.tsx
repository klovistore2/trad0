"use client";
import { useSyncExternalStore } from "react";
import type { Translate } from "@/lib/i18n/strings";

const storageKey = "a-deux-voice-consent";
type Decision = "accepted" | "declined";
// "unknown" is the server and hydration snapshot: nothing is rendered until the browser answers.
type Snapshot = Decision | null | "unknown";

let cached: Snapshot = "unknown";
const listeners = new Set<() => void>();

function read(): Decision | null {
  try {
    const value = localStorage.getItem(storageKey);
    return value === "accepted" || value === "declined" ? value : null;
  } catch { return null; }
}
function publish(next: Snapshot) {
  cached = next;
  listeners.forEach(listener => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const sync = () => publish(read());
  window.addEventListener("storage", sync);
  return () => { listeners.delete(listener); window.removeEventListener("storage", sync); };
}
function snapshot(): Snapshot {
  if (cached === "unknown") cached = read();
  return cached;
}
// Settings and the dialog write the same memory, so changing your mind in one is honoured by
// the other. Withdrawing records a refusal rather than forgetting, or the dialog would reopen.
export function rememberVoiceDecision(value: Decision) {
  // The choice still applies to this session if storage is unavailable.
  try { localStorage.setItem(storageKey, value); } catch { /* private mode */ }
  publish(value);
}

// A guest who signs in from the voice offer has asked already: the choice is shown on their return.
const askedKey = "trad0-voice-asked";
export function rememberVoiceAsked() {
  try { sessionStorage.setItem(askedKey, "1"); } catch { /* Then it simply waits for speech. */ }
}
function readAsked() {
  try { return sessionStorage.getItem(askedKey) === "1"; } catch { return false; }
}
const noSubscription = () => () => {};
// Offered once the person has spoken a little, as the guest's own offer is: never over the
// invitation screen nor before the first words, and inline, so the conversation stays usable.
const OFFER_AFTER_SECONDS = 10;

// Asked once, on the first conversation, then remembered: later conversations never ask again.
// The memory belongs to this browser, not to an account, so it only keeps the offer closed and
// never agrees for anyone: consent comes from this click, or from the account's own agreement
// restored by the server. Another account signed in here is never enrolled without asking.
export function VoiceIntro({ consented, spokenSeconds, t, onAccept }: {
  consented: boolean;
  spokenSeconds: number;
  t: Translate;
  onAccept: () => void;
}) {
  const decision = useSyncExternalStore(subscribe, snapshot, () => "unknown" as Snapshot);
  const asked = useSyncExternalStore(noSubscription, readAsked, () => false);
  if (consented || decision !== null || (!asked && spokenSeconds < OFFER_AFTER_SECONDS)) return null;
  const choose = (value: Decision) => {
    try { sessionStorage.removeItem(askedKey); } catch { /* Nothing was kept. */ }
    rememberVoiceDecision(value);
    if (value === "accepted") onAccept();
  };
  return <aside className="guest-voice-offer voice-offer" aria-labelledby="voice-intro-title">
    <h2 id="voice-intro-title">{t("voiceTitle")}</h2>
    <p>{t("voiceBody")}</p>
    <p>{t("voiceNote")}</p>
    <button className="primary-button" onClick={() => choose("accepted")}>{t("voiceAccept")}</button>
    <button className="demo-button" onClick={() => choose("declined")}>{t("voiceDecline")}</button>
  </aside>;
}
