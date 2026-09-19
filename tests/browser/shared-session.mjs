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
const pcm=Buffer.alloc(24000);
for(let i=0;i<12000;i++) pcm.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*440/24000)*1000),i*2);
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
 await page.route('**/api/elevenlabs/token',route=>route.fulfill({json:{token:'synthetic-token',voiceId:'synthetic-voice',model:'synthetic-model'}}));
 await page.routeWebSocket('wss://api.elevenlabs.io/**',socket=>{
  socket.onMessage(message=>{
   const event=JSON.parse(String(message));
   if(event.text==='') {socket.send(JSON.stringify({audio:pcm.toString('base64')}));socket.send(JSON.stringify({isFinal:true}));}
  });
 });
 return page;
}
try {
 const a=await client();await a.goto('/');
 await a.getByRole('button',{name:/Parler à deux/}).click();
 await a.waitForURL('**/session/*');sessionId=new URL(a.url()).pathname.split('/').pop();
 await a.getByRole('img',{name:'QR code du lien d’invitation'}).waitFor();
 const link=await a.getByRole('textbox',{name:'Lien d’invitation'}).inputValue();assert.match(link,/\/join\//);
 const b=await client();await b.goto(link);
 await b.getByRole('button',{name:'Enable microphone & sound'}).waitFor();
 await a.getByRole('button',{name:'Activer le micro et le son'}).waitFor();
 const c=await client();await c.goto(link);
 await expect(c.locator('.error-message')).toContainText(/terminée|inaccessible/);
 await a.getByRole('button',{name:'Activer le micro et le son'}).click();
 await b.getByRole('button',{name:'Enable microphone & sound'}).click();
 await a.waitForFunction(()=>window.testChannel?.onmessage && window.testMicrophone?.readyState==='live');
 await b.waitForFunction(()=>window.testChannel?.onmessage && window.testMicrophone?.readyState==='live');
 await a.evaluate(()=>window.testChannel.onmessage({data:JSON.stringify({type:'session.output_transcript.delta',delta:'This is a synthetic translation test.'})}));
 await b.getByText('This is a synthetic translation test.',{exact:true}).waitFor();
 await b.getByText(/Playing translation/).waitFor();
 await b.waitForFunction(()=>window.testMicrophone.enabled===false);
 await b.waitForFunction(()=>window.testMicrophone.enabled===true);
 await b.evaluate(()=>window.testChannel.onmessage({data:JSON.stringify({type:'session.output_transcript.delta',delta:'Ceci est un test de traduction.'})}));
 await a.getByText('Ceci est un test de traduction.',{exact:true}).waitFor();
 await a.getByRole('button',{name:'Mettre en pause'}).click();
 await a.waitForFunction(()=>window.testMicrophone.readyState==='ended');
 await a.getByText('Utiliser ma voix',{exact:true}).click();
 await a.getByRole('button',{name:/J’accepte/}).click();
 await a.getByRole('button',{name:'Annuler',exact:true}).waitFor();
 await a.getByRole('button',{name:'Annuler',exact:true}).click();
 await a.getByRole('button',{name:/J’accepte/}).waitFor();
 await a.getByRole('button',{name:'Changer le thème clair ou sombre'}).click();
 await a.screenshot({path:'/tmp/a-deux-shared-dark.png',fullPage:true});
 assert.deepEqual(errors,[]);
 await a.getByRole('button',{name:'Terminer la session et supprimer les voix'}).click();
 await a.waitForURL(baseURL+'/');
 console.log('PASS: mobile QR, two browsers, third participant rejected, bidirectional subtitles, streamed audio, microphone pause, voice consent/cancel, theme, session closure.');
} finally {
 for(const context of contexts)await context.close();await browser.close();
 if(sessionId && process.env.DATABASE_URL)await neon(process.env.DATABASE_URL)`DELETE FROM adu_sessions WHERE id=${sessionId}`;
}
