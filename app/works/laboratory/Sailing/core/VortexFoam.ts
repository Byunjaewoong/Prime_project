import * as THREE from "three";
import { DyeRenderer } from "../../../Vortex/core/DyeRenderer";
import { FluidSolver } from "../../../Vortex/core/FluidSolver";
import { Renderer } from "../../../Vortex/core/Renderer";
import type { SailingPalette, SailingSettings } from "./SailingSettings";
import type { SailingInput } from "./SailingSimulation";

const REFERENCE_GRID=144;
const OUTPUT_SIZE=1536;
const STERN_OFFSET=.018;
const HULL_FORCE_HALF_WIDTH=.011;
const TRAIL_LENGTH=.055;
const TRAIL_SAMPLES=7;

function hash1(value:number){
  const result=Math.sin(value*127.1)*43758.5453123;
  return result-Math.floor(result);
}

export class VortexFoam {
  readonly texture:THREE.CanvasTexture;
  private solver:FluidSolver;
  private outputSize:number;
  private dyeCanvas=document.createElement("canvas");
  private canvas=document.createElement("canvas");
  private context=this.canvas.getContext("2d")!;
  private dyeRenderer:DyeRenderer|null;
  private cpuRenderer=new Renderer();
  private previousUv:THREE.Vector2|null=null;
  private dyeTravel=0;
  private updateAccumulator=0;
  private palette:SailingPalette="monochrome";

  constructor(gridSize=384){
    this.outputSize=OUTPUT_SIZE;
    this.solver=new FluidSolver(gridSize,gridSize);
    this.dyeRenderer=DyeRenderer.create(this.dyeCanvas);
    this.canvas.width=this.outputSize;this.canvas.height=this.outputSize;
    this.dyeRenderer?.resize(this.solver,this.outputSize,this.outputSize);
    this.texture=new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace=THREE.SRGBColorSpace;
    this.texture.minFilter=THREE.LinearFilter;
    this.texture.magFilter=THREE.LinearFilter;
    this.texture.wrapS=THREE.ClampToEdgeWrapping;
    this.texture.wrapT=THREE.ClampToEdgeWrapping;
    this.texture.generateMipmaps=false;
  }

  setPalette(palette:SailingPalette){this.palette=palette;}

  setResolution(gridSize:number){
    gridSize=Math.round(THREE.MathUtils.clamp(gridSize,96,512));
    if(gridSize!==this.solver.W){
      const previous=this.solver;
      const next=new FluidSolver(gridSize,gridSize);
      this.resample(previous.u,previous.W,previous.H,next.u,next.W,next.H);
      this.resample(previous.v,previous.W,previous.H,next.v,next.W,next.H);
      this.resample(previous.dR,previous.W,previous.H,next.dR,next.W,next.H);
      this.resample(previous.dG,previous.W,previous.H,next.dG,next.W,next.H);
      this.resample(previous.dB,previous.W,previous.H,next.dB,next.W,next.H);
      next.dt=previous.dt;next.diffusion=previous.diffusion;next.dyeDiff=previous.dyeDiff;
      next.vorticityEps=previous.vorticityEps;next.dyeDecay=previous.dyeDecay;next.velocityDecay=previous.velocityDecay;
      this.solver=next;
    }
    this.dyeRenderer?.resize(this.solver,this.outputSize,this.outputSize);
    this.texture.needsUpdate=true;
  }

  private resample(source:Float64Array,sourceW:number,sourceH:number,target:Float64Array,targetW:number,targetH:number){
    const sourceStride=sourceW+2,targetStride=targetW+2;
    for(let y=1;y<=targetH;y++){
      const sourceY=THREE.MathUtils.clamp(.5+(y-.5)*sourceH/targetH,1,sourceH);
      const y0=Math.floor(sourceY),y1=Math.min(sourceH,y0+1),ty=sourceY-y0;
      for(let x=1;x<=targetW;x++){
        const sourceX=THREE.MathUtils.clamp(.5+(x-.5)*sourceW/targetW,1,sourceW);
        const x0=Math.floor(sourceX),x1=Math.min(sourceW,x0+1),tx=sourceX-x0;
        const top=THREE.MathUtils.lerp(source[x0+sourceStride*y0],source[x1+sourceStride*y0],tx);
        const bottom=THREE.MathUtils.lerp(source[x0+sourceStride*y1],source[x1+sourceStride*y1],tx);
        target[x+targetStride*y]=THREE.MathUtils.lerp(top,bottom,ty);
      }
    }
  }

  update(input:SailingInput,settings:SailingSettings,alternateBackground=false,frameDt=1/60){
    const vortexFps=THREE.MathUtils.clamp(settings.vortexFps,24,60);
    const interval=1/vortexFps;
    this.updateAccumulator+=Math.min(frameDt,.1);
    if(this.updateAccumulator<interval)return;
    this.updateAccumulator%=interval;
    this.applySettings(settings);
    const insideField=input.uv.x>=0&&input.uv.x<=1&&input.uv.y>=0&&input.uv.y<=1;

    if(this.previousUv&&insideField){
      const travelPixels=input.uv.distanceTo(this.previousUv)*this.outputSize;
      const scale=this.solver.W/REFERENCE_GRID;
      const invScale2=1/(scale*scale);
      // Keep each pressure jet local enough that the opposing lateral forces do not cancel.
      const fieldScale=input.fieldScale??1;
      const velocityRadius=Math.max(1,Math.round(2*scale*fieldScale));
      const dyeRadius=Math.max(1,Math.round(1.5*scale*fieldScale));
      const speed=THREE.MathUtils.clamp(input.speed,0,1.5);
      const timeScale=60/vortexFps;
      const cutStrength=Math.min(travelPixels,6)*THREE.MathUtils.lerp(.65,1.35,Math.min(speed,1))/timeScale;
      this.dyeTravel+=input.uv.distanceTo(this.previousUv)*REFERENCE_GRID;

      if(cutStrength>.001){
        const direction=input.direction.clone().normalize();
        const side=new THREE.Vector2(-direction.y,direction.x);
        const stern=input.uv.clone().addScaledVector(direction,-STERN_OFFSET*fieldScale);
        const turn=THREE.MathUtils.clamp(input.yawRate,-1,1);
        const leftStrength=cutStrength*.52*(1+Math.max(0,-turn)*.7);
        const rightStrength=cutStrength*.52*(1+Math.max(0,turn)*.7);
        const aftCarry=cutStrength*.85;
        const ratio=Math.round(THREE.MathUtils.clamp(settings.backgroundDyeRatio,0,5));
        const backgroundShare=ratio/(ratio+1);
        const whiteColor=this.palette==="monochrome"?[1,1,1] as const:[.12,.62,1] as const;
        const backgroundColor=[1,0,0] as const;
        const dyeStrength=40*THREE.MathUtils.lerp(.45,1,Math.min(speed,1))*invScale2;

        const inject=(position:THREE.Vector2,lateralDirection:number,strength:number,weight:number,color:readonly [number,number,number])=>{
          const gridX=Math.max(1,Math.min(this.solver.W,Math.floor(1+position.x*this.solver.W)));
          // CanvasTexture flips its source vertically when it is uploaded to WebGL.
          // Convert UV-space position and velocity into the canvas/grid coordinate system.
          const gridY=Math.max(1,Math.min(this.solver.H,Math.floor(1+(1-position.y)*this.solver.H)));
          const velocity=direction.clone().multiplyScalar(-aftCarry).addScaledVector(side,lateralDirection*strength);
          this.solver.addVelocity(gridX,gridY,velocity.x*settings.force*invScale2*weight,-velocity.y*settings.force*invScale2*weight,velocityRadius);
          this.solver.addDye(gridX,gridY,color[0]*dyeStrength*weight,color[1]*dyeStrength*weight,color[2]*dyeStrength*weight,dyeRadius);
        };

        const weightTotal=TRAIL_SAMPLES*(1+.18)*.5;
        const randomStep=Math.floor(this.dyeTravel*2.5);
        for(let sample=0;sample<TRAIL_SAMPLES;sample++){
          const progress=sample/(TRAIL_SAMPLES-1);
          const weight=THREE.MathUtils.lerp(1,.18,progress)/weightTotal;
          const trailCenter=stern.clone().addScaledVector(direction,-TRAIL_LENGTH*fieldScale*progress);
          const halfWidth=THREE.MathUtils.lerp(HULL_FORCE_HALF_WIDTH,HULL_FORCE_HALF_WIDTH*1.85,progress)*fieldScale;
          const useBackground=alternateBackground&&ratio>0&&hash1(randomStep*TRAIL_SAMPLES+sample)<backgroundShare;
          const color=useBackground?backgroundColor:whiteColor;
          inject(trailCenter.clone().addScaledVector(side,halfWidth),1,leftStrength,weight,color);
          inject(trailCenter.clone().addScaledVector(side,-halfWidth),-1,rightStrength,weight,color);
        }
      }
    }
    this.previousUv=insideField?input.uv.clone():null;

    this.render(settings);
  }

  private applySettings(settings:SailingSettings){
    const timeScale=60/THREE.MathUtils.clamp(settings.vortexFps,24,60);
    this.solver.dt=.1*timeScale;
    this.solver.vorticityEps=settings.vorticity;
    this.solver.dyeDecay=Math.pow(settings.dyeDecay,timeScale);
    this.solver.velocityDecay=Math.pow(settings.drag,timeScale);
    this.solver.diffusion=settings.viscosity;
    this.cpuRenderer.saturation=settings.saturation;
    this.cpuRenderer.brightness=settings.brightness;
  }

  private render(settings:SailingSettings){
    this.dyeRenderer?.captureSources(this.solver);
    this.solver.step();
    const gpuRendered=this.dyeRenderer?.render(this.solver,settings.saturation,settings.brightness)??false;
    if(gpuRendered){
      this.context.clearRect(0,0,this.outputSize,this.outputSize);
      this.context.drawImage(this.dyeCanvas,0,0,this.outputSize,this.outputSize);
    }else{
      this.cpuRenderer.render(this.context,this.solver.W,this.solver.H,this.solver.W+2,this.solver.dR,this.solver.dG,this.solver.dB,this.outputSize,this.outputSize);
    }
    if(settings.showVectors)this.cpuRenderer.renderVectors(this.context,this.solver.W,this.solver.H,this.solver.W+2,this.solver.u,this.solver.v,this.outputSize,this.outputSize);
    this.texture.needsUpdate=true;
  }

  reset(){
    this.solver.reset();this.dyeRenderer?.reset();this.previousUv=null;this.dyeTravel=0;this.updateAccumulator=0;
    this.context.clearRect(0,0,this.outputSize,this.outputSize);this.texture.needsUpdate=true;
  }

  dispose(){this.dyeRenderer?.destroy();this.texture.dispose();}
}
