const base=process.argv[2];
const origin=process.argv[3]||'https://factprop.github.io';
if(!base)throw Error('Usage: node scripts/check-endpoint.mjs BASE_URL [ORIGIN]');
const headers={Origin:origin,'Content-Type':'application/json'};
const checks=[
  ['health','/health',{method:'GET'},200],
  ['preflight','/link-entities',{method:'OPTIONS',headers},204],
  ['foreign origin','/link-entities',{method:'POST',headers:{...headers,Origin:'https://not-allowed.example'},body:'{}'},403],
  ['consent required','/link-entities',{method:'POST',headers,body:JSON.stringify({texts:['Apple'],consent:false})},400],
  ['invalid JSON','/link-entities',{method:'POST',headers,body:'{'},400],
  ['unsupported method','/link-entities',{method:'GET',headers},405],
  ['oversized body','/link-entities',{method:'POST',headers,body:JSON.stringify({texts:['x'.repeat(41000)],consent:true})},413],
  ['wrong content type','/link-entities',{method:'POST',headers:{Origin:origin,'Content-Type':'text/plain'},body:'{}'},415],
];
let passed=0;
for(const [name,path,options,expected]of checks){
  const response=await fetch(new URL(path,base),{...options,signal:AbortSignal.timeout(15000)});
  const ok=response.status===expected;
  if(ok)passed++;
  console.log(`${ok?'PASS':'FAIL'} ${name}: ${response.status} (expected ${expected})`);
}
console.log(`${passed}/${checks.length} checks passed for ${origin}`);
if(passed!==checks.length)process.exitCode=1;
