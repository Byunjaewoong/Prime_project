import * as THREE from "three";

export type ReflectionImpulse={uv:THREE.Vector2;direction:THREE.Vector2;intensity:number;color:THREE.Color};

const SAMPLE_SIZE=36;
const MAX_IMPULSES=7;

const vertexShader=/* glsl */`
varying vec2 vUv;
void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}
`;

const fragmentShader=/* glsl */`
uniform sampler2D uState;
uniform vec2 uTexel;
uniform float uWaveHeight,uTime,uWorldSize;
uniform vec3 uCameraPosition;
varying vec2 vUv;
float hash21(vec2 p){
 p=fract(p*vec2(123.34,456.21));
 p+=dot(p,p+45.32);
 return fract(p.x*p.y);
}
float valueNoise(vec2 p){
 vec2 i=floor(p),f=fract(p);
 f=f*f*(3.0-2.0*f);
 return mix(mix(hash21(i),hash21(i+vec2(1.0,0.0)),f.x),mix(hash21(i+vec2(0.0,1.0)),hash21(i+vec2(1.0,1.0)),f.x),f.y);
}
float waterNoise(vec2 p){
 float value=.0;
 value+=valueNoise(p)*.55;
 p=mat2(1.6,-1.2,1.2,1.6)*p+3.7;
 value+=valueNoise(p)*.28;
 p=mat2(1.7,-1.1,1.1,1.7)*p+7.1;
 value+=valueNoise(p)*.17;
 return value;
}
float detailWave(vec2 p){
 return sin(p.x*.43+p.y*.71+uTime*.42)*.030
       +sin(p.x*1.17-p.y*.64-uTime*.57)*.014
       +sin((p.x+p.y)*2.15+uTime*.31)*.006;
}
void main(){
 vec2 sampleUv=clamp(vUv,uTexel,1.0-uTexel);
 float l=texture2D(uState,clamp(sampleUv-vec2(uTexel.x,0.0),uTexel,1.0-uTexel)).r;
 float r=texture2D(uState,clamp(sampleUv+vec2(uTexel.x,0.0),uTexel,1.0-uTexel)).r;
 float b=texture2D(uState,clamp(sampleUv-vec2(0.0,uTexel.y),uTexel,1.0-uTexel)).r;
 float t=texture2D(uState,clamp(sampleUv+vec2(0.0,uTexel.y),uTexel,1.0-uTexel)).r;
 vec2 world=vec2((vUv.x-.5)*uWorldSize,(.5-vUv.y)*uWorldSize);
 float eps=.08;
 float waveL=detailWave(world-vec2(eps,0.0));
 float waveR=detailWave(world+vec2(eps,0.0));
 float waveB=detailWave(world-vec2(0.0,eps));
 float waveT=detailWave(world+vec2(0.0,eps));
 float edge=min(min(vUv.x,1.0-vUv.x),min(vUv.y,1.0-vUv.y));
 float mask=smoothstep(0.0,.075,edge);
 vec3 normal=normalize(vec3(((l-r)*48.0*mask+(waveL-waveR)*4.5)*uWaveHeight,1.0,((b-t)*48.0*mask+(waveB-waveT)*4.5)*uWaveHeight));
 vec3 viewDir=normalize(uCameraPosition-vec3(world.x,0.0,world.y));
 vec3 lightDir=normalize(vec3(-.45,.88,.32));
 vec3 reflected=reflect(-lightDir,normal);
 float reflection=max(dot(reflected,viewDir),0.0);
 float fresnel=pow(1.0-max(dot(viewDir,normal),0.0),3.2);
 float grain=hash21(floor(world*18.0)+floor(uTime*3.0));
 float broadNoise=waterNoise(world*.19+vec2(uTime*.018,-uTime*.012));
 float fineNoise=waterNoise(world*.73+vec2(-uTime*.035,uTime*.026));
 float waterTexture=clamp(broadNoise*.68+fineNoise*.32,0.0,1.0);
 float sparkle=pow(reflection,180.0)*smoothstep(.58,1.0,grain);
 sparkle+=smoothstep(.82,.98,waterTexture)*(.018+fresnel*.045);
 float reflectedWhite=pow(reflection,72.0)*1.35+sparkle*1.8+waterTexture*.026;
 float intensity=smoothstep(.018,.085,reflectedWhite)*mask;
 vec2 direction=normalize(vec2(reflected.x,-reflected.z)+vec2(.0001));
 gl_FragColor=vec4(intensity,direction*.5+.5,1.0);
}
`;

export class ReflectionForceField{
  private target=new THREE.WebGLRenderTarget(SAMPLE_SIZE,SAMPLE_SIZE,{format:THREE.RGBAFormat,type:THREE.UnsignedByteType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:false,stencilBuffer:false});
  private scene=new THREE.Scene();
  private camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  private material=new THREE.ShaderMaterial({vertexShader,fragmentShader,depthTest:false,depthWrite:false,uniforms:{uState:{value:null},uTexel:{value:new THREE.Vector2()},uWaveHeight:{value:1},uTime:{value:0},uWorldSize:{value:72},uCameraPosition:{value:new THREE.Vector3()}}});
  private quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material);
  private pixels=new Uint8Array(SAMPLE_SIZE*SAMPLE_SIZE*4);
  private frame=0;
  private cached:ReflectionImpulse[]=[];

  constructor(private renderer:THREE.WebGLRenderer){this.scene.add(this.quad);}

  sample(state:THREE.Texture,texel:number,waveHeight:number,time:number,cameraPosition:THREE.Vector3){
    if(this.frame++%3!==0)return this.cached;
    this.material.uniforms.uState.value=state;
    this.material.uniforms.uTexel.value.setScalar(texel);
    this.material.uniforms.uWaveHeight.value=waveHeight;
    this.material.uniforms.uTime.value=time;
    this.material.uniforms.uCameraPosition.value.copy(cameraPosition);
    const previous=this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.target);this.renderer.render(this.scene,this.camera);this.renderer.readRenderTargetPixels(this.target,0,0,SAMPLE_SIZE,SAMPLE_SIZE,this.pixels);this.renderer.setRenderTarget(previous);

    const candidates:ReflectionImpulse[]=[];
    for(let y=1;y<SAMPLE_SIZE-1;y++)for(let x=1;x<SAMPLE_SIZE-1;x++){
      const offset=(y*SAMPLE_SIZE+x)*4;const raw=this.pixels[offset]/255;
      if(raw<.08)continue;
      const left=this.pixels[offset-4],right=this.pixels[offset+4],down=this.pixels[offset-SAMPLE_SIZE*4],up=this.pixels[offset+SAMPLE_SIZE*4];
      if(this.pixels[offset]<Math.max(left,right,down,up))continue;
      const intensity=THREE.MathUtils.smoothstep(raw,.08,.92);
      const direction=new THREE.Vector2(this.pixels[offset+1]/127.5-1,this.pixels[offset+2]/127.5-1).normalize();
      const whiteness=THREE.MathUtils.lerp(.7,1,intensity);
      candidates.push({uv:new THREE.Vector2((x+.5)/SAMPLE_SIZE,(y+.5)/SAMPLE_SIZE),direction,intensity,color:new THREE.Color(whiteness,whiteness,whiteness)});
    }
    candidates.sort((a,b)=>b.intensity-a.intensity);
    this.cached=[];
    for(const candidate of candidates){
      if(this.cached.every(existing=>existing.uv.distanceToSquared(candidate.uv)>.0025)){this.cached.push(candidate);if(this.cached.length===MAX_IMPULSES)break;}
    }
    return this.cached;
  }

  dispose(){this.target.dispose();this.material.dispose();this.quad.geometry.dispose();}
}
