export type SessionStatus = "idle" | "connecting" | "listening" | "translating" | "microphone_denied" | "provider_error" | "network_error";
export type TranscriptEvent = {
  delta: string;
  // The translation API does not expose a calibrated confidence score.
  quality: "unknown" | "unreliable";
};
export type TranslationEvent = TranscriptEvent;
export type TranslationSessionConfig = { targetLanguage: string };
export interface TranslationProvider {
  connect(config: TranslationSessionConfig): Promise<void>;
  disconnect(): Promise<void>;
  onOriginalTranscript(cb: (event: TranscriptEvent) => void): void;
  onTranslatedText(cb: (event: TranslationEvent) => void): void;
  onStatus(cb: (status: SessionStatus, message?: string) => void): void;
}
