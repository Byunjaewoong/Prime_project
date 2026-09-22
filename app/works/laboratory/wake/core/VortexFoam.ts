import * as THREE from "three";
import { DyeRenderer } from "../../../Vortex/core/DyeRenderer";
import { FluidSolver } from "../../../Vortex/core/FluidSolver";
import { Renderer } from "../../../Vortex/core/Renderer";
import type { WakePalette, WakeSettings } from "./WakeSettings";
import type { WakeInput } from "./WakeSimulation";

const MOBILE_GRID_SIZE=160;
const DESKTOP_GRID_SIZE=256;
const MOBILE_OUTPUT_SIZE=768;
const DESKTOP_OUTPUT_SIZE=1024;
const REFERENCE_GRID=144;
const STERN_OFFSET=.018;
const HULL_FORCE_HALF_WIDTH=.011;
const DYE_SEGMENT_LENGTH=9;

export class VortexFoam {
  readonly texture:THREE.CanvasTexture;
  readonly texelSize:number;
  private solver:FluidSolver;
  private outputSize:number;
  private dyeCanvas=document.createElement("canvas");
  private canvas=document.createElement("canvas");
  private context=this.canvas.getContext("2d")!;
  private dyeRenderer:DyeRenderer|null;
  private cpuRenderer=new Renderer();
  private previousUv:THREE.Vector2|null=null;
  private dyeTravel=0;
  private palette:WakePalette="monochrome";

  constructor(highDetail=false){
    const gridSize=highDetail?DESKTOP_GRID_SIZE:MOBILE_GRID_SIZE;
    this.outputSize=highDetail?DESKTOP_OUTPUT_SIZE:MOBILE_OUTPUT_SIZE;
    this.texelSize=1/gridSize;
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

  setPalette(palette:WakePalette){this.palette=palette;}

  update(input:WakeInput,settings:WakeSettings,alternateBackground=false){
    this.applySettings(settings);
    const insideField=input.uv.x>=0&&input.uv.x<=1&&input.uv.y>=0&&input.uv.y<=1;

    if(this.previousUv&&insideField){
      const travelPixels=input.uv.distanceTo(this.previousUv)*this.outputSize;
      const scale=this.solver.W/REFERENCE_GRID;
      const invScale2=1/(scale*scale);
      // Keep each pressure jet local enough that the opposing lateral forces do not cancel.
      const fieldScale=input.fieldScale??1;
      const velocityRadius=Math.max(1,Math.round(2*scale*fieldScale));
      const dyeRadius=Math.max(1,Math.round(3*scale*fieldScale));
      const speed=THREE.MathUtils.clamp(input.speed,0,1.5);
      const cutStrength=Math.min(travelPixels,6)*THREE.MathUtils.lerp(.65,1.35,Math.min(speed,1));
      this.dyeTravel+=travelPixels;

      if(cutStrength>.001){
        const direction=input.direction.clone().normalize();
        const side=new THREE.Vector2(-direction.y,direction.x);
        const stern=input.uv.clone().addScaledVector(direction,-STERN_OFFSET*fieldScale);
        const turn=THREE.MathUtils.clamp(input.yawRate,-1,1);
        const leftStrength=cutStrength*.52*(1+Math.max(0,-turn)*.7);
        const rightStrength=cutStrength*.52*(1+Math.max(0,turn)*.7);
        const aftCarry=cutStrength*.85;
        const ratio=Math.round(THREE.MathUtils.clamp(settings.backgroundDyeRatio,0,5));
        const backgroundSegment=alternateBackground&&ratio>0&&Math.floor(this.dyeTravel/DYE_SEGMENT_LENGTH)%(ratio+1)!==0;
        // Pure red is an internal background-dye marker decoded by the water shader.
        const color=backgroundSegment?[1,0,0] as const:this.palette==="monochrome"?[1,1,1] as const:[.12,.62,1] as const;
        const dyeStrength=40*THREE.MathUtils.lerp(.45,1,Math.min(speed,1))*invScale2;

        const inject=(position:THREE.Vector2,lateralDirection:number,strength:number)=>{
          const gridPositionX=THREE.MathUtils.clamp(1+position.x*this.solver.W,1,this.solver.W);
          // CanvasTexture flips its source vertically when it is uploaded to WebGL.
          // Convert UV-space position and velocity into the canvas/grid coordinate system.
          const gridPositionY=THREE.MathUtils.clamp(1+(1-position.y)*this.solver.H,1,this.solver.H);
          const x0=Math.floor(gridPositionX),y0=Math.floor(gridPositionY);
          const x1=Math.min(this.solver.W,x0+1),y1=Math.min(this.solver.H,y0+1);
          const tx=gridPositionX-x0,ty=gridPositionY-y0;
          const velocity=direction.clone().multiplyScalar(-aftCarry).addScaledVector(side,lateralDirection*strength);
          const samples:[[number,number,number],[number,number,number],[number,number,number],[number,number,number]]=[
            [x0,y0,(1-tx)*(1-ty)],[x1,y0,tx*(1-ty)],[x0,y1,(1-tx)*ty],[x1,y1,tx*ty],
          ];
          for(const [gridX,gridY,weight] of samples){
            if(weight<=.0001)continue;
            this.solver.addVelocity(gridX,gridY,velocity.x*settings.force*invScale2*weight,-velocity.y*settings.force*invScale2*weight,velocityRadius);
            this.solver.addDye(gridX,gridY,color[0]*dyeStrength*weight,color[1]*dyeStrength*weight,color[2]*dyeStrength*weight,dyeRadius);
          }
        };

        inject(stern.clone().addScaledVector(side,HULL_FORCE_HALF_WIDTH*fieldScale),1,leftStrength);
        inject(stern.clone().addScaledVector(side,-HULL_FORCE_HALF_WIDTH*fieldScale),-1,rightStrength);
      }
    }
    this.previousUv=insideField?input.uv.clone():null;

    this.render(settings);
  }

  private applySettings(settings:WakeSettings){
    this.solver.vorticityEps=settings.vorticity;
    this.solver.dyeDecay=settings.dyeDecay;
    this.solver.velocityDecay=settings.drag;
    this.solver.diffusion=settings.viscosity;
    this.cpuRenderer.saturation=settings.saturation;
    this.cpuRenderer.brightness=settings.brightness;
  }

  private render(settings:WakeSettings){
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
    this.solver.reset();this.dyeRenderer?.reset();this.previousUv=null;this.dyeTravel=0;
    this.context.clearRect(0,0,this.outputSize,this.outputSize);this.texture.needsUpdate=true;
  }

  dispose(){this.dyeRenderer?.destroy();this.texture.dispose();}
}
