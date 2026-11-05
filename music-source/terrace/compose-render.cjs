'use strict';
// Original score and offline sample-based render. No generated audio service.
const fs=require('fs'), path=require('path'); process.chdir(__dirname);
const J=require('js-synthesizer');
J.Synthesizer.initializeWithFluidSynthModule(require('js-synthesizer/libfluidsynth'));
const SR=44100, BPM=72, eighth=60/BPM/2, bars=48, length=bars*6*eighth;
const parts=[
 {name:'First strings',program:48,pan:45,volume:74},
 {name:'Second strings',program:48,pan:80,volume:65},
 {name:'Viola',program:41,pan:53,volume:68},
 {name:'Cello',program:42,pan:72,volume:78},
 {name:'Flute',program:73,pan:57,volume:91},
 {name:'Oboe',program:68,pan:76,volume:76},
 {name:'Warm piano',program:0,pan:63,volume:45}
];
const notes=[], events=[];
function note(ch,bar,pos,dur,pitch,velocity=55){if(pitch===null)return;const t=(bar*6+pos)*eighth;notes.push({ch,bar:bar+1,pos,dur,pitch,velocity});events.push({t,type:'on',ch,pitch,value:velocity},{t:t+dur*eighth,type:'off',ch,pitch});}
// Each chord's two upper voices are separately led; bass uses inversions.
const harmony=[
 ['Dmaj9',38,50,57,64,66],['A/C#',37,49,57,61,64],['Bm7',35,50,57,62,66],['Gmaj9',31,50,57,62,66],
 ['D/F#',30,50,57,62,66],['Em9',40,52,55,62,66],['Gmaj7',31,50,55,59,66],['Asus4-A',33,52,57,61,64],
 ['Bm9',35,50,57,61,66],['F#m7',30,52,57,61,64],['Gmaj9',31,50,57,62,66],['Aadd9',33,52,57,61,64],
 ['Dmaj9',38,50,57,64,66],['A/C#',37,49,57,61,64],['Bm7',35,50,57,62,66],['Gmaj9',31,50,57,62,66],
 ['Em9',40,52,55,62,66],['D/F#',30,50,57,62,66],['Gmaj7',31,50,55,59,66],['Aadd9',33,52,57,61,64],
 ['Bm9',35,50,57,61,66],['Gmaj9',31,50,57,62,66],['Em7',40,52,55,59,62],['Asus4',33,52,57,62,64],
 ['Gmaj9',31,50,57,62,66],['A/G',31,52,57,61,64],['F#m7',30,52,57,61,64],['Bm9',35,50,57,61,66],
 ['Em9',40,52,55,62,66],['Aadd9',33,52,57,61,64],['Dmaj9',38,50,57,64,66],['D/C#',37,50,57,62,66],
 ['Bm7',35,50,57,62,66],['F#m7',30,52,57,61,64],['Gmaj9',31,50,57,62,66],['Aadd9',33,52,57,61,64],
 ['Dmaj9',38,50,57,64,66],['A/C#',37,49,57,61,64],['Bm7',35,50,57,62,66],['Gmaj9',31,50,57,62,66],
 ['D/F#',30,50,57,62,66],['Em9',40,52,55,62,66],['Gmaj7',31,50,55,59,66],['Aadd9',33,52,57,61,64],
 ['Em9',40,52,55,62,66],['Gmaj7',31,50,55,59,66],['Asus4',33,52,57,62,64],['Aadd9',33,52,57,61,64]
];
for(let b=0;b<bars;b++){
 const h=harmony[b], arc=0.5-0.5*Math.cos(2*Math.PI*(b+0.5)/48);
 // Slow legato strings; individual voices, not repeated piano/bell arpeggios.
 note(0,b,0,5.88,h[5]+(b>=24&&b<32?12:0),49+Math.round(7*arc));
 note(1,b,0,5.86,h[4],45+Math.round(5*arc));
 note(2,b,0,5.82,h[3],49+Math.round(5*arc));
 note(3,b,0,5.72,h[1]+12,53+Math.round(6*arc));
 // A few cello passing tones, always in the instrument's warm middle register.
 if([7,19,35,47].includes(b)){notes[notes.length-1].dur=4.5;events[events.length-1].t=(b*6+4.5)*eighth;note(3,b,5,0.86,h[1]+14,46);}
 // Widely spaced, restrained piano breath: no music-box ostinato.
 if(b%4===0 || b%4===2){for(const p of [h[2],h[4],h[5]])note(6,b,b%4===0?0.18:3.12,2.6,p,37+(p%5));}
 // Authored two-beat swells with modest ±6 expression, smooth 125ms samples.
 for(let k=0;k<20;k++){const u=k/20;for(let ch=0;ch<4;ch++)events.push({t:(b*6+u*6)*eighth,type:'cc',ch,ctrl:11,value:Math.round(75+7*arc+6*Math.sin(Math.PI*u))});}
}
// Hand-authored wind phrases in eighth-note units. Rests are explicit (null).
const A=[
 [[null,1],[69,2],[73,1],[76,2]],[[76,3],[73,1],[71,1],[null,1]],
 [[74,2],[78,1],[76,1],[74,2]],[[73,2],[71,2],[null,2]],
 [[69,1],[71,1],[74,3],[73,1]],[[71,3],[66,2],[null,1]],
 [[67,2],[69,1],[71,2],[74,1]],[[73,3],[71,1],[69,1],[null,1]],
 [[66,2],[69,1],[73,2],[74,1]],[[73,2],[69,2],[null,2]],
 [[71,1],[74,2],[73,1],[71,1],[69,1]],[[71,2],[73,2],[null,2]]
];
const B=[
 [[74,3],[78,1],[76,2]],[[76,2],[73,1],[71,2],[null,1]],
 [[74,1],[78,2],[81,2],[78,1]],[[76,2],[74,2],[null,2]],
 [[78,2],[76,1],[74,2],[71,1]],[[73,3],[69,2],[null,1]],
 [[71,2],[74,1],[78,2],[76,1]],[[73,2],[71,1],[69,2],[null,1]],
 [[74,2],[73,1],[71,3]],[[69,1],[66,2],[69,2],[null,1]],
 [[67,2],[71,1],[74,2],[73,1]],[[71,2],[69,2],[null,2]]
];
const C=[
 [[71,2],[74,1],[78,3]],[[76,3],[73,2],[null,1]],
 [[73,2],[76,1],[81,2],[78,1]],[[78,2],[76,1],[73,2],[null,1]],
 [[74,3],[71,2],[null,1]],[[73,2],[71,1],[69,3]],
 [[66,1],[69,2],[73,2],[74,1]],[[76,3],[74,2],[null,1]],
 [[78,2],[76,1],[74,2],[73,1]],[[73,3],[69,2],[null,1]],
 [[71,2],[74,2],[73,1],[71,1]],[[69,3],[null,3]]
];
function phrase(ch,start,rows,vel){rows.forEach((row,i)=>{let pos=0;row.forEach(([p,d])=>{note(ch,start+i,pos,d-(p===null?0:0.12),p,vel+(i%3)-1);pos+=d;});});}
// First eight bars of lyrical statement, oboe reply; developed high point then return.
phrase(4,0,A.slice(0,8),57);phrase(5,8,A.slice(8).map(r=>r.map(([p,d])=>[p===null?null:p-12,d])),51);
phrase(4,12,B,60);phrase(4,24,C,61);
phrase(5,36,A.slice(0,8).map(r=>r.map(([p,d])=>[p===null?null:p-12,d])),53);
phrase(4,44,[ [[71,3],[74,2],[null,1]], [[74,2],[71,2],[null,2]], [[69,2],[74,2],[73,1],[null,1]], [[73,3],[null,3]] ],52);
// Independent oboe countermelody answering in the gaps; not melody doubling.
for(const [b,p,q] of [[14,66,69],[17,66,69],[20,66,69],[23,64,67],[25,64,69],[28,67,66],[31,66,64],[34,67,69]]){
 note(5,b,1,2.8,p,43);note(5,b,4,1.7,q,44);
}
const score={title:'Wind over the Reading Terrace',composer:'Original composition authored for Fynn',bpm:BPM,meter:'6/8',key:'D major / B minor',sampleRate:SR,duration:length,parts,harmony:harmony.map(h=>h[0]),notes,form:'1–12: A and oboe answer; 13–24: A developed; 25–36: B / gentle upper-string lift; 37–48: oboe return and dominant turnaround'};
fs.writeFileSync('score.json',JSON.stringify(score,null,2));

async function main(){
 await J.waitForReady();const s=new J.Synthesizer();
 s.init(SR,{initialGain:0.38,polyphony:256,reverbActive:true,reverbRoomSize:0.68,reverbDamp:0.55,reverbWidth:72,reverbLevel:0.24,chorusActive:false});
 const sf=fs.readFileSync(process.env.GENERALUSER_SF2 || path.join(__dirname,'GeneralUser-GS.sf2'));const id=await s.loadSFont(sf.buffer.slice(sf.byteOffset,sf.byteOffset+sf.byteLength));
 parts.forEach((p,ch)=>{s.midiProgramSelect(ch,id,0,p.program);s.midiControl(ch,7,p.volume);s.midiControl(ch,10,p.pan);s.midiControl(ch,11,82);s.midiControl(ch,91,38);});
 const schedule=[];for(let cycle=0;cycle<2;cycle++)for(const e of events)schedule.push({...e,frame:Math.round((e.t+cycle*length)*SR)});
 schedule.sort((a,b)=>a.frame-b.frame||(a.type==='off'?-1:1));
 const N=Math.round(length*SR), output=Buffer.alloc(N*8);let current=0,index=0;
 while(current<N*2){
  while(index<schedule.length&&schedule[index].frame<=current){const e=schedule[index++];if(e.type==='on')s.midiNoteOn(e.ch,e.pitch,e.value);else if(e.type==='off')s.midiNoteOff(e.ch,e.pitch);else s.midiControl(e.ch,e.ctrl,e.value);}
  const end=Math.min(current+4096,index<schedule.length?schedule[index].frame:N*2,N*2);const n=end-current;if(n<=0)continue;
  const left=new Float32Array(n),right=new Float32Array(n);s.render([left,right]);
  for(let i=0;i<n;i++){const f=current+i-N;if(f<0)continue;const edge=Math.min(f,N-1-f),fade=edge<Math.round(SR*0.008)?0.5-0.5*Math.cos(Math.PI*edge/Math.round(SR*0.008)):1;output.writeFloatLE(left[i]*fade,f*8);output.writeFloatLE(right[i]*fade,f*8+4);}
  current=end;
 }
 fs.writeFileSync('render.f32',output);s.close();console.log(JSON.stringify({duration:length,notes:notes.length,events:events.length,parts:parts.map(p=>p.name),bytes:output.length}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
