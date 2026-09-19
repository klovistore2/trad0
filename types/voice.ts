export type VoiceStatus = "idle" | "loading" | "playing" | "error";
export interface VoiceProvider {
  unlock(): Promise<void>;
  speakStream(options: { textStream: AsyncIterable<string>; language: string; sessionId?: string; signal?: AbortSignal }): Promise<void>;
  stop(): void;
  dispose(): void;
}
