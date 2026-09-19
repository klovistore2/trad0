import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLoader } from './load-ts.mjs';
import { pcm16ToFloat32 } from '../lib/audio/pcm.ts';
import { validSample } from '../lib/voice/consent.ts';

const origin = 'http://localhost:3000';
function request(body, method='POST') { return new Request(`${origin}/api/elevenlabs/token`, {method,headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)}); }

test('PCM decoder preserves negative and positive amplitudes and rejects partial samples', () => {
  assert.deepEqual([...pcm16ToFloat32(new Uint8Array([0,128,0,0,255,127]))], [-1,0,32767/32768]);
  assert.throws(() => pcm16ToFloat32(new Uint8Array([1])));
});

test('voice samples require supported audio and enough recording time', () => {
  const sample = new File([new Uint8Array(10001)],'voice.webm',{type:'audio/webm;codecs=opus'});
  assert.equal(validSample(sample,45),true);
  assert.equal(validSample(sample,3),false);
  assert.equal(validSample(sample,NaN),false);
  assert.equal(validSample(new File(['text'],'voice.txt',{type:'text/plain'}),45),false);
});

test('receiver credentials select the other participant’s ready clone, never a client supplied voice ID', async () => {
  const previous = process.env.NEXT_PUBLIC_APP_URL; process.env.NEXT_PUBLIC_APP_URL=origin;
  let selected;
  const load = createLoader({
    '@/lib/session/auth': {member: async id => {assert.equal(id,'session');return {slot:0};}},
    '@/lib/neon/db': {db: () => async (strings,...values) => {
      assert.match(strings.join('?'),/slot<>/); assert.deepEqual(values,['session',0]);
      return [{voice_id:'peer-clone',voice_status:'ready'}];
    }},
    '@/lib/elevenlabs/server': {voiceCredentials: async voice => {selected=voice;return {token:'temporary',voiceId:voice,model:'test-model'};}},
  });
  try {
    const response = await load('app/api/elevenlabs/token/route.ts').POST(request({sessionId:'session',voiceId:'unrelated-voice'}));
    assert.equal(response.status,200); assert.equal(selected,'peer-clone');
  } finally {if(previous===undefined)delete process.env.NEXT_PUBLIC_APP_URL;else process.env.NEXT_PUBLIC_APP_URL=previous;}
});

test('cloning without explicit consent cannot reach database or provider', async () => {
  const oldUrl=process.env.NEXT_PUBLIC_APP_URL; const oldSecret=process.env.CRON_SECRET;
  process.env.NEXT_PUBLIC_APP_URL=origin; process.env.CRON_SECRET='test-cleanup-secret';
  const load=createLoader({
    '@/lib/neon/db':{db:()=>assert.fail('must not touch database')},
    '@/lib/session/auth':{member:()=>assert.fail('must not create clone')},
    '@/lib/elevenlabs/server':{elevenHeaders:()=>assert.fail('must not contact provider'),deleteVoice:()=>assert.fail('must not contact provider')},
  });
  try {
    const form=new FormData();form.set('sessionId','test');
    const response=await load('app/api/voice/clone/route.ts').POST(new Request(`${origin}/api/voice/clone`,{method:'POST',headers:{origin},body:form}));
    assert.equal(response.status,400);assert.match((await response.json()).error,/consentement/);
  } finally {
    if(oldUrl===undefined)delete process.env.NEXT_PUBLIC_APP_URL;else process.env.NEXT_PUBLIC_APP_URL=oldUrl;
    if(oldSecret===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=oldSecret;
  }
});

test('sentence publisher delivers streaming subtitles then commits only once', context => {
  context.mock.timers.enable({apis:['setTimeout']});
  const {TurnPublisher}=createLoader()('lib/realtime/turn-publisher.ts');
  const sent=[];const publisher=new TurnPublisher(event=>sent.push(event));
  publisher.append('Hello');context.mock.timers.tick(250);
  assert.equal(sent.length,1);assert.equal(sent[0].committed,false);
  publisher.append(' there.');
  assert.equal(sent.length,2);assert.equal(sent[1].text,'Hello there.');assert.equal(sent[1].committed,true);
  assert.equal(sent[0].turnId,sent[1].turnId);
  context.mock.timers.tick(2000);assert.equal(sent.length,2);
  publisher.dispose();
});

test('consented clone uses multipart samples and stores readiness; an expired session deletes the new clone', async () => {
  const oldUrl=process.env.NEXT_PUBLIC_APP_URL, oldSecret=process.env.CRON_SECRET, oldFetch=globalThis.fetch;
  process.env.NEXT_PUBLIC_APP_URL=origin; process.env.CRON_SECRET='test-cleanup-secret';
  let saveAllowed=true;let deleted;
  const load=createLoader({
    '@/lib/session/auth':{member:async()=>({slot:0})},
    '@/lib/neon/db':{db:()=>async(strings,...values)=>{
      const sql=strings.join('?');
      if(sql.includes("voice_status='learning'"))return [{slot:0}];
      if(sql.includes('SET voice_id=')){assert.equal(values[0],'synthetic-clone');assert.equal(values[1],'ready');return saveAllowed?[{slot:0}]:[];}
      return [];
    }},
    '@/lib/elevenlabs/server':{elevenHeaders:()=>({'xi-api-key':'test-key'}),deleteVoice:async id=>{deleted=id;}},
  });
  globalThis.fetch=async(url,options)=>{
    assert.equal(url,'https://api.elevenlabs.io/v1/voices/add');
    assert.ok(options.body.get('files') instanceof File);
    assert.equal(JSON.parse(options.body.get('labels')).app,'a-deux-session');
    return Response.json({voice_id:'synthetic-clone',requires_verification:false});
  };
  const make=()=>{const form=new FormData();form.set('sessionId','synthetic-session');form.set('consent','session-voice-v1');form.set('seconds','45');form.set('sample',new File([new Uint8Array(10001)],'voice.webm',{type:'audio/webm'}));return new Request(`${origin}/api/voice/clone`,{method:'POST',headers:{origin},body:form});};
  try {
    const route=load('app/api/voice/clone/route.ts');
    const result=await route.POST(make());assert.equal(result.status,200);assert.equal((await result.json()).status,'ready');
    saveAllowed=false;
    assert.equal((await route.POST(make())).status,409);assert.equal(deleted,'synthetic-clone');
  } finally {
    globalThis.fetch=oldFetch;
    if(oldUrl===undefined)delete process.env.NEXT_PUBLIC_APP_URL;else process.env.NEXT_PUBLIC_APP_URL=oldUrl;
    if(oldSecret===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=oldSecret;
  }
});
