import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLoader } from './load-ts.mjs';
const load=createLoader();
const {DEFAULT_SPEECH_OPTIONS: defaults,isSpeechOptions,isSpeechMetadata,expressiveText,toneWaitMs,TTS_MODEL,TONE_MODEL}=load('lib/audio/speech-options.ts');
const {pcmWav,ToneCapture}=load('lib/audio/tone-capture.ts');
const {startToneAnalysis}=load('lib/audio/tone-analysis.ts');
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
 // Refusing the estimate must cost nothing; asking for it buys the whole budget.
 assert.equal(toneWaitMs(defaults),0);
 assert.equal(toneWaitMs({emotion:true}),1000);
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
 const capture=new ToneCapture();capture.stop();assert.equal(capture.take(),null);
});

test('disabled tone never uploads audio; slow or failed analysis falls back without reusing a previous tone',async()=>{
 const previous=globalThis.fetch;let calls=0,aborted=false;
 globalThis.fetch=async (_url,options)=>{calls++;return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>{aborted=true;reject(new Error('aborted'));},{once:true}));};
 try{
  const disabled=await startToneAnalysis('room',defaults,new Blob(['audio']),new AbortController().signal).finish(0);
  assert.equal(disabled.tone.status,'disabled');assert.equal(calls,0);
  const slow=await startToneAnalysis('room',speech.options,new Blob(['audio']),new AbortController().signal).finish(0);
  assert.equal(slow.tone.status,'timeout');assert.equal(slow.tone.tone,'unknown');assert.equal(aborted,true);
  globalThis.fetch=async()=>Response.json({error:'unavailable'},{status:503});
  const failed=await startToneAnalysis('room',speech.options,new Blob(['audio']),new AbortController().signal).finish(100);
  assert.equal(failed.tone.status,'unavailable');
 }finally{globalThis.fetch=previous;}
});

test('audio analysis starts alongside LLM and each sentence carries its own settings snapshot',async()=>{
 const previous=globalThis.fetch;let resolveTranslation;let resolveTone;let prepared=0;const sent=[];
 globalThis.fetch=async()=>new Promise(resolve=>{resolveTranslation=resolve;});
 let options={...speech.options};
 const pipeline=new ConversationPipeline({sessionId:'room',speaker:()=>0,languages:()=>({sourceLanguage:'fr',targetLanguage:'en'}),
  send:async event=>sent.push(event),switchMode:async()=>{},onTranslation:()=>{},onError:assert.fail,
  prepareSpeech:()=>{prepared++;const snapshot={...options};const task=new Promise(resolve=>{resolveTone=resolve;});return {options:snapshot,job:{finish:()=>task,cancel:()=>{}}};}
 });pipeline.mode='context';pipeline.desired='context';
 try{
  pipeline.original('Bonjour.');assert.equal(prepared,1);await tick();assert.ok(resolveTranslation);
  options.emotion=false;
  resolveTranslation(Response.json({text:'Hello.',targetLanguage:'en',translationMs:1,contextTurns:0,model:'llm'}));await tick();
  assert.equal(sent.length,0);
  resolveTone({tone:result,extraWaitMs:12});await tick();
  assert.equal(sent[0].speech.options.emotion,true);assert.equal(sent[0].speech.tone.tone,'happy');
 }finally{pipeline.dispose();globalThis.fetch=previous;}
});

test('tone endpoint authenticates bounded WAV, sends audio only and validates untrusted model output',async()=>{
 const before=globalThis.fetch;const oldKey=process.env.OPENAI_API_KEY;const oldUrl=process.env.NEXT_PUBLIC_APP_URL;
 process.env.OPENAI_API_KEY='test-only';process.env.NEXT_PUBLIC_APP_URL='http://localhost:3000';
 let checked=false,calls=0,content=JSON.stringify({tone:'sad',strength:'medium'});
 const route=createLoader({'@/lib/session/auth':{member:async()=>{checked=true;return {slot:0};}}})('app/api/audio/tone/route.ts');
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
  // A browser that names a model is ignored rather than obeyed: the ID never comes from the body.
  const injected=await route.POST(request({sessionId:'room',text:'Hello',speech:{...speech,options:{...speech.options,ttsModel:'arbitrary'}}}));
  assert.equal(injected.status,200);assert.equal(payload.model_id,'eleven_v3_conversational');
  assert.equal(injected.headers.get('X-TTS-Model'),'eleven_v3_conversational');
  assert.equal(calls,2);
 }finally{
  globalThis.fetch=originalFetch;
  if(oldUrl===undefined)delete process.env.NEXT_PUBLIC_APP_URL;else process.env.NEXT_PUBLIC_APP_URL=oldUrl;
  if(oldModel===undefined)delete process.env.ELEVENLABS_TTS_MODEL;else process.env.ELEVENLABS_TTS_MODEL=oldModel;
 }
});

test('tone cancellation and malformed provider data cannot become a vocal directive',async()=>{
 const previous=globalThis.fetch;
 try{
  globalThis.fetch=async()=>Response.json({...result,tone:'invented'});
  const invalid=await startToneAnalysis('room',speech.options,new Blob(['audio']),new AbortController().signal).finish(100);
  assert.equal(invalid.tone.status,'unavailable');assert.equal(invalid.tone.tone,'unknown');
  let requested=false;globalThis.fetch=async()=>{requested=true;throw new Error();};
  const controller=new AbortController();controller.abort();
  await startToneAnalysis('room',speech.options,new Blob(['audio']),controller.signal).finish(0);
  assert.equal(requested,false);
 }finally{globalThis.fetch=previous;}
});
