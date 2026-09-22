// Explicit opt-in: real Neon, OpenAI and ElevenLabs, with synthetic speech held in memory.
// No provider mocking, audio files, production identities or voice cloning.
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { encode } from 'next-auth/jwt';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';
import { createLoader } from '../load-ts.mjs';
createRequire(import.meta.url)('@next/env').loadEnvConfig(process.cwd());
assert.equal(process.env.RUN_LIVE_LANGUAGES,'1','Set RUN_LIVE_LANGUAGES=1: this test consumes provider credit.');
const load=createLoader(), {LANGUAGES}=load('types/session.ts'), {supportsDirectOutput}=load('lib/translation/modes.ts');
const phrases={
 fr:'Bonjour, je voudrais réserver une table pour deux personnes demain à sept heures du soir.',
 en:'Hello, I would like to reserve a table for two people tomorrow at seven in the evening.',
 th:'สวัสดี ฉันอยากจองโต๊ะสำหรับสองคน พรุ่งนี้ตอนหนึ่งทุ่ม',
 es:'Hola, quisiera reservar una mesa para dos personas mañana a las siete de la tarde.',
 pt:'Olá, gostaria de reservar uma mesa para duas pessoas amanhã às sete da noite.',
 it:'Buongiorno, vorrei prenotare un tavolo per due persone domani alle sette di sera.',
 de:'Guten Tag, ich möchte für morgen Abend um sieben Uhr einen Tisch für zwei Personen reservieren.',
 nl:'Hallo, ik wil graag een tafel reserveren voor twee personen, morgen om zeven uur in de avond.',
 ja:'こんにちは。明日の午後七時に二名でテーブルを予約したいです。',
 ko:'안녕하세요. 내일 저녁 일곱 시에 두 사람 자리를 예약하고 싶습니다.',
 zh:'你好，我想预订明天晚上七点的两人餐桌。',
 ru:'Здравствуйте, я хотел бы забронировать столик на двоих на завтра, на семь часов вечера.',
 hi:'नमस्ते, मैं कल शाम सात बजे दो लोगों के लिए एक मेज़ बुक करना चाहता हूँ।',
 id:'Halo, saya ingin memesan meja untuk dua orang besok pukul tujuh malam.',
 vi:'Xin chào, tôi muốn đặt bàn cho hai người vào bảy giờ tối ngày mai.',
};
assert.deepEqual(Object.keys(phrases).sort(),[...LANGUAGES].sort());
const languages=process.env.LIVE_LANGUAGES?.split(',') || [...LANGUAGES];
assert.ok(languages.every(language=>LANGUAGES.includes(language)));
const preferences=process.env.LIVE_MODES?.split(',') || ['auto','context'];
const baseURL=process.env.TEST_BASE_URL || 'http://localhost:3100';
const sql=neon(process.env.DATABASE_URL), account={id:randomUUID(),email:`language-test-${randomUUID()}@example.test`};
const report={startedAt:new Date().toISOString(),scope:'Synthetic microphone → real providers → real Neon → second Chromium browser playback; French ↔ each language, English ↔ French for the French row. No human bilingual or phone validation.',fixtures:[],cases:[],errors:[]};
const reportPath=process.env.LIVE_REPORT || '/tmp/trad0-languages-live.json';
const save=()=>writeFile(reportPath,JSON.stringify(report,null,2)+'\n');
const browser=await chromium.launch({headless:true,args:['--use-fake-ui-for-media-stream','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const fixtures=new Map(), sessions=new Set();

async function client(signedIn) {
 const context=await browser.newContext({baseURL,viewport:{width:390,height:844},permissions:['microphone']});
 if(signedIn) {
  const token=await encode({token:{sub:account.id,email:account.email},secret:process.env.AUTH_SECRET,salt:'authjs.session-token'});
  await context.addCookies([{name:'authjs.session-token',value:token,url:baseURL}]);
 }
 const page=await context.newPage();
 await page.addInitScript(()=>{
  localStorage.setItem('a-deux-voice-consent','declined');
  window.liveTest={connections:[],events:[],plays:[],mic:null,source:null,context:null};
  // Replace only the physical microphone. WebRTC and all requests remain real.
  navigator.mediaDevices.getUserMedia=async()=>{
   const context=new AudioContext();
   const destination=context.createMediaStreamDestination();
   window.liveTest.context=context; window.liveTest.destination=destination;
   window.liveTest.mic=destination.stream.getAudioTracks()[0];
   window.liveTest.mic.addEventListener('ended',()=>void context.close());
   await context.resume(); return destination.stream;
  };
  window.liveTest.feed=async base64=>{
   const state=window.liveTest, bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
   const buffer=await state.context.decodeAudioData(bytes.buffer);
   const source=state.context.createBufferSource(); source.buffer=buffer;
   source.connect(state.destination); state.source=source;
   await state.context.resume(); source.start(); return buffer.duration;
  };
  const NativePeer=RTCPeerConnection;
  window.RTCPeerConnection=class extends NativePeer {
   constructor(config) {super(config);window.liveTest.connections.push({peer:this,provider:config===undefined});}
   createDataChannel(...args) {
    const channel=super.createDataChannel(...args);
    channel.addEventListener('message',event=>{
     try { const data=JSON.parse(event.data);
      window.liveTest.events.push({type:data.type,delta:typeof data.delta==='string'?data.delta:undefined,transcript:data.transcript,error:data.error?{code:data.error.code,message:data.error.message}:undefined});
     } catch { /* Ignore non-JSON diagnostic events. */ }
    });
    return channel;
   }
  };
  const NativeAudio=window.Audio;
  window.Audio=class extends NativeAudio {
   constructor(...args) {
    super(...args);
    this.addEventListener('playing',()=>window.liveTest.plays.push({element:this,at:performance.now()}));
   }
  };
 });
 return page;
}
async function api(page,path,body,method='POST') {
 const response=await page.request.fetch(path,{method,headers:{Origin:baseURL},...(body===undefined?{}:{data:body})});
 assert.ok(response.ok(),`${method} ${path}: HTTP ${response.status()}`);
 return response;
}
async function fixture(page,language,id) {
 if(fixtures.has(language))return fixtures.get(language);
 const start=Date.now();
 const response=await api(page,'/api/elevenlabs/speak',{sessionId:id,text:phrases[language],language});
 const buffer=await response.body();assert.ok(buffer.length>1000,'nonempty synthetic speech');
 fixtures.set(language,buffer.toString('base64'));
 report.fixtures.push({language,model:response.headers()['x-tts-model'],bytes:buffer.length,requestMs:Date.now()-start});
 await save();return fixtures.get(language);
}
async function snapshot(page) {
 return page.evaluate(async()=>{
  const state=window.liveTest;
  const connections=[];
  for(const {peer,provider} of state.connections) {
   let energy=0,bytes=0;const rtp=[];
   if(peer.connectionState!=='closed')for(const entry of (await peer.getStats()).values()) {
    if(entry.type==='inbound-rtp' && entry.kind==='audio'){energy+=entry.totalAudioEnergy||0;bytes+=entry.bytesReceived||0;}
    if(['inbound-rtp','outbound-rtp','media-source'].includes(entry.type))rtp.push({type:entry.type,kind:entry.kind,bytesSent:entry.bytesSent,bytesReceived:entry.bytesReceived,totalAudioEnergy:entry.totalAudioEnergy,totalSamplesReceived:entry.totalSamplesReceived,audioLevel:entry.audioLevel});
   }
   const track=t=>t?{id:t.id,enabled:t.enabled,muted:t.muted,state:t.readyState,kind:t.kind}:null;
   connections.push({provider,state:peer.connectionState,energy,bytes,rtp,senders:peer.getSenders().map(s=>track(s.track)),receivers:peer.getReceivers().map(r=>track(r.track))});
  }
  return {connections,events:state.events,plays:state.plays.map(({element,at})=>({at,stream:!!element.srcObject,muted:element.muted,time:element.currentTime,duration:Number.isFinite(element.duration)?element.duration:null,paused:element.paused})),mic:state.mic?{enabled:state.mic.enabled,state:state.mic.readyState}:null};
 });
}
async function direction(speaker,listener,id,source,target,preference) {
 const result={source,target,preference,expectedMode:preference==='context'||!supportsDirectOutput(target)?'context':'direct',status:'failed'};
 const requests=[],delivered=[];
 let measuring=false;
 const deliveryListener=async response=>{
  if(!measuring || !new URL(response.url()).pathname.endsWith('/events') || response.request().method()!=='GET' || !response.ok())return;
  try { const body=await response.json();delivered.push(...body.events.filter(e=>e.kind!=='original' && e.targetLanguage===target && e.mode===result.expectedMode)); } catch { /* Page may close during a poll. */ }
 };
 const responseListener=response=>{const path=new URL(response.url()).pathname;if(['/api/translate','/api/elevenlabs/speak'].includes(path))requests.push({path,status:response.status(),model:response.headers()['x-tts-model']});};
 speaker.on('response',responseListener);listener.on('response',responseListener);
 listener.on('response',deliveryListener);
 try {
  await speaker.getByRole('button',{name:'Settings',exact:true}).click();
  await speaker.locator('#translation-mode').selectOption(preference);
  await speaker.getByRole('button',{name:'Back to the conversation'}).click();
  await expect(speaker.locator('.pipeline-diagnostics > summary')).toContainText(result.expectedMode==='context'?'2 ·':'1 ·',{timeout:20000});
  const audio=await fixture(listener,source,id);
  if(await listener.locator('.sound-icon').getAttribute('aria-pressed')==='true')await listener.locator('.sound-icon').click();
  // Start (or claim the free floor) through the same control as a real user.
  await speaker.locator('.controls .primary-button').click();
  await speaker.waitForFunction(()=>{
   const s=window.liveTest;return s.mic?.readyState==='live' && s.mic.enabled && s.connections.some(c=>c.provider && c.peer.connectionState==='connected');
  },null,{timeout:40000});
  result.actualMode=(await speaker.locator('.pipeline-diagnostics > summary').textContent()).includes('2 ·')?'context':'direct';
  assert.equal(result.actualMode,result.expectedMode,'no unobserved fallback');
  const before=await snapshot(listener);
  const energyBefore=before.connections.filter(c=>!c.provider).reduce((sum,c)=>sum+c.energy,0);
  await speaker.evaluate(()=>{window.liveTest.events=[];});
  if(result.expectedMode==='context')await listener.evaluate(()=>{window.liveTest.plays=[];});
  const started=Date.now();
  measuring=true;
  result.inputSeconds=await speaker.evaluate(audio=>window.liveTest.feed(audio),audio);
  await expect.poll(()=>delivered.length,{timeout:40000}).toBeGreaterThan(0);
  await expect(listener.locator('.transcript')).toBeVisible();
  result.firstTextMs=Date.now()-started;
  await expect.poll(async()=>{
   const s=await snapshot(listener);
   return result.expectedMode==='context'
    ? s.plays.some(p=>!p.stream && p.duration>0.1 && p.time>0 && !p.muted)
    : s.connections.some(c=>!c.provider && c.energy>energyBefore+0.00001) && s.plays.some(p=>p.stream && !p.muted && !p.paused);
  },{timeout:30000}).toBe(true);
  result.audioObservedMs=Date.now()-started;
  // Keep the entire utterance, not just its first translated fragment.
  await speaker.waitForTimeout(Math.max(0,result.inputSeconds*1000+8000-(Date.now()-started)));
  const turns=new Map();for(const event of delivered)turns.set(event.turnId,event.text);
  result.translation=[...turns.values()].join(' ');
  const state=await snapshot(speaker);
  result.original=state.events.filter(e=>e.type==='session.input_transcript.delta'||e.type==='conversation.item.input_audio_transcription.delta').map(e=>e.delta||'').join('');
  result.providerErrors=state.events.filter(e=>e.error);
  assert.ok(result.original.trim(),'source transcription received');
  assert.deepEqual(result.providerErrors,[],'provider returned no errors');
  result.status='passed';
 } catch(error) {
  result.failure=String(error.message).split('\n').slice(0,6).join(' ').slice(0,700);
  result.speaker=await snapshot(speaker).catch(()=>null);
  result.listener=await snapshot(listener).catch(()=>null);
  result.uiErrors=await speaker.locator('.error-message').allTextContents().catch(()=>[]);
 } finally {
  speaker.off('response',responseListener);listener.off('response',responseListener);listener.off('response',deliveryListener);result.requests=requests;
  await api(speaker,`/api/sessions/${id}/floor`,undefined,'DELETE').catch(()=>{});
  report.cases.push(result);await save();
  console.log(`${result.status.toUpperCase()} ${preference} ${source}→${target}: ${result.failure||`${result.firstTextMs} ms text, ${result.audioObservedMs} ms audio observed`}`);
 }
 return result;
}
try {
 await sql`INSERT INTO adu_users(id,email,provider) VALUES(${account.id},${account.email},'google')`;
 for(const language of languages) {
  const source=language==='fr'?'en':'fr';
  const a=await client(true),b=await client(false);let id;
  try {
   await a.goto(`/${source==='en'?'':source}`);
   await a.locator('#peer-language').selectOption(language);
   await a.locator('.controls .primary-button').click();await a.waitForURL('**/session/*');
   id=new URL(a.url()).pathname.split('/').pop();sessions.add(id);
   await b.goto(`/join/${id}`);
   await expect(a.locator('#my-language')).toBeVisible();
   await a.locator('#my-language').selectOption(source);
   await expect(b.locator('#my-language')).toHaveValue(language,{timeout:10000});
   await expect(b.locator('#peer-language')).toHaveValue(source,{timeout:10000});
   for(const preference of preferences) {
    await direction(a,b,id,source,language,preference);
    await direction(b,a,id,language,source,preference);
   }
  } catch(error) {report.errors.push({language,error:String(error.message).slice(0,600)});await save();console.log(`SETUP FAILED ${language}`);}
  finally {
   await a.context().close();await b.context().close();
   if(id){await sql`DELETE FROM adu_sessions WHERE id=${id}`;sessions.delete(id);}
  }
 }
} finally {
 await browser.close();
 for(const id of sessions)await sql`DELETE FROM adu_sessions WHERE id=${id}`;
 await sql`DELETE FROM adu_users WHERE id=${account.id}`;
 report.finishedAt=new Date().toISOString();await save();
 console.log(`Report: ${reportPath}. ${report.cases.filter(c=>c.status==='passed').length}/${report.cases.length} passed; ${report.errors.length} setup failures.`);
}
if(report.errors.length || report.cases.some(c=>c.status!=='passed'))process.exitCode=1;
