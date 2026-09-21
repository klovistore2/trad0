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
const contexts=[];let sessionId;let accountEmail;
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
 // Creating a conversation needs an account, so a saved voice can outlive the session.
 accountEmail=`browser-test-${Date.now()}@example.test`;
 const accountId=randomUUID();
 await neon(process.env.DATABASE_URL)`INSERT INTO adu_users(id,email,provider) VALUES(${accountId},${accountEmail},'google')`;
 const anonymous=await client();await anonymous.goto('/');
 // The home page opens no microphone, and without an account it offers signing in, not creating.
 await expect(anonymous.getByRole('button',{name:'Commencer à parler'})).toHaveCount(0);
 // The other person's language is chosen before the conversation is created.
 const picker=anonymous.getByLabel('L’autre personne parle');
 await expect(picker).toHaveValue('en');
 await expect(picker.locator('option')).toContainText(['Français','English','ไทย · à tester']);
 await anonymous.getByRole('link',{name:/Se connecter/}).click();
 await anonymous.getByRole('button',{name:'Continuer avec Google'}).waitFor();
 await expect(anonymous.getByRole('button',{name:/mot de passe|adresse e-mail/i})).toHaveCount(0);

 const a=await client({id:accountId,email:accountEmail});await a.goto('/');
 await a.getByText(accountEmail).waitFor();
 await a.getByRole('button',{name:/Parler à deux/}).click();
 await a.waitForURL('**/session/*');sessionId=new URL(a.url()).pathname.split('/').pop();
 // The voice choice is asked once, on arrival. Declining keeps a standard voice.
 await a.getByRole('button',{name:/Pas maintenant/}).click();
 await expect(a.getByRole('dialog')).toHaveCount(0);
 await a.getByRole('img',{name:'QR code du lien d’invitation'}).waitFor();
 const link=await a.getByRole('textbox',{name:'Lien d’invitation'}).inputValue();assert.match(link,/\/join\//);
 const b=await client();await b.goto(link);
 // Accepting from the dialog records consent server side, with no trip through settings.
 await b.getByRole('button',{name:'Use my voice'}).click();
 await expect(b.getByRole('dialog')).toHaveCount(0);
 // Nobody is speaking yet, so both sides are offered the one-tap start.
 await b.getByRole('button',{name:'Start talking'}).waitFor();
 await a.getByRole('button',{name:'Commencer à parler'}).waitFor();
 const c=await client();await c.goto(link);
 await expect(c.locator('.error-message')).toContainText(/terminée|inaccessible/);
 // A single tap starts the conversation and claims the free floor: no second press to speak.
 await a.getByRole('button',{name:'Commencer à parler'}).click();
 // Intent is expressed: the button must never fall back to offering "Parler" while connecting.
 await expect(a.getByRole('button',{name:'Parler',exact:true})).toHaveCount(0);
 await a.waitForFunction(()=>window.testChannel?.onmessage && window.testMicrophone?.readyState==='live');
 await a.getByText('Votre micro est ouvert — parlez').waitFor();
 await a.waitForFunction(()=>window.testMicrophone.enabled===true);
 // A listener who never started a microphone session hears anyway: any touch arms playback,
 // and nothing specific has to be pressed.
 await b.locator('.translation-area').click();
 await a.evaluate(()=>window.testChannel.onmessage({data:JSON.stringify({type:'session.output_transcript.delta',delta:'This is a synthetic translation test.'})}));
 await b.getByText('This is a synthetic translation test.',{exact:true}).waitFor();
 await b.getByText(/Playing translation/).waitFor();
 await expect(b.getByRole('button',{name:'Hear the translation'})).toHaveCount(0);
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
 await b.getByText('A second sentence plays by itself.',{exact:true}).waitFor();
 await b.getByText(/Playing translation/).waitFor();
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
 await b.getByText('Playback survives a dark screen.',{exact:true}).waitFor();
 await b.getByText(/Playing translation/).waitFor();
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
 await a.getByText('Ceci est un test de traduction.',{exact:true}).waitFor();
 // Handing the floor back leaves both microphones closed, the resting state of a session.
 await b.getByRole('button',{name:'Done speaking'}).click();
 await b.waitForFunction(()=>window.testMicrophone.enabled===false);
 await a.getByText('Les deux micros sont fermés').waitFor();
 await a.waitForFunction(()=>window.testMicrophone.enabled===false);
 await a.screenshot({path:'/tmp/a-deux-conversation.png',fullPage:true});
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
 if (process.env.DATABASE_URL) {
  // What the dialog and the settings did is what reached the database: A declined then withdrew, B accepted.
  const consent=await neon(process.env.DATABASE_URL)`SELECT slot, consent_at IS NOT NULL AS consented FROM adu_participants WHERE session_id=${sessionId} ORDER BY slot`;
  assert.deepEqual(consent.map(row=>row.consented),[false,true]);
 }
 await a.getByRole('button',{name:'Terminer la session et supprimer les voix'}).click();
 await a.waitForURL(baseURL+'/');
 console.log('PASS: mobile QR, two browsers, third participant rejected, bidirectional subtitles, listener-only playback, streamed audio, one-tap start, speaker double check, floor claim and release, playback across a hidden screen, poll failure recovery, sound toggle, voice dialog, Google-only sign-in, settings panel, voice consent and withdrawal, theme, session closure.');
} finally {
 for(const context of contexts)await context.close();await browser.close();
 if(process.env.DATABASE_URL) {
  const sql=neon(process.env.DATABASE_URL);
  if(sessionId) await sql`DELETE FROM adu_sessions WHERE id=${sessionId}`;
  if(accountEmail) await sql`DELETE FROM adu_users WHERE email=${accountEmail}`;
 }
}
