import Link from "next/link";
import { homePath } from "@/lib/i18n/home-metadata";
import { pagePath } from "@/lib/i18n/page-metadata";
import { pageContent } from "@/lib/i18n/pages";
import type { Language } from "@/types/session";

export function FaqArticle({ language }: { language: Language }) {
  const { faq } = pageContent(language);
  // Marked up for search engines as a question-and-answer page, with the same text people read.
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.items.map(({ question, answer }) => ({
      "@type": "Question", name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };
  return <article className="prose">
    <h1>{faq.title}<br /><em>{faq.titleEm}</em></h1>
    <p className="lede">{faq.lede}</p>
    <div className="faq">
      {faq.items.map(({ question, answer }) => <section key={question}>
        <h2>{question}</h2>
        <p>{answer}</p>
      </section>)}
    </div>
    <p className="prose-cta"><Link className="primary-button" href={homePath(language)}>{faq.cta}</Link></p>
    <p className="prose-note">{faq.noteBefore} <Link href={pagePath("about", language)}>{faq.noteLink}</Link>.</p>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
  </article>;
}
