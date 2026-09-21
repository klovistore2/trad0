export type Language = "fr" | "en" | "th";
export type VoiceRange = "low" | "high";
export type Participant = { slot: number; language: Language; online: boolean; voiceRange: VoiceRange | null; voiceTier: number; useClone: boolean; consented: boolean; voiceStatus: "none" | "learning" | "ready" | "verification_required" };
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
export const languageNames: Record<Language, string> = { fr: "Français", en: "English", th: "ไทย" };
