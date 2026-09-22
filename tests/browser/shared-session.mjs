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
const contexts=[];let sessionId;let accountEmail;let guestEmail;
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
 await page.route('**/api/elevenlabs/speak',route=>route.fulfill({contentType:'audio/wav',body:clip}));
 return page;
}
try {
 // Creating a conversation needs an account, so a saved voice can outlive the session.
 accountEmail=`browser-test-${Date.now()}@example.test`;
 const accountId=randomUUID();
 await neon(process.env.DATABASE_URL)`INSERT INTO adu_users(id,email,provider) VALUES(${accountId},${accountEmail},'google')`;
 const anonymous=await client();await anonymous.goto('/');
 // The home page opens no microphone, and without an account it offers signing in, not creating.
 await expect(anonymous.getByRole('button',{name:'Start talking'})).toHaveCount(0);
 // The other person's language is chosen before the conversation is created.
 const picker=anonymous.getByLabel('Translate to:');
 await expect(picker).toHaveValue('en');
 await expect(anonymous.getByRole('status')).toHaveText('Auto ↔ English');
 await expect(picker.locator('option')).toContainText(['French','English','Thai','Dutch']);
 await anonymous.getByRole('button',{name:'Sign in to start a conversation'}).waitFor();
 await expect(anonymous.getByRole('button',{name:/password|e-mail address/i})).toHaveCount(0);

 const a=await client({id:accountId,email:accountEmail});await a.goto('/fr');
 await a.getByText(accountEmail).waitFor();
 // English keeps the rest of this flow readable; the picker itself is checked above.
 await a.locator('#peer-language').selectOption('en');
 await a.getByRole('button',{name:/Parler à quelqu’un/}).click();
 await a.waitForURL('**/session/*');sessionId=new URL(a.url()).pathname.split('/').pop();
 // The voice choice is asked once, on arrival. Declining keeps a standard voice.
 await a.getByRole('button',{name:/Pas maintenant/}).click();
 await expect(a.getByRole('dialog')).toHaveCount(0);
 await a.getByRole('img',{name:'QR code du lien d’invitation'}).waitFor();
 const link=await a.getByRole('textbox',{name:'Lien d’invitation'}).inputValue();assert.match(link,/\/join\//);
 const b=await client();await b.goto(link);
 // A guest can converse immediately; cloning requires an account and later consent.
 await expect(b.getByRole('dialog')).toHaveCount(0);
 // Nobody is speaking yet, so both sides are offered the one-tap start.
 await b.getByRole('button',{name:'Start talking'}).waitFor();
 await a.getByRole('button',{name:'Commencer à parler'}).waitFor();
 await a.locator('#my-language').selectOption('fr');
 const c=await client();await c.goto(link);
 await expect(c.locator('.error-message')).toContainText(/terminée|inaccessible/);
 // A single tap starts the conversation and claims the free floor: no second press to speak.
 await a.getByRole('button',{name:'Commencer à parler'}).click();
 // Intent is expressed: the button must never fall back to offering "Parler" while connecting.
 await expect(a.getByRole('button',{name:'Parler',exact:true})).toHaveCount(0);
 await a.waitForFunction(()=>window.testChannel?.onmessage && window.testMicrophone?.readyState==='live');
 await a.getByText('Votre micro est ouvert — parlez').waitFor();
 await a.waitForFunction(()=>window.testMicrophone.enabled===true);
 // The icon starts closed until playback is actually armed. A single press must enable
 // listening, even when the pointer is held long enough for asynchronous arming to finish.
 const speaker=b.locator('.sound-icon');
 await expect(speaker).toHaveAttribute('aria-label','Hear the translation');
 await expect(speaker).toHaveAttribute('aria-pressed','true');
 await expect(speaker.locator('path[d="M16 9.5l5 5"]')).toHaveCount(1);
 const speakerBounds=await speaker.boundingBox();assert.ok(speakerBounds);
 await b.mouse.move(speakerBounds.x+speakerBounds.width/2,speakerBounds.y+speakerBounds.height/2);
 await b.mouse.down();
 // Reproduce the pointerdown → async unlock → click ordering behind the double-tap bug.
 await b.waitForTimeout(200);
 await expect(speaker).toHaveAttribute('aria-label','Hear the translation');
 await b.mouse.up();
 await expect(speaker).toHaveAttribute('aria-label','Mute the sound');
 await expect(speaker).toHaveAttribute('aria-pressed','false');
 await expect(speaker.locator('path[d="M16 9.5l5 5"]')).toHaveCount(0);
 // A listener who never started a microphone session hears the translated track.
 await a.waitForFunction(()=>window.testAudioPeers?.some(p=>p.connectionState==='connected'));
 await b.waitForFunction(()=>window.testAudioPeers?.some(p=>p.connectionState==='connected'));
 await a.evaluate(()=>window.testChannel.onmessage({data:JSON.stringify({type:'session.output_transcript.delta',delta:'This is a synthetic translation test.'})}));
 await Promise.all([b.getByText('This is a synthetic translation test.',{exact:true}).waitFor(), b.getByText(/Playing translation/).waitFor()]);
 // The speaker icon is the only sound control: no separate prompt, no separate button.
 await expect(b.locator('.sound-icon')).toHaveCount(1);
 await expect(b.locator('.sound-icon.needs-tap')).toHaveCount(0);
 await expect(b.getByText(/Touch the screen/)).toHaveCount(0);
 // A speaker can check what the microphone understood, not only what the other person receives.
 await a.evaluate(()=>window.testChannel.onmessage({data:JSON.stringify({type:'session.input_transcript.delta',delta:'Ceci est ce que j’ai réellement dit.'})}));
 await a.getByText('Mes mots',{exact:true}).click();
 await a.getByRole('button',{name:'Ce que j’ai dit'}).click();
 await a.getByText('Ceci est ce que j’ai réellement dit.',{exact:true}).waitFor();
 await a.getByRole('button',{name:'Ce que l’autre reçoit'}).click();
 await a.getByText('This is a synthetic translation test.',{exact:true}).waitFor();
 // Arming happens once, not per sentence: the flow keeps coming with no further interaction.
 await expect(b.getByText(/Playing translation/)).toBeHidden();
 await a.evaluate(()=>window.testChannel.onmessage({data:JSON.stringify({type:'session.output_transcript.delta',delta:'A second sentence plays by itself.'})}));
 await Promise.all([b.getByText('A second sentence plays by itself.',{exact:true}).waitFor(), b.getByText(/Playing translation/).waitFor()]);
 // Joining while someone speaks must never steal the floor, so B's tap only starts listening.
 await b.getByRole('button',{name:/Join in/}).click();
 await b.waitForFunction(()=>window.testChannel?.onmessage && window.testMicrophone?.readyState==='live');
 await a.waitForFunction(()=>window.testMicrophone.enabled===true);
 await b.waitForFunction(()=>window.testMicrophone.enabled===false);
 // Regression: a receiving screen that went dark must not silently stop playing.
 await b.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
 await b.waitForFunction(()=>window.testMicrophone.readyState==='ended');
 await b.evaluate(()=>{Object.defineProperty(document,'hidden',{value:false,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
 await b.waitForFunction(()=>window.testMicrophone.readyState==='live');
 await a.evaluate(()=>window.testChannel.onmessage({data:JSON.stringify({type:'session.output_transcript.delta',delta:'Playback survives a dark screen.'})}));
 await Promise.all([b.getByText('Playback survives a dark screen.',{exact:true}).waitFor(), b.getByText(/Playing translation/).waitFor()]);
 // A dropped status poll must not end the conversation: only a closed session does.
 const statusPoll=url=>/\/api\/sessions\/[0-9a-f-]{36}$/.test(url.pathname);
 await b.route(statusPoll,route=>route.abort());
 await b.getByText('Reconnecting…').waitFor();
 await b.getByRole('button',{name:'Let me speak'}).waitFor();
 await b.unroute(statusPoll);
 await expect(b.getByText('Reconnecting…')).toBeHidden();
 // Muting is one visible control under the language banner, not a line of text at the bottom.
 await b.getByRole('button',{name:'Mute the sound'}).click();
 await b.getByText('Text only',{exact:true}).waitFor();
 await b.getByRole('button',{name:'Turn the sound on'}).click();
 await b.getByRole('button',{name:'Mute the sound'}).waitFor();
 // Taking the floor swaps the microphones both ways.
 await b.getByRole('button',{name:'Let me speak'}).click();
 await b.waitForFunction(()=>window.testMicrophone.enabled===true);
 await a.waitForFunction(()=>window.testMicrophone.enabled===false);
 await a.getByRole('button',{name:'À moi de parler'}).waitFor();
 await b.evaluate(()=>window.testChannel.onmessage({data:JSON.stringify({type:'session.output_transcript.delta',delta:'Ceci est un test de traduction.'})}));
 await Promise.all([a.getByText('Ceci est un test de traduction.',{exact:true}).waitFor(),a.getByText(/Traduction en cours/).waitFor()]);
 // Both language menus synchronize and update the active translation without replacing the mic.
 await b.locator('#peer-language').selectOption('es');
 await expect(a.locator('#my-language')).toHaveValue('es');
 await b.waitForFunction(()=>window.testUpdates?.some(e=>e.session?.audio?.output?.language==='es'));
 await b.waitForFunction(()=>window.testMicrophone.readyState==='live' && window.testMicrophone.enabled);
 await b.locator('#peer-language').selectOption('fr');
 await expect(a.locator('#my-language')).toHaveValue('fr');
 await b.waitForFunction(()=>window.testUpdates?.at(-1)?.session?.audio?.output?.language==='fr');
 // Dutch persists in the real database and routes outgoing speech through mode 2.
 const dutchUpdate=b.waitForResponse(response=>response.url().endsWith('/language') && response.request().method()==='PATCH');
 await b.locator('#peer-language').selectOption('nl');
 const dutchResponse=await dutchUpdate;
 assert.equal(dutchResponse.status(),200,await dutchResponse.text());
 await expect(a.locator('#my-language')).toHaveValue('nl',{timeout:10000});
 await expect(b.locator('.pipeline-diagnostics > summary')).toContainText('2 ·');
 assert.equal(await b.evaluate(()=>window.testUpdates?.some(e=>e.session?.audio?.output?.language==='nl')),false);
 // Returning to Italian restores the direct pipeline without leaving a dead microphone.
 await b.locator('#peer-language').selectOption('it');
 await expect(a.locator('#my-language')).toHaveValue('it');
 await expect(b.locator('.pipeline-diagnostics > summary')).toContainText('1 ·');
 await b.waitForFunction(()=>window.testMicrophone.readyState==='live' && window.testMicrophone.enabled);
 // A provider error exposes a working retry button instead of claiming the mic is open.
 await b.evaluate(()=>window.testChannel.onmessage({data:JSON.stringify({type:'error',error:{code:'test_interruption'}})}));
 await b.waitForFunction(()=>window.testMicrophone.readyState==='ended');
 await b.getByRole('button',{name:/Join in/}).click();
 await b.waitForFunction(()=>window.testMicrophone.readyState==='live' && window.testMicrophone.enabled);
 await b.locator('#peer-language').selectOption('fr');
 await expect(a.locator('#my-language')).toHaveValue('fr');
 await b.waitForFunction(()=>window.testUpdates?.at(-1)?.session?.audio?.output?.language==='fr');
 // Speech detection is asynchronous. Mock its model result at the HTTP boundary, keep real
 // persistence and polling, then verify an explicit correction disables future detection.
 const sqlLanguage=neon(process.env.DATABASE_URL);
 let detectionCalls=0;
 await b.route('**/api/sessions/*/language',async route=>{
  if(route.request().method()!=='POST') return route.continue();
  detectionCalls++;
  const {revision,text}=route.request().postDataJSON();assert.match(text,/actually speaking/);
  await sqlLanguage`UPDATE adu_participants SET language='en',language_detected=true,language_attempts=language_attempts+1 WHERE session_id=${sessionId} AND slot=1 AND language_auto=true AND language_revision=${revision}`;
  await route.fulfill({json:{applied:true}});
 });
 await b.locator('#my-language').selectOption('auto');
 await expect(b.locator('#my-language')).toHaveValue('auto');
 await b.evaluate(()=>window.testChannel.onmessage({data:JSON.stringify({type:'session.input_transcript.delta',delta:'I am actually speaking English in this conversation.'})}));
 await expect(b.getByText(/English · Detected · change if needed/)).toBeVisible();
 assert.equal(detectionCalls,1);
 await b.locator('#my-language').selectOption('en');
 await expect(b.locator('#my-language')).toHaveValue('en');
 // Mode 2 works for a guest who has not consented, while A stays in mode 1.
 let llmCalls=0, toneCalls=0, expressiveSpeech;
 await b.route('**/api/audio/tone',async route=>{
  toneCalls++;
  assert.ok(route.request().postDataBuffer().length>11000,'real worklet supplies a WAV excerpt');
  await route.fulfill({json:{tone:'happy',strength:'medium',status:'estimated',analysisMs:15,model:'gpt-audio-mini'}});
 });
 await a.route('**/api/elevenlabs/speak',async route=>{
  expressiveSpeech=route.request().postDataJSON().speech;
  await route.fulfill({contentType:'audio/wav',body:clip,headers:{'X-TTS-Model':'eleven_v3','X-TTS-Headers-Ms':'18'}});
 });
 await b.route('**/api/translate',async route=>{
  const body=route.request().postDataJSON();llmCalls++;
  assert.equal(body.text,'Can we go there tomorrow?');
  assert.ok(body.context.some(turn=>turn.speaker===0 && turn.original.includes('réellement')));
  assert.ok(body.context.some(turn=>turn.speaker===1 && turn.original.includes('actually speaking')));
  await route.fulfill({json:{text:'Peut-on y aller demain ?',targetLanguage:'fr',model:'test-fast-llm',contextTurns:body.context.length,translationMs:42}});
 });
 await b.getByRole('button',{name:'Settings'}).click();
 // Tone analysis is an account feature: a guest is never offered it, even with a saved choice.
 await b.getByRole('heading',{name:'Settings'}).waitFor();
 await expect(b.getByLabel(/Match my tone of voice/)).toHaveCount(0);
 await b.evaluate(()=>localStorage.setItem('trad0-speech-options',JSON.stringify({emotion:true})));
 // No mode control is left in the panel: auto follows the clone, so the journey drives the
 // documented route itself to exercise the context pipeline without one.
 await b.evaluate(async id => {
  const response = await fetch(`/api/sessions/${id}/mode`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({preference:'context'})});
  if(!response.ok) throw new Error('mode preference rejected');
 }, sessionId);
 await b.waitForFunction(()=>window.testMicrophone.readyState==='live');
 await b.getByRole('button',{name:'Back to the conversation'}).click();
 await expect(b.locator('.pipeline-diagnostics > summary')).toContainText('2 ·');
 await expect(a.locator('.pipeline-diagnostics > summary')).toContainText('1 ·');
 await b.waitForFunction(()=>window.testMicrophone.readyState==='live' && window.testMicrophone.enabled);
 await b.waitForTimeout(1200); // Accumulate a real bounded PCM sample from the fake microphone.
 await b.evaluate(()=>window.testChannel.onmessage({data:JSON.stringify({type:'conversation.item.input_audio_transcription.delta',delta:'Can we go there tomorrow?'})}));
 await a.getByText('Peut-on y aller demain ?', {exact:true}).waitFor();
 await a.getByText(/Traduction en cours/).waitFor();
 assert.equal(llmCalls,1);
 assert.equal(toneCalls,0,'a guest never uploads tone audio');
 assert.equal(expressiveSpeech.options.emotion,false);
 assert.equal(expressiveSpeech.tone.status,'disabled');
 assert.equal(await a.evaluate(()=>window.testRecordings),0);
 assert.equal(await b.evaluate(()=>window.testRecordings),0);
 // Handing the floor back leaves both microphones closed, the resting state of a session.
 await b.getByRole('button',{name:'Done speaking'}).click();
 await b.waitForFunction(()=>window.testMicrophone.enabled===false);
 await a.getByText('Les deux micros sont fermés').waitFor();
 await a.waitForFunction(()=>window.testMicrophone.enabled===false);
 await a.screenshot({path:'/tmp/a-deux-conversation.png',fullPage:true});
 // The conversation screen carries none of this: settings hold voice, invite, diagnostics and closing.
 await expect(a.getByLabel(/Use my own voice when possible/)).toBeHidden();
 await expect(a.getByRole('button',{name:'End the conversation'})).toBeHidden();
 // Consent is the tick itself, recorded server side; cloning then follows speech on its own.
 await a.getByRole('button',{name:'Settings'}).click();
 await a.getByRole('heading',{name:'Settings'}).waitFor();
 await expect(a.getByLabel(/Use my own voice when possible/)).not.toBeChecked();
 await a.getByLabel(/Use my own voice when possible/).check();
 await a.locator('.voice-consent').getByText(/captured/).waitFor();
 // Removing the voice stays a separate, explicit act, never a side effect of unticking.
 await a.getByText('Remove my voice').click();
 await a.getByRole('button',{name:/Delete my voice/}).click();
 await expect(a.getByLabel(/Use my own voice when possible/)).not.toBeChecked();
 // Inviting belongs to the waiting screen only: settings carry no second invitation.
 await expect(a.getByRole('img',{name:'QR code du lien d’invitation'})).toHaveCount(0);
 await a.getByRole('button',{name:'Changer le thème clair ou sombre'}).click();
 await a.screenshot({path:'/tmp/a-deux-shared-dark.png',fullPage:true});
 assert.deepEqual(errors,[]);
 if (process.env.DATABASE_URL) {
  // A withdrew consent; the guest used mode 2 without consenting.
  const consent=await neon(process.env.DATABASE_URL)`SELECT slot, consent_at IS NOT NULL AS consented FROM adu_participants WHERE session_id=${sessionId} ORDER BY slot`;
  assert.deepEqual(consent.map(row=>row.consented),[false,false]);
 }
 // Google login returns the guest to the same participant, then asks explicit consent.
 guestEmail=`browser-guest-${Date.now()}@example.test`;
 const guestId=randomUUID();
 await neon(process.env.DATABASE_URL)`INSERT INTO adu_users(id,email,provider) VALUES(${guestId},${guestEmail},'google')`;
 await b.context().addCookies(await signedInContext({id:guestId,email:guestEmail}));
 await b.goto(`/session/${sessionId}`);
 await b.waitForURL(`**/session/${sessionId}`);
 await b.getByRole('button',{name:'Use my voice'}).click();
 await expect(b.getByRole('dialog')).toHaveCount(0);
 // A gesture elsewhere still arms playback; the speaker button is never mandatory.
 await expect(b.getByRole('button',{name:'Mute the sound'})).toBeVisible();
 await expect.poll(async()=>{
  const rows=await neon(process.env.DATABASE_URL)`SELECT user_id,consent_at IS NOT NULL AS consented FROM adu_participants WHERE session_id=${sessionId} AND slot=1`;
  return rows[0];
 }).toEqual({user_id:guestId,consented:true});
 assert.deepEqual(errors,[]);
 await a.getByRole('button',{name:'End the conversation'}).click();
 await a.waitForURL(baseURL+'/');
 console.log('PASS: mobile QR, two browsers, third participant rejected, bidirectional subtitles, listener-only playback, streamed audio, one-tap start, speaker double check, floor claim and release, playback across a hidden screen, poll failure recovery, sound toggle, voice dialog, Google-only sign-in, settings panel, tone kept for accounts, per-speaker TTS options, voice consent and withdrawal, theme, session closure.');
} finally {
 for(const context of contexts)await context.close();await browser.close();
 if(process.env.DATABASE_URL) {
  const sql=neon(process.env.DATABASE_URL);
  if(sessionId) await sql`DELETE FROM adu_sessions WHERE id=${sessionId}`;
  if(accountEmail) await sql`DELETE FROM adu_users WHERE email=${accountEmail}`;
  if(guestEmail) await sql`DELETE FROM adu_users WHERE email=${guestEmail}`;
 }
}
