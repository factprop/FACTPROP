import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {createHandler} from '../src/worker.mjs';
import {coverage} from '../src/core.mjs';
const root=fileURLToPath(new URL('../../website/',import.meta.url));
const origin='http://127.0.0.1:8787';
const link=async(texts,env,graph)=>({simulation:true,rows:texts.map((text,row)=>{
  const mentions=[];
  for(const match of text.matchAll(/apple/gi)){
    const qid=/eat|ate|fruit/i.test(text.slice(Math.max(0,match.index-8),match.index))?'Q89':'Q312';
    mentions.push({surface:match[0],start:match.index,end:match.index+5,status:'linked',qid,label:qid==='Q312'?'Apple Inc.':'apple',graph:coverage(qid,graph),candidates:[]});
  }
  return {row,text,mentions};
})});
const handler=createHandler({link});
const env={ENABLED:'true',ALLOWED_ORIGINS:origin,AI:{},QUOTA:{idFromName:()=>1,get:()=>({fetch:async()=>Response.json({allowed:true})})}};

http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,origin);
    if(url.pathname==='/link-entities'){
      const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>40000){res.writeHead(413).end();return;}chunks.push(c);}
      const response=await handler(new Request(url,{method:req.method,headers:{...req.headers,'CF-Connecting-IP':'127.0.0.1'},...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})}),env);
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());return;
    }
    if(url.pathname==='/semantic-config.js'){res.setHeader('Content-Type','text/javascript');res.end(`window.FACTPROP_SEMANTIC={endpoint:'${origin}/link-entities'};`);return;}
    const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!path.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(403).end();return;}
    const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
    res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(await readFile(path));
  }catch{res.writeHead(404).end('Not found');}
}).listen(8787,'127.0.0.1',()=>console.log(`${origin}/#explorer — SIMULATION ONLY`));
