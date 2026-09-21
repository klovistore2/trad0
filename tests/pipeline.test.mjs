import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLoader } from './load-ts.mjs';
const load=createLoader();
const {ConversationPipeline}=load('lib/translation/conversation-pipeline.ts');
const {desiredMode}=load('lib/translation/modes.ts');
const {SpeechClock}=load('lib/audio/speech-clock.ts');
const {accountReturnTo}=load('lib/auth/return-to.ts');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function pipeline(overrides={}) {
 const sent=[], switched=[], errors=[];
 const instance=new ConversationPipeline({sessionId:'room',speaker:()=>0,languages:()=>({sourceLanguage:'fr',targetLanguage:'en'}),send:async event=>{sent.push(event);},switchMode:async mode=>{switched.push(mode);},onTranslation:()=>{},onError:error=>errors.push(error),...overrides});
 return {instance,sent,switched,errors};
}
test('each speaker selects their own mode; a standard voice does not need clone consent',()=>{
 const me={preferredMode:'auto',voiceTier:0,consented:false,useClone:true,voiceStatus:'none'};
 assert.equal(desiredMode(me),'direct');
 assert.equal(desiredMode({...me,preferredMode:'context'}),'context');
 assert.equal(desiredMode({...me,voiceTier:1,consented:true,voiceStatus:'ready'}),'context');
 assert.equal(desiredMode({...me,voiceTier:1,consented:true,voiceStatus:'learning'}),'context');
 assert.equal(desiredMode({...me,preferredMode:'direct',voiceTier:1,consented:true,voiceStatus:'ready'}),'direct');
});
test('switch waits for a sentence boundary and keeps originals from both speakers',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date']});
 const app=pipeline();
 try {
  app.instance.original('Bonjour.');
  app.instance.receive({turnId:'peer',committed:true,kind:'original',text:'Hello.',sourceLanguage:'en',targetLanguage:'fr'},1);
  app.instance.requestMode('context');
  t.mock.timers.tick(1200);
  app.instance.translation('Hello.');
  t.mock.timers.tick(1700);await tick();assert.deepEqual(app.switched,[]);
  t.mock.timers.tick(100);await tick();assert.deepEqual(app.switched,['context']);
  assert.deepEqual(app.instance.memory.recent().map(turn=>turn.speaker),[0,1]);
  assert.equal(app.sent.filter(event=>event.kind==='translation' && event.committed).length,1);
 }finally{app.instance.dispose();}
});
test('context translations are serialized; a pending translation blocks a mode switch',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date']});
 const previous=globalThis.fetch;const calls=[];let resolve;
 globalThis.fetch=async (_url,options)=>{calls.push(JSON.parse(options.body));return new Promise(done=>{resolve=done;});};
 const app=pipeline();app.instance.mode='context';app.instance.desired='context';
 try{
  app.instance.original('Première phrase.');await tick();
  app.instance.original('Deuxième phrase.');await tick();assert.equal(calls.length,1);
  app.instance.requestMode('direct');t.mock.timers.tick(1800);await tick();assert.deepEqual(app.switched,[]);
  resolve(Response.json({text:'First sentence.',targetLanguage:'en',model:'fast',translationMs:12,contextTurns:0}));await tick();
  assert.equal(calls.length,2);assert.equal(calls[1].context[0].original,'Première phrase.');
  resolve(Response.json({text:'Second sentence.',targetLanguage:'en',model:'fast',translationMs:12,contextTurns:1}));await tick();
  t.mock.timers.tick(1800);await tick();assert.deepEqual(app.switched,['direct']);
  assert.deepEqual(app.sent.map(event=>event.text),['First sentence.','Second sentence.']);
 }finally{globalThis.fetch=previous;app.instance.dispose();}
});
test('failed translation preserves original context without speaking a fabricated result',async()=>{
 const previous=globalThis.fetch;globalThis.fetch=async()=>Response.json({error:'Unavailable'},{status:502});
 const app=pipeline();app.instance.mode='context';app.instance.desired='context';
 try{app.instance.original('À garder.');await tick();assert.equal(app.sent.length,0);assert.equal(app.instance.memory.recent()[0].original,'À garder.');assert.deepEqual(app.errors,['Unavailable']);}
 finally{globalThis.fetch=previous;app.instance.dispose();}
});
test('invitation clock counts speech rather than microphone-open time',t=>{
 t.mock.timers.enable({apis:['Date'],now:0});const clock=new SpeechClock();
 t.mock.timers.tick(60_000);assert.equal(clock.seconds,0);
 for(let i=0;i<30;i++){clock.heard();t.mock.timers.tick(1000);}
 assert.equal(clock.seconds,30);clock.pause();t.mock.timers.tick(60_000);assert.equal(clock.seconds,30);
});
test('account return URL never leaves the app or targets an arbitrary route',()=>{
 const room='/session/12345678-1234-4234-8234-123456789abc';
 assert.equal(accountReturnTo(room),room);
 for(const input of ['https://foreign.test','//foreign.test','/api/voice/clone','/session/invalid',undefined])assert.equal(accountReturnTo(input),'/');
});

test('mode switch waits for translated audio to finish, then keeps direct translations as separate context',async t=>{
 t.mock.timers.enable({apis:['setTimeout','Date']});let audible=true;
 const app=pipeline({canSwitch:()=>!audible});
 try{
  app.instance.original('Bonjour.');app.instance.translation('Hello.');app.instance.requestMode('context');
  t.mock.timers.tick(1800);await tick();assert.deepEqual(app.switched,[]);
  audible=false;t.mock.timers.tick(1800);await tick();assert.deepEqual(app.switched,['context']);
  assert.deepEqual(app.instance.memory.recentTranslations(),[{speaker:0,text:'Hello.',language:'en'}]);
 }finally{app.instance.dispose();}
});
