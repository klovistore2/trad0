// Browser flow with real Neon session transport and simulated audio providers.
// Start a test server with NEXT_PUBLIC_APP_URL=http://localhost:3100 first.
import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { neon } from '@neondatabase/serverless';
createRequire(import.meta.url)('@next/env').loadEnvConfig(process.cwd());
const baseURL = process.env.TEST_BASE_URL || 'http://localhost:3100';
const browser = await chromium.launch({ headless:true, args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'] });
const contexts=[];let sessionId;
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
async function client() {
 const context=await browser.newContext({baseURL,viewport:{width:390,height:844},permissions:['microphone']});contexts.push(context);
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(() => {
  class TestPeer {
   connectionState='new';
   addTrack(track) { window.testMicrophone=track; }
   createDataChannel(){this.channel={close(){this.onclose?.();}};window.testChannel=this.channel;return this.channel;}
   async createOffer(){return {type:'offer',sdp:'synthetic-offer'};}
   async setLocalDescription(){}
   async setRemoteDescription(){this.connectionState='connected';this.channel.onopen?.();}
   close(){this.connectionState='closed';this.onconnectionstatechange?.();}
  }
  window.RTCPeerConnection=TestPeer;
 });
 await page.route('**/api/openai/realtime-token',route=>route.fulfill({json:{value:'test-token'}}));
 await page.route('https://api.openai.com/v1/realtime/translations/calls',route=>route.fulfill({body:'synthetic-answer'}));
 await page.route('**/api/elevenlabs/speak',route=>route.fulfill({contentType:'audio/wav',body:clip}));
 return page;
}
try {
 const a=await client();await a.goto('/');
 await a.getByRole('button',{name:/Parler à deux/}).click();
 await a.waitForURL('**/session/*');sessionId=new URL(a.url()).pathname.split('/').pop();
 await a.getByRole('img',{name:'QR code du lien d’invitation'}).waitFor();
 const link=await a.getByRole('textbox',{name:'Lien d’invitation'}).inputValue();assert.match(link,/\/join\//);
 const b=await client();await b.goto(link);
 await b.getByRole('button',{name:'Start the conversation'}).waitFor();
 await a.getByRole('button',{name:'Démarrer la conversation'}).waitFor();
 const c=await client();await c.goto(link);
 await expect(c.locator('.error-message')).toContainText(/terminée|inaccessible/);
 await a.getByRole('button',{name:'Démarrer la conversation'}).click();
 await a.waitForFunction(()=>window.testChannel?.onmessage && window.testMicrophone?.readyState==='live');
 // No one holds the floor at first, so no microphone can capture the other device's speaker.
 await a.getByText('Les deux micros sont fermés').waitFor();
 await a.waitForFunction(()=>window.testMicrophone.enabled===false);
 await a.getByRole('button',{name:'Parler',exact:true}).click();
 await a.getByText('Votre micro est ouvert — parlez').waitFor();
 await a.waitForFunction(()=>window.testMicrophone.enabled===true);
 // A listener who never started a microphone session hears anyway: any touch arms playback,
 // and nothing specific has to be pressed.
 await b.locator('.translation-area').click();
 await a.evaluate(()=>window.testChannel.onmessage({data:JSON.stringify({type:'session.output_transcript.delta',delta:'This is a synthetic translation test.'})}));
 await b.getByText('This is a synthetic translation test.',{exact:true}).waitFor();
 await b.getByText(/Playing translation/).waitFor();
 await expect(b.getByRole('button',{name:'Hear the translation'})).toHaveCount(0);
 // Arming happens once, not per sentence: the flow keeps coming with no further interaction.
 await expect(b.getByText(/Playing translation/)).toBeHidden();
 await a.evaluate(()=>window.testChannel.onmessage({data:JSON.stringify({type:'session.output_transcript.delta',delta:'A second sentence plays by itself.'})}));
 await b.getByText('A second sentence plays by itself.',{exact:true}).waitFor();
 await b.getByText(/Playing translation/).waitFor();
 // Joining in with a microphone keeps exactly one open, because A holds the floor.
 await b.getByRole('button',{name:'Start the conversation'}).click();
 await b.waitForFunction(()=>window.testChannel?.onmessage && window.testMicrophone?.readyState==='live');
 await a.waitForFunction(()=>window.testMicrophone.enabled===true);
 await b.waitForFunction(()=>window.testMicrophone.enabled===false);
 // Regression: a receiving screen that went dark must not silently stop playing.
 await b.evaluate(()=>{Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
 await b.waitForFunction(()=>window.testMicrophone.readyState==='ended');
 await b.evaluate(()=>{Object.defineProperty(document,'hidden',{value:false,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
 await b.waitForFunction(()=>window.testMicrophone.readyState==='live');
 await a.evaluate(()=>window.testChannel.onmessage({data:JSON.stringify({type:'session.output_transcript.delta',delta:'Playback survives a dark screen.'})}));
 await b.getByText('Playback survives a dark screen.',{exact:true}).waitFor();
 await b.getByText(/Playing translation/).waitFor();
 // A dropped status poll must not end the conversation: only a closed session does.
 const statusPoll=url=>/\/api\/sessions\/[0-9a-f-]{36}$/.test(url.pathname);
 await b.route(statusPoll,route=>route.abort());
 await b.getByText('Reconnecting…').waitFor();
 await b.getByRole('button',{name:'Let me speak'}).waitFor();
 await b.unroute(statusPoll);
 await expect(b.getByText('Reconnecting…')).toBeHidden();
 // Muting playback keeps the subtitles and stops the audio.
 await b.getByRole('button',{name:/Sound on/}).click();
 await b.getByRole('button',{name:/Text only/}).click();
 await b.getByRole('button',{name:/Sound on/}).waitFor();
 // Taking the floor swaps the microphones both ways.
 await b.getByRole('button',{name:'Let me speak'}).click();
 await b.waitForFunction(()=>window.testMicrophone.enabled===true);
 await a.waitForFunction(()=>window.testMicrophone.enabled===false);
 await a.getByRole('button',{name:'À moi de parler'}).waitFor();
 await b.evaluate(()=>window.testChannel.onmessage({data:JSON.stringify({type:'session.output_transcript.delta',delta:'Ceci est un test de traduction.'})}));
 await a.getByText('Ceci est un test de traduction.',{exact:true}).waitFor();
 // Handing the floor back leaves both microphones closed, the resting state of a session.
 await b.getByRole('button',{name:'Done speaking'}).click();
 await b.waitForFunction(()=>window.testMicrophone.enabled===false);
 await a.getByText('Les deux micros sont fermés').waitFor();
 await a.waitForFunction(()=>window.testMicrophone.enabled===false);
 // The conversation screen carries none of this: settings hold voice, invite, diagnostics and closing.
 await expect(a.getByText('Utiliser ma voix',{exact:true})).toBeHidden();
 await expect(a.getByRole('button',{name:'Terminer la session et supprimer les voix'})).toBeHidden();
 // Consent is a single tap and is recorded server side; cloning then follows speech on its own.
 await a.getByRole('button',{name:'Paramètres'}).click();
 await a.getByRole('heading',{name:'Paramètres'}).waitFor();
 await a.getByText('Utiliser ma voix',{exact:true}).click();
 await a.getByRole('button',{name:/J’accepte/}).click();
 await a.locator('.voice-consent').getByText(/Parole captée/).waitFor();
 await a.getByRole('button',{name:'Ne plus utiliser ma voix'}).click();
 await a.getByRole('button',{name:/J’accepte/}).waitFor();
 await a.getByRole('img',{name:'QR code du lien d’invitation'}).waitFor();
 await a.getByRole('button',{name:'Changer le thème clair ou sombre'}).click();
 await a.screenshot({path:'/tmp/a-deux-shared-dark.png',fullPage:true});
 assert.deepEqual(errors,[]);
 await a.getByRole('button',{name:'Terminer la session et supprimer les voix'}).click();
 await a.waitForURL(baseURL+'/');
 console.log('PASS: mobile QR, two browsers, third participant rejected, bidirectional subtitles, listener-only playback, streamed audio, floor claim and release, playback across a hidden screen, poll failure recovery, sound toggle, settings panel, voice consent and withdrawal, theme, session closure.');
} finally {
 for(const context of contexts)await context.close();await browser.close();
 if(sessionId && process.env.DATABASE_URL)await neon(process.env.DATABASE_URL)`DELETE FROM adu_sessions WHERE id=${sessionId}`;
}
