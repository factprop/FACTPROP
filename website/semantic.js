/* Optional remote flow; local lookup never calls this service automatically. */
document.addEventListener('DOMContentLoaded',()=>{
  const $=id=>document.getElementById(id);
  const input=$('semantic-input'),consent=$('semantic-consent'),run=$('analyze-semantic');
  const output=$('semantic-results'),status=$('semantic-status'),cancel=$('cancel-semantic');
  let endpoint='',generation=0,controller=null;
  try{
    const url=new URL(window.FACTPROP_SEMANTIC?.endpoint);
    if((url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1'].includes(url.hostname)))&&!url.username&&!url.password)
      endpoint=url.href;
  }catch{}
  status.textContent=endpoint?'Optional remote analysis · shared daily quota · experimental entity linking.':'Semantic service is not configured yet. Local lookup is available in the other tabs.';
  const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
  function refresh(){run.disabled=!endpoint||!consent.checked||!input.value.trim()||!!controller;}
  function reset(){generation++;controller?.abort();controller=null;cancel.hidden=true;output.replaceChildren();refresh();}
  input.addEventListener('input',reset);
  consent.addEventListener('change',()=>{if(!consent.checked)reset();refresh();});
  cancel.addEventListener('click',()=>{reset();output.textContent='Cancelled locally. A request already sent may still finish on the server and consume quota.';});
  $('semantic-file').addEventListener('change',async event=>{
    reset();const ticket=generation,file=event.target.files[0];if(!file)return;
    input.value='';consent.checked=false;refresh();
    try{
      const ext=file.name.split('.').pop().toLowerCase();
      if(!['txt','md','csv','tsv','json','jsonl'].includes(ext)||file.size>100000)throw new Error('Choose a TXT, Markdown, CSV, TSV, JSON, or JSONL file smaller than 100 KB.');
      const rows=datasetItems(await file.text(),ext);
      if(ticket!==generation)return;
      if(rows.some(r=>/[\r\n]/.test(r)))throw new Error('This preview requires one text per line; remove embedded line breaks from fields.');
      validate(rows);input.value=rows.join('\n');output.textContent=`Loaded ${rows.length} rows locally. Review the text and consent before sending.`;
    }catch(error){if(ticket===generation)output.textContent=error.message;}
    refresh();
  });
  function validate(rows){
    if(!rows.length||rows.length>20||rows.some(r=>r.length>2000)||rows.join('').length>8000)
      throw new Error('Use 1–20 non-empty rows, up to 2,000 characters per row and 8,000 total.');
  }
  function graphText(graph){
    if(!graph||graph.status==='not_covered')return 'Not covered by this graph — no popularity score (not zero).';
    if(graph.status==='multiple_nodes')return 'Multiple graph nodes share this QID; no combined score. '+graph.records.map(r=>`${r.label}: ${r.degree}`).join('; ');
    return `Forward-edge object in-degree: ${graph.degree}. This measures graph connectivity, not public awareness.`;
  }
  function render(data){
    output.replaceChildren();
    if(data.simulation)output.append(el('strong','SIMULATION — fixture responses only, not a model accuracy test.'));
    for(const row of data.rows){
      const section=el('section');section.className='semantic-row';section.append(el('h4',`Row ${row.row+1}`),el('p',row.text));
      if(row.error)section.append(el('p',`This row could not be validated: ${row.error.message} No score is inferred. Try it separately or use explicit entity names.`));
      else if(!row.mentions.length)section.append(el('p','No entity detected. This does not mean the text is unpopular.'));
      for(const mention of row.mentions){
        const card=el('article');card.className='semantic-mention';card.append(el('strong',`${mention.surface} · characters ${mention.start}–${mention.end}`));
        if(mention.status==='linked'){
          const a=el('a',`${mention.label} (${mention.qid}) ↗`);a.href=`https://www.wikidata.org/wiki/${mention.qid}`;a.target='_blank';a.rel='noreferrer';card.append(el('p','Model-linked entity — verify the identity.'),a,el('p',graphText(mention.graph)));
        }else{
          card.append(el('p','Uncertain — no automatic score. Inspect a candidate and confirm its identity:'));
          const result=el('p');
          for(const candidate of mention.candidates){
            const a=el('a',`${candidate.label} (${candidate.qid}) ↗`);a.href=`https://www.wikidata.org/wiki/${candidate.qid}`;a.target='_blank';a.rel='noreferrer';
            const button=el('button','Use this entity');button.type='button';
            button.addEventListener('click',()=>{
              if(!state.entities.length){result.textContent='Wait for the local graph index to load.';return;}
              const records=state.entities.filter(r=>r[1]===candidate.qid).map(r=>({label:r[0],degree:r[2]}));
              result.textContent='Manually selected: '+candidate.label+'. '+graphText({status:records.length>1?'multiple_nodes':records.length?'covered':'not_covered',degree:records[0]?.degree,records});
            });
            const choice=el('div');choice.append(a,el('span',' '+candidate.description+' '),button);card.append(choice);
          }
          card.append(result);
        }
        section.append(card);
      }
      output.append(section);
    }
  }
  run.addEventListener('click',async()=>{
    if(run.disabled)return;
    const rows=input.value.split(/\r?\n/).filter(r=>r.trim());
    try{validate(rows);}catch(error){output.textContent=error.message;return;}
    reset();const ticket=generation;controller=new AbortController();cancel.hidden=false;refresh();output.textContent='Resolving entities in context…';
    const activeController=controller;
    const timeout=setTimeout(()=>activeController.abort(),120000);
    try{
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({texts:rows,consent:true}),signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
      const data=await response.json();if(ticket!==generation)return;
      if(!response.ok)throw new Error(data.message||`Semantic service unavailable (${response.status}). Use local lookup.`);
      if(!Array.isArray(data.rows))throw new Error('Invalid service response. No scores displayed.');
      render(data);
    }catch(error){if(ticket===generation)output.textContent=error.name==='AbortError'?'Request timed out. It may still consume server quota. Try fewer rows or local lookup.':error.message;}
    finally{clearTimeout(timeout);if(ticket===generation){controller=null;cancel.hidden=true;refresh();}}
  });
  refresh();
});
