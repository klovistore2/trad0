"use client";
import { useState } from "react";
import { FINAL_TIER, VOICE_TIERS } from "@/lib/voice/consent";
import { rememberVoiceDecision } from "./voice-intro";
import type { Participant } from "@/types/session";

// Consent is given once, then the clone improves on its own from the conversation.
// Nothing is recorded before this button is pressed.
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
  const next = VOICE_TIERS.find(step => step.tier > me.voiceTier);
  const active = me.voiceStatus === "ready" || me.voiceStatus === "verification_required";
  const summary = active
    ? (`✓ Your voice is active (tier ${me.voiceTier}/${FINAL_TIER})`)
    : me.consented
      ? ("Learning your voice…")
      : ("Use my voice");
  return <details className="voice-consent"><summary>{summary}</summary>
    {!me.consented
      ? <>
          <p>{"The other person hears your translated words in a standard voice. With your permission, your voice is learned from this conversation and sent to ElevenLabs to speak for you instead. Nothing is recorded before you agree."}</p>
          <p>{"The recording stays in this browser, is never stored on our servers, and the clone is deleted when the session ends."}</p>
          <button className="demo-button" disabled={busy} onClick={async () => { setBusy(true); rememberVoiceDecision("accepted"); await onConsent(); setBusy(false); }}>
            {"I agree · use my voice for this session"}
          </button>
        </>
      : <>
          <p role="status">{me.voiceStatus === "verification_required"
            ? ("ElevenLabs requires verification. The standard voice remains active.")
            : next
              ? (`Speech captured: ${seconds}s of ${next.seconds}s before the next version of your voice.`)
              : ("Your voice is final; no more audio is kept.")}</p>
          <p>{"Only your own turns are captured, never the other person."}</p>
          <button className="demo-button" disabled={busy || me.voiceStatus === "learning"} onClick={() => void act(false)}>
            {"Stop using my voice"}
          </button>
          {me.voiceTier > 0 && <>
            <button className="demo-button" aria-pressed={me.useClone} onClick={() => onUseClone(!me.useClone)}>
              {me.useClone
                ? ("Cloned voice in use · tap for the standard voice")
                : ("Standard voice in use · tap for my cloned voice")}
            </button>
            <button className="demo-button" disabled={busy || me.voiceStatus === "learning"} onClick={() => void act(true)}>
              {"Rebuild my voice from scratch"}
            </button>
          </>}
        </>}
    {message && <p role="alert">{message}</p>}
  </details>;
}
