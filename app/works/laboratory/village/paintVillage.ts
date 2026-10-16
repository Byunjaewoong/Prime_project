type Point = [number, number];
type Options = { seed: number; mode: "single" | "village"; size: number; density: number };

// Everything, including brush irregularity, comes from the same saved seed.
export function paintVillage(canvas: HTMLCanvasElement, width: number, height: number, options: Options) {
  const context = canvas.getContext("2d");
  if (!context) return;
  const ctx: CanvasRenderingContext2D = context;
  const ratio = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, width, height);
  let state = options.seed;
  const rand = (a = 0, b = 1) => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return a + (((t ^ t >>> 14) >>> 0) / 4294967296) * (b - a);
  };
  const pick = <T,>(list: T[]): T => list[Math.floor(rand(0, list.length))];
  const walls = ["#e9918a", "#e8b2a0", "#f0d7a6", "#efe2bd", "#d6676c", "#c3464b", "#58b9b0", "#dbac8e", "#f0c3b0", "#853e34"];
  const roofs = ["#086d98", "#135070", "#2789ad", "#3c6070", "#72c7bb", "#8bbfc4"];
  const ink = "#603e36";
  // NonFlowers' tubify/stroke idea: a line is a filled ribbon with a changing
  // width. The small correlated drift keeps long walls from looking ruled.
  const paintedLine = (points: Point[], color: string, weight: number) => {
    if(points.length < 2) return;
    const left: Point[] = [], right: Point[] = [];
    let travelled=0, drift=0;
    for(let edge=0;edge<points.length-1;edge++) {
      const [x0,y0]=points[edge], [x1,y1]=points[edge+1];
      const length=Math.hypot(x1-x0,y1-y0);
      if(length<.01) continue;
      const segments=Math.max(1,Math.ceil(length/(weight>1.6?7:12)));
      const nx=-(y1-y0)/length, ny=(x1-x0)/length;
      for(let i=0;i<=segments;i++) {
        if(edge && !i) continue;
        const t=i/segments;
        drift=drift*.63+rand(-.9,.9)*.37;
        const x=x0+(x1-x0)*t+nx*drift, y=y0+(y1-y0)*t+ny*drift;
        const swell=.7+.42*Math.sin((travelled+t*length)*.16)+rand(-.12,.12);
        const radius=Math.max(.25,weight*swell*.5);
        left.push([x+nx*radius,y+ny*radius]); right.push([x-nx*radius,y-ny*radius]);
      }
      travelled+=length;
    }
    if(!left.length) return;
    ctx.beginPath();
    [...left,...right.reverse()].forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
    ctx.closePath(); ctx.fillStyle=color; ctx.fill();
  };
  let edgeChance = 1;
  const poly = (points: Point[], fill: string, line = true, weight = 1.15) => {
    ctx.beginPath();
    points.forEach(([x, y], i) => { if (!i) ctx.moveTo(x+rand(-1.1,1.1),y+rand(-1.1,1.1)); else ctx.lineTo(x+rand(-1.1,1.1),y+rand(-1.1,1.1)); });
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    if (line) for(let i=0;i<points.length;i++) {
      if(rand()<edgeChance) paintedLine([points[i],points[(i+1)%points.length]],ink,weight);
    }
  };
  const box = (x: number, y: number, w: number, h: number, fill: string, line = false) => poly([[x,y],[x+w,y],[x+w,y+h],[x,y+h]], fill, line);
  const line = (points: Point[], color: string, weight: number) => {
    paintedLine(points,color,weight);
  };
  const oval = (x: number, y: number, rx: number, ry: number, color: string) => {
    ctx.beginPath(); ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2); ctx.fillStyle = color; ctx.fill();
  };
  function palm(x: number, y: number, s: number) {
    ctx.save(); ctx.translate(x,y); ctx.scale(s,s);
    line([[0,0],[-4,-24],[0,-57]], "#76654b", 3.5);
    for (let i=0;i<9;i++) {
      const a = i / 8 * Math.PI * 1.7 - Math.PI * 1.35;
      const ex = Math.cos(a)*rand(20,34), ey = -57+Math.sin(a)*rand(15,26)+8;
      ctx.beginPath(); ctx.moveTo(0,-57); ctx.quadraticCurveTo(ex*.8,-78,ex,ey);
      ctx.quadraticCurveTo(ex*.45,-55,0,-57); ctx.fillStyle = pick(["#075d56","#087568","#278c79"]); ctx.fill();
      for(let j=1;j<5;j++) { const t=j/5; line([[ex*t,-57+(ey+57)*t-9*Math.sin(t*Math.PI)],[ex*t+3,-48+(ey+57)*t]], "#146e60", 2); }
    }
    ctx.restore();
  }
  function house(x: number, base: number, s: number) {
    ctx.save(); ctx.translate(x, base); ctx.scale(s,s);
    const w = rand(65,105), h = rand(64,145), d = rand(12,52);
    const side = rand()<.47?-1:1, dx=side*d, rise=rand(4,26);
    const lean=rand(-5,5), tilt=rand(-4,4);
    const wall = pick(walls), roof = pick(roofs), flat = rand() < .56;
    const inkStyle=rand();
    // Some houses are described by pigment alone; others keep broken contour
    // strokes. Faces decide independently whether an outline helps them read.
    const fillOnly=inkStyle<.27;
    edgeChance=fillOnly?0:inkStyle<.66?rand(.46,.72):rand(.82,1);
    const frontOutline=!fillOnly&&rand()<.88;
    const sideOutline=!fillOnly&&rand()<.64;
    const roofOutline=!fillOnly&&rand()<.82;
    const frameOutline=!fillOnly&&rand()<.76;
    const top = -h;
    const doorX=rand(8,w-23);
    const edge=side>0?w:0, edgeTop=edge+lean, edgeY=top+(side>0?tilt:0);
    const sideFace: Point[]=[[edge,0],[edge+dx,-rise],[edgeTop+dx,edgeY-rise],[edgeTop,edgeY]];
    poly(sideFace,wall,sideOutline); poly(sideFace,"#573c3629",false);
    poly([[0,0],[w,0],[w+lean,top+tilt],[lean,top]], wall,frontOutline);
    // The local axes follow this building's individual leaning facade.
    ctx.save(); ctx.transform(1,tilt/w,-lean/h,1,0,0);
    box(0,-8,w,6,"#9f494334");
    const floors = Math.max(1, Math.round(h/44));
    for(let row=0;row<floors;row++) {
      const wy=top+16+row*(h-22)/floors;
      const cols = Math.floor(rand(2,4));
      for(let col=0;col<cols;col++) {
        const wx=9+col*(w-14)/cols, ww=rand(9,16), wh=rand(11,19);
        if(wy+wh > -28 && wx < doorX+18 && wx+ww > doorX-3) continue;
        box(wx-2,wy-2,ww+4,wh+4,pick(["#f8ebd0","#e9e7d4"]),frameOutline);
        box(wx,wy,ww,wh,pick(["#9cd3d9","#71b9cc","#293f3c","#f0bb36"]));
        line([[wx+ww*.5,wy],[wx+ww*.5,wy+wh]],"#f9e8c9",1.7);
      }
      if(row && !fillOnly && rand()<.55) line([[0,wy-9],[w,wy-9]],"#f4cbb0",2);
    }
    box(doorX,-25,15,25,pick(["#583c32","#3c7471","#ba693f"]),frameOutline);
    box(doorX+2,-23,3,21,"#f2cfaa"); oval(doorX+12,-12,1,1,"#f9df9c");
    ctx.restore();
    // Narrow side windows follow the receding wall rather than facing the viewer.
    if(d>25) for(let row=0;row<floors;row++) {
      const sy=top+18+row*(h-20)/floors;
      const a=edge+dx*.28,b=edge+dx*.69;
      poly([[a,sy-rise*.28-4],[b,sy-rise*.69-5],[b,sy-rise*.69+8],[a,sy-rise*.28+9]],"#eadac1",frameOutline);
      poly([[a+side*2,sy-rise*.28-2],[b-side*2,sy-rise*.69-3],[b-side*2,sy-rise*.69+5],[a+side*2,sy-rise*.28+6]],"#497f83",false);
    }
    const roofL:Point=[lean,top], roofR:Point=[w+lean,top+tilt];
    const backL:Point=[lean+dx,top-rise], backR:Point=[w+lean+dx,top+tilt-rise];
    if(flat) {
      poly([roofL,roofR,backR,backL],roof,roofOutline);
      poly([[lean-3,top-7],[w+lean+2,top+tilt-7],[w+lean+2,top+tilt+3],[lean-3,top+3]],wall,frontOutline);
      const near:Point=side>0?roofR:roofL, far:Point=side>0?backR:backL;
      poly([[near[0],near[1]-7],[far[0],far[1]-7],[far[0],far[1]+3],[near[0],near[1]+3]],wall,sideOutline);
      if(!fillOnly) line([[lean-3,top-7],[w+lean+2,top+tilt-7]],"#f4cfb6",2);
      const tx=lean+rand(10,w*.65)+dx*.3, ty=top-rise*.5;
      if(rand()<.72) {
        const th=rand(13,23);
        box(tx,ty-th,12,th,"#c8e5d9",frameOutline); oval(tx+6,ty-th,6,2.5,"#f4efd7");
        box(tx+1,ty-7,10,6,"#65b7ca"); line([[tx+2,ty-th],[tx+3,ty-th-6],[tx+10,ty-th-6],[tx+11,ty-th]],"#e7e8d3",1.5);
      }
      if(rand()<.45) {
        const ax=lean+w*.75+dx*.2, ay=top-rise*.6;
        line([[ax,ay],[ax+3,ay-21]],ink,1.5); oval(ax+3,ay-22,10,4,"#e9e1c8");
        line([[ax+3,ay-22],[ax+10,ay-29]],ink,1);
      }
      if(rand()<.32) { box(w*.55,top-3,20,3,"#f8e9c7"); for(let i=0;i<6;i++) line([[w*.55+i*3,top-3],[w*.55+i*3,top-12]],ink,.8); }
    } else {
      poly([[roofL[0]-5,roofL[1]],[roofR[0]+5,roofR[1]],[backR[0]+4,backR[1]-14],[backL[0]-4,backL[1]-14]],roof,roofOutline,1.7);
      const hatches=fillOnly?0:inkStyle<.66?7:15;
      for(let i=0;i<hatches;i++) {
        const rx=lean-2+i*(w+5)/Math.max(1,hatches), ry=top+tilt*i/Math.max(1,hatches);
        line([[rx,ry-1],[rx+dx*.48+rand(-1,1),ry-rise*.5-6],[rx+dx,ry-rise-12]],pick(["#084e7080","#48a5c280","#205e7b"]),rand(1,2.3));
      }
      box(lean+w*.65+dx*.3,top-rise-25,8,15,"#dfb598",frameOutline);
    }
    // Sparse pigment marks preserve the opaque, hand-painted colour blocks.
    for(let i=0;i<38;i++) {
      const px=rand(2,w-2), py=rand(top+5,-3);
      box(px,py,rand(.4,2),rand(.4,2.4),pick(["#fff1da18","#633b3010"]));
    }
    if(rand()<.3) palm((side>0?w+dx:dx)+rand(-4,9),options.mode === "village" ? -h*.62 : -2,rand(.8,1.3));
    ctx.restore();
    return w+d;
  }
  let count=0;
  if(options.mode === "single") {
    const s = Math.min(width/230,height/290,2.4)*options.size;
    house(width/2-65*s,height/2+65*s,s); count=1;
  } else {
    // Back-to-front rows become larger toward the viewer. Overscan conceals
    // the canvas boundary; staggered foundations avoid a repeated tile grid.
    const unit = Math.max(75, Math.min(135,width/8))*options.size;
    let y=-unit*.4, row=0;
    while(y < height+unit*2.3 && row<100) {
      const depth=Math.max(0,Math.min(1,y/height));
      const s=unit/95*(.66+depth*.67);
      let x=-150*s-rand(0,70)*s;
      while(x < width+120*s) {
        const buildingWidth=house(x,y+rand(-8,12)*s,s); count++;
        x+=buildingWidth*s*.82;
      }
      y+=unit*(.36+depth*.20)/options.density; row++;
    }
  }
  canvas.dataset.buildings=String(count);
  canvas.dataset.seed=String(options.seed);
  canvas.dataset.mode=options.mode;
}
