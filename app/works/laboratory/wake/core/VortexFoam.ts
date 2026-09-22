import * as THREE from "three";
import { DyeRenderer } from "../../../Vortex/core/DyeRenderer";
import { FluidSolver } from "../../../Vortex/core/FluidSolver";
import { Renderer } from "../../../Vortex/core/Renderer";
import type { WakePalette, WakeSettings } from "./WakeSettings";

const GRID_SIZE=160;
const OUTPUT_SIZE=768;
const REFERENCE_GRID=144;

export class VortexFoam {
  readonly texture:THREE.CanvasTexture;
  private solver=new FluidSolver(GRID_SIZE,GRID_SIZE);
  private dyeCanvas=document.createElement("canvas");
  private canvas=document.createElement("canvas");
  private context=this.canvas.getContext("2d")!;
  private dyeRenderer=DyeRenderer.create(this.dyeCanvas);
  private cpuRenderer=new Renderer();
  private previousUv:THREE.Vector2|null=null;
  private palette:WakePalette="monochrome";

  constructor(){
    this.canvas.width=OUTPUT_SIZE;this.canvas.height=OUTPUT_SIZE;
    this.dyeRenderer?.resize(this.solver,OUTPUT_SIZE,OUTPUT_SIZE);
    this.texture=new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace=THREE.SRGBColorSpace;
    this.texture.minFilter=THREE.LinearFilter;
    this.texture.magFilter=THREE.LinearFilter;
    this.texture.wrapS=THREE.ClampToEdgeWrapping;
    this.texture.wrapT=THREE.ClampToEdgeWrapping;
  }

  setPalette(palette:WakePalette){this.palette=palette;}

  update(uv:THREE.Vector2,settings:WakeSettings){
    this.solver.vorticityEps=settings.vorticity;
    this.solver.dyeDecay=settings.dyeDecay;
    this.solver.velocityDecay=settings.drag;
    this.solver.diffusion=settings.viscosity;
    this.cpuRenderer.saturation=settings.saturation;
    this.cpuRenderer.brightness=settings.brightness;

    const gridX=Math.max(1,Math.min(this.solver.W,Math.floor(1+uv.x*this.solver.W)));
    const gridY=Math.max(1,Math.min(this.solver.H,Math.floor(1+uv.y*this.solver.H)));
    if(this.previousUv){
      const dx=(uv.x-this.previousUv.x)*OUTPUT_SIZE;
      const dy=(uv.y-this.previousUv.y)*OUTPUT_SIZE;
      const scale=GRID_SIZE/REFERENCE_GRID;
      const invScale2=1/(scale*scale);
      const velocityRadius=Math.max(1,Math.round(4*scale));
      const dyeRadius=Math.max(1,Math.round(3*scale));
      this.solver.addVelocity(gridX,gridY,dx*settings.force*invScale2,dy*settings.force*invScale2,velocityRadius);
      const color=this.palette==="monochrome"?[1,1,1] as const:[.12,.62,1] as const;
      this.solver.addDye(gridX,gridY,color[0]*80*invScale2,color[1]*80*invScale2,color[2]*80*invScale2,dyeRadius);
    }
    this.previousUv=uv.clone();

    this.dyeRenderer?.captureSources(this.solver);
    this.solver.step();
    const gpuRendered=this.dyeRenderer?.render(this.solver,settings.saturation,settings.brightness)??false;
    if(gpuRendered){
      this.context.clearRect(0,0,OUTPUT_SIZE,OUTPUT_SIZE);
      this.context.drawImage(this.dyeCanvas,0,0,OUTPUT_SIZE,OUTPUT_SIZE);
    }else{
      this.cpuRenderer.render(this.context,this.solver.W,this.solver.H,this.solver.W+2,this.solver.dR,this.solver.dG,this.solver.dB,OUTPUT_SIZE,OUTPUT_SIZE);
    }
    if(settings.showVectors)this.cpuRenderer.renderVectors(this.context,this.solver.W,this.solver.H,this.solver.W+2,this.solver.u,this.solver.v,OUTPUT_SIZE,OUTPUT_SIZE);
    this.texture.needsUpdate=true;
  }

  reset(){
    this.solver.reset();this.dyeRenderer?.reset();this.previousUv=null;
    this.context.clearRect(0,0,OUTPUT_SIZE,OUTPUT_SIZE);this.texture.needsUpdate=true;
  }

  dispose(){this.dyeRenderer?.destroy();this.texture.dispose();}
}
