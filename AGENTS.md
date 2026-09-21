<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Implementation status — read this before the specification below

The specification that follows is the product target and still holds. This section records what
is actually built and which decisions deliberately diverge from it. **Do not "restore" a spec
detail listed as a divergence without reading why it was changed** — several were paid for with
real failures on real devices.

### Built and verified

- **Milestones 1–4.** Microphone → OpenAI Realtime Translation over WebRTC (ephemeral token from
  `/api/openai/realtime-token`) → translated text → sent to the peer → spoken to the receiver.
- **Milestone 5.** Progressive cloning behind a one-time consent dialog, remembered across sessions. One `MediaRecorder` per
  microphone stream, paused by the same signal as the floor, so only the speaker's own turns are
  captured. Tiers at 30 s and 150 s of effective speech, then never again. The clone in service is
  replaced only once the new one is stored, and the old one deleted only after that swap.
- **Turn taking**, not in the specification below. Exactly one microphone open at a time. Starting
  the conversation claims the floor in the same tap, but **only when it is free**: a second person
  starting up while someone speaks must never take the microphone from them.
- **Vocal range detection**, not in the specification below. Picks a fitting standard voice
  before any clone exists.
- **Accounts (Auth.js, Google only, users in Neon)** for the person creating a conversation, so
  their voice clone is reused instead of rebuilt every session. `adu_voice_profiles` holds one
  saved voice per account, outside the session tables the purge wipes.
- **Interface languages.** The site is English by default; the conversation screen renders in
  **each participant's own language**, so the guest reads it without configuring anything.
  Strings live in `lib/i18n/strings.ts`, English is the base and a missing key falls back to it.
  The other thirteen languages are translated but **unreviewed**. Settings and diagnostics are
  English only on purpose: they address whoever runs the app, not the guest.
- **Settings panel** behind a gear in the top bar. The conversation screen carries only the floor
  state, one button and the sound toggle; voice, invite, diagnostics and session closing live in
  settings. The browser flow asserts that none of them leak back onto the conversation screen.

### Deliberate divergences from the specification below

| Specification | Actual | Why |
| --- | --- | --- |
| Supabase for database, auth and Realtime | Neon PostgreSQL, anonymous guest identity in an HttpOnly cookie, transport by short polling every 500 ms | Chosen at the first implementation. The `PeerTransport` abstraction is intact, so a push transport can replace the adapter without touching providers. |
| `src/` directory | Flat `app/`, `components/`, `lib/`, `hooks/`, `types/` | Cosmetic; not worth a migration. |
| ElevenLabs single-use client token, browser connects directly | Server relay: `POST /api/elevenlabs/speak` streams `audio/mpeg` through, played in an `<audio>` element | **The browser WebSocket to `api.elevenlabs.io` was refused on a real user's machine while the identical request succeeded from Node on that same machine** — the proxy / VPN / extension class of failure, invisible server-side. The relay also escapes an iPhone's silent switch, which mutes Web Audio but not media playback. Costs roughly 700 ms of added latency. |
| "Do NOT design the core audio pipeline around a long-running Vercel serverless request" | The relay above is a serverless request | A sentence-length relay lasts about 1.5 s, `maxDuration` 30. Accepted knowingly: playback that never starts is worse than playback that is slower. |
| Both participants speak freely | Explicit floor; nobody holds it by default | Two phones in one room both hear whoever speaks. Worse, a microphone open on the wrong side captures the person speaking at the *other* device and returns their own words to them as if the other person had said them. A microphone is now only ever opened by a deliberate tap. |
| "No mandatory account. A first conversation must work as guest ↔ guest" | The **creator** signs in; the invited person never does | A guest clone is thrown away with its session, so every conversation rebuilt one and burned provider credits and voice slots. The scan-and-talk promise is preserved for the person being invited, which is the half that matters for a stranger. The cost is real and deliberate: the creator no longer reaches a first conversation without an account. |
| Detect the speaker's language automatically | The creator **picks** the other person's language on the home page; their own stays `fr` | Detection is still not implemented. The picker was added to make the limitation below testable. |

### Not built

- **Milestone 6**, text input fallback.
- **Automatic language detection.** The other person's language is now chosen from a picker on the
  home page and carried on `adu_sessions.peer_language`; the creator's own language is still `fr`.
- **French → Thai, the project's primary use case, is probably impossible with this model.**
  `gpt-realtime-translate` documents **13 output languages** — Spanish, Portuguese, French,
  Japanese, Russian, Chinese, German, Korean, Hindi, Indonesian, Vietnamese, Italian, English —
  and **Thai is not among them**. Thai appears only in the 70+ *input* languages, so Thai → French
  should work while French → Thai should not. Creating a session with `language: "th"` is accepted
  by the API, so the restriction is not enforced at session creation and proves nothing; only real
  speech will show what comes out. Thai is therefore kept selectable and marked "à tester" in the
  picker. If it is confirmed impossible, that direction needs a different pipeline — realtime
  transcription, a text translation, then TTS — which is slower and is a separate design.
- **Manual correction of the detected vocal range.** The specification requires every detected
  value to be correctable; this one is not yet. Fix this before any non-developer uses the app.
- **Push transport.** Still 500 ms polling.
- **Real device testing.** Nothing has run on a physical iPhone or Android, nor on a mobile network.
  Background audio on a locked iPhone is known not to work: iOS suspends the audio context.
- `quality` is always `"unknown"`; the translation API exposes no calibrated confidence.
- **The translation model takes no instructions, prompt or conversation context.** Verified against
  the current guide and cookbook, which state it "does not support custom prompting". Do not plan
  around feeding it history: any added intelligence belongs in the application. `session.audio`
  does accept `input.transcription` (enabled, it is what produces source transcripts) and
  `input.noise_reduction` (`near_field` / `far_field`, left off, commented in the token route).
- **Echoed and duplicated speech, and the conversation memory that would catch it.** Known, left
  for later: an edge case people notice by themselves. While A holds the floor, B's loudspeaker
  plays A's translated sentence, A's open microphone picks it up, and A's session transcribes it,
  "translates" it into the language it is already in and sends it back — an attenuating loop that
  pollutes the transcript and burns credits. `echoCancellation` cannot help: it only knows sound
  emitted by the same device, and B's speaker is an outside source to A's microphone. With an
  earbud the acoustic path does not exist at all, which is one more reason the specification calls
  the earbud a major target use case.

  **Do not treat this as a microphone problem.** Closing microphones is the workaround already in
  place, not the goal; the product owner's intent is that **no microphone ever has to be closed**.
  The real problem is that a sentence *already seen* re-enters the pipeline, which is a question of
  memory. The specification already asks for conversation context — recent turns plus a small
  rolling summary — for translation quality. That same memory is what recognises a duplicate, so
  one structure serves both purposes. Each device already knows the whole conversation: what it
  said and what it received.

  An echo always comes back in the **target** language, so it matches what the device **sent**, not
  what it said; the mirror case, a microphone capturing the person speaking at the other device,
  matches what it **said**. Comparing each outgoing turn against both histories catches both,
  deterministically and for free. **With reliable de-duplication the floor becomes unnecessary**,
  which is the goal — but build the replacement first and retire the floor only once it is proven
  on real devices: a missed duplicate speaks a sentence twice, which is worse than a closed
  microphone.

  Cheap string comparison handles a clean echo. It cannot handle a **partial** echo, where the
  microphone catches the tail of the translated sentence mixed into the start of the next real one;
  there the fragment must be stripped and the rest kept. That is where a model earns its place —
  but gate it behind the cheap detector so it only runs on a partial match, never on a normal turn.
  The pipeline is already too slow to afford an unconditional hop.

### Invariants — do not break these

- `OPENAI_API_KEY`, `ELEVENLABS_API_KEY` and `DATABASE_URL` never reach the client bundle.
- **No audio is ever written to disk or to the database.** Clone samples stream through server
  memory to ElevenLabs. Vocal range detection transmits only the word `low` or `high`.
- `adu_events` holds text only, erased at session end or by the purge.
- `CRON_SECRET` must be set before cloning is allowed, because expired clones need the purge.
- **Instant voice cloning needs a paid ElevenLabs plan.** A free key synthesises speech but answers
  `paid_plan_required` to `/v1/voices/add`, so everything except cloning works. Provider refusals
  are logged in development: never swallow the provider's own explanation again.
- A voice saved to an account is **never** deleted by a session ending or by the purge. Session
  clones are labelled `a-deux-session` and swept by session id; account clones are labelled
  `a-deux-user` and only the account can remove them. Any new deletion path must keep that split.
- Cloning consent is asked **once**, in a dialog on arrival, and the answer is remembered in
  `localStorage` for a guest and on the account profile for a signed-in creator. The behaviour is identical in development and
  production: an environment-dependent consent rule was tried and removed, because a feature that
  behaves differently in dev than in prod is the kind of thing that hides bugs until release.
  Settings and the dialog write the same memory, and withdrawing records a refusal rather than
  forgetting — forgetting would reopen the dialog on top of the app.
- `/api/elevenlabs/speak` resolves the voice **server-side** from the peer's row. A client-supplied
  voice ID is never accepted.
- **Playback must not depend on the microphone session.** Someone who only wants to listen hears
  without starting a microphone. This was a real bug: text arrived, sound did not, silently.
- **Any single touch anywhere in the page arms playback.** Autoplay rules require one gesture in the
  document; never require a *specific* button, and never require one per sentence.
- A dropped status poll must never end a conversation. Only 401 / 403 / 404 are final.

### Remaining work, in agreed order

1. **Ergonomics — done.** One button per state, sound on by default, explicit floor.
2. **Progressive cloning — done.** Two traps worth keeping in mind if you touch it: never build a
   sample by concatenating the output of *separate* `MediaRecorder` runs — each carries its own
   container header and the result is silently truncated, so completed recordings are kept whole and
   sent as several files; and never delete the clone in service before the replacement has been
   stored. The speech clock runs on transcript fragments, not on an open microphone: holding the
   floor in silence must never advance a tier, which it did once the start button began claiming
   the floor. Transcript *length* as a quality filter is still not wired.
3. **Accounts — done.** Creator only, **Google and nothing else**. There is no password anywhere,
   so there is no address to verify and no reset flow to write. A Google identity is mapped onto a
   row of `adu_users` by e-mail on first sign in, because the saved voice hangs off that id — keep
   that mapping stable or saved voices are orphaned. A password fallback was added and removed on
   request: do not reintroduce one to make testing easier. The browser flow seeds the exact session
   cookie Auth.js issues (`authjs.session-token`, encoded with `AUTH_SECRET`), so nothing exists in
   the application purely for tests.

4. **Latency — measured, and most of the guesses were wrong.** The diagnostics panel now reports
   transport, voice and total for the last sentence; the event age is computed by PostgreSQL so no
   two device clocks are ever compared. What measurement established:
   - **Sentence commit costs nothing.** 20 of 20 recent turns closed on punctuation, not on the
     1000 ms silence timer. Lowering that timer buys zero and only risks splitting sentences.
   - **ElevenLabs is not the bottleneck.** Warm HTTP is ~140 ms to first byte and ~260 ms complete
     for a full sentence. An earlier 1366 ms reading was a cold-connection artefact — first call of
     the process, paying DNS and TLS — and it was mistaken for generation time.
   - **A server-side WebSocket to ElevenLabs would gain nothing.** Measured head to head, warm HTTP
     matches or beats it. This was planned as the biggest lever and cancelled by measurement.
   - **A cloned voice is not slower than a standard one** (140 ms vs 160 ms to first byte).
   What is left, and still unmeasured in production: the 500 ms poll wait, and whether Vercel pays
   a cold connection to ElevenLabs on each invocation — which would reproduce that 1366 ms in
   production and make connection reuse, not protocol, the real lever. Get the numbers from a
   deployed conversation before building anything.

### Verification

```sh
npm run lint && npm run typecheck
node --test --test-isolation=none tests/*.test.mjs   # no real provider calls
npm run build
NEXT_TEST_BUILD=1 NEXT_PUBLIC_APP_URL=http://localhost:3100 npm run build
node scripts/browser-test-server.mjs                 # two Chromium profiles, real Neon, faked providers
```

`npm run test:tts` and `npm run test:sessions` call the real providers and cost a little credit.
The browser flow is the regression net for everything above: it asserts listener-only playback,
floor claim and release, playback across a hidden screen, and survival of a dropped poll.


Architecture cible
                       SESSION WEB
                  Olivier ↔ personne thaïe
                           │
               QR code / lien / Supabase
                           │

        ┌──────────────────┴──────────────────┐
        │                                     │
   téléphone A                           téléphone B
     Français                                ไทย
        │                                     │
       MIC                                   MIC
        │                                     │
        ▼                                     ▼
 OpenAI Realtime                       OpenAI Realtime
 Live Translation                     Live Translation
     FR → TH                               TH → FR
        │                                     │
        ├─ texte traduit                     ├─ texte traduit
        │                                     │
        ▼                                     ▼
 envoyé à B                              envoyé à A
        │                                     │
        ▼                                     ▼
 ElevenLabs                            ElevenLabs
 voice_id Olivier                     voice_id B
        │                                     │
        ▼                                     ▼
 texte TH + 🔊                       texte FR + 🔊
 voix Olivier                         voix de B



Project mission

Build an extremely simple, mobile-first, face-to-face AI translation web app.

The core use case is two people physically in front of each other who do not speak the same language.

Example:

Person A speaks French.
Person B speaks Thai.
A speaks naturally into their phone.
B immediately sees the translated Thai text and hears the translation spoken using A's cloned voice.
B replies naturally in Thai.
A sees the French translation and hears it using B's cloned voice.

The goal is NOT to build another Google Translate UI.

The goal is to make the translation layer almost disappear.

The user should feel:

I am speaking directly with this person, not operating a translator.

Product principles
1. Web first

This is a web application.

Do NOT require an App Store / Play Store installation.

The user opens a URL in Safari or Chrome.

The app should eventually be installable as a PWA / Add to Home Screen, but installation must NEVER be required.

Primary flow:

Open site
→ Start
→ choose the other person's language if necessary
→ show QR code / share link
→ second person joins
→ allow microphone
→ talk

Target:

The first translated conversation should be possible in less than approximately 10 seconds after opening the site.

2. Face-to-face only for MVP

Do NOT build:

video
video calls
remote audio calls
group calls
social feed
stories
file sharing
complex messaging
avatars
gamification

The MVP is specifically optimized for two people physically in the same place.

Each participant uses their own phone.

Optional headphones / one earbud may be used, but headphones must never be required.

3. No mandatory account

A first conversation must work as:

guest ↔ guest

No email.

No password.

No onboarding wizard.

No account creation before trying the product.

Use anonymous/guest identities.

After a successful conversation, we may later offer:

Add this person
Create profile
Save voice
Add to Home Screen

These features come AFTER the user has experienced the product.

4. Languages

The app should minimize language configuration.

Preferred UX:

They speak: ไทย 🇹🇭

The speaker's own language should be automatically detected when possible.

Do NOT initially force users to configure:

I speak: French
They speak: Thai

unless automatic detection proves unreliable.

Always provide a small way to correct the detected language.

Example:

Detected: Français ▾

For the first MVP, prioritize:

French ↔ Thai
English ↔ Thai

The architecture must support adding more languages later.

Do not hard-code translation logic specifically to Thai.

5. Conversation UX

The main conversation screen must be extremely minimal.

Conceptually:

┌──────────────────────────────┐
│            Ploy              │
│         ไทย ↔ FR             │
│                              │
│                              │
│   Je reviens demain matin.   │
│                              │
│       🔊 playing...          │
│                              │
│                              │
│ Write something...        🎙 │
└──────────────────────────────┘

Do not create a dashboard-like translator UI.

Avoid unnecessary controls.

Do not require pressing a Translate button.

The normal state should simply be:

listen
→ translate
→ play
→ listen
6. Audio and text are not separate modes

Input can be:

voice
OR
text

Output should normally be BOTH:

translated text
+
translated audio

This is important.

Users should never have to choose between a "voice mode" and a "text mode".

The text field is always available as a fallback.

Examples:

voice → translated text + translated cloned voice
text  → translated text + translated cloned voice

This allows the app to continue working in noisy environments or when speech recognition fails.

7. Original text

The translated text is the primary text shown.

The original transcription may be accessible with a tap, for example:

Je rentre vers minuit.

Show original
กลับประมาณเที่ยงคืน

Do not clutter the normal UI with both large blocks of text.

8. Speech recognition failure

Never confidently translate garbage.

If speech recognition is unreliable, prefer showing something similar to:

Didn't catch that.

Try again
Type instead

The exact threshold and UX can evolve.

The architecture should allow confidence / transcription quality metadata to influence whether a translation is automatically played.

Do not implement Jev yet.

Technical architecture
Frontend

Use:

Next.js
React
TypeScript
strict TypeScript
mobile-first CSS
Web Audio APIs
MediaDevices.getUserMedia()
MediaRecorder where useful

Use the current stable Next.js App Router.

Keep components small.

Prefer server components where appropriate, but the conversation UI will necessarily contain client components because of microphone, WebRTC, audio playback and realtime state.

Hosting

The Next.js application should be deployable to Vercel.

Do NOT design the core audio pipeline around a long-running Vercel serverless request.

Realtime audio should connect from the browser directly to realtime providers whenever safe and supported.

The Next.js backend should primarily handle:

session creation
join codes
temporary provider credentials
database operations
voice profile metadata
authentication
security
OpenAI realtime translation

Use the CURRENT official OpenAI realtime/live translation API intended for browser realtime audio.

Prefer WebRTC when the current official OpenAI API recommends WebRTC for browser applications.

Do NOT invent API names, event names, endpoints or model IDs.

Before implementing the OpenAI integration, consult the installed SDK types and/or current official OpenAI documentation.

Keep the model identifier configurable:

OPENAI_REALTIME_TRANSLATION_MODEL=

Never hard-code a model ID throughout the application.

Create a provider abstraction such as:

interface TranslationProvider {
  connect(config: TranslationSessionConfig): Promise<void>
  disconnect(): Promise<void>
  onOriginalTranscript(cb: (event: TranscriptEvent) => void): void
  onTranslatedText(cb: (event: TranslationEvent) => void): void
}

The implementation may change as the OpenAI realtime API evolves.

The rest of the app should not depend directly on OpenAI event names.

Translation philosophy

Translate meaning, intent and conversational style.

Do NOT optimize for literal word-by-word translation.

For example, Thai translations should sound natural to a Thai speaker.

Conversation context should be used where available.

Initially maintain:

recent turns
+
small rolling conversation summary if necessary

Do NOT implement a vector database for MVP.

Translation pipeline

Conceptually:

microphone
    ↓
OpenAI Realtime / Live Translation
    ↓
translated text stream
    ↓
send translated text to other participant
    ↓
ElevenLabs streaming TTS
    ↓
play translated cloned voice

The receiving browser should also display the translated text.

Avoid unnecessary serialization and server hops.

Optimize aggressively for latency.

Two participants

Each conversation contains exactly two participants for MVP.

Example state:

type Participant = {
  id: string
  displayName?: string
  language?: string
  detectedLanguage?: string
  voiceId?: string
  voiceStatus?: "none" | "learning" | "ready"
}

type ConversationSession = {
  id: string
  joinCode: string
  participantA?: Participant
  participantB?: Participant
  createdAt: string
}

Do not over-engineer the domain model.

Realtime synchronization between browsers

Use Supabase for the initial implementation unless there is a strong technical reason not to.

Supabase responsibilities may include:

anonymous auth
session state
participants
Realtime broadcast/presence
database

The realtime channel can initially transport lightweight events such as:

participant_joined
participant_left
language_detected
translation_delta
translation_committed
voice_ready
typing

Do NOT stream raw microphone audio through Supabase.

Only exchange lightweight state and translated text/events.

If latency later becomes a problem, the transport may be replaced with a direct WebRTC DataChannel without redesigning the rest of the application.

Therefore create a small transport abstraction.

Example:

interface PeerTransport {
  connect(sessionId: string): Promise<void>
  send(event: PeerEvent): Promise<void>
  subscribe(cb: (event: PeerEvent) => void): () => void
  disconnect(): Promise<void>
}
ElevenLabs

Use ElevenLabs for translated voice output.

The goal is for the receiver to hear the translation using the original speaker's voice.

Use the current official ElevenLabs streaming TTS API.

For latency-sensitive TTS, choose the current low-latency model recommended by ElevenLabs documentation.

Do not hard-code the model globally.

Use:

ELEVENLABS_TTS_MODEL=

Implement an abstraction such as:

interface VoiceProvider {
  speakStream(options: {
    textStream: AsyncIterable<string>
    voiceId: string
    language?: string
  }): Promise<AudioStream>

  createVoiceProfile?(
    samples: Blob[],
  ): Promise<{ voiceId: string }>
}

Never expose the permanent ElevenLabs API key in browser JavaScript.

If the current ElevenLabs API supports temporary/single-use client tokens, obtain them from a secure server route.

**Superseded — read the divergence table at the top before acting on the line above.** Single-use
tokens plus a browser WebSocket were implemented, then removed: the socket was refused in a real
user's browser while the same request succeeded from Node on that machine. Speech is relayed by
`POST /api/elevenlabs/speak` instead. Do not reintroduce a browser connection to `api.elevenlabs.io`
without a way to prove it survives proxies, VPNs and content blockers.

Voice cloning

Voice cloning is a key differentiator but must not block the initial conversation.

The intended progression is approximately:

start conversation
↓
collect clean voice samples
↓
voice profile learning
↓
create usable voice clone
↓
translated speech switches to cloned voice

While no clone exists, use an acceptable temporary/fallback voice or the realtime provider's normal audio output.

Once the clone is ready, use the cloned voice.

The UI may discreetly show:

Learning your voice…

but do not turn this into a complicated setup process.

Voice consent

Never clone a person's voice without explicit consent.

Before creating a voice clone, show a clear, short consent action.

Example concept:

Use my voice for translated speech

Allow for this session

Persistent storage of a voice profile should require a persistent user/profile and explicit consent.

Guest voice profiles should preferably be session-scoped unless the user chooses to save them later.

Do not expose voice provider API keys.

Do not make voice cloning silently automatic without consent.

Audio output

Normal output:

translated text
+
translated voice

Support normal phone speaker output.

Also support standard browser/Bluetooth audio routing when the OS/browser provides it.

Do not require AirPods or proprietary headphones.

A major target use case is:

one earbud
+
one free ear

The user hears:

real person's voice acoustically
+
translation in the earbud

Do not implement advanced audio routing until the basic conversation works.

Optional self-monitoring

Later, users may optionally hear their own translated sentence.

This must be OFF by default.

Never play a delayed version of a person's own voice while they are actively speaking because delayed auditory feedback can be disruptive.

If implemented, use an option such as:

Hear my translation:
Off
After sentence

This is not MVP-critical.

Session creation flow

Preferred creator flow:

/
↓
Start
↓
choose "They speak Thai" if needed
↓
create session
↓
QR code + share link

Join URL:

/join/[code]

The other user opens the URL.

No installation required.

No account required.

Join directly.

QR code

Generate a QR code for:

https://<domain>/join/<code>

The QR should be visually prominent.

Also provide:

Copy link
Share

Use the Web Share API when available.

Gracefully fall back to copy-to-clipboard.

PWA

The application should ultimately be installable to the home screen.

However:

PWA installation != onboarding requirement

Never show an install wall.

Only suggest installation after the user has already experienced the product.

Provide:

manifest
icons
standalone display support
mobile metadata

Do not spend excessive MVP time on offline functionality because realtime translation inherently requires network connectivity.

Database

Use Supabase/PostgreSQL.

Keep the schema small.

Likely initial entities:

sessions
session_participants
voice_profiles
conversation_turns
contacts (later)
profiles (later)

Avoid premature normalization.

Suggested initial database shape

Example concept only.

Adapt when implementation requires it.

sessions
- id
- join_code
- status
- created_at
- expires_at

session_participants
- id
- session_id
- user_id
- language
- detected_language
- voice_profile_id
- joined_at

voice_profiles
- id
- user_id nullable
- provider
- provider_voice_id
- status
- created_at

conversation_turns
- id
- session_id
- participant_id
- original_text
- translated_text
- source_language
- target_language
- created_at

Conversation turns may initially be ephemeral if storing them is not necessary.

Privacy should be preferred over unnecessary persistence.

Privacy

Do not persist raw microphone audio unless required for voice cloning and explicitly consented to.

Voice-cloning samples should be handled separately from conversation transcripts.

Keep secrets server-side.

Never expose:

OPENAI_API_KEY
ELEVENLABS_API_KEY
SUPABASE_SERVICE_ROLE_KEY

to the client.

Use temporary/ephemeral credentials when provider APIs support them.

Environment variables

Prepare .env.example.

Expected shape:

OPENAI_API_KEY=
OPENAI_REALTIME_TRANSLATION_MODEL=

ELEVENLABS_API_KEY=
ELEVENLABS_TTS_MODEL=

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

NEXT_PUBLIC_APP_URL=http://localhost:3000

Do not commit real secrets.

API routes

Use server routes only where necessary.

Possible endpoints:

POST /api/sessions
POST /api/sessions/[id]/join

POST /api/openai/realtime-token

POST /api/elevenlabs/token

POST /api/voice/clone

Exact provider token endpoint implementation must follow CURRENT official provider documentation.

Do not guess undocumented payloads.

Routes that actually exist:

```
POST   /api/sessions                      create a session
POST   /api/sessions/[id]/join            take the free slot, idempotent per guest
GET    /api/sessions/[id]                 presence, languages, clone status, floor
DELETE /api/sessions/[id]                 close the session and delete both clones
GET    /api/sessions/[id]/events          peer events since a cursor, plus the current floor
POST   /api/sessions/[id]/events          publish a subtitle or a committed sentence
POST   /api/sessions/[id]/floor           take the floor
DELETE /api/sessions/[id]/floor           release it, leaving both microphones closed
POST   /api/sessions/[id]/voice-range     record the detected vocal range, "low" or "high"
GET    /api/auth/[...nextauth]            Auth.js handlers (sign in, sign out, session)
POST   /api/openai/realtime-token         ephemeral OpenAI credential
POST   /api/elevenlabs/speak              relay speech as audio/mpeg (replaces the token route)
POST   /api/voice/consent                 record consent once per session, gates every tier
POST   /api/voice/clone                   create or replace a clone at a given tier
POST   /api/voice/prefer                  use the saved clone or the standard voice, without deleting
DELETE /api/voice                         delete one's own clone
GET    /api/cleanup                       scheduled purge, guarded by CRON_SECRET
```

The floor rides on the events poll rather than a channel of its own: `member()` already joins
`adu_sessions`, so reading it costs no extra query and no extra round trip.

Project structure

Prefer something close to:

src/
  app/
    page.tsx

    session/
      [id]/
        page.tsx

    join/
      [code]/
        page.tsx

    api/
      sessions/
      openai/
      elevenlabs/
      voice/

  components/
    conversation/
    audio/
    session/
    ui/

  lib/
    openai/
    elevenlabs/
    supabase/
    audio/
    translation/
    realtime/

  hooks/
    useMicrophone.ts
    useConversation.ts
    useTranslationSession.ts
    usePeerTransport.ts

  types/
    conversation.ts
    realtime.ts

Do not create unnecessary abstraction layers before they are needed.

State machine

Treat conversation state explicitly.

Example:

idle
↓
creating_session
↓
waiting_for_peer
↓
connecting
↓
ready
↓
listening
↓
translating
↓
playing

Also handle:

microphone_denied
provider_error
peer_disconnected
network_error

Do not allow UI state to become an uncontrolled collection of booleans.

UX error philosophy

Translate technical errors into simple user-facing actions.

Bad:

WebRTC ICE negotiation failure.

Good:

Connection lost.

Reconnect

Bad:

STT confidence below threshold.

Good:

I didn't catch that.

Try again
Type instead

Keep detailed errors in development logs.

Visual design

Mobile first.

Large touch targets.

Very little chrome.

No dashboard aesthetic.

No complex navigation during a conversation.

The conversation screen should feel closer to a call screen than to Google Translate.

The UI should not look like:

SOURCE LANGUAGE
TARGET LANGUAGE
SWAP
INPUT
TRANSLATION
TRANSLATE BUTTON
SETTINGS

Instead it should feel like:

Ploy

Je rentre demain matin.

🔊

Write something…      🎙
Important product metric

Design the app to minimize:

screen interactions per conversation

The ideal long-term conversation requires almost no touching of the phone.

Other useful metrics:

time to first translation
translation latency
join completion rate
conversation duration
speech recognition retry rate

Do not implement a heavy analytics platform during initial development.

MVP implementation order
Milestone 1

**Status: done** — French → English, not Thai; no language picker exists yet.

Single browser.

Implement:

microphone
→ OpenAI realtime translation
→ translated text

French → Thai.

Prove realtime translation works reliably.

Milestone 2

**Status: done.**

Add translated audio.

Initially allow provider/default voice output.

Validate:

speech
→ translated text
→ translated speech

Measure latency.

Milestone 3

**Status: done** — Neon polling rather than Supabase Realtime.

Two browsers.

Implement:

create session
QR code
join link
Supabase realtime
translated text sent to other participant

A speaks French.

B receives Thai text.

B speaks Thai.

A receives French text.

Milestone 4

**Status: done** — through the server relay, not a browser WebSocket. See the divergence table.

ElevenLabs streaming output.

The receiving browser converts incoming translated text to streaming speech.

Optimize end-to-end latency.

Milestone 5

**Status: done** — progressive, behind a one-time remembered consent dialog. Tiers at 30 s and 150 s of effective speech.

Voice cloning.

Collect explicitly consented clean audio samples.

Create speaker voice profiles.

Use:

A translated speech → A's voice
B translated speech → B's voice
Milestone 6

**Status: not started.**

Text input fallback.

Allow either participant to type.

Typed text goes through the same translation pipeline.

The receiver gets:

translated text
+
translated cloned audio
Milestone 7

**Status: partial** — no physical device has ever run this. Background audio on a locked iPhone is known broken.

Polish mobile UX.

Test:

Android Chrome
iPhone Safari
Bluetooth earbud
phone speaker
noisy environment
Wi-Fi
4G/5G

Fix microphone permission and audio playback edge cases.

Milestone 8

**Status: partial** — accounts and saved voices exist for the creator. Contacts and profiles do not.

Optional profiles / contacts.

Only after the anonymous conversation experience is excellent.

Allow users to save:

name
voice profile
preferred language
contacts
Explicit non-goals for current version

Do NOT implement Jev.

Do NOT implement vector search.

Do NOT implement RAG.

Do NOT implement video.

Do NOT implement remote calls.

Do NOT implement group conversations.

Do NOT implement native iOS/Android apps.

Do NOT implement complex social features.

Do NOT implement an AI chatbot.

Do NOT allow the AI to become a visible participant in the conversation.

The AI is infrastructure.

Quality bar

The core product promise is:

Speak normally.
Hear the other person naturally.
Forget the translator exists.

When deciding between adding a feature and reducing friction, reduce friction.

When deciding between a clever abstraction and lower latency, prefer lower latency.

When deciding between exposing AI functionality and hiding it, hide it.

The technology should feel invisible.

Development rules

Use TypeScript strict mode.

Prefer simple, readable code.

Run linting and type checking after meaningful changes.

Do not suppress TypeScript errors with any unless unavoidable and documented.

Do not expose secrets to client bundles.

Do not invent provider APIs.

Check current provider SDKs/documentation before implementing integrations.

Separate provider-specific code from application logic.

Keep the app runnable after each milestone.

Do not start future milestones until the current end-to-end flow works.

When something provider-specific cannot yet be implemented because credentials are unavailable, provide a clean mock adapter so the rest of the app can still run.

First task

Start by creating the minimal working project and Milestone 1.

The first end-to-end goal is:

Open the site on a phone
→ allow microphone
→ speak French
→ see a continuously updated Thai translation

Do not build accounts, contacts, voice cloning or advanced UI before this works.

After Milestone 1 works, proceed incrementally through the milestones above.
