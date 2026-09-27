import { createRequire } from 'node:module';
createRequire(import.meta.url)('@next/env').loadEnvConfig(process.cwd());
const url = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
if (!process.env.CRON_SECRET) throw new Error('CRON_SECRET is missing');
const response = await fetch(new URL('/api/cleanup', url), { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` }, signal: AbortSignal.timeout(60_000) });
// A partial failure carries its counts: sessions left to retry are worth seeing.
const result = await response.json().catch(() => ({}));
if (!response.ok) throw new Error(`Cleanup failed: ${response.status} ${JSON.stringify(result)}`);
console.log(result);
