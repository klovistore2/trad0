import type { Language } from "@/types/session";
export type ContextTurn = { speaker: number; original: string; translation?: string; sourceLanguage: Language; targetLanguage: Language };
export type ContextTranslation = { speaker: number; text: string; language: Language };
// Ephemeral, bounded history. Original words are authoritative, translations are supplementary.
export class ConversationMemory {
  private translated = new Map<string, ContextTranslation>();
  private turns = new Map<string, ContextTurn>();
  add(id: string, turn: ContextTurn) {
    this.turns.set(id, { ...turn, original: turn.original.slice(-4000), translation: turn.translation?.slice(-4000) });
    while (this.turns.size > 12) this.turns.delete(this.turns.keys().next().value!);
  }
  addTranslation(id: string, turn: ContextTranslation) {
    this.translated.set(id, { ...turn, text: turn.text.slice(-300) });
    while (this.translated.size > 6) this.translated.delete(this.translated.keys().next().value!);
  }
  recentTranslations(): ContextTranslation[] { return [...this.translated.values()]; }
  recent(): ContextTurn[] { return [...this.turns.values()]; }
  clear() { this.turns.clear(); this.translated.clear(); }
}
