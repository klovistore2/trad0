import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { neon } from '@neondatabase/serverless';
createRequire(import.meta.url)('@next/env').loadEnvConfig(process.cwd());
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing');
const sql = neon(process.env.DATABASE_URL);
const migration = await readFile(new URL('../migrations/001_sessions.sql', import.meta.url), 'utf8');
await sql.transaction(migration.split(';').map(s => s.trim()).filter(Boolean).map(s => sql.query(s)));
console.log('Session schema ready.');
