"use client";
import { useEffect, useRef } from "react";
import type { Participant } from "@/types/session";
import { enoughForLanguageDetection } from "@/lib/translation/language";

export function useLanguageDetection(id: string, me: Participant | undefined, original: string, refresh: () => void) {
  const latest = useRef({ me, original, refresh, offset: 0 });
  useEffect(() => {
    const previous = latest.current;
    const changed = previous.me && me && previous.me.languageRevision !== me.languageRevision;
    let offset = changed ? previous.original.length : previous.offset;
    if (original.length < offset) offset = 0;
    latest.current = { me, original, refresh, offset };
  }, [me, original, refresh]);
  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    let lastAttempt = 0;
    let lastSample = "";
    let revision: number | undefined;
    const timer = setInterval(async () => {
      const { me, original, offset } = latest.current;
      if (!me) return;
      if (revision !== me.languageRevision) {
        // On an explicit return to Auto, use new speech, not the transcript corrected earlier.
        revision = me.languageRevision;
        lastSample = "";
      }
      if (busy || !me.languageAuto || me.languageDetected || me.languageAttempts >= 3 || Date.now() - lastAttempt < 11_000) return;
      const text = original.slice(offset).slice(-600).trim();
      if (!enoughForLanguageDetection(text) || text === lastSample) return;
      busy = true; lastSample = text; lastAttempt = Date.now();
      try {
        await fetch(`/api/sessions/${id}/language`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, revision }), signal: controller.signal,
        });
      } catch { /* Detection never interrupts the conversation; the menus remain available. */ }
      finally {
        busy = false;
        if (!controller.signal.aborted) latest.current.refresh();
      }
    }, 1500);
    return () => { controller.abort(); clearInterval(timer); };
  }, [id]);
}
