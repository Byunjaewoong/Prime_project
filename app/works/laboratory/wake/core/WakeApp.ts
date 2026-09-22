import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { SpraySystem } from "./SpraySystem";
import { VortexFoam } from "./VortexFoam";
import { WakeSimulation, type WakeInput } from "./WakeSimulation";
import { DEFAULT_WAKE_SETTINGS, QUALITY_PRESETS, WAKE2_DEFAULT_SETTINGS, resolveInitialQuality, type ResolvedWakeQuality, type WakeSettings } from "./WakeSettings";

const WORLD_SIZE=72;
const BOAT_LENGTH=2.8;
const WAKE2_RESPAWN_DELAY=3;
const ROUTE_SCREEN_MARGIN=.12;
const ROUTE_SAMPLE_COUNT=240;
const WAKE2_SIMULATION_RESOLUTION:Record<ResolvedWakeQuality,number>={high:512,medium:256,low:192};
// Three.js uses Y as the vertical axis (the water plane spans X/Z).
const BOAT_WATERLINE_HEIGHT=.12;
// The GLB's longitudinal axis is X; rotate it onto the study's Z-forward axis.
const BOAT_MODEL_YAW_CORRECTION=Math.PI/2;
// Corrections requested in rendered space: roll around the forward axis, then
// reverse the bow/stern direction around the water plane's vertical axis.
const BOAT_MODEL_ROLL_CORRECTION=Math.PI/2;
const BOAT_MODEL_DIRECTION_CORRECTION=Math.PI;
export type WakeFoamMode="boat"|"boat-mix";

const surfaceVertex=/* glsl */`
uniform sampler2D uState;
uniform vec2 uFoamFieldCenter;
uniform float uWaveHeight,uTime,uWorldSize,uFoamFieldSize,uFoamScreenSpace;
varying vec2 vUv;
varying vec3 vWorldPosition;
float fieldFade(vec2 p){
 float edge=min(min(p.x,1.0-p.x),min(p.y,1.0-p.y));
 return smoothstep(0.0,.075,edge);
}
void main(){
 vec4 world=modelMatrix*vec4(position,1.0);
 vec2 worldUv=vec2(world.x/uWorldSize+.5,.5-world.z/uWorldSize);
 vec2 fittedUv=vec2((world.x-uFoamFieldCenter.x)/uFoamFieldSize+.5,.5-(world.z-uFoamFieldCenter.y)/uFoamFieldSize);
 vUv=mix(worldUv,fittedUv,uFoamScreenSpace);
 vec2 sampleUv=clamp(vUv,vec2(.001),vec2(.999));
 float fluidHeight=texture2D(uState,sampleUv).r*fieldFade(vUv)*7.5*uWaveHeight;
 world.y+=fluidHeight;
 vWorldPosition=world.xyz;
 gl_Position=projectionMatrix*viewMatrix*world;
}
`;

const surfaceFragment=/* glsl */`
uniform sampler2D uState,uVelocity,uFoam;
uniform vec2 uTexel,uFoamFieldCenter;
uniform float uWaveHeight,uTime,uFoamScreenSpace,uReflectionIntensity,uLightDirection;
uniform float uFoamFieldSize;
uniform vec3 uDeepColor,uShallowColor;
varying vec2 vUv;
varying vec3 vWorldPosition;
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
void main(){
 vec2 sampleUv=clamp(vUv,uTexel,1.0-uTexel);
 float l=texture2D(uState,clamp(sampleUv-vec2(uTexel.x,0.0),uTexel,1.0-uTexel)).r;
 float r=texture2D(uState,clamp(sampleUv+vec2(uTexel.x,0.0),uTexel,1.0-uTexel)).r;
 float b=texture2D(uState,clamp(sampleUv-vec2(0.0,uTexel.y),uTexel,1.0-uTexel)).r;
 float t=texture2D(uState,clamp(sampleUv+vec2(0.0,uTexel.y),uTexel,1.0-uTexel)).r;
 vec2 world=vWorldPosition.xz;
 float fieldEdge=min(min(vUv.x,1.0-vUv.x),min(vUv.y,1.0-vUv.y));
 float fieldMask=smoothstep(0.0,.075,fieldEdge);
 vec3 normal=normalize(vec3((l-r)*48.0*fieldMask*uWaveHeight,1.0,(b-t)*48.0*fieldMask*uWaveHeight));
 vec3 viewDir=normalize(cameraPosition-vWorldPosition);
 float lightAngle=radians(uLightDirection);
 vec3 lightDir=normalize(vec3(cos(lightAngle),.88,sin(lightAngle)));
 float fresnel=pow(1.0-max(dot(viewDir,normal),0.0),3.2);
 float diffuse=.2+.8*max(dot(normal,lightDir),0.0);
 float reflection=max(dot(reflect(-lightDir,normal),viewDir),0.0);
 float spec=pow(reflection,72.0)*mix(1.0,.06,uFoamScreenSpace);
 vec2 velocity=texture2D(uVelocity,sampleUv).xy*fieldMask;
 float grain=waterNoise(world*3.7+vec2(uTime*.21,-uTime*.16));
 float broadNoise=waterNoise(world*.19+vec2(uTime*.018,-uTime*.012));
 float fineNoise=waterNoise(world*.73+vec2(-uTime*.035,uTime*.026));
 float waterTexture=clamp(broadNoise*.68+fineNoise*.32,0.0,1.0);
 float sparkle=pow(reflection,180.0)*smoothstep(.58,1.0,grain)*(1.0+length(velocity)*.2);
 sparkle+=smoothstep(.82,.98,waterTexture)*(.018+fresnel*.045);
 sparkle*=mix(1.0,.15,uFoamScreenSpace);
 vec2 worldFoamUv=vec2((vWorldPosition.x-uFoamFieldCenter.x)/uFoamFieldSize+.5,.5-(vWorldPosition.z-uFoamFieldCenter.y)/uFoamFieldSize);
 vec2 foamUv=mix(sampleUv,clamp(worldFoamUv,uTexel,1.0-uTexel),uFoamScreenSpace);
 float foamFieldMask=mix(fieldMask,1.0,uFoamScreenSpace);
 vec3 foamDye=texture2D(uFoam,foamUv).rgb*foamFieldMask;
 float brightFoam=max(foamDye.g,foamDye.b);
 float backgroundFoam=clamp((foamDye.r-max(foamDye.g,foamDye.b))*1.5,0.0,1.0);
 vec3 visibleFoam=foamDye;
 visibleFoam.r=min(visibleFoam.r,max(visibleFoam.g,visibleFoam.b));
  vec3 water=mix(uDeepColor,uShallowColor,clamp(fresnel*.62+diffuse*.31,0.0,1.0));
  water*=.72+waterTexture*.48;
  water+=vec3(spec*1.35+sparkle*1.8+waterTexture*.026);
 vec3 backgroundDyeColor=uDeepColor;
 vec3 wakeReflection=vec3((spec*1.35+fresnel*.025)*uReflectionIntensity);
 water=mix(water,wakeReflection,uFoamScreenSpace);
 water=mix(water,backgroundDyeColor,backgroundFoam);
 water=mix(water,max(water,visibleFoam),clamp(brightFoam,0.0,1.0));
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
  private foam:VortexFoam;
  private surface!:THREE.Mesh<THREE.PlaneGeometry,THREE.ShaderMaterial>;
  private spray:SpraySystem;
  private boat=new THREE.Group();
  private boatVisual=new THREE.Group();
  private fallbackBoat:THREE.Group;
  private settings:WakeSettings;
  private resolvedQuality:ResolvedWakeQuality;
  private position=new THREE.Vector3(0,0,1);
  private forward=new THREE.Vector3(0,0,1);
  private heading=0;
  private speed=2.6;
  private acceleration=0;
  private yawRate=0;
  private route:THREE.QuadraticBezierCurve3|null=null;
  private routeProgress=0;
  private routeEndProgress=1;
  private routeLength=1;
  private routeTarget=new THREE.Vector3();
  private boatActive=true;
  private respawnDelay=0;
  private pathRadius=52;
  private routeProjection=new THREE.Vector3();
  private pointerTarget:THREE.Vector3|null=null;
  private raycaster=new THREE.Raycaster();
  private pointer=new THREE.Vector2();
  private waterPlane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
  private foamFieldCenter=new THREE.Vector2();
  private foamFieldSize=WORLD_SIZE;
  private frameSamples:number[]=[];
  private elapsed=0;
  private fallbackTrail:THREE.Line;

  constructor(private canvas:HTMLCanvasElement,modelUrl="/boat.glb",private foamMode:WakeFoamMode="boat"){
    this.settings={...(foamMode==="boat-mix"?WAKE2_DEFAULT_SETTINGS:DEFAULT_WAKE_SETTINGS)};
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:"high-performance"});
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.08;
    this.scene.background=new THREE.Color(0x060708);
    if(foamMode==="boat-mix"){
      this.camera.far=300;
      this.camera.position.set(0,112,38);
    }
    else this.camera.position.set(0,92,18);
    this.camera.lookAt(0,0,0);
    this.resolvedQuality=resolveInitialQuality();
    const preset=QUALITY_PRESETS[this.resolvedQuality];
    this.simulation=new WakeSimulation(this.renderer,this.waveResolution(this.resolvedQuality));
    const desktopFoam=foamMode==="boat-mix"&&!window.matchMedia("(pointer: coarse)").matches&&window.innerWidth>=760;
    this.foam=new VortexFoam(desktopFoam);
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
    this.resetPath();
    this.frame=requestAnimationFrame(this.animate);
  }

  private addLights(){
    this.scene.add(new THREE.HemisphereLight(0xdde8f1,0x071019,1.8));
    const sun=new THREE.DirectionalLight(0xffffff,3.2);sun.position.set(-10,22,9);this.scene.add(sun);
  }

  private createSurface(segments:number){
    const old=this.surface;
    const geometry=new THREE.PlaneGeometry(1,1,segments,segments);
    const material=old?.material??new THREE.ShaderMaterial({vertexShader:surfaceVertex,fragmentShader:surfaceFragment,side:THREE.DoubleSide,uniforms:{uState:{value:this.simulation.stateTexture},uVelocity:{value:this.simulation.velocityTexture},uFoam:{value:this.foam.texture},uTexel:{value:new THREE.Vector2(1/this.simulation.resolution,1/this.simulation.resolution)},uFoamFieldCenter:{value:this.foamFieldCenter},uFoamFieldSize:{value:this.foamFieldSize},uWaveHeight:{value:this.settings.waveHeight},uTime:{value:0},uWorldSize:{value:WORLD_SIZE},uFoamScreenSpace:{value:this.foamMode==="boat-mix"?1:0},uReflectionIntensity:{value:this.settings.reflectionIntensity},uLightDirection:{value:this.settings.lightDirection},uDeepColor:{value:new THREE.Color()},uShallowColor:{value:new THREE.Color()}}});
    const surface=new THREE.Mesh(geometry,material);surface.rotation.x=-Math.PI/2;surface.position.y=-.03;surface.scale.set(120,120,1);surface.receiveShadow=true;surface.frustumCulled=false;
    if(old){this.scene.remove(old);old.geometry.dispose();}
    this.surface=surface;this.scene.add(surface);this.fitSurfaceToView();
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
      const alignToForward=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),BOAT_MODEL_YAW_CORRECTION);
      const rollCounterClockwise=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),BOAT_MODEL_ROLL_CORRECTION);
      const reverseDirection=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),BOAT_MODEL_DIRECTION_CORRECTION);
      model.quaternion.copy(reverseDirection).multiply(rollCounterClockwise).multiply(alignToForward);
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
    if(partial.reflectionIntensity!==undefined)this.surface.material.uniforms.uReflectionIntensity.value=partial.reflectionIntensity;
    if(partial.lightDirection!==undefined)this.surface.material.uniforms.uLightDirection.value=partial.lightDirection;
    if(partial.quality&&partial.quality!==previousQuality){const next=partial.quality==="auto"?resolveInitialQuality():partial.quality;this.applyQuality(next);}
  }

  private applyPalette(){
    const mono=this.settings.palette==="monochrome";const uniforms=this.surface.material.uniforms;
    const wake2=this.foamMode==="boat-mix";
    uniforms.uDeepColor.value.set(wake2?0x000000:(mono?0x05080a:0x031423));
    uniforms.uShallowColor.value.set(wake2?0x000000:(mono?0x7a858b:0x2e789d));
    (this.scene.background as THREE.Color).set(wake2?0x000000:(mono?0x060708:0x020e18));
    this.spray.setPalette(this.settings.palette);this.foam.setPalette(this.settings.palette);
  }

  private applyQuality(next:ResolvedWakeQuality){
    if(next===this.resolvedQuality)return;this.resolvedQuality=next;const preset=QUALITY_PRESETS[next];
    this.simulation.setResolution(this.waveResolution(next));this.createSurface(preset.surfaceSegments);this.spray.setLimit(preset.particles);this.applyPalette();
  }

  private waveResolution(quality:ResolvedWakeQuality){
    return this.foamMode==="boat-mix"?WAKE2_SIMULATION_RESOLUTION[quality]:QUALITY_PRESETS[quality].simulation;
  }

  setPointerTarget(clientX:number,clientY:number){
    if(!this.boatActive)return;
    const rect=this.canvas.getBoundingClientRect();this.pointer.set((clientX-rect.left)/rect.width*2-1,-((clientY-rect.top)/rect.height)*2+1);
    this.raycaster.setFromCamera(this.pointer,this.camera);const hit=new THREE.Vector3();
    if(this.raycaster.ray.intersectPlane(this.waterPlane,hit)){hit.x=THREE.MathUtils.clamp(hit.x,-29,29);hit.z=THREE.MathUtils.clamp(hit.z,-29,29);this.pointerTarget=hit;}
  }
  clearPointerTarget(){this.pointerTarget=null;if(this.boatActive)this.resumeOriginalRoute();}
  resetFoam(){this.foam.reset();}

  resize(){
    const width=Math.max(1,this.canvas.clientWidth),height=Math.max(1,this.canvas.clientHeight);const mobile=window.matchMedia("(pointer: coarse)").matches||width<760;
    this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,mobile?1.25:1.75));this.renderer.setSize(width,height,false);this.fitSurfaceToView();
  }

  private fitSurfaceToView(){
    if(!this.surface)return;
    const plane=new THREE.Plane(new THREE.Vector3(0,1,0),.03);
    const hits:THREE.Vector3[]=[];
    for(const [x,y] of [[-1,-1],[1,-1],[-1,1],[1,1]] as const){
      this.raycaster.setFromCamera(new THREE.Vector2(x,y),this.camera);const hit=new THREE.Vector3();if(this.raycaster.ray.intersectPlane(plane,hit))hits.push(hit);
    }
    if(hits.length!==4){this.surface.position.set(0,-.03,0);this.surface.scale.set(140,140,1);return;}
    const margin=4;const minX=Math.min(...hits.map(hit=>hit.x))-margin,maxX=Math.max(...hits.map(hit=>hit.x))+margin;const minZ=Math.min(...hits.map(hit=>hit.z))-margin,maxZ=Math.max(...hits.map(hit=>hit.z))+margin;
    if(this.foamMode==="boat-mix"){
      this.foamFieldCenter.set((minX+maxX)/2,(minZ+maxZ)/2);
      this.foamFieldSize=Math.max(maxX-minX,maxZ-minZ)*1.4;
      this.surface.material.uniforms.uFoamFieldCenter.value.copy(this.foamFieldCenter);
      this.surface.material.uniforms.uFoamFieldSize.value=this.foamFieldSize;
    }
    this.pathRadius=Math.max(48,...hits.map(hit=>Math.hypot(hit.x,hit.z)))+(this.foamMode==="boat-mix"?48:10);
    this.surface.position.set((minX+maxX)/2,-.03,(minZ+maxZ)/2);this.surface.scale.set(maxX-minX,maxZ-minZ,1);this.surface.updateMatrixWorld(true);
  }

  private calculateVisibleRange(){
    if(!this.route)return {start:0,end:1};
    this.camera.updateMatrixWorld();
    let first=-1,last=-1;
    for(let i=0;i<=ROUTE_SAMPLE_COUNT;i++){
      const progress=i/ROUTE_SAMPLE_COUNT;this.routeProjection.copy(this.route.getPoint(progress)).project(this.camera);
      const horizontalMargin=this.foamMode==="boat-mix"?.42:ROUTE_SCREEN_MARGIN;
      const inside=this.routeProjection.z>=-1&&this.routeProjection.z<=1&&Math.abs(this.routeProjection.x)<=1+horizontalMargin&&Math.abs(this.routeProjection.y)<=1+ROUTE_SCREEN_MARGIN;
      if(inside){if(first===-1)first=i;last=i;}
    }
    if(first===-1)return {start:0,end:1};
    return {start:Math.max(0,(first-1)/ROUTE_SAMPLE_COUNT),end:Math.min(1,(last+1)/ROUTE_SAMPLE_COUNT)};
  }

  private screenPointToWater(x:number,y:number){
    this.camera.updateMatrixWorld(true);
    this.raycaster.setFromCamera(new THREE.Vector2(x,y),this.camera);
    return this.raycaster.ray.intersectPlane(this.waterPlane,new THREE.Vector3());
  }

  private resetPath(){
    for(let attempt=0;attempt<8;attempt++){
      const desktopWake2=this.foamMode==="boat-mix"&&this.canvas.clientWidth>=760;
      if(desktopWake2){
        const direction=Math.random()<.5?1:-1;
        const start=this.screenPointToWater(-direction*1.3,(Math.random()-.5)*1.05);
        const end=this.screenPointToWater(direction*1.3,(Math.random()-.5)*1.05);
        const control=this.screenPointToWater((Math.random()-.5)*.32,(Math.random()-.5)*.9);
        if(!start||!end||!control)continue;
        this.route=new THREE.QuadraticBezierCurve3(start,control,end);
        this.routeProgress=0;this.routeEndProgress=1;this.routeLength=Math.max(this.route.getLength(),.001);this.routeTarget.copy(end);
        this.position.copy(start);const tangent=this.route.getTangent(0).normalize();this.forward.copy(tangent);this.heading=Math.atan2(tangent.x,tangent.z);this.boatActive=true;this.boat.visible=true;this.fallbackTrail.visible=!this.simulation.supported;this.applyBoatTransform(0);return;
      }
      const startAngle=Math.random()*Math.PI*2;
      let start=new THREE.Vector3(Math.cos(startAngle)*this.pathRadius,0,Math.sin(startAngle)*this.pathRadius);
      const endAngle=startAngle+Math.PI+(Math.random()-.5);
      let end=new THREE.Vector3(Math.cos(endAngle)*this.pathRadius,0,Math.sin(endAngle)*this.pathRadius);
      let control=new THREE.Vector3((Math.random()-.5)*30,0,(Math.random()-.5)*30);
      if(this.foamMode==="boat-mix"){
        const direction=Math.random()<.5?1:-1;
        start=new THREE.Vector3(-direction*this.pathRadius,0,(Math.random()-.5)*this.pathRadius*.55);
        end=new THREE.Vector3(direction*this.pathRadius,0,(Math.random()-.5)*this.pathRadius*.55);
        control=new THREE.Vector3((Math.random()-.5)*this.pathRadius*.22,0,(Math.random()-.5)*this.pathRadius*.38);
      }
      this.route=new THREE.QuadraticBezierCurve3(start,control,end);
      const visible=this.calculateVisibleRange();
      if(visible.end-visible.start<.1)continue;
      this.routeProgress=visible.start;this.routeEndProgress=visible.end;this.routeLength=Math.max(this.route.getLength(),.001);this.routeTarget.copy(this.route.getPoint(visible.end));
      this.position.copy(this.route.getPoint(visible.start));
      const tangent=this.route.getTangent(visible.start).normalize();this.forward.copy(tangent);this.heading=Math.atan2(tangent.x,tangent.z);this.boatActive=true;this.boat.visible=true;this.fallbackTrail.visible=!this.simulation.supported;this.applyBoatTransform(0);return;
    }
  }

  private waitForNextPath(){
    this.boatActive=false;this.respawnDelay=WAKE2_RESPAWN_DELAY;this.route=null;this.boat.visible=false;this.fallbackTrail.visible=false;
  }

  private resumeOriginalRoute(){
    if(this.position.distanceTo(this.routeTarget)<2){this.resetPath();return;}
    const distance=this.position.distanceTo(this.routeTarget);
    const turnLead=THREE.MathUtils.clamp(distance*.72,12,34);
    const control=this.position.clone().addScaledVector(this.forward,turnLead);
    this.route=new THREE.QuadraticBezierCurve3(this.position.clone(),control,this.routeTarget.clone());
    this.routeProgress=0;this.routeEndProgress=1;this.routeLength=Math.max(this.route.getLength(),.001);
  }

  private steerTo(target:THREE.Vector3,dt:number){
    const desired=target.clone().sub(this.position);
    const desiredHeading=Math.atan2(desired.x,desired.z);const error=shortestAngle(desiredHeading-this.heading);
    const previousHeading=this.heading;const maxTurn=(.62+Math.min(.7,Math.abs(error)))*dt;this.heading+=THREE.MathUtils.clamp(error*.86*dt,-maxTurn,maxTurn);
    this.yawRate=shortestAngle(this.heading-previousHeading)/Math.max(dt,.001);
    const targetSpeed=3.15*this.settings.cruiseSpeed*(1-.24*Math.min(1,Math.abs(error)));
    const oldSpeed=this.speed;this.speed=THREE.MathUtils.damp(this.speed,targetSpeed,1.35,dt);this.acceleration=(this.speed-oldSpeed)/Math.max(dt,.001);
    this.forward.set(Math.sin(this.heading),0,Math.cos(this.heading));this.position.addScaledVector(this.forward,this.speed*dt);
  }

  private applyBoatTransform(time:number){
    this.boat.position.set(this.position.x,BOAT_WATERLINE_HEIGHT+Math.sin(time*2.1)*.025,this.position.z);this.boat.rotation.y=this.heading;
  }

  private updateBoat(dt:number,time:number){
    if(!this.boatActive){
      this.respawnDelay-=dt;
      if(this.respawnDelay<=0)this.resetPath();
      return;
    }
    if(this.pointerTarget)this.steerTo(this.pointerTarget,dt);
    else if(this.route){
      const oldSpeed=this.speed;this.speed=THREE.MathUtils.damp(this.speed,3.15*this.settings.cruiseSpeed,1.35,dt);this.acceleration=(this.speed-oldSpeed)/Math.max(dt,.001);
      const previousHeading=this.heading;this.routeProgress+=this.speed*dt/this.routeLength;
      if(this.routeProgress>this.routeEndProgress){if(this.foamMode==="boat-mix")this.waitForNextPath();else this.resetPath();return;}
      this.position.copy(this.route.getPoint(this.routeProgress));this.forward.copy(this.route.getTangent(this.routeProgress).normalize());this.heading=Math.atan2(this.forward.x,this.forward.z);this.yawRate=shortestAngle(this.heading-previousHeading)/Math.max(dt,.001);
    }
    this.applyBoatTransform(time);
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
    const worldUv=new THREE.Vector2(this.position.x/WORLD_SIZE+.5,.5-this.position.z/WORLD_SIZE);
    const fittedUv=new THREE.Vector2((this.position.x-this.foamFieldCenter.x)/this.foamFieldSize+.5,.5-(this.position.z-this.foamFieldCenter.y)/this.foamFieldSize);
    const uv=this.boatActive?(this.foamMode==="boat-mix"?fittedUv:worldUv):new THREE.Vector2(-10,-10);const direction=new THREE.Vector2(this.forward.x,-this.forward.z).normalize();
    const fieldScale=this.foamMode==="boat-mix"?WORLD_SIZE/this.foamFieldSize:1;
    const input:WakeInput={uv,direction,speed:this.boatActive?this.speed/3.2:0,acceleration:this.boatActive?this.acceleration/3:0,yawRate:this.boatActive?this.yawRate:0,fieldScale};
    this.simulation.step(dt,input,this.settings,QUALITY_PRESETS[this.resolvedQuality].pressureIterations);
    let foamInput=input;
    if(this.foamMode==="boat-mix"&&this.boatActive){
      foamInput=input;
    }
    this.foam.update(foamInput,this.settings,this.foamMode==="boat-mix");
    const uniforms=this.surface.material.uniforms;uniforms.uState.value=this.simulation.stateTexture;uniforms.uVelocity.value=this.simulation.velocityTexture;uniforms.uFoam.value=this.foam.texture;uniforms.uTexel.value.setScalar(1/this.simulation.resolution);uniforms.uTime.value=time;uniforms.uWaveHeight.value=this.settings.waveHeight;
    this.spray.update(dt,{position:this.position,forward:this.forward,speed:input.speed,acceleration:input.acceleration,yawRate:input.yawRate},this.settings);
    this.updateFallbackTrail();this.renderer.render(this.scene,this.camera);this.monitorQuality(rawDt);this.frame=requestAnimationFrame(this.animate);
  };

  private monitorQuality(dt:number){
    if(this.settings.quality!=="auto"||this.elapsed<4)return;this.frameSamples.push(dt);const span=this.frameSamples.reduce((a,b)=>a+b,0);if(span<2.5)return;
    const fps=this.frameSamples.length/span;this.frameSamples=[];const mobile=window.matchMedia("(pointer: coarse)").matches||window.innerWidth<760;
    if(fps<(mobile?27:44)){if(this.resolvedQuality==="high"){this.applyQuality("medium");this.elapsed=0;}else if(mobile&&this.resolvedQuality==="medium"){this.applyQuality("low");this.elapsed=0;}}
  }

  destroy(){
    this.destroyed=true;cancelAnimationFrame(this.frame);this.simulation.dispose();this.foam.dispose();this.spray.dispose();this.surface.geometry.dispose();this.surface.material.dispose();disposeObject(this.boat);this.fallbackTrail.geometry.dispose();(this.fallbackTrail.material as THREE.Material).dispose();this.renderer.dispose();
  }
}
