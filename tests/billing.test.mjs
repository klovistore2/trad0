import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLoader } from './load-ts.mjs';

test('welcome credits default to 300, follow WELCOME_CREDITS and ignore invalid values',()=>{
 const {welcomeCredits}=createLoader()('lib/billing/credits.ts');
 const previous=process.env.WELCOME_CREDITS;
 try{
  delete process.env.WELCOME_CREDITS;assert.equal(welcomeCredits(),300);
  for(const [value,expected] of [['500',500],[' 0 ',0],['',300],['-5',300],['12.5',300],['lots',300],['1000000',300]]){
   process.env.WELCOME_CREDITS=value;assert.equal(welcomeCredits(),expected,JSON.stringify(value));
  }
 }finally{ if(previous===undefined)delete process.env.WELCOME_CREDITS;else process.env.WELCOME_CREDITS=previous; }
});

test('remaining time estimate: 300 credits ≈ 20 min with clones to come, tone roughly halves it',()=>{
 const {creditEstimate}=createLoader()('lib/billing/prices.ts');
 assert.deepEqual(creditEstimate({balance:300,tone:false,toneWindowSeconds:3,clonesToCome:2}),{minutes:20,perMinute:10,cloneCost:100});
 assert.equal(creditEstimate({balance:300,tone:false,toneWindowSeconds:3,clonesToCome:0}).minutes,30);
 assert.deepEqual(creditEstimate({balance:300,tone:true,toneWindowSeconds:3,clonesToCome:2}),{minutes:10,perMinute:20,cloneCost:100});
 assert.equal(creditEstimate({balance:300,tone:true,toneWindowSeconds:6,clonesToCome:2}).minutes,13,'a longer window means fewer analyses');
 assert.equal(creditEstimate({balance:40,tone:false,toneWindowSeconds:3,clonesToCome:2}).minutes,0,'never negative');
});

test('one rule stops a conversation: a creator at zero, never an admin, never an unknown payer',()=>{
 const {requirePayer,blockingBalance}=createLoader()('lib/billing/credits.ts');
 const previous=process.env.ADMIN_MAIL;process.env.ADMIN_MAIL='@example.test';
 try{
  assert.throws(()=>requirePayer({payerEmail:'host@example.org',payerBalance:0}),error=>error.status===402);
  assert.throws(()=>requirePayer({payerEmail:'host@example.org',payerBalance:-10}),error=>error.status===402);
  assert.doesNotThrow(()=>requirePayer({payerEmail:'host@example.org',payerBalance:1}));
  assert.doesNotThrow(()=>requirePayer({payerEmail:'admin@example.test',payerBalance:-350}),'an admin is billed, never stopped');
  assert.doesNotThrow(()=>requirePayer({payerEmail:null,payerBalance:0}),'no creator account blocks nothing');
  assert.equal(blockingBalance('admin@example.test',-5),null);assert.equal(blockingBalance('host@example.org',-5),-5);
 }finally{ if(previous===undefined)delete process.env.ADMIN_MAIL;else process.env.ADMIN_MAIL=previous; }
});
