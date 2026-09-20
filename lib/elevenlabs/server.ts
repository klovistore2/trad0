import "server-only";
import { HttpError } from "@/lib/server/http";

export function elevenHeaders() {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw new HttpError(503, "La voix n’est pas encore configurée.");
  return { "xi-api-key": key };
}
const fallbacks = new Map<string, string>();
// Before a clone exists, the receiver should still hear a voice in the speaker's own range.
// `labels.gender` describes the voice itself and is the only matching signal the provider exposes.
export async function fallbackVoice(range?: "low" | "high") {
  const configured = range === "low" ? process.env.ELEVENLABS_VOICE_LOW?.trim()
    : range === "high" ? process.env.ELEVENLABS_VOICE_HIGH?.trim()
    : process.env.ELEVENLABS_FALLBACK_VOICE_ID?.trim();
  if (configured) return configured;
  const key = range ?? "neutral";
  const cached = fallbacks.get(key);
  if (cached) return cached;
  const response = await fetch("https://api.elevenlabs.io/v2/voices?category=premade&page_size=30", { headers: elevenHeaders(), signal: AbortSignal.timeout(10_000) });
  const data = await response.json();
  const voices: { voice_id?: unknown; labels?: { gender?: unknown } }[] = Array.isArray(data.voices) ? data.voices : [];
  const wanted = range === "low" ? "male" : range === "high" ? "female" : "neutral";
  const chosen = voices.find(voice => voice?.labels?.gender === wanted)
    ?? voices.find(voice => voice?.labels?.gender === "neutral")
    ?? voices[0];
  if (typeof chosen?.voice_id !== "string") throw new HttpError(502, "Aucune voix standard disponible. Vérifiez ElevenLabs.");
  fallbacks.set(key, chosen.voice_id);
  return chosen.voice_id;
}

export async function deleteVoice(voiceId: string) {
  const response = await fetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}`, { method: "DELETE", headers: elevenHeaders(), signal: AbortSignal.timeout(10_000) });
  if (!response.ok && response.status !== 404) throw new HttpError(502, "La suppression de la voix doit être réessayée.");
}
