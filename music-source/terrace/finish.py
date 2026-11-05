#!/usr/bin/python3
"""Master, export score/MIDI, and objectively verify. Python standard library only."""
import pathlib,json,re,subprocess,array,math,struct,hashlib,os,shutil,xml.etree.ElementTree as ET
P=pathlib.Path(__file__).resolve().parent
FF=os.environ.get('FFMPEG') or shutil.which('ffmpeg')
if not FF: raise SystemExit('Install FFmpeg or set FFMPEG to its executable path.')
S=json.loads((P/'score.json').read_text())
def run(args):return subprocess.run([FF,'-hide_banner','-y']+args,cwd=P,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=True)
def measure(name):
 r=run(['-i',name,'-af','loudnorm=I=-25:TP=-3:LRA=7:print_format=json','-f','null','-'])
 text=r.stderr.decode();(P/(name+'.analysis.log')).write_text(text)
 match=re.search(r'\{\s*"input_i".*?\}',text,re.S)
 if match is None: raise RuntimeError('FFmpeg did not return loudness metadata; inspect the retained analysis log.')
 return json.loads(match.group())
# Fixed gain calibrated for this score/bank/engine; no hidden external analysis log.
gain=float(os.environ.get('MASTER_GAIN_DB', '16.13'))
run(['-f','f32le','-ar','44100','-ac','2','-i','render.f32','-af',f'volume={gain:.4f}dB','-c:a','flac','-sample_fmt','s32','terrace-loop.flac'])
run(['-i','terrace-loop.flac','-c:a','libmp3lame','-b:a','192k','-metadata','title=Wind over the Reading Terrace','terrace-loop.mp3'])
run(['-ss','42.5','-i','terrace-loop.flac','-t','30','-af','afade=t=in:d=0.8,afade=t=out:st=28.5:d=1.5','-c:a','libmp3lame','-b:a','192k','-metadata','title=Wind over the Reading Terrace - preview','terrace-preview.mp3'])
# MIDI type 1: 480 ticks/quarter, preserving authored performance note lengths.
def vlq(v):
 b=[v&127];v>>=7
 while v:b.insert(0,(v&127)|128);v>>=7
 return bytes(b)
def chunk(events):
 out=b'';last=0
 for tick,msg in sorted(events,key=lambda x:x[0]):out+=vlq(tick-last)+msg;last=tick
 out+=b'\0\xff\x2f\0';return b'MTrk'+struct.pack('>I',len(out))+out
tracks=[chunk([(0,b'\xff\x51\x03'+int(60000000/S['bpm']).to_bytes(3,'big')),(0,b'\xff\x58\x04\x06\x03\x18\x08'),(34560,b'\xff\x01\x04Loop')])]
# End of conductor track is aligned to 144 quarters = 69120 ticks.
tracks=[chunk([(0,b'\xff\x51\x03'+round(60000000/S['bpm']).to_bytes(3,'big')),(0,b'\xff\x58\x04\x06\x03\x18\x08'),(69120,b'\xff\x01\x04Loop')])]
for ch,p in enumerate(S['parts']):
 name=p['name'].encode();ev=[(0,b'\xff\x03'+vlq(len(name))+name),(0,bytes([0xc0+ch,p['program']])),(0,bytes([0xb0+ch,7,p['volume']])),(0,bytes([0xb0+ch,10,p['pan']])),(0,bytes([0xb0+ch,11,82]))]
 for n in S['notes']:
  if n['ch']!=ch:continue
  start=round(((n['bar']-1)*6+n['pos'])*240)
  ev.extend([(start,bytes([0x90+ch,n['pitch'],n['velocity']])),(start+round(n['dur']*240),bytes([0x80+ch,n['pitch'],0]))])
 if ch<4:
  for b in range(48):
   arc=.5-.5*math.cos(2*math.pi*(b+.5)/48)
   for k in range(20):ev.append((round((b*6+k/20*6)*240),bytes([0xb0+ch,11,round(75+7*arc+6*math.sin(math.pi*k/20))])))
 tracks.append(chunk(ev))
(P/'score.mid').write_bytes(b'MThd'+struct.pack('>IHHH',6,1,len(tracks),480)+b''.join(tracks))
# Readable notated score: performance microgaps quantized away, score.json authoritative.
root=ET.Element('score-partwise',version='4.0');work=ET.SubElement(root,'work');ET.SubElement(work,'work-title').text=S['title'];pl=ET.SubElement(root,'part-list')
for ch,p in enumerate(S['parts']):
 sp=ET.SubElement(pl,'score-part',id=f'P{ch+1}');ET.SubElement(sp,'part-name').text=p['name']
for ch,p in enumerate(S['parts']):
 part=ET.SubElement(root,'part',id=f'P{ch+1}')
 for b in range(1,49):
  m=ET.SubElement(part,'measure',number=str(b))
  if b==1:
   a=ET.SubElement(m,'attributes');ET.SubElement(a,'divisions').text='4';key=ET.SubElement(a,'key');ET.SubElement(key,'fifths').text='2';t=ET.SubElement(a,'time');ET.SubElement(t,'beats').text='6';ET.SubElement(t,'beat-type').text='8';c=ET.SubElement(a,'clef');ET.SubElement(c,'sign').text='F' if ch==3 else 'G';ET.SubElement(c,'line').text='4' if ch==3 else '2'
   d=ET.SubElement(m,'direction');dt=ET.SubElement(d,'direction-type');ET.SubElement(dt,'words').text='Gentle, legato; quarter = 72; pp–mp';ET.SubElement(d,'sound',tempo='72')
  ns=sorted([n for n in S['notes'] if n['ch']==ch and n['bar']==b],key=lambda n:(n['pos'],n['pitch']))
  cursor=0;laststart=-1
  def rest(dur):
   if dur>0:
    z=ET.SubElement(m,'note');ET.SubElement(z,'rest');ET.SubElement(z,'duration').text=str(dur)
  for n in ns:
   start=round(n['pos'])*2 if ch==6 else round(n['pos']*2)
   dur=round((round(n['dur']) if ch in [0,1,2,4,5] else n['dur'])*2)
   if ch==6:dur=5
   dur=min(dur,12-start)
   if start!=laststart:rest(start-cursor)
   z=ET.SubElement(m,'note')
   if start==laststart:ET.SubElement(z,'chord')
   pitch=ET.SubElement(z,'pitch');pn=n['pitch']%12;step,alter=[('C',0),('C',1),('D',0),('D',1),('E',0),('F',0),('F',1),('G',0),('G',1),('A',0),('A',1),('B',0)][pn]
   ET.SubElement(pitch,'step').text=step
   if alter:ET.SubElement(pitch,'alter').text=str(alter)
   ET.SubElement(pitch,'octave').text=str(n['pitch']//12-1);ET.SubElement(z,'duration').text=str(dur)
   cursor=max(cursor,start+dur);laststart=start
  rest(12-cursor)
ET.indent(root);ET.ElementTree(root).write(P/'score.musicxml',encoding='utf-8',xml_declaration=True)
results={'gain_db':gain,'preview_start_seconds':42.5,'preview_duration_seconds':30,'instruments':S['parts'],'notes':len(S['notes']),'audio':{}}
for name in ['terrace-loop.flac','terrace-loop.mp3','terrace-preview.mp3']:
 loud=measure(name);raw=run(['-i',name,'-f','f32le','-ar','44100','-ac','2','-']).stdout
 f=array.array('f');f.frombytes(raw);N=len(f)//2
 peak=max(abs(x) for x in f);step=max(abs(f[c]-f[-2+c]) for c in range(2))
 def rms(lo,hi):return math.sqrt(sum(x*x for x in f[lo*2:hi*2])/(2*(hi-lo)))
 results['audio'][name]={'duration_decoded_s':N/44100,'samples_per_channel':N,'integrated_lufs':float(loud['input_i']),'true_peak_dbtp':float(loud['input_tp']),'lra_lu':float(loud['input_lra']),'peak_sample':peak,'clipped_samples':sum(abs(x)>=1 for x in f),'boundary_sample_delta':step,'boundary_delta_dbfs':20*math.log10(max(step,1e-12)),'first_20ms_rms':rms(0,882),'last_20ms_rms':rms(N-882,N)}
(P/'measurements.json').write_text(json.dumps(results,indent=2))

print(json.dumps(results,indent=2))
