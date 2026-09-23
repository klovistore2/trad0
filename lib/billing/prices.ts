// Credits per use, shared by the server that bills and the page that estimates. Placeholder
// values until real provider costs are measured: change them here, nowhere else.
// A minute covers transcription, translation and speech in both directions.
export const CREDIT_PRICES = { minute: 10, tone: 1, clone: 50 } as const;
export type CreditUse = keyof typeof CREDIT_PRICES;

// Share of a conversation during which one person speaks. Used only for the estimate below.
export const SPEAKING_SHARE = 0.5;

// Remaining conversation time for the payer's own options: tone matching costs one analysis per
// window of their speech, and clones still to come are set aside first. An estimate, not a promise.
export function creditEstimate({ balance, tone, toneWindowSeconds, clonesToCome }: {
  balance: number; tone: boolean; toneWindowSeconds: number; clonesToCome: number;
}) {
  const tonePerMinute = tone ? (60 * SPEAKING_SHARE / toneWindowSeconds) * CREDIT_PRICES.tone : 0;
  const perMinute = CREDIT_PRICES.minute + tonePerMinute;
  const cloneCost = clonesToCome * CREDIT_PRICES.clone;
  return { minutes: Math.max(0, Math.floor((balance - cloneCost) / perMinute)), perMinute: Math.round(perMinute * 10) / 10, cloneCost };
}
