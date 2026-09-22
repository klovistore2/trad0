import Link from "next/link";
import { homePath } from "@/lib/i18n/home-metadata";
import type { Language } from "@/types/session";

// One English text, reachable from every language's address: links keep the reader's prefix.
export function AboutArticle({ language }: { language: Language }) {
  const prefix = language === "en" ? "" : `/${language}`;
  return <article className="prose">
      <h1>Two people.<br /><em>One conversation.</em></h1>
      <p className="lede">
        Trad0 is a live voice translator for people who are standing right in front of each other.
        You speak the way you always do. The other person reads your words in their language and
        hears them out loud, a moment later — on their own phone.
      </p>

      <h2>Made for the conversations that actually happen</h2>
      <p>
        A market stall. A pharmacy counter. A landlord, a taxi driver, a nurse, your partner’s family.
        These are not moments for typing into a translation box and turning the screen around.
        They are moments where you want to talk, be understood, and get an answer back.
      </p>
      <p>
        That is the whole idea behind Trad0: take the language out of the way and leave the
        conversation. No sentence to prepare, no phrasebook, no guessing whether you were polite.
      </p>

      <h2>How it works</h2>
      <ol className="steps">
        <li><strong>Choose the language you want to be understood in.</strong> One short menu on the home page — the language the other person speaks.</li>
        <li><strong>Hand them the link, or let them scan the code.</strong> It opens in their phone’s browser. There is nothing to download and nothing to set up.</li>
        <li><strong>Talk.</strong> One person speaks at a time, exactly like a real conversation. Your words appear translated on their screen and are spoken out loud.</li>
        <li><strong>Answer back.</strong> They take their turn, and it works the same way in the other direction.</li>
      </ol>
      <p>
        Your own language does not need to be declared in advance. Trad0 listens to the first thing
        you say and sets it for you — and you can always correct it from the menu during the
        conversation.
      </p>

      <h2>It can sound like you</h2>
      <p>
        A translated voice usually sounds like a machine reading a label. Trad0 can do better: with
        your agreement, it can learn your voice from the conversation itself, so the other person
        hears your translated words in something that sounds like you — your pace, your register.
        It is optional, always your choice, and the conversation works perfectly well without it.
      </p>

      <h2>Meaning, not word-for-word</h2>
      <p>
        A good translation keeps the intention, not just the vocabulary. Trad0 follows the thread of
        what has already been said, so names, numbers and the tone of a sentence survive the trip to
        the other language — whether you are being formal, joking, or in a hurry.
      </p>

      <h2>Temporary by design</h2>
      <p>
        A conversation is not a document. What you say is used to carry the exchange, then it goes:
        a conversation ends when you close it, and expires on its own after an hour. There is no
        thread to scroll back through the next morning, because there does not need to be.
      </p>

      <h2>Fifteen languages, one gesture</h2>
      <p>
        English, French, Thai, Spanish, Portuguese, Italian, German, Dutch, Japanese, Korean,
        Chinese, Russian, Hindi, Indonesian and Vietnamese. Pick the one in front of you and start.
      </p>

      <p className="prose-cta">
        <Link className="primary-button" href={homePath(language)}>Start a conversation</Link>
      </p>
      <p className="prose-note">Still wondering about something? <Link href={`${prefix}/faq`}>Read the FAQ</Link>.</p>
    </article>;
}
