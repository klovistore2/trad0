"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslationSession } from "./useTranslationSession";
import { NeonPeerTransport } from "@/lib/realtime/neon-transport";
import { TurnPublisher } from "@/lib/realtime/turn-publisher";
import { ElevenLabsVoiceProvider } from "@/lib/elevenlabs/voice-provider";
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
  const [claiming, setClaiming] = useState(false);
  const [received, setReceived] = useState(0);
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
  const syncMicrophone = useCallback(() => translationRef.current.setMicrophoneEnabled(micShouldBeOn()), [micShouldBeOn]);

  const playQueue = useCallback(async () => {
    if (speaking.current || !running.current || !sound.current || !voice.current) return;
    speaking.current = true;
    syncMicrophone();
    try {
      while (running.current && sound.current && queue.current.length) {
        const event = queue.current.shift()!;
        await voice.current.speakStream({ sessionId: id, language: roomRef.current?.me.language || "fr", textStream: (async function* () { yield event.text + " "; })() });
      }
    } catch (error) {
      queue.current = [];
      setMessage(error instanceof Error ? error.message : "Le son est indisponible. Le texte reste accessible.");
    } finally {
      speaking.current = false;
      syncMicrophone();
    }
  }, [id, syncMicrophone]);

  useEffect(() => {
    const controller = new AbortController();
    let refreshTimer: ReturnType<typeof setTimeout>;
    const peer = new NeonPeerTransport(setMessage);
    transport.current = peer;
    const turns = new TurnPublisher(event => { void peer.send(event); });
    publisher.current = turns;
    const player = new ElevenLabsVoiceProvider((status, error) => {
      if (controller.signal.aborted) return;
      setVoiceStatus(status);
      if (error) setMessage(error);
    });
    voice.current = player;
    const committed = new Set<string>();
    peer.onFloor(slot => {
      if (controller.signal.aborted || floorRef.current === slot) return;
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
        if (running.current && sound.current) {
          if (queue.current.length >= 20) { setMessage("La lecture a pris du retard. Le texte reste disponible."); queue.current = []; }
          queue.current.push(event);
          void playQueue();
        }
      }
    });
    async function refresh() {
      try {
        const response = await fetch(`/api/sessions/${id}`, { signal: controller.signal, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (!controller.signal.aborted) { roomRef.current = data; setRoom(data); }
      } catch (error) {
        if (!controller.signal.aborted) {
          setMessage(error instanceof Error ? error.message : "Connexion perdue.");
          running.current = false; setEnabled(false); player.stop(); translationRef.current.stop();
        }
      } finally { if (!controller.signal.aborted) refreshTimer = setTimeout(() => void refresh(), 3000); }
    }
    async function join() {
      try {
        const response = await fetch(`/api/sessions/${id}/join`, { method: "POST", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (controller.signal.aborted) return;
        roomRef.current = data; setRoom(data);
        // Seed the floor once; the 500 ms poll owns it from here.
        if (floorRef.current === null) { floorRef.current = data.floor; setFloor(data.floor); }
        void peer.connect(id); void refresh();
      } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Impossible de rejoindre."); }
    }
    void join();
    // Leaving the page tears the microphone down for privacy, but the session stays active:
    // a receiving phone whose screen went dark must still speak when it comes back.
    const visibility = () => {
      if (document.hidden) { queue.current = []; player.stop(); turns.commit(); return; }
      if (!running.current || controller.signal.aborted) return;
      void (async () => {
        try {
          await player.unlock();
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
      unsubscribe(); turns.dispose(); peer.disconnect(); player.dispose();
      running.current = false; queue.current = []; speaking.current = false;
      publisher.current = null; transport.current = null; voice.current = null;
    };
  }, [id, playQueue, syncMicrophone]);

  async function start() {
    if (running.current) return;
    setMessage("");
    try {
      // Same gesture unlocks playback: the browser has no separate sound permission to ask for.
      await voice.current?.unlock();
      running.current = true; setEnabled(true);
      await translation.start();
      syncMicrophone();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Autorisez le micro puis réessayez."); }
  }
  function stop() {
    running.current = false; setEnabled(false); queue.current = [];
    publisher.current?.commit(); translation.stop(); voice.current?.stop();
  }
  async function takeFloor() {
    if (claiming || floorRef.current === roomRef.current?.me.slot) return;
    setClaiming(true);
    setMessage("");
    try {
      const slot = await transport.current?.takeFloor();
      if (typeof slot === "number") { floorRef.current = slot; setFloor(slot); syncMicrophone(); }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Impossible de prendre la parole."); }
    finally { setClaiming(false); }
  }
  function toggleSound() {
    const next = !sound.current;
    sound.current = next; setSoundOn(next);
    if (!next) { queue.current = []; voice.current?.stop(); speaking.current = false; }
    syncMicrophone();
  }
  async function playTestTone() {
    setMessage("");
    try { await voice.current?.testTone(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Le son est indisponible."); }
  }
  const readAudioState = useCallback(() => ({
    context: voice.current?.contextState ?? "absent",
    queued: queue.current.length,
    speaking: speaking.current,
    running: running.current,
    sound: sound.current,
  }), []);
  const hasFloor = room ? floor === room.me.slot : false;
  return { room, message: message || translation.message, incoming, voiceStatus, enabled, soundOn, hasFloor, claiming, received, translation, start, stop, takeFloor, toggleSound, playTestTone, readAudioState };
}
