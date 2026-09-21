"use client";
import Link from "next/link";
import { useState } from "react";
import { useSharedConversation } from "@/hooks/useSharedConversation";
import { languageNames } from "@/types/session";
import { ThemeToggle } from "./theme-toggle";
import { ShareSession } from "./share-session";
import { SettingsPanel } from "./settings-panel";
import { VoiceIntro } from "./voice-intro";
import { OwnWords } from "./own-words";

export function SharedConversation({ id }: { id: string }) {
  const session = useSharedConversation(id);
  const [settings, setSettings] = useState(false);
  const room = session.room;
  const english = room?.me.language === "en";
  return <main className="conversation">
    {room && <VoiceIntro consented={room.me.consented} english={english} onAccept={session.giveConsent} />}
    <header className="topbar">
      <Link className="wordmark" href="/">à deux<span className="brand-dot">.</span></Link>
      <div className="topbar-actions">
        <span className="edition">À DEUX · LIVE</span>
        {room?.peer && <button type="button" className="theme-toggle" onClick={() => setSettings(open => !open)}
          aria-label={english ? "Settings" : "Paramètres"} title={english ? "Settings" : "Paramètres"} aria-pressed={settings}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3.2" />
            <path d="M19.9 14.2a1.6 1.6 0 0 0 .32 1.76l.06.06a1.9 1.9 0 1 1-2.7 2.7l-.06-.06a1.6 1.6 0 0 0-1.76-.32 1.6 1.6 0 0 0-1 1.46v.17a1.9 1.9 0 1 1-3.8 0v-.09a1.6 1.6 0 0 0-1.05-1.46 1.6 1.6 0 0 0-1.76.32l-.06.06a1.9 1.9 0 1 1-2.7-2.7l.06-.06a1.6 1.6 0 0 0 .32-1.76 1.6 1.6 0 0 0-1.46-1H3.9a1.9 1.9 0 1 1 0-3.8h.09a1.6 1.6 0 0 0 1.46-1.05 1.6 1.6 0 0 0-.32-1.76l-.06-.06a1.9 1.9 0 1 1 2.7-2.7l.06.06a1.6 1.6 0 0 0 1.76.32h.08a1.6 1.6 0 0 0 1-1.46V3.9a1.9 1.9 0 1 1 3.8 0v.09a1.6 1.6 0 0 0 1 1.46 1.6 1.6 0 0 0 1.76-.32l.06-.06a1.9 1.9 0 1 1 2.7 2.7l-.06.06a1.6 1.6 0 0 0-.32 1.76v.08a1.6 1.6 0 0 0 1.46 1h.17a1.9 1.9 0 1 1 0 3.8h-.09a1.6 1.6 0 0 0-1.46 1Z" />
          </svg>
        </button>}
        <ThemeToggle />
      </div>
    </header>
    <section className="conversation-body">
      {!room ? <><h1>Connexion…</h1>{session.message && <p className="error-message" role="alert">{session.message}</p>}<Link href="/">Retour / Back</Link></>
      : !room.peer ? <ShareSession id={id} />
      : settings ? <SettingsPanel id={id} english={english} me={room.me} peer={room.peer} speechSeconds={session.speechSeconds}
          onConsent={() => void session.giveConsent()} onRefresh={session.refresh} onUseClone={useClone => void session.setUseClone(useClone)} readAudioState={session.readAudioState}
          onTestTone={() => void session.playTestTone()} voiceStatus={session.voiceStatus} received={session.received}
          onClose={() => setSettings(false)} />
      : <>
        <div className="language-tag"><span className="language-dot" />{languageNames[room.me.language]} ↔ {languageNames[room.peer.language]}</div>
        <button type="button" className="sound-icon" aria-pressed={!session.soundOn}
          aria-label={session.soundOn ? (english ? "Mute the sound" : "Couper le son") : (english ? "Turn the sound on" : "Activer le son")}
          title={session.soundOn ? (english ? "Mute the sound" : "Couper le son") : (english ? "Turn the sound on" : "Activer le son")}
          onClick={() => session.toggleSound()}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 9.5v5h3.5L12 18V6L7.5 9.5H4Z" fill="currentColor" stroke="none" />
            {session.soundOn
              ? <><path d="M15.5 9.2a4 4 0 0 1 0 5.6" /><path d="M18 6.7a7.5 7.5 0 0 1 0 10.6" /></>
              : <><path d="M16 9.5l5 5" /><path d="M21 9.5l-5 5" /></>}
          </svg>
        </button>
        <span className="sound-icon-label">{session.soundOn
          ? (english ? "Sound on" : "Son activé")
          : (english ? "Text only" : "Texte seul")}</span>
        <div className="translation-area">
          {session.incoming ? <><span className="eyebrow">{english ? "THEIR WORDS, IN YOUR LANGUAGE" : "SES MOTS, DANS VOTRE LANGUE"}</span><div className="transcript" lang={room.me.language} tabIndex={0}><p>{session.incoming}</p></div></>
          : <><h1>{english ? "You’re connected." : "Vous êtes ensemble."}</h1><p className="intro">{english ? "Speak naturally. Their translated words will appear here." : "Parlez naturellement. Les mots de l’autre personne apparaîtront ici."}</p></>}
          {session.voiceStatus === "playing" && <p className="quiet-note" role="status">♫ {english ? "Playing translation · microphone paused" : "Traduction en cours · micro en pause"}</p>}
          {!session.soundReady && session.received > 0 && <p className="quiet-note" role="status">{english ? "Touch the screen once to hear the translations." : "Touchez l’écran une fois pour entendre les traductions."}</p>}
          <OwnWords original={session.translation.original} translation={session.translation.translation}
            mine={room.me.language} theirs={room.peer.language} english={english} />
        </div>
        <div className="controls">
          <p className="session-status" role="status"><span className={`status-dot ${room.peer.online ? "active" : ""}`} />{room.peer.online ? (english ? "Connected" : "L’autre personne est connectée") : (english ? "Waiting for the other person…" : "L’autre personne est déconnectée…")}</p>
          {session.message && <p className="error-message" role="alert">{session.message}</p>}
          {session.connectionLost && <p className="quiet-note" role="status">{english ? "Reconnecting…" : "Reconnexion…"}</p>}
          {!session.soundReady && session.received > 0 && <button className="demo-button" onClick={() => void session.enableSound()}>{english ? "Hear the translation" : "Entendre la traduction"}</button>}
          {!session.enabled
            ? <button className="primary-button" disabled={session.starting} onClick={() => void session.start()}>{session.starting
                ? (english ? "Connecting…" : "Connexion…")
                : session.floorFree
                  ? (english ? "Start talking" : "Commencer à parler")
                  : (english ? "Join in · they are speaking" : "Rejoindre · l’autre personne parle")}</button>
            : session.hasFloor
              ? <>
                  <p className="floor-state live" role="status"><span className="status-dot active" />{english ? "Your microphone is open — speak" : "Votre micro est ouvert — parlez"}</p>
                  <button disabled={session.claiming} className="primary-button stop-button" onClick={() => void session.releaseFloor()}>{english ? "Done speaking" : "J’ai fini de parler"}</button>
                </>
              : <>
                  <p className="floor-state" role="status"><span className="status-dot" />{session.floorFree
                    ? (english ? "Both microphones are closed" : "Les deux micros sont fermés")
                    : (english ? "They are speaking" : "L’autre personne parle")}</p>
                  <button disabled={session.claiming} className="primary-button" onClick={() => void session.takeFloor()}>{session.floorFree
                    ? (english ? "Speak" : "Parler")
                    : (english ? "Let me speak" : "À moi de parler")}</button>
                </>}
        </div>
      </>}
    </section>
    <footer><span className="footer-mark">↔</span><p>{english ? "Just you two." : "Juste vous deux."}<br /><span>{english ? "No account. No installation." : "Sans compte. Sans installation."}</span></p><span className="privacy-note">{english ? "Session expires after 1 hour" : "Session limitée à 1 heure"}</span></footer>
  </main>;
}
