"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OpenAITranslationProvider } from "@/lib/openai/translation-provider";
import { MockTranslationProvider } from "@/lib/translation/mock-provider";
import type { SessionStatus, TranslationProvider } from "@/types/translation";

type State = { status: SessionStatus; translation: string; original: string; message: string; demo: boolean };
const initialState: State = { status: "idle", translation: "", original: "", message: "", demo: false };

export function useTranslationSession() {
  const [state, setState] = useState(initialState);
  const provider = useRef<TranslationProvider | null>(null);
  const settling = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const stop = useCallback(() => {
    const current = provider.current;
    provider.current = null;
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

  const start = useCallback(async (demo = false) => {
    // Set the ref before awaiting anything, preventing duplicate starts.
    if (provider.current) return;
    const current = demo ? new MockTranslationProvider() : new OpenAITranslationProvider();
    provider.current = current;
    setState({ ...initialState, status: "connecting", demo });
    current.onStatus((status, message = "") => {
      if (provider.current !== current) return;
      if (status === "idle" || status.endsWith("error") || status === "microphone_denied") {
        clearTimeout(settling.current);
        provider.current = null;
        void current.disconnect();
      }
      setState(previous => ({ ...previous, status, message }));
    });
    current.onOriginalTranscript(event => {
      if (provider.current === current) setState(previous => ({ ...previous, original: (previous.original + event.delta).slice(-12_000) }));
    });
    current.onTranslatedText(event => {
      if (provider.current !== current) return;
      if (event.quality === "unreliable") {
        setState(previous => ({ ...previous, message: "Je n’ai pas bien compris. Réessayez." }));
        return;
      }
      setState(previous => ({ ...previous, status: "translating", message: "", translation: (previous.translation + event.delta).slice(-12_000) }));
      clearTimeout(settling.current);
      settling.current = setTimeout(() => {
        if (provider.current === current) setState(previous => ({ ...previous, status: "listening" }));
      }, 1100);
    });
    await current.connect({ targetLanguage: "th" });
  }, []);

  return { ...state, start, stop, active: ["connecting", "listening", "translating"].includes(state.status) };
}
