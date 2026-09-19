export type Language = "fr" | "en" | "th";
export type Participant = { slot: number; language: Language; online: boolean; voiceStatus: "none" | "learning" | "ready" | "verification_required" };
export type SharedSession = { id: string; expiresAt: string; me: Participant; peer: Participant | null };
export type PeerEvent = { id: string; turnId: string; text: string; committed: boolean };
export type ReceivedEvent = PeerEvent & { seq: string };
export interface PeerTransport {
  connect(sessionId: string): Promise<void>;
  send(event: PeerEvent): Promise<void>;
  subscribe(cb: (event: ReceivedEvent) => void): () => void;
  disconnect(): void;
}
export const languageNames: Record<Language, string> = { fr: "Français", en: "English", th: "ไทย" };
