import type { PageContent } from "./types";

export const fr: PageContent = {
  about: {
    metaTitle: "À propos de Trad0 · Traduction vocale en direct, à deux",
    metaDescription: "Trad0 traduit à voix haute une conversation en face à face, en temps réel. Deux téléphones, deux langues, rien à installer — vous parlez, l’autre personne vous entend dans sa langue.",
    title: "Deux personnes.", titleEm: "Une conversation.",
    lede: "Trad0 est un traducteur vocal en direct pour deux personnes qui se font face. Vous parlez comme vous parlez toujours. L’autre personne lit vos mots dans sa langue et les entend à voix haute, un instant plus tard — sur son propre téléphone.",
    purpose: {
      heading: "Pensé pour les conversations qui arrivent vraiment",
      paragraphs: [
        "Un étal de marché. Un comptoir de pharmacie. Un propriétaire, un chauffeur de taxi, une infirmière, la famille de votre conjoint. Ce ne sont pas des moments pour taper dans une boîte de traduction et retourner l’écran. Ce sont des moments où l’on veut parler, être compris, et obtenir une réponse.",
        "C’est toute l’idée de Trad0 : écarter la langue et laisser la conversation. Aucune phrase à préparer, aucun guide de conversation, aucun doute sur le fait d’avoir été poli.",
      ],
    },
    stepsHeading: "Comment ça marche",
    steps: [
      { lead: "Choisissez la langue dans laquelle vous voulez être compris.", text: "Un menu court sur la page d’accueil : la langue que parle l’autre personne." },
      { lead: "Donnez-lui le lien, ou laissez-la scanner le code.", text: "Cela s’ouvre dans le navigateur de son téléphone. Rien à télécharger, rien à configurer." },
      { lead: "Parlez.", text: "Une personne parle à la fois, exactement comme dans une vraie conversation. Vos mots apparaissent traduits sur son écran et sont dits à voix haute." },
      { lead: "Écoutez la réponse.", text: "Elle prend la parole à son tour, et cela fonctionne de la même façon dans l’autre sens." },
    ],
    stepsNote: "Votre propre langue n’a pas besoin d’être déclarée à l’avance. Trad0 écoute vos premiers mots et la règle pour vous — et vous pouvez toujours la corriger depuis le menu pendant la conversation.",
    sections: [
      {
        heading: "Cela peut ressembler à votre voix",
        paragraphs: ["Une voix traduite sonne d’habitude comme une machine qui lit une étiquette. Trad0 peut faire mieux : avec votre accord, il apprend votre voix à partir de la conversation elle-même, pour que l’autre personne entende vos mots traduits dans quelque chose qui vous ressemble — votre rythme, votre registre. C’est facultatif, c’est toujours votre choix, et la conversation fonctionne très bien sans."],
      },
      {
        heading: "Le sens, pas le mot à mot",
        paragraphs: ["Une bonne traduction garde l’intention, pas seulement le vocabulaire. Trad0 suit le fil de ce qui a déjà été dit : les noms, les nombres et le ton d’une phrase survivent au passage dans l’autre langue — que vous soyez formel, taquin ou pressé."],
      },
      {
        heading: "Éphémère par construction",
        paragraphs: ["Une conversation n’est pas un document. Ce que vous dites sert à porter l’échange, puis s’en va : une conversation se termine quand vous la fermez, et expire d’elle-même au bout d’une heure. Il n’y a pas de fil à relire le lendemain matin, parce qu’il n’y en a pas besoin."],
      },
      {
        heading: "Quinze langues, un seul geste",
        paragraphs: ["Anglais, français, thaï, espagnol, portugais, italien, allemand, néerlandais, japonais, coréen, chinois, russe, hindi, indonésien et vietnamien. Choisissez celle qui est en face de vous et commencez."],
      },
    ],
    cta: "Démarrer une conversation",
    noteBefore: "Une question en suspens ?", noteLink: "Lire la FAQ",
  },
  faq: {
    metaTitle: "FAQ · Comment Trad0 traduit une conversation en direct",
    metaDescription: "Les réponses sur Trad0 : aucune application à installer, rien à créer pour votre invité, comment les deux téléphones se passent la parole, les langues disponibles et ce que deviennent vos paroles.",
    title: "Vos questions,", titleEm: "nos réponses.",
    lede: "Tout ce que l’on se demande avant de tendre son téléphone à un inconnu et de commencer à parler.",
    items: [
      { question: "Faut-il installer une application ?", answer: "Non. Trad0 s’ouvre dans le navigateur que votre téléphone possède déjà. Vous ouvrez une page, et vous pouvez parler." },
      { question: "La personne en face doit-elle créer un compte ?", answer: "Non. Elle ouvre le lien que vous lui envoyez — ou scanne le code affiché sur votre écran — et elle est dans la conversation. Rien à créer, rien à accepter, rien à installer." },
      { question: "Quelles langues puis-je utiliser ?", answer: "Anglais, français, thaï, espagnol, portugais, italien, allemand, néerlandais, japonais, coréen, chinois, russe, hindi, indonésien et vietnamien, dans les deux sens." },
      { question: "Dois-je indiquer quelle langue je parle ?", answer: "Seulement la langue dans laquelle vous voulez être compris. La vôtre est reconnue à partir de vos premiers mots, et le menu l’affiche dès qu’elle a été entendue. Si elle est fausse, choisissez la bonne et cela change aussitôt." },
      { question: "Comment éviter de parler en même temps ?", answer: "Une personne a la parole à la fois, comme dans une vraie conversation de toute façon. Vous appuyez pour parler, puis de nouveau quand vous avez fini ; l’autre personne peut prendre la parole quand elle veut répondre." },
      { question: "Faut-il des écouteurs ?", answer: "Non. La traduction est dite à voix haute par le téléphone, et elle s’écrit en même temps à l’écran — une rue bruyante comme une salle d’attente silencieuse fonctionnent." },
      { question: "L’autre personne peut-elle entendre ma propre voix ?", answer: "Si vous le souhaitez. Trad0 peut apprendre votre voix pendant la conversation et l’utiliser pour dire vos mots traduits : l’échange sonne alors comme deux personnes plutôt que deux machines. Cela n’arrive qu’avec votre accord, et vous pouvez le désactiver ou supprimer votre voix à tout moment." },
      { question: "Peut-on être trois ou quatre ?", answer: "Pas pour l’instant. Trad0 est fait pour deux personnes en face à face, et tout y est réglé pour cela : les tours de parole, le rythme, les voix." },
      { question: "Cela fonctionne-t-il sans internet ?", answer: "Non. Les deux téléphones ont besoin d’une connexion, en données mobiles ou en Wi-Fi. Une connexion faible coûte surtout un peu de délai." },
      { question: "Que deviennent nos paroles ?", answer: "Elles portent la conversation, puis elles s’en vont. Rien n’est conservé pour être relu : l’échange est effacé quand vous le terminez, et expire de lui-même après une heure. Votre voix, si vous avez choisi d’en créer une, reste sur votre compte jusqu’à ce que vous la supprimiez." },
      { question: "La traduction est-elle fidèle ?", answer: "Elle vise le sens plutôt que le mot à mot, et elle garde en tête ce qui a déjà été dit : les noms, les nombres et le ton passent généralement bien. C’est très bon pour une conversation du quotidien ; pour un contrat ou une décision médicale, faites appel à un traducteur humain." },
      { question: "Pourquoi faut-il se connecter pour en démarrer une ?", answer: "Seule la personne qui ouvre la conversation se connecte, et c’est ce qui permet à Trad0 de garder sa voix d’une conversation à l’autre. La personne invitée n’a jamais à le faire." },
    ],
    cta: "Démarrer une conversation",
    noteBefore: "Plus sur l’idée derrière tout ça sur la", noteLink: "page à propos",
  },
};
