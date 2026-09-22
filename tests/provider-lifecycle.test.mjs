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
    channel = { readyState: "open", sent: [], send(data) { this.sent.push(JSON.parse(data)); }, close() { this.onclose?.(); } };
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

 test("a language correction updates an open translation without replacing its microphone", async () => {
  const { provider, tracks, peers } = setup(null, async url => url.startsWith("/api/") ? Response.json({ value: "ephemeral" }) : new Response("answer-sdp"));
  await provider.connect({ targetLanguage: "en", microphoneEnabled: false });
  provider.setTargetLanguage("es");
  assert.equal(peers[0].channel.sent[0].session.audio.output.language, "es");
  assert.equal(peers[0].channel.sent[0].type, "session.update");
  assert.equal(tracks[0].stopCount, 0);
  assert.equal(tracks[0].enabled, false);
  await provider.disconnect();
 });
 test("a correction during microphone permission is applied once the channel opens", async () => {
  let resolvePermission;
  const { provider, peers } = setup(stream => new Promise(resolve => { resolvePermission = () => resolve(stream); }), async url => url.startsWith("/api/") ? Response.json({ value: "ephemeral" }) : new Response("answer-sdp"));
  const connecting = provider.connect({ targetLanguage: "en" });
  provider.setTargetLanguage("ja");
  resolvePermission(); await connecting;
  assert.equal(peers[0].channel.sent[0].session.audio.output.language, "ja");
  await provider.disconnect();
 });

test('mode 1 exposes only the remote translated track, never the microphone',async()=>{
 const {provider,peers,tracks}=setup(null,async url=>url.startsWith('/api/')?Response.json({value:'ephemeral'}):new Response('sdp'));
 const output=[];provider.onTranslatedAudio(track=>output.push(track));
 await provider.connect({targetLanguage:'en'});assert.equal(output.length,0);
 const translated={id:'translated'};peers[0].ontrack({track:translated});
 assert.equal(output[0],translated);assert.notEqual(output[0],tracks[0]);
 await provider.disconnect();assert.equal(output.at(-1),null);
});
test('mode 2 requests transcription only and does not duplicate the completed transcript',async()=>{
 const calls=[];
 const {provider,peers}=setup(null,async url=>{calls.push(url);return url.startsWith('/api/')?Response.json({value:'ephemeral'}):new Response('sdp');});
 const originals=[];const translations=[];
 provider.onOriginalTranscript(event=>originals.push(event.delta));provider.onTranslatedText(event=>translations.push(event.delta));
 await provider.connect({targetLanguage:'th',transcriptionOnly:true,sessionId:'room'});
 assert.deepEqual(calls,['/api/openai/transcription-token','https://api.openai.com/v1/realtime/calls']);
 for(const event of [{type:'conversation.item.input_audio_transcription.delta',delta:'Hello.'},{type:'conversation.item.input_audio_transcription.completed',transcript:'Hello.'},{type:'session.output_transcript.delta',delta:'Must not translate here'}])peers[0].channel.onmessage({data:JSON.stringify(event)});
 assert.deepEqual(originals,['Hello.']);assert.deepEqual(translations,[]);
 provider.commitInput();provider.setTargetLanguage('en');
 assert.equal(peers[0].channel.sent.length,0,'completed audio must not be committed a second time');
 await provider.disconnect();
});

test('transcription commits once per utterance and survives an empty-buffer response',async()=>{
 const {provider,peers,tracks}=setup(null,async url=>url.startsWith('/api/')?Response.json({value:'ephemeral'}):new Response('sdp'));
 const originals=[];provider.onOriginalTranscript(event=>originals.push(event.delta));
 await provider.connect({targetLanguage:'it',transcriptionOnly:true});
 provider.commitInput();assert.equal(peers[0].channel.sent.length,0);
 const emit=event=>peers[0].channel.onmessage({data:JSON.stringify(event)});
 emit({type:'conversation.item.input_audio_transcription.delta',delta:'First'});
 provider.commitInput();assert.equal(peers[0].channel.sent.length,1);
 emit({type:'conversation.item.input_audio_transcription.delta',delta:' sentence.'});
 provider.commitInput();assert.equal(peers[0].channel.sent.length,1);
 emit({type:'conversation.item.input_audio_transcription.completed',transcript:'First sentence.'});
 provider.commitInput();assert.equal(peers[0].channel.sent.length,1);
 peers[0].channel.onmessage({data:JSON.stringify({type:'error',error:{code:'input_audio_buffer_commit_empty'}})});
 peers[0].channel.onmessage({data:JSON.stringify({type:'conversation.item.input_audio_transcription.delta',delta:'Still listening.'})});
 assert.deepEqual(originals,['First',' sentence.','Still listening.']);assert.equal(tracks[0].stopCount,0);
 provider.commitInput();assert.equal(peers[0].channel.sent.length,2,'next utterance can commit');
 peers[0].channel.onmessage({data:JSON.stringify({type:'error',error:{code:'other_failure'}})});
 assert.equal(tracks[0].stopCount,1);
});
