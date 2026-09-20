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

test("a refused claim surfaces the server message", async () => {
  const Transport = load(async () => ({ ok: false, status: 403, json: async () => ({ error: "Cette conversation est terminée ou inaccessible." }) }));
  const peer = new Transport(() => {});
  await assert.rejects(() => peer.takeFloor(), /terminée ou inaccessible/);
});
