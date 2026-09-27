import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createLoader} from './load-ts.mjs';
const origin='http://localhost:3000';
const request=(body,path='/api/translate',method='POST')=>new Request(origin+path,{method,headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
const mocks={
 '@/lib/session/auth':{
  member:async()=>({slot:1,language:'en',user_id:null}),
  // One read for the caller, the other participant and the creator's credits (no account: never blocks).
  speakerContext:async()=>({slot:1,language:'en',user_id:null,peer:{slot:0,language:'th'},payerEmail:null,payerBalance:0}),
 },
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
test('a reloaded page gets recent finished sentences and goes on from the newest event, not the whole history',async t=>{
 environment(t);const queries=[];
 const {GET}=createLoader({
  '@/lib/session/auth':{member:async()=>({slot:0,floor_slot:null}),guestHash:async()=>'hash',validId:()=>true},
  '@/lib/neon/db':{db:()=>async(strings,...values)=>{
   const sql=strings.join('?');queries.push({sql,values});
   if(sql.includes('MAX(seq)'))return [{cursor:'57'}];
   return [{floorSlot:null,seq:'40',id:'e',turnId:'t',text:'Hello.',committed:true,ageMs:600_000,metadata:{kind:'translation',mode:'context'}}];
  }},
 })('app/api/sessions/[id]/events/route.ts');
 const params=Promise.resolve({id:'room'});
 const fresh=await (await GET(new Request(origin+'/api/sessions/room/events'),{params})).json();
 assert.equal(fresh.cursor,'57');assert.equal(fresh.events[0].kind,'translation');assert.equal(fresh.floor,null);
 const recent=queries.find(query=>query.sql.includes('ORDER BY seq DESC'));
 assert.match(recent.sql,/AND committed AND seq<=/,'only finished sentences, never every streamed subtitle');
 assert.ok(recent.values.includes('57'),'nothing newer than the cursor, so nothing is skipped');
 queries.length=0;
 const live=await (await GET(new Request(origin+'/api/sessions/room/events?after=57'),{params})).json();
 assert.equal(live.cursor,undefined);assert.match(queries[0].sql,/seq>/);assert.ok(queries[0].values.includes('57'));
 assert.equal((await GET(new Request(origin+'/api/sessions/room/events?after=abc'),{params})).status,400);
});
test('the live poll checks membership and reads new events in one round trip, and refuses a stranger',async t=>{
 environment(t);const queries=[];let member=true;
 const {GET}=createLoader({
  '@/lib/session/auth':{member:()=>assert.fail('the live poll needs no separate membership query'),guestHash:async()=>'hash',validId:()=>true},
  '@/lib/neon/db':{db:()=>async(strings,...values)=>{
   queries.push({sql:strings.join('?'),values});
   if(!member)return [];
   // Nothing new still returns the participant's row, with empty event columns.
   return [{floorSlot:1,seq:null,id:null,turnId:null,text:null,committed:null,metadata:null,ageMs:null}];
  }},
 })('app/api/sessions/[id]/events/route.ts');
 const params=Promise.resolve({id:'room'});
 const quiet=await (await GET(new Request(origin+'/api/sessions/room/events?after=12'),{params})).json();
 assert.deepEqual(quiet,{events:[],floor:1});
 assert.equal(queries.length,1);assert.match(queries[0].sql,/guest_hash/);assert.match(queries[0].sql,/seq>/);
 member=false;
 assert.equal((await GET(new Request(origin+'/api/sessions/room/events?after=12'),{params})).status,403);
});
test('publishing checks membership and inserts in one statement, idempotent on retry',async t=>{
 environment(t);const queries=[];let member=1;
 const {POST}=createLoader({
  '@/lib/session/auth':{member:()=>assert.fail('no separate membership query'),guestHash:async()=>'hash',validId:()=>true},
  '@/lib/neon/db':{db:()=>async(strings,...values)=>{queries.push({sql:strings.join('?'),values});return [{member}];}},
 })('app/api/sessions/[id]/events/route.ts');
 const params=Promise.resolve({id:'room'});
 const event={id:'11111111-1111-4111-8111-111111111111',turnId:'22222222-2222-4222-8222-222222222222',text:'Hello.',committed:true};
 assert.equal((await POST(request(event,'/api/sessions/room/events'),{params})).status,200);
 assert.equal(queries.length,1);assert.match(queries[0].sql,/INSERT INTO adu_events/);assert.match(queries[0].sql,/ON CONFLICT\(id\) DO NOTHING/);
 member=0;
 assert.equal((await POST(request(event,'/api/sessions/room/events'),{params})).status,403);
});
