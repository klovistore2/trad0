"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { StartSharedSession } from "./start-shared-session";
import { ThemeToggle } from "./theme-toggle";
import { AccountStatus } from "@/components/account/account-status";
import { languageNames, type Language } from "@/types/session";

import { LanguageMenus } from "./language-menus";
import { browserLanguage } from "@/lib/translation/language";
const subscribeLocale = () => () => {};
const getLocale = () => browserLanguage(navigator.languages);
const serverLocale = () => "en" as const;

// The home page never opens a microphone: a conversation needs two devices, and a scripted
// preview proved nothing about real speech. Choose the two languages, then invite someone.
export function Conversation({ email }: { email: string | null }) {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, serverLocale);
  const [myLanguage, setMyLanguage] = useState<Language | null>(null);
  const language = myLanguage ?? locale;
  const [peerAutomatic, setPeerAutomatic] = useState(true);
  const [peerLanguage, setPeerLanguage] = useState<Language>("th");

  return <main className="conversation">
    <header className="topbar">
      <Link className="wordmark" href="/" aria-label="Trad0, home">Trad0<span className="brand-dot">.</span></Link>
      <div className="topbar-actions"><span className="edition">FIRST WORDS · V0</span><ThemeToggle /></div>
    </header>

    <section className="conversation-body" aria-label="Start a conversation">
      <LanguageMenus mine={{ language, languageAuto: myLanguage === null }}
        theirs={{ language: peerLanguage, languageAuto: peerAutomatic }}
        onMine={value => setMyLanguage(value === "auto" ? null : value)}
        onTheirs={value => { setPeerAutomatic(value === "auto"); if (value !== "auto") setPeerLanguage(value); }} />
      <div className="translation-area">
        <div className="voice-symbol" aria-hidden="true"><span /><span /><span /><span /><span /></div>
        <h1>A conversation.<br /><em>No barrier.</em></h1>
        <p className="intro">Two phones, two languages. You speak, the other person reads the translation and hears it — in your voice.</p>
      </div>
      <div className="controls">
        <p className="session-status" role="status"><span className="status-dot" />{languageNames[language]} ↔ {languageNames[peerLanguage]}</p>
        <StartSharedSession signedIn={!!email} peerLanguage={peerLanguage} language={language} languageAuto={myLanguage === null} peerLanguageAuto={peerAutomatic} />
        {email && <AccountStatus email={email} />}
      </div>
    </section>

    <footer><span className="footer-mark" aria-hidden="true">↔</span><p>Just the two of you.<br /><span>No account for your guest. No installation.</span></p><span className="privacy-note">No microphone on this page</span></footer>
  </main>;
}
