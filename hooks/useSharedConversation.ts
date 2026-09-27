"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslationSession } from "./useTranslationSession";
import { useLanguageDetection } from "./useLanguageDetection";
import { NeonPeerTransport } from "@/lib/realtime/neon-transport";
import { ConversationPipeline } from "@/lib/translation/conversation-pipeline";
import { desiredMode, modeForLanguage, supportsDirectOutput, type ConversationMode } from "@/lib/translation/modes";
import { PeerAudioLink } from "@/lib/realtime/audio-link";
import { SpeechClock } from "@/lib/audio/speech-clock";
import { ElevenLabsVoiceProvider } from "@/lib/elevenlabs/voice-provider";
import { VoiceRangeDetector } from "@/lib/audio/voice-range";
import { SpeechRecorder } from "@/lib/audio/speech-recorder";
import { ToneCapture } from "@/lib/audio/tone-capture";
import { ToneTracker } from "@/lib/audio/tone-analysis";
import { DEFAULT_SPEECH_OPTIONS, DEFAULT_TONE_TUNING, isSpeechOptions, isToneTuning, type SpeechOptions, type SpeechMetadata, type ToneTuning } from "@/lib/audio/speech-options";
import { FINAL_TIER, VOICE_CONSENT, cloneRefused, dueTier } from "@/lib/voice/consent";
import type { Language, ReceivedEvent, SharedSession } from "@/types/session";
import type { SpeechRequest, VoiceStatus } from "@/types/voice";
import type { StringKey } from "@/lib/i18n/strings";

// A cloning attempt that failed for a passing reason is tried again after a minute, then less often.
const CLONE_RETRY_MS = 60_000;
const MAX_CLONE_RETRY_MS = 600_000;
// A sentence older than this was said before the page loaded, or while the phone slept: it is
// shown, never spoken, so a reload does not replay the past aloud. Live delivery takes a second or two.
const STALE_SPEECH_MS = 20_000;

export function useSharedConversation(id: string, signedIn = false) {
  const [speechOptions, updateSpeechOptions] = useState<SpeechOptions>(() => {
    try { const saved = JSON.parse(localStorage.getItem("trad0-speech-options") || "null"); return isSpeechOptions(saved) ? saved : DEFAULT_SPEECH_OPTIONS; }
    catch { return DEFAULT_SPEECH_OPTIONS; }
  });
  const speechOptionsRef = useRef(speechOptions);
  // DEV sliders for tone, kept on this phone. Defaults are the settings validated by ear.
  const [toneTuning, updateToneTuning] = useState<ToneTuning>(() => {
    try { const saved = JSON.parse(localStorage.getItem("trad0-tone-tuning") || "null"); return isToneTuning(saved) ? saved : DEFAULT_TONE_TUNING; }
    catch { return DEFAULT_TONE_TUNING; }
  });
  const toneTuningRef = useRef(toneTuning);
  // Tone analysis is an account feature: a choice saved on this phone never applies to a guest.
  // Each sentence carries the voice tuning of the phone that spoke it.
  const activeSpeechOptions = useCallback((): SpeechOptions => {
    const { stability, style, minStrength } = toneTuningRef.current;
    return { ...speechOptionsRef.current, emotion: speechOptionsRef.current.emotion && !!roomRef.current?.me.hasAccount, voice: { stability, style, minStrength } };
  }, []);
  const toneCapture = useRef<ToneCapture | null>(null);
  const toneTracker = useRef<ToneTracker | null>(null);
  const incomingSpeech = useRef<SpeechMetadata | null>(null);
  const [room, setRoom] = useState<SharedSession | null>(null);
  const [ended, setEnded] = useState(false);
  // A key, shown in the reader's own language: no server or provider wording ever reaches the page.
  const [message, setMessage] = useState<StringKey | "">("");
  // Recent sentences from the other person, oldest first. The voice reads them in order and can
  // lag behind when they talk fast, so the one being read must stay on screen with the newer ones.
  const [incoming, setIncoming] = useState<{ turnId: string; text: string }[]>([]);
  const [speakingTurn, setSpeakingTurn] = useState<string | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [enabled, setEnabled] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [floor, setFloor] = useState<number | null>(null);
  const floorKnown = useRef(false);
  const [claiming, setClaiming] = useState(false);
  const [starting, setStarting] = useState(false);
  const [changingLanguage, setChangingLanguage] = useState(false);
  const changingLanguageRef = useRef(false);
  const refreshSequence = useRef(0);
  const [activeMode, setActiveMode] = useState<ConversationMode>("direct");
  const [contextTranslation, setContextTranslation] = useState("");
  const [spokenSeconds, setSpokenSeconds] = useState(0);
  const speechClock = useRef(new SpeechClock());
  const directAudio = useRef<PeerAudioLink | null>(null);
  const directUnavailable = useRef(false);
  const modeReason = useRef("");
  const remoteSpeaking = useRef(false);
  const sourceCommitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [received, setReceived] = useState(0);
  const [speechSeconds, setSpeechSeconds] = useState(0);
  const [connectionLost, setConnectionLost] = useState(false);
  const [soundReady, setSoundReady] = useState(false);
  const soundReadyRef = useRef(false);
  const rearm = useRef<() => void>(() => {});
  const detector = useRef<VoiceRangeDetector | null>(null);
  const recorder = useRef<SpeechRecorder | null>(null);
  const cloning = useRef(false);
  // A refusal that asking again cannot change stops automatic attempts until a new agreement;
  // anything else (network, busy lease, credits, outage) is tried again after a growing delay.
  const cloningBlocked = useRef(false);
  const cloneRetry = useRef({ at: 0, delay: CLONE_RETRY_MS });
  // Last sentence measured end to end, so every latency change can be judged on facts.
  const timing = useRef({ transport: 0, request: 0, playback: 0 });
  const refreshNow = useRef<() => void>(() => {});
  const stopped = useRef<"never started" | "running" | "paused by you" | "peer away" | "no credits" | "session ended">("never started");
  const transport = useRef<NeonPeerTransport | null>(null);
  const publisher = useRef<ConversationPipeline | null>(null);
  const voice = useRef<ElevenLabsVoiceProvider | null>(null);
  const running = useRef(false);
  const sound = useRef(true);
  const floorRef = useRef<number | null>(null);
  const queue = useRef<ReceivedEvent[]>([]);
  const speaking = useRef(false);
  const roomRef = useRef<SharedSession | null>(null);

  // The microphone is open only while this device holds the floor and nothing is playing.
  const micShouldBeOn = useCallback(
    () => running.current && floorRef.current === roomRef.current?.me.slot && !speaking.current && !remoteSpeaking.current,
    [],
  );
  const translation = useTranslationSession({
    sessionId: id,
    targetLanguage: room?.peer?.language || "en",
    onDelta: delta => { publisher.current?.translation(delta); },
    onOriginal: delta => {
      publisher.current?.original(delta);
      if (micShouldBeOn()) { speechClock.current.heard(); recorder.current?.heard(); }
      clearTimeout(sourceCommitTimer.current);
      sourceCommitTimer.current = setTimeout(() => translationRef.current.commitInput(), 1500);
    },
    onAudio: track => { void directAudio.current?.setTrack(track); },
    onFailure: () => {
      // The provider has already closed its microphone. Reflect that in the controls,
      // so the next tap can really reconnect, including after a language correction.
      running.current = false; setEnabled(false); setStarting(false); stopped.current = "paused by you";
      publisher.current?.flush(); recorder.current?.pause(); toneCapture.current?.stop();
    },
    shouldEnableMicrophone: micShouldBeOn,
  });
  const translationRef = useRef(translation);
  useEffect(() => { translationRef.current = translation; }, [translation]);
  useLanguageDetection(id, room?.me, translation.original, () => refreshNow.current());
  // Reaching a tier sends the speech captured so far; the clone in service keeps playing until
  // the new one is stored, and the request runs in the background so speech is never blocked.
  const cloneIfDue = useCallback(async () => {
    const me = roomRef.current?.me;
    const speech = recorder.current;
    if (!me?.hasAccount || !me.consented || !speech || cloning.current || cloningBlocked.current || Date.now() < cloneRetry.current.at) return;
    const seconds = speech.seconds;
    const tier = dueTier(seconds, speech.bytes, me.voiceTier);
    if (!tier) return;
    const samples = speech.samples();
    if (!samples.length) return;
    cloning.current = true;
    // The standard voice keeps speaking meanwhile, so a later attempt needs no message.
    const later = () => {
      const { delay } = cloneRetry.current;
      cloneRetry.current = { at: Date.now() + delay, delay: Math.min(delay * 2, MAX_CLONE_RETRY_MS) };
      refreshNow.current();
    };
    try {
      const form = new FormData();
      form.set("sessionId", id);
      form.set("consent", VOICE_CONSENT);
      form.set("seconds", String(Math.round(seconds)));
      form.set("tier", String(tier));
      samples.forEach((blob, index) => {
        const extension = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
        form.append("sample", blob, `voice-${index}.${extension}`);
      });
      const response = await fetch(`/api/voice/clone`, { method: "POST", body: form });
      if (!response.ok) {
        if (!cloneRefused(response.status)) { later(); return; }
        cloningBlocked.current = true;
        setMessage("errorVoiceCreate");
        return;
      }
      cloneRetry.current = { at: 0, delay: CLONE_RETRY_MS };
      if (tier === FINAL_TIER) { speech.stop(); speech.discard(); recorder.current = new SpeechRecorder(); }
      refreshNow.current();
    } catch { later(); }
    finally { cloning.current = false; }
  }, [id]);

  const syncMicrophone = useCallback(() => {
    const open = micShouldBeOn();
    translationRef.current.setMicrophoneEnabled(open);
    if (!open) {
      toneCapture.current?.pause();
      // End of a turn: pause the capture, then see whether a tier has been reached.
      speechClock.current.pause();
      recorder.current?.pause();
      setSpeechSeconds(Math.round(recorder.current?.seconds ?? 0));
      void cloneIfDue();
      return;
    }
    const stream = translationRef.current.getStream?.();
    if (!stream) return;
    detector.current?.listen(stream);
    if (activeSpeechOptions().emotion && publisher.current?.mode === "context" && !document.hidden) toneCapture.current?.listen(stream);
    else toneCapture.current?.stop();
    const me = roomRef.current?.me;
    if (me?.hasAccount && me.consented && me.voiceTier < FINAL_TIER) recorder.current?.listen(stream);
    else recorder.current?.pause();
  }, [micShouldBeOn, cloneIfDue, activeSpeechOptions]);

  // A playback problem concerns one sentence: say so briefly, then clear it if nothing replaced it.
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flash = useCallback((text: StringKey) => {
    setMessage(text); clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setMessage(current => current === text ? "" : current), 5000);
  }, []);
  const canPlay = useCallback(() => sound.current && soundReadyRef.current && !!voice.current, []);
  // What this phone asks the voice to say for one received sentence.
  const speechFor = useCallback((event: ReceivedEvent): SpeechRequest => ({
    id: event.id, sessionId: id, text: event.text + " ", speech: event.speech,
    language: event.targetLanguage || roomRef.current?.me.language || "en",
  }), [id]);
  // The next queued sentence is prepared while the current one plays: no wait between sentences.
  const prefetchNext = useCallback(() => {
    const next = queue.current[0];
    if (next && canPlay()) voice.current?.prefetch(speechFor(next));
  }, [canPlay, speechFor]);
  const playQueue = useCallback(async () => {
    if (speaking.current || !canPlay()) return;
    speaking.current = true;
    directAudio.current?.setIncomingEnabled(false);
    syncMicrophone();
    try {
      while (canPlay() && queue.current.length) {
        const event = queue.current.shift()!;
        incomingSpeech.current = event.speech ?? null;
        setSpeakingTurn(event.turnId);
        try {
          const playing = voice.current?.speakStream(speechFor(event));
          prefetchNext();
          await playing;
        } catch {
          // A system-suspended context is not an error the listener should read: re-arm quietly.
          if (voice.current && voice.current.contextState !== "running") {
            queue.current = []; soundReadyRef.current = false; setSoundReady(false); rearm.current();
            break;
          }
          // One sentence failing must not silence the ones already waiting behind it.
          flash("errorVoice");
        }
        const measured = voice.current?.lastLatency;
        if (measured) timing.current = { ...timing.current, request: measured.request, playback: measured.total };
      }
    } finally {
      speaking.current = false; setSpeakingTurn(null);
      directAudio.current?.setIncomingEnabled(roomRef.current?.peer?.activeMode !== "context");
      syncMicrophone();
    }
  }, [syncMicrophone, canPlay, flash, speechFor, prefetchNext]);

  // A tier must not wait for the floor to be handed back: someone can hold it for minutes.
  useEffect(() => {
    const timer = setInterval(() => {
      setSpeechSeconds(Math.round(recorder.current?.seconds ?? 0));
      setSpokenSeconds(Math.floor(speechClock.current.seconds));
      void cloneIfDue();
    }, 1000);
    return () => clearInterval(timer);
  }, [cloneIfDue]);

  useEffect(() => {
    const controller = new AbortController();
    let refreshTimer: ReturnType<typeof setTimeout>;
    const peer = new NeonPeerTransport(setMessage);
    const tones = new ToneTracker(id);
    tones.tune(toneTuningRef.current.confirmations, toneTuningRef.current.holdSeconds);
    toneTracker.current = tones;
    toneCapture.current = new ToneCapture(audio => tones.sample(audio), toneTuningRef.current.windowSeconds);
    transport.current = peer;
    const turns = new ConversationPipeline({
      sessionId: id, speaker: () => roomRef.current?.me.slot ?? 0,
      languages: () => ({ sourceLanguage: roomRef.current?.me.language ?? "en", targetLanguage: roomRef.current?.peer?.language ?? "en" }),
      send: event => peer.send(event), onTranslation: text => setContextTranslation(previous => (previous + " " + text).trim().slice(-12_000)),
      onError: setMessage, canSwitch: () => !directAudio.current?.isSendingAudio(),
      speechOptions: activeSpeechOptions,
      currentTone: options => tones.current(options),
      switchMode: async mode => {
        if (controller.signal.aborted) return;
        clearTimeout(sourceCommitTimer.current);
        toneCapture.current?.stop();
        if (running.current) {
          recorder.current?.pause();
          translationRef.current.stop();
          await translationRef.current.start(mode === "context");
          syncMicrophone();
        }
        if (controller.signal.aborted) return;
        setActiveMode(mode);
        // Nothing the reader can act on if this fails: the next switch or reload publishes it again.
        await fetch(`/api/sessions/${id}/mode`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: mode }), signal: controller.signal }).catch(() => {});
        refreshNow.current();
      },
    });
    publisher.current = turns;
    detector.current = new VoiceRangeDetector(range => {
      if (controller.signal.aborted) return;
      void fetch(`/api/sessions/${id}/voice-range`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ range }), signal: controller.signal,
      }).catch(() => {});
    });
    recorder.current = new SpeechRecorder();
    // Playback failures are reported by playQueue, which knows whether the listener must read one.
    const player = new ElevenLabsVoiceProvider(status => {
      if (controller.signal.aborted) return;
      setVoiceStatus(status === "idle" && remoteSpeaking.current ? "playing" : status);
    });
    voice.current = player;
    const committed = new Set<string>();
    peer.onFloor(slot => {
      if (controller.signal.aborted || (floorKnown.current && floorRef.current === slot)) return;
      floorKnown.current = true;
      floorRef.current = slot;
      setFloor(slot);
      // Losing the floor mid-sentence: publish what was said rather than dropping it.
      if (slot !== roomRef.current?.me.slot) turns.flush();
      syncMicrophone();
    });
    const unsubscribe = peer.subscribe(event => {
      if (controller.signal.aborted) return;
      turns.receive(event, roomRef.current?.peer?.slot ?? 1);
      if (event.kind === "original") return;
      setIncoming(lines => {
        const line = { turnId: event.turnId, text: event.text };
        // Streaming subtitles grow the same sentence; a new turn starts a new line.
        const next = lines.at(-1)?.turnId === event.turnId ? [...lines.slice(0, -1), line] : [...lines, line];
        return next.slice(-20);
      });
      if (event.committed && !committed.has(event.turnId)) {
        committed.add(event.turnId);
        if (committed.size > 500) committed.delete(committed.values().next().value!);
        setReceived(count => count + 1);
        if (typeof event.ageMs === "number" && event.ageMs > STALE_SPEECH_MS) return;
        if (typeof event.ageMs === "number") timing.current = { transport: event.ageMs, request: 0, playback: 0 };
        if (event.mode === "context") directAudio.current?.setIncomingEnabled(false);
        if (event.mode === "direct") return; // OpenAI audio arrives over the peer media track.
        if (sound.current) {
          // Before the first tap, hold only the latest sentence so it plays instead of a backlog.
          if (!soundReadyRef.current) queue.current = [event];
          else {
            if (queue.current.length >= 20) { setMessage("playbackBehind"); queue.current = []; }
            queue.current.push(event);
            if (speaking.current) prefetchNext();
          }
          void playQueue();
        }
      }
    });
    let failures = 0;
    async function refresh() {
      clearTimeout(refreshTimer);
      const sequence = ++refreshSequence.current;
      try {
        const response = await fetch(`/api/sessions/${id}`, { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) {
          // Only a closed, expired or foreign session is final. Everything else deserves a retry.
          if ([401, 403, 404].includes(response.status)) {
            setMessage("conversationEnded");
            stopped.current = "session ended"; setEnded(true);
            running.current = false; setEnabled(false); player.stop(); directAudio.current?.dispose(); turns.dispose(); translationRef.current.stop();
            toneCapture.current?.stop();
            return;
          }
          throw new Error(`session ${response.status}`);
        }
        if (controller.signal.aborted || sequence !== refreshSequence.current) return;
        failures = 0; setConnectionLost(false);
        setMessage(current => current === "errorConnection" ? "" : current);
        if (data.peer?.language && data.peer.language !== roomRef.current?.peer?.language) {
          turns.flush();
          // An unsupported session.update would kill the old direct connection before
          // the contextual pipeline can take over at the sentence boundary.
          if (supportsDirectOutput(data.peer.language)) translationRef.current.setTargetLanguage(data.peer.language);
        }
        if (roomRef.current?.me.consented && !data.me.consented) {
          recorder.current?.stop(); recorder.current?.discard(); recorder.current = new SpeechRecorder();
        }
        // Back from a locked phone or a closed tab: renegotiate direct audio now, not after the backoff.
        if (roomRef.current?.peer?.online === false && data.peer?.online) directAudio.current?.retrySoon();
        roomRef.current = data; setRoom(data);
        // Nobody is listening any more: close the microphone rather than let them talk into the void.
        // The session stays open, so the controls come back when the other person returns.
        // Out of credits: the whole conversation stops for both, until the balance is topped up.
        // Queued speech would only be refused by the server, listener included.
        if (data.creditsExhausted) queue.current = [];
        if ((data.creditsExhausted || (data.peer && !data.peer.online)) && running.current) {
          running.current = false; setEnabled(false); stopped.current = data.creditsExhausted ? "no credits" : "peer away";
          // A last sentence or queued speech would only be refused by the server once credits are out.
          if (!data.creditsExhausted) turns.flush();
          recorder.current?.pause(); toneCapture.current?.stop(); translationRef.current.stop();
        }
        // Tone matching is an account feature and, like the speaker's own voice, takes mode 2.
        const wanted = desiredMode(data.me, speechOptionsRef.current.emotion && data.me.hasAccount);
        const unsupportedDirect = data.peer?.language && !supportsDirectOutput(data.peer.language);
        if (unsupportedDirect) modeReason.current = `${data.peer.language.toUpperCase()} output uses mode 2: this language is not documented for OpenAI live translation output.`;
        else if (!directUnavailable.current) modeReason.current = "";
        turns.requestMode(modeForLanguage(wanted, data.peer?.language, directUnavailable.current));
        // Event metadata selects TTS per phrase. This prevents delayed direct audio from
        // overlapping contextual speech after the remote speaker has switched modes.
        directAudio.current?.setIncomingEnabled(data.peer?.activeMode !== "context" && !speaking.current);
        syncMicrophone();
      } catch {
        // A dropped poll must never end the conversation: a waking phone drops several in a row.
        if (!controller.signal.aborted && ++failures >= 3) setConnectionLost(true);
      } finally { if (!controller.signal.aborted && sequence === refreshSequence.current) refreshTimer = setTimeout(() => void refresh(), 3000); }
    }
    refreshNow.current = () => { void refresh(); };
    async function join() {
      let failure: StringKey = "errorRetry";
      try {
        const response = await fetch(`/api/sessions/${id}/join`, { method: "POST", signal: controller.signal });
        let data = await response.json();
        // A third person, or a closed or expired conversation, is refused for good.
        if (!response.ok) { failure = [403, 404].includes(response.status) ? "errorJoin" : "errorRetry"; throw new Error(`join ${response.status}`); }
        if (signedIn && !data.me.hasAccount) {
          const linked = await fetch(`/api/sessions/${id}/account`, { method: "POST", signal: controller.signal });
          if (!linked.ok) throw new Error(`account ${linked.status}`);
          const refreshed = await fetch(`/api/sessions/${id}`, { signal: controller.signal, cache: "no-store" });
          if (!refreshed.ok) throw new Error(`session ${refreshed.status}`);
          data = await refreshed.json();
        }
        if (controller.signal.aborted) return;
        const initialMode = modeForLanguage(desiredMode(data.me, speechOptionsRef.current.emotion && data.me.hasAccount), data.peer?.language);
        turns.mode = initialMode; turns.desired = initialMode; setActiveMode(initialMode);
        roomRef.current = data; setRoom(data);
        // A reload starts a new provider; publish its actual mode even if the previous
        // browser left a different active mode in the session row.
        void fetch(`/api/sessions/${id}/mode`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: initialMode }), signal: controller.signal }).catch(() => {});
        const audio = new PeerAudioLink(id, data.me.slot, playing => {
          if (controller.signal.aborted) return;
          remoteSpeaking.current = playing;
          if (!speaking.current) setVoiceStatus(playing ? "playing" : "idle");
          syncMicrophone();
        }, reason => {
          if (controller.signal.aborted) return;
          modeReason.current = reason;
          if (audio.status === "unavailable") {
            setMessage("directAudioWeak");
            directUnavailable.current = true;
            turns.requestMode("context");
          } else { setMessage("tapToHear"); soundReadyRef.current = false; setSoundReady(false); rearm.current(); }
        }, () => {
          if (controller.signal.aborted) return;
          // Direct audio is back: the mode follows the speaker's settings again, at the next poll.
          directUnavailable.current = false; modeReason.current = "";
          setMessage(current => current === "directAudioWeak" ? "" : current);
          refreshNow.current();
        });
        directAudio.current = audio;
        void audio.start();
        // If the first gesture happened while joining, arm this new element on the next touch.
        soundReadyRef.current = false; setSoundReady(false); rearm.current();
        // Seed the floor once; the 500 ms poll owns it from here.
        if (!floorKnown.current) { floorKnown.current = true; floorRef.current = data.floor; setFloor(data.floor); }
        void peer.connect(id); void refresh();
      } catch { if (!controller.signal.aborted) setMessage(failure); }
    }
    void join();
    // Autoplay rules need one gesture in the page, but never a specific one: the first
    // touch anywhere arms playback, so a listener has nothing to press to simply hear.
    // Arming is not one-shot: if the system suspends audio later, the next touch re-arms it.
    let armed = false;
    const armSound = (event: Event) => {
      // This button handles its own click. Arming on pointerdown/keydown would let
      // its subsequent click see "ready" and mute the sound in the same gesture.
      if (event.target instanceof Element && event.target.closest(".sound-icon")) return;
      document.removeEventListener("pointerdown", armSound);
      document.removeEventListener("keydown", armSound);
      armed = false;
      Promise.all([player.unlock(), directAudio.current?.unlock()]).then(() => {
        if (controller.signal.aborted) return;
        soundReadyRef.current = true; setSoundReady(true);
        void playQueue();
      }).catch(() => armForSound());
    };
    function armForSound() {
      if (armed || controller.signal.aborted) return;
      armed = true;
      document.addEventListener("pointerdown", armSound);
      document.addEventListener("keydown", armSound);
    }
    rearm.current = armForSound;
    armForSound();
    // Leaving the page tears the microphone down for privacy, but the session stays active:
    // a receiving phone whose screen went dark must still speak when it comes back.
    const visibility = () => {
      if (document.hidden) { queue.current = []; player.stop(); turns.flush(); toneCapture.current?.stop(); return; }
      if (!running.current || controller.signal.aborted) return;
      void (async () => {
        try {
          await unlockSound();
          await translationRef.current.start(turns.mode === "context");
          syncMicrophone();
        } catch {
          setMessage("errorTranslationStopped");
        }
      })();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      controller.abort(); clearTimeout(refreshTimer); clearTimeout(sourceCommitTimer.current); directAudio.current?.dispose(); directAudio.current = null; document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("pointerdown", armSound); document.removeEventListener("keydown", armSound);
      unsubscribe(); turns.dispose(); peer.disconnect(); player.dispose(); detector.current?.stop(); detector.current = null; recorder.current?.stop(); recorder.current = null;
      toneCapture.current?.stop(); toneCapture.current = null;
      tones.reset(); toneTracker.current = null;
      running.current = false; queue.current = []; speaking.current = false;
      publisher.current = null; transport.current = null; voice.current = null;
    };
  }, [id, signedIn, playQueue, syncMicrophone, canPlay, activeSpeechOptions, prefetchNext]);

  async function unlockSound() {
    await Promise.all([voice.current?.unlock(), directAudio.current?.unlock()]);
    soundReadyRef.current = true; setSoundReady(true);
  }
  async function enableSound() {
    setMessage("");
    try {
      await unlockSound();
      sound.current = true; setSoundOn(true); directAudio.current?.setMuted(false);
      void playQueue();
    }
    catch { setMessage("errorSound"); }
  }
  async function start() {
    if (running.current || starting) return;
    setMessage("");
    // Starting is its own state: intent is expressed, so the button must never fall back to
    // offering "Speak" while the floor is claimed and WebRTC negotiates, which takes seconds.
    setStarting(true);
    try {
      // Same gesture unlocks playback: the browser has no separate sound permission to ask for.
      await unlockSound();
      // Claiming only a free floor keeps the guarantee that a second person starting up cannot
      // steal the microphone from whoever is talking.
      if (floorRef.current === null) await takeFloor();
      running.current = true; setEnabled(true); stopped.current = "running";
      await translation.start(publisher.current?.mode === "context");
      syncMicrophone();
    } catch { setMessage("errorSound"); }
    finally { setStarting(false); }
  }
  function stop() {
    running.current = false; setEnabled(false); stopped.current = "paused by you"; queue.current = [];
    publisher.current?.flush(); translation.stop(); voice.current?.stop();
    toneCapture.current?.stop();
  }
  function setSpeechOptions(next: SpeechOptions) {
    if (!isSpeechOptions(next)) return;
    publisher.current?.flush();
    speechOptionsRef.current = next; updateSpeechOptions(next);
    try { localStorage.setItem("trad0-speech-options", JSON.stringify(next)); } catch {}
    // Turning the estimate off must release the microphone tap and drop anything in flight.
    if (!next.emotion) {
      toneTracker.current?.reset();
      toneCapture.current?.stop();
    }
    syncMicrophone();
    // Tone matching decides the mode: switch at the next sentence boundary, not at the next poll.
    refreshNow.current();
  }
  function setToneTuning(next: ToneTuning) {
    if (!isToneTuning(next)) return;
    toneTuningRef.current = next; updateToneTuning(next);
    try { localStorage.setItem("trad0-tone-tuning", JSON.stringify(next)); } catch {}
    toneTracker.current?.tune(next.confirmations, next.holdSeconds);
    toneCapture.current?.setWindow(next.windowSeconds);
  }
  async function takeFloor() {
    if (claiming || floorRef.current === roomRef.current?.me.slot) return;
    await changeFloor(() => transport.current?.takeFloor());
  }
  async function releaseFloor() {
    if (claiming || floorRef.current !== roomRef.current?.me.slot) return;
    await changeFloor(() => transport.current?.releaseFloor());
  }
  async function changeFloor(action: () => Promise<number | null> | undefined) {
    setClaiming(true);
    setMessage("");
    try {
      const slot = await action();
      if (slot !== undefined) { floorKnown.current = true; floorRef.current = slot; setFloor(slot); syncMicrophone(); }
    } catch { setMessage("errorFloor"); }
    finally { setClaiming(false); }
  }
  function toggleSound() {
    const next = !sound.current;
    sound.current = next; setSoundOn(next); directAudio.current?.setMuted(!next);
    if (!next) { queue.current = []; voice.current?.stop(); speaking.current = false; }
    syncMicrophone();
  }
  const giveConsent = useCallback(async () => {
    setMessage("");
    try {
      const response = await fetch("/api/voice/consent", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: id, consent: VOICE_CONSENT }),
      });
      if (!response.ok) throw new Error(`consent ${response.status}`);
      // Agreeing again is an explicit retry, so cloning gets another chance.
      cloningBlocked.current = false; cloneRetry.current = { at: 0, delay: CLONE_RETRY_MS };
      refreshNow.current();
    } catch { setMessage("errorRetry"); }
  }, [id]);
  async function setUseClone(useClone: boolean) {
    setMessage("");
    try {
      const response = await fetch("/api/voice/prefer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: id, useClone }),
      });
      if (!response.ok) throw new Error(`prefer ${response.status}`);
      refreshNow.current();
    } catch { setMessage("errorRetry"); }
  }
  async function setLanguage(slot: number, language: Language | "auto") {
    if (changingLanguageRef.current) return;
    changingLanguageRef.current = true; setChangingLanguage(true); setMessage("");
    ++refreshSequence.current;
    try {
      const response = await fetch(`/api/sessions/${id}/language`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slot, language }),
      });
      if (!response.ok) throw new Error(`language ${response.status}`);
    } catch { setMessage("errorLanguage"); }
    finally {
      refreshNow.current();
      changingLanguageRef.current = false; setChangingLanguage(false);
    }
  }
  async function playTestTone() {
    setMessage("");
    try { await voice.current?.testTone(); soundReadyRef.current = true; setSoundReady(true); }
    catch { setMessage("errorSound"); }
  }
  const readAudioState = useCallback(() => ({
    context: voice.current?.contextState ?? "absent",
    stopped: stopped.current,
    failure: voice.current?.lastFailure || "none",
    voice: voice.current?.lastVoice || "none",
    timing: timing.current,
    range: detector.current?.state ?? { frames: 0, median: 0, range: null },
    speech: Math.round(recorder.current?.seconds ?? 0),
    queued: queue.current.length,
    speaking: speaking.current,
    running: running.current,
    sound: sound.current,
  }), []);
  const readPipelineState = useCallback(() => ({
    active: publisher.current?.mode ?? "direct", desired: publisher.current?.desired ?? "direct",
    switching: publisher.current?.switching ?? false, directAudio: directAudio.current?.status ?? "waiting",
    reason: modeReason.current, contextTurns: publisher.current?.memory.recent().length ?? 0,
    timing: publisher.current?.timing ?? null, receivedTiming: timing.current,
    speechOptions: activeSpeechOptions(), outgoingSpeech: publisher.current?.speech ?? null, incomingSpeech: incomingSpeech.current,
    synthesis: voice.current?.lastSynthesis ?? null, audioLatency: voice.current?.lastLatency ?? null,
  }), [activeSpeechOptions]);
  const hasFloor = room ? floor === room.me.slot : false;
  const floorFree = floor === null;
  return { ended, speechOptions, setSpeechOptions, toneTuning, setToneTuning, activeMode, readPipelineState, spokenSeconds, room, message: message || translation.message, incoming, speakingTurn, voiceStatus, enabled, soundOn, hasFloor, floorFree, claiming, starting, changingLanguage, setLanguage, received, speechSeconds, connectionLost, soundReady, translation: activeMode === "context" ? { ...translation, translation: contextTranslation } : translation, start, stop, takeFloor, releaseFloor, toggleSound, giveConsent, setUseClone, refresh: () => refreshNow.current(), enableSound, playTestTone, readAudioState };
}
