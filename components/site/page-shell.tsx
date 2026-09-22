import Link from "next/link";
import { ThemeToggle } from "@/components/conversation/theme-toggle";
import { homePath } from "@/lib/i18n/home-metadata";
import { pagePath } from "@/lib/i18n/page-metadata";
import { pageContent } from "@/lib/i18n/pages";
import { translator } from "@/lib/i18n/strings";
import type { Language } from "@/types/session";

// Shared frame for the pages people read before they ever speak: same header, same footer,
// one link back to the conversation, all in the reader's language. Nothing here opens a microphone.
export function PageShell({ language, children }: { language: Language; children: React.ReactNode }) {
  const t = translator(language);
  return <main className="conversation" lang={language}>
    <header className="topbar">
      <Link className="wordmark" href={homePath(language)} aria-label="Trad0">Trad0<span className="brand-dot">.</span></Link>
      <div className="topbar-actions">
        <nav className="site-nav" aria-label="Pages">
          <Link href={pagePath("about", language)}>{t("navAbout")}</Link>
          <Link href={pagePath("faq", language)}>{t("navFaq")}</Link>
        </nav>
        <ThemeToggle />
      </div>
    </header>
    <section className="conversation-body">{children}</section>
    <footer>
      <span className="footer-mark" aria-hidden="true">↔</span>
      <p>{t("footerLine")}<br /><span>{t("footerSub")}</span></p>
      <Link className="footer-cta" href={homePath(language)}>{pageContent(language).about.cta}</Link>
    </footer>
  </main>;
}
