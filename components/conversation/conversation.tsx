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
  // The page opens in English, as a link handed to anyone does; the reader can switch it.
  // Their choice is also the best first guess at the language they will speak.
  const [pageLanguage, setPageLanguage] = useState<Language | null>(null);
  const t = translator(pageLanguage ?? "en");
  // Only the destination is chosen here: asking for your own language before anyone has spoken
  // was a guess the transcription makes better. It stays on Auto until the conversation starts.
  const [peerLanguage, setPeerLanguage] = useState<Language>("en");

  return <main className="conversation" lang={pageLanguage ?? "en"}>
    <header className="topbar">
      <Link className="wordmark" href="/" aria-label="Trad0, home">Trad0<span className="brand-dot">.</span></Link>
      <div className="topbar-actions"><ThemeToggle /></div>
    </header>

    <section className="conversation-body" aria-label="Start a conversation">
      <label className="translate-to" htmlFor="peer-language">
        <span>{t("translateTo")}</span>
        <select id="peer-language" className="language-picker" value={peerLanguage}
          onChange={event => setPeerLanguage(event.target.value as Language)}>
          {LANGUAGES.map(code => <option key={code} value={code} lang={code}>{languageNames[code]}</option>)}
        </select>
      </label>
      <div className="translation-area">
        <div className="voice-symbol" aria-hidden="true"><span /><span /><span /><span /><span /></div>
        <h1>{t("homeTitle")}<br /><em>{t("homeTitleEm")}</em></h1>
        <p className="intro">{t("homeIntro")}</p>
      </div>
      <div className="controls">
        <p className="session-status" role="status"><span className="status-dot" />{t("autoLanguage")} ↔ {languageNames[peerLanguage]}</p>
        <StartSharedSession signedIn={!!email} peerLanguage={peerLanguage} language={pageLanguage ?? locale} languageAuto peerLanguageAuto={false} t={t} />
        {email && <AccountStatus email={email} />}
      </div>
    </section>

    <footer>
      <span className="footer-mark" aria-hidden="true">↔</span>
      <p>{t("footerLine")}<br /><span>{t("footerSub")}</span></p>
      <label className="page-language" htmlFor="page-language">
        <span>{t("pageLanguage")}</span>
        <select id="page-language" className="language-picker" value={pageLanguage ?? "en"}
          onChange={event => setPageLanguage(event.target.value as Language)}>
          {LANGUAGES.map(code => <option key={code} value={code} lang={code}>{languageNames[code]}</option>)}
        </select>
      </label>
    </footer>
  </main>;
}
