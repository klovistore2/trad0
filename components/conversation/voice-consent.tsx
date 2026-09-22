"use client";
import { useEffect, useState } from "react";
import { GoogleSignIn } from "@/components/account/google-sign-in";
import { FINAL_TIER, VOICE_TIERS } from "@/lib/voice/consent";
import { rememberVoiceDecision } from "./voice-intro";
import type { Participant } from "@/types/session";

// One checkbox for the choice a speaker actually has, and nothing else in the way. Ticking it
// is the explicit agreement: the disclosure sits above it, so the box is never the first time
// recording is mentioned. Nothing is captured until it is ticked.
export function VoiceConsent({ sessionId, me, seconds, onConsent, onRefresh, onUseClone }: {
  sessionId: string;
  me: Participant;
  seconds: number;
  onConsent: () => void;
  onRefresh: () => void;
  onUseClone: (useClone: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
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
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/voice", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, reset }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      // Remember the refusal: forgetting it would re-apply consent, or reopen the dialog.
      if (!reset) rememberVoiceDecision("declined");
      onRefresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Réessayez."); }
    finally { setBusy(false); }
  }
  if (!me.hasAccount) return <div className="voice-consent">
    <p>Sign in with Google to use and keep your own voice. You can continue translating without an account.</p>
    <GoogleSignIn className="demo-button" returnTo={`/session/${sessionId}`} label="Sign in to keep my voice" />
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
    <p>Your voice is learned from your own turns in this conversation and sent to a voice service to speak for you. Samples stay in memory, never on our servers.</p>
    <label className="setting-toggle">
      <input type="checkbox" disabled={busy} checked={pending ?? server} onChange={event => void toggle(event.target.checked)} />
      <span>Use my own voice when possible<em>Slightly slower: your words take the context route so they can be spoken in your voice.</em></span>
    </label>
    {me.consented && <p role="status" className="setting-status">{me.voiceStatus === "verification_required"
      ? "Your voice needs verification before it can be used. A standard voice is used meanwhile."
      : me.voiceStatus === "ready"
        ? next ? `Your voice is ready (step ${me.voiceTier}/${FINAL_TIER}) · ${seconds}s of ${next.seconds}s captured towards the next version.`
          : "Your voice is final; no more audio is kept."
        : next ? `Learning your voice · ${seconds}s of ${next.seconds}s captured.` : "Learning your voice…"}</p>}
    {me.consented && <details className="voice-remove"><summary>Remove my voice</summary>
      <button className="demo-button" disabled={busy || me.voiceStatus === "learning"} onClick={() => void act(false)}>
        Delete my voice and withdraw my agreement
      </button>
      {me.voiceTier > 0 && <button className="demo-button" disabled={busy || me.voiceStatus === "learning"} onClick={() => void act(true)}>
        Rebuild my voice from scratch
      </button>}
    </details>}
    {message && <p role="alert">{message}</p>}
  </div>;
}
