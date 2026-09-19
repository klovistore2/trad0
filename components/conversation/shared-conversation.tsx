"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSharedConversation } from "@/hooks/useSharedConversation";
import { languageNames } from "@/types/session";
import { ThemeToggle } from "./theme-toggle";
import { VoiceConsent } from "./voice-consent";
import { ShareSession } from "./share-session";

export function SharedConversation({ id }: { id: string }) {
  const router = useRouter();
  const session = useSharedConversation(id);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [closingMessage, setClosingMessage] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const room = session.room;
  const english = room?.me.language === "en";
  return <main className="conversation">
    <header className="topbar"><Link className="wordmark" href="/">à deux<span className="brand-dot">.</span></Link><div className="topbar-actions"><span className="edition">À DEUX · LIVE</span><ThemeToggle /></div></header>
    <section className="conversation-body">
      {!room ? <><h1>Connexion…</h1>{session.message && <p className="error-message" role="alert">{session.message}</p>}<Link href="/">Retour / Back</Link></>
      : !room.peer || showInvite ? <><ShareSession id={id} />{room.peer && <button className="demo-button" onClick={() => setShowInvite(false)}>Retour à la conversation</button>}</>
      : <>
        <div className="language-tag"><span className="language-dot" />{languageNames[room.me.language]} ↔ {languageNames[room.peer.language]}</div>
        <div className="translation-area">
          {session.incoming ? <><span className="eyebrow">{english ? "THEIR WORDS, IN YOUR LANGUAGE" : "SES MOTS, DANS VOTRE LANGUE"}</span><div className="transcript" lang={room.me.language} tabIndex={0}><p>{session.incoming}</p></div></>
          : <><h1>{english ? "You’re connected." : "Vous êtes ensemble."}</h1><p className="intro">{english ? "Speak naturally. Their translated words will appear here." : "Parlez naturellement. Les mots de l’autre personne apparaîtront ici."}</p></>}
          {session.voiceStatus === "playing" && <p className="quiet-note" role="status">♫ {english ? "Playing translation · microphone paused" : "Traduction en cours · micro en pause"}</p>}
          {session.translation.translation && <details className="original"><summary>{english ? "My translated words" : "Mes mots traduits"}</summary><p>{session.translation.translation}</p></details>}
        </div>
        <div className="controls">
          <p className="session-status" role="status"><span className={`status-dot ${room.peer.online ? "active" : ""}`} />{room.peer.online ? (english ? "Connected" : "L’autre personne est connectée") : (english ? "Waiting for the other person…" : "L’autre personne est déconnectée…")}</p>
          {session.message && <p className="error-message" role="alert">{session.message}</p>}
          {!session.enabled
            ? <button disabled={voiceBusy} className="primary-button" onClick={() => void session.start()}>{english ? "Enable microphone" : "Activer le micro"}</button>
            : session.hasFloor
              ? <>
                  <p className="floor-state" role="status"><span className="status-dot active" />{english ? "Your turn — just speak" : "À vous — parlez"}</p>
                  <button className="primary-button stop-button" onClick={() => session.stop()}>{english ? "Pause" : "Mettre en pause"}</button>
                </>
              : <>
                  <p className="floor-state" role="status"><span className="status-dot" />{english ? "They have the floor" : "L’autre personne a la parole"}</p>
                  <button disabled={session.claiming} className="primary-button" onClick={() => void session.takeFloor()}>{english ? "Let me speak" : "À moi de parler"}</button>
                  <button className="demo-button" onClick={() => session.stop()}>{english ? "Pause" : "Mettre en pause"}</button>
                </>}
          {session.enabled && <button className="demo-button sound-toggle" aria-pressed={session.soundOn} onClick={() => session.toggleSound()}>
            {session.soundOn ? (english ? "Sound on · tap for text only" : "Son activé · toucher pour le texte seul") : (english ? "Text only · tap for sound" : "Texte seul · toucher pour le son")}
          </button>}
          <VoiceConsent sessionId={id} voiceStatus={room.me.voiceStatus} english={english} onRecord={session.stop} onBusy={setVoiceBusy} />
          <button className="demo-button" onClick={() => { session.stop(); setShowInvite(true); }}>{english ? "Invitation link" : "Lien d’invitation"}</button>
        </div>
      </>}
    </section>
    {room && <div className="end-session"><button className="demo-button" onClick={async () => {
      session.stop();
      try { const response = await fetch(`/api/sessions/${id}`, { method: "DELETE" }); const data = await response.json(); if (!response.ok) throw new Error(data.error); router.push("/"); }
      catch (error) { setClosingMessage(error instanceof Error ? error.message : "Réessayez."); }
    }}>{english ? "End session & delete voices" : "Terminer la session et supprimer les voix"}</button>{closingMessage && <p role="alert">{closingMessage}</p>}</div>}
    <footer><span className="footer-mark">↔</span><p>{english ? "Just you two." : "Juste vous deux."}<br /><span>{english ? "No account. No installation." : "Sans compte. Sans installation."}</span></p><span className="privacy-note">{english ? "Session expires after 1 hour" : "Session limitée à 1 heure"}</span></footer>
  </main>;
}
