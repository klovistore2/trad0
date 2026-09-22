import Link from "next/link";
import { homePath } from "@/lib/i18n/home-metadata";
import { pagePath } from "@/lib/i18n/page-metadata";
import { pageContent } from "@/lib/i18n/pages";
import type { Language } from "@/types/session";

export function AboutArticle({ language }: { language: Language }) {
  const { about } = pageContent(language);
  return <article className="prose">
    <h1>{about.title}<br /><em>{about.titleEm}</em></h1>
    <p className="lede">{about.lede}</p>

    <h2>{about.purpose.heading}</h2>
    {about.purpose.paragraphs.map(text => <p key={text}>{text}</p>)}

    <h2>{about.stepsHeading}</h2>
    <ol className="steps">
      {about.steps.map(step => <li key={step.lead}><strong>{step.lead}</strong> {step.text}</li>)}
    </ol>
    <p>{about.stepsNote}</p>

    {about.sections.map(section => <section key={section.heading}>
      <h2>{section.heading}</h2>
      {section.paragraphs.map(text => <p key={text}>{text}</p>)}
    </section>)}

    <p className="prose-cta"><Link className="primary-button" href={homePath(language)}>{about.cta}</Link></p>
    <p className="prose-note">{about.noteBefore} <Link href={pagePath("faq", language)}>{about.noteLink}</Link>.</p>
  </article>;
}
