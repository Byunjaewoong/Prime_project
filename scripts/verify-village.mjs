import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = createRequire(path.resolve(process.argv[2]))('playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
await fs.mkdir('artifacts/village', { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  const errors=[]; page.on('pageerror', e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:3000/works/laboratory/village');
  const canvas=page.locator('canvas[role="img"]');
  await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.buildings==='1');
  assert.equal(await page.locator('canvas[aria-hidden="true"]').count(),0,'Single mode should not render birds');
  await page.screenshot({path:'artifacts/village/single.png'});
  const first=await canvas.getAttribute('data-seed');
  await page.getByRole('button',{name:'메뉴 열기'}).click();
  await page.getByRole('button',{name:'새로 생성'}).click();
  await page.waitForFunction(seed=>document.querySelector('canvas').dataset.seed!==seed,first);
  await page.getByRole('button',{name:'전체 마을',exact:true}).click();
  await page.waitForFunction(()=>Number(document.querySelector('canvas').dataset.buildings)>20);
  const birds=page.locator('canvas[aria-hidden="true"]');
  await page.waitForFunction(()=>Number(document.querySelector('canvas[aria-hidden="true"]')?.dataset.visibleBirds)>0);
  await page.waitForFunction(()=>Number(document.querySelector('canvas[aria-hidden="true"]')?.dataset.visibleFlocks)>=6);
  await page.waitForFunction(()=>{
    const c=document.querySelector('canvas[aria-hidden="true"]'),p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    let visible=0;for(let i=3;i<p.length;i+=4)if(p[i]>0)visible++;
    return visible>30;
  });
  const flock=await birds.evaluate(c=>({size:Number(c.dataset.flockSize),direction:c.dataset.flightDirection,
    teams:Number(c.dataset.flockCount),active:Number(c.dataset.activeFlocks),visible:Number(c.dataset.visibleFlocks),frame:c.toDataURL()}));
  assert.equal(flock.teams,10,'Village should maintain ten independent bird flocks');
  assert(flock.active>=6&&flock.visible>=6,'Several flocks should cross together');
  assert(flock.size>=2&&flock.size<=6,'Flock size should vary within the intended range');
  assert(['left','right'].includes(flock.direction),'Flock should cross from either side');
  const silhouette=await birds.evaluate(c=>{
    const pixels=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    let painted=0,nonWhite=0;
    for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]){
      painted++;
      if(pixels[i]!==255||pixels[i+1]!==255||pixels[i+2]!==255)nonWhite++;
    }
    return {painted,nonWhite};
  });
  assert(silhouette.painted>0,'The flock should be visible');
  assert(silhouette.nonWhite>0,'Projected wings and body should have depth shading');
  await page.waitForTimeout(3500);
  assert.notEqual(await birds.evaluate(c=>c.toDataURL()),flock.frame,'Birds should move independently of the painted village');
  await page.keyboard.press('Escape');
  await page.screenshot({path:'artifacts/village/village.png'});
  await fs.writeFile('artifacts/village/birds.png',Buffer.from(await birds.evaluate(c=>c.toDataURL().split(',')[1]),'base64'));
  for (const [width,height] of [[390,844],[1500,500]]) {
    await page.setViewportSize({width,height});
    await page.waitForFunction(({width,height})=> { const c=document.querySelector('canvas'); return Math.abs(c.width/c.height-width/height)<.002; },{width,height});
    await page.screenshot({path:`artifacts/village/${width}.png`});
    const coverage=await page.evaluate(()=> { const c=document.querySelector('canvas'),ctx=c.getContext('2d'); let filled=0,total=0; for(let y=5;y<c.height;y+=20) for(let x=5;x<c.width;x+=20) { const p=ctx.getImageData(x,y,1,1).data; if(p[0]<250||p[1]<250||p[2]<250)filled++;total++; } return filled/total; });
    assert(coverage>.94,`Coverage too low: ${coverage}`);
  }
  await page.getByRole('button',{name:'메뉴 열기'}).click();
  const beforePalette=await canvas.evaluate(c=>({image:c.toDataURL(),seed:c.dataset.seed,buildings:c.dataset.buildings}));
  const paletteImages=new Set([beforePalette.image]);
  for (const [name,id] of [['스펙트럼','spectrum'],['파스텔 믹스','pastelMix'],['안료 믹스','pigmentMix'],['트로피컬','tropical'],['캔디','candy'],['카니발','carnival'],['지중해','mediterranean'],['석양','sunset']]) {
    await page.getByRole('button',{name:`${name} 색상`}).click();
    await page.waitForFunction(id=>document.querySelector('canvas')?.dataset.palette===id,id);
    const result=await canvas.evaluate(c=>({image:c.toDataURL(),seed:c.dataset.seed,buildings:c.dataset.buildings}));
    assert(!paletteImages.has(result.image),`${name} palette did not change the drawing`);
    paletteImages.add(result.image);
    assert.equal(result.seed,beforePalette.seed,'Palette changed the seed');
    assert.equal(result.buildings,beforePalette.buildings,'Palette changed the composition');
    if (id==='carnival') await canvas.screenshot({path:'artifacts/village/carnival.png'});
    if (id==='spectrum') {
      await page.keyboard.press('Escape');
      await canvas.screenshot({path:'artifacts/village/spectrum.png'});
      await page.getByRole('button',{name:'메뉴 열기'}).click();
    }
  }
  await page.keyboard.press('Escape');
  await page.screenshot({path:'artifacts/village/sunset.png'});
  assert.deepEqual(errors,[]);
  console.log('Single building, flying birds, regeneration, village coverage, resize and palette switching passed.');
} finally { await browser.close(); }
