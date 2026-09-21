import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createLoader} from './load-ts.mjs';
const origin='http://localhost:3000';
const request=(body,path='/api/translate',method='POST')=>new Request(origin+path,{method,headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
const mocks={
 '@/lib/session/auth':{member:async()=>({slot:1,language:'en',user_id:null})},
 '@/lib/session/store':{targetLanguageForSession:async()=>'th'},
};
function environment(t){
 const names=['NEXT_PUBLIC_APP_URL','OPENAI_API_KEY','CRON_SECRET'];const previous=names.map(name=>process.env[name]);
 Object.assign(process.env,{NEXT_PUBLIC_APP_URL:origin,OPENAI_API_KEY:'secret',CRON_SECRET:'purge'});
 t.after(()=>names.forEach((name,i)=>{if(previous[i]===undefined)delete process.env[name];else process.env[name]=previous[i];}));
}
test('context translation uses authenticated target and original context, disables storage and hides keys',async t=>{
 environment(t);let sent;
 t.mock.method(globalThis,'fetch',async(url,options)=>{
  assert.equal(url,'https://api.openai.com/v1/chat/completions');sent=JSON.parse(options.body);
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({translation:'พรุ่งนี้'})}}]});
 });
 const {POST}=createLoader(mocks)('app/api/translate/route.ts');
 const response=await POST(request({sessionId:'room',text:'Tomorrow.',targetLanguage:'ru',context:[{speaker:0,original:'When?',translation:'Quand ?',sourceLanguage:'en',targetLanguage:'fr'}]}));
 assert.equal(response.status,200);assert.equal((await response.json()).targetLanguage,'th');assert.equal(sent.store,false);
 assert.match(sent.messages[0].content,/into th/);assert.match(sent.messages[0].content,/previous translations may contain errors/);
 assert.equal(JSON.parse(sent.messages[1].content).recentConversation[0].original,'When?');
});
test('malformed and oversized context never reaches a provider',async t=>{
 environment(t);t.mock.method(globalThis,'fetch',()=>assert.fail('no provider call'));
 const {POST}=createLoader(mocks)('app/api/translate/route.ts');
 for(const context of [null,[{speaker:5}],Array(13).fill({})])assert.equal((await POST(request({sessionId:'room',text:'Hi',context}))).status,400);
 assert.equal((await POST(request({sessionId:'room',text:'x'.repeat(4001),context:[]}))).status,400);
});
test('incomplete model output is never forwarded as a translation',async t=>{
 environment(t);t.mock.method(globalThis,'fetch',async()=>Response.json({choices:[{finish_reason:'length',message:{content:'partial'}}]}));
 const {POST}=createLoader(mocks)('app/api/translate/route.ts');
 assert.equal((await POST(request({sessionId:'room',text:'Hi',context:[]}))).status,502);
});
test('transcription credentials use the documented transcription session and expose only ephemeral value',async t=>{
 environment(t);t.mock.method(globalThis,'fetch',async(url,options)=>{
  assert.equal(url,'https://api.openai.com/v1/realtime/client_secrets');
  const {session}=JSON.parse(options.body);assert.equal(session.type,'transcription');assert.equal(session.audio.input.turn_detection,null);
  return Response.json({value:'ephemeral',session:{private:'must not escape'}});
 });
 const {POST}=createLoader(mocks)('app/api/openai/transcription-token/route.ts');
 assert.deepEqual(await (await POST(request({sessionId:'room'}))).json(),{value:'ephemeral'});
});
test('a guest cannot consent to or request cloning without first attaching an account',async t=>{
 environment(t);const load=createLoader({...mocks,'@/lib/neon/db':{db:()=>assert.fail('no write')},'@/lib/elevenlabs/server':{elevenHeaders:()=>assert.fail('no provider')}});
 const consent=await load('app/api/voice/consent/route.ts').POST(request({sessionId:'room',consent:'session-voice-v1'}));assert.equal(consent.status,403);
 const form=new FormData();form.set('sessionId','room');form.set('consent','session-voice-v1');form.set('seconds','30');form.set('tier','1');form.set('sample',new File([new Uint8Array(10001)],'voice.webm',{type:'audio/webm'}));
 const clone=await load('app/api/voice/clone/route.ts').POST(new Request(origin+'/api/voice/clone',{method:'POST',headers:{origin},body:form}));assert.equal(clone.status,403);
});

test('mode updates cannot change the other participant and invalid choices are rejected',async t=>{
 environment(t);const calls=[];
 const {PATCH}=createLoader({...mocks,'@/lib/neon/db':{db:()=>async(parts,...values)=>{calls.push({sql:parts.join('?'),values});return[];}}})('app/api/sessions/[id]/mode/route.ts');
 const context={params:Promise.resolve({id:'room'})};
 assert.equal((await PATCH(request({preference:'context',slot:0},'/api/sessions/room/mode','PATCH'),context)).status,200);
 assert.deepEqual(calls[0].values,['context','room',1]);
 assert.equal((await PATCH(request({preference:'unknown'},'/api/sessions/room/mode','PATCH'),context)).status,400);assert.equal(calls.length,1);
});
test('attaching an account restores only existing profile consent, never grants it by signing in',async t=>{
 environment(t);let query;
 const {POST}=createLoader({...mocks,'@/auth':{auth:async()=>({user:{id:'account'}})},'@/lib/neon/db':{db:()=>async(parts,...values)=>{query={sql:parts.join('?'),values};return[];}}})('app/api/sessions/[id]/account/route.ts');
 assert.equal((await POST(request({}),{params:Promise.resolve({id:'room'})})).status,200);
 assert.match(query.sql,/consent_at=v.consent_at/);assert.doesNotMatch(query.sql,/consent_at=now/);
 assert.deepEqual(query.values,['account','account','room',1]);
});
