// Turn taking rides on the events poll; a claim must never be undone by an older poll.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(readFileSync(new URL("../lib/realtime/neon-transport.ts", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

function load(fetchImpl) {
  const exports = {};
  // Polls reschedule themselves: capture the callback instead of running a timer loop.
  runInNewContext(source, {
    exports, require: () => ({}), fetch: fetchImpl, AbortController, Date,
    setTimeout: () => 1, clearTimeout: () => {},
  });
  return exports.NeonPeerTransport;
}
const tick = () => new Promise(resolve => setTimeout(resolve, 2));
const reply = body => ({ ok: true, status: 200, json: async () => body });

test("the events poll carries the current floor", async () => {
  const Transport = load(async url => reply(url.includes("/events") ? { events: [], floor: 1 } : {}));
  const peer = new Transport(() => {});
  const seen = [];
  peer.onFloor(slot => seen.push(slot));
  await peer.connect("session");
  assert.deepEqual(seen, [1], "the poll should publish the floor it read");
  peer.disconnect();
});

test("a poll issued before a claim cannot hand the floor back", async () => {
  let releasePoll;
  const blocked = new Promise(resolve => { releasePoll = resolve; });
  const Transport = load(async url => {
    if (url.includes("/floor")) return reply({ floor: 1 });
    await blocked;
    return reply({ events: [], floor: 0 });
  });
  const peer = new Transport(() => {});
  const seen = [];
  peer.onFloor(slot => seen.push(slot));
  const polling = peer.connect("session");
  await tick();
  assert.equal(await peer.takeFloor(), 1);
  releasePoll();
  await polling;
  assert.deepEqual(seen, [1], "the stale floor of 0 must be dropped");
  peer.disconnect();
});

test("a poll issued after a claim still reflects the other participant", async () => {
  const Transport = load(async url => reply(url.includes("/floor") ? { floor: 1 } : { events: [], floor: 0 }));
  const peer = new Transport(() => {});
  const seen = [];
  peer.onFloor(slot => seen.push(slot));
  assert.equal(await peer.takeFloor(), 1);
  await tick();
  await peer.connect("session");
  assert.deepEqual(seen, [1, 0], "a later poll is authoritative again");
  peer.disconnect();
});

test("releasing the floor leaves it free for either participant", async () => {
  const Transport = load(async (url, options) => reply(url.includes("/floor") ? { floor: options?.method === "DELETE" ? null : 1 } : { events: [], floor: null }));
  const peer = new Transport(() => {});
  const seen = [];
  peer.onFloor(slot => seen.push(slot));
  assert.equal(await peer.takeFloor(), 1);
  assert.equal(await peer.releaseFloor(), null);
  await tick();
  await peer.connect("session");
  assert.deepEqual(seen, [1, null, null], "a free floor must reach both sides as null");
  peer.disconnect();
});

// The page shows its own message in the reader's language; the server's wording never reaches it.
test("a refused claim fails without carrying the server's wording", async () => {
  const Transport = load(async () => ({ ok: false, status: 403, json: async () => ({ error: "Cette conversation est terminée ou inaccessible." }) }));
  const peer = new Transport(() => {});
  // The transport runs in its own VM context, so its errors are not instances of this Error.
  await assert.rejects(() => peer.takeFloor(), error => /^floor 403$/.test(String(error?.message)));
});

function loadModule(fetchImpl) {
  const exports = {};
  runInNewContext(source, { exports, require: () => ({}), fetch: fetchImpl, AbortController, Date, setTimeout: () => 1, clearTimeout: () => {} });
  return exports;
}

test("a failing poll backs off to 5 s at most, and a healthy one polls every 500 ms", () => {
  const { pollDelay } = loadModule(async () => ({}));
  assert.deepEqual([0, 1, 2, 3, 4, 10].map(pollDelay), [500, 1000, 2000, 4000, 5000, 5000]);
});

test("a subtitle overtaken by a newer one is not sent; a finished sentence always is", async () => {
  const sent = []; let release;
  const { NeonPeerTransport } = loadModule(async (_url, init) => {
    sent.push(JSON.parse(init.body).id);
    // The first send stays in flight while the next subtitles queue behind it.
    if (sent.length === 1) await new Promise(resolve => { release = resolve; });
    return { ok: true, json: async () => ({ ok: true }) };
  });
  const peer = new NeonPeerTransport(() => {});
  const partial = (id, text) => peer.send({ id, turnId: "t1", text, committed: false });
  const first = partial("p1", "Hel");
  await new Promise(resolve => setImmediate(resolve));
  partial("p2", "Hello th"); partial("p3", "Hello there");
  const done = peer.send({ id: "c1", turnId: "t1", text: "Hello there.", committed: true });
  release(); await first; await done;
  assert.deepEqual(sent, ["p1", "c1"], "p2 and p3 were overtaken before their turn came");
});
