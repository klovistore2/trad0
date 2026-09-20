# À deux

Traduction face à face, sans compte, dans le navigateur. Français → anglais pour les essais actuels ; le deuxième participant traduit en sens inverse. Next.js App Router, React, TypeScript strict, OpenAI Realtime Translation, Neon et ElevenLabs.

## Démarrer

```sh
npm install
cp .env.example .env.local  # seulement si vous n’avez pas déjà de .env configuré
npm run db:migrate
npm run dev
```

Variables serveur :

- `OPENAI_API_KEY` et `OPENAI_REALTIME_TRANSLATION_MODEL=gpt-realtime-translate`.
- `ELEVENLABS_API_KEY` et `ELEVENLABS_TTS_MODEL=eleven_flash_v2_5`. `eleven_v3_conversational` n’a pas fonctionné dans le test de cette intégration.
- `ELEVENLABS_FALLBACK_VOICE_ID` facultatif. Sinon l’application sélectionne une voix standard du compte.
- `DATABASE_URL` : connexion Neon. Les migrations additives créent seulement les tables `adu_sessions`, `adu_participants`, `adu_events`, plus les colonnes `adu_sessions.floor_slot` (tour de parole), `adu_participants.voice_range` (registre détecté) et `adu_participants.voice_tier` (palier de clonage). `npm run db:migrate` rejoue l’ensemble du dossier `migrations/`, sans effet sur une base déjà à jour.
- `AUTH_SECRET` : clé de signature des sessions Auth.js, `openssl rand -base64 32`.
- `AUTH_GOOGLE_ID` et `AUTH_GOOGLE_SECRET` : identifiants OAuth Google, seule méthode de connexion.
- `CRON_SECRET` : secret aléatoire pour protéger la purge des voix. Obligatoire pour autoriser le clonage.
- `NEXT_PUBLIC_APP_URL` : origine exacte du site, par exemple `http://localhost:3000` en local.

Ne jamais exposer les clés permanentes ni `DATABASE_URL` dans une variable `NEXT_PUBLIC_`. Next.js charge `.env` ; `.env.local`, s’il existe, est prioritaire. Redémarrer le serveur après changement de configuration.

## Essayer seul

L'accueil n'ouvre aucun micro : une conversation demande deux appareils, et parler seul ne prouvait rien d'utile. Le bouton principal est donc **Parler à deux · inviter quelqu'un**.

**Essayer une démonstration** joue un exemple préécrit, sans microphone ni appel OpenAI. **Écouter en anglais** lit ensuite ce texte avec ElevenLabs : c'est le seul moyen de vérifier la synthèse vocale sans monter une session à deux.

## Compte

Créer une conversation demande un compte ; **rejoindre n'en demande jamais**. La personne que vous invitez scanne le QR et parle, sans rien créer.

Le compte sert à une seule chose : **conserver votre clone de voix d'une conversation à l'autre**. Sans lui, chaque session recréait un clone et consommait des crédits ElevenLabs pour rien. Le clone enregistré vit dans `adu_voice_profiles`, hors des tables de session, et n'est donc jamais emporté par la purge — seul **Ne plus utiliser ma voix** le supprime.

L'authentification est **Auth.js avec Google, et uniquement Google** : un seul appui, rien à retenir, rien à réinitialiser — ce qui compte sur un téléphone. Il n'existe aucun mot de passe dans l'application, donc aucune adresse à vérifier et aucune procédure de récupération à écrire.

Une identité Google est rattachée à une ligne de `adu_users` **par son adresse**, dès la première connexion. C'est cet identifiant qui porte la voix enregistrée, il doit donc rester stable.

`AUTH_SECRET`, `AUTH_GOOGLE_ID` et `AUTH_GOOGLE_SECRET` sont obligatoires. Sans les deux derniers, la page de connexion le dit au lieu d'afficher un écran vide.

### Configurer Google

Dans Google Cloud Console, **API et services → Identifiants → Créer un ID client OAuth → Application Web**. Ajouter une URI de redirection autorisée **par origine** :

```
http://localhost:3000/api/auth/callback/google
https://votre-domaine/api/auth/callback/google
```

Google n'accepte pas de joker : une URL de preview Vercel, qui change à chaque déploiement, ne peut pas être autorisée. Utiliser un domaine stable. Si l'écran de consentement est en mode test, s'ajouter comme utilisateur autorisé.

## À deux

1. Se connecter, puis cliquer **Parler à deux · inviter quelqu’un**.
2. Scanner le QR ou ouvrir le lien sur le second appareil.
3. Chaque participant touche **Commencer à parler** / **Start talking**. Micro, son et prise de parole s’activent dans le même geste — un seul appui suffit pour parler.

La lecture ne dépend pas du micro. Quelqu’un qui veut seulement écouter entend par défaut : le premier contact avec l’écran, **n’importe où dans la page**, arme la lecture. Les navigateurs interdisent tout son sans une interaction dans le document ; c’est la seule contrainte, et aucun bouton particulier n’a à être touché. **Son activé · toucher pour le texte seul** coupe la lecture si besoin.
4. Le créateur parle français : l’autre lit et entend l’anglais. La réponse en anglais apparaît et se lit en français chez le créateur.

Chaque appareil affiche principalement ce qu’il reçoit. Les paroles émises sont accessibles sous « Mes mots traduits ».

L’écran de conversation ne porte que la conversation : l’état du tour de parole, un seul bouton, et la bascule du son. Tout le reste — voix, lien d’invitation, diagnostic, fin de session — est dans les **paramètres**, derrière la roue dentée en haut de l’écran.

### Tour de parole

Deux téléphones dans la même pièce entendent tous les deux la personne qui parle. Un seul micro est donc ouvert à la fois : celui du participant qui **a la parole**.

**Au démarrage, personne ne l’a** et les deux micros sont fermés. C’est délibéré : un micro ouvert du mauvais côté capte la personne qui parle vers l’autre appareil, et lui renvoie ses propres mots présentés comme ceux de son interlocuteur. Un micro ouvert est donc toujours le résultat d’un geste explicite.

**Parler** / **Speak** ouvre son micro. **À moi de parler** / **Let me speak** le reprend à l’autre. **J’ai fini de parler** / **Done speaking** le rend, et la session revient à son état de repos, deux micros fermés. Le micro bascule des deux côtés en moins d’une seconde, le temps d’un cycle de scrutation. La prise de parole est unilatérale et n’a pas besoin d’être acceptée ; la base sérialise deux demandes simultanées, et la phrase en cours est publiée avant que le micro se ferme.

Le micro reste également fermé pendant la lecture d’une traduction, pour que le haut-parleur ne se fasse pas retraduire.

Le son est actif par défaut. **Son activé · toucher pour le texte seul** coupe la lecture et ne garde que les sous-titres, utile en réunion ou dans un lieu bruyant.

Pour tester sur un seul ordinateur, utiliser **deux profils de navigateur différents** ou une fenêtre privée : l’identité invitée est un cookie HttpOnly partagé entre les onglets d’un même profil. La session accepte exactement deux participants, y compris en cas de connexions simultanées.

Sur deux téléphones, utiliser une URL **HTTPS accessible aux deux appareils**, avec `NEXT_PUBLIC_APP_URL` correspondant. Un QR contenant localhost pointe vers le téléphone qui le scanne et ne permet pas de joindre le PC.

## Registre de voix et diagnostic

Avant qu'un clone existe, le destinataire entend une voix standard **choisie selon le registre du locuteur**. Le navigateur estime la fréquence fondamentale du micro pendant que son propriétaire a la parole, par autocorrélation normalisée, et en déduit `low` ou `high` après une trentaine de trames voisées. Seul ce mot quitte l'appareil : aucun audio n'est enregistré ni transmis pour cette mesure.

C'est une mesure de **hauteur de voix**, pas une affirmation sur la personne : des femmes ont une voix grave, des hommes une voix aiguë. Tant que rien n'est détecté, la voix reste neutre — le système ne devine pas. Côté ElevenLabs, la correspondance se fait sur le `labels.gender` de la voix elle-même, qui décrit la voix et non l'auditeur. `ELEVENLABS_VOICE_LOW` et `ELEVENLABS_VOICE_HIGH` permettent d'imposer un choix.

**Diagnostic voix et son**, dans les paramètres, est un panneau de développement qui montre : la voix réellement utilisée pour la dernière phrase entendue (clone ou voix standard et son registre), l'état de clonage des deux participants, le registre détecté avec sa médiane en hertz, l'état du contexte audio, le nombre de phrases reçues et la dernière panne audio. Le bouton **Jouer un bip de test** produit un son local, sans réseau : il sépare une coupure système d'une panne de la chaîne de lecture.

## Cloner sa voix

Le clonage est **progressif**.

Le choix est demandé **une seule fois**, dans une fenêtre à l'arrivée sur une conversation : utiliser sa voix, ou garder une voix standard. La réponse est mémorisée dans le navigateur et ne sera plus jamais redemandée, y compris dans les conversations suivantes. Le comportement est identique en développement et en production.

Si vous acceptez, le clonage part tout seul : rien d'autre à toucher. Si vous refusez, la voix standard adaptée à votre registre est utilisée. **Utiliser ma voix** dans les paramètres permet de revenir sur un refus, **Ne plus utiliser ma voix** sur un accord — les deux écrivent la même mémoire, donc la fenêtre ne réapparaît pas.

Rien n'est enregistré avant l'accord.

Ensuite l'application capte vos tours de parole pendant que vous parlez, et seulement eux : l'enregistreur est mis en pause par le même signal que le micro, donc ni les silences ni la voix de l'autre personne n'entrent dans l'échantillon. La durée retenue est la parole effective, pas le temps écoulé.

Deux paliers : un premier clone vers **30 secondes** de parole, une version affinée vers **150 secondes**, puis plus jamais. Le clone en service reste utilisé jusqu'à ce que le suivant soit créé et enregistré ; l'ancien n'est supprimé qu'après la bascule, jamais avant. Après le palier final, l'audio en mémoire est effacé.

L'échantillon vit uniquement dans la mémoire du navigateur, n'est jamais écrit dans Neon ni sur le disque de l'application, et part directement chez ElevenLabs au moment du clonage. Si le flux micro est recréé — retour d'arrière-plan, reprise — le conteneur en cours ne peut pas être prolongé : il est conservé entier comme segment et le clonage envoie plusieurs fichiers de la même voix.

**Ne plus utiliser ma voix** retire le consentement et supprime le clone. **Terminer la session et supprimer les voix**, au bas des paramètres, ferme la session pour les deux participants et supprime leurs clones. Une fermeture d'onglet n'équivaut pas à cette action : les sessions expirent au bout d'une heure et la purge prend le relais.

Si ElevenLabs exige une vérification, la voix standard reste utilisée.

**Le clonage instantané demande une offre ElevenLabs payante.** Sur l'offre gratuite, la synthèse vocale fonctionne mais la création de voix renvoie `paid_plan_required` et l'application reste sur la voix standard adaptée au registre. La cause exacte renvoyée par le fournisseur est écrite dans le log serveur en développement. Après un refus, l'application cesse de réessayer jusqu'à ce que l'accord soit redonné, pour ne pas renvoyer l'échantillon toutes les dix secondes.

La clé API doit porter les permissions `voices_read` et `voices_write` en plus de la synthèse.

### Purge obligatoire

En production Vercel, configurer `CRON_SECRET` et déployer `vercel.json` : la tâche `/api/cleanup` passe tous les jours à 03:00 UTC. Après expiration, un clone peut donc attendre la prochaine purge (jusqu’à environ 24 heures, hors panne). Les échecs restent réessayables ; surveiller les exécutions cron.

En **local**, Vercel Cron ne tourne pas. Utiliser le bouton de fin de session puis, si nécessaire :

```sh
npm run voices:cleanup
```

La purge retire les textes expirés et les voix connues. Elle recherche aussi les clones étiquetés pour cette application dont la création aurait terminé après un timeout. Les marqueurs de session restent temporairement pour permettre cette récupération, puis sont supprimés. Ne pas activer le clonage sur un déploiement sans tâche de purge opérationnelle.

## Architecture et limites actuelles

- OpenAI : jeton éphémère via `/v1/realtime/translations/client_secrets`, puis microphone directement en WebRTC vers `/v1/realtime/translations/calls`. Aucun `response.create`, aucun assistant visible.
- Neon : identité invitée hachée, deux places atomiques, expiration, transport de texte. Pas d’audio en base.
- `PeerTransport` : première implémentation par requêtes courtes toutes les 500 ms, avec publications groupées et identifiants idempotents. Neon ne remplace pas Supabase Realtime ; ce compromis augmente les requêtes et la latence. Un transport push pourra remplacer cet adaptateur sans changer les fournisseurs.
- ElevenLabs : la synthèse est **relayée par `/api/elevenlabs/speak`**, qui transmet le flux `audio/mpeg` sans jamais l’écrire ni le journaliser. Le navigateur ne contacte donc que cette origine, et la lecture se fait dans un élément `<audio>`.
- Ce choix remplace une WebSocket ouverte du navigateur vers `api.elevenlabs.io`, que proxys, VPN et extensions bloquent couramment — panne invisible côté serveur. Il coûte environ 700 ms de latence supplémentaire et évite Web Audio, dont la sortie est coupée par l’interrupteur silencieux d’un iPhone. La latence est un chantier identifié ; une lecture qui ne démarre pas n’en est pas un.
- Les phrases sont envoyées après ponctuation ou une pause d’environ une seconde. Les sous-titres arrivent avant l’audio.
- La voix choisie pour le destinataire est celle de **l’autre participant**, déterminée côté serveur. Aucun ID de clone arbitraire fourni par le client n’est accepté par la route de jeton.
- La route de synthèse est authentifiée par session et bornée à 4000 caractères, mais ne limite pas le débit. Avant une ouverture publique, ajouter limitation de débit distribuée, quotas et suivi des coûts. Le contrôle d’origine ne remplace pas une protection contre les abus.
- L’API de traduction ne fournit pas de confiance calibrée dans les événements utilisés : `quality: "unknown"` reste explicite.
- Le texte reçu est conservé temporairement en base pour la livraison, puis effacé à la fin de session ou par la purge. Les fournisseurs appliquent aussi leurs propres règles de conservation.
- Le clonage est implémenté et testé avec réponses simulées ; un essai réel nécessite l’enregistrement consenti de l’utilisateur. Safari/iPhone, Bluetooth, réseaux mobiles et qualité des clones restent à valider sur appareils physiques.
- La saisie texte de secours et les langues configurables dans l’interface restent des étapes suivantes.

## Vérification

```sh
npm run lint
npm run typecheck
node --test --test-isolation=none tests/*.test.mjs # Node.js 24 ; aucune API réelle
npm run build
npm run test:tts       # ElevenLabs réel, phrase synthétique ; petit coût TTS
npm run test:sessions  # Neon réel, données synthétiques supprimées en fin de test
TEST_BASE_URL=http://localhost:3000 npm run test:browser
```

Pour une instance isolée : `NEXT_TEST_BUILD=1 NEXT_PUBLIC_APP_URL=http://localhost:3100 npm run build`, puis `node scripts/browser-test-server.mjs`. Le serveur de test est arrêté automatiquement à la fin.

Le test navigateur utilise un serveur déjà lancé, Chromium installé avec `npx playwright install chromium`, deux profils isolés, Neon réel et des fournisseurs audio simulés. Aucun clonage réel n’y est déclenché.

Sources : [OpenAI Realtime Translation](https://developers.openai.com/api/docs/guides/realtime-translation), [ElevenLabs streaming](https://elevenlabs.io/docs/api-reference/text-to-speech/v-1-text-to-speech-voice-id-stream), [clonage instantané](https://elevenlabs.io/docs/api-reference/voices/ivc/create), documentation du pilote Neon installé. Consultées le 19 septembre 2026.

Validation effectuée : build de production, lint, TypeScript, 31 tests automatiques, test Neon réel et parcours Chromium à deux navigateurs réussis. Un test ElevenLabs réel sur une phrase synthétique a reçu son premier fragment audio en environ 950 ms ; cette mesure ponctuelle n’est pas une garantie de latence de conversation.
