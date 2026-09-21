import * as THREE from "three";
import type { WakePalette, WakeSettings } from "./WakeSettings";

export type SprayEmitter = {
  position: THREE.Vector3;
  forward: THREE.Vector3;
  speed: number;
  acceleration: number;
  yawRate: number;
};

const vertexShader = /* glsl */`
attribute float aLife;
attribute float aSize;
varying float vLife;
void main(){
  vLife=aLife;
  vec4 mv=modelViewMatrix*vec4(position,1.0);
  gl_PointSize=aSize*(40.0/max(1.0,-mv.z))*clamp(aLife*2.2,0.0,1.0);
  gl_Position=projectionMatrix*mv;
}
`;

const fragmentShader = /* glsl */`
uniform vec3 uColor;
varying float vLife;
void main(){
  vec2 p=gl_PointCoord-0.5;
  float d=length(p)*2.0;
  float alpha=smoothstep(1.0,0.18,d)*smoothstep(0.0,0.22,vLife)*min(1.0,vLife*1.8);
  if(alpha<0.015)discard;
  gl_FragColor=vec4(uColor,alpha*0.62);
}
`;

export class SpraySystem {
  readonly points: THREE.Points;
  private positions: Float32Array;
  private velocities: Float32Array;
  private lives: Float32Array;
  private sizes: Float32Array;
  private cursor=0;
  private emissionRemainder=0;
  private activeLimit:number;
  private side=new THREE.Vector3();

  constructor(private capacity=2400,activeLimit=2400){
    this.activeLimit=Math.min(capacity,activeLimit);
    this.positions=new Float32Array(capacity*3);
    this.velocities=new Float32Array(capacity*3);
    this.lives=new Float32Array(capacity);
    this.sizes=new Float32Array(capacity);
    for(let i=0;i<capacity;i++){this.positions[i*3+1]=-100;this.sizes[i]=6;}
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute("position",new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("aLife",new THREE.BufferAttribute(this.lives,1).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("aSize",new THREE.BufferAttribute(this.sizes,1).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0,capacity);
    const material=new THREE.ShaderMaterial({vertexShader,fragmentShader,transparent:true,depthWrite:false,depthTest:true,blending:THREE.AdditiveBlending,uniforms:{uColor:{value:new THREE.Color(0xf7fbff)}}});
    this.points=new THREE.Points(geometry,material);
    this.points.frustumCulled=false;
  }

  setLimit(value:number){this.activeLimit=Math.min(this.capacity,value);this.cursor%=Math.max(1,this.activeLimit);}
  setPalette(palette:WakePalette){(this.points.material as THREE.ShaderMaterial).uniforms.uColor.value.set(palette==="monochrome"?0xf8fafc:0xd9f3ff);}

  update(dt:number,emitter:SprayEmitter,settings:WakeSettings){
    const drag=Math.exp(-dt*1.45);
    for(let i=0;i<this.capacity;i++){
      if(this.lives[i]<=0)continue;
      const j=i*3;
      this.velocities[j]*=drag; this.velocities[j+1]=this.velocities[j+1]*drag-5.8*dt; this.velocities[j+2]*=drag;
      this.positions[j]+=this.velocities[j]*dt; this.positions[j+1]+=this.velocities[j+1]*dt; this.positions[j+2]+=this.velocities[j+2]*dt;
      this.lives[i]-=dt;
      if(this.positions[j+1]<=0||this.lives[i]<=0){this.lives[i]=0;this.positions[j+1]=-100;}
    }
    const energy=Math.max(0,emitter.speed-.15)+Math.abs(emitter.acceleration)*.18+Math.abs(emitter.yawRate)*.55;
    this.emissionRemainder+=dt*95*settings.sprayAmount*settings.wakeForce*energy;
    const count=Math.min(40,Math.floor(this.emissionRemainder)); this.emissionRemainder-=count;
    this.side.set(-emitter.forward.z,0,emitter.forward.x);
    for(let n=0;n<count;n++)this.emit(emitter,settings,n/count);
    const geometry=this.points.geometry;
    (geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate=true;
    (geometry.getAttribute("aLife") as THREE.BufferAttribute).needsUpdate=true;
    (geometry.getAttribute("aSize") as THREE.BufferAttribute).needsUpdate=true;
  }

  private emit(e:SprayEmitter,settings:WakeSettings,t:number){
    if(this.activeLimit<=0)return;
    const i=this.cursor++%this.activeLimit,j=i*3;
    const bow=t<.28;
    const sign=Math.random()<.5?-1:1;
    const turnSign=Math.sign(e.yawRate)||sign;
    const outsideBoost=sign===turnSign?1+Math.min(1.2,Math.abs(e.yawRate)*.8):1;
    const along=bow?1.25:-.65-Math.random()*.5;
    const lateral=(bow?.28:.55+Math.random()*.5)*sign;
    this.positions[j]=e.position.x+e.forward.x*along+this.side.x*lateral;
    this.positions[j+1]=.16+Math.random()*.12;
    this.positions[j+2]=e.position.z+e.forward.z*along+this.side.z*lateral;
    const outward=(.7+Math.random()*1.2)*outsideBoost*settings.sprayAmount;
    this.velocities[j]=e.forward.x*(e.speed*.42+Math.random()*.4)+this.side.x*outward*sign;
    this.velocities[j+1]=(1.1+Math.random()*2.0)*settings.sprayHeight*(.65+e.speed*.15);
    this.velocities[j+2]=e.forward.z*(e.speed*.42+Math.random()*.4)+this.side.z*outward*sign;
    this.lives[i]=.45+Math.random()*.85;
    this.sizes[i]=4+Math.random()*8;
  }

  dispose(){this.points.geometry.dispose();(this.points.material as THREE.Material).dispose();}
}
