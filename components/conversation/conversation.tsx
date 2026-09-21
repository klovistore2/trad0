"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { StartSharedSession } from "./start-shared-session";
import { ThemeToggle } from "./theme-toggle";
import { AccountStatus } from "@/components/account/account-status";
import { LANGUAGES, languageNames, type Language } from "@/types/session";

import { translator } from "@/lib/i18n/strings";
import { browserLanguage } from "@/lib/translation/language";
const subscribeLocale = () => () => {};
const getLocale = () => browserLanguage(navigator.languages);
const serverLocale = () => "en" as const;

// The home page never opens a microphone: a conversation needs two devices, and a scripted
// preview proved nothing about real speech. Choose the other person's language, then invite them.
export function Conversation({ email }: { email: string | null }) {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, serverLocale);
  const t = translator("en");
  // Only the destination is chosen here: asking for your own language before anyone has spoken
  // was a guess the transcription makes better. It stays on Auto until the conversation starts.
  const [peerLanguage, setPeerLanguage] = useState<Language>("en");

  return <main className="conversation">
    <header className="topbar">
      <Link className="wordmark" href="/" aria-label="Trad0, home">Trad0<span className="brand-dot">.</span></Link>
      <div className="topbar-actions"><span className="edition">FIRST WORDS · V0</span><ThemeToggle /></div>
    </header>

    <section className="conversation-body" aria-label="Start a conversation">
      <div className="language-menus">
        <div className="language-choice">
          <label htmlFor="peer-language">{t("theySpeak")}</label>
          <select id="peer-language" className="language-picker" value={peerLanguage}
            onChange={event => setPeerLanguage(event.target.value as Language)}>
            {LANGUAGES.map(code => <option key={code} value={code} lang={code}>{languageNames[code]}</option>)}
          </select>
        </div>
      </div>
      <div className="translation-area">
        <div className="voice-symbol" aria-hidden="true"><span /><span /><span /><span /><span /></div>
        <h1>A conversation.<br /><em>No barrier.</em></h1>
        <p className="intro">Two phones, two languages. You speak, the other person reads the translation and hears it — in your voice.</p>
      </div>
      <div className="controls">
        <p className="session-status" role="status"><span className="status-dot" />{t("autoLanguage")} ↔ {languageNames[peerLanguage]}</p>
        <StartSharedSession signedIn={!!email} peerLanguage={peerLanguage} language={locale} languageAuto peerLanguageAuto={false} />
        {email && <AccountStatus email={email} />}
      </div>
    </section>

    <footer><span className="footer-mark" aria-hidden="true">↔</span><p>Just the two of you.<br /><span>No account for your guest. No installation.</span></p><span className="privacy-note">No microphone on this page</span></footer>
  </main>;
}
