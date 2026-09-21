import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { SpraySystem } from "./SpraySystem";
import { WakeSimulation, type WakeInput } from "./WakeSimulation";
import { DEFAULT_WAKE_SETTINGS, QUALITY_PRESETS, resolveInitialQuality, type ResolvedWakeQuality, type WakeSettings } from "./WakeSettings";

const WORLD_SIZE=48;
const BOAT_LENGTH=2.8;
// The supplied boat points 90 degrees away from this work's +Z forward axis.
const BOAT_MODEL_YAW_CORRECTION=Math.PI/2;

const surfaceVertex=/* glsl */`
uniform sampler2D uState;
uniform float uWaveHeight,uTime;
varying vec2 vUv;
varying vec3 vWorldPosition;
void main(){
 vUv=uv;
 float h=texture2D(uState,uv).r*5.5*uWaveHeight;
 h+=(sin(position.x*.92+uTime*.75)+sin(position.y*1.27-uTime*.56))*.010*uWaveHeight;
 vec3 transformed=position;
 transformed.z+=h;
 vec4 world=modelMatrix*vec4(transformed,1.0);
 vWorldPosition=world.xyz;
 gl_Position=projectionMatrix*viewMatrix*world;
}
`;

const surfaceFragment=/* glsl */`
uniform sampler2D uState,uVelocity;
uniform vec2 uTexel;
uniform float uWaveHeight,uTime;
uniform vec3 uDeepColor,uShallowColor,uFoamColor;
varying vec2 vUv;
varying vec3 vWorldPosition;
void main(){
 float l=texture2D(uState,vUv-vec2(uTexel.x,0.0)).r;
 float r=texture2D(uState,vUv+vec2(uTexel.x,0.0)).r;
 float b=texture2D(uState,vUv-vec2(0.0,uTexel.y)).r;
 float t=texture2D(uState,vUv+vec2(0.0,uTexel.y)).r;
 vec3 normal=normalize(vec3((l-r)*38.0*uWaveHeight,1.0,(b-t)*38.0*uWaveHeight));
 vec3 viewDir=normalize(cameraPosition-vWorldPosition);
 vec3 lightDir=normalize(vec3(-.45,.88,.32));
 float fresnel=pow(1.0-max(dot(viewDir,normal),0.0),3.2);
 float diffuse=.2+.8*max(dot(normal,lightDir),0.0);
 float spec=pow(max(dot(reflect(-lightDir,normal),viewDir),0.0),95.0);
 vec2 velocity=texture2D(uVelocity,vUv).xy;
 float micro=.5+.5*sin((vUv.x*960.0+vUv.y*730.0)+uTime*1.7+length(velocity)*16.0);
 float phase=vWorldPosition.z*4.7+vWorldPosition.x*.62+sin(vWorldPosition.x*.47)*1.45+sin(vWorldPosition.z*.31)*.58-uTime*.34;
 float ridge=smoothstep(.88,.995,sin(phase));
 float crossRidge=smoothstep(.94,.999,sin(vWorldPosition.x*5.8-vWorldPosition.z*.36+sin(vWorldPosition.z*.62)-uTime*.22));
 float glint=smoothstep(.82,.995,spec+micro*.07)*.72+ridge*(.055+fresnel*.28)+crossRidge*.018;
 float foam=texture2D(uState,vUv).b;
 foam=smoothstep(.08,.82,foam)*(0.76+micro*.24);
 vec3 water=mix(uDeepColor,uShallowColor,clamp(fresnel*.72+diffuse*.18,0.0,1.0));
 water+=vec3(spec*1.15+glint);
 water=mix(water,uFoamColor,foam*.96);
 gl_FragColor=vec4(water,1.0);
}
`;

function disposeObject(root:THREE.Object3D){
  root.traverse(object=>{
    const mesh=object as THREE.Mesh;
    mesh.geometry?.dispose();
    if(mesh.material){const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];materials.forEach(material=>{const record=material as unknown as Record<string,unknown>;Object.values(record).forEach(value=>{if(value instanceof THREE.Texture)value.dispose();});material.dispose();});}
  });
}

function shortestAngle(value:number){return Math.atan2(Math.sin(value),Math.cos(value));}

export class WakeApp {
  private renderer:THREE.WebGLRenderer;
  private scene=new THREE.Scene();
  private camera=new THREE.PerspectiveCamera(45,1,.1,120);
  private clock=new THREE.Clock();
  private frame=0;
  private destroyed=false;
  private simulation:WakeSimulation;
  private surface!:THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>;
  private spray:SpraySystem;
  private boat=new THREE.Group();
  private boatVisual=new THREE.Group();
  private fallbackBoat:THREE.Group;
  private settings={...DEFAULT_WAKE_SETTINGS};
  private resolvedQuality:ResolvedWakeQuality;
  private position=new THREE.Vector3(0,0,1);
  private forward=new THREE.Vector3(0,0,1);
  private heading=0;
  private speed=2.6;
  private acceleration=0;
  private yawRate=0;
  private autoTarget=new THREE.Vector3(6,0,8);
  private pointerTarget:THREE.Vector3|null=null;
  private autoTargetAge=0;
  private raycaster=new THREE.Raycaster();
  private pointer=new THREE.Vector2();
  private waterPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
  private frameSamples:number[]=[];
  private elapsed=0;
  private fallbackTrail:THREE.Line;

  constructor(private canvas:HTMLCanvasElement,modelUrl="/boat.glb"){
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:"high-performance"});
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.08;
    this.scene.background=new THREE.Color(0x060708);
    this.camera.position.set(0,27,20);
    this.camera.lookAt(0,0,1.5);
    this.resolvedQuality=resolveInitialQuality();
    const preset=QUALITY_PRESETS[this.resolvedQuality];
    this.simulation=new WakeSimulation(this.renderer,preset.simulation);
    this.spray=new SpraySystem(2400,preset.particles);
    this.scene.add(this.spray.points);
    this.createSurface(preset.surfaceSegments);
    this.fallbackBoat=this.createFallbackBoat();
    this.boatVisual.add(this.fallbackBoat);
    this.boat.add(this.boatVisual);
    this.boat.position.copy(this.position);
    this.scene.add(this.boat);
    this.loadBoat(modelUrl);
    this.addLights();
    const trailGeometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]);
    this.fallbackTrail=new THREE.LineSegments(trailGeometry,new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.58}));
    this.fallbackTrail.visible=!this.simulation.supported;
    this.scene.add(this.fallbackTrail);
    this.applyPalette();
    this.resize();
    this.frame=requestAnimationFrame(this.animate);
  }

  private addLights(){
    this.scene.add(new THREE.HemisphereLight(0xdde8f1,0x071019,1.8));
    const sun=new THREE.DirectionalLight(0xffffff,3.2);sun.position.set(-10,22,9);this.scene.add(sun);
  }

  private createSurface(segments:number){
    const old=this.surface;
    const geometry=new THREE.PlaneGeometry(WORLD_SIZE,WORLD_SIZE,segments,segments);
    const material=old?.material??new THREE.ShaderMaterial({vertexShader:surfaceVertex,fragmentShader:surfaceFragment,side:THREE.DoubleSide,uniforms:{uState:{value:this.simulation.stateTexture},uVelocity:{value:this.simulation.velocityTexture},uTexel:{value:new THREE.Vector2(1/this.simulation.resolution,1/this.simulation.resolution)},uWaveHeight:{value:this.settings.waveHeight},uTime:{value:0},uDeepColor:{value:new THREE.Color()},uShallowColor:{value:new THREE.Color()},uFoamColor:{value:new THREE.Color()}}});
    const surface=new THREE.Mesh(geometry,material);surface.rotation.x=-Math.PI/2;surface.position.y=-.03;surface.receiveShadow=true;
    if(old){this.scene.remove(old);old.geometry.dispose();}
    this.surface=surface;this.scene.add(surface);
  }

  private createFallbackBoat(){
    const group=new THREE.Group();
    const shape=new THREE.Shape();
    shape.moveTo(0,1.45);shape.quadraticCurveTo(.68,.65,.6,-1.15);shape.quadraticCurveTo(0,-1.38,-.6,-1.15);shape.quadraticCurveTo(-.68,.65,0,1.45);
    const hullGeometry=new THREE.ExtrudeGeometry(shape,{depth:.32,bevelEnabled:true,bevelSize:.08,bevelThickness:.08,bevelSegments:3});
    hullGeometry.rotateX(Math.PI/2);hullGeometry.center();
    const hull=new THREE.Mesh(hullGeometry,new THREE.MeshStandardMaterial({color:0xf4f4f1,roughness:.34,metalness:.05}));hull.position.y=.23;group.add(hull);
    const cockpit=new THREE.Mesh(new THREE.CapsuleGeometry(.31,.72,5,12),new THREE.MeshStandardMaterial({color:0x11171a,roughness:.22,metalness:.3}));cockpit.rotation.x=Math.PI/2;cockpit.position.set(0,.54,-.18);cockpit.scale.set(1,.55,1);group.add(cockpit);
    return group;
  }

  private loadBoat(url:string){
    new GLTFLoader().load(url,gltf=>{
      if(this.destroyed){disposeObject(gltf.scene);return;}
      const model=gltf.scene;
      model.rotation.y=BOAT_MODEL_YAW_CORRECTION;
      model.updateMatrixWorld(true);
      let box=new THREE.Box3().setFromObject(model);const size=box.getSize(new THREE.Vector3());
      const scale=BOAT_LENGTH/Math.max(size.x,size.z,.001);model.scale.setScalar(scale);model.updateMatrixWorld(true);
      box=new THREE.Box3().setFromObject(model);const center=box.getCenter(new THREE.Vector3());
      model.position.x-=center.x;model.position.z-=center.z;model.position.y-=box.min.y;
      model.traverse(object=>{const mesh=object as THREE.Mesh;if(mesh.isMesh){mesh.castShadow=true;mesh.receiveShadow=true;}});
      this.boatVisual.remove(this.fallbackBoat);disposeObject(this.fallbackBoat);this.boatVisual.add(model);
    },undefined,()=>{/* The procedural boat remains visible if the asset cannot load. */});
  }

  setSettings(partial:Partial<WakeSettings>){
    const previousQuality=this.settings.quality;Object.assign(this.settings,partial);
    if(partial.palette)this.applyPalette();
    if(partial.waveHeight!==undefined)this.surface.material.uniforms.uWaveHeight.value=partial.waveHeight;
    if(partial.quality&&partial.quality!==previousQuality){const next=partial.quality==="auto"?resolveInitialQuality():partial.quality;this.applyQuality(next);}
  }

  private applyPalette(){
    const mono=this.settings.palette==="monochrome";const uniforms=this.surface.material.uniforms;
    uniforms.uDeepColor.value.set(mono?0x030506:0x031423);uniforms.uShallowColor.value.set(mono?0x293136:0x164c6b);uniforms.uFoamColor.value.set(mono?0xf4f6f7:0xdff7ff);
    (this.scene.background as THREE.Color).set(mono?0x060708:0x020e18);this.spray.setPalette(this.settings.palette);
  }

  private applyQuality(next:ResolvedWakeQuality){
    if(next===this.resolvedQuality)return;this.resolvedQuality=next;const preset=QUALITY_PRESETS[next];
    this.simulation.setResolution(preset.simulation);this.createSurface(preset.surfaceSegments);this.spray.setLimit(preset.particles);this.applyPalette();
  }

  setPointerTarget(clientX:number,clientY:number){
    const rect=this.canvas.getBoundingClientRect();this.pointer.set((clientX-rect.left)/rect.width*2-1,-((clientY-rect.top)/rect.height)*2+1);
    this.raycaster.setFromCamera(this.pointer,this.camera);const hit=new THREE.Vector3();
    if(this.raycaster.ray.intersectPlane(this.waterPlane,hit)){hit.x=THREE.MathUtils.clamp(hit.x,-19,19);hit.z=THREE.MathUtils.clamp(hit.z,-19,19);this.pointerTarget=hit;}
  }
  clearPointerTarget(){this.pointerTarget=null;this.autoTarget.copy(this.position).addScaledVector(this.forward,7);this.autoTargetAge=0;}

  resize(){
    const width=Math.max(1,this.canvas.clientWidth),height=Math.max(1,this.canvas.clientHeight);const mobile=window.matchMedia("(pointer: coarse)").matches||width<760;
    this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,mobile?1.25:1.75));this.renderer.setSize(width,height,false);
  }

  private updateBoat(dt:number,time:number){
    this.autoTargetAge+=dt;
    if(!this.pointerTarget&&(this.position.distanceTo(this.autoTarget)<2.2||this.autoTargetAge>7.5)){
      const angle=Math.random()*Math.PI*2,radius=5+Math.random()*10;this.autoTarget.set(Math.sin(angle)*radius,0,Math.cos(angle)*radius);this.autoTargetAge=0;
    }
    const target=this.pointerTarget??this.autoTarget;
    const desired=target.clone().sub(this.position);
    const edge=Math.max(Math.abs(this.position.x),Math.abs(this.position.z));
    if(edge>14)desired.lerp(this.position.clone().multiplyScalar(-1),THREE.MathUtils.smoothstep(edge,14,20));
    const desiredHeading=Math.atan2(desired.x,desired.z);const error=shortestAngle(desiredHeading-this.heading);
    const previousHeading=this.heading;const maxTurn=(.62+Math.min(.7,Math.abs(error)))*dt;this.heading+=THREE.MathUtils.clamp(error*.86*dt,-maxTurn,maxTurn);
    this.yawRate=shortestAngle(this.heading-previousHeading)/Math.max(dt,.001);
    const targetSpeed=3.15*this.settings.cruiseSpeed*(1-.24*Math.min(1,Math.abs(error)));
    const oldSpeed=this.speed;this.speed=THREE.MathUtils.damp(this.speed,targetSpeed,1.35,dt);this.acceleration=(this.speed-oldSpeed)/Math.max(dt,.001);
    this.forward.set(Math.sin(this.heading),0,Math.cos(this.heading));this.position.addScaledVector(this.forward,this.speed*dt);
    this.position.x=THREE.MathUtils.clamp(this.position.x,-20,20);this.position.z=THREE.MathUtils.clamp(this.position.z,-20,20);
    this.boat.position.set(this.position.x,.12+Math.sin(time*2.1)*.025,this.position.z);this.boat.rotation.y=this.heading;
    this.boat.rotation.z=THREE.MathUtils.damp(this.boat.rotation.z,-this.yawRate*.10,3.2,dt);this.boat.rotation.x=THREE.MathUtils.damp(this.boat.rotation.x,-this.acceleration*.025+Math.sin(time*2.1)*.012,2.8,dt);
  }

  private updateFallbackTrail(){
    if(!this.fallbackTrail.visible)return;const side=new THREE.Vector3(-this.forward.z,0,this.forward.x);
    const points=[this.position.clone().addScaledVector(side,.55),this.position.clone().addScaledVector(side,4).addScaledVector(this.forward,-9),this.position.clone().addScaledVector(side,-.55),this.position.clone().addScaledVector(side,-4).addScaledVector(this.forward,-9)];
    this.fallbackTrail.geometry.setFromPoints(points);this.fallbackTrail.geometry.setDrawRange(0,4);
  }

  private animate=(now:number)=>{
    if(this.destroyed)return;const rawDt=this.clock.getDelta(),dt=Math.min(rawDt,.034),time=now*.001;this.elapsed+=rawDt;
    this.updateBoat(dt,time);
    const uv=new THREE.Vector2(this.position.x/WORLD_SIZE+.5,.5-this.position.z/WORLD_SIZE);const direction=new THREE.Vector2(this.forward.x,-this.forward.z).normalize();
    const input:WakeInput={uv,direction,speed:this.speed/3.2,acceleration:this.acceleration/3,yawRate:this.yawRate};
    this.simulation.step(dt,input,this.settings,QUALITY_PRESETS[this.resolvedQuality].pressureIterations);
    const uniforms=this.surface.material.uniforms;uniforms.uState.value=this.simulation.stateTexture;uniforms.uVelocity.value=this.simulation.velocityTexture;uniforms.uTexel.value.setScalar(1/this.simulation.resolution);uniforms.uTime.value=time;uniforms.uWaveHeight.value=this.settings.waveHeight;
    this.spray.update(dt,{position:this.position,forward:this.forward,speed:this.speed/3.2,acceleration:this.acceleration/3,yawRate:this.yawRate},this.settings);
    this.updateFallbackTrail();this.renderer.render(this.scene,this.camera);this.monitorQuality(rawDt);this.frame=requestAnimationFrame(this.animate);
  };

  private monitorQuality(dt:number){
    if(this.settings.quality!=="auto"||this.elapsed<4)return;this.frameSamples.push(dt);const span=this.frameSamples.reduce((a,b)=>a+b,0);if(span<2.5)return;
    const fps=this.frameSamples.length/span;this.frameSamples=[];const mobile=window.matchMedia("(pointer: coarse)").matches||window.innerWidth<760;
    if(fps<(mobile?27:44)){if(this.resolvedQuality==="high"){this.applyQuality("medium");this.elapsed=0;}else if(this.resolvedQuality==="medium"){this.applyQuality("low");this.elapsed=0;}}
  }

  destroy(){
    this.destroyed=true;cancelAnimationFrame(this.frame);this.simulation.dispose();this.spray.dispose();this.surface.geometry.dispose();this.surface.material.dispose();disposeObject(this.boat);this.fallbackTrail.geometry.dispose();(this.fallbackTrail.material as THREE.Material).dispose();this.renderer.dispose();
  }
}
