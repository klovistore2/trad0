# À deux — v0

Premier jalon : un navigateur capture la voix et affiche progressivement la traduction thaïe. Interface mobile, sans compte. Next.js App Router, React, TypeScript strict.

## Démarrer

```sh
npm install
cp .env.example .env.local
npm run dev
```

Ouvrir http://localhost:3000. Le bouton **Essayer une démonstration** fonctionne sans clé, sans micro et sans appel fournisseur : il déroule un exemple préécrit clairement identifié.

Pour la traduction réelle, renseigner dans `.env.local` :

```dotenv
OPENAI_API_KEY=...
OPENAI_REALTIME_TRANSLATION_MODEL=gpt-realtime-translate
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

La clé doit avoir accès au modèle configuré. Redémarrer le serveur après modification. Cliquer **Commencer à parler**, autoriser le microphone, puis parler français. La langue source est gérée par le modèle ; l’interface ne prétend pas afficher une détection qu’elle n’a pas reçue.

## Sur un téléphone

Déployer sur une URL HTTPS (par exemple une preview Vercel), définir `NEXT_PUBLIC_APP_URL` à cette origine exacte et configurer les deux variables OpenAI côté serveur. Une adresse réseau locale en HTTP ne permet pas l’accès au micro sur téléphone. Ne pas mettre la clé permanente dans une variable `NEXT_PUBLIC_`.

## Pipeline

- `POST /api/openai/realtime-token` crée un jeton éphémère via `/v1/realtime/translations/client_secrets`, avec modèle configurable et langue cible validée.
- Le navigateur négocie WebRTC directement via `/v1/realtime/translations/calls` et y envoie la piste micro.
- L’adaptateur traduit les événements `session.output_transcript.delta` et `session.input_transcript.delta` en événements applicatifs. Le texte original est accessible à la demande.
- Arrêt, annulation, erreur, onglet masqué et démontage libèrent micro et connexion. Une permission accordée après annulation ne garde pas le micro ouvert.
- Aucun audio ni texte n’est enregistré par l’application. L’audio est transmis à OpenAI pour traitement. Le texte reste en mémoire et son affichage est limité aux 12 000 derniers caractères.

L’API dédiée est continue, sans `response.create`. Elle produit également de l’audio ; la v0 ne le joue pas encore. Le coût fournisseur peut donc comprendre cette génération. Source : [documentation officielle Realtime Translation](https://developers.openai.com/api/docs/guides/realtime-translation), consultée le 19 septembre 2026.

## Validation

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Tests Node.js 22.18+ : événements fournisseur, validation de la route, contrat de création de session, protection des secrets et erreurs réseau. Les appels fournisseur y sont simulés. Dans un environnement qui interdit les sous-processus, lancer `node --test --test-isolation=none tests/*.test.mjs` (Node.js 24) pour exécuter les huit tests dans le processus courant.

Validation de développement : lint, TypeScript et huit tests réussis. Le build de production n’a pas pu être validé dans le sandbox : Turbopack ne peut pas ouvrir son port local ; le fallback Webpack est également bloqué au lancement du sous-processus TypeScript (`EPERM`). Relancer `npm run build` dans un environnement normal.

À valider avec clé réelle avant le jalon 2 :

1. iPhone Safari et Android Chrome : autoriser le micro, dire plusieurs phrases françaises, vérifier le thaï avec une personne compétente.
2. Vérifier la progression du texte, la latence, le silence et le bruit ambiant.
3. Refuser le micro, annuler pendant l’autorisation, couper le réseau, réessayer.
4. Arrêter ou masquer l’onglet : vérifier que l’indicateur micro s’éteint.

## État et limites

Intégration du jalon 1 implémentée ; validation réelle fournisseur et téléphone encore nécessaire. Aucun secret n’était disponible lors du développement. Ne pas considérer la démonstration comme une validation de traduction.

L’API documentée ne fournit pas de score de confiance calibré dans ces deltas : `quality: "unknown"` est explicite dans le contrat. Aucun score n’est inventé. Les sorties douteuses et la qualité français → thaï restent à évaluer en conditions réelles.

Avant une ouverture publique, ajouter une limitation de débit distribuée et un budget fournisseur : le contrôle d’origine de la route évite les appels intersites ordinaires, mais ne remplace pas une protection contre l’abus d’un endpoint invité.

Les étapes suivantes (audio, deux téléphones / Neon / QR, ElevenLabs, clonage consenti, saisie texte) attendent la validation du flux réel du premier jalon.

## Base de données : Neon

Le choix de base de données est désormais Neon PostgreSQL. Placer la chaîne de connexion dans `DATABASE_URL`, côté serveur uniquement. La v0 n’utilise pas encore de base de données : aucune migration ni connexion Neon n’est implémentée à ce stade. Les variables `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` ne sont pas utilisées et peuvent être retirées.

Pour le jalon à deux téléphones, il faudra ajouter le schéma des sessions et choisir le transport des événements en direct ; `DATABASE_URL` seule ne remplace pas le transport Supabase Realtime prévu initialement.
# trad0
