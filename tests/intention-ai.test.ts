import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateRequest,validatePlan} from '../src/aiStudy.js';
const id='11111111-1111-4111-8111-111111111111';
test('refinement preserves valid multiline editor text without truncating the chosen plan',()=>{
 const goal='cook rice\nfor 4';
 const request=validateRequest({requestId:id,budgetMinutes:25,sources:[{id,text:goal}],answers:[],intention:{goal,mode:'Steps',currentPlan:[{title:'t'.repeat(240),instructions:'First checkpoint\n'+ 'x'.repeat(1900),done:true,minutes:3}],refinement:'Use one pot\nKeep completed work'}});
 assert.equal(request.intention?.goal,goal);assert.equal(request.intention?.currentPlan[0].instructions.length,1917);assert.equal(request.intention?.currentPlan[0].title.length,240);assert.equal(request.intention?.refinement,'Use one pot\nKeep completed work');
});
test('intention AI supports three explicit modes and bounded chosen-plan refinement without imported excerpts',()=>{
 for(const mode of ['Steps','Benchmarks','Time allocation']){
 const input={requestId:id,budgetMinutes:7,sources:[{id,text:'cook rice for 4'}],answers:[],intention:{goal:'cook rice for 4',mode,currentPlan:[{title:'Rinse rice',instructions:'Until clear',done:true,minutes:2}],refinement:'Use one pot'}};
 const request=validateRequest(input);assert.equal(request.intention?.mode,mode);assert.equal(request.intention?.currentPlan[0].done,true);
 assert.throws(()=>validateRequest({...input,intention:{...input.intention,mode:'execute'}}));
 assert.throws(()=>validateRequest({...input,sources:[{id,text:'unselected private import'}]}));
 assert.throws(()=>validatePlan({objectives:['Rice'],steps:[{title:'Cook',instructions:'Check texture',estimatedMinutes:8,sourceIds:[id]}],questions:[]},request));
 }
});
