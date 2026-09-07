import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../website/semantic.js',import.meta.url),'utf8');

class Element{
  constructor(tag='div'){this.tag=tag;this.listeners={};this.children=[];this.value='';this.checked=false;this.hidden=false;this.disabled=false;this.text='';}
  addEventListener(type,fn){(this.listeners[type]||=[]).push(fn);}
  async emit(type,event={}){for(const fn of this.listeners[type]||[])await fn(event);}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.text='';this.children=[...nodes];}
  set textContent(text){this.text=String(text);this.children=[];}
  get textContent(){return this.text+this.children.map(n=>n.textContent).join('');}
}

function setup({endpoint='https://api.example/link-entities',fetcher=async()=>Response.json({rows:[]})}={}){
  const nodes=new Map(),$=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);},ready=[],calls=[];
  const ctx=vm.createContext({window:{FACTPROP_SEMANTIC:{endpoint}},document:{getElementById:$,createElement:tag=>new Element(tag),addEventListener:(e,fn)=>ready.push(fn)},URL,AbortController,setTimeout,clearTimeout,
    state:{entities:[['Apple Inc.','Q312',467],['Apple','Q89',4]]},datasetItems:(s,ext)=>ext==='json'?JSON.parse(s).map(x=>typeof x==='string'?x:x.text):s.split('\n'),
    fetch:async(...args)=>{calls.push(args);return fetcher(...args);}});
  vm.runInContext(source,ctx);ready.forEach(fn=>fn());
  async function input(text){$('semantic-input').value=text;await $('semantic-input').emit('input');}
  async function agree(value=true){$('semantic-consent').checked=value;await $('semantic-consent').emit('change');}
  return {$,calls,input,agree};
}

test('frontend requires consent before network',async()=>{const s=setup();await s.input('Apple');await s.$('analyze-semantic').emit('click');assert.equal(s.calls.length,0);assert.equal(s.$('analyze-semantic').disabled,true);});
test('unconfigured endpoint remains disabled',async()=>{const s=setup({endpoint:''});await s.input('Apple');await s.agree();assert.equal(s.$('analyze-semantic').disabled,true);});
test('unsafe endpoint rejected',async()=>{const s=setup({endpoint:'http://outside.example/link'});await s.input('Apple');await s.agree();assert.equal(s.$('analyze-semantic').disabled,true);});
test('frontend sends only reviewed text and explicit consent',async()=>{const s=setup();await s.input('Apple\n\napple');await s.agree();await s.$('analyze-semantic').emit('click');assert.deepEqual(JSON.parse(s.calls[0][1].body),{texts:['Apple','apple'],consent:true});assert.equal(s.calls[0][1].credentials,'omit');});
test('frontend rejects oversized input before network',async()=>{const s=setup();await s.input('x'.repeat(2001));await s.agree();await s.$('analyze-semantic').emit('click');assert.equal(s.calls.length,0);assert.match(s.$('semantic-results').textContent,/2,000/);});
test('stale response cannot replace edited input result',async()=>{
  let resolve;const s=setup({fetcher:()=>new Promise(r=>resolve=r)});await s.input('Apple');await s.agree();const pending=s.$('analyze-semantic').emit('click');await s.input('France');resolve(Response.json({rows:[{row:0,text:'OLD RESULT',mentions:[]}]}));await pending;assert.equal(s.$('semantic-results').textContent,'');
});
test('shared dataset upload does not send and resets consent',async()=>{const s=setup();await s.agree();await s.$('dataset-file').emit('change',{target:{files:[{name:'sample.json',size:80,text:async()=>'[{"text":"Apple","privateMetadata":"excluded"}]'}]}});assert.equal(s.calls.length,0);assert.equal(s.$('semantic-input').value,'Apple');assert.equal(s.$('semantic-consent').checked,false);assert.match(s.$('semantic-results').textContent,/Nothing has been sent/);});
test('flexible dataset extension loads into semantic preview',async()=>{const s=setup();await s.$('dataset-file').emit('change',{target:{files:[{name:'sample.tsv',size:30,text:async()=>'Apple Inc.\nParis'}]}});assert.equal(s.calls.length,0);assert.equal(s.$('semantic-input').value,'Apple Inc.\nParis');});
test('shared upload prepares at most twenty semantic rows',async()=>{const s=setup();const text=Array.from({length:25},(_,i)=>`Entity ${i}`).join('\n');await s.$('dataset-file').emit('change',{target:{files:[{name:'sample.txt',size:text.length,text:async()=>text}]}});assert.equal(s.$('semantic-input').value.split('\n').length,20);assert.equal(s.calls.length,0);});
test('manual confirmation uses real array-format local index',async()=>{
  const s=setup({fetcher:async()=>Response.json({rows:[{row:0,text:'Apple',mentions:[{surface:'Apple',start:0,end:5,status:'uncertain',candidates:[{qid:'Q312',label:'Apple Inc.',description:'company'}]}]}]})});
  await s.input('Apple');await s.agree();await s.$('analyze-semantic').emit('click');
  function find(node){if(node.tag==='button')return node;for(const c of node.children){const found=find(c);if(found)return found;}}
  await find(s.$('semantic-results')).emit('click');assert.match(s.$('semantic-results').textContent,/Manually selected: Apple Inc\./);assert.match(s.$('semantic-results').textContent,/467/);
});
test('server failure is explicit, not a local fallback',async()=>{const s=setup({fetcher:async()=>Response.json({message:'quota reached'},{status:429})});await s.input('Apple');await s.agree();await s.$('analyze-semantic').emit('click');assert.equal(s.calls.length,1);assert.equal(s.$('semantic-results').textContent,'quota reached');});

 test('semantic ranking sorts unique scores and excludes missing or multiple scores',async()=>{
  const mentions=[['Low','Q1',4],['High','Q2',467],['Zero','Q3',0]].map(([label,qid,degree])=>({surface:label,label,qid,status:'linked',graph:{status:'covered',degree}}));
  mentions.push({surface:'Missing',label:'Missing',qid:'Q4',status:'linked',graph:{status:'not_covered'}},{surface:'Multiple',label:'Multiple',qid:'Q5',status:'linked',graph:{status:'multiple_nodes',records:[{label:'A',degree:9000},{label:'B',degree:1}]}});
  const s=setup({fetcher:async()=>Response.json({rows:[{row:0,text:'sample',mentions}]})});
  await s.input('sample');await s.agree();await s.$('analyze-semantic').emit('click');
  const summary=s.$('semantic-results').children[0].textContent;
  assert.ok(summary.indexOf('High (Q2)')<summary.indexOf('Low (Q1)'));
  assert.ok(summary.indexOf('Low (Q1)')<summary.indexOf('Zero (Q3)'));
  assert.doesNotMatch(summary,/Missing \(Q4\)|Multiple \(Q5\)|9000/);
 });
