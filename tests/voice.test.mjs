import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLoader } from './load-ts.mjs';
import { validSample } from '../lib/voice/consent.ts';

const origin = 'http://localhost:3000';
function request(body, path='/api/elevenlabs/speak', method='POST') { return new Request(`${origin}${path}`, {method,headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)}); }

test('voice samples require supported audio and enough recording time', () => {
  const sample = new File([new Uint8Array(10001)],'voice.webm',{type:'audio/webm;codecs=opus'});
  assert.equal(validSample(sample,45),true);
  assert.equal(validSample(sample,3),false);
  assert.equal(validSample(sample,NaN),false);
  assert.equal(validSample(new File(['text'],'voice.txt',{type:'text/plain'}),45),false);
});

test('relayed speech uses the other participant’s ready clone, never a client supplied voice ID', async () => {
  const env = {NEXT_PUBLIC_APP_URL:origin, ELEVENLABS_TTS_MODEL:'test-model', ELEVENLABS_API_KEY:'test-key'};
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  const originalFetch = globalThis.fetch;
  let upstream;
  globalThis.fetch = async (url, init) => {
    upstream = {url:String(url), body:JSON.parse(init.body), key:init.headers['xi-api-key']};
    return new Response(new Uint8Array([0,1,2,3]), {status:200});
  };
  const load = createLoader({
    '@/lib/session/auth': {member: async id => {assert.equal(id,'session');return {slot:0};}},
    '@/lib/neon/db': {db: () => async (strings,...values) => {
      assert.match(strings.join('?'),/slot<>/); assert.deepEqual(values,['session',0]);
      return [{voice_id:'peer-clone',voice_status:'ready'}];
    }},
  });
  try {
    const response = await load('app/api/elevenlabs/speak/route.ts').POST(request({sessionId:'session',voiceId:'unrelated-voice',text:'Bonjour',language:'fr'}));
    assert.equal(response.status,200);
    assert.equal(response.headers.get('content-type'),'audio/mpeg');
    assert.match(upstream.url,/\/peer-clone\/stream/);
    assert.doesNotMatch(upstream.url,/unrelated-voice/);
    assert.equal(upstream.body.model_id,'test-model');
    assert.equal(upstream.body.language_code,'fr');
    assert.equal(upstream.key,'test-key');
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key,value] of Object.entries(previous)) {if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
});

test('a standard voice is matched to the speaker’s detected range, never to a claim about them', async () => {
  const env = {NEXT_PUBLIC_APP_URL:origin, ELEVENLABS_TTS_MODEL:'test-model', ELEVENLABS_API_KEY:'test-key'};
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  const cleared = ['ELEVENLABS_FALLBACK_VOICE_ID','ELEVENLABS_VOICE_LOW','ELEVENLABS_VOICE_HIGH'];
  const clearedBefore = Object.fromEntries(cleared.map(key => [key, process.env[key]]));
  for (const key of cleared) delete process.env[key];
  Object.assign(process.env, env);
  const originalFetch = globalThis.fetch;
  const catalogue = {voices:[
    {voice_id:'neutral-voice',labels:{gender:'neutral'}},
    {voice_id:'male-voice',labels:{gender:'male'}},
    {voice_id:'female-voice',labels:{gender:'female'}},
  ]};
  let spoken;
  globalThis.fetch = async url => {
    if (String(url).includes('/v2/voices')) return new Response(JSON.stringify(catalogue),{status:200,headers:{'content-type':'application/json'}});
    spoken = String(url);
    return new Response(new Uint8Array([0,1]), {status:200});
  };
  const speak = async voiceRange => {
    const load = createLoader({
      '@/lib/session/auth': {member: async () => ({slot:0})},
      '@/lib/neon/db': {db: () => async () => [{voice_id:null,voice_status:'none',voice_range:voiceRange}]},
    });
    return load('app/api/elevenlabs/speak/route.ts').POST(request({sessionId:'session',text:'Bonjour'}));
  };
  try {
    let response = await speak('low');
    assert.match(spoken,/\/male-voice\/stream/);
    assert.equal(response.headers.get('x-voice-source'),'standard-low');
    response = await speak('high');
    assert.match(spoken,/\/female-voice\/stream/);
    assert.equal(response.headers.get('x-voice-source'),'standard-high');
    response = await speak(null);
    assert.match(spoken,/\/neutral-voice\/stream/,'an undetected range must not guess');
    assert.equal(response.headers.get('x-voice-source'),'standard-neutral');
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key,value] of Object.entries({...previous,...clearedBefore})) {if(value===undefined)delete process.env[key];else process.env[key]=value;}
  }
});

test('relayed speech refuses empty or oversized text before reaching the provider', async () => {
  const previousUrl = process.env.NEXT_PUBLIC_APP_URL; process.env.NEXT_PUBLIC_APP_URL=origin;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {throw new Error('provider must not be reached');};
  const load = createLoader({'@/lib/session/auth': {member: async () => ({slot:0})}, '@/lib/neon/db': {db: () => async () => []}});
  try {
    const route = load('app/api/elevenlabs/speak/route.ts');
    assert.equal((await route.POST(request({text:'   '}))).status,400);
    assert.equal((await route.POST(request({text:'a'.repeat(4001)}))).status,400);
  } finally {
    globalThis.fetch = originalFetch;
    if(previousUrl===undefined)delete process.env.NEXT_PUBLIC_APP_URL;else process.env.NEXT_PUBLIC_APP_URL=previousUrl;
  }
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
