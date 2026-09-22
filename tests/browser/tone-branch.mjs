// Browser flow with real Neon session transport and simulated audio providers.
// Start a test server with NEXT_PUBLIC_APP_URL=http://localhost:3100 first.
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { encode } from 'next-auth/jwt';
import { createRequire } from 'node:module';
import { neon } from '@neondatabase/serverless';
createRequire(import.meta.url)('@next/env').loadEnvConfig(process.cwd());
const baseURL = process.env.TEST_BASE_URL || 'http://localhost:3100';
const browser = await chromium.launch({ headless:true, args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'] });
const contexts=[];let sessionId;let accountEmail;let speakerEmail;
const errors=[];
// A real, short WAV so the audio element can actually decode, play and fire 'ended'.
function wavClip(seconds=1.5, frequency=440, rate=8000) {
 const samples=Math.floor(seconds*rate); const buffer=Buffer.alloc(44+samples*2);
 buffer.write('RIFF',0); buffer.writeUInt32LE(36+samples*2,4); buffer.write('WAVEfmt ',8);
 buffer.writeUInt32LE(16,16); buffer.writeUInt16LE(1,20); buffer.writeUInt16LE(1,22);
 buffer.writeUInt32LE(rate,24); buffer.writeUInt32LE(rate*2,28); buffer.writeUInt16LE(2,32); buffer.writeUInt16LE(16,34);
 buffer.write('data',36); buffer.writeUInt32LE(samples*2,40);
 for(let i=0;i<samples;i++) buffer.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*frequency/rate)*6000),44+i*2);
 return buffer;
}
const clip=wavClip();
// Google sign-in cannot be automated, so a signed-in visitor is seeded with the very session
// cookie Auth.js would have issued. Nothing in the application exists just for this test.
async function signedInContext(user) {
 const token=await encode({token:{sub:user.id,email:user.email},secret:process.env.AUTH_SECRET,salt:'authjs.session-token'});
 return [{name:'authjs.session-token',value:token,url:baseURL}];
}
async function client(account) {
 const context=await browser.newContext({baseURL,viewport:{width:390,height:844},permissions:['microphone']});contexts.push(context);
 if(account) await context.addCookies(await signedInContext(account));
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(() => {
  // Synthetic spoken fixture feeds the actual microphone tap, AudioWorklet and upload.
  navigator.mediaDevices.getUserMedia = async () => {
   const context = new AudioContext({sampleRate:16000});
   const bytes = Uint8Array.from(atob(window.testFixture), c => c.charCodeAt(0));
   const buffer = await context.decodeAudioData(bytes.buffer);
   const source = context.createBufferSource(); source.buffer = buffer; source.loop = true;
   const destination = context.createMediaStreamDestination(); source.connect(destination);
   source.start(); await context.resume();
   (window.fixtureContexts ??= []).push(context);
   return destination.stream;
  };
  const NativePeer = window.RTCPeerConnection;
  const NativeRecorder = window.MediaRecorder;
  window.testRecordings = 0;
  window.MediaRecorder = class extends NativeRecorder {
   constructor(...args) { super(...args); window.testRecordings++; }
  };
  class TestPeer {
   connectionState='new';
   constructor(options) {
    if (options) {
     const peer = new NativePeer(options); (window.testAudioPeers ??= []).push(peer); return peer;
    }
    const audio = new AudioContext(); this.audio = audio;
    const oscillator = audio.createOscillator(); const gain = audio.createGain(); gain.gain.value = 0;
    const destination = audio.createMediaStreamDestination(); oscillator.connect(gain).connect(destination); oscillator.start();
    this.output = destination.stream.getAudioTracks()[0]; this.gain = gain;
   }
   addTrack(track) { window.testMicrophone=track; }
   createDataChannel(){
    const { audio, gain } = this;
    this.channel={readyState:'open',send(data){window.testUpdates??=[];window.testUpdates.push(JSON.parse(data));},close(){this.onclose?.();},
     set onmessage(handler) { this.handler = event => {
      if (JSON.parse(event.data).type === 'session.output_transcript.delta') {
       void audio.resume(); gain.gain.value = 0.25;
       setTimeout(() => { gain.gain.value = 0; }, 2000);
      }
      handler(event);
     }; }, get onmessage() { return this.handler; }
    };window.testChannel=this.channel;return this.channel;
   }
   async createOffer(){return {type:'offer',sdp:'synthetic-offer'};}
   async setLocalDescription(){}
   async setRemoteDescription(){this.connectionState='connected';this.channel.onopen?.();this.ontrack?.({track:this.output});}
   close(){this.connectionState='closed';void this.audio.close();this.onconnectionstatechange?.();}
  }
  window.RTCPeerConnection=TestPeer;
 });
 await page.route('**/api/openai/realtime-token',route=>route.fulfill({json:{value:'test-token'}}));
 await page.route('**/api/openai/transcription-token',route=>route.fulfill({json:{value:'test-token'}}));
 await page.route('https://api.openai.com/v1/realtime/calls',route=>route.fulfill({body:'synthetic-answer'}));
 await page.route('https://api.openai.com/v1/realtime/translations/calls',route=>route.fulfill({body:'synthetic-answer'}));

 return page;
}
// Opt-in live test: real Neon, OpenAI tone and ElevenLabs; consumes provider credits.
// Only transcription events are controlled so the text/audio boundary is repeatable.
try {
 accountEmail=`tone-branch-${Date.now()}@example.test`;
 const accountId=randomUUID();
 await neon(process.env.DATABASE_URL)`INSERT INTO adu_users(id,email,provider) VALUES(${accountId},${accountEmail},'google')`;
 const a=await client({id:accountId,email:accountEmail});
 await a.goto('/fr');
 const created=await a.request.post('/api/sessions',{headers:{origin:baseURL},data:{language:'fr',peerLanguage:'en',languageAuto:false,peerLanguageAuto:false}});
 assert.equal(created.status(),200);sessionId=(await created.json()).id;
 await a.goto(`/session/${sessionId}`);
 await a.getByRole('button',{name:'Pas maintenant'}).click();
 // Tone analysis is an account feature: the speaking phone signs in, as a guest would.
 speakerEmail=`tone-speaker-${Date.now()}@example.test`;const speakerId=randomUUID();
 await neon(process.env.DATABASE_URL)`INSERT INTO adu_users(id,email,provider) VALUES(${speakerId},${speakerEmail},'google')`;
 const b=await client({id:speakerId,email:speakerEmail});await b.goto(`/join/${sessionId}`);
 await b.getByRole('button',{name:'Not now'}).click();
 await b.getByRole('button',{name:'Start talking'}).waitFor();
 // No personal audio or clone: a standard voice produces an in-memory test fixture.
 const fixture=await a.request.post('/api/elevenlabs/speak',{headers:{origin:baseURL},data:{sessionId,language:'en',text:'I told you to leave it alone. Why did you do that again?',speech:{options:{emotion:true},tone:{tone:'angry',strength:'high',status:'estimated',model:'gpt-audio-mini',analysisMs:0},extraWaitMs:0}}});
 assert.equal(fixture.status(),200,'synthetic spoken fixture');
 await b.evaluate(base64=>{window.testFixture=base64;},(await fixture.body()).toString('base64'));
 await b.getByRole('button',{name:'Settings'}).click();
 await b.getByLabel(/Match my tone of voice/).check();
 await b.getByRole('button',{name:'Back to the conversation'}).click();
 // Explicit test preference; tone must never change the product's mode selection.
 await expect(b.locator('.pipeline-diagnostics > summary')).toContainText('1 ·');
 const mode=await b.request.patch(`/api/sessions/${sessionId}/mode`,{headers:{origin:baseURL},data:{preference:'context'}});
 assert.equal(mode.status(),200);
 await expect(b.locator('.pipeline-diagnostics > summary')).toContainText('2 ·',{timeout:15000});
 const uploads=[],responses=[],published=[],syntheses=[];
 b.on('request',request=>{
  if(request.url().endsWith('/api/audio/tone')) {
   const body=request.postDataBuffer();const start=body.indexOf(Buffer.from('RIFF'));assert.ok(start>=0);
   const bytes=body.subarray(start);const size=bytes.readUInt32LE(40);let sum=0;
   for(let i=44;i<44+size;i+=2)sum+=(bytes.readInt16LE(i)/32768)**2;
   const info={seconds:size/32000,bytes:44+size,rms:Math.sqrt(sum/(size/2))};
   uploads.push(info);console.log('CAPTURE',JSON.stringify(info));
  }
  if(request.url().endsWith('/events')&&request.method()==='POST') {
   const event=request.postDataJSON();if(event.speech){published.push(event);console.log('PUBLISHED',JSON.stringify(event.speech));}
  }
 });
 b.on('response',async response=>{
  if(response.url().endsWith('/api/audio/tone'))try {const body=await response.json();responses.push(body);console.log('TONE RESPONSE',response.status(),JSON.stringify(body));}catch{}
 });
 a.on('request',request=>{if(request.url().endsWith('/api/elevenlabs/speak'))syntheses.push(request.postDataJSON());});
 await b.getByRole('button',{name:'Start talking'}).click();
 await b.waitForFunction(()=>window.testChannel?.onmessage&&window.testMicrophone?.enabled);
 for(const [index,delay] of [null,3500].entries()) {
  if(delay!==null)await b.route('**/api/translate',async route=>{
   await new Promise(resolve=>setTimeout(resolve,delay));
   await route.fulfill({json:{text:'Je t’avais dit de ne pas y toucher.',targetLanguage:'fr',model:'controlled-latency',translationMs:delay,contextTurns:0}});
  });
  await b.waitForTimeout(3000);
  await b.evaluate(()=>window.testChannel.onmessage({data:JSON.stringify({type:'conversation.item.input_audio_transcription.delta',delta:'I told you to leave it alone!'})}));
  await expect.poll(()=>published.length,{timeout:20000}).toBe(index+1);
  await expect.poll(()=>syntheses.length,{timeout:20000}).toBe(index+1);
  assert.deepEqual(syntheses[index].speech,published[index].speech,'tone arrives unchanged at receiver synthesis');
  await expect(a.getByText(/Traduction en cours/)).toBeVisible({timeout:15000});
  await expect(a.getByText(/Traduction en cours/)).toBeHidden({timeout:20000});
 }
 assert.ok(uploads.every(x=>x.rms>.001),'voice samples contain non-silent PCM');
 assert.equal(published[1].speech.tone.status,'estimated','real model result reaches ElevenLabs when allowed to complete');
 assert.deepEqual(errors,[]);
 console.log('PASS: app microphone tap → WAV → real OpenAI → published metadata → receiver → real ElevenLabs playback.',JSON.stringify({uploads,responses}));
} finally {
 for(const context of contexts)await context.close();await browser.close();
 const sql=neon(process.env.DATABASE_URL);
 if(sessionId)await sql`DELETE FROM adu_sessions WHERE id=${sessionId}`;
 if(accountEmail)await sql`DELETE FROM adu_users WHERE email=${accountEmail}`;
 if(speakerEmail)await sql`DELETE FROM adu_users WHERE email=${speakerEmail}`;
}
