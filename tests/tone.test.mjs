import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLoader } from './load-ts.mjs';
const load=createLoader();
const {DEFAULT_SPEECH_OPTIONS: defaults,isSpeechOptions,isSpeechMetadata,expressiveText,TTS_MODEL,TONE_MODEL,TONE_HOLD_MS}=load('lib/audio/speech-options.ts');
const {pcmWav,ToneCapture}=load('lib/audio/tone-capture.ts');
const {ToneTracker}=load('lib/audio/tone-analysis.ts');
const {ConversationPipeline}=load('lib/translation/conversation-pipeline.ts');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const result={tone:'happy',strength:'medium',status:'estimated',analysisMs:10,model:'gpt-audio-mini'};
const speech={options:{...defaults,emotion:true},tone:result,extraWaitMs:0};

test('the only speech choice is the tone estimate; everything it implies is derived, not asked',()=>{
 assert.ok(isSpeechOptions(defaults));assert.ok(isSpeechMetadata(speech));
 assert.equal(defaults.emotion,false,'the added delay is never opt-out');
 assert.equal(isSpeechOptions({emotion:'yes'}),false);
 assert.equal(isSpeechOptions(null),false);
 assert.equal(isSpeechMetadata({...speech,tone:{...result,tone:'[shouts]'}}),false);
 assert.equal(TONE_MODEL,'gpt-audio-mini','the slower audio model is never selected for us');
 assert.equal(expressiveText('[shouts] Hello',TTS_MODEL,speech),'[happily] shouts Hello');
 assert.equal(expressiveText('Hello',TTS_MODEL,{...speech,tone:{...result,strength:'low'}}),'Hello');
 assert.equal(expressiveText('Hello',TTS_MODEL,{...speech,options:defaults}),'Hello');
 assert.equal(expressiveText('[shouts] Hello','eleven_flash_v2_5',speech),'[shouts] Hello','a non-v3 model is left untouched');
});

test('PCM capture produces bounded-duration mono WAV and never serializes very short excerpts',async()=>{
 assert.equal(pcmWav([new Float32Array(100)],16000),null);
 const audio=pcmWav([new Float32Array(16000).fill(.5)],16000);
 const bytes=Buffer.from(await audio.arrayBuffer());
 assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.readUInt32LE(24),16000);
 assert.equal(bytes.readUInt32LE(40),32000);assert.equal(bytes.length,32044);
 assert.equal(bytes.readInt16LE(44),16384);
 // Stop must never stop the shared microphone tracks.
 const capture=new ToneCapture(assert.fail);capture.stop();
});

test('capture starts with the voice, sends the first 3 s at once and a short utterance when it ends',()=>{
 const windows=[];const capture=new ToneCapture(audio=>windows.push(audio),3);
 const voiced=()=>new Float32Array(8000).fill(.2);const silent=()=>new Float32Array(8000);
 for(let i=0;i<10;i++)capture.add(silent(),16000);
 assert.equal(windows.length,0,'silence before speech neither counts nor is sent');
 for(let i=0;i<5;i++)capture.add(voiced(),16000);
 assert.equal(windows.length,0,'2.5 s is not yet a window');
 capture.add(voiced(),16000);assert.equal(windows.length,1,'3 s after the voice started, not after the mic opened');
 assert.equal(windows[0].size,44+3*16000*2);
 capture.add(voiced(),16000);capture.add(silent(),16000);capture.add(silent(),16000);
 assert.equal(windows.length,1,'under a second of new speech is not worth a request');
 capture.add(voiced(),16000);capture.add(voiced(),16000);capture.add(voiced(),16000);
 capture.add(silent(),16000);capture.add(silent(),16000);
 assert.equal(windows.length,2,'a short utterance is analysed as soon as the speaker stops');
 capture.add(voiced(),16000);capture.add(voiced(),16000);capture.pause();
 assert.equal(windows.length,3,'a closed microphone sends at least one second of new speech');
 capture.pause();assert.equal(windows.length,3);
});

test('tone defaults to neutral, keeps the latest estimate for a while, and never waits or overlaps',async()=>{
 const previous=globalThis.fetch;let calls=0,respond;
 globalThis.fetch=async()=>{calls++;return new Promise(resolve=>{respond=resolve;});};
 try{
  const tracker=new ToneTracker('room');
  assert.equal(tracker.current(defaults).status,'disabled');
  assert.deepEqual([tracker.current(speech.options).tone,tracker.current(speech.options).status],['neutral','no_audio']);
  tracker.sample(new Blob(['a']));tracker.sample(new Blob(['b']));assert.equal(calls,1,'one request at a time');
  assert.equal(tracker.current(speech.options).tone,'neutral','a sentence never waits for the pending window');
  respond(Response.json(result));await tick();await tick();await tick();
  assert.equal(tracker.current(speech.options).tone,'happy');
  assert.equal(tracker.current(speech.options,Date.now()+TONE_HOLD_MS+1).tone,'neutral','an old estimate expires');
  tracker.sample(new Blob(['c']));assert.equal(calls,2);
  respond(Response.json({...result,tone:'invented'}));await tick();await tick();await tick();
  assert.equal(tracker.current(speech.options).tone,'happy','malformed output never replaces a valid estimate');
  tracker.reset();assert.equal(tracker.current(speech.options).tone,'neutral');
  globalThis.fetch=async()=>Response.json({error:'unavailable'},{status:503});
  tracker.sample(new Blob(['d']));await tick();await tick();
  assert.equal(tracker.current(speech.options).status,'unavailable');
 }finally{globalThis.fetch=previous;}
});

test('each sentence carries its settings snapshot and the latest tone, without waiting for analysis',async()=>{
 const previous=globalThis.fetch;let resolveTranslation;const sent=[];
 globalThis.fetch=async()=>new Promise(resolve=>{resolveTranslation=resolve;});
 let options={...speech.options};let tone={...result,tone:'sad'};
 const pipeline=new ConversationPipeline({sessionId:'room',speaker:()=>0,languages:()=>({sourceLanguage:'fr',targetLanguage:'en'}),
  send:async event=>sent.push(event),switchMode:async()=>{},onTranslation:()=>{},onError:assert.fail,
  speechOptions:()=>({...options}),currentTone:()=>tone,
 });pipeline.mode='context';pipeline.desired='context';
 try{
  pipeline.original('Bonjour.');await tick();assert.ok(resolveTranslation);
  options.emotion=false;tone=result;
  resolveTranslation(Response.json({text:'Hello.',targetLanguage:'en',translationMs:1,contextTurns:0,model:'llm'}));await tick();await tick();
  assert.equal(sent[0].speech.options.emotion,true);assert.equal(sent[0].speech.tone.tone,'happy','tone read after translation');
  assert.equal(sent[0].speech.extraWaitMs,0);
 }finally{pipeline.dispose();globalThis.fetch=previous;}
});

test('tone endpoint authenticates bounded WAV, sends audio only and validates untrusted model output',async()=>{
 const before=globalThis.fetch;const oldKey=process.env.OPENAI_API_KEY;const oldUrl=process.env.NEXT_PUBLIC_APP_URL;
 process.env.OPENAI_API_KEY='test-only';process.env.NEXT_PUBLIC_APP_URL='http://localhost:3000';
 let checked=false,calls=0,content=JSON.stringify({tone:'sad',strength:'medium'});
 const route=createLoader({'@/lib/session/auth':{member:async()=>{checked=true;return {slot:0,user_id:'account'};}}})('app/api/audio/tone/route.ts');
 globalThis.fetch=async(_url,init)=>{
  calls++;assert.ok(checked);const body=JSON.parse(init.body);
  assert.equal(body.store,false);assert.deepEqual(body.modalities,['text']);
  assert.equal(body.messages[1].content[0].type,'input_audio');
  assert.equal(body.response_format,undefined,'gpt-audio does not support strict structured output');
  return Response.json({choices:[{finish_reason:'stop',message:{content}}]});
 };
 const request=(model='gpt-audio-mini',audio=pcmWav([new Float32Array(16000)],16000))=>{
  const form=new FormData();form.set('sessionId','room');form.set('model',model);form.set('audio',audio,'tone.wav');
  return new Request('http://localhost:3000/api/audio/tone',{method:'POST',headers:{origin:'http://localhost:3000'},body:form});
 };
 try{
  let response=await route.POST(request());assert.equal(response.status,200);assert.equal((await response.json()).tone,'sad');
  assert.equal((await route.POST(request('other-model'))).status,400);assert.equal(calls,1);
  assert.equal((await route.POST(request('gpt-audio-mini',new Blob(['not wav'])))).status,400);assert.equal(calls,1);
  content=JSON.stringify({tone:'[shout]',strength:'high'});
  assert.equal((await route.POST(request())).status,502);
  const denied=createLoader({'@/lib/session/auth':{member:async()=>{throw new Error('denied');}}})('app/api/audio/tone/route.ts');
  const beforeDenied=calls;await denied.POST(request());assert.equal(calls,beforeDenied);
  const guest=createLoader({'@/lib/session/auth':{member:async()=>({slot:1,user_id:null})}})('app/api/audio/tone/route.ts');
  const refused=await guest.POST(request());assert.equal(refused.status,403,'a guest without an account is refused');assert.equal(calls,beforeDenied);
 }finally{
  globalThis.fetch=before;
  if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;
  if(oldUrl===undefined)delete process.env.NEXT_PUBLIC_APP_URL;else process.env.NEXT_PUBLIC_APP_URL=oldUrl;
 }
});

test('speech relay uses validated tone tags and a model the browser cannot choose',async()=>{
 const originalFetch=globalThis.fetch;const oldUrl=process.env.NEXT_PUBLIC_APP_URL;const oldModel=process.env.ELEVENLABS_TTS_MODEL;
 process.env.NEXT_PUBLIC_APP_URL='http://localhost:3000';process.env.ELEVENLABS_TTS_MODEL='eleven_flash_v2_5';
 let payload,calls=0;
 globalThis.fetch=async(_url,init)=>{calls++;payload=JSON.parse(init.body);return new Response(new Uint8Array([1,2]));};
 const route=createLoader({
  '@/lib/session/auth':{member:async()=>({slot:0})},
  '@/lib/neon/db':{db:()=>async()=>[{voice_id:'clone',voice_status:'ready',use_clone:true}]},
  '@/lib/elevenlabs/server':{elevenHeaders:()=>({}),fallbackVoice:async()=>{throw new Error('must use clone');}},
 })('app/api/elevenlabs/speak/route.ts');
 const request=body=>new Request('http://localhost:3000/api/elevenlabs/speak',{method:'POST',headers:{origin:'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify(body)});
 try{
  const response=await route.POST(request({sessionId:'room',text:'[shouts] สวัสดี',language:'th',speech}));
  assert.equal(response.status,200);assert.equal(response.headers.get('X-TTS-Model'),'eleven_v3_conversational');
  assert.equal(payload.text,'[happily] shouts สวัสดี');assert.equal(payload.language_code,'th');
  assert.equal(payload.model_id,'eleven_v3_conversational');
  assert.equal(payload.voice_settings.stability,0,'a tagged sentence uses the expressive setting');
  assert.equal(response.headers.get('X-TTS-Stability'),'0');
  // A browser that names a model is ignored rather than obeyed: the ID never comes from the body.
  const injected=await route.POST(request({sessionId:'room',text:'Hello',speech:{...speech,options:{...speech.options,ttsModel:'arbitrary'}}}));
  assert.equal(injected.status,200);assert.equal(payload.model_id,'eleven_v3_conversational');

  assert.equal(injected.headers.get('X-TTS-Model'),'eleven_v3_conversational');
  const plain=await route.POST(request({sessionId:'room',text:'Hello',speech:{...speech,tone:{...result,strength:'low'}}}));
  assert.equal(payload.text,'Hello');assert.equal(payload.voice_settings,undefined,'an untagged sentence keeps the voice default');
  assert.equal(plain.headers.get('X-TTS-Stability'),'default');
  assert.equal(calls,3);
 }finally{
  globalThis.fetch=originalFetch;
  if(oldUrl===undefined)delete process.env.NEXT_PUBLIC_APP_URL;else process.env.NEXT_PUBLIC_APP_URL=oldUrl;
  if(oldModel===undefined)delete process.env.ELEVENLABS_TTS_MODEL;else process.env.ELEVENLABS_TTS_MODEL=oldModel;
 }
});
