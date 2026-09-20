export type VoiceRange = "low" | "high";

// Autocorrelation estimate of the fundamental frequency. Returns 0 for silence or
// unvoiced frames, which keeps consonants and background noise out of the average.
export function estimatePitch(samples: Float32Array, sampleRate: number, min = 70, max = 400) {
  const size = samples.length;
  if (size < 256 || sampleRate <= 0) return 0;
  let power = 0;
  for (let i = 0; i < size; i++) power += samples[i] * samples[i];
  if (Math.sqrt(power / size) < 0.012) return 0;
  const minLag = Math.max(1, Math.floor(sampleRate / max));
  const maxLag = Math.min(size - 1, Math.floor(sampleRate / min));
  if (maxLag <= minLag) return 0;
  const scores = new Float32Array(maxLag + 1);
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0, head = 0, tail = 0;
    for (let i = 0; i < size - lag; i++) {
      sum += samples[i] * samples[i + lag];
      head += samples[i] * samples[i];
      tail += samples[i + lag] * samples[i + lag];
    }
    // Normalised against both windows, so a long lag cannot win by averaging over fewer samples.
    const spread = Math.sqrt(head * tail);
    scores[lag] = spread > 0 ? sum / spread : 0;
    if (scores[lag] > best) best = scores[lag];
  }
  if (best < 0.5) return 0;
  // The shortest lag that reaches the best peak is the true period; a longer one is an
  // octave error, which is exactly what would misread a low voice as a high one.
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (scores[lag] < best * 0.9) continue;
    let peak = lag;
    while (peak < maxLag && scores[peak + 1] > scores[peak]) peak++;
    return sampleRate / peak;
  }
  return 0;
}

// Pitch is a proxy for vocal range, never for gender or identity, and stays correctable.
export const RANGE_BOUNDARY_HZ = 160;
export const RANGE_MIN_FRAMES = 30;

export function medianPitch(pitches: number[]) {
  const voiced = pitches.filter(pitch => pitch > 0).sort((a, b) => a - b);
  if (!voiced.length) return 0;
  return voiced[Math.floor(voiced.length / 2)];
}

export function classifyRange(pitches: number[]): VoiceRange | null {
  const voiced = pitches.filter(pitch => pitch > 0);
  if (voiced.length < RANGE_MIN_FRAMES) return null;
  return medianPitch(pitches) < RANGE_BOUNDARY_HZ ? "low" : "high";
}
