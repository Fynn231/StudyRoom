import { tmpdir as publicationTmpdir } from 'node:os';
// Explicit optional live-provider gate, never run by npm test. Uses only this
// synthetic rice goal, not files, browser accounts, room messages or user notes.
import {createStudyServer} from '../server/app.ts';
import {validatePlan} from '../src/aiStudy.ts';
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const out=process.env.STUDY_EVIDENCE||publicationTmpdir();await mkdir(out,{recursive:true});
const app=createStudyServer(undefined,Date.now,{executable:process.execPath,script:resolve('server/codex-inference.cjs')});const results=[];
try{const url=await app.listen(0);for(const mode of ['Steps','Benchmarks','Time allocation']){
 const request={requestId:crypto.randomUUID(),budgetMinutes:25,sources:[{id:crypto.randomUUID(),text:'how to cook rice for 4'}],answers:[],intention:{goal:'how to cook rice for 4',mode,currentPlan:[],refinement:''}};
 const started=Date.now();const r=await fetch(url+'/api/ai/plan',{method:'POST',headers:{Origin:url,'Content-Type':'application/json','Sec-Fetch-Site':'same-origin'},body:JSON.stringify(request),signal:AbortSignal.timeout(70000)});const response=await r.json();
 if(r.ok){const plan=validatePlan(response.plan,request);results.push({mode,status:r.status,elapsedMs:Date.now()-started,plan,verification:response.verification});}
 else {results.push({mode,status:r.status,elapsedMs:Date.now()-started,error:response.error});break;}
}await writeFile(out+'/live-intention-result.json',JSON.stringify({genuineProvider:results.length===3&&results.every(r=>r.status===200),syntheticInputOnly:true,results},null,2));console.log(JSON.stringify(results.map(({mode,status,elapsedMs,verification,error})=>({mode,status,elapsedMs,verification,error})),null,2));if(results.length!==3||results.some(r=>r.status!==200))process.exitCode=1;
}finally{await app.close();}
