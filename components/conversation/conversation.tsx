"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslationSession } from "@/hooks/useTranslationSession";
import { StartSharedSession } from "./start-shared-session";
import { TranslationAudio } from "./translation-audio";
import { ThemeToggle } from "./theme-toggle";
import { AccountStatus } from "@/components/account/account-status";
import { LANGUAGES, UNVERIFIED_OUTPUT, languageNames, type Language } from "@/types/session";

// The home page never opens a microphone: a conversation needs two devices, and the only
// thing to try alone is the scripted demonstration.
export function Conversation({ email }: { email: string | null }) {
  const session = useTranslationSession();
  const [peerLanguage, setPeerLanguage] = useState<Language>("th");
  const transcript = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = transcript.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [session.translation]);
  const status = session.active ? "Demonstration · no microphone used"
    : session.message ? "One moment…" : `Français → ${languageNames[peerLanguage]}`;

  return <main className="conversation">
    <header className="topbar">
      <Link className="wordmark" href="/" aria-label="Trad0, home">Trad0<span className="brand-dot">.</span></Link>
      <div className="topbar-actions"><span className="edition">FIRST WORDS · V0</span><ThemeToggle /></div>
    </header>

    <section className="conversation-body" aria-label="Live translation">
      <div className="language-tag">
        <span className="language-dot" />
        <label htmlFor="peer-language">They speak</label>
        <select id="peer-language" className="language-picker" value={peerLanguage} lang={peerLanguage}
          onChange={event => setPeerLanguage(event.target.value as Language)}>
          {LANGUAGES.map(code => <option key={code} value={code} lang={code}>
            {languageNames[code]}{UNVERIFIED_OUTPUT.includes(code) ? " · untested" : ""}
          </option>)}
        </select>
      </div>
      <div className={`translation-area ${session.translation ? "has-translation" : ""}`}>
        {session.translation ? <>
          <span className="eyebrow">SAMPLE TRANSLATION</span>
          <div ref={transcript} className="transcript" lang="en" tabIndex={0} aria-label="English translation">
            <p>{session.translation}<span className={session.status === "translating" ? "cursor" : ""} /></p>
          </div>
          {!session.active && <TranslationAudio text={session.translation} />}
          {session.original && <details className="original"><summary>Show the original</summary><p>{session.original}</p></details>}
        </> : <>
          <div className={`voice-symbol ${session.active ? "is-active" : ""}`} aria-hidden="true"><span /><span /><span /><span /><span /></div>
          <h1>A conversation.<br /><em>No barrier.</em></h1>
          <p className="intro">Two phones, two languages. You speak, the other person reads the translation and hears it — in your voice.</p>
        </>}
      </div>
      <div className="controls">
        <p className="session-status" role="status"><span className={session.active ? "status-dot active" : "status-dot"} />{status}</p>
        {session.message && <p className="error-message" role="alert">{session.message}</p>}
        {session.active
          ? <button className="primary-button stop-button" onClick={() => session.stop()}>Stop the demonstration</button>
          : <>
              <StartSharedSession signedIn={!!email} peerLanguage={peerLanguage} />
              <button className="demo-button" onClick={() => void session.start(true)}>
                {session.translation ? "Replay the demonstration" : "Try a demonstration"} <span aria-hidden="true">↗</span>
              </button>
            </>}
        {session.active && <p className="quiet-note">A scripted example, with no microphone and no audio sent.</p>}
        {!session.active && email && <AccountStatus email={email} />}
      </div>
    </section>

    <footer><span className="footer-mark" aria-hidden="true">↔</span><p>Just the two of you.<br /><span>No account for your guest. No installation.</span></p><span className="privacy-note">No microphone on this page</span></footer>
  </main>;
}
