// The reading pages, as data: one file per language, same shape everywhere. Anything a language
// has not translated falls back to English rather than leaving a hole in the page.
export type Section = { heading: string; paragraphs: string[] };
export type Step = { lead: string; text: string };

export type AboutContent = {
  metaTitle: string; metaDescription: string;
  title: string; titleEm: string; lede: string;
  purpose: Section;
  stepsHeading: string; steps: Step[]; stepsNote: string;
  sections: Section[];
  cta: string; noteBefore: string; noteLink: string;
};

export type FaqContent = {
  metaTitle: string; metaDescription: string;
  title: string; titleEm: string; lede: string;
  items: { question: string; answer: string }[];
  cta: string; noteBefore: string; noteLink: string;
};

export type PageContent = { about: AboutContent; faq: FaqContent };
