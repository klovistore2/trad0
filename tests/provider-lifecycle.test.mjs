import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { parseTranslationMessage } from "../lib/openai/events.ts";

function setup(getUserMedia, fetch) {
  const tracks = [{ stopCount: 0, stop() { this.stopCount++; }, addEventListener() {} }];
  const stream = { getTracks: () => tracks, getAudioTracks: () => tracks };
  const peers = [];
  class Peer {
    connectionState = "new";
    channel = { close() { this.onclose?.(); } };
    constructor() { peers.push(this); }
    addTrack() {}
    createDataChannel() { return this.channel; }
    async createOffer() { return { type: "offer", sdp: "test-sdp" }; }
    async setLocalDescription() {}
    async setRemoteDescription() { this.channel.onopen(); }
    close() { this.connectionState = "closed"; this.onconnectionstatechange?.(); }
  }
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL("../lib/openai/translation-provider.ts", import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  runInNewContext(code, {
    exports, require: () => ({ parseTranslationMessage }),
    window: { isSecureContext: true, RTCPeerConnection: Peer }, RTCPeerConnection: Peer,
    navigator: { mediaDevices: { getUserMedia: () => getUserMedia ? getUserMedia(stream) : Promise.resolve(stream) } },
    fetch, AbortController, DOMException, setTimeout, clearTimeout,
  });
  return { provider: new exports.OpenAITranslationProvider(), tracks, peers };
}

test("permission granted after cancellation immediately releases the microphone", async () => {
  let resolvePermission;
  const { provider, tracks } = setup(stream => new Promise(resolve => { resolvePermission = () => resolve(stream); }), () => assert.fail("must not request credentials after cancellation"));
  const connecting = provider.connect({ targetLanguage: "th" });
  await provider.disconnect();
  resolvePermission();
  await connecting;
  assert.equal(tracks[0].stopCount, 1);
});

test("credential failure releases microphone and emits actionable error", async () => {
  const { provider, tracks } = setup(null, async () => Response.json({ error: "Not configured" }, { status: 503 }));
  const states = [];
  provider.onStatus(status => states.push(status));
  await provider.connect({ targetLanguage: "th" });
  assert.equal(tracks[0].stopCount, 1);
  assert.deepEqual(states, ["connecting", "provider_error"]);
});

test("streams subtitles and closes every media resource without post-stop errors", async () => {
  const { provider, tracks, peers } = setup(null, async url => url.startsWith("/api/") ? Response.json({ value: "ephemeral" }) : new Response("answer-sdp"));
  const states = [];
  const translations = [];
  provider.onStatus(status => states.push(status));
  provider.onTranslatedText(event => translations.push(event.delta));
  await provider.connect({ targetLanguage: "th" });
  peers[0].channel.onmessage({ data: '{"type":"session.output_transcript.delta","delta":"สวัสดี"}' });
  await provider.disconnect();
  peers[0].channel.onmessage({ data: '{"type":"session.output_transcript.delta","delta":"late"}' });
  assert.deepEqual(translations, ["สวัสดี"]);
  assert.deepEqual(states, ["connecting", "listening"]);
  assert.equal(tracks[0].stopCount, 1);
  assert.equal(peers[0].connectionState, "closed");
});

test("demo finishes in idle and does not leave an active interval", async () => {
  const exports = {};
  let tick;
  let cleared = false;
  const code = ts.transpileModule(readFileSync(new URL("../lib/translation/mock-provider.ts", import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  runInNewContext(code, {
    exports,
    setInterval(callback) { tick = callback; return 1; },
    clearInterval() { cleared = true; },
  });
  const provider = new exports.MockTranslationProvider();
  const states = [];
  let translation = "";
  provider.onStatus(status => states.push(status));
  provider.onTranslatedText(event => { translation += event.delta; });
  await provider.connect();
  for (let i = 0; i < 100 && !cleared; i++) tick();
  assert.equal(cleared, true);
  assert.deepEqual(states, ["listening", "idle"]);
  assert.match(translation, /สวัสดี/);
});
