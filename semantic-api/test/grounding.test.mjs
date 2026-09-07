import test from 'node:test';
import assert from 'node:assert/strict';
import {groundedMentions,indexedLinks} from '../src/grounding.mjs';
import {graphIndex,linkTexts} from '../src/core.mjs';
const mention=(surface,before='',after='')=>({row:0,surface,before,after,search:surface,language:'en'});
const fixtures=[
  ['Michael Jordan played; Jordan is a country.','Jordan','played; ',' is',23],
  ['苹果公司生产手机，苹果是一种水果。','苹果','手机，','是一种',9],
  ['🍎 Apple makes phones.','Apple','🍎 ',' makes',3],
  ['Apple sells phones; Apple is a fruit.','Apple','phones; ',' is',20],
  ["Apple's headquarters",'Apple','',"'s",0],
  ['apple and APPLE','APPLE','and ','',10],
];
for(const [text,surface,before,after,start] of fixtures)test(`ground span: ${text}`,()=>{const [m]=groundedMentions({mentions:[mention(surface,before,after)]},[text]);assert.equal(m.start,start);assert.equal(text.slice(m.start,m.end),surface);});
test('ambiguous context fails closed',()=>assert.throws(()=>groundedMentions({mentions:[mention('Apple')]},['Apple and Apple'])));
test('invented context fails closed',()=>assert.throws(()=>groundedMentions({mentions:[mention('Apple','not here')]},['Apple'])));
test('repeated mentions locate independently',()=>{const r=groundedMentions({mentions:[mention('Apple','',' sells'),mention('Apple','phones; ',' is')]},['Apple sells phones; Apple is a fruit.']);assert.deepEqual(r.map(x=>x.start),[0,20]);});
const map=new Map([['m0',[{qid:'Q312'},{qid:'Q89'}]]]);
test('candidate index is mapped by program',()=>assert.equal(indexedLinks({links:[{id:'m0',candidate:1,certainty:'high'}]},map).links[0].qid,'Q89'));
for(const candidate of [-1,2,0.5,'0',undefined])test(`reject invalid candidate ${candidate}`,()=>assert.throws(()=>indexedLinks({links:[{id:'m0',candidate,certainty:'high'}]},map)));
test('reject model supplied QID',()=>assert.throws(()=>indexedLinks({links:[{id:'m0',candidate:0,qid:'Q312'}]},map)));
test('null candidate remains null',()=>assert.equal(indexedLinks({links:[{id:'m0',candidate:null}]},map).links[0].qid,null));
test('v4 pipeline exposes no QIDs to selection model',async()=>{
  let n=0;const graph=graphIndex({meta:{},entities:[['Apple Inc.','Q312',467]]});
  const env={LINKER_PROTOCOL:'context-v4',AI:{run:async(model,input)=>{
    if(n++===0)return {response:{mentions:[mention('Apple','',' makes')]}};
    assert.ok(!input.messages[1].content.includes('Q312'));
    return {response:{links:[{id:'m0',candidate:0,certainty:'high'}]}};
  }}};
  const r=await linkTexts(['Apple makes phones'],env,graph,async()=>[{qid:'Q312',label:'Apple Inc.',description:'company'}]);
  assert.equal(r.rows[0].mentions[0].graph.degree,467);
});
