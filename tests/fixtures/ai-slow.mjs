// Synthetic failure fixture only, never a model substitute in live acceptance.
let raw=''; for await(const c of process.stdin) raw+=c;
const r=JSON.parse(raw), mode=r.answers[0].answer;
if(mode==='overflow'){process.stdout.write('x'.repeat(40000));}
else if(mode==='error'){process.stderr.write('PRIVATE_SDK_ERROR synthetic placeholder');process.exitCode=1;}
else {setTimeout(()=>{process.stdout.write('{}');},5000);}
