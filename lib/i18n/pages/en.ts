import type { PageContent } from "./types";

export const en: PageContent = {
  about: {
    metaTitle: "About Trad0 · Live voice translation for two people",
    metaDescription: "Trad0 translates a face-to-face conversation out loud, in real time. Two phones, two languages, nothing to install — you speak, the other person hears you in their own language.",
    title: "Two people.", titleEm: "One conversation.",
    lede: "Trad0 is a live voice translator for people who are standing right in front of each other. You speak the way you always do. The other person reads your words in their language and hears them out loud, a moment later — on their own phone.",
    purpose: {
      heading: "Made for the conversations that actually happen",
      paragraphs: [
        "A market stall. A pharmacy counter. A landlord, a taxi driver, a nurse, your partner’s family. These are not moments for typing into a translation box and turning the screen around. They are moments where you want to talk, be understood, and get an answer back.",
        "That is the whole idea behind Trad0: take the language out of the way and leave the conversation. No sentence to prepare, no phrasebook, no guessing whether you were polite.",
      ],
    },
    stepsHeading: "How it works",
    steps: [
      { lead: "Choose the language you want to be understood in.", text: "One short menu on the home page — the language the other person speaks." },
      { lead: "Hand them the link, or let them scan the code.", text: "It opens in their phone’s browser. There is nothing to download and nothing to set up." },
      { lead: "Talk.", text: "One person speaks at a time, exactly like a real conversation. Your words appear translated on their screen and are spoken out loud." },
      { lead: "Answer back.", text: "They take their turn, and it works the same way in the other direction." },
    ],
    stepsNote: "Your own language does not need to be declared in advance. Trad0 listens to the first thing you say and sets it for you — and you can always correct it from the menu during the conversation.",
    sections: [
      {
        heading: "It can sound like you",
        paragraphs: ["A translated voice usually sounds like a machine reading a label. Trad0 can do better: with your agreement, it can learn your voice from the conversation itself, so the other person hears your translated words in something that sounds like you — your pace, your register. It is optional, always your choice, and the conversation works perfectly well without it."],
      },
      {
        heading: "Meaning, not word-for-word",
        paragraphs: ["A good translation keeps the intention, not just the vocabulary. Trad0 follows the thread of what has already been said, so names, numbers and the tone of a sentence survive the trip to the other language — whether you are being formal, joking, or in a hurry."],
      },
      {
        heading: "Temporary by design",
        paragraphs: ["A conversation is not a document. What you say is used to carry the exchange, then it goes: a conversation ends when you close it, and expires on its own after an hour. There is no thread to scroll back through the next morning, because there does not need to be."],
      },
      {
        heading: "Fifteen languages, one gesture",
        paragraphs: ["English, French, Thai, Spanish, Portuguese, Italian, German, Dutch, Japanese, Korean, Chinese, Russian, Hindi, Indonesian and Vietnamese. Pick the one in front of you and start."],
      },
    ],
    cta: "Start a conversation",
    noteBefore: "Still wondering about something?", noteLink: "Read the FAQ",
  },
  faq: {
    metaTitle: "FAQ · How Trad0 translates a live conversation",
    metaDescription: "Answers about Trad0: no app to install, nothing for your guest to sign up for, how two phones take turns, which languages are supported, and what happens to what you say.",
    title: "Questions,", titleEm: "answered.",
    lede: "Everything people usually ask before handing their phone to a stranger and starting to talk.",
    items: [
      { question: "Do I need to install an app?", answer: "No. Trad0 opens in the web browser your phone already has. You open a page, and you can talk." },
      { question: "Does the person I am talking to need to sign up?", answer: "No. They open the link you send them — or scan the code on your screen — and they are in the conversation. Nothing to create, nothing to accept, nothing to install." },
      { question: "Which languages can I use?", answer: "English, French, Thai, Spanish, Portuguese, Italian, German, Dutch, Japanese, Korean, Chinese, Russian, Hindi, Indonesian and Vietnamese, in both directions." },
      { question: "Do I have to tell it which language I speak?", answer: "Only the language you want to be understood in. Your own language is picked up from the first thing you say, and the menu shows it once it has heard you. If it gets it wrong, choose the right one and it switches straight away." },
      { question: "How do we avoid talking over each other?", answer: "One person holds the turn at a time, the way a real conversation works anyway. You tap to speak, and tap again when you are done; the other person can take the turn when they want to answer." },
      { question: "Do we need headphones?", answer: "No. The translation is spoken out loud by the phone, and it is written on screen at the same time — so a noisy street or a quiet waiting room both work." },
      { question: "Can the other person hear my own voice?", answer: "If you want them to. Trad0 can learn your voice from the conversation and use it to speak your translated words, so the exchange sounds like two people rather than two machines. It only happens if you agree to it, and you can turn it off or remove your voice at any time." },
      { question: "Can three or four people join?", answer: "Not for now. Trad0 is built for two people face to face, and everything in it — the turns, the timing, the voices — is tuned for that." },
      { question: "Does it work without internet?", answer: "No. Both phones need a connection, on mobile data or Wi-Fi. A weak connection mostly costs you a little delay." },
      { question: "What happens to what we say?", answer: "It carries the conversation, and then it goes. Nothing is kept for you to read later: the exchange is cleared when you end it, and expires by itself after an hour. Your voice, if you chose to create one, stays with your account until you delete it." },
      { question: "How accurate is the translation?", answer: "It aims at meaning rather than word-for-word, and it keeps track of what has already been said, so names, numbers and tone usually come through. It is very good for everyday conversation; for a contract or a medical decision, use a human translator." },
      { question: "Why do I have to sign in to start one?", answer: "Only the person who opens the conversation signs in, and it is what lets Trad0 keep their voice from one conversation to the next. The person invited never has to." },
    ],
    cta: "Start a conversation",
    noteBefore: "More about the idea behind it on the", noteLink: "about page",
  },
};
