"use client";
import { useState } from "react";
import { FINAL_TIER, VOICE_TIERS } from "@/lib/voice/consent";
import { rememberVoiceDecision } from "./voice-intro";
import type { Participant } from "@/types/session";

// Consent is given once, then the clone improves on its own from the conversation.
// Nothing is recorded before this button is pressed.
export function VoiceConsent({ sessionId, me, seconds, english, onConsent, onRefresh }: {
  sessionId: string;
  me: Participant;
  seconds: number;
  english: boolean;
  onConsent: () => void;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const next = VOICE_TIERS.find(step => step.tier > me.voiceTier);
  const active = me.voiceStatus === "ready" || me.voiceStatus === "verification_required";
  const summary = active
    ? (english ? `✓ Your voice is active (tier ${me.voiceTier}/${FINAL_TIER})` : `✓ Votre voix est active (palier ${me.voiceTier}/${FINAL_TIER})`)
    : me.consented
      ? (english ? "Learning your voice…" : "Apprentissage de votre voix…")
      : (english ? "Use my voice" : "Utiliser ma voix");
  return <details className="voice-consent"><summary>{summary}</summary>
    {!me.consented
      ? <>
          <p>{english
            ? "The other person hears your translated words in a standard voice. With your permission, your voice is learned from this conversation and sent to ElevenLabs to speak for you instead. Nothing is recorded before you agree."
            : "L’autre personne entend vos mots traduits avec une voix standard. Avec votre accord, votre voix est apprise à partir de cette conversation et transmise à ElevenLabs pour parler à votre place. Rien n’est enregistré avant votre accord."}</p>
          <p>{english
            ? "The recording stays in this browser, is never stored on our servers, and the clone is deleted when the session ends."
            : "L’enregistrement reste dans ce navigateur, n’est jamais stocké sur nos serveurs, et le clone est supprimé à la fin de la session."}</p>
          <button className="demo-button" disabled={busy} onClick={async () => { setBusy(true); rememberVoiceDecision("accepted"); await onConsent(); setBusy(false); }}>
            {english ? "I agree · use my voice for this session" : "J’accepte · utiliser ma voix pour cette session"}
          </button>
        </>
      : <>
          <p role="status">{me.voiceStatus === "verification_required"
            ? (english ? "ElevenLabs requires verification. The standard voice remains active." : "ElevenLabs demande une vérification. La voix standard reste active.")
            : next
              ? (english ? `Speech captured: ${seconds}s of ${next.seconds}s before the next version of your voice.` : `Parole captée : ${seconds} s sur ${next.seconds} s avant la prochaine version de votre voix.`)
              : (english ? "Your voice is final; no more audio is kept." : "Votre voix est définitive ; plus aucun audio n’est conservé.")}</p>
          <p>{english ? "Only your own turns are captured, never the other person." : "Seuls vos propres tours de parole sont captés, jamais ceux de l’autre personne."}</p>
          <button className="demo-button" disabled={busy || me.voiceStatus === "learning"} onClick={async () => {
            setBusy(true); setMessage("");
            try {
              const response = await fetch("/api/voice", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId }) });
              const data = await response.json();
              if (!response.ok) throw new Error(data.error);
              // Remember the refusal: forgetting it would re-apply consent, or reopen the dialog.
              rememberVoiceDecision("declined");
              onRefresh();
            } catch (error) { setMessage(error instanceof Error ? error.message : "Réessayez."); }
            finally { setBusy(false); }
          }}>{english ? "Stop using my voice" : "Ne plus utiliser ma voix"}</button>
        </>}
    {message && <p role="alert">{message}</p>}
  </details>;
}
