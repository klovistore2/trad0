// Credits at zero stop the conversation for both people, block new ones, and the DEV reset brings
// them back. Real Neon, no provider call. Run with TEST_BROWSER_SCRIPT=tests/browser/credits.mjs.
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { encode } from 'next-auth/jwt';
import { createRequire } from 'node:module';
import { neon } from '@neondatabase/serverless';
createRequire(import.meta.url)('@next/env').loadEnvConfig(process.cwd());
const baseURL = process.env.TEST_BASE_URL || 'http://localhost:3100';
const sql = neon(process.env.DATABASE_URL);
// The test server lists @example.test in ADMIN_MAIL, so this creator sees the DEV panel.
const email = `credits-${Date.now()}@example.test`; const userId = randomUUID(); let sessionId;
const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const balance = async () => (await sql`SELECT COALESCE(SUM(amount),0)::int b FROM adu_credit_ledger WHERE user_id=${userId}`)[0].b;
try {
  await sql`INSERT INTO adu_users(id,email,provider) VALUES(${userId},${email},'google')`;
  await sql`INSERT INTO adu_credit_ledger(user_id,kind,amount) VALUES(${userId},'welcome',300)`;
  const host = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, permissions: ['microphone'] });
  await host.addCookies([{ name: 'authjs.session-token', url: baseURL,
    value: await encode({ token: { sub: userId, email }, secret: process.env.AUTH_SECRET, salt: 'authjs.session-token' }) }]);
  const a = await host.newPage(); await a.goto('/fr');
  const created = await a.request.post('/api/sessions', { headers: { origin: baseURL }, data: { language: 'fr', peerLanguage: 'th', languageAuto: false, peerLanguageAuto: false } });
  assert.equal(created.status(), 200); sessionId = (await created.json()).id;
  await a.goto(`/session/${sessionId}`); await a.getByRole('button', { name: /Pas maintenant/ }).click();
  const guest = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, permissions: ['microphone'] });
  const b = await guest.newPage(); await b.goto(`/join/${sessionId}`);
  await b.getByRole('button', { name: 'เริ่มพูด' }).or(b.getByRole('button', { name: 'Start talking' })).waitFor();

  // Spend everything: both phones stop, each in its own language, with no way to speak.
  await sql`INSERT INTO adu_credit_ledger(user_id,session_id,kind,amount) VALUES(${userId},${sessionId},'minute',${-await balance()})`;
  await a.getByText('Vous n’avez plus de crédits. La conversation est interrompue.').waitFor({ timeout: 15000 });
  await b.getByText('การสนทนาถูกหยุด: ผู้ที่เชิญคุณไม่มีเครดิตเหลือแล้ว').waitFor({ timeout: 15000 });
  await expect(a.locator('.controls .primary-button')).toHaveCount(0);
  await expect(b.locator('.controls .primary-button')).toHaveCount(0);
  // The server refuses paid work too, whatever the page shows.
  for (const [path, data] of [['/api/translate', { sessionId, text: 'Bonjour', context: [], recentTranslations: [] }], ['/api/openai/transcription-token', { sessionId }], ['/api/elevenlabs/speak', { sessionId, text: 'Bonjour', language: 'fr' }]])
    assert.equal((await b.request.post(path, { headers: { origin: baseURL }, data })).status(), 402, path);
  // No new conversation either, on the page and at the API.
  assert.equal((await a.request.post('/api/sessions', { headers: { origin: baseURL }, data: { language: 'fr', peerLanguage: 'th', languageAuto: false, peerLanguageAuto: false } })).status(), 402);
  const home = await host.newPage(); await home.goto('/fr');
  await home.getByText('Vous n’avez plus de crédits pour lancer une conversation.').waitFor();
  await home.getByRole('button', { name: 'Ajouter des crédits' }).click();
  await home.getByText('Le paiement arrive bientôt.').waitFor();
  await home.close();
  // No minute is billed while stopped.
  const stopped = await balance(); await a.waitForTimeout(4000); assert.equal(await balance(), stopped);

  // DEV reset: back to the welcome amount, and the conversation resumes on its own.
  await a.locator('.pipeline-diagnostics > summary').click();
  await a.getByRole('button', { name: 'Reset credits' }).click();
  await a.getByText('Balance reset to 300').waitFor();
  assert.equal(await balance(), 300);
  await expect(a.getByText('Vous n’avez plus de crédits. La conversation est interrompue.')).toHaveCount(0, { timeout: 15000 });
  await expect(a.locator('.controls .primary-button')).toHaveCount(1);
  assert.equal((await sql`SELECT count(*)::int n FROM adu_credit_ledger WHERE user_id=${userId} AND kind='welcome'`)[0].n, 1, 'the welcome grant is never given twice');
  // Settings: credits left and an estimate for this account's options (no clone consent, no tone).
  await a.getByRole('button', { name: 'Settings' }).click();
  await expect(a.locator('.credit-line', { hasText: 'Credits left' })).toContainText(/2\d\d|300/);
  await expect(a.locator('.credit-line', { hasText: 'Conversation time left' })).toContainText(/≈ \d+ min/);
  await a.getByRole('button', { name: 'Add credits' }).waitFor();
  await a.locator('.settings').screenshot({ path: '/tmp/trad0-credits-settings.png' });
  console.log('PASS: zero credits stop both phones in their language, paid routes and new conversations refused, no billing while stopped, DEV reset resumes.');
} finally {
  await browser.close();
  if (sessionId) await sql`DELETE FROM adu_sessions WHERE id=${sessionId}`;
  await sql`DELETE FROM adu_users WHERE id=${userId}`;
}
