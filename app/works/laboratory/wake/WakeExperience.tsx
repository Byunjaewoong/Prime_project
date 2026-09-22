"use client";

import Link from "next/link";
import { FlaskConical, Home } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { WakeApp, type WakeFoamMode } from "./core/WakeApp";
import { DEFAULT_WAKE_SETTINGS, type WakeQuality, type WakeSettings } from "./core/WakeSettings";

type NumericSetting=Exclude<keyof WakeSettings,"palette"|"quality"|"showVectors">;

const controls:{section:string;items:{key:NumericSetting;label:string;min:number;max:number;step:number;decimals?:number;unit?:string}[]}[]=[
  {section:"Motion",items:[{key:"cruiseSpeed",label:"Cruise speed",min:.5,max:2,step:.05}]},
  {section:"Water",items:[{key:"wakeForce",label:"Wake force",min:0,max:2,step:.05},{key:"waveHeight",label:"Wave height",min:0,max:1.5,step:.05}]},
  {section:"Vortex Foam",items:[
    {key:"vorticity",label:"Vorticity",min:0,max:15,step:.5,decimals:1},
    {key:"dyeDecay",label:"Dye Decay",min:.98,max:1,step:.001,decimals:3},
    {key:"force",label:"Force",min:.1,max:2,step:.1,decimals:2},
    {key:"drag",label:"Drag",min:.9,max:1,step:.005,decimals:3},
    {key:"viscosity",label:"Viscosity",min:0,max:.0002,step:.00001,decimals:5},
    {key:"saturation",label:"Saturation",min:.5,max:3,step:.1,decimals:1},
    {key:"brightness",label:"Brightness",min:.5,max:3,step:.1,decimals:1},
  ]},
  {section:"Spray",items:[{key:"sprayAmount",label:"Amount",min:0,max:2,step:.05},{key:"sprayHeight",label:"Height",min:0,max:2,step:.05}]},
];

export default function WakeExperience({mode="boat",title="Wake"}:{mode?:WakeFoamMode;title?:string}){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const appRef=useRef<WakeApp|null>(null);
  const pointerActive=useRef(false);
  const [settings,setSettings]=useState<WakeSettings>(DEFAULT_WAKE_SETTINGS);
  const [menuOpen,setMenuOpen]=useState(false);
  const [unavailable,setUnavailable]=useState(false);

  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return;
    let app:WakeApp;
    try{app=new WakeApp(canvas,"/boat.glb",mode);appRef.current=app;}catch(error){console.error(`${title} could not initialize`,error);const timer=window.setTimeout(()=>setUnavailable(true),0);return()=>window.clearTimeout(timer);}
    const observer=new ResizeObserver(()=>app.resize());observer.observe(canvas);
    return()=>{observer.disconnect();app.destroy();appRef.current=null;};
  },[mode,title]);

  const update=<K extends keyof WakeSettings>(key:K,value:WakeSettings[K])=>{
    setSettings(current=>({...current,[key]:value}));appRef.current?.setSettings({[key]:value} as Partial<WakeSettings>);
  };

  const pointerDown=(event:React.PointerEvent<HTMLCanvasElement>)=>{
    if(event.button!==0&&event.pointerType==="mouse")return;pointerActive.current=true;event.currentTarget.setPointerCapture(event.pointerId);appRef.current?.setPointerTarget(event.clientX,event.clientY);
  };
  const pointerMove=(event:React.PointerEvent<HTMLCanvasElement>)=>{if(pointerActive.current)appRef.current?.setPointerTarget(event.clientX,event.clientY);};
  const pointerUp=(event:React.PointerEvent<HTMLCanvasElement>)=>{pointerActive.current=false;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);appRef.current?.clearPointerTarget();};

  return <main className="wake-page">
    <canvas ref={canvasRef} className="wake-canvas" aria-label="A boat steering across a simulated water surface and leaving a foam wake" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}/>
    <div className="orbit-fab wake-fab">
      {menuOpen&&<div className="orbit-fab__controls wake-controls" onClick={event=>event.stopPropagation()} onPointerDown={event=>event.stopPropagation()}>
          <div className="wake-menu-head">
            <span>{title}</span>
            <div className="wake-menu-links"><Link href="/" aria-label="Home"><Home size={17}/></Link><Link href="/works/laboratory" aria-label="Laboratory"><FlaskConical size={17}/></Link></div>
          </div>
          <section className="wake-section">
            <h4>Palette</h4>
            <div className="wake-segmented">
              <button type="button" className={settings.palette==="monochrome"?"is-active":""} onClick={()=>update("palette","monochrome")}>Monochrome</button>
              <button type="button" className={settings.palette==="deep-blue"?"is-active":""} onClick={()=>update("palette","deep-blue")}>Deep Blue</button>
            </div>
          </section>
          {controls.map(group=><section className="wake-section" key={group.section}>
            <h4>{group.section}</h4>
            {group.items.map(item=>{const fineForce=mode==="boat"&&item.key==="force";return <label className="wake-slider" key={item.key}>
              <span><span>{item.label}</span><output>{settings[item.key].toFixed(item.decimals??(item.step<.1?2:1))}{item.unit}</output></span>
              <div className="wake-slider-track"><input aria-label={item.label} type="range" min={fineForce?.01:item.min} max={item.max} step={fineForce?.01:item.step} value={settings[item.key]} onInput={event=>update(item.key,Number(event.currentTarget.value))}/></div>
            </label>;})}
            {group.section==="Vortex Foam"&&<div className="wake-segmented">
              <button type="button" className={settings.showVectors?"is-active":""} onClick={()=>update("showVectors",!settings.showVectors)}>{settings.showVectors?"⇢ vectors ON":"⇢ vectors"}</button>
              <button type="button" onClick={()=>appRef.current?.resetFoam()}>↺ reset</button>
            </div>}
          </section>)}
          <section className="wake-section">
            <h4>Performance</h4>
            <label className="wake-select"><span>Quality</span><select value={settings.quality} onInput={event=>update("quality",event.currentTarget.value as WakeQuality)}><option value="auto">Auto</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
          </section>
        </div>}
      <button type="button" className={"orbit-fab__main"+(menuOpen?" orbit-fab__main--active":"")} aria-label={menuOpen?"Close menu":"Open menu"} aria-expanded={menuOpen} onClick={()=>setMenuOpen(open=>!open)}>M</button>
    </div>
    {unavailable&&<p className="wake-unavailable">WebGL is unavailable on this device.</p>}
  </main>;
}
