export type VoiceStatus = "idle" | "loading" | "playing" | "error";
// One sentence to speak, identified by its event so a prepared synthesis is matched to it.
export type SpeechRequest = { id: string; text: string; language: string; sessionId?: string; speech?: SpeechMetadata };
export interface VoiceProvider {
  unlock(): Promise<void>;
  // A whole sentence: the LLM answers in full, so there is no token stream to feed it.
  speakStream(options: { text: string; language: string; sessionId?: string; signal?: AbortSignal; speech?: SpeechMetadata; id?: string }): Promise<void>;
  // Prepares the next sentence while the current one plays; speakStream with the same id uses it.
  prefetch?(request: SpeechRequest): void;
  stop(): void;
  dispose(): void;
}
import type { SpeechMetadata } from "@/lib/audio/speech-options";
