"use client";

import Link from "next/link";
import { FlaskConical, Home } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SailingApp } from "./core/SailingApp";
import { SAILING_DEFAULT_SETTINGS, resolveInitialSailingSettings, type SailingQuality, type SailingSettings } from "./core/SailingSettings";

type NumericSetting=Exclude<keyof SailingSettings,"palette"|"quality"|"showVectors">;
type ControlItem={key:NumericSetting;label:string;min:number;max:number;step:number;decimals?:number;unit?:string};

const controls:{section:string;items:ControlItem[]}[]=[
  {section:"Motion",items:[{key:"cruiseSpeed",label:"Cruise speed",min:.5,max:2,step:.05}]},
  {section:"Water",items:[{key:"wakeForce",label:"Wake force",min:0,max:2,step:.05},{key:"waveHeight",label:"Wave height",min:0,max:1.5,step:.05},{key:"waveSpeed",label:"Wave speed",min:.25,max:2.5,step:.05,decimals:2},{key:"waveDamping",label:"Wave damping",min:.1,max:4,step:.05,decimals:2}]},
  {section:"Reflection",items:[
    {key:"reflectionIntensity",label:"Light intensity",min:0,max:6,step:.1,decimals:1},
    {key:"lightDirection",label:"Light rotation",min:0,max:360,step:5,decimals:0,unit:"°"},
  ]},
  {section:"Vortex Foam",items:[
    {key:"vorticity",label:"Vorticity",min:0,max:15,step:.5,decimals:1},
    {key:"dyeDecay",label:"Dye Decay",min:.98,max:1,step:.001,decimals:3},
    {key:"force",label:"Force",min:.001,max:1,step:.001,decimals:3},
    {key:"drag",label:"Drag",min:.9,max:1,step:.005,decimals:3},
    {key:"viscosity",label:"Viscosity",min:0,max:.0002,step:.00001,decimals:5},
    {key:"saturation",label:"Saturation",min:.5,max:3,step:.1,decimals:1},
    {key:"brightness",label:"Brightness",min:.5,max:3,step:.1,decimals:1},
  ]},
  {section:"Spray",items:[{key:"sprayAmount",label:"Amount",min:0,max:2,step:.05},{key:"sprayHeight",label:"Height",min:0,max:2,step:.05}]},
];

function SailingTouchSlider({label,value,min,max,step,onChange}:{label:string;value:number;min:number;max:number;step:number;onChange:(value:number)=>void}){
  const gesture=useRef<{pointerId:number;x:number;y:number;value:number;dragging:boolean}|null>(null);
  const apply=(next:number)=>{const stepped=min+Math.round((next-min)/step)*step;onChange(Math.max(min,Math.min(max,Number(stepped.toFixed(5)))));};
  const percent=(value-min)/(max-min)*100;
  return <div role="slider" tabIndex={0} aria-label={label} aria-orientation="horizontal" aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} className="sailing-touch-slider"
    onPointerDown={event=>{if(event.isPrimary)gesture.current={pointerId:event.pointerId,x:event.clientX,y:event.clientY,value,dragging:false};}}
    onPointerMove={event=>{const start=gesture.current;if(!start||start.pointerId!==event.pointerId)return;const dx=event.clientX-start.x,dy=event.clientY-start.y;if(!start.dragging){if(Math.abs(dx)<12||Math.abs(dx)<=Math.abs(dy)*1.25)return;start.dragging=true;event.currentTarget.setPointerCapture(event.pointerId);}apply(start.value+dx/event.currentTarget.getBoundingClientRect().width*(max-min));}}
    onPointerUp={()=>{gesture.current=null;}} onPointerCancel={()=>{gesture.current=null;}}
    onKeyDown={event=>{if(event.key==="ArrowLeft"||event.key==="ArrowDown"){event.preventDefault();apply(value-step);}if(event.key==="ArrowRight"||event.key==="ArrowUp"){event.preventDefault();apply(value+step);}if(event.key==="Home"){event.preventDefault();apply(min);}if(event.key==="End"){event.preventDefault();apply(max);}}}>
      <span className="sailing-touch-slider__track"/><span className="sailing-touch-slider__fill" style={{width:`${percent}%`}}/><span className="sailing-touch-slider__thumb" style={{left:`clamp(0px, calc(${percent}% - 7px), calc(100% - 14px))`}}/>
  </div>;
}

export default function SailingExperience(){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const appRef=useRef<SailingApp|null>(null);
  const pointerActive=useRef(false);
  const [settings,setSettings]=useState<SailingSettings>(()=>({...SAILING_DEFAULT_SETTINGS}));
  const [menuOpen,setMenuOpen]=useState(false);
  const [unavailable,setUnavailable]=useState(false);
  const [isTouchDevice,setIsTouchDevice]=useState(false);

  useEffect(()=>{const query=window.matchMedia("(pointer: coarse)");const sync=()=>setIsTouchDevice(query.matches);sync();query.addEventListener("change",sync);return()=>query.removeEventListener("change",sync);},[]);

  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return;
    setSettings(resolveInitialSailingSettings());
    let app:SailingApp;
    try{app=new SailingApp(canvas,"/boat.glb");appRef.current=app;}catch(error){console.error("Sailing could not initialize",error);const timer=window.setTimeout(()=>setUnavailable(true),0);return()=>window.clearTimeout(timer);}
    const observer=new ResizeObserver(()=>app.resize());observer.observe(canvas);
    return()=>{observer.disconnect();app.destroy();appRef.current=null;};
  },[]);

  const update=<K extends keyof SailingSettings>(key:K,value:SailingSettings[K])=>{
    setSettings(current=>({...current,[key]:value}));appRef.current?.setSettings({[key]:value} as Partial<SailingSettings>);
  };

  const pointerDown=(event:React.PointerEvent<HTMLCanvasElement>)=>{
    if(event.button!==0&&event.pointerType==="mouse")return;pointerActive.current=true;event.currentTarget.setPointerCapture(event.pointerId);appRef.current?.setPointerTarget(event.clientX,event.clientY);
  };
  const pointerMove=(event:React.PointerEvent<HTMLCanvasElement>)=>{if(pointerActive.current)appRef.current?.setPointerTarget(event.clientX,event.clientY);};
  const pointerUp=(event:React.PointerEvent<HTMLCanvasElement>)=>{pointerActive.current=false;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);appRef.current?.clearPointerTarget();};

  return <main className="sailing-page">
    <canvas ref={canvasRef} className="sailing-canvas" aria-label="A sailing boat crossing simulated water and leaving vortex foam" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}/>
    <div className="orbit-fab sailing-fab">
      {menuOpen&&<div className="orbit-fab__controls sailing-controls sailing-controls--atoms" onClick={event=>event.stopPropagation()} onPointerDown={event=>event.stopPropagation()}>
          <div className="sailing-menu-head">
            <span>Sailing</span>
            <div className="sailing-menu-links"><Link href="/" aria-label="Home"><Home size={17}/></Link><Link href="/works/laboratory" aria-label="Laboratory"><FlaskConical size={17}/></Link></div>
          </div>
          <div className="sailing-menu-note"><div>fluid field · sailing wake</div><div>horizontal drag · adjust / vertical drag · scroll</div></div>
          <section className="sailing-section">
            <h4>Palette</h4>
            <div className="sailing-segmented">
              <button type="button" className={settings.palette==="monochrome"?"is-active":""} onClick={()=>update("palette","monochrome")}>Monochrome</button>
              <button type="button" className={settings.palette==="deep-blue"?"is-active":""} onClick={()=>update("palette","deep-blue")}>Deep Blue</button>
            </div>
          </section>
          {controls.map(group=><section className="sailing-section" key={group.section}>
            <h4>{group.section}</h4>
            {group.items.map(item=>{const fineForce=item.key==="force";return <label className="sailing-slider" key={item.key}>
              <span><span>{item.label}</span><output>{settings[item.key].toFixed(item.decimals??(item.step<.1?2:1))}{item.unit}</output></span>
              <div className="sailing-slider-track">{isTouchDevice?<SailingTouchSlider label={item.label} min={item.min} max={fineForce?1:item.max} step={item.step} value={settings[item.key]} onChange={value=>update(item.key,value)}/>:<input aria-label={item.label} type="range" min={item.min} max={fineForce?1:item.max} step={item.step} value={settings[item.key]} onChange={event=>update(item.key,Number(event.currentTarget.value))}/>}</div>
            </label>;})}
            {group.section==="Vortex Foam"&&<label className="sailing-slider">
              <span><span>White : background</span><output>1:{settings.backgroundDyeRatio.toFixed(0)}</output></span>
              <div className="sailing-slider-track">{isTouchDevice?<SailingTouchSlider label="White to background ratio" min={0} max={5} step={1} value={settings.backgroundDyeRatio} onChange={value=>update("backgroundDyeRatio",value)}/>:<input aria-label="White to background ratio" type="range" min="0" max="5" step="1" value={settings.backgroundDyeRatio} onChange={event=>update("backgroundDyeRatio",Number(event.currentTarget.value))}/>}</div>
            </label>}
            {group.section==="Vortex Foam"&&<div className="sailing-segmented">
              <button type="button" className={settings.showVectors?"is-active":""} onClick={()=>update("showVectors",!settings.showVectors)}>{settings.showVectors?"⇢ vectors ON":"⇢ vectors"}</button>
              <button type="button" onClick={()=>appRef.current?.resetFoam()}>↺ reset</button>
            </div>}
          </section>)}
          <section className="sailing-section">
            <h4>Performance</h4>
            <label className="sailing-select"><span>Quality</span><select value={settings.quality} onInput={event=>update("quality",event.currentTarget.value as SailingQuality)}><option value="auto">Auto</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
            <label className="sailing-select"><span>Vortex grid</span><select value={settings.vortexGridSize} onInput={event=>update("vortexGridSize",Number(event.currentTarget.value))}><option value="128">128²</option><option value="160">160²</option><option value="192">192²</option><option value="256">256²</option><option value="320">320²</option><option value="384">384²</option><option value="512">512²</option></select></label>
            <label className="sailing-select"><span>Vortex FPS</span><select value={settings.vortexFps} onInput={event=>update("vortexFps",Number(event.currentTarget.value))}><option value="24">24 FPS</option><option value="30">30 FPS</option><option value="45">45 FPS</option><option value="60">60 FPS</option></select></label>
          </section>
        </div>}
      <button type="button" className={"orbit-fab__main"+(menuOpen?" orbit-fab__main--active":"")} aria-label={menuOpen?"Close menu":"Open menu"} aria-expanded={menuOpen} onClick={()=>setMenuOpen(open=>!open)}>M</button>
    </div>
    {unavailable&&<p className="sailing-unavailable">WebGL is unavailable on this device.</p>}
  </main>;
}
