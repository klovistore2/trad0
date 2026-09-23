// Credits at zero stop the conversation for both people and block new ones, except for an admin,
// who is billed but never stopped; the DEV reset restores the welcome amount. Real Neon, no
// provider call. Run with TEST_BROWSER_SCRIPT=tests/browser/credits.mjs.
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { encode } from 'next-auth/jwt';
import { createRequire } from 'node:module';
import { neon } from '@neondatabase/serverless';
createRequire(import.meta.url)('@next/env').loadEnvConfig(process.cwd());
const baseURL = process.env.TEST_BASE_URL || 'http://localhost:3100';
const sql = neon(process.env.DATABASE_URL);
const browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const users = [], sessions = [];
const create = { language: 'fr', peerLanguage: 'th', languageAuto: false, peerLanguageAuto: false };
const balance = async id => (await sql`SELECT COALESCE(SUM(amount),0)::int b FROM adu_credit_ledger WHERE user_id=${id}`)[0].b;
// The test server lists @example.test in ADMIN_MAIL; @example.org is an ordinary account.
async function account(domain) {
  const id = randomUUID(), email = `credits-${Date.now()}-${users.length}@${domain}`; users.push(id);
  await sql`INSERT INTO adu_users(id,email,provider) VALUES(${id},${email},'google')`;
  await sql`INSERT INTO adu_credit_ledger(user_id,kind,amount) VALUES(${id},'welcome',300)`;
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, permissions: ['microphone'] });
  await context.addCookies([{ name: 'authjs.session-token', url: baseURL,
    value: await encode({ token: { sub: id, email }, secret: process.env.AUTH_SECRET, salt: 'authjs.session-token' }) }]);
  return { id, context };
}
async function conversation(host) {
  const page = await host.context.newPage(); await page.goto('/fr');
  const created = await page.request.post('/api/sessions', { headers: { origin: baseURL }, data: create });
  assert.equal(created.status(), 200); const { id } = await created.json(); sessions.push(id);
  await page.goto(`/session/${id}`); await page.getByRole('button', { name: /Pas maintenant/ }).click();
  const guest = await (await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, permissions: ['microphone'] })).newPage();
  await guest.goto(`/join/${id}`);
  await guest.getByRole('button', { name: 'เริ่มพูด' }).or(guest.getByRole('button', { name: 'Start talking' })).waitFor();
  return { id, page, guest };
}
const hostStopped = 'Vous n’avez plus de crédits. La conversation est interrompue.';
try {
  // An ordinary creator at zero: both phones stop, each in its own language, with no way to speak.
  const payer = await account('example.org');
  const { id, page: a, guest: b } = await conversation(payer);
  await sql`INSERT INTO adu_credit_ledger(user_id,session_id,kind,amount) VALUES(${payer.id},${id},'minute',${-await balance(payer.id)})`;
  await a.getByText(hostStopped).waitFor({ timeout: 15000 });
  await b.getByText('การสนทนาถูกหยุด: ผู้ที่เชิญคุณไม่มีเครดิตเหลือแล้ว').waitFor({ timeout: 15000 });
  await expect(a.locator('.controls .primary-button')).toHaveCount(0);
  await expect(b.locator('.controls .primary-button')).toHaveCount(0);
  await expect(a.locator('.pipeline-diagnostics')).toHaveCount(0); // No DEV panel for an ordinary account.
  // The server refuses paid work too, whatever the page shows.
  for (const [path, data] of [['/api/translate', { sessionId: id, text: 'Bonjour', context: [], recentTranslations: [] }], ['/api/openai/transcription-token', { sessionId: id }], ['/api/elevenlabs/speak', { sessionId: id, text: 'Bonjour', language: 'fr' }]])
    assert.equal((await b.request.post(path, { headers: { origin: baseURL }, data })).status(), 402, path);
  // No new conversation either, on the page and at the API.
  assert.equal((await a.request.post('/api/sessions', { headers: { origin: baseURL }, data: create })).status(), 402);
  const home = await payer.context.newPage(); await home.goto('/fr');
  await home.getByText('Vous n’avez plus de crédits pour lancer une conversation.').waitFor();
  await home.getByRole('button', { name: 'Ajouter des crédits' }).click();
  await home.getByText('Le paiement arrive bientôt.').waitFor();
  await home.close();
  // No minute is billed while stopped.
  const stopped = await balance(payer.id); await a.waitForTimeout(4000); assert.equal(await balance(payer.id), stopped);
  // Topped up: the conversation resumes on its own.
  await sql`INSERT INTO adu_credit_ledger(user_id,kind,amount) VALUES(${payer.id},'purchase',300)`;
  await expect(a.getByText(hostStopped)).toHaveCount(0, { timeout: 15000 });
  await expect(a.locator('.controls .primary-button')).toHaveCount(1);
  // Settings: credits left and an estimate for this account's options (no clone consent, no tone).
  await a.getByRole('button', { name: 'Settings' }).click();
  await expect(a.locator('.credit-line', { hasText: 'Credits left' })).toContainText(/\d/);
  await expect(a.locator('.credit-line', { hasText: 'Conversation time left' })).toContainText(/≈ \d+ min/);
  await a.getByRole('button', { name: 'Add credits' }).waitFor();
  await a.locator('.settings').screenshot({ path: '/tmp/trad0-credits-settings.png' });

  // An admin below zero is still billed but never stopped, and the DEV reset restores the welcome amount.
  const admin = await account('example.test');
  await sql`INSERT INTO adu_credit_ledger(user_id,kind,amount) VALUES(${admin.id},'minute',-350)`;
  const adminHome = await admin.context.newPage(); await adminHome.goto('/fr');
  await expect(adminHome.getByText('Vous n’avez plus de crédits pour lancer une conversation.')).toHaveCount(0);
  await adminHome.close();
  const { page: c } = await conversation(admin);
  await c.waitForTimeout(4000);
  await expect(c.getByText(hostStopped)).toHaveCount(0);
  await expect(c.locator('.controls .primary-button')).toHaveCount(1);
  await c.locator('.pipeline-diagnostics > summary').click();
  await c.getByRole('button', { name: 'Reset credits' }).click();
  await c.getByText('Balance reset to 300').waitFor();
  assert.equal(await balance(admin.id), 300);
  assert.equal((await sql`SELECT count(*)::int n FROM adu_credit_ledger WHERE user_id=${admin.id} AND kind='welcome'`)[0].n, 1, 'the welcome grant is never given twice');
  console.log('PASS: zero credits stop both phones in their language, paid routes and new conversations refused, no billing while stopped, top-up resumes; an admin is never stopped and the DEV reset restores 300.');
} finally {
  await browser.close();
  for (const id of sessions) await sql`DELETE FROM adu_sessions WHERE id=${id}`;
  for (const id of users) await sql`DELETE FROM adu_users WHERE id=${id}`;
}
