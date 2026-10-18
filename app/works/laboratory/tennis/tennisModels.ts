import * as THREE from "three";
import { COURT } from "./tennisPhysics";

const material = (color: THREE.ColorRepresentation) => new THREE.MeshStandardMaterial({ color, roughness: .86 });
function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function line(parent: THREE.Object3D, points: number[], color: number, opacity = 1) {
  const geometry = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  const l = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
  parent.add(l); return l;
}

export function makeCourt(scene: THREE.Scene) {
  const grainCanvas = document.createElement("canvas"); grainCanvas.width = grainCanvas.height = 128;
  const context = grainCanvas.getContext("2d")!;
  const pixels = context.createImageData(128, 128);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const value = 160 + Math.random() * 70;
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = value; pixels.data[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  const grain = new THREE.CanvasTexture(grainCanvas); grain.wrapS = grain.wrapT = THREE.RepeatWrapping; grain.repeat.set(15, 30);
  const ground = mesh(scene, new THREE.PlaneGeometry(200, 200), material(0x459cbd), 0, -.045);
  ground.rotation.x = -Math.PI / 2; ground.castShadow = false;
  const courtMaterial = material(0x3767a2); courtMaterial.bumpMap = grain; courtMaterial.bumpScale = .018;
  const court = mesh(scene, new THREE.PlaneGeometry(COURT.doubles * 2, COURT.halfLength * 2), courtMaterial);
  court.rotation.x = -Math.PI / 2; court.castShadow = false;
  const paint = material(0xf6f5df);
  const stripe = (x: number, z: number, w: number, h: number) => {
    const m = mesh(scene, new THREE.PlaneGeometry(w, h), paint, x, .012, z);
    m.rotation.x = -Math.PI / 2; m.castShadow = false;
  };
  for (const x of [-COURT.doubles, -COURT.halfWidth, COURT.halfWidth, COURT.doubles]) stripe(x, 0, .055, COURT.halfLength * 2 + .055);
  for (const z of [-COURT.halfLength, COURT.halfLength]) {
    stripe(0, z, COURT.doubles * 2, .065);
    stripe(0, z - Math.sign(z) * .12, .055, .24);
  }
  for (const z of [-COURT.service, COURT.service]) stripe(0, z, COURT.halfWidth * 2, .055);
  stripe(0, 0, .055, COURT.service * 2);
  const net = new THREE.Group(); scene.add(net);
  const netPoints: number[] = [];
  const netHeight = (x: number) => COURT.net + .15 * (Math.abs(x) / 6) ** 2;
  for (let x = -6; x <= 6; x += .14) netPoints.push(x, .08, 0, x, netHeight(x), 0);
  for (let y = .1; y < 1; y += .12) for (let x = -6; x < 6; x += .3) {
    netPoints.push(x, Math.min(y, netHeight(x)), 0, x + .3, Math.min(y, netHeight(x + .3)), 0);
  }
  line(net, netPoints, 0x102c40, .72);
  const tape: THREE.Vector3[] = [];
  for (let x = -6; x <= 6; x += .2) tape.push(new THREE.Vector3(x, netHeight(x), 0));
  mesh(net, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tape), 60, .032, 5, false), paint);
  for (const x of [-6, 6]) mesh(net, new THREE.CylinderGeometry(.055, .07, 1.14, 12), material(0x173747), x, .57);
  // A transparent mesh gives the fine net a soft, continuous shadow on the court.
  const veil = mesh(net, new THREE.PlaneGeometry(12, .9), new THREE.MeshStandardMaterial({ color: 0x173747, transparent: true, opacity: .075, side: THREE.DoubleSide, depthWrite: false }), 0, .5);
  veil.castShadow = false;
  const netShadow = mesh(scene, new THREE.PlaneGeometry(12, .34), new THREE.MeshBasicMaterial({ color: 0x173747, transparent: true, opacity: .17, depthWrite: false }), -.26, .016, -.55);
  netShadow.rotation.x = -Math.PI / 2; netShadow.castShadow = false;
}

export type Athlete = ReturnType<typeof makeAthlete>;
export function makeAthlete(scene: THREE.Scene, cpu: boolean) {
  const root = new THREE.Group(); scene.add(root);
  const body = new THREE.Group(); root.add(body);
  const skin = material(cpu ? 0xc78966 : 0xe5b394);
  const shirt = material(cpu ? 0xe57962 : 0xf6f4e9);
  const shorts = material(cpu ? 0x293d59 : 0x23685f);
  const white = material(0xfaf6e9), dark = material(0x1a2b3b);
  mesh(body, new THREE.CapsuleGeometry(.22, .31, 6, 12), shirt, 0, 1.18);
  mesh(body, new THREE.SphereGeometry(.205, 16, 12), skin, 0, 1.72);
  const cap = mesh(body, new THREE.SphereGeometry(.212, 16, 8, 0, Math.PI * 2, 0, Math.PI * .52), white, 0, 1.77);
  cap.scale.y = .65;
  const visor = mesh(body, new THREE.SphereGeometry(.17, 12, 8), white, 0, 1.77, .17); visor.scale.set(1, .13, 1);
  mesh(body, new THREE.CapsuleGeometry(.22, .12, 4, 12), shorts, 0, .85);
  const legs: THREE.Group[] = [], knees: THREE.Group[] = [];
  for (const x of [-.125, .125]) {
    const hip = new THREE.Group(); hip.position.set(x, .82, 0); body.add(hip); legs.push(hip);
    mesh(hip, new THREE.CapsuleGeometry(.115, .16, 4, 8), shorts, 0, -.12);
    mesh(hip, new THREE.CapsuleGeometry(.075, .19, 4, 8), skin, 0, -.27);
    const knee = new THREE.Group(); knee.position.y = -.39; hip.add(knee); knees.push(knee);
    mesh(knee, new THREE.CapsuleGeometry(.065, .22, 4, 8), skin, 0, -.14);
    mesh(knee, new THREE.CylinderGeometry(.07, .07, .13, 8), white, 0, -.28);
    const shoe = mesh(knee, new THREE.CapsuleGeometry(.088, .15, 4, 10), white, 0, -.34, .065); shoe.rotation.x = Math.PI / 2; shoe.scale.y = .9;
    mesh(knee, new THREE.BoxGeometry(.14, .035, .27), dark, 0, -.405, .065);
  }
  const arms: THREE.Group[] = [], elbows: THREE.Group[] = [];
  for (const x of [-.27, .27]) {
    const shoulder = new THREE.Group(); shoulder.position.set(x, 1.37, 0); body.add(shoulder); arms.push(shoulder);
    mesh(shoulder, new THREE.CapsuleGeometry(.11, .07, 4, 8), shirt, 0, -.07);
    mesh(shoulder, new THREE.CapsuleGeometry(.065, .21, 4, 8), skin, 0, -.22);
    const elbow = new THREE.Group(); elbow.position.y = -.33; shoulder.add(elbow); elbows.push(elbow);
    mesh(elbow, new THREE.CapsuleGeometry(.055, .22, 4, 8), skin, 0, -.14);
    mesh(elbow, new THREE.CylinderGeometry(.06, .06, .07, 8), white, 0, -.25);
    mesh(elbow, new THREE.SphereGeometry(.064, 8, 8), skin, 0, -.31);
  }
  const racket = new THREE.Group(); racket.position.y = -.32; racket.rotation.x = -.2; elbows[1].add(racket);
  mesh(racket, new THREE.CylinderGeometry(.028, .032, .28, 8), dark, 0, -.13);
  const hoop = mesh(racket, new THREE.TorusGeometry(.23, .025, 6, 32), material(cpu ? 0xf4e8cb : 0xe5b94f), 0, -.57);
  hoop.scale.y = 1.35;
  line(racket, [-.02, -.25, 0, -.15, -.4, 0, .02, -.25, 0, .15, -.4, 0], 0xddddcd);
  const strings: number[] = [];
  for (let n = -.18; n <= .18; n += .045) {
    const a = .30 * Math.sqrt(1 - (n / .23) ** 2);
    strings.push(n, -.57 - a, 0, n, -.57 + a, 0);
    const b = .23 * Math.sqrt(1 - (n / .30) ** 2);
    strings.push(-b, -.57 + n, 0, b, -.57 + n, 0);
  }
  line(racket, strings, 0xf9f5dc, .55);
  return {
    root, swing: 0, stride: 0,
    update(dt: number, speed: number, swinging: boolean, backhand: boolean) {
      this.stride += speed * dt * 2.5;
      if (swinging) this.swing = 1;
      this.swing = Math.max(0, this.swing - dt * 2.8);
      const gait = Math.sin(this.stride) * Math.min(1, speed / 4);
      body.position.y = Math.abs(gait) * .045;
      legs[0].rotation.x = gait * .55; legs[1].rotation.x = -gait * .55;
      knees[0].rotation.x = Math.max(0, -gait) * .65; knees[1].rotation.x = Math.max(0, gait) * .65;
      arms[0].rotation.x = -.35 - gait * .3; arms[0].rotation.z = .14;
      elbows[0].rotation.x = -.6;
      const sweep = Math.sin((1 - this.swing) * Math.PI) * (this.swing > 0 ? 1 : 0);
      arms[1].rotation.x = -.5 - sweep * 1.4;
      arms[1].rotation.z = -.35 + sweep * (backhand ? 1.8 : -.65);
      arms[1].rotation.y = (1 - this.swing) * sweep * 2.5;
      elbows[1].rotation.x = -.85 + sweep * .55;
      body.rotation.y = sweep * (backhand ? -.5 : .6);
    },
  };
}
