"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useTranslationSession } from "@/hooks/useTranslationSession";

function Microphone({ stopped = false }: { stopped?: boolean }) {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    {stopped ? <rect x="6" y="6" width="12" height="12" rx="3" fill="currentColor" stroke="none" /> : <><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" /></>}
  </svg>;
}

export function Conversation() {
  const session = useTranslationSession();
  const transcript = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = transcript.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [session.translation]);
  const status = session.status === "connecting" ? "Connexion en cours…"
    : session.demo && session.active ? "Démonstration · micro désactivé"
    : session.status === "translating" ? "Vos mots prennent vie en thaï"
    : session.status === "listening" ? "À votre écoute"
    : session.message ? "Un instant…" : "Français → ไทย";

  return <main className="conversation">
    <header className="topbar">
      <Link className="wordmark" href="/" aria-label="À deux, accueil">à deux<span className="brand-dot">.</span></Link>
      <span className="edition">PREMIERS MOTS · V0</span>
    </header>

    <section className="conversation-body" aria-label="Traduction en direct">
      <div className="language-tag"><span className="language-dot" /> L’autre personne parle <span lang="th">ไทย</span></div>
      <div className={`translation-area ${session.translation ? "has-translation" : ""}`}>
        {session.translation ? <>
          <span className="eyebrow">{session.demo ? "EXEMPLE DE TRADUCTION" : "VOS MOTS, EN THAÏ"}</span>
          <div ref={transcript} className="transcript" lang="th" tabIndex={0} aria-label="Traduction thaïe">
            <p>{session.translation}<span className={session.status === "translating" ? "cursor" : ""} /></p>
          </div>
          {session.original && <details className="original"><summary>Voir l’original</summary><p>{session.original}</p></details>}
        </> : <>
          <div className={`voice-symbol ${session.active ? "is-active" : ""}`} aria-hidden="true"><span /><span /><span /><span /><span /></div>
          <h1>{session.active ? "Je vous écoute." : <>Un échange.<br /><em>Sans barrière.</em></>}</h1>
          <p className="intro">{session.active ? "Parlez naturellement. La traduction apparaît ici." : "Parlez français. Vos mots s’affichent en thaï, au fil de votre voix."}</p>
        </>}
      </div>
      <div className="controls">
        <p className="session-status" role="status"><span className={session.active ? "status-dot active" : "status-dot"} />{status}</p>
        {session.message && <p className="error-message" role="alert">{session.message}</p>}
        <button className={`primary-button ${session.active ? "stop-button" : ""}`} onClick={() => session.active ? session.stop() : void session.start()}>
          <Microphone stopped={session.active} />
          {session.status === "connecting" ? "Annuler" : session.active ? "Arrêter" : session.message ? "Réessayer" : session.translation ? "Recommencer" : "Commencer à parler"}
        </button>
        {!session.active && <button className="demo-button" onClick={() => void session.start(true)}>Essayer une démonstration <span aria-hidden="true">↗</span></button>}
        {session.active && <p className="quiet-note">{session.demo ? "Exemple préécrit, sans envoi audio." : "Le micro reste ouvert jusqu’à l’arrêt."}</p>}
      </div>
    </section>

    <footer><span className="footer-mark" aria-hidden="true">↔</span><p>Juste vous deux.<br /><span>Sans compte. Sans installation.</span></p><span className="privacy-note">{session.demo ? "Aucun micro utilisé" : "Audio transmis pour traduction"}</span></footer>
  </main>;
}
