import { tintVillageColor, villagePalettes, type VillagePaletteId } from "./villagePalettes";

type Point = [number, number];
type Options = { seed: number; mode: "single" | "village"; size: number; density: number; palette: VillagePaletteId };

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
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(rand(0, list.length))];
  const palette = villagePalettes[options.palette];
  const walls: readonly string[] = palette.walls;
  const roofs: readonly string[] = palette.roofs;
  const ink = palette.ink;
  const tint = (color: string) => tintVillageColor(color, options.palette);
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
    ctx.closePath(); ctx.fillStyle=tint(color); ctx.fill();
  };
  let edgeChance = 1;
  const poly = (points: Point[], fill: string, line = true, weight = 1.15) => {
    ctx.beginPath();
    points.forEach(([x, y], i) => { if (!i) ctx.moveTo(x+rand(-1.1,1.1),y+rand(-1.1,1.1)); else ctx.lineTo(x+rand(-1.1,1.1),y+rand(-1.1,1.1)); });
    ctx.closePath(); ctx.fillStyle = tint(fill); ctx.fill();
    if (line) for(let i=0;i<points.length;i++) {
      if(rand()<edgeChance) paintedLine([points[i],points[(i+1)%points.length]],ink,weight);
    }
  };
  const box = (x: number, y: number, w: number, h: number, fill: string, line = false) => poly([[x,y],[x+w,y],[x+w,y+h],[x,y+h]], fill, line);
  const line = (points: Point[], color: string, weight: number) => {
    paintedLine(points,color,weight);
  };
  const oval = (x: number, y: number, rx: number, ry: number, color: string) => {
    ctx.beginPath(); ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2); ctx.fillStyle = tint(color); ctx.fill();
  };
  const clipFace = (points: Point[]) => {
    ctx.beginPath();
    points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
    ctx.closePath(); ctx.clip();
  };
  function palm(x: number, y: number, s: number) {
    ctx.save(); ctx.translate(x,y); ctx.scale(s,s);
    const crownX=rand(-8,8), crownY=rand(-65,-50);
    const canopyWidth=rand(21,34), canopyHeight=rand(13,23);
    const canopyCenterY=crownY-rand(3,8);
    const lobePhase=rand(0,Math.PI*2), lobeCount=Math.floor(rand(3,7));
    const trunk:Point[]=[[0,0],[rand(-5,2),-17],[crownX*.55+rand(-3,3),-36],[crownX,crownY+3]];
    line(trunk,"#715b40",rand(3,5));
    line([[1,-5],[trunk[1][0]+1,-19],[crownX+1,crownY+4]],"#a38b60",1.5);
    const canopy:Point[]=Array.from({length:24},(_,i)=>{
      const angle=i/24*Math.PI*2;
      const lobe=1+.13*Math.sin(angle*lobeCount+lobePhase)+.07*Math.sin(angle*(lobeCount+4)-lobePhase)+rand(-.085,.085);
      return [crownX+Math.cos(angle)*canopyWidth*lobe,
        canopyCenterY+Math.sin(angle)*canopyHeight*lobe];
    });
    poly(canopy,pick(["#075b54","#07564e","#09685d","#117064"]),false);
    ctx.save(); clipFace(canopy);
    // A different flow direction, wavelength and split pattern is sampled for
    // every crown; the clipped ribbons become its internal colour boundaries.
    const flowAngle=rand(-1.45,1.45), flowCount=Math.floor(rand(5,12));
    const flow:[number,number]=[Math.cos(flowAngle),Math.sin(flowAngle)];
    const normal:[number,number]=[-flow[1],flow[0]];
    const reach=Math.max(canopyWidth,canopyHeight)*1.7;
    for(let i=0;i<flowCount;i++) {
      const offset=(i-(flowCount-1)/2)*rand(3.2,5.2);
      const amplitude=rand(2,6), frequency=rand(.09,.23), phase=rand(0,Math.PI*2);
      const ribbon:Point[]=[];
      for(let j=0;j<=10;j++) {
        const along=(j/10*2-1)*reach;
        const wave=Math.sin(along*frequency+phase)*amplitude+Math.sin(along*frequency*2.1-phase)*amplitude*.3;
        ribbon.push([crownX+flow[0]*along+normal[0]*(offset+wave),
          canopyCenterY+flow[1]*along+normal[1]*(offset+wave)]);
      }
      line(ribbon,pick(["#064a47","#107266","#398e7d","#286a67","#65a991"]),rand(1.2,3.4));
      if(rand()<.5) {
        const start=Math.floor(rand(2,7)), [px,py]=ribbon[start];
        line([[px,py],[px+flow[0]*7+normal[0]*rand(-6,6),py+flow[1]*7+normal[1]*rand(-6,6)],
          [px+flow[0]*13+normal[0]*rand(-9,9),py+flow[1]*13+normal[1]*rand(-9,9)]],
          pick(["#064a47","#398e7d","#65a991"]),rand(.8,1.7));
      }
    }
    ctx.restore();
    // Overlapping, curved fronds form one continuous silhouette. Each frond
    // is then clipped so its winding pigment bands stay inside the foliage.
    const fronds=Math.floor(rand(7,15));
    const fanStart=rand(-Math.PI*1.13,-Math.PI*.83);
    const fanArc=rand(Math.PI*1.48,Math.PI*2.03);
    const fanLean=rand(-.18,.18), lengthScale=rand(.8,1.22);
    const bands=["#054d49","#0c6259","#369681","#65a991","#123e42"];
    for(let i=0;i<fronds;i++) {
      const a=fanStart+i/(fronds-1)*fanArc+fanLean+rand(-.17,.17);
      const length=rand(21,43)*lengthScale, bend=rand(-11,11), droop=rand(1,16);
      const leafWidth=rand(2.7,5.8);
      const spine: Point[]=[];
      for(let j=0;j<=9;j++) {
        const t=j/9;
        spine.push([crownX+Math.cos(a)*length*t+Math.sin(a)*bend*Math.sin(Math.PI*t),
          crownY+Math.sin(a)*length*t-Math.cos(a)*bend*Math.sin(Math.PI*t)+droop*t*t]);
      }
      const left:Point[]=[], right:Point[]=[];
      for(let j=0;j<spine.length;j++) {
        const t=j/9, before=spine[Math.max(0,j-1)], after=spine[Math.min(9,j+1)];
        const vx=after[0]-before[0],vy=after[1]-before[1],vl=Math.hypot(vx,vy)||1;
        const breadth=(leafWidth+rand(-.7,.7))*Math.pow(Math.sin(Math.PI*(.03+t*.94)),.72)*(1-t*.28);
        const nick=j>1&&j<9?rand(-1.8,1.8):0;
        left.push([spine[j][0]-vy/vl*(breadth+nick),spine[j][1]+vx/vl*(breadth+nick)]);
        right.push([spine[j][0]+vy/vl*(breadth-nick),spine[j][1]-vx/vl*(breadth-nick)]);
      }
      const shape=[...left,...right.reverse()];
      ctx.save(); clipFace(shape);
      poly(shape,pick(["#07564e","#096d61","#117b68","#238974","#176c65"]),false);
      // Meandering stripes and small side strokes read as colour boundaries
      // inside a single painted crown, rather than separate geometric leaves.
      const stripeCount=Math.floor(rand(2,6)), stripePhase=rand(0,Math.PI*2), stripeFrequency=rand(6,16);
      for(let k=0;k<stripeCount;k++) {
        const stripe:Point[]=spine.map(([sx,sy],j)=>{
          const t=j/9, wiggle=Math.sin(t*stripeFrequency+stripePhase+k*1.7)*rand(.5,2.2);
          const across=(k-(stripeCount-1)/2)*rand(1.1,2)+wiggle;
          return [sx+Math.sin(a)*across*Math.sin(Math.PI*t),
            sy-Math.cos(a)*across*Math.sin(Math.PI*t)];
        });
        line(stripe,pick(bands),rand(1.1,2.9));
      }
      for(let j=Math.floor(rand(2,4));j<9;j+=Math.floor(rand(2,4))) {
        const [sx,sy]=spine[j];
        line([[sx-rand(2,5),sy+rand(-3,2)],[sx+rand(-2,2),sy+rand(0,3)],[sx+rand(2,5),sy+rand(0,5)]],pick(bands),rand(.7,1.4));
      }
      ctx.restore();
    }
    const heart:Point[]=Array.from({length:9},(_,i)=>{
      const a=i/9*Math.PI*2, radius=rand(7,13);
      return [crownX+Math.cos(a)*radius,crownY+Math.sin(a)*radius*.8];
    });
    poly(heart,pick(["#09685d","#07564e","#117b68"]),false);
    line([[crownX-7,crownY-2],[crownX+rand(-3,3),crownY-rand(3,7)],[crownX+8,crownY+rand(0,4)]],"#328d78",2.4);
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
    const palmPresent=rand()<.3;
    // The trunk starts on the ground at the outer side corner. Foreground
    // houses may cover its lower part, but it never grows from midair.
    const palmX=edge+dx+rand(-3,7);
    const palmY=-rise+rand(-1,2);
    const palmScale=options.mode === "village" ? rand(1.2,1.8) : rand(.9,1.35);
    const frontFace: Point[]=[[0,0],[w,0],[w+lean,top+tilt],[lean,top]];
    const sideFace: Point[]=[[edge,0],[edge+dx,-rise],[edgeTop+dx,edgeY-rise],[edgeTop,edgeY]];
    poly(sideFace,wall,sideOutline); poly(sideFace,"#573c3629",false);
    poly(frontFace,wall,frontOutline);
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
    // A projecting roof darkens the wall below it. Clip each wash to the
    // painted plane, so its irregular lower edge reads as cast shade.
    const drop=flat?rand(9,16):rand(14,25);
    ctx.save(); clipFace(frontFace);
    poly([[lean-4,top+2],[w+lean+4,top+tilt+2],
      [w+lean+3,top+tilt+drop],[w*.69+lean,top+tilt*.69+drop-rand(0,5)],
      [w*.37+lean,top+tilt*.37+drop+rand(-3,3)],[lean-3,top+drop-rand(0,4)]],
      "#453a3a36",false);
    ctx.restore();
    ctx.save(); clipFace(sideFace);
    poly([[edgeTop,edgeY+1],[edgeTop+dx,edgeY-rise+1],
      [edgeTop+dx,edgeY-rise+drop*.8],[edgeTop+dx*.55,edgeY-rise*.55+drop],
      [edgeTop,edgeY+drop*.9]],"#332c3035",false);
    ctx.restore();
    if(palmPresent && rand()<.75) {
      // The tree grows just beyond the outer side corner. Project its shadow
      // back onto that nearest wall, using the wall's receding axis and clip.
      ctx.save(); clipFace(sideFace);
      ctx.transform(side,-rise/d,0,1,edge,0);
      const shadowX=d*.66, shadowY=palmY-45*palmScale+18;
      ctx.translate(shadowX,shadowY); ctx.scale(palmScale*.82,palmScale*.82);
      line([[5,38],[4,15],[0,0]],"#24534d40",4.2);
      for(let i=0;i<8;i++) {
        const a=-Math.PI*.95+i*Math.PI*.26;
        const ex=Math.cos(a)*rand(15,27), ey=Math.sin(a)*rand(10,20);
        poly([[0,0],[ex*.55,ey-5],[ex,ey+rand(0,5)],[ex*.42,ey+4]],"#24534d38",false);
      }
      ctx.restore();
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
    // Attach a shorter wing to the facade, producing L-shaped and stepped
    // rooflines. Occasionally a narrow upper storey rises behind the wing.
    const wingSide=rand()<.5?-1:1;
    const wingW=rand(w*.48,w*.79), wingH=h*rand(.48,.79);
    const wingX=wingSide<0?-wingW*rand(.48,.76):w-wingW*rand(.26,.45);
    const wingD=rand(8,25)*side;
    const wingTop=-wingH, wingWall=rand()<.72?wall:pick(walls);
    const wingFront:Point[]=[[wingX,0],[wingX+wingW,0],[wingX+wingW+rand(-2,3),wingTop+rand(-2,2)],[wingX+rand(-2,2),wingTop]];
    const wingEdge=wingSide<0?wingX:wingX+wingW;
    poly([[wingEdge,0],[wingEdge+wingD,-7],[wingEdge+wingD,wingTop-14],[wingEdge,wingTop]],wingWall,sideOutline);
    poly([[wingEdge,0],[wingEdge+wingD,-7],[wingEdge+wingD,wingTop-14],[wingEdge,wingTop]],"#46362e24",false);
    poly(wingFront,wingWall,frontOutline);
    poly([[wingX-3,wingTop-7],[wingX+wingW+3,wingTop-7],[wingX+wingW+wingD+3,wingTop-19],[wingX+wingD-3,wingTop-19]],
      rand()<.68?roof:pick(roofs),roofOutline);
    poly([[wingX-3,wingTop-5],[wingX+wingW+3,wingTop-5],[wingX+wingW+3,wingTop+rand(6,12)],[wingX-3,wingTop+rand(5,11)]],"#332d2e37",false);
    for(let i=0;i<Math.max(1,Math.floor(wingW/28));i++) {
      const wx=wingX+9+i*(wingW-15)/Math.max(1,Math.floor(wingW/28));
      box(wx,wingTop+17,rand(9,15),rand(12,17),pick(["#7dbdcb","#e9dbb9","#334c4b"]),frameOutline);
    }
    if(rand()<.53) {
      const towerW=rand(18,32), towerH=rand(20,40), towerX=lean+rand(w*.13,w*.6);
      poly([[towerX,top],[towerX+towerW,top],[towerX+towerW,top-towerH],[towerX,top-towerH]],wall,frontOutline);
      poly([[towerX+towerW,top],[towerX+towerW+dx*.4,top-rise*.4],[towerX+towerW+dx*.4,top-towerH-rise*.4],[towerX+towerW,top-towerH]],wall,sideOutline);
      poly([[towerX-3,top-towerH],[towerX+towerW+3,top-towerH],[towerX+towerW+dx*.4+3,top-towerH-rise*.4],[towerX+dx*.4-3,top-towerH-rise*.4]],roof,roofOutline);
      box(towerX+5,top-towerH+7,7,9,"#85c0c5",frameOutline);
    }
    // Sparse pigment marks preserve the opaque, hand-painted colour blocks.
    for(let i=0;i<38;i++) {
      const px=rand(2,w-2), py=rand(top+5,-3);
      box(px,py,rand(.4,2),rand(.4,2.4),pick(["#fff1da18","#633b3010"]));
    }
    if(palmPresent) {
      oval(palmX,palmY,4.5,2.2,"#2f61554d");
      palm(palmX,palmY,palmScale);
    }
    ctx.restore();
    return w+d+wingW*.24;
  }
  let count=0;
  if(options.mode === "single") {
    const s = Math.min(width/230,height/290,2.4)*options.size;
    house(width/2-65*s,height/2+65*s,s); count=1;
  } else {
    // Back-to-front rows become larger toward the viewer. Overscan conceals
    // the canvas boundary; staggered foundations avoid a repeated tile grid.
    const unit = Math.max(75, Math.min(135,width/8))*options.size;
    let y=-unit*.25, row=0;
    while(y < height+unit*2.3 && row<100) {
      const depth=Math.max(0,Math.min(1,y/height));
      const s=unit/95*(.38+depth*1.12);
      let x=-150*s-rand(0,70)*s;
      while(x < width+120*s) {
        const buildingWidth=house(x,y+rand(-8,12)*s,s); count++;
        x+=buildingWidth*s*.82;
      }
      y+=unit*(.25+depth*.34)/options.density; row++;
    }
  }
  canvas.dataset.buildings=String(count);
  canvas.dataset.seed=String(options.seed);
  canvas.dataset.mode=options.mode;
  canvas.dataset.palette=options.palette;
}
