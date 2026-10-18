import type { VillageRoof, VillageScene } from "./villageScene";

type Vec3 = [number, number, number];
type Knot = { x: number; y: number; base: number; scale: number };
type Bird = { age: number; delay: number; duration: number; phase: number; offset: number; size: number; path: Knot[] };
type Flock = { birds: Bird[]; idle: number; started: boolean };
const FLOCK_COUNT = 10;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
function seededRandom(seed: number) {
  let state = seed >>> 0;
  return (a = 0, b = 1) => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return a + (((t ^ t >>> 14) >>> 0) / 4294967296) * (b - a);
  };
}
// Catmull-Rom follows the roof anchors with a continuous tangent at each join.
function sample(path: Knot[], progress: number): Knot {
  const u = clamp(progress, 0, .999999) * (path.length - 1), i = Math.floor(u), t = u - i;
  const p = [path[Math.max(0, i - 1)], path[i], path[i + 1], path[Math.min(path.length - 1, i + 2)]];
  const field = (key: keyof Knot) => .5 * ((2*p[1][key]) + (-p[0][key]+p[2][key])*t +
    (2*p[0][key]-5*p[1][key]+4*p[2][key]-p[3][key])*t*t +
    (-p[0][key]+3*p[1][key]-3*p[2][key]+p[3][key])*t*t*t);
  return { x:field("x"), y:field("y"), base:field("base"), scale:Math.max(.15,field("scale")) };
}
function drawBird(ctx: CanvasRenderingContext2D, bird: Bird, at: Knot, yaw: number, bank: number) {
  const cycle = (bird.age + bird.phase*8) % 7;
  const flap = cycle < 1.4 ? Math.sin(cycle/1.4*Math.PI*4)*Math.sin(cycle/1.4*Math.PI)*.75 : .12;
  const scale = at.scale * bird.size;
  const project = ([x,y,z]: Vec3) => {
    const ry = y*Math.cos(bank)-z*Math.sin(bank), rz = y*Math.sin(bank)+z*Math.cos(bank);
    const wx = x*Math.cos(yaw)-ry*Math.sin(yaw), wy = x*Math.sin(yaw)+ry*Math.cos(yaw);
    return { x:at.x+wx*scale, y:at.y+(.55*wy-.85*rz)*scale, depth:wy*.85+rz*.55 };
  };
  const faces: { points: Vec3[]; color: string }[] = [];
  const wing = (side: number) => {
    const points: Vec3[] = [[3,2,1],[1,10,2],[-5,23,0],[-7,20,0],[-6,18,0],[-9,17,0],[-7,15,0],[-9,13,0],[-5,8,1],[-5,2,1]];
    const pose = ([x,y,z]: Vec3): Vec3 => [x,y*side*Math.cos(flap),z+y*Math.sin(flap)];
    faces.push({points:points.map(pose),color:side*Math.cos(yaw)>0?"#f9f7ee":"#cbd8dc"});
    faces.push({points:[[-5,23,0],[-7,20,0],[-6,18,0],[-9,17,0],[-7,15,0],[-3,16,1]].map(p=>pose(p as Vec3)),color:"#53646c"});
  };
  wing(-1); wing(1);
  faces.push({points:[[-6,-2,0],[-14,-4,0],[-12,0,0],[-14,4,0],[-6,2,0]],color:"#e4e9e5"});
  faces.push({points:[[-9,0,0],[-4,-2,2],[4,-2,3],[9,-1,2],[10,0,1],[7,2,1],[-4,2,0]],color:"#fffdf3"});
  faces.push({points:[[-9,0,0],[-4,2,0],[7,2,1],[9,0,0],[4,1,-1],[-5,1,-1]],color:"#b4c5cc"});
  faces.push({points:[[8,-1,1],[13,0,.5],[8,1,1]],color:"#d8b773"});
  const projected=faces.map(face=>({color:face.color,points:face.points.map(project)}));
  projected.sort((a,b)=>a.points.reduce((s,p)=>s+p.depth,0)/a.points.length-b.points.reduce((s,p)=>s+p.depth,0)/b.points.length);
  for(const face of projected) {
    ctx.beginPath(); face.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
    ctx.closePath();ctx.fillStyle=face.color;ctx.fill();
  }
}
export function animateVillageBirds(canvas: HTMLCanvasElement, seed: number, getScene: () => VillageScene) {
  const ctx=canvas.getContext("2d"); if(!ctx) return ()=>{};
  const random=seededRandom(seed^0x738fa15d);
  let width=0,height=0,frame=0,previous=0;
  let flocks:Flock[]=Array.from({length:FLOCK_COUNT},()=>({birds:[],idle:0,started:false}));
  let cachedScene:VillageScene|null=null;
  let flightRoofs:VillageRoof[]=[];
  let foregroundBuckets=new Map<number,VillageRoof[]>();
  const roofsForScene=()=>{
    const scene=getScene();
    if(scene!==cachedScene) {
      cachedScene=scene;
      flightRoofs=scene.roofs.filter(r=>r.x>0&&r.x<width&&r.y>height*.04&&r.y<height*.93);
      foregroundBuckets=new Map();
      for(const roof of scene.roofs) {
        const reach=180*roof.scale;
        for(let column=Math.floor((roof.x-reach)/120);column<=Math.floor((roof.x+reach)/120);column++) {
          const bucket=foregroundBuckets.get(column)??[];
          bucket.push(roof);foregroundBuckets.set(column,bucket);
        }
      }
    }
    return flightRoofs;
  };
  const resize=()=>{
    const rect=canvas.getBoundingClientRect(), ratio=Math.min(devicePixelRatio||1,2);
    const pixelWidth=Math.round(rect.width*ratio),pixelHeight=Math.round(rect.height*ratio);
    if(width===rect.width&&height===rect.height&&canvas.width===pixelWidth&&canvas.height===pixelHeight)return;
    width=rect.width;height=rect.height;
    canvas.width=pixelWidth;canvas.height=pixelHeight;
    ctx.setTransform(ratio,0,0,ratio,0,0);
    cachedScene=null;
    flocks=Array.from({length:FLOCK_COUNT},()=>({birds:[],idle:0,started:false}));
  };
  const makeWave=(flock:Flock,slot:number,roofs:VillageRoof[])=>{
    if(!roofs.length) return;
    const direction=random()<.5?1:-1;
    const lane=(slot+.5+random(-.4,.4))/FLOCK_COUNT;
    const startY=height*(.16+lane*.62), slope=random(-.26,.26)*height;
    const path:Knot[]=[];
    for(let i=0;i<6;i++) {
      const fraction=i/5, targetX=fraction*width, targetY=startY+slope*(fraction-.5)+Math.sin(fraction*Math.PI*2)*height*.055;
      const nearby=roofs.filter(r=>Math.abs(r.x-targetX)<width*.09);
      const candidates=nearby.length?nearby:roofs;
      const roof=candidates.reduce((best,r)=>Math.hypot(r.x-targetX,(r.y-targetY)*1.6)<Math.hypot(best.x-targetX,(best.y-targetY)*1.6)?r:best);
      path.push({x:roof.x,y:roof.y-14*roof.scale,base:roof.base,scale:roof.scale});
    }
    path[0].x=-45;path[path.length-1].x=width+45;
    if(direction<0) path.reverse();
    const count=Math.floor(random(2,6)), duration=(width+90)/random(38,56);
    const initialAge=flock.started?0:duration*random(.23,.76);
    flock.birds=Array.from({length:count},(_,i)=>({age:initialAge,delay:i*random(.5,1.1),duration:duration*random(.96,1.04),phase:random(),offset:random(-5,5),size:random(.29,.39),path}));
    flock.started=true;
    canvas.dataset.flockSize=String(count);canvas.dataset.flightDirection=direction>0?"right":"left";
  };
  const maskForeground=(roof:VillageRoof)=>{
    ctx.beginPath();roof.silhouette.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();
  };
  const tick=(now:number)=>{
    const dt=previous?Math.min((now-previous)/1000,.05):0;previous=now;
    ctx.clearRect(0,0,width,height);
    const roofs=roofsForScene();
    const active: {bird:Bird;at:Knot;yaw:number;bank:number;slot:number}[]=[];
    for(let slot=0;slot<flocks.length;slot++) {
      const flock=flocks[slot];
      if(!flock.birds.length) {flock.idle-=dt;if(flock.idle<=0)makeWave(flock,slot,roofs);}
      const hadBirds=flock.birds.length>0;
      flock.birds=flock.birds.filter(bird=>{
        bird.age+=dt;const progress=(bird.age-bird.delay)/bird.duration;
        if(progress>=1)return false;if(progress<0)return true;
        const at=sample(bird.path,progress), before=sample(bird.path,progress-.008),after=sample(bird.path,progress+.008);
        at.y+=bird.offset*at.scale+Math.sin(bird.age*1.1+bird.phase*6.28)*at.scale*.5;
        const yaw=Math.atan2((after.y-before.y)/.55,after.x-before.x);
        const ahead=sample(bird.path,progress+.025), behind=sample(bird.path,progress-.025);
        const a=Math.atan2((at.y-behind.y)/.55,at.x-behind.x), b=Math.atan2((ahead.y-at.y)/.55,ahead.x-at.x);
        const turn=Math.atan2(Math.sin(b-a),Math.cos(b-a));
        active.push({bird,at,yaw,bank:clamp(turn*1.1,-.4,.4),slot});return true;
      });
      if(hadBirds&&!flock.birds.length)flock.idle=random(1.5,3.5);
    }
    active.sort((a,b)=>a.at.base-b.at.base);
    for(const {bird,at,yaw,bank} of active) {
      drawBird(ctx,bird,at,yaw,bank);
      // Taller/nearer walls occlude the low flight, tying it to the village.
      ctx.save();ctx.beginPath();ctx.rect(at.x-30*at.scale,at.y-30*at.scale,60*at.scale,60*at.scale);ctx.clip();
      ctx.globalCompositeOperation="destination-out";ctx.fillStyle="#000";
      for(const roof of foregroundBuckets.get(Math.floor(at.x/120))??[])
        if(roof.base>at.base+8*at.scale&&Math.abs(roof.x-at.x)<180*roof.scale)maskForeground(roof);
      ctx.restore();
    }
    const visible=active.filter(({at})=>at.x>=0&&at.x<=width);
    canvas.dataset.flockCount=String(FLOCK_COUNT);
    canvas.dataset.activeFlocks=String(flocks.filter(flock=>flock.birds.length>0).length);
    canvas.dataset.visibleFlocks=String(new Set(visible.map(({slot})=>slot)).size);
    canvas.dataset.visibleBirds=String(visible.length);
    frame=requestAnimationFrame(tick);
  };
  resize();const observer=new ResizeObserver(resize);observer.observe(canvas);frame=requestAnimationFrame(tick);
  return ()=>{cancelAnimationFrame(frame);observer.disconnect();ctx.clearRect(0,0,width,height);};
}
