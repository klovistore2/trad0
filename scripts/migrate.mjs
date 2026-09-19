import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { neon } from '@neondatabase/serverless';
createRequire(import.meta.url)('@next/env').loadEnvConfig(process.cwd());
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing');
const sql = neon(process.env.DATABASE_URL);
const directory = new URL('../migrations/', import.meta.url);
const files = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort();
const statements = [];
for (const name of files) {
  const migration = await readFile(new URL(name, directory), 'utf8');
  statements.push(...migration.split(';').map(s => s.trim()).filter(Boolean));
}
// Every migration is additive and idempotent, so replaying the whole set is safe.
await sql.transaction(statements.map(s => sql.query(s)));
console.log(`Session schema ready (${files.length} migrations).`);
