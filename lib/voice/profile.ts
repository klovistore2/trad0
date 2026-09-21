import "server-only";
import { db } from "@/lib/neon/db";

// A signed-in creator keeps one clone across conversations. It lives in its own table so the
// session purge, which wipes participants, can never take a saved voice with it.
export type VoiceProfile = {
  provider_voice_id: string | null;
  voice_status: string;
  voice_tier: number;
  voice_range: "low" | "high" | null;
  consent_at: string | null;
};

export async function readProfile(userId: string) {
  const rows = await db()`SELECT provider_voice_id, voice_status, voice_tier, voice_range, consent_at
    FROM adu_voice_profiles WHERE user_id=${userId}`;
  return (rows[0] as VoiceProfile | undefined) ?? null;
}

export async function saveProfile(userId: string, voiceId: string, status: string, tier: number) {
  await db()`INSERT INTO adu_voice_profiles(user_id,provider_voice_id,voice_status,voice_tier,consent_at,updated_at)
    VALUES(${userId},${voiceId},${status},${tier},now(),now())
    ON CONFLICT (user_id) DO UPDATE SET provider_voice_id=EXCLUDED.provider_voice_id,
      voice_status=EXCLUDED.voice_status, voice_tier=EXCLUDED.voice_tier, updated_at=now()`;
}

export async function saveProfileRange(userId: string, range: "low" | "high") {
  await db()`INSERT INTO adu_voice_profiles(user_id,voice_range,updated_at) VALUES(${userId},${range},now())
    ON CONFLICT (user_id) DO UPDATE SET voice_range=EXCLUDED.voice_range, updated_at=now()`;
}

export async function saveProfileConsent(userId: string, consented: boolean) {
  await db()`INSERT INTO adu_voice_profiles(user_id,consent_at,updated_at)
    VALUES(${userId},CASE WHEN ${consented} THEN now() ELSE NULL END,now())
    ON CONFLICT (user_id) DO UPDATE SET consent_at=CASE WHEN ${consented} THEN now() ELSE NULL END, updated_at=now()`;
}

// Forgetting the clone is separate from deleting it at the provider: the caller does that first.
export async function clearProfileVoice(userId: string, keepConsent: boolean) {
  await db()`UPDATE adu_voice_profiles SET provider_voice_id=NULL, voice_status='none', voice_tier=0,
    consent_at=CASE WHEN ${keepConsent} THEN consent_at ELSE NULL END, updated_at=now() WHERE user_id=${userId}`;
}

export async function setProfileUseClone(userId: string, useClone: boolean) {
  await db()`INSERT INTO adu_voice_profiles(user_id,use_clone,updated_at) VALUES(${userId},${useClone},now())
    ON CONFLICT (user_id) DO UPDATE SET use_clone=EXCLUDED.use_clone, updated_at=now()`;
}

export async function userIdForParticipant(sessionId: string, slot: number) {
  const rows = await db()`SELECT user_id FROM adu_participants WHERE session_id=${sessionId} AND slot=${slot}`;
  return (rows[0]?.user_id as string | null) ?? null;
}
