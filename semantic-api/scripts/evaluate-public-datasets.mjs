if(!process.argv[2]||!process.argv.includes('--consent'))throw Error('Usage: node scripts/evaluate-public-datasets.mjs BASE_URL [ORIGIN] --consent');
const endpoint=new URL(process.argv[2]);
endpoint.pathname='/link-entities';
endpoint.search='';
endpoint.hash='';
const origin=process.argv[3]||'https://factprop.github.io';

const sources=[
  {name:'WikiGold',url:'https://raw.githubusercontent.com/juand-r/entity-recognition-datasets/master/data/wikigold/CONLL-format/data/wikigold.conll.txt'},
  {name:'WNUT17',url:'https://raw.githubusercontent.com/leondz/emerging_entities_17/master/emerging.test.annotated'},
];
const normalize=value=>value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();

function parseConll(raw){
  const samples=[];
  let entityTotal=0;
  for(const block of raw.replaceAll('\r','').split(/\n\s*\n/)){
    const rows=block.split('\n').map(line=>line.trim()).filter(Boolean).map(line=>line.split(/\s+/));
    if(!rows.length)continue;
    const tokens=rows.map(row=>row[0]),gold=[];
    let current=[],currentType='';
    for(const row of rows){
      const tag=row.at(-1),type=tag.slice(2);
      if(tag.startsWith('B-')||(tag.startsWith('I-')&&currentType&&currentType!==type)){
        if(current.length)gold.push(current.join(' '));
        current=[row[0]];currentType=type;
      }else if(tag.startsWith('I-')){
        if(!current.length)currentType=type;
        current.push(row[0]);
      }else if(current.length){gold.push(current.join(' '));current=[];currentType='';}
    }
    if(current.length)gold.push(current.join(' '));
    if(!gold.length||entityTotal+gold.length>12)continue;
    samples.push({text:tokens.join(' ').slice(0,2000),gold});
    entityTotal+=gold.length;
    if(samples.length===5)break;
  }
  return samples;
}

for(const source of sources){
  const download=await fetch(source.url,{signal:AbortSignal.timeout(30000)});
  if(!download.ok)throw Error(`${source.name} download failed: ${download.status}`);
  const samples=parseConll(await download.text());
  const response=await fetch(endpoint,{
    method:'POST',
    headers:{Origin:origin,'Content-Type':'application/json'},
    body:JSON.stringify({texts:samples.map(sample=>sample.text),consent:true}),
    signal:AbortSignal.timeout(120000),
  });
  const data=await response.json();
  const rows=Array.isArray(data.rows)?data.rows:[];
  let gold=0,found=0,linked=0,uncertain=0;
  samples.forEach((sample,index)=>{
    const mentions=rows[index]?.mentions||[];
    const predicted=new Set(mentions.map(mention=>normalize(mention.surface)));
    gold+=sample.gold.length;
    found+=sample.gold.filter(entity=>predicted.has(normalize(entity))).length;
    linked+=mentions.filter(mention=>mention.status==='linked').length;
    uncertain+=mentions.filter(mention=>mention.status!=='linked').length;
  });
  console.log(`${source.name}: HTTP ${response.status}, rows ${rows.length}/${samples.length}, gold mentions found ${found}/${gold}, linked ${linked}, uncertain ${uncertain}, row errors ${rows.filter(row=>row.error).length}, version ${data.version||'n/a'}`);
  if(!response.ok)process.exitCode=1;
}
