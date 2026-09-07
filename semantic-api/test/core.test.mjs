import test from 'node:test';
import assert from 'node:assert/strict';
import payload from '../../website/data/entities.json' with {type:'json'};
import {graphIndex,coverage,validateInput,modelJson,mentionsFrom,selectLinks,linkTexts,makeSearch} from '../src/core.mjs';
import {createHandler,Quota} from '../src/worker.mjs';
const graph=graphIndex(payload);
const m={row:0,surface:'Apple',occurrence:0,search:'Apple Inc.',language:'en'};
const candidates=[{qid:'Q312',label:'Apple Inc.',description:'technology company'},{qid:'Q89',label:'apple',description:'fruit'}];
const throws=(fn,code)=>assert.throws(fn,e=>e.code===code);

test('real graph company and fruit scores',()=>{assert.equal(coverage('Q312',graph).degree,467);assert.equal(coverage('Q89',graph).degree,4);});
test('absent is not zero',()=>assert.deepEqual(coverage('Q999999999999',graph),{status:'not_covered',degree:null,records:[]}));
test('duplicate QIDs are not summed',()=>{const g=graphIndex({meta:{},entities:[['A','Q1',2],['B','Q1',3],['C','Q2',0]]});assert.equal(coverage('Q1',g).degree,null);assert.equal(coverage('Q1',g).status,'multiple_nodes');assert.equal(coverage('Q2',g).degree,0);});
test('consent required',()=>throws(()=>validateInput({texts:['Apple']}),'consent_required'));
for(const [name,texts] of [['empty',[]],['rows',Array(21).fill('a')],['blank',[' ']],['nonstring',[12]],['long',['a'.repeat(2001)]],['total',Array(5).fill('a'.repeat(2000))]])test(`reject ${name}`,()=>assert.throws(()=>validateInput({texts,consent:true})));
test('valid batch',()=>assert.deepEqual(validateInput({texts:['Apple','苹果'],consent:true}),['Apple','苹果']));
test('literal repeated spans stay separate',()=>{const ms=mentionsFrom({mentions:[m,{...m,occurrence:1}]},['Apple sells phones; Apple is a fruit.']);assert.deepEqual(ms.map(x=>x.start),[0,20]);});
test('wrong casing in model span rejected',()=>throws(()=>mentionsFrom({mentions:[m]},['apple']),'invalid_model_output'));
test('hallucinated span rejected',()=>throws(()=>mentionsFrom({mentions:[m]},['Google']),'invalid_model_output'));
test('duplicate span rejected',()=>throws(()=>mentionsFrom({mentions:[m,m]},['Apple']),'invalid_model_output'));
test('overlapping entity spans rejected',()=>throws(()=>mentionsFrom({mentions:[{...m,surface:'Michael Jordan'},{...m,surface:'Jordan'}]},['Michael Jordan played; Jordan is a country.']),'invalid_model_output'));
test('invalid model JSON rejected',()=>throws(()=>modelJson({response:'```json {} ```'}),'invalid_model_output'));
test('both provider response shapes accepted',()=>{assert.deepEqual(modelJson({response:{mentions:[]}}),{mentions:[]});assert.deepEqual(modelJson({choices:[{message:{content:'{"mentions":[]}'}}]}),{mentions:[]});});
test('hallucinated QID rejected',()=>{const ms=mentionsFrom({mentions:[m]},['Apple']);throws(()=>selectLinks({links:[{id:'m0',qid:'Q999',certainty:'high'}]},ms,new Map([['m0',candidates]]),graph),'invalid_model_output');});
test('uncertain candidate has no score',()=>{const ms=mentionsFrom({mentions:[m]},['Apple']);const [r]=selectLinks({links:[{id:'m0',qid:'Q312',certainty:'uncertain'}]},ms,new Map([['m0',candidates]]),graph);assert.equal(r.qid,null);assert.equal(r.graph,null);});
test('bare homonym requires context',()=>{const ms=mentionsFrom({mentions:[m]},['Apple']);const [r]=selectLinks({links:[{id:'m0',qid:'Q312',certainty:'high'}]},ms,new Map([['m0',candidates]]),graph,['Apple']);assert.equal(r.status,'uncertain');});
test('pipeline links same literal differently',async()=>{
  let call=0;const env={AI_MODEL:'test',AI:{run:async()=>({response:call++===0?{mentions:[m,{...m,occurrence:1,search:'apple fruit'}]}:{links:[{id:'m0',qid:'Q312',certainty:'high'},{id:'m1',qid:'Q89',certainty:'high'}]}})}};
  const result=await linkTexts(['Apple sells phones; Apple is a fruit.'],env,graph,async()=>candidates);
  assert.deepEqual(result.rows[0].mentions.map(x=>x.graph.degree),[467,4]);assert.equal(call,2);
});
test('zero mentions avoids second model call',async()=>{let calls=0;const result=await linkTexts(['hello'],{AI:{run:async()=>{calls++;return {response:{mentions:[]}};}}},graph,()=>{throw Error('not called');});assert.equal(calls,1);assert.deepEqual(result.rows[0].mentions,[]);});
test('Wikidata failure is explicit',async()=>await assert.rejects(makeSearch(async()=>new Response('',{status:503}))('Apple','en'),e=>e.code==='candidate_service_unavailable'));

const env={ENABLED:'true',ALLOWED_ORIGINS:'https://example.org',AI:{},QUOTA:{idFromName:()=>1,get:()=>({fetch:async()=>Response.json({allowed:true})})}};
const request=(body={texts:['Apple'],consent:true},extra={})=>new Request('https://api.example/link-entities',{method:'POST',headers:{Origin:'https://example.org','Content-Type':'application/json','CF-Connecting-IP':'127.0.0.1',...extra},body:JSON.stringify(body)});
const handler=createHandler({link:async texts=>({rows:texts.map(text=>({text,mentions:[]}))})});
test('HTTP success and CORS',async()=>{const r=await handler(request(),env);assert.equal(r.status,200);assert.equal(r.headers.get('Access-Control-Allow-Origin'),'https://example.org');assert.equal(r.headers.get('Cache-Control'),'no-store');});
test('health reports active protocol',async()=>assert.equal((await(await handler(new Request('https://api.example/health'),env)).json()).version,'semantic-v3'));
test('foreign origin rejected',async()=>assert.equal((await handler(request(undefined,{Origin:'https://evil.example'}),env)).status,403));
test('disabled by default',async()=>assert.equal((await handler(request(),{...env,ENABLED:'false'})).status,503));
test('HTTP consent failure',async()=>assert.equal((await handler(request({texts:['Apple']}),env)).status,400));
test('oversized body',async()=>assert.equal((await handler(request({texts:['a'.repeat(41000)],consent:true}),env)).status,413));
test('quota rejection',async()=>assert.equal((await handler(request(),{...env,QUOTA:{idFromName:()=>1,get:()=>({fetch:async()=>Response.json({allowed:false})})}})).status,429));
test('provider error does not disclose input',async()=>{const h=createHandler({link:async()=>{throw Error('PRIVATE TEXT');}});const r=await h(request(),env);assert.equal(r.status,502);assert.ok(!(await r.text()).includes('PRIVATE'));});
test('durable counter enforces limits',async()=>{
  const map=new Map(),tx={get:async k=>structuredClone(map.get(k)),put:async(k,v)=>map.set(k,structuredClone(v))};
  const q=new Quota({storage:{transaction:async fn=>fn(tx)}},{DAILY_REQUEST_LIMIT:'2',IP_MINUTE_LIMIT:'1'});
  async function reserve(client){return(await(await q.fetch(new Request('https://q',{method:'POST',body:JSON.stringify({client})}))).json()).allowed;}
  assert.equal(await reserve('a'),true);assert.equal(await reserve('a'),false);assert.equal(await reserve('b'),true);assert.equal(await reserve('c'),false);
});
