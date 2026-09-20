"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslationSession } from "./useTranslationSession";
import { NeonPeerTransport } from "@/lib/realtime/neon-transport";
import { TurnPublisher } from "@/lib/realtime/turn-publisher";
import { ElevenLabsVoiceProvider } from "@/lib/elevenlabs/voice-provider";
import { VoiceRangeDetector } from "@/lib/audio/voice-range";
import { SpeechRecorder } from "@/lib/audio/speech-recorder";
import { FINAL_TIER, VOICE_CONSENT, VOICE_TIERS } from "@/lib/voice/consent";
import type { ReceivedEvent, SharedSession } from "@/types/session";
import type { VoiceStatus } from "@/types/voice";

export function useSharedConversation(id: string) {
  const [room, setRoom] = useState<SharedSession | null>(null);
  const [message, setMessage] = useState("");
  const [incoming, setIncoming] = useState("");
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [enabled, setEnabled] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [floor, setFloor] = useState<number | null>(null);
  const floorKnown = useRef(false);
  const [claiming, setClaiming] = useState(false);
  const [received, setReceived] = useState(0);
  const [speechSeconds, setSpeechSeconds] = useState(0);
  const [connectionLost, setConnectionLost] = useState(false);
  const [soundReady, setSoundReady] = useState(false);
  const soundReadyRef = useRef(false);
  const rearm = useRef<() => void>(() => {});
  const detector = useRef<VoiceRangeDetector | null>(null);
  const recorder = useRef<SpeechRecorder | null>(null);
  const cloning = useRef(false);
  const refreshNow = useRef<() => void>(() => {});
  const stopped = useRef<"never started" | "running" | "paused by you" | "session ended">("never started");
  const transport = useRef<NeonPeerTransport | null>(null);
  const publisher = useRef<TurnPublisher | null>(null);
  const voice = useRef<ElevenLabsVoiceProvider | null>(null);
  const running = useRef(false);
  const sound = useRef(true);
  const floorRef = useRef<number | null>(null);
  const queue = useRef<ReceivedEvent[]>([]);
  const speaking = useRef(false);
  const roomRef = useRef<SharedSession | null>(null);

  // The microphone is open only while this device holds the floor and nothing is playing.
  const micShouldBeOn = useCallback(
    () => running.current && floorRef.current === roomRef.current?.me.slot && !speaking.current,
    [],
  );
  const translation = useTranslationSession({
    sessionId: id,
    targetLanguage: room?.peer?.language || (room?.me.language === "fr" ? "en" : "fr"),
    onDelta: delta => publisher.current?.append(delta),
    shouldEnableMicrophone: micShouldBeOn,
  });
  const translationRef = useRef(translation);
  useEffect(() => { translationRef.current = translation; }, [translation]);
  // Reaching a tier sends the speech captured so far; the clone in service keeps playing until
  // the new one is stored, and the request runs in the background so speech is never blocked.
  const cloneIfDue = useCallback(async () => {
    const me = roomRef.current?.me;
    const speech = recorder.current;
    if (!me?.consented || !speech || cloning.current) return;
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
      if (target.tier === FINAL_TIER) speech.discard();
      refreshNow.current();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "La voix n’a pas pu être créée.");
    } finally { cloning.current = false; }
  }, [id]);

  const syncMicrophone = useCallback(() => {
    const open = micShouldBeOn();
    translationRef.current.setMicrophoneEnabled(open);
    if (!open) {
      // End of a turn: pause the capture, then see whether a tier has been reached.
      recorder.current?.pause();
      setSpeechSeconds(Math.round(recorder.current?.seconds ?? 0));
      void cloneIfDue();
      return;
    }
    const stream = translationRef.current.getStream?.();
    if (!stream) return;
    detector.current?.listen(stream);
    recorder.current?.listen(stream);
  }, [micShouldBeOn, cloneIfDue]);

  const canPlay = useCallback(() => sound.current && soundReadyRef.current && !!voice.current, []);
  const playQueue = useCallback(async () => {
    if (speaking.current || !canPlay()) return;
    speaking.current = true;
    syncMicrophone();
    try {
      while (canPlay() && queue.current.length) {
        const event = queue.current.shift()!;
        await voice.current?.speakStream({ sessionId: id, language: roomRef.current?.me.language || "fr", textStream: (async function* () { yield event.text + " "; })() });
      }
    } catch (error) {
      queue.current = [];
      // A system-suspended context is not an error the listener should read: re-arm quietly.
      if (voice.current && voice.current.contextState !== "running") {
        soundReadyRef.current = false; setSoundReady(false); rearm.current();
      } else setMessage(error instanceof Error ? error.message : "Le son est indisponible. Le texte reste accessible.");
    } finally {
      speaking.current = false;
      syncMicrophone();
    }
  }, [id, syncMicrophone, canPlay]);

  // A tier must not wait for the floor to be handed back: someone can hold it for minutes.
  useEffect(() => {
    const timer = setInterval(() => {
      setSpeechSeconds(Math.round(recorder.current?.seconds ?? 0));
      void cloneIfDue();
    }, 10_000);
    return () => clearInterval(timer);
  }, [cloneIfDue]);

  useEffect(() => {
    const controller = new AbortController();
    let refreshTimer: ReturnType<typeof setTimeout>;
    const peer = new NeonPeerTransport(setMessage);
    transport.current = peer;
    const turns = new TurnPublisher(event => { void peer.send(event); });
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
      setVoiceStatus(status);
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
      if (slot !== roomRef.current?.me.slot) turns.commit();
      syncMicrophone();
    });
    const unsubscribe = peer.subscribe(event => {
      if (controller.signal.aborted) return;
      setIncoming(event.text);
      if (event.committed && !committed.has(event.turnId)) {
        committed.add(event.turnId);
        if (committed.size > 500) committed.delete(committed.values().next().value!);
        setReceived(count => count + 1);
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
      try {
        const response = await fetch(`/api/sessions/${id}`, { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) {
          // Only a closed, expired or foreign session is final. Everything else deserves a retry.
          if ([401, 403, 404].includes(response.status)) {
            setMessage(data.error || "La conversation est terminée.");
            stopped.current = "session ended";
            running.current = false; setEnabled(false); player.stop(); translationRef.current.stop();
            return;
          }
          throw new Error(data.error);
        }
        if (controller.signal.aborted) return;
        failures = 0; setConnectionLost(false);
        roomRef.current = data; setRoom(data);
      } catch {
        // A dropped poll must never end the conversation: a waking phone drops several in a row.
        if (!controller.signal.aborted && ++failures >= 3) setConnectionLost(true);
      } finally { if (!controller.signal.aborted) refreshTimer = setTimeout(() => void refresh(), 3000); }
    }
    refreshNow.current = () => { void refresh(); };
    async function join() {
      try {
        const response = await fetch(`/api/sessions/${id}/join`, { method: "POST", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (controller.signal.aborted) return;
        roomRef.current = data; setRoom(data);
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
    const armSound = () => {
      document.removeEventListener("pointerdown", armSound);
      document.removeEventListener("keydown", armSound);
      armed = false;
      player.unlock().then(() => {
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
      if (document.hidden) { queue.current = []; player.stop(); turns.commit(); return; }
      if (!running.current || controller.signal.aborted) return;
      void (async () => {
        try {
          await unlockSound();
          await translationRef.current.start();
          syncMicrophone();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Touchez Activer le micro pour reprendre.");
        }
      })();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      controller.abort(); clearTimeout(refreshTimer); document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("pointerdown", armSound); document.removeEventListener("keydown", armSound);
      unsubscribe(); turns.dispose(); peer.disconnect(); player.dispose(); detector.current?.stop(); detector.current = null; recorder.current?.stop(); recorder.current = null;
      running.current = false; queue.current = []; speaking.current = false;
      publisher.current = null; transport.current = null; voice.current = null;
    };
  }, [id, playQueue, syncMicrophone, canPlay]);

  async function unlockSound() {
    await voice.current?.unlock();
    soundReadyRef.current = true; setSoundReady(true);
  }
  async function enableSound() {
    setMessage("");
    try { await unlockSound(); void playQueue(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Le son est indisponible."); }
  }
  async function start() {
    if (running.current) return;
    setMessage("");
    try {
      // Same gesture unlocks playback: the browser has no separate sound permission to ask for.
      await unlockSound();
      running.current = true; setEnabled(true); stopped.current = "running";
      await translation.start();
      syncMicrophone();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Autorisez le micro puis réessayez."); }
  }
  function stop() {
    running.current = false; setEnabled(false); stopped.current = "paused by you"; queue.current = [];
    publisher.current?.commit(); translation.stop(); voice.current?.stop();
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
    sound.current = next; setSoundOn(next);
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
      refreshNow.current();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Réessayez."); }
  }, [id]);
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
    range: detector.current?.state ?? { frames: 0, median: 0, range: null },
    speech: Math.round(recorder.current?.seconds ?? 0),
    queued: queue.current.length,
    speaking: speaking.current,
    running: running.current,
    sound: sound.current,
  }), []);
  const hasFloor = room ? floor === room.me.slot : false;
  const floorFree = floor === null;
  return { room, message: message || translation.message, incoming, voiceStatus, enabled, soundOn, hasFloor, floorFree, claiming, received, speechSeconds, connectionLost, soundReady, translation, start, stop, takeFloor, releaseFloor, toggleSound, giveConsent, refresh: () => refreshNow.current(), enableSound, playTestTone, readAudioState };
}
