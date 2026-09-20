import "server-only";
import { HttpError } from "@/lib/server/http";

export function elevenHeaders() {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) throw new HttpError(503, "La voix n’est pas encore configurée.");
  return { "xi-api-key": key };
}
let fallback: string | undefined;
export async function fallbackVoice() {
  const configured = process.env.ELEVENLABS_FALLBACK_VOICE_ID?.trim();
  if (configured) return configured;
  if (fallback) return fallback;
  const response = await fetch("https://api.elevenlabs.io/v2/voices?category=premade&page_size=1", { headers: elevenHeaders(), signal: AbortSignal.timeout(10_000) });
  const data = await response.json();
  if (!response.ok || typeof data.voices?.[0]?.voice_id !== "string") throw new HttpError(502, "Aucune voix standard disponible. Vérifiez ElevenLabs.");
  fallback = data.voices[0].voice_id as string;
  return fallback;
}
export async function deleteVoice(voiceId: string) {
  const response = await fetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}`, { method: "DELETE", headers: elevenHeaders(), signal: AbortSignal.timeout(10_000) });
  if (!response.ok && response.status !== 404) throw new HttpError(502, "La suppression de la voix doit être réessayée.");
}
