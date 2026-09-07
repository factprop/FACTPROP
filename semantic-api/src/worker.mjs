import payload from '../../website/data/entities.json' with {type:'json'};
import {ApiError,LIMITS,graphIndex,validateInput,linkTexts} from './core.mjs';
const index=graphIndex(payload);
const version=env=>env.LINKER_PROTOCOL==='context-v4'?'semantic-v4':env.LINKER_PROTOCOL==='indexed-v5'?'semantic-v5':'semantic-v3';

export class Quota {
  constructor(ctx,env){this.ctx=ctx;this.env=env;}
  async fetch(request){
    const {client}=await request.json();
    const now=Date.now(),day=Math.floor(now/86400000),minute=Math.floor(now/60000);
    const daily=Math.max(0,Number(this.env.DAILY_REQUEST_LIMIT)||0);
    const perIP=Math.max(0,Number(this.env.IP_MINUTE_LIMIT)||0);
    const allowed=await this.ctx.storage.transaction(async txn=>{
      const stored=await txn.get('budget');
      const value=stored?.day===day?stored:{day,count:0,minute,ips:{}};
      if(value.minute!==minute){value.minute=minute;value.ips={};}
      if(value.count>=daily||(value.ips[client]||0)>=perIP)return false;
      value.count++;value.ips[client]=(value.ips[client]||0)+1;
      await txn.put('budget',value);return true;
    });
    return Response.json({allowed});
  }
}

async function readBody(request){
  const reader=request.body?.getReader();if(!reader)throw new ApiError(400,'invalid_json','JSON body required.');
  const chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
    if(size>LIMITS.bodyBytes){await reader.cancel();throw new ApiError(413,'body_limit','Request is too large.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new ApiError(400,'invalid_json','Invalid JSON body.');}
}

export function createHandler({graph=index,link=linkTexts}={}){
  return async(request,env)=>{
    const origin=request.headers.get('Origin')||'';
    const allowed=(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).includes(origin)&&!!origin;
    const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin'};
    if(allowed)headers['Access-Control-Allow-Origin']=origin;
    const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
    const path=new URL(request.url).pathname;
    if(path==='/health'&&request.method==='GET')return reply({status:env.ENABLED==='true'?'configured':'disabled',version:version(env),limits:LIMITS});
    if(path!=='/link-entities')return reply({error:'not_found'},404);
    if(!allowed)return reply({error:'origin_not_allowed'},403);
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Content-Type'}});
    if(request.method!=='POST')return reply({error:'method_not_allowed'},405);
    if(env.ENABLED!=='true'||!env.AI||!env.QUOTA)return reply({error:'not_configured',message:'Semantic analysis is not enabled yet.'},503);
    try{
      if(!(request.headers.get('Content-Type')||'').startsWith('application/json'))throw new ApiError(415,'content_type','Use application/json.');
      const texts=validateInput(await readBody(request));
      const ip=request.headers.get('CF-Connecting-IP');
      if(!ip)throw new ApiError(503,'client_unavailable','Cannot apply request limits.');
      const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${Math.floor(Date.now()/86400000)}:${ip}`));
      const client=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('');
      const counter=env.QUOTA.get(env.QUOTA.idFromName('global-budget'));
      const quota=await counter.fetch(new Request('https://quota/reserve',{method:'POST',body:JSON.stringify({client})}));
      if(!quota.ok||!(await quota.json()).allowed)throw new ApiError(429,'quota_exceeded','Semantic request limit reached. Try later or use local lookup.');
      const result=await link(texts,env,graph);
      return reply({...result,version:version(env)});
    }catch(error){
      if(error instanceof ApiError)return reply({error:error.code,message:error.message},error.status);
      return reply({error:'upstream_error',message:'Semantic analysis failed. Please retry or use local lookup.'},502);
    }
  };
}

export default {fetch:createHandler()};
