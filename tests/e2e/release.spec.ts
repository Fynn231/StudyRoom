import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function ready(page: Page) {
 await page.goto('/'); await expect(page.getByRole('timer')).toBeVisible();
 await page.getByLabel('Enable focus chime', {exact:true}).uncheck();
}
async function summary(page: Page, name: string) { await page.locator('summary').filter({hasText: new RegExp(`^${name}$`)}).click(); }
async function silent(page: Page) { await summary(page,'Music'); await page.getByLabel('Silent mode',{exact:true}).check(); }
async function lock(page: Page) { const brand=page.locator('button.wordmark'); await brand.click({clickCount:5,delay:30}); await expect(page.locator('.lock-in-mode')).toBeVisible(); }
async function noOverflow(page: Page) { expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1); }
const atmospheres=['Obsidian Static','Ember Column','Contour Drift','Eclipse Bloom','Shard Field','Undertow','Signal Sweep','Wireframe Drift','Frost Lattice','Aurora Fold','Halftone Pulse','Orbital Ash'];

for (const [name,width,height] of [['desktop',1440,1000],['tablet',820,1180],['phone',390,844]] as const) {
 test(`${name}: timer-led layout, plans, imports, providers, all appearances and dark atmospheres`, async({page},info)=>{
  await page.setViewportSize({width,height});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().startsWith('http://127.0.0.1:4285/') && r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});await ready(page);
  await page.screenshot({path:info.outputPath(`${name}-normal.png`),fullPage:true});await noOverflow(page);
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
  const timerY=await page.getByRole('timer').evaluate(e=>e.getBoundingClientRect().y); expect(timerY).toBeLessThan(height);
  await page.getByLabel('Your session intention',{exact:true}).fill('Review one chapter');await page.getByRole('button',{name:'Plan session',exact:true}).click();
  await page.getByRole('button',{name:'Steps',exact:true}).click();
  const plan=page.getByRole('region',{name:'Private intention plan'});
  await plan.getByRole('button',{name:'Add step',exact:true}).click();await plan.locator('summary').filter({hasText:'Edit step 4'}).click();await plan.getByLabel('Step 4 title',{exact:true}).fill('Write one question');
  await plan.getByRole('checkbox',{name:'Write one question',exact:true}).check();
  await plan.getByRole('button',{name:'Save on this device',exact:true}).click();
  await page.getByRole('button',{name:'Start focus',exact:true}).click();await page.waitForTimeout(350);
  await summary(page,'Appearance');
  for (const preset of ['Sage','Peach Glow','Lavender Mist','Ocean Haze','Forest Study','Rosewood','Blue Hour','Juliette','Moon Garden','Autumn Letters']) {
   await page.getByRole('button',{name:preset,exact:true}).click();await noOverflow(page);await expect(page.locator('[data-action=pause]')).toBeEnabled();
  }
  await expect(page.getByLabel('Your session intention',{exact:true})).toHaveValue('Review one chapter');await expect(plan.getByRole('checkbox',{name:'Write one question',exact:true})).toBeChecked();
  await page.getByLabel('Falling leaves',{exact:true}).check();await expect(page.locator('.natural-flowers')).toHaveAttribute('data-running','true');
  await page.screenshot({path:info.outputPath(`${name}-autumn.png`)});await summary(page,'Appearance');await silent(page);
  await lock(page);await summary(page,'Atmosphere');
  for(const atmosphere of atmospheres) {
   await page.getByRole('button',{name:new RegExp(`^${atmosphere}`)}).click();await noOverflow(page);
   await expect(page.locator('.locked-atmosphere')).toHaveCount(1);await expect(page.locator('[data-action=pause]')).toBeEnabled();
   await summary(page,'Atmosphere'); await page.evaluate(()=>window.scrollTo(0,0));
   await page.screenshot({path:info.outputPath(`${name}-${atmosphere.toLowerCase().replaceAll(' ','-')}.png`)});
   expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze()).violations).toEqual([]);
   await summary(page,'Atmosphere');
  }
  await page.getByLabel('Animate atmosphere',{exact:true}).uncheck();expect(await page.locator('.locked-atmosphere *').evaluateAll(es=>es.every(e=>getComputedStyle(e).animationName==='none'))).toBe(true);
  await page.emulateMedia({reducedMotion:'reduce'});await page.getByLabel('Animate atmosphere',{exact:true}).check();expect(await page.locator('.locked-atmosphere *').evaluateAll(es=>es.every(e=>getComputedStyle(e).animationName==='none'))).toBe(true);
  await page.getByRole('button',{name:'Exit Lock In Mode',exact:true}).click();await expect(page.locator('.lock-in-mode')).toHaveCount(0);await expect(plan.getByRole('checkbox',{name:'Write one question',exact:true})).toBeChecked();
  await page.locator('[data-action=pause]').click();await expect(page.locator('[data-action=resume]')).toBeVisible();await page.locator('[data-action=resume]').click();await page.locator('[data-action=reset]').click();await expect(page.getByRole('timer')).toHaveText('25:00');
  await summary(page,'Goals / notes');await page.getByLabel('Choose Markdown notes',{exact:true}).setInputFiles({name:'synthetic.md',mimeType:'text/markdown',buffer:Buffer.from('# Next\n- [ ] Read one section\n- [x] Done\n')});
  await expect(page.getByText('synthetic.md',{exact:true}).first()).toBeVisible();await page.getByRole('button',{name:'Clear imported notes',exact:true}).click();await expect(page.getByText('No notes imported',{exact:true})).toBeVisible();
  await summary(page,'Saved study plans');await expect(page.getByText('Session intention plan',{exact:true}).first()).toBeVisible();await noOverflow(page);expect(errors).toEqual([]);
 });
}

test('motion: all 48 bodies move; stars stay fixed; reduced/off/hidden and repeated transitions are bounded',async({page},info)=>{
 await page.setViewportSize({width:1600,height:1000});await ready(page);await silent(page);await summary(page,'Appearance');
 for(const [preset,toggle] of [['Juliette','Falling flowers'],['Moon Garden','Drifting moonlight'],['Autumn Letters','Falling leaves']]) {
  await page.getByRole('button',{name:preset,exact:true}).click();await page.getByLabel(toggle,{exact:true}).check();
  const poses=()=>page.locator('.flower').evaluateAll(es=>es.map(e=>(e as SVGElement).style.transform));
  const a=await poses();await page.waitForTimeout(800);const b=await poses();expect(a).toHaveLength(48);expect(a.filter((p,i)=>p!==b[i])).toHaveLength(48);expect(a.every(Boolean)).toBe(true);
  if(preset==='Moon Garden')expect(await page.locator('.star').evaluateAll(es=>es.every(e=>(e as SVGElement).style.transform===''))).toBe(true);
  await page.getByLabel(toggle,{exact:true}).uncheck();const off=await poses();await page.waitForTimeout(120);expect(await poses()).toEqual(off);
  await page.getByLabel(toggle,{exact:true}).check();await page.emulateMedia({reducedMotion:'reduce'});await expect(page.locator('.natural-flowers')).toHaveAttribute('data-running','false');const reduced=await poses();await page.waitForTimeout(120);expect(await poses()).toEqual(reduced);await page.emulateMedia({reducedMotion:'no-preference'});
 }
 // This injects a visibility event to test the handler; it is not OS suspension proof.
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});await expect(page.locator('.natural-flowers')).toHaveAttribute('data-running','false');
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await expect(page.locator('.natural-flowers')).toHaveAttribute('data-running','true');
 for(let n=0;n<4;n++){await lock(page);await expect(page.locator('.natural-flowers')).toHaveAttribute('data-running','false');await page.getByRole('button',{name:'Exit Lock In Mode',exact:true}).click();await expect(page.locator('.natural-flowers')).toHaveAttribute('data-running','true');}
 await expect(page.locator('.flower')).toHaveCount(48);await page.screenshot({path:info.outputPath('motion-after.png')});
});

test('completion: saved before feedback, stable drafts/focus through ticks, keyboard containment and skip',async({page})=>{
 await ready(page);await page.clock.install();await page.getByLabel('Focus length',{exact:true}).fill('1');await page.getByRole('button',{name:'Start focus',exact:true}).click();await page.clock.runFor(60100);const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
 const rating=dialog.getByRole('radio',{name:'4 out of 5',exact:true}).first();await rating.check();await rating.focus();await page.clock.runFor(2000);await expect(rating).toBeChecked();await expect(rating).toBeFocused();expect(await page.locator('.app-shell').getAttribute('inert')).not.toBeNull();
 await dialog.getByRole('button',{name:'Save feedback',exact:true}).click();await dialog.getByRole('button',{name:'Save feedback',exact:true}).click();await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
 const sessions=await page.evaluate(()=>JSON.parse(localStorage.getItem('studyroom.completedSessions.v1')||'[]'));expect(sessions).toHaveLength(1);expect(sessions[0].rating).toBe(4);
 await page.locator('[data-action=reset]').click();await page.locator('[data-action=start]').click();await page.clock.runFor(60100);await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'Skip',exact:true}).click();expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('studyroom.completedSessions.v1')||'[]').length)).toBe(2);await summary(page,'Completed sessions');await expect(page.getByRole('list',{name:'Completed timer sessions'}).locator('li')).toHaveCount(2);
});

test('two separate local browser contexts: explicit join, timer sync, private drafts, reconnect and admission controls',async({browser})=>{
 const a=await browser.newContext(),b=await browser.newContext();try{
 const p=await a.newPage(),q=await b.newPage();await ready(p);await p.getByRole('button',{name:'Party',exact:true}).click();await p.getByLabel('Your name',{exact:true}).fill('Synthetic host');await p.getByRole('button',{name:'Create room',exact:true}).click();const code=await p.getByLabel('Room code',{exact:true}).innerText();
 await q.goto(`/?room=${code}`);await expect(q.getByRole('button',{name:'Join room',exact:true})).toBeVisible();await expect(q.locator('.people')).toHaveCount(0);await q.getByLabel('Your name',{exact:true}).fill('Synthetic guest');await q.getByRole('button',{name:'Join room',exact:true}).click();await expect(p.locator('.people li')).toHaveCount(2);await expect(q.locator('.people li')).toHaveCount(2);
 await p.getByRole('button',{name:'Join room cycle',exact:true}).click();await q.getByRole('button',{name:'Join room cycle',exact:true}).click();await p.getByRole('button',{name:'Start focus',exact:true}).click();await expect(q.getByRole('button',{name:'Pause focus',exact:true})).toBeVisible();
 await p.getByLabel('Your session intention',{exact:true}).fill('Never shared draft');await expect(q.locator('.people')).not.toContainText('Never shared draft');
 await q.getByRole('button',{name:'Pause focus',exact:true}).click();await expect(p.getByRole('button',{name:'Resume focus',exact:true})).toBeVisible();await p.getByRole('button',{name:'Resume focus',exact:true}).click();
 await b.setOffline(true);await expect(p.locator('.people li')).toHaveCount(1,{timeout:35000});await b.setOffline(false);await expect(p.locator('.people li')).toHaveCount(2,{timeout:20000});await expect(q.getByRole('button',{name:'Pause focus',exact:true})).toBeVisible();
 await p.getByRole('button',{name:'Lock admission',exact:true}).click();await expect(q.getByText(/Admission locked/)).toBeVisible();await p.getByRole('button',{name:'Reset timer',exact:true}).click();await expect(q.getByRole('timer')).toHaveText('25:00');
 }finally{await a.close();await b.close();}
});

test('music and AI: honest unavailable states, manual provider controls, pasted fallback and preserved progress',async({page})=>{
 // Deliberately blocked embeds exercise the fallback UI; no playback is claimed.
 await page.route('https://open.spotify.com/**', route=>route.abort());
 await page.route('https://embed.music.apple.com/**', route=>route.abort());
 await ready(page);await summary(page,'Music');
 await summary(page,'Choose another Spotify link');await page.getByLabel('Spotify link',{exact:true}).fill('https://open.spotify.com/track/2KpZZ1cyChx3REhma5nOv6');await page.getByRole('button',{name:'Select music link',exact:true}).click();
 expect(await page.locator('iframe').count()).toBe(0);await page.getByRole('button',{name:'Load selected Spotify player',exact:true}).click();const player=page.getByTitle('Official Spotify music player');await expect(player).toBeVisible();expect(await player.getAttribute('src')).not.toContain('autoplay=1');
 await page.getByRole('button',{name:'Unload Spotify player',exact:true}).click();await expect(player).toHaveCount(0);
 await summary(page,'Account-connected playback');await page.getByRole('button',{name:'Check account setup',exact:true}).click();await expect(page.getByRole('button',{name:'Connect Spotify account',exact:true})).toBeDisabled();await expect(page.locator('script[src*="sdk.scdn.co"]')).toHaveCount(0);
 await page.getByLabel('Apple Music',{exact:true}).check();await summary(page,'Choose an Apple Music link');await page.getByLabel('Apple Music link',{exact:true}).fill('https://music.apple.com/us/album/example/12345');await page.getByRole('button',{name:'Select Apple Music link',exact:true}).click();await page.getByRole('button',{name:'Load selected Apple Music player',exact:true}).click();await expect(page.getByTitle('Official Apple Music player')).toBeVisible();await page.getByLabel('Silent mode',{exact:true}).check();await expect(page.locator('iframe')).toHaveCount(0);
 await page.getByLabel('Your session intention',{exact:true}).fill('Summarize one page');await page.getByRole('button',{name:'Plan session',exact:true}).click();await page.getByLabel('Use local AI for planning choices',{exact:true}).check();await page.getByRole('button',{name:'Steps',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'AI unavailable'})).toBeVisible();
 await page.getByLabel('Paste a brief or external plan',{exact:true}).fill('Read one page\nWrite three notes');await page.getByRole('button',{name:'Derive local checklist',exact:true}).click();await page.getByRole('button',{name:'Use reviewed plan',exact:true}).click();const plan=page.getByRole('region',{name:'Private intention plan'});await expect(plan.getByRole('checkbox',{name:'Read one page',exact:true})).toBeVisible();await plan.getByRole('checkbox',{name:'Read one page',exact:true}).check();await page.getByRole('button',{name:'Start focus',exact:true}).click();
 await lock(page);await page.getByRole('button',{name:'Exit Lock In Mode',exact:true}).click();await expect(plan.getByRole('checkbox',{name:'Read one page',exact:true})).toBeChecked();await expect(page.getByLabel('Enable focus chime',{exact:true})).not.toBeChecked();
});
