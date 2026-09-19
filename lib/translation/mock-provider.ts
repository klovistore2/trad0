import type { SessionStatus, TranscriptEvent, TranslationProvider } from "@/types/translation";

// Scripted preview, never presented as live microphone translation.
export class MockTranslationProvider implements TranslationProvider {
  private timer?: ReturnType<typeof setInterval>;
  private original: (event: TranscriptEvent) => void = () => {};
  private translated: (event: TranscriptEvent) => void = () => {};
  private status: (status: SessionStatus) => void = () => {};
  onOriginalTranscript(cb: typeof this.original) { this.original = cb; }
  onTranslatedText(cb: typeof this.translated) { this.translated = cb; }
  onStatus(cb: typeof this.status) { this.status = cb; }
  async connect() {
    this.status("listening");
    this.original({ delta: "Bonjour ! Je suis content de vous rencontrer. On prend un café ensemble ?", quality: "unknown" });
    const words = ["สวัสดี", "! ", "ยินดี", "ที่ได้", "รู้จัก", "นะ ", "ไป", "ดื่ม", "กาแฟ", "ด้วยกัน", "ไหม", "?"];
    let index = 0;
    this.timer = setInterval(() => {
      this.translated({ delta: words[index++], quality: "unknown" });
      if (index === words.length) { clearInterval(this.timer); this.status("idle"); }
    }, 240);
  }
  async disconnect() { clearInterval(this.timer); }
}
