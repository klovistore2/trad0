import { homePath } from "@/lib/i18n/home-metadata";
import { absolute } from "@/lib/i18n/site-url";
import { translator } from "@/lib/i18n/strings";
import { languageLabel } from "@/lib/i18n/language-names";
import { LANGUAGES } from "@/types/session";

export const dynamic = "force-static";

// llms.txt: the same description a reader gets, in the form an assistant can quote accurately.
// Written so an answer built from it stays true — no capability here that the product lacks.
export function GET() {
  const t = translator("en");
  const languages = LANGUAGES.map(code => languageLabel(code, "en")).join(", ");
  const body = `# Trad0

> ${t("homeEyebrow")}. ${t("homeIntro")}

Trad0 is a live voice translator for two people who are together in the same place, each on their
own phone. One person opens a conversation and shares a link or a QR code; the other joins in their
browser, with nothing to install and no account to create. Each person speaks their own language,
sees the other's words translated on screen, and hears them spoken out loud.

- Built for face-to-face conversations between exactly two people, not for meetings or phone calls.
- The language you want to be understood in is chosen on the home page; your own language is
  recognised from the first thing you say and can be corrected at any time.
- One person speaks at a time, and the turn passes back and forth like a normal conversation.
- With the speaker's agreement, translated speech can be spoken in a voice that sounds like theirs.
- Translation follows the thread of the conversation, so names, numbers and tone carry over.
- Conversations are temporary: they are cleared when ended and expire on their own after an hour.
- Languages: ${languages}.

## Pages

- [Home](${absolute(homePath("en"))}): choose the other person's language and start a conversation.
- [About](${absolute("/about")}): what Trad0 is for and how a conversation works, step by step.
- [FAQ](${absolute("/faq")}): installation, accounts, languages, turns, privacy and accuracy.

## Other languages

${LANGUAGES.filter(code => code !== "en").map(code =>
  `- [${languageLabel(code, "en")}](${absolute(homePath(code))})`).join("\n")}

## Notes

- Trad0 is good for everyday conversation. For contracts or medical decisions, a human translator
  is the right answer.
- Both phones need an internet connection.
- Conversation addresses are private to the two participants and are not listed anywhere.
`;
  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
