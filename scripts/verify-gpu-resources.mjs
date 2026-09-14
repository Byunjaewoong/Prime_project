import { createRequire } from 'node:module';
import fs from 'node:fs';
const { chromium } = createRequire(process.argv[2])('playwright');
const browser = await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-swiftshader']});
const page = await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await page.addInitScript(() => {
 const sets={};
 for(const kind of ['Texture','Framebuffer','Program','Shader','Buffer']){
  const set=sets[kind]=new Set();
  const proto=WebGL2RenderingContext.prototype;
  const create=proto['create'+kind],destroy=proto['delete'+kind];
  proto['create'+kind]=function(...args){const value=create.apply(this,args);if(value)set.add(value);return value;};
  proto['delete'+kind]=function(value){set.delete(value);return destroy.call(this,value);};
 }
 window.__resources=()=>Object.fromEntries(Object.entries(sets).map(([key,value])=>[key,value.size]));
});
await page.goto('http://localhost:3000/works/Vortex_GPU',{waitUntil:'networkidle'});
const initial=await page.evaluate(()=>window.__resources());
for(const [width,height] of [[844,390],[390,844],[844,390],[390,844]]){await page.setViewportSize({width,height});await page.waitForTimeout(200);}
const afterResize=await page.evaluate(()=>window.__resources());
const cdp=await page.context().newCDPSession(page);
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:60,y:400}]});
for(let i=1;i<30;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:60+i*8,y:400+Math.sin(i/5)*80}]});await page.waitForTimeout(50);}
const pixels=await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>{
 const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl2'),data=new Uint8Array(canvas.width*canvas.height*4);
 gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,data);
 let colored=0;for(let i=0;i<data.length;i+=4)if(Math.max(data[i],data[i+1],data[i+2])>20)colored++;
 resolve({error:gl.getError(),coloredPixels:colored});
})));
await page.screenshot({path:'artifacts/browser-260914/mobile-Vortex_GPU-touch.png'});
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
await page.locator('a[href="/"]').first().evaluate(link=>link.click());
await page.waitForTimeout(400);
const afterNavigation=await page.evaluate(()=>window.__resources());
const result={initial,afterResize,pixels,afterNavigation};
fs.writeFileSync('artifacts/browser-260914/gpu-resources.json',JSON.stringify(result,null,2));
console.log(result);
await browser.close();
if(JSON.stringify(initial)!==JSON.stringify(afterResize)||pixels.error||!pixels.coloredPixels||Object.values(afterNavigation).some(value=>value!==0))process.exitCode=1;
