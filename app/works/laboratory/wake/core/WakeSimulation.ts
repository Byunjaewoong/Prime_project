import * as THREE from "three";
import type { WakeSettings } from "./WakeSettings";

export type WakeInput = {
  uv: THREE.Vector2;
  direction: THREE.Vector2;
  speed: number;
  acceleration: number;
  yawRate: number;
  fieldScale?: number;
};

type DoubleTarget = { read: THREE.WebGLRenderTarget; write: THREE.WebGLRenderTarget };

const vertexShader = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const copyFragment = /* glsl */`
uniform sampler2D uTexture; varying vec2 vUv;
void main() { gl_FragColor = texture2D(uTexture, vUv); }
`;

const velocityFragment = /* glsl */`
uniform sampler2D uVelocity;
uniform vec2 uTexel, uBoat, uDirection;
uniform float uDt, uSpeed, uAcceleration, uYawRate, uWakeForce, uFieldScale;
varying vec2 vUv;
float gaussian(vec2 p, vec2 c, vec2 s) { vec2 q=(p-c)/s; return exp(-dot(q,q)*2.4); }
void main() {
  vec2 velocity = texture2D(uVelocity, vUv - texture2D(uVelocity, vUv).xy * uDt * uTexel * 1.45).xy * exp(-uDt * 0.22);
  vec2 side = vec2(-uDirection.y, uDirection.x);
  vec2 delta = vUv - uBoat;
  float ahead = dot(delta, uDirection);
  float across = dot(delta, side);
  vec2 local = vec2(across, ahead);
  float wakeScale=0.6666667*uFieldScale;
  float bow = gaussian(local, vec2(0.0, 0.016)*wakeScale, vec2(0.010, 0.022)*wakeScale);
  float sternL = gaussian(local, vec2(-0.011, -0.020)*wakeScale, vec2(0.012, 0.030)*wakeScale);
  float sternR = gaussian(local, vec2(0.011, -0.020)*wakeScale, vec2(0.012, 0.030)*wakeScale);
  float speedForce = uWakeForce * (0.25 + uSpeed * 0.9 + abs(uAcceleration) * 0.22);
  velocity += uDirection * (bow * 0.28 + (sternL + sternR) * 0.66) * speedForce;
  velocity += side * (sternR - sternL) * speedForce * 0.28;
  velocity += side * (bow + sternL + sternR) * uYawRate * 0.42 * uWakeForce;
  float edge = smoothstep(0.0, 0.045, min(min(vUv.x,1.0-vUv.x),min(vUv.y,1.0-vUv.y)));
  gl_FragColor = vec4(velocity * edge, 0.0, 1.0);
}
`;

const curlFragment = /* glsl */`
uniform sampler2D uVelocity; uniform vec2 uTexel; varying vec2 vUv;
void main() {
  float l=texture2D(uVelocity,vUv-vec2(uTexel.x,0.0)).y;
  float r=texture2D(uVelocity,vUv+vec2(uTexel.x,0.0)).y;
  float b=texture2D(uVelocity,vUv-vec2(0.0,uTexel.y)).x;
  float t=texture2D(uVelocity,vUv+vec2(0.0,uTexel.y)).x;
  gl_FragColor=vec4(0.5*(r-l-b+t),0.0,0.0,1.0);
}
`;

const vorticityFragment = /* glsl */`
uniform sampler2D uVelocity, uCurl; uniform vec2 uTexel; uniform float uDt,uVorticity; varying vec2 vUv;
void main(){
  float l=abs(texture2D(uCurl,vUv-vec2(uTexel.x,0.0)).r);
  float r=abs(texture2D(uCurl,vUv+vec2(uTexel.x,0.0)).r);
  float b=abs(texture2D(uCurl,vUv-vec2(0.0,uTexel.y)).r);
  float t=abs(texture2D(uCurl,vUv+vec2(0.0,uTexel.y)).r);
  vec2 force=0.5*vec2(t-b, -(r-l));
  force/=length(force)+0.0001;
  force*=texture2D(uCurl,vUv).r*uVorticity*0.055;
  gl_FragColor=vec4(texture2D(uVelocity,vUv).xy+force*uDt,0.0,1.0);
}
`;

const divergenceFragment = /* glsl */`
uniform sampler2D uVelocity; uniform vec2 uTexel; varying vec2 vUv;
void main(){
 vec2 l=texture2D(uVelocity,vUv-vec2(uTexel.x,0.0)).xy;
 vec2 r=texture2D(uVelocity,vUv+vec2(uTexel.x,0.0)).xy;
 vec2 b=texture2D(uVelocity,vUv-vec2(0.0,uTexel.y)).xy;
 vec2 t=texture2D(uVelocity,vUv+vec2(0.0,uTexel.y)).xy;
 gl_FragColor=vec4(0.5*(r.x-l.x+t.y-b.y),0.0,0.0,1.0);
}
`;

const pressureFragment = /* glsl */`
uniform sampler2D uPressure,uDivergence; uniform vec2 uTexel; varying vec2 vUv;
void main(){
 float l=texture2D(uPressure,vUv-vec2(uTexel.x,0.0)).r;
 float r=texture2D(uPressure,vUv+vec2(uTexel.x,0.0)).r;
 float b=texture2D(uPressure,vUv-vec2(0.0,uTexel.y)).r;
 float t=texture2D(uPressure,vUv+vec2(0.0,uTexel.y)).r;
 float d=texture2D(uDivergence,vUv).r;
 gl_FragColor=vec4((l+r+b+t-d)*0.25,0.0,0.0,1.0);
}
`;

const gradientFragment = /* glsl */`
uniform sampler2D uPressure,uVelocity; uniform vec2 uTexel; varying vec2 vUv;
void main(){
 float l=texture2D(uPressure,vUv-vec2(uTexel.x,0.0)).r;
 float r=texture2D(uPressure,vUv+vec2(uTexel.x,0.0)).r;
 float b=texture2D(uPressure,vUv-vec2(0.0,uTexel.y)).r;
 float t=texture2D(uPressure,vUv+vec2(0.0,uTexel.y)).r;
 vec2 velocity=texture2D(uVelocity,vUv).xy-0.5*vec2(r-l,t-b);
 gl_FragColor=vec4(velocity,0.0,1.0);
}
`;

const stateFragment = /* glsl */`
uniform sampler2D uState;
uniform vec2 uTexel,uBoat,uDirection;
uniform float uDt,uSpeed,uAcceleration,uYawRate,uWakeForce,uFieldScale;
varying vec2 vUv;
float gaussian(vec2 p, vec2 c, vec2 s){vec2 q=(p-c)/s;return exp(-dot(q,q)*2.5);}
void main(){
 vec4 center=texture2D(uState,vUv);
 float l=texture2D(uState,vUv-vec2(uTexel.x,0.0)).r;
 float r=texture2D(uState,vUv+vec2(uTexel.x,0.0)).r;
 float b=texture2D(uState,vUv-vec2(0.0,uTexel.y)).r;
 float t=texture2D(uState,vUv+vec2(0.0,uTexel.y)).r;
 float lap=l+r+b+t-4.0*center.r;
 float vertical=(center.g+lap*uDt*26.0)*exp(-uDt*1.25);
 float height=center.r+vertical*uDt;
 vec2 side=vec2(-uDirection.y,uDirection.x);
 vec2 delta=vUv-uBoat;
 vec2 local=vec2(dot(delta,side),dot(delta,uDirection));
 float wakeScale=0.6666667*uFieldScale;
 float bow=gaussian(local,vec2(0.0,0.018)*wakeScale,vec2(0.011,0.020)*wakeScale);
 float sternL=gaussian(local,vec2(-0.013,-0.024)*wakeScale,vec2(0.012,0.030)*wakeScale);
 float sternR=gaussian(local,vec2(0.013,-0.024)*wakeScale,vec2(0.012,0.030)*wakeScale);
 float hull=gaussian(local,vec2(0.0,-0.002)*wakeScale,vec2(0.010,0.030)*wakeScale);
 vertical += (bow*1.65-(sternL+sternR)*0.48-hull*0.32)*uWakeForce*(0.25+uSpeed)*uDt;
 vertical += (sternR-sternL)*uYawRate*uWakeForce*uDt*0.8;
 float edge=smoothstep(0.0,0.05,min(min(vUv.x,1.0-vUv.x),min(vUv.y,1.0-vUv.y)));
 gl_FragColor=vec4(height*edge,vertical*edge,0.0,1.0);
}
`;

function target(size: number) {
  return new THREE.WebGLRenderTarget(size, size, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
  });
}

function pair(size: number): DoubleTarget { return { read: target(size), write: target(size) }; }
function swap(value: DoubleTarget) { const old=value.read; value.read=value.write; value.write=old; }

export class WakeSimulation {
  readonly supported: boolean;
  private size: number;
  private velocity!: DoubleTarget;
  private state!: DoubleTarget;
  private pressure!: DoubleTarget;
  private divergence!: THREE.WebGLRenderTarget;
  private curl!: THREE.WebGLRenderTarget;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  private quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private copy = this.material(copyFragment,{uTexture:{value:null}});
  private velocityMaterial = this.material(velocityFragment,{});
  private curlMaterial = this.material(curlFragment,{});
  private vorticityMaterial = this.material(vorticityFragment,{});
  private divergenceMaterial = this.material(divergenceFragment,{});
  private pressureMaterial = this.material(pressureFragment,{});
  private gradientMaterial = this.material(gradientFragment,{});
  private stateMaterial = this.material(stateFragment,{});
  private fallbackTexture: THREE.DataTexture;

  constructor(private renderer: THREE.WebGLRenderer, size: number) {
    this.size=size;
    this.supported=renderer.capabilities.isWebGL2 && renderer.extensions.has("EXT_color_buffer_float");
    this.fallbackTexture=new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1,THREE.RGBAFormat);
    this.fallbackTexture.needsUpdate=true;
    this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.copy);
    this.scene.add(this.quad);
    if(this.supported) this.allocate(size);
  }

  get stateTexture(){return this.supported?this.state.read.texture:this.fallbackTexture;}
  get velocityTexture(){return this.supported?this.velocity.read.texture:this.fallbackTexture;}
  get resolution(){return this.size;}

  private material(fragmentShader:string,uniforms:Record<string,THREE.IUniform>) {
    return new THREE.ShaderMaterial({vertexShader,fragmentShader,uniforms,depthTest:false,depthWrite:false,blending:THREE.NoBlending});
  }
  private allocate(size:number){
    this.size=size; this.velocity=pair(size); this.state=pair(size); this.pressure=pair(size);
    this.divergence=target(size); this.curl=target(size);
    [this.velocity.read,this.velocity.write,this.state.read,this.state.write,this.pressure.read,this.pressure.write,this.divergence,this.curl].forEach(t=>this.clear(t));
  }
  private clear(rt:THREE.WebGLRenderTarget){
    const old=this.renderer.getRenderTarget(); const color=this.renderer.getClearColor(new THREE.Color()); const alpha=this.renderer.getClearAlpha();
    this.renderer.setRenderTarget(rt); this.renderer.setClearColor(0,0); this.renderer.clear();
    this.renderer.setClearColor(color,alpha); this.renderer.setRenderTarget(old);
  }
  private run(material:THREE.ShaderMaterial,output:THREE.WebGLRenderTarget){
    const old=this.renderer.getRenderTarget(); this.quad.material=material; this.renderer.setRenderTarget(output); this.renderer.render(this.scene,this.camera); this.renderer.setRenderTarget(old);
  }
  private setCommon(material:THREE.ShaderMaterial){ material.uniforms.uTexel={value:new THREE.Vector2(1/this.size,1/this.size)}; }

  step(dt:number,input:WakeInput,settings:WakeSettings,pressureIterations:number){
    if(!this.supported)return;
    dt=Math.min(dt,1/30);
    const boat=input.uv, direction=input.direction,fieldScale=input.fieldScale??1;
    Object.assign(this.velocityMaterial.uniforms,{uVelocity:{value:this.velocity.read.texture},uTexel:{value:new THREE.Vector2(1/this.size,1/this.size)},uBoat:{value:boat},uDirection:{value:direction},uDt:{value:dt},uSpeed:{value:input.speed},uAcceleration:{value:input.acceleration},uYawRate:{value:input.yawRate},uWakeForce:{value:settings.wakeForce},uFieldScale:{value:fieldScale}});
    this.run(this.velocityMaterial,this.velocity.write); swap(this.velocity);
    Object.assign(this.curlMaterial.uniforms,{uVelocity:{value:this.velocity.read.texture}}); this.setCommon(this.curlMaterial); this.run(this.curlMaterial,this.curl);
    Object.assign(this.vorticityMaterial.uniforms,{uVelocity:{value:this.velocity.read.texture},uCurl:{value:this.curl.texture},uDt:{value:dt},uVorticity:{value:settings.vorticity}}); this.setCommon(this.vorticityMaterial); this.run(this.vorticityMaterial,this.velocity.write); swap(this.velocity);
    Object.assign(this.divergenceMaterial.uniforms,{uVelocity:{value:this.velocity.read.texture}}); this.setCommon(this.divergenceMaterial); this.run(this.divergenceMaterial,this.divergence);
    this.clear(this.pressure.read);
    for(let i=0;i<pressureIterations;i++){
      Object.assign(this.pressureMaterial.uniforms,{uPressure:{value:this.pressure.read.texture},uDivergence:{value:this.divergence.texture}}); this.setCommon(this.pressureMaterial); this.run(this.pressureMaterial,this.pressure.write); swap(this.pressure);
    }
    Object.assign(this.gradientMaterial.uniforms,{uPressure:{value:this.pressure.read.texture},uVelocity:{value:this.velocity.read.texture}}); this.setCommon(this.gradientMaterial); this.run(this.gradientMaterial,this.velocity.write); swap(this.velocity);
    Object.assign(this.stateMaterial.uniforms,{uState:{value:this.state.read.texture},uTexel:{value:new THREE.Vector2(1/this.size,1/this.size)},uBoat:{value:boat},uDirection:{value:direction},uDt:{value:dt},uSpeed:{value:input.speed},uAcceleration:{value:input.acceleration},uYawRate:{value:input.yawRate},uWakeForce:{value:settings.wakeForce},uFieldScale:{value:fieldScale}});
    this.run(this.stateMaterial,this.state.write); swap(this.state);
  }

  setResolution(size:number){
    if(!this.supported||size===this.size)return;
    const oldVelocity=this.velocity,oldState=this.state,oldPressure=this.pressure,oldDiv=this.divergence,oldCurl=this.curl;
    this.allocate(size);
    const copyTo=(texture:THREE.Texture,dest:DoubleTarget)=>{this.copy.uniforms.uTexture.value=texture;this.run(this.copy,dest.read);this.run(this.copy,dest.write);};
    copyTo(oldVelocity.read.texture,this.velocity); copyTo(oldState.read.texture,this.state);
    [...Object.values(oldVelocity),...Object.values(oldState),...Object.values(oldPressure),oldDiv,oldCurl].forEach(t=>t.dispose());
  }

  dispose(){
    if(this.supported)[...Object.values(this.velocity),...Object.values(this.state),...Object.values(this.pressure),this.divergence,this.curl].forEach(t=>t.dispose());
    [this.copy,this.velocityMaterial,this.curlMaterial,this.vorticityMaterial,this.divergenceMaterial,this.pressureMaterial,this.gradientMaterial,this.stateMaterial].forEach(m=>m.dispose());
    this.quad.geometry.dispose(); this.fallbackTexture.dispose();
  }
}
