import * as THREE from "three";
import { disposeObject } from "@/app/lib/disposeObject";
import { makeAthlete, makeCourt } from "./tennisModels";
import { advanceBall, awardPoint, clamp, cloneBall, COURT, courtSide, launchShot, newBall, newScore, opposite, pointLabels, swipeSpin, type Side } from "./tennisPhysics";

export type Difficulty = "Easy" | "Normal" | "Hard";
export type TennisState = {
  phase: "ready" | "serve" | "rally" | "point" | "match";
  points: [string, string]; games: [number, number]; server: Side;
  message: string; shot: string; power: number; rally: number; best: number; paused: boolean;
  swingCue: { name: string; arrow: string; x: number; y: number } | null;
};
type Gesture = { top: number; side: number; power: number; expires: number };
function strokeFeedback(top: number, side: number) {
  const vertical = top > .35 ? "↑" : top < -.35 ? "↓" : "";
  const horizontal = side > .35 ? "→" : side < -.35 ? "←" : "";
  const arrow = vertical && horizontal
    ? ({ "↑→": "↗", "↑←": "↖", "↓→": "↘", "↓←": "↙" } as Record<string, string>)[vertical + horizontal]
    : vertical || horizontal;
  return { name: top > .35 ? "DRIVE" : top < -.35 ? "CUT" : "SIDE", arrow };
}
export class TennisApp {
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-10, 10, 17, -17, .1, 150);
  private renderer: THREE.WebGLRenderer;
  private athletes = [makeAthlete(this.scene, false), makeAthlete(this.scene, true)];
  private positions = [new THREE.Vector3(1.6, 0, 12.6), new THREE.Vector3(-1.7, 0, -10.5)];
  private speeds = [0, 0];
  private swings = [false, false];
  private backhands = [false, false];
  private ball = newBall();
  private ballMesh = new THREE.Mesh(new THREE.SphereGeometry(COURT.radius, 16, 12), new THREE.MeshStandardMaterial({ color: 0xe8ff55, roughness: .85, emissive: 0x313600, emissiveIntensity: .35 }));
  private landing = new THREE.Mesh(new THREE.RingGeometry(.28, .32, 32), new THREE.MeshBasicMaterial({ color: 0xf5f2b8, transparent: true, opacity: .55, depthWrite: false }));
  private reach = new THREE.Mesh(new THREE.RingGeometry(1.38, 1.40, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .18, depthWrite: false }));
  private trailPositions = new Float32Array(24 * 3);
  private trailGeometry = new THREE.BufferGeometry();
  private trail: THREE.Line;
  private trailCount = 0;
  private keys = new Set<string>();
  private joystick = { x: 0, y: 0 };
  private previousPointer: { x: number; y: number; time: number } | null = null;
  private samples: { dx: number; dy: number; time: number; elapsed: number }[] = [];
  private gesture: Gesture | null = null;
  private lastGesture = -1;
  private lastContact = -1;
  private lastHitter: Side = 0;
  private bounces = 0;
  private serveShot = false;
  private serviceFaults = 0;
  private serveBox = -1;
  private server: Side = 0;
  private score = newScore();
  private phase: TennisState["phase"] = "ready";
  private message = "YOUR COURT";
  private shot = "";
  private power = 0;
  private rally = 0;
  private best = 0;
  private clock = 0;
  private phaseTime = 0;
  private shotTime = 0;
  private cueTime = -10;
  private cueName = "";
  private cueArrow = "";
  private racketPoint = new THREE.Vector3();
  private paused = false;
  private difficulty: Difficulty = "Normal";
  private showGuide = true;
  private aiTarget = new THREE.Vector3();
  private aiTimer = 0;
  private width = 1;
  private height = 1;
  private frame = 0;
  private previousTime = 0;
  private accumulator = 0;
  private uiTimer = 0;
  private observer: ResizeObserver;
  private destroyed = false;

  constructor(private canvas: HTMLCanvasElement, private onState: (state: TennisState) => void) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia("(pointer: coarse)").matches ? 1.25 : 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x459cbd);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.add(new THREE.HemisphereLight(0xe2f4ff, 0x546b85, 2.1));
    const sun = new THREE.DirectionalLight(0xfff4dc, 2.5);
    sun.position.set(-7, 12, 10); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 22, bottom: -22, near: .5, far: 65 });
    sun.shadow.normalBias = .025; sun.shadow.bias = -.00015; sun.shadow.radius = 2;
    this.scene.add(sun);
    makeCourt(this.scene);
    this.camera.position.set(0, 34, 16); this.camera.lookAt(0, 0, 0);
    this.ballMesh.castShadow = true; this.scene.add(this.ballMesh);
    this.landing.rotation.x = this.reach.rotation.x = -Math.PI / 2;
    this.scene.add(this.landing, this.reach);
    this.trailGeometry.setAttribute("position", new THREE.BufferAttribute(this.trailPositions, 3));
    this.trail = new THREE.Line(this.trailGeometry, new THREE.LineBasicMaterial({ color: 0xf6ffc1, transparent: true, opacity: .35, depthWrite: false }));
    this.trail.frustumCulled = false; this.scene.add(this.trail);
    this.observer = new ResizeObserver(() => this.resize()); this.observer.observe(canvas);
    window.addEventListener("keydown", this.keyDown);
    window.addEventListener("keyup", this.keyUp);
    window.addEventListener("blur", this.blur);
    document.addEventListener("visibilitychange", this.visibility);
    canvas.addEventListener("pointermove", this.pointerMove);
    canvas.addEventListener("pointerdown", this.pointerDown);
    canvas.addEventListener("pointerup", this.pointerUp);
    canvas.addEventListener("pointercancel", this.pointerUp);
    canvas.addEventListener("pointerleave", this.pointerLeave);
    this.resize(); this.emit(); this.frame = requestAnimationFrame(this.tick);
  }

  start = () => { this.score = newScore(); this.server = 0; this.rally = 0; this.best = 0; this.serviceFaults = 0; this.paused = false; this.prepareServe(); };
  setPaused(value: boolean) { this.paused = value; this.keys.clear(); this.joystick = { x: 0, y: 0 }; this.gesture = null; this.previousPointer = null; this.samples = []; this.emit(); }
  setDifficulty(value: Difficulty) { this.difficulty = value; }
  setGuide(value: boolean) { this.showGuide = value; }
  setJoystick(x: number, y: number) { this.joystick = { x, y }; }
  serve = () => { if (this.phase === "serve" && this.server === 0 && !this.paused) this.launchServe(); };

  private prepareServe() {
    this.phase = "serve"; this.phaseTime = 0; this.bounces = 0; this.rally = 0; this.gesture = null; this.cueTime = -10;
    this.joystick = { x: 0, y: 0 }; this.speeds = [0, 0];
    const court = courtSide(this.server);
    const deuce = (this.score.points[0] + this.score.points[1]) % 2 === 0 ? 1 : -1;
    this.serveBox = -deuce * court;
    this.positions[this.server].set(deuce * court * 1.6, 0, court * 12.6);
    this.positions[opposite(this.server)].set(this.serveBox * 1.7, 0, -court * 10.5);
    this.ball.p = { x: this.positions[this.server].x, y: 1.4, z: this.positions[this.server].z - court * .3 };
    this.ball.v = { x: 0, y: 0, z: 0 }; this.trailCount = 0;
    this.message = this.server === 0 ? (this.serviceFaults ? "SECOND SERVE · SPACE / SWIPE" : "YOUR SERVE · SPACE / SWIPE") : "COMPUTER SERVING";
    this.shot = ""; this.emit();
  }
  private launchServe(gesture?: Gesture) {
    const p = this.positions[this.server], court = courtSide(this.server);
    if (!gesture) this.athletes[this.server].setStroke(.75, 0);
    this.ball.p = { x: p.x, y: 2.45, z: p.z - court * .35 };
    const power = gesture?.power ?? .55;
    launchShot(this.ball, this.serveBox * (1.5 + power), -court * (4.0 + power), power, gesture?.top ?? .4, gesture?.side ?? 0);
    this.lastHitter = this.server; this.lastContact = this.clock; this.bounces = 0; this.serveShot = true;
    this.phase = "rally"; this.phaseTime = 0; this.swings[this.server] = true;
    const serveFeedback = gesture ? strokeFeedback(gesture.top, gesture.side) : null;
    this.message = ""; this.shot = serveFeedback ? `SERVE · ${serveFeedback.name} ${serveFeedback.arrow}` : "SERVE";
    this.power = power; this.shotTime = this.clock; this.gesture = null; this.emit();
  }
  private finishPoint(winner: Side, reason: string) {
    if (this.phase !== "rally") return;
    const game = awardPoint(this.score, winner);
    this.best = Math.max(this.best, this.rally);
    if (game) this.server = opposite(this.server);
    this.serviceFaults = 0; this.phaseTime = 0; this.gesture = null;
    if (this.score.winner !== null) {
      this.phase = "match"; this.message = this.score.winner === 0 ? "YOU WIN" : "COMPUTER WINS";
    } else {
      this.phase = "point";
      this.message = `${reason} · ${winner === 0 ? "YOUR" : "CPU"} ${game ? "GAME" : "POINT"}`;
    }
    this.emit();
  }
  private fault(reason: string) {
    if (this.serveShot && this.bounces === 0) {
      if (this.serviceFaults === 0) {
        this.serviceFaults = 1; this.phase = "point"; this.phaseTime = 0; this.message = `${reason} · SECOND SERVE`; this.emit();
      } else this.finishPoint(opposite(this.lastHitter), "DOUBLE FAULT");
    } else this.finishPoint(opposite(this.lastHitter), reason);
  }

  private keyDown = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.closest('input,select,textarea,a,[role="dialog"]'))) return;
    const key = event.code;
    if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(key)) event.preventDefault();
    if (key === "KeyP" && !event.repeat && this.phase !== "ready") this.setPaused(!this.paused);
    if (key === "Space" && !event.repeat) this.serve();
    if (!this.paused) this.keys.add(key);
  };
  private keyUp = (event: KeyboardEvent) => { this.keys.delete(event.code); };
  private blur = () => { if (this.phase !== "ready") this.setPaused(true); };
  private visibility = () => { if (document.hidden) this.blur(); };
  private pointerDown = (event: PointerEvent) => {
    if (this.paused) return;
    this.canvas.setPointerCapture(event.pointerId);
    this.previousPointer = { x: event.clientX, y: event.clientY, time: performance.now() };
    this.samples = [];
  };
  private pointerUp = (event: PointerEvent) => {
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    if (event.pointerType !== "mouse") { this.previousPointer = null; this.samples = []; }
  };
  private pointerLeave = () => { this.previousPointer = null; this.samples = []; };
  private pointerMove = (event: PointerEvent) => {
    if (this.paused || (this.phase !== "rally" && !(this.phase === "serve" && this.server === 0)) || (event.pointerType !== "mouse" && !event.buttons)) return;
    const now = performance.now(), previous = this.previousPointer;
    this.previousPointer = { x: event.clientX, y: event.clientY, time: now };
    if (!previous || now - previous.time > 160) { this.samples = []; return; }
    this.samples.push({ dx: event.clientX - previous.x, dy: event.clientY - previous.y, time: now, elapsed: now - previous.time });
    this.samples = this.samples.filter(s => now - s.time < 120);
    const dx = this.samples.reduce((sum, s) => sum + s.dx, 0), dy = this.samples.reduce((sum, s) => sum + s.dy, 0);
    const distance = Math.hypot(dx, dy);
    const pathLength = this.samples.reduce((sum, s) => sum + Math.hypot(s.dx, s.dy), 0);
    const elapsed = this.samples.reduce((sum, s) => sum + s.elapsed, 0);
    const speed = distance / Math.max(.016, elapsed / 1000);
    const minDistance = event.pointerType === "mouse" ? 50 : 42;
    const minSpeed = event.pointerType === "mouse" ? 720 : 600;
    if (distance < minDistance || speed < minSpeed || distance / pathLength < .72 || this.clock - this.lastGesture < .23) return;
    this.lastGesture = this.clock; this.samples = [];
    const spin = swipeSpin(speed, minSpeed);
    this.gesture = { top: -dy / distance * spin, side: dx / distance * spin, power: clamp((speed - minSpeed) / 1600, .12, 1), expires: this.clock + .19 };
    const feedback = strokeFeedback(this.gesture.top, this.gesture.side);
    this.athletes[0].setStroke(this.gesture.top, this.gesture.side);
    this.swings[0] = true; this.backhands[0] = this.ball.p.x < this.positions[0].x;
    this.cueTime = this.clock; this.cueName = feedback.name; this.cueArrow = feedback.arrow;
    this.shot = `YOU · ${feedback.name} ${feedback.arrow}`; this.power = this.gesture.power; this.shotTime = this.clock;
    if (this.phase === "serve" && this.server === 0) this.launchServe(this.gesture);
    else this.emit();
  };

  private movePlayer(dt: number) {
    if (this.phase !== "rally") { this.speeds[0] = 0; return; }
    let x = Number(this.keys.has("KeyD") || this.keys.has("ArrowRight")) - Number(this.keys.has("KeyA") || this.keys.has("ArrowLeft")) + this.joystick.x;
    let z = Number(this.keys.has("KeyS") || this.keys.has("ArrowDown")) - Number(this.keys.has("KeyW") || this.keys.has("ArrowUp")) + this.joystick.y;
    const length = Math.hypot(x, z); if (length > 1) { x /= length; z /= length; }
    this.speeds[0] = Math.min(length, 1) * 7.2;
    this.positions[0].x = clamp(this.positions[0].x + x * dt * 7.2, -6.8, 6.8);
    this.positions[0].z = clamp(this.positions[0].z + z * dt * 7.2, 1.15, 14.5);
  }
  private predict() {
    const forecast = cloneBall(this.ball);
    let bounce = this.bounces;
    for (let i = 0; i < 420; i++) {
      const event = advanceBall(forecast, 1 / 120);
      if (event === "net") break;
      if (event === "bounce") bounce++;
      if (forecast.p.z < -1.5 && forecast.p.y < 1.25 && forecast.v.y < 0 && bounce >= (this.serveShot ? 1 : 0)) {
        this.aiTarget.set(clamp(forecast.p.x, -6.2, 6.2), 0, clamp(forecast.p.z, -14, -1.6)); return;
      }
      if (bounce >= 2) break;
    }
    this.aiTarget.set(clamp(this.ball.p.x, -5, 5), 0, -10.4);
  }
  private updateAI(dt: number) {
    if (this.phase !== "rally") { this.speeds[1] = 0; return; }
    this.aiTimer -= dt;
    if (this.aiTimer <= 0) {
      this.aiTimer = this.difficulty === "Easy" ? .3 : this.difficulty === "Hard" ? .07 : .16;
      if (this.lastHitter === 0) this.predict();
      else this.aiTarget.set(this.ball.p.x * .2, 0, -10);
    }
    const dx = this.aiTarget.x - this.positions[1].x, dz = this.aiTarget.z - this.positions[1].z, distance = Math.hypot(dx, dz);
    const speed = this.difficulty === "Easy" ? 4.3 : this.difficulty === "Hard" ? 7 : 5.7;
    const step = Math.min(distance, speed * dt); this.speeds[1] = distance > .12 ? speed : 0;
    if (distance > .05) { this.positions[1].x += dx / distance * step; this.positions[1].z += dz / distance * step; }
    if (this.canHit(1)) {
      const error = this.difficulty === "Easy" ? 1.3 : this.difficulty === "Hard" ? .2 : .65;
      const target = clamp(-Math.sign(this.positions[0].x || 1) * (2.4 + Math.random()) + (Math.random() - .5) * error, -4.4, 4.4);
      this.hit(1, { power: .35 + Math.random() * .5, top: Math.random() > .25 ? .65 : -.65, side: (Math.random() - .5) * .7, expires: 0 }, target);
    }
  }
  private canHit(side: Side) {
    const p = this.positions[side], b = this.ball.p;
    return this.phase === "rally" && this.lastHitter !== side && this.clock - this.lastContact > .25 &&
      (!this.serveShot || this.bounces > 0) && b.z * courtSide(side) > .4 && b.y > .2 && b.y < 2.25 &&
      Math.hypot(b.x - p.x, b.z - p.z) < 1.65;
  }
  private hit(side: Side, gesture: Gesture, targetX?: number) {
    this.backhands[side] = this.ball.p.x < this.positions[side].x;
    this.athletes[side].setStroke(gesture.top, gesture.side);
    const target = targetX ?? clamp(gesture.side * 3.5 + this.ball.p.x * .13, -3.85, 3.85);
    launchShot(this.ball, target, -courtSide(side) * (6.5 + gesture.power * 4), gesture.power, gesture.top, gesture.side);
    this.lastHitter = side; this.lastContact = this.clock; this.bounces = 0; this.serveShot = false; this.swings[side] = true;
    this.rally++; this.best = Math.max(this.best, this.rally);
    const feedback = strokeFeedback(gesture.top, gesture.side);
    this.shot = `${side === 0 ? "YOU" : "CPU"} · ${feedback.name} ${feedback.arrow}`;
    this.power = gesture.power; this.shotTime = this.clock;
    this.emit();
  }
  private simulate(dt: number) {
    this.clock += dt; this.phaseTime += dt;
    if (this.phase === "point" && this.phaseTime > 1.8) this.prepareServe();
    if (this.phase === "serve" && this.server === 1 && this.phaseTime > 1.3) this.launchServe();
    this.movePlayer(dt);
    if (this.phase === "rally") {
      const event = advanceBall(this.ball, dt);
      if (event === "net") this.fault("NET");
      if (event === "bounce") {
        const p = this.ball.p;
        if (this.bounces === 0) {
          const wrongHalf = p.z * courtSide(this.lastHitter) > 0;
          const out = Math.abs(p.x) > COURT.halfWidth + COURT.radius || Math.abs(p.z) > COURT.halfLength + COURT.radius;
          const serviceOut = this.serveShot && (Math.abs(p.z) > COURT.service + COURT.radius || p.x * this.serveBox < -COURT.radius);
          if (wrongHalf || out || serviceOut) this.fault("OUT");
          else this.bounces = 1;
        } else this.finishPoint(this.lastHitter, "SECOND BOUNCE");
      }
      if (Math.abs(this.ball.p.z) > 22 || Math.abs(this.ball.p.x) > 17 || this.clock - this.lastContact > 15) this.finishPoint(this.bounces ? this.lastHitter : opposite(this.lastHitter), "BALL AWAY");
      this.updateAI(dt);
      if (this.gesture && this.gesture.expires >= this.clock && this.canHit(0)) { this.hit(0, this.gesture); this.gesture = null; }
      if (this.gesture && this.gesture.expires < this.clock) this.gesture = null;
    }
  }
  private draw(dt: number) {
    this.athletes.forEach((athlete, index) => {
      athlete.root.position.copy(this.positions[index]);
      athlete.root.rotation.y = index === 0 ? Math.PI : 0;
      athlete.update(dt, this.paused ? 0 : this.speeds[index], this.swings[index], this.backhands[index]); this.swings[index] = false;
    });
    this.ballMesh.position.set(this.ball.p.x, this.ball.p.y, this.ball.p.z);
    this.ballMesh.rotation.x += this.paused ? 0 : dt * this.ball.top * 12;
    this.reach.position.set(this.positions[0].x, .024, this.positions[0].z);
    this.reach.visible = this.showGuide && this.phase === "rally";
    this.reach.material.opacity = this.canHit(0) ? .65 : .18;
    this.landing.visible = this.showGuide && this.phase === "rally";
    if (this.landing.visible) {
      const b = cloneBall(this.ball);
      for (let i = 0; i < 240; i++) { if (advanceBall(b, 1 / 90)) break; }
      this.landing.position.set(b.p.x, .025, b.p.z);
    }
    if (this.phase === "rally" && !this.paused) {
      this.trailPositions.copyWithin(3, 0, this.trailPositions.length - 3);
      this.trailPositions.set([this.ball.p.x, this.ball.p.y, this.ball.p.z], 0);
      this.trailCount = Math.min(24, this.trailCount + 1);
      this.trailGeometry.attributes.position.needsUpdate = true;
    }
    this.trailGeometry.setDrawRange(0, this.trailCount); this.trail.visible = this.phase === "rally";
    this.renderer.render(this.scene, this.camera);
  }
  private tick = (time: number) => {
    if (this.destroyed) return;
    const dt = Math.min(.05, (time - (this.previousTime || time)) / 1000); this.previousTime = time;
    if (!this.paused && this.phase !== "ready" && this.phase !== "match") {
      this.accumulator += dt;
      while (this.accumulator >= 1 / 120) { this.simulate(1 / 120); this.accumulator -= 1 / 120; }
    } else this.accumulator = 0;
    this.draw(this.paused ? 0 : dt);
    this.uiTimer += dt;
    if (this.uiTimer > .1) { this.uiTimer = 0; this.emit(); }
    this.frame = requestAnimationFrame(this.tick);
  };
  private emit() {
    this.athletes[0].root.updateMatrixWorld(true);
    this.athletes[0].racketTip.getWorldPosition(this.racketPoint).project(this.camera);
    const racketX = (this.racketPoint.x + 1) * this.width / 2;
    const racketY = (1 - this.racketPoint.y) * this.height / 2;
    const swingCue = this.phase === "rally" && this.clock - this.cueTime < .75
      ? { name: this.cueName, arrow: this.cueArrow, x: clamp(racketX + 22, 26, this.width - 94), y: clamp(racketY - 20, 40, this.height - 40) }
      : null;
    this.onState({ phase: this.phase, points: pointLabels(this.score), games: [...this.score.games], server: this.server, message: this.message, shot: this.clock - this.shotTime < 2.2 ? this.shot : "", power: this.power, rally: this.rally, best: this.best, paused: this.paused, swingCue });
    this.canvas.dataset.game = JSON.stringify({ phase: this.phase, paused: this.paused, player: this.positions[0].toArray(), cpu: this.positions[1].toArray(), ball: this.ball.p, velocity: this.ball.v, lastHitter: this.lastHitter, bounces: this.bounces, rally: this.rally, top: this.ball.top, side: this.ball.side, curve: this.ball.curve, swing: this.athletes[0].swing, racketScreen: [racketX, racketY], swingCue });
  }
  private resize() {
    this.width = this.canvas.clientWidth; this.height = this.canvas.clientHeight;
    const aspect = this.width / Math.max(1, this.height), halfHeight = Math.max(16.1, 8.5 / aspect);
    this.camera.left = -halfHeight * aspect; this.camera.right = halfHeight * aspect;
    this.camera.top = halfHeight; this.camera.bottom = -halfHeight; this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height, false);
  }
  destroy() {
    this.destroyed = true; cancelAnimationFrame(this.frame); this.observer.disconnect();
    window.removeEventListener("keydown", this.keyDown); window.removeEventListener("keyup", this.keyUp); window.removeEventListener("blur", this.blur);
    document.removeEventListener("visibilitychange", this.visibility);
    this.canvas.removeEventListener("pointermove", this.pointerMove); this.canvas.removeEventListener("pointerdown", this.pointerDown);
    this.canvas.removeEventListener("pointerup", this.pointerUp); this.canvas.removeEventListener("pointercancel", this.pointerUp); this.canvas.removeEventListener("pointerleave", this.pointerLeave);
    disposeObject(this.scene); this.renderer.dispose(); delete this.canvas.dataset.game;
  }
}
