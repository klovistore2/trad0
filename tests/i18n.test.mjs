// The guest reads the app in their own language; a missing string must degrade to English,
// never to an empty label.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { translator } from '../lib/i18n/strings.ts';
import { createLoader } from './load-ts.mjs';
import { LANGUAGES } from '../types/session.ts';

const KEYS = ['muteSound','unmuteSound','soundOn','textOnly','theirWords','connectedTitle','connectedIntro',
  'playing','hearTranslation','peerOnline','peerOffline','reconnecting','connecting',
  'startTalking','joinIn','micOpen','doneSpeaking','bothClosed','theyAreSpeaking','letMeSpeak','speak',
  'myWords','whatTheyReceive','whatISaid','nothingYet','voiceTitle','voiceBody','voiceNote','voiceAccept','voiceDecline'];

test('every offered language returns a usable string for every key', () => {
  for (const language of LANGUAGES) {
    const t = translator(language);
    for (const key of KEYS) {
      const value = t(key);
      assert.equal(typeof value, 'string', `${language}.${key}`);
      assert.ok(value.trim().length > 0, `${language}.${key} is empty`);
    }
  }
});

test('the guest reads their own language, not the creator’s', () => {
  assert.notEqual(translator('th')('speak'), translator('en')('speak'));
  assert.notEqual(translator('fr')('doneSpeaking'), translator('en')('doneSpeaking'));
  assert.match(translator('th')('speak'), /[฀-๿]/, 'Thai must render in Thai script');
  assert.match(translator('ja')('speak'), /[぀-ヿ一-鿿]/, 'Japanese must render in Japanese script');
});

test('English is the base and is always complete', () => {
  const en = translator('en');
  for (const key of KEYS) assert.ok(en(key).trim().length > 0, key);
});

test('language menus show a flag and follow the reader’s alphabetical order',()=>{
 const {languageOptions}=createLoader()('lib/i18n/language-names.ts');
 const fr=languageOptions('fr');
 assert.equal(fr.length,15);
 assert.deepEqual(fr.slice(0,3).map(o=>o.code),['de','en','zh'],'Allemand, Anglais, Chinois');
 assert.equal(fr.find(o=>o.code==='fr').label,'🇫🇷 Français');
 const en=languageOptions('en').map(o=>o.code);
 assert.equal(en[0],'zh','Chinese comes first in English');assert.equal(en.at(-1),'vi');
});
