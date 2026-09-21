"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OpenAITranslationProvider } from "@/lib/openai/translation-provider";
import type { SessionStatus, TranslationProvider } from "@/types/translation";

type State = { status: SessionStatus; translation: string; original: string; message: string };
const initialState: State = { status: "idle", translation: "", original: "", message: "" };

export function useTranslationSession(options: { targetLanguage?: string; sessionId?: string; onDelta?: (delta: string) => void; onOriginal?: (delta: string) => void; onAudio?: (track: MediaStreamTrack | null) => void; shouldEnableMicrophone?: () => boolean } = {}) {
  const callbacks = useRef(options);
  useEffect(() => { callbacks.current = options; }, [options]);
  const [state, setState] = useState(initialState);
  const provider = useRef<TranslationProvider | null>(null);
  const settling = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const stop = useCallback(() => {
    const current = provider.current;
    provider.current = null;
    callbacks.current.onAudio?.(null);
    clearTimeout(settling.current);
    void current?.disconnect();
    setState(previous => ({ ...previous, status: "idle", message: "" }));
  }, []);

  useEffect(() => {
    const onHidden = () => { if (document.hidden) stop(); };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", stop);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", stop);
      clearTimeout(settling.current);
      const current = provider.current;
      provider.current = null;
      void current?.disconnect();
    };
  }, [stop]);

  const start = useCallback(async (transcriptionOnly = false) => {
    // Set the ref before awaiting anything, preventing duplicate starts.
    if (provider.current) return;
    const current: TranslationProvider = new OpenAITranslationProvider();
    provider.current = current;
    setState({ ...initialState, status: "connecting" });
    current.onStatus((status, message = "") => {
      if (provider.current !== current) return;
      if (status === "idle" || status.endsWith("error") || status === "microphone_denied") {
        clearTimeout(settling.current);
        provider.current = null;
        void current.disconnect();
      }
      setState(previous => ({ ...previous, status, message }));
    });
    current.onTranslatedAudio?.(track => { if (provider.current === current) callbacks.current.onAudio?.(track); });
    current.onOriginalTranscript(event => {
      if (provider.current === current) callbacks.current.onOriginal?.(event.delta);
      if (provider.current === current) setState(previous => ({ ...previous, original: (previous.original + event.delta).slice(-12_000) }));
    });
    current.onTranslatedText(event => {
      if (provider.current !== current) return;
      if (event.quality === "unreliable") {
        setState(previous => ({ ...previous, message: "Je n’ai pas bien compris. Réessayez." }));
        return;
      }
      callbacks.current.onDelta?.(event.delta);
      setState(previous => ({ ...previous, status: "translating", message: "", translation: (previous.translation + event.delta).slice(-12_000) }));
      clearTimeout(settling.current);
      settling.current = setTimeout(() => {
        if (provider.current === current) setState(previous => ({ ...previous, status: "listening" }));
      }, 1100);
    });
    await current.connect({
      targetLanguage: callbacks.current.targetLanguage || "en",
      sessionId: callbacks.current.sessionId,
      transcriptionOnly,
      // Read at connect time: the floor may already belong to the other person.
      microphoneEnabled: callbacks.current.shouldEnableMicrophone?.() ?? true,
    });
  }, []);

  return { ...state, start, stop, commitInput: () => provider.current?.commitInput?.(), setTargetLanguage: (language: string) => provider.current?.setTargetLanguage?.(language), getStream: () => provider.current?.getStream?.(), setMicrophoneEnabled: (enabled: boolean) => provider.current?.setMicrophoneEnabled?.(enabled), active: ["connecting", "listening", "translating"].includes(state.status) };
}
