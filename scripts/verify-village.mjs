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
  const canvas=page.locator('canvas');
  await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.buildings==='1');
  await page.screenshot({path:'artifacts/village/single.png'});
  const first=await canvas.getAttribute('data-seed');
  await page.getByRole('button',{name:'메뉴 열기'}).click();
  await page.getByRole('button',{name:'새로 생성'}).click();
  await page.waitForFunction(seed=>document.querySelector('canvas').dataset.seed!==seed,first);
  await page.getByRole('button',{name:'전체 마을',exact:true}).click();
  await page.waitForFunction(()=>Number(document.querySelector('canvas').dataset.buildings)>20);
  await page.keyboard.press('Escape');
  await page.screenshot({path:'artifacts/village/village.png'});
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
  for (const [name,id] of [['트로피컬','tropical'],['캔디','candy'],['카니발','carnival'],['지중해','mediterranean'],['석양','sunset']]) {
    await page.getByRole('button',{name:`${name} 색상`}).click();
    await page.waitForFunction(id=>document.querySelector('canvas')?.dataset.palette===id,id);
    const result=await canvas.evaluate(c=>({image:c.toDataURL(),seed:c.dataset.seed,buildings:c.dataset.buildings}));
    assert(!paletteImages.has(result.image),`${name} palette did not change the drawing`);
    paletteImages.add(result.image);
    assert.equal(result.seed,beforePalette.seed,'Palette changed the seed');
    assert.equal(result.buildings,beforePalette.buildings,'Palette changed the composition');
    if (id==='carnival') await canvas.screenshot({path:'artifacts/village/carnival.png'});
  }
  await page.keyboard.press('Escape');
  await page.screenshot({path:'artifacts/village/sunset.png'});
  assert.deepEqual(errors,[]);
  console.log('Single building, regeneration, village coverage, resize and palette switching passed.');
} finally { await browser.close(); }
