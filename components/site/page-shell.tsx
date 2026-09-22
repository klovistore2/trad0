import Link from "next/link";
import { ThemeToggle } from "@/components/conversation/theme-toggle";
import { homePath } from "@/lib/i18n/home-metadata";
import { pagePath } from "@/lib/i18n/page-metadata";
import type { Language } from "@/types/session";

// Shared frame for the pages people read before they ever speak: same header, same footer,
// one link back to the conversation. Nothing here opens a microphone.
export function PageShell({ language, children }: { language: Language; children: React.ReactNode }) {
  // The reader keeps their language prefix from one page to the next, even where the text is English.
  return <main className="conversation" lang="en">
    <header className="topbar">
      <Link className="wordmark" href={homePath(language)} aria-label="Trad0, home">Trad0<span className="brand-dot">.</span></Link>
      <div className="topbar-actions">
        <nav className="site-nav" aria-label="Pages">
          <Link href={pagePath("about", language)}>About</Link>
          <Link href={pagePath("faq", language)}>FAQ</Link>
        </nav>
        <ThemeToggle />
      </div>
    </header>
    <section className="conversation-body">{children}</section>
    <footer>
      <span className="footer-mark" aria-hidden="true">↔</span>
      <p>Speak your language.<br /><span>They hear theirs, as you say it.</span></p>
      <Link className="footer-cta" href={homePath(language)}>Start a conversation</Link>
    </footer>
  </main>;
}
