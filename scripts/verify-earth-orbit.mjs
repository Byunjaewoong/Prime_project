import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = createRequire(path.resolve(process.argv[2]))('playwright');
const base=process.argv[3] || 'http://127.0.0.1:3000';
const browser=await chromium.launch({channel:'chrome',headless:true});
await fs.mkdir('artifacts/earth-orbit',{recursive:true});
try {
  const air=await browser.newPage({viewport:{width:1000,height:760},reducedMotion:'reduce'});
  const earth=await browser.newPage({viewport:{width:1000,height:760},reducedMotion:'reduce'});
  const errors=[];
  for (const page of [air,earth]) page.on('pageerror',error=>errors.push(error.message));
  await air.goto(`${base}/works/laboratory/Air`);
  await air.locator('main [role="status"]').waitFor({state:'detached',timeout:60000});
  await air.getByRole('button',{name:'메뉴 열기',exact:true}).click();
  await air.getByRole('button',{name:'Orbit',exact:true}).click();
  await earth.goto(`${base}/works/laboratory/Earth`);
  await earth.waitForFunction(()=>document.querySelector('canvas')?.dataset.frames || document.querySelector('main [role="alert"]'),null,{timeout:60000});
  assert.equal(await earth.locator('main [role="alert"]').count(),0);
  await earth.getByRole('button',{name:'CONTROLS',exact:true}).click();
  await earth.getByRole('button',{name:'Orbit',exact:true}).click();
  await earth.getByRole('button',{name:'High',exact:true}).click();
  await earth.getByRole('slider',{name:'Cloud coverage',exact:true}).fill('0');
  for (const page of [air,earth]) await page.addStyleTag({content:'main > :not(canvas), nextjs-portal { visibility:hidden !important; }'});
  for (const [width,height] of [[1000,760],[390,844]]) {
    await air.setViewportSize({width,height});
    await earth.setViewportSize({width,height});
    await air.waitForTimeout(600);
    const a=await air.screenshot({path:`artifacts/earth-orbit/air-${width}.png`});
    const e=await earth.screenshot({path:`artifacts/earth-orbit/earth-${width}.png`});
    const difference=await earth.evaluate(async ([a,e])=>{
      const read=async src=>{const img=new Image();img.src=src;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);return ctx.getImageData(0,0,c.width,c.height).data;};
      const first=await read(a),second=await read(e);let sum=0;
      for(let i=0;i<first.length;i++) if(i%4!==3) sum+=Math.abs(first[i]-second[i]);
      return sum/(first.length*0.75);
    },[a,e].map(buffer=>'data:image/png;base64,'+buffer.toString('base64')));
    console.log(`${width}x${height} clear-sky Air/Earth mean RGB error: ${difference.toFixed(3)}/255`);
    assert(difference<3,'Earth Orbit diverges from Air with clouds disabled');
  }
  assert.deepEqual(errors,[]);
} finally {await browser.close();}
