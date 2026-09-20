"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useTranslationSession } from "@/hooks/useTranslationSession";
import { StartSharedSession } from "./start-shared-session";
import { TranslationAudio } from "./translation-audio";
import { ThemeToggle } from "./theme-toggle";

// The home page never opens a microphone: a conversation needs two devices, and the only
// thing to try alone is the scripted demonstration.
export function Conversation() {
  const session = useTranslationSession();
  const transcript = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = transcript.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [session.translation]);
  const status = session.active ? "Démonstration · aucun micro utilisé"
    : session.message ? "Un instant…" : "Français → English";

  return <main className="conversation">
    <header className="topbar">
      <Link className="wordmark" href="/" aria-label="À deux, accueil">à deux<span className="brand-dot">.</span></Link>
      <div className="topbar-actions"><span className="edition">PREMIERS MOTS · V0</span><ThemeToggle /></div>
    </header>

    <section className="conversation-body" aria-label="Traduction en direct">
      <div className="language-tag"><span className="language-dot" /> L’autre personne parle <span lang="en">English</span></div>
      <div className={`translation-area ${session.translation ? "has-translation" : ""}`}>
        {session.translation ? <>
          <span className="eyebrow">EXEMPLE DE TRADUCTION</span>
          <div ref={transcript} className="transcript" lang="en" tabIndex={0} aria-label="Traduction anglaise">
            <p>{session.translation}<span className={session.status === "translating" ? "cursor" : ""} /></p>
          </div>
          {!session.active && <TranslationAudio text={session.translation} />}
          {session.original && <details className="original"><summary>Voir l’original</summary><p>{session.original}</p></details>}
        </> : <>
          <div className={`voice-symbol ${session.active ? "is-active" : ""}`} aria-hidden="true"><span /><span /><span /><span /><span /></div>
          <h1>Un échange.<br /><em>Sans barrière.</em></h1>
          <p className="intro">Deux téléphones, deux langues. Vous parlez, l’autre personne lit la traduction et l’entend — avec votre voix.</p>
        </>}
      </div>
      <div className="controls">
        <p className="session-status" role="status"><span className={session.active ? "status-dot active" : "status-dot"} />{status}</p>
        {session.message && <p className="error-message" role="alert">{session.message}</p>}
        {session.active
          ? <button className="primary-button stop-button" onClick={() => session.stop()}>Arrêter la démonstration</button>
          : <>
              <StartSharedSession />
              <button className="demo-button" onClick={() => void session.start(true)}>
                {session.translation ? "Rejouer la démonstration" : "Essayer une démonstration"} <span aria-hidden="true">↗</span>
              </button>
            </>}
        {session.active && <p className="quiet-note">Exemple préécrit, sans micro ni envoi audio.</p>}
      </div>
    </section>

    <footer><span className="footer-mark" aria-hidden="true">↔</span><p>Juste vous deux.<br /><span>Sans compte. Sans installation.</span></p><span className="privacy-note">Aucun micro sur cette page</span></footer>
  </main>;
}
