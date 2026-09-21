import { TurnPublisher } from "@/lib/realtime/turn-publisher";
import { ConversationMemory } from "./memory";
import type { ConversationMode } from "./modes";
import type { Language, PeerEvent } from "@/types/session";

export type PipelineTiming = { waitMs: number; translationMs: number; publishMs: number; contextTurns: number; model: string };
export class ConversationPipeline {
  readonly memory = new ConversationMemory();
  mode: ConversationMode = "direct";
  desired: ConversationMode = "direct";
  switching = false;
  timing: PipelineTiming | null = null;
  private source: TurnPublisher;
  private translated: TurnPublisher;
  private queue = Promise.resolve();
  private pending = 0;
  private controller = new AbortController();
  private boundary?: ReturnType<typeof setTimeout>;
  private lastSource = 0;
  constructor(private options: {
    sessionId: string; speaker: () => number; languages: () => { sourceLanguage: Language; targetLanguage: Language };
    send: (event: PeerEvent) => Promise<void>; switchMode: (mode: ConversationMode) => Promise<void>;
    canSwitch?: () => boolean; onTranslation: (text: string) => void; onError: (message: string) => void;
  }) {
    this.source = new TurnPublisher(event => { if (event.committed) this.commitSource(event); });
    this.translated = new TurnPublisher(event => {
      if (this.mode !== "direct") return;
      if (event.committed) this.memory.addTranslation(event.turnId, { speaker: options.speaker(), text: event.text, language: options.languages().targetLanguage });
      void options.send({ ...event, kind: "translation", mode: "direct", ...options.languages() });
    });
  }
  original(delta: string) {
    if (this.controller.signal.aborted) return;
    this.lastSource = Date.now(); this.source.append(delta); this.scheduleBoundary();
  }
  translation(delta: string) {
    if (this.mode !== "direct" || this.controller.signal.aborted) return;
    this.translated.append(delta); this.scheduleBoundary();
  }
  private commitSource(event: PeerEvent) {
    const language = this.options.languages();
    const original = event.text;
    const waitMs = Math.max(0, Date.now() - this.lastSource);
    if (this.mode === "direct") {
      this.memory.add(event.turnId, { speaker: this.options.speaker(), original, ...language });
      void this.options.send({ ...event, kind: "original", mode: "direct", ...language });
      return;
    }
    this.pending++;
    this.queue = this.queue.then(async () => {
      if (this.controller.signal.aborted) return;
      // Clamp text context to fit the route's total request budget; keep the latest turns.
      const context = this.memory.recent().map(turn => ({ ...turn, original: turn.original.slice(-700), translation: turn.translation?.slice(-300) }));
      const response = await fetch("/api/translate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: this.options.sessionId, text: original, context, recentTranslations: this.memory.recentTranslations() }), signal: this.controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Translation failed. Try again.");
      if (this.controller.signal.aborted) return;
      const actualLanguage = { ...language, targetLanguage: data.targetLanguage as Language };
      this.memory.add(event.turnId, { speaker: this.options.speaker(), original, translation: data.text, ...actualLanguage });
      this.options.onTranslation(data.text);
      const publishStarted = performance.now();
      const timing = { waitMs, translationMs: data.translationMs, contextTurns: data.contextTurns, model: data.model, publishMs: 0 };
      await this.options.send({ ...event, text: data.text, original, kind: "translation", mode: "context", ...actualLanguage, timing });
      this.timing = { ...timing, publishMs: Math.round(performance.now() - publishStarted) };
    }).catch(error => {
      if (!this.controller.signal.aborted) this.memory.add(event.turnId, { speaker: this.options.speaker(), original, ...language });
      if (!this.controller.signal.aborted) this.options.onError(error instanceof Error ? error.message : "Translation failed.");
    }).finally(() => { this.pending--; this.scheduleBoundary(); });
  }
  receive(event: PeerEvent, speaker: number) {
    if (!event.committed || !event.sourceLanguage || !event.targetLanguage) return;
    if (event.kind === "translation") this.memory.addTranslation(event.turnId, { speaker, text: event.text, language: event.targetLanguage });
    const original = event.kind === "original" ? event.text : event.original;
    if (original) this.memory.add(event.turnId, { speaker, original, ...(event.kind === "translation" ? { translation: event.text } : {}), sourceLanguage: event.sourceLanguage, targetLanguage: event.targetLanguage });
  }
  requestMode(mode: ConversationMode) { this.desired = mode; this.scheduleBoundary(); }
  flush() { this.source.commit(); this.translated.commit(); this.scheduleBoundary(); }
  private scheduleBoundary() {
    clearTimeout(this.boundary);
    if (this.desired === this.mode || this.controller.signal.aborted) return;
    this.boundary = setTimeout(() => void this.applyMode(), 1800);
  }
  private async applyMode() {
    if (this.pending || this.switching || this.controller.signal.aborted || this.desired === this.mode) return;
    if (this.options.canSwitch && !this.options.canSwitch()) { this.scheduleBoundary(); return; }
    this.flush();
    if (this.pending) return;
    this.switching = true;
    const next = this.desired;
    const previous = this.mode;
    this.mode = next;
    try {
      await this.options.switchMode(next);
      if (!this.controller.signal.aborted) this.mode = next;
    } catch (error) { this.mode = previous; this.options.onError(error instanceof Error ? error.message : "Could not change mode."); }
    finally { this.switching = false; }
  }
  dispose() { this.controller.abort(); clearTimeout(this.boundary); this.source.dispose(); this.translated.dispose(); this.memory.clear(); }
}
