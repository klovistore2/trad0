import type { ConversationMode, ModePreference } from "@/lib/translation/modes";
import type { PipelineTiming } from "@/lib/translation/conversation-pipeline";
import type { SpeechMetadata } from "@/lib/audio/speech-options";
// App languages; direct translation has a smaller output catalogue (see translation/modes).
// Thai and Dutch use contextual translation followed by ElevenLabs.
export const LANGUAGES = ["fr", "en", "th", "es", "pt", "it", "de", "nl", "ja", "ko", "zh", "ru", "hi", "id", "vi"] as const;
export type Language = (typeof LANGUAGES)[number];
export const isLanguage = (value: unknown): value is Language =>
  typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
export type VoiceRange = "low" | "high";
export type Participant = { slot: number; hasAccount: boolean; preferredMode: ModePreference; activeMode: ConversationMode; language: Language; languageAuto: boolean; languageDetected: boolean; languageRevision: number; languageAttempts: number; online: boolean; voiceRange: VoiceRange | null; voiceTier: number; useClone: boolean; consented: boolean; voiceStatus: "none" | "learning" | "ready" | "verification_required" };
export type SharedSession = { id: string; expiresAt: string; floor: number | null; me: Participant; peer: Participant | null; diagnostics?: boolean; models?: { realtime: string; transcription: string; translation: string; voice: string } };
export type PeerEvent = { id: string; turnId: string; text: string; committed: boolean; kind?: "original" | "translation"; original?: string; mode?: ConversationMode; sourceLanguage?: Language; targetLanguage?: Language; timing?: PipelineTiming; speech?: SpeechMetadata };
export type ReceivedEvent = PeerEvent & { seq: string; ageMs?: number };
export interface PeerTransport {
  connect(sessionId: string): Promise<void>;
  send(event: PeerEvent): Promise<void>;
  subscribe(cb: (event: ReceivedEvent) => void): () => void;
  // Turn taking travels with the events stream, so a push transport keeps both in one channel.
  onFloor(cb: (slot: number | null) => void): void;
  takeFloor(): Promise<number | null>;
  releaseFloor(): Promise<number | null>;
  disconnect(): void;
}
export const languageNames: Record<Language, string> = {
  fr: "Français", en: "English", th: "ไทย", es: "Español", pt: "Português", it: "Italiano",
  de: "Deutsch", nl: "Nederlands", ja: "日本語", ko: "한국어", zh: "中文", ru: "Русский", hi: "हिन्दी",
  id: "Bahasa Indonesia", vi: "Tiếng Việt",
};
