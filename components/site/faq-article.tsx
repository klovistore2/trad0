import Link from "next/link";
import { homePath } from "@/lib/i18n/home-metadata";
import type { Language } from "@/types/session";

// Plain answers to what people ask before trusting a translator with a real conversation.
const faq: { question: string; answer: string[] }[] = [
  {
    question: "Do I need to install an app?",
    answer: [
      "No. Trad0 opens in the web browser your phone already has. You open a page, and you can talk.",
    ],
  },
  {
    question: "Does the person I am talking to need to sign up?",
    answer: [
      "No. They open the link you send them — or scan the code on your screen — and they are in the conversation. Nothing to create, nothing to accept, nothing to install.",
    ],
  },
  {
    question: "Which languages can I use?",
    answer: [
      "English, French, Thai, Spanish, Portuguese, Italian, German, Dutch, Japanese, Korean, Chinese, Russian, Hindi, Indonesian and Vietnamese, in both directions.",
    ],
  },
  {
    question: "Do I have to tell it which language I speak?",
    answer: [
      "Only the language you want to be understood in. Your own language is picked up from the first thing you say, and the menu shows it once it has heard you. If it gets it wrong, choose the right one and it switches straight away.",
    ],
  },
  {
    question: "How do we avoid talking over each other?",
    answer: [
      "One person holds the turn at a time, the way a real conversation works anyway. You tap to speak, and tap again when you are done; the other person can take the turn when they want to answer.",
    ],
  },
  {
    question: "Do we need headphones?",
    answer: [
      "No. The translation is spoken out loud by the phone, and it is written on screen at the same time — so a noisy street or a quiet waiting room both work.",
    ],
  },
  {
    question: "Can the other person hear my own voice?",
    answer: [
      "If you want them to. Trad0 can learn your voice from the conversation and use it to speak your translated words, so the exchange sounds like two people rather than two machines. It only happens if you agree to it, and you can turn it off or remove your voice at any time.",
    ],
  },
  {
    question: "Can three or four people join?",
    answer: [
      "Not for now. Trad0 is built for two people face to face, and everything in it — the turns, the timing, the voices — is tuned for that.",
    ],
  },
  {
    question: "Does it work without internet?",
    answer: [
      "No. Both phones need a connection, on mobile data or Wi-Fi. A weak connection mostly costs you a little delay.",
    ],
  },
  {
    question: "What happens to what we say?",
    answer: [
      "It carries the conversation, and then it goes. Nothing is kept for you to read later: the exchange is cleared when you end it, and expires by itself after an hour. Your voice, if you chose to create one, stays with your account until you delete it.",
    ],
  },
  {
    question: "How accurate is the translation?",
    answer: [
      "It aims at meaning rather than word-for-word, and it keeps track of what has already been said, so names, numbers and tone usually come through. It is very good for everyday conversation; for a contract or a medical decision, use a human translator.",
    ],
  },
  {
    question: "Why do I have to sign in to start one?",
    answer: [
      "Only the person who opens the conversation signs in, and it is what lets Trad0 keep their voice from one conversation to the next. The person invited never has to.",
    ],
  },
];


export function FaqArticle({ language }: { language: Language }) {
  const prefix = language === "en" ? "" : `/${language}`;
  // Marked up for search engines as a question-and-answer page, with the same text people read.
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map(({ question, answer }) => ({
      "@type": "Question", name: question,
      acceptedAnswer: { "@type": "Answer", text: answer.join(" ") },
    })),
  };
  return     <article className="prose">
      <h1>Questions,<br /><em>answered.</em></h1>
      <p className="lede">
        Everything people usually ask before handing their phone to a stranger and starting to talk.
      </p>
      <div className="faq">
        {faq.map(({ question, answer }) =>
          <section key={question}>
            <h2>{question}</h2>
            {answer.map(line => <p key={line}>{line}</p>)}
          </section>)}
      </div>
      <p className="prose-cta"><Link className="primary-button" href={homePath(language)}>Start a conversation</Link></p>
      <p className="prose-note">More about the idea behind it on the <Link href={`${prefix}/about`}>about page</Link>.</p>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
    </article>;
}
