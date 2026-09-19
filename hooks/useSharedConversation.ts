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
  const transport = useRef<NeonPeerTransport | null>(null);
  const publisher = useRef<TurnPublisher | null>(null);
  const voice = useRef<ElevenLabsVoiceProvider | null>(null);
  const audioEnabled = useRef(false);
  const queue = useRef<ReceivedEvent[]>([]);
  const speaking = useRef(false);
  const roomRef = useRef<SharedSession | null>(null);
  const translation = useTranslationSession({ sessionId: id, targetLanguage: room?.peer?.language || (room?.me.language === "fr" ? "en" : "fr"), onDelta: delta => publisher.current?.append(delta) });
  const translationRef = useRef(translation);
  useEffect(() => { translationRef.current = translation; }, [translation]);

  const playQueue = useCallback(async () => {
    if (speaking.current || !audioEnabled.current || !voice.current) return;
    speaking.current = true;
    translationRef.current.setMicrophoneEnabled(false);
    try {
      while (audioEnabled.current && queue.current.length) {
        const event = queue.current.shift()!;
        await voice.current.speakStream({ sessionId: id, language: roomRef.current?.me.language || "fr", textStream: (async function* () { yield event.text + " "; })() });
      }
    } catch (error) {
      queue.current = [];
      setMessage(error instanceof Error ? error.message : "Le son est indisponible. Le texte reste accessible.");
    } finally {
      speaking.current = false;
      if (audioEnabled.current) translationRef.current.setMicrophoneEnabled(true);
    }
  }, [id]);

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
    const unsubscribe = peer.subscribe(event => {
      if (controller.signal.aborted) return;
      setIncoming(event.text);
      if (event.committed && !committed.has(event.turnId)) {
        committed.add(event.turnId);
        if (committed.size > 500) committed.delete(committed.values().next().value!);
        if (audioEnabled.current) {
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
          audioEnabled.current = false; setEnabled(false); player.stop(); translationRef.current.stop();
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
        void peer.connect(id); void refresh();
      } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : "Impossible de rejoindre."); }
    }
    void join();
    const hide = () => {
      if (document.hidden) {
        audioEnabled.current = false; setEnabled(false); queue.current = []; player.stop(); turns.commit();
      }
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      controller.abort(); clearTimeout(refreshTimer); document.removeEventListener("visibilitychange", hide);
      unsubscribe(); turns.dispose(); peer.disconnect(); player.dispose();
      audioEnabled.current = false; queue.current = []; speaking.current = false;
      publisher.current = null; transport.current = null; voice.current = null;
    };
  }, [id, playQueue]);

  async function start() {
    if (audioEnabled.current) return;
    setMessage("");
    try {
      await voice.current?.unlock();
      audioEnabled.current = true; setEnabled(true);
      await translation.start();
      if (speaking.current) translationRef.current.setMicrophoneEnabled(false);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Autorisez le son puis réessayez."); }
  }
  function stop() {
    audioEnabled.current = false; setEnabled(false); queue.current = [];
    publisher.current?.commit(); translation.stop(); voice.current?.stop();
  }
  return { room, message: message || translation.message, incoming, voiceStatus, enabled, translation, start, stop };
}
