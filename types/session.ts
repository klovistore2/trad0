// The output languages gpt-realtime-translate documents, plus Thai. Thai is documented as an
// input language only: it is offered so the limitation can be checked, not because it is proven.
export const LANGUAGES = ["fr", "en", "th", "es", "pt", "it", "de", "ja", "ko", "zh", "ru", "hi", "id", "vi"] as const;
export type Language = (typeof LANGUAGES)[number];
export const isLanguage = (value: unknown): value is Language =>
  typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);
export type VoiceRange = "low" | "high";
export type Participant = { slot: number; language: Language; languageAuto: boolean; languageDetected: boolean; languageRevision: number; languageAttempts: number; online: boolean; voiceRange: VoiceRange | null; voiceTier: number; useClone: boolean; consented: boolean; voiceStatus: "none" | "learning" | "ready" | "verification_required" };
export type SharedSession = { id: string; expiresAt: string; floor: number | null; me: Participant; peer: Participant | null };
export type PeerEvent = { id: string; turnId: string; text: string; committed: boolean };
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
  de: "Deutsch", ja: "日本語", ko: "한국어", zh: "中文", ru: "Русский", hi: "हिन्दी",
  id: "Bahasa Indonesia", vi: "Tiếng Việt",
};
// Thai is not among the documented output languages: a translation into it may not work.
export const UNVERIFIED_OUTPUT: readonly Language[] = ["th"];
