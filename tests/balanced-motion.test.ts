import {test} from 'node:test';import assert from 'node:assert/strict';import {decorationPose} from '../src/naturalMotion.js';
test('all normal decorations retain paired left/right weight and bounded vertical spacing for thirty minutes',()=>{
 for(const [w,h,gutter] of [[1600,1000,208],[1280,800,48],[390,844,12]])for(let t=0;t<=1800;t+=.37){
  const rows=[];
  for(let i=0;i<48;i+=2){const a=decorationPose(i,t,w,h,gutter),b=decorationPose(i+1,t,w,h,gutter);const size=a.size*(w<=600?.78:1);
   assert.ok(Math.abs(a.x+b.x+size-w)<.000001,'equal paired visual weight at every sampled frame');assert.equal(a.y,b.y);assert.equal(a.size,b.size);assert.ok(a.x>=0&&a.x<w/2);assert.ok(b.x>w/2-size);rows.push(a.y);
  }
  rows.sort((a,b)=>a-b);for(let i=1;i<rows.length;i++)assert.ok(rows[i]-rows[i-1]>(h+128)/24*.79,'rows cannot bunch together');
 }
});
