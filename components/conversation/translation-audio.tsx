"use client";
import { useEffect, useRef, useState } from "react";
import { ElevenLabsVoiceProvider } from "@/lib/elevenlabs/voice-provider";
import type { VoiceStatus } from "@/types/voice";

export function TranslationAudio({ text }: { text: string }) {
  const voice = useRef<ElevenLabsVoiceProvider | null>(null);
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [message, setMessage] = useState("");
  useEffect(() => {
    const player = new ElevenLabsVoiceProvider((next, error = "") => { setStatus(next); setMessage(error); });
    voice.current = player;
    return () => { player.dispose(); voice.current = null; };
  }, []);
  const active = status === "loading" || status === "playing";
  return <div>
    <button className="demo-button" onClick={() => {
      if (active) { voice.current?.stop(); return; }
      void voice.current?.speakStream({ language: "en", textStream: (async function* () { yield text.slice(-4000) + " "; })() }).catch(() => {});
    }}>{active ? "■ Arrêter la lecture" : "♫ Écouter en anglais"}</button>
    {message && <p className="error-message" role="alert">{message}</p>}
  </div>;
}
