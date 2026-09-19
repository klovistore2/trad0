// Integration test: only creates synthetic session rows, then deletes those exact rows.
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createRequire } from 'node:module';
import { createLoader } from '../tests/load-ts.mjs';
createRequire(import.meta.url)('@next/env').loadEnvConfig(process.cwd());
const guests = new AsyncLocalStorage();
const load = createLoader({ 'next/headers': { cookies: async () => ({ get: key => { const value = guests.getStore().get(key); return value ? {value} : undefined; }, set: (key,value) => guests.getStore().set(key,value) }) } });
const store = load('lib/session/store.ts'); const { db } = load('lib/neon/db.ts');
const route = load('app/api/sessions/[id]/events/route.ts');
const clients = [new Map(),new Map(),new Map()];
const as = (n, action) => guests.run(clients[n], action);
let id;
try {
 id = await as(0, () => store.createSession());
 const results = await Promise.allSettled([as(1, () => store.joinSession(id)), as(2, () => store.joinSession(id))]);
 assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
 const winner = results[0].status === 'fulfilled' ? 1 : 2;
 const loser = winner === 1 ? 2 : 1;
 const state = await as(0, () => store.sessionState(id));
 assert.equal(state.me.language, 'fr'); assert.equal(state.peer.language, 'en');
 await assert.rejects(as(loser, () => store.sessionState(id)));
 const origin = new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').origin;
 const event = {id:crypto.randomUUID(),turnId:crypto.randomUUID(),text:'This is a synthetic translation test.',committed:true};
 const context = {params:Promise.resolve({id})};
 const send = () => route.POST(new Request(`${origin}/api/sessions/${id}/events`,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(event)}),context);
 assert.equal((await as(0,send)).status,200); assert.equal((await as(0,send)).status,200);
 const received = await as(winner, () => route.GET(new Request(`${origin}/api/sessions/${id}/events?after=0`), context));
 const data = await received.json(); assert.equal(data.events.length,1); assert.equal(data.events[0].text,event.text);
 const own = await as(0, () => route.GET(new Request(`${origin}/api/sessions/${id}/events?after=0`), context));
 assert.equal((await own.json()).events.length,0);
 await db()`UPDATE adu_sessions SET expires_at=now()-interval '1 second' WHERE id=${id}`;
 await assert.rejects(as(0, () => store.sessionState(id)));
 console.log('PASS: two participants, concurrent third join rejected, isolated events, idempotent delivery, expiry.');
} finally { if (id) await db()`DELETE FROM adu_sessions WHERE id=${id}`; }
