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
import { DEFAULT_SPEECH_OPTIONS, isSpeechOptions, type SpeechOptions, type SpeechMetadata } from "@/lib/audio/speech-options";
import { FINAL_TIER, VOICE_CONSENT, VOICE_TIERS } from "@/lib/voice/consent";
import type { Language, ReceivedEvent, SharedSession } from "@/types/session";
import type { VoiceStatus } from "@/types/voice";

export function useSharedConversation(id: string, signedIn = false) {
  const [speechOptions, updateSpeechOptions] = useState<SpeechOptions>(() => {
    try { const saved = JSON.parse(localStorage.getItem("trad0-speech-options") || "null"); return isSpeechOptions(saved) ? saved : DEFAULT_SPEECH_OPTIONS; }
    catch { return DEFAULT_SPEECH_OPTIONS; }
  });
  const speechOptionsRef = useRef(speechOptions);
  // Tone analysis is an account feature: a choice saved on this phone never applies to a guest.
  const activeSpeechOptions = useCallback((): SpeechOptions => ({ ...speechOptionsRef.current, emotion: speechOptionsRef.current.emotion && !!roomRef.current?.me.hasAccount }), []);
  const toneCapture = useRef<ToneCapture | null>(null);
  const toneTracker = useRef<ToneTracker | null>(null);
  const incomingSpeech = useRef<SpeechMetadata | null>(null);
  const [room, setRoom] = useState<SharedSession | null>(null);
  const [ended, setEnded] = useState(false);
  const [message, setMessage] = useState("");
  const [incoming, setIncoming] = useState("");
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
  // A provider that refuses to clone will refuse again: stop asking every ten seconds.
  const cloningBlocked = useRef(false);
  // Last sentence measured end to end, so every latency change can be judged on facts.
  const timing = useRef({ transport: 0, request: 0, playback: 0 });
  const refreshNow = useRef<() => void>(() => {});
  const stopped = useRef<"never started" | "running" | "paused by you" | "peer away" | "session ended">("never started");
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
    if (!me?.hasAccount || !me.consented || !speech || cloning.current || cloningBlocked.current) return;
    const seconds = speech.seconds;
    const target = [...VOICE_TIERS].reverse().find(step => seconds >= step.seconds && step.tier > me.voiceTier);
    if (!target) return;
    const samples = speech.samples();
    if (!samples.length) return;
    cloning.current = true;
    try {
      const form = new FormData();
      form.set("sessionId", id);
      form.set("consent", VOICE_CONSENT);
      form.set("seconds", String(Math.round(seconds)));
      form.set("tier", String(target.tier));
      samples.forEach((blob, index) => {
        const extension = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
        form.append("sample", blob, `voice-${index}.${extension}`);
      });
      const response = await fetch(`/api/voice/clone`, { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (target.tier === FINAL_TIER) { speech.stop(); speech.discard(); recorder.current = new SpeechRecorder(); }
      refreshNow.current();
    } catch (error) {
      cloningBlocked.current = true;
      setMessage(error instanceof Error ? error.message : "La voix n’a pas pu être créée.");
    } finally { cloning.current = false; }
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

  const canPlay = useCallback(() => sound.current && soundReadyRef.current && !!voice.current, []);
  const playQueue = useCallback(async () => {
    if (speaking.current || !canPlay()) return;
    speaking.current = true;
    directAudio.current?.setIncomingEnabled(false);
    syncMicrophone();
    try {
      while (canPlay() && queue.current.length) {
        const event = queue.current.shift()!;
        incomingSpeech.current = event.speech ?? null;
        await voice.current?.speakStream({ sessionId: id, speech: event.speech, language: event.targetLanguage || roomRef.current?.me.language || "en", textStream: (async function* () { yield event.text + " "; })() });
        const measured = voice.current?.lastLatency;
        if (measured) timing.current = { ...timing.current, request: measured.request, playback: measured.total };
      }
    } catch (error) {
      queue.current = [];
      // A system-suspended context is not an error the listener should read: re-arm quietly.
      if (voice.current && voice.current.contextState !== "running") {
        soundReadyRef.current = false; setSoundReady(false); rearm.current();
      } else setMessage(error instanceof Error ? error.message : "Le son est indisponible. Le texte reste accessible.");
    } finally {
      speaking.current = false;
      directAudio.current?.setIncomingEnabled(roomRef.current?.peer?.activeMode !== "context");
      syncMicrophone();
    }
  }, [id, syncMicrophone, canPlay]);

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
    toneTracker.current = tones;
    toneCapture.current = new ToneCapture(audio => tones.sample(audio));
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
        const response = await fetch(`/api/sessions/${id}/mode`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: mode }), signal: controller.signal });
        if (!response.ok) setMessage("The translation mode changed locally, but could not be shared yet.");
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
    const player = new ElevenLabsVoiceProvider((status, error) => {
      if (controller.signal.aborted) return;
      setVoiceStatus(status === "idle" && remoteSpeaking.current ? "playing" : status);
      if (error) setMessage(error);
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
      setIncoming(event.text);
      if (event.committed && !committed.has(event.turnId)) {
        committed.add(event.turnId);
        if (committed.size > 500) committed.delete(committed.values().next().value!);
        setReceived(count => count + 1);
        if (typeof event.ageMs === "number") timing.current = { transport: event.ageMs, request: 0, playback: 0 };
        if (event.mode === "context") directAudio.current?.setIncomingEnabled(false);
        if (event.mode === "direct") return; // OpenAI audio arrives over the peer media track.
        if (sound.current) {
          // Before the first tap, hold only the latest sentence so it plays instead of a backlog.
          if (!soundReadyRef.current) queue.current = [event];
          else {
            if (queue.current.length >= 20) { setMessage("La lecture a pris du retard. Le texte reste disponible."); queue.current = []; }
            queue.current.push(event);
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
            setMessage(data.error || "La conversation est terminée.");
            stopped.current = "session ended"; setEnded(true);
            running.current = false; setEnabled(false); player.stop(); directAudio.current?.dispose(); turns.dispose(); translationRef.current.stop();
            toneCapture.current?.stop();
            return;
          }
          throw new Error(data.error);
        }
        if (controller.signal.aborted || sequence !== refreshSequence.current) return;
        failures = 0; setConnectionLost(false);
        if (data.peer?.language && data.peer.language !== roomRef.current?.peer?.language) {
          turns.flush();
          // An unsupported session.update would kill the old direct connection before
          // the contextual pipeline can take over at the sentence boundary.
          if (supportsDirectOutput(data.peer.language)) translationRef.current.setTargetLanguage(data.peer.language);
        }
        if (roomRef.current?.me.consented && !data.me.consented) {
          recorder.current?.stop(); recorder.current?.discard(); recorder.current = new SpeechRecorder();
        }
        roomRef.current = data; setRoom(data);
        // Nobody is listening any more: close the microphone rather than let them talk into the void.
        // The session stays open, so the controls come back when the other person returns.
        if (data.peer && !data.peer.online && running.current) {
          running.current = false; setEnabled(false); stopped.current = "peer away";
          turns.flush(); recorder.current?.pause(); toneCapture.current?.stop(); translationRef.current.stop();
        }
        const wanted = desiredMode(data.me);
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
      try {
        const response = await fetch(`/api/sessions/${id}/join`, { method: "POST", signal: controller.signal });
        let data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (signedIn && !data.me.hasAccount) {
          const linked = await fetch(`/api/sessions/${id}/account`, { method: "POST", signal: controller.signal });
          if (!linked.ok) throw new Error((await linked.json()).error);
          const refreshed = await fetch(`/api/sessions/${id}`, { signal: controller.signal, cache: "no-store" });
          if (!refreshed.ok) throw new Error("Could not restore your conversation.");
          data = await refreshed.json();
        }
        if (controller.signal.aborted) return;
        const initialMode = modeForLanguage(desiredMode(data.me), data.peer?.language);
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
        }, error => {
          if (controller.signal.aborted) return;
          modeReason.current = error; setMessage(error);
          if (audio.status === "unavailable") {
            directUnavailable.current = true;
            turns.requestMode("context");
          } else { soundReadyRef.current = false; setSoundReady(false); rearm.current(); }
        });
        directAudio.current = audio;
        void audio.start();
        // If the first gesture happened while joining, arm this new element on the next touch.
        soundReadyRef.current = false; setSoundReady(false); rearm.current();
        // Seed the floor once; the 500 ms poll owns it from here.
        if (!floorKnown.current) { floorKnown.current = true; floorRef.current = data.floor; setFloor(data.floor); }
        void peer.connect(id); void refresh();
      } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Impossible de rejoindre."); }
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
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Touchez Activer le micro pour reprendre.");
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
  }, [id, signedIn, playQueue, syncMicrophone, canPlay, activeSpeechOptions]);

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
    catch (error) { setMessage(error instanceof Error ? error.message : "Le son est indisponible."); }
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
    } catch (error) { setMessage(error instanceof Error ? error.message : "Autorisez le micro puis réessayez."); }
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
  }
  async function takeFloor() {
    if (claiming || floorRef.current === roomRef.current?.me.slot) return;
    await changeFloor(() => transport.current?.takeFloor(), "Impossible de prendre la parole.");
  }
  async function releaseFloor() {
    if (claiming || floorRef.current !== roomRef.current?.me.slot) return;
    await changeFloor(() => transport.current?.releaseFloor(), "Impossible de rendre la parole.");
  }
  async function changeFloor(action: () => Promise<number | null> | undefined, failureMessage: string) {
    setClaiming(true);
    setMessage("");
    try {
      const slot = await action();
      if (slot !== undefined) { floorKnown.current = true; floorRef.current = slot; setFloor(slot); syncMicrophone(); }
    } catch (error) { setMessage(error instanceof Error ? error.message : failureMessage); }
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
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      // Agreeing again is an explicit retry, so cloning gets another chance.
      cloningBlocked.current = false;
      refreshNow.current();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Réessayez."); }
  }, [id]);
  async function setUseClone(useClone: boolean) {
    setMessage("");
    try {
      const response = await fetch("/api/voice/prefer", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: id, useClone }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      refreshNow.current();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Réessayez."); }
  }
  async function setLanguage(slot: number, language: Language | "auto") {
    if (changingLanguageRef.current) return;
    changingLanguageRef.current = true; setChangingLanguage(true); setMessage("");
    ++refreshSequence.current;
    try {
      const response = await fetch(`/api/sessions/${id}/language`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slot, language }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Choose the language again."); }
    finally {
      refreshNow.current();
      changingLanguageRef.current = false; setChangingLanguage(false);
    }
  }
  async function playTestTone() {
    setMessage("");
    try { await voice.current?.testTone(); soundReadyRef.current = true; setSoundReady(true); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Le son est indisponible."); }
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
  return { ended, speechOptions, setSpeechOptions, activeMode, readPipelineState, spokenSeconds, room, message: message || translation.message, incoming, voiceStatus, enabled, soundOn, hasFloor, floorFree, claiming, starting, changingLanguage, setLanguage, received, speechSeconds, connectionLost, soundReady, translation: activeMode === "context" ? { ...translation, translation: contextTranslation } : translation, start, stop, takeFloor, releaseFloor, toggleSound, giveConsent, setUseClone, refresh: () => refreshNow.current(), enableSound, playTestTone, readAudioState };
}
