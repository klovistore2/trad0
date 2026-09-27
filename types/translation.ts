import type { StringKey } from "@/lib/i18n/strings";

export type SessionStatus = "idle" | "connecting" | "listening" | "translating" | "microphone_denied" | "provider_error" | "network_error";
export type TranscriptEvent = {
  delta: string;
  // The translation API does not expose a calibrated confidence score.
  quality: "unknown" | "unreliable";
};
export type TranslationEvent = TranscriptEvent;
export type TranslationSessionConfig = { targetLanguage: string; sessionId?: string; microphoneEnabled?: boolean; transcriptionOnly?: boolean };
export interface TranslationProvider {
  connect(config: TranslationSessionConfig): Promise<void>;
  disconnect(): Promise<void>;
  setMicrophoneEnabled?(enabled: boolean): void;
  setTargetLanguage?(language: string): void;
  getStream?(): MediaStream | undefined;
  onTranslatedAudio?(cb: (track: MediaStreamTrack | null) => void): void;
  commitInput?(): void;
  onOriginalTranscript(cb: (event: TranscriptEvent) => void): void;
  onTranslatedText(cb: (event: TranslationEvent) => void): void;
  // Messages are keys, shown in the reader's own language; never provider text.
  onStatus(cb: (status: SessionStatus, message?: StringKey) => void): void;
}
