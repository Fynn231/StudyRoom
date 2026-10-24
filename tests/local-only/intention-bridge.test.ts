import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('operator bridge validates intention context and supplies distinct trusted mode policies',()=>{
 const script=`import runpy,json\nm=runpy.run_path('server/codex-inference.py',run_name='test')\nid='11111111-1111-4111-8111-111111111111'\nout=[]\nfor mode in ['Steps','Benchmarks','Time allocation']:\n r={'requestId':id,'budgetMinutes':25,'sources':[{'id':id,'text':'cook rice for 4'}],'answers':[],'intention':{'goal':'cook rice for 4','mode':mode,'currentPlan':[{'title':'t'*240,'instructions':'Checkpoint'+chr(10)+'x'*1900,'done':True,'minutes':2}],'refinement':'Use one pot'+chr(10)+'Keep completed work'}}\n m['validate'](r)\n out.append(m['policy'](r))\nprint(json.dumps(out))`;
 const p=spawnSync('python3',['-c',script],{encoding:'utf8'});assert.equal(p.status,0,p.stderr);
 const policies=JSON.parse(p.stdout);assert.equal(new Set(policies).size,3);assert.match(policies[0],/ordered/i);assert.match(policies[1],/measurable/i);assert.match(policies[2],/allocation/i);
});
