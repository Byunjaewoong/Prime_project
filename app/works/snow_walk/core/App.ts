// app/works/snow_walk/core/App.ts

type Snowflake = {
  x: number;
  y: number;
  speedY: number;
  driftX: number;
  radius: number;
};

type Footprint = {
  x: number;
  y: number;
  createdAt: number;
};

type Person = {
  x: number;
  y: number;
  speed: number;
  height: number;
  lastFootX: number;
  stepToggle: boolean;
};

type SnowLump = {
  x: number;
  y: number;
  radius: number;
  squash: number;
  light: boolean;
};

export class App {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private dpr: number = 1;
  private width: number = 0;
  private height: number = 0;

  private snowflakes: Snowflake[] = [];
  private footprints: Footprint[] = [];
  private person: Person | null = null;
  private lumps: SnowLump[] = [];

  private groundTop: number = 0;
  private groundBottom: number = 0;
  private groundHeight: number = 0;

  private lastTime: number = 0;
  private elapsedSeconds: number = 0;
  private animationId: number | null = null;

  private handleResizeBound = () => this.handleResize();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2D context not supported");
    }
    this.ctx = ctx;
    this.dpr = window.devicePixelRatio || 1;

    this.handleResize();
    window.addEventListener("resize", this.handleResizeBound);

    this.lastTime = performance.now();
    this.animationId = requestAnimationFrame(this.loop);
  }

    private handleResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (!w || !h) return;

    this.width = w;
    this.height = h;

    this.canvas.width = w * this.dpr;
    this.canvas.height = h * this.dpr;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.groundTop = this.height * 0.25;
    this.groundBottom = this.height * 0.95;
    this.groundHeight = this.groundBottom - this.groundTop;

    this.generateSnowLumps();
    this.initSnow();
    this.resetPerson();
    }



  private initSnow() {
    const count = Math.floor((this.width * this.height) / 8000);
    this.snowflakes = [];
    for (let i = 0; i < count; i++) {
      this.snowflakes.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        speedY: 40 + Math.random() * 80,
        driftX: -10 + Math.random() * 20,
        radius: 1 + Math.random() * 1.8,
      });
    }
  }

  private generateSnowLumps() {
    const count = 130;
    this.lumps = [];
    for (let i = 0; i < count; i++) {
      const x = Math.random() * this.width;
      const y =
        this.groundTop + Math.random() * (this.groundBottom - this.groundTop);
      const radius = 18 + Math.random() * 38;
      const squash = 0.5 + Math.random() * 0.4;
      const light = Math.random() > 0.5;
      this.lumps.push({ x, y, radius, squash, light });
    }
  }

  private resetPerson() {
    const y = this.groundTop + this.groundHeight * 0.3;
    this.person = {
      x: -80,
      y,
      speed: 60, // px/sec
      height: 50,
      lastFootX: -80,
      stepToggle: false,
    };
  }

  private loop = (time: number) => {
    const dt = Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;
    this.elapsedSeconds += dt;

    this.update(dt);
    this.render();

    this.animationId = requestAnimationFrame(this.loop);
  };

  private update(dt: number) {
    this.updateSnow(dt);
    this.updatePerson(dt);
    this.updateFootprints();
  }

  private updateSnow(dt: number) {
    for (const flake of this.snowflakes) {
      flake.y += flake.speedY * dt;
      flake.x += flake.driftX * dt;

      if (flake.y > this.height + 10) {
        flake.y = -10 - Math.random() * 40;
        flake.x = Math.random() * this.width;
      }
      if (flake.x < -20) flake.x = this.width + 20;
      if (flake.x > this.width + 20) flake.x = -20;
    }
  }

  private updatePerson(dt: number) {
    if (!this.person) return;
    const p = this.person;

    p.x += p.speed * dt;

    // 발자국 생성
    const stepDistance = 16;
    if (p.x - p.lastFootX > stepDistance) {
      const offsetY = p.stepToggle ? -5 : 5;
      this.footprints.push({
        x: p.x,
        y: p.y + offsetY,
        createdAt: this.elapsedSeconds,
      });
      p.lastFootX = p.x;
      p.stepToggle = !p.stepToggle;
    }

    // 캔버스 밖으로 나가면 다시 등장
    if (p.x > this.width + 80) {
      this.resetPerson();
    }
  }

  private updateFootprints() {
    const life = 10; // seconds: 눈이 쌓이면서 사라지는 시간
    this.footprints = this.footprints.filter(
      (f) => this.elapsedSeconds - f.createdAt < life
    );
  }

  private renderBackground() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, "#020617");
    grad.addColorStop(1, "#020012");

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  private renderGround() {
    const ctx = this.ctx;

    // 기본 눈 색
    ctx.fillStyle = "#f9fafb";
    ctx.fillRect(0, this.groundTop, this.width, this.groundHeight);

    // 약간의 퍼린 느낌: 밝고 어두운 패치들
    for (const lump of this.lumps) {
      ctx.beginPath();
      ctx.ellipse(
        lump.x,
        lump.y,
        lump.radius,
        lump.radius * lump.squash,
        0,
        0,
        Math.PI * 2
      );
      if (lump.light) {
        ctx.fillStyle = "rgba(255,255,255,0.15)";
      } else {
        ctx.fillStyle = "rgba(148,163,184,0.18)";
      }
      ctx.fill();
    }

    // 약간의 원근감을 위해 위쪽을 살짝 어둡게 그라데이션
    const g = ctx.createLinearGradient(
      0,
      this.groundTop,
      0,
      this.groundBottom
    );
    g.addColorStop(0, "rgba(15,23,42,0.12)");
    g.addColorStop(1, "rgba(15,23,42,0.02)");
    ctx.fillStyle = g;
    ctx.fillRect(0, this.groundTop, this.width, this.groundHeight);
  }

  private renderFootprints() {
    const ctx = this.ctx;
    const life = 10;

    for (const f of this.footprints) {
      const age = this.elapsedSeconds - f.createdAt;
      const t = Math.max(0, Math.min(1, age / life));
      const alpha = 1 - t; // 시간이 지날수록 점점 덮여서 사라짐

      ctx.save();
      ctx.globalAlpha = alpha * 0.9;
      // 눈이 눌린 느낌 + 아주 살짝 아래 잔디가 비치는 느낌 (쿨한 회청+연두 살짝 섞인 느낌)
      ctx.fillStyle = "rgba(148, 163, 184, 0.9)";
      ctx.beginPath();
      ctx.ellipse(f.x, f.y, 8, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private renderPerson() {
    const ctx = this.ctx;
    const p = this.person;
    if (!p) return;

    // 쿼터뷰: 위에서 약간 기울어진 사람 실루엣 정도로만
    ctx.save();

    // 그림자 (눈 위에 비친 사람 그림자)
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "rgba(15,23,42,0.9)";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + p.height * 0.18, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;

    // 몸통
    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.roundRect(
      p.x - 6,
      p.y - p.height * 0.5,
      12,
      p.height * 0.6,
      6
    );
    ctx.fill();

    // 머리
    ctx.beginPath();
    ctx.arc(p.x, p.y - p.height * 0.6, 7, 0, Math.PI * 2);
    ctx.fillStyle = "#e5e7eb";
    ctx.fill();

    // 목도리 느낌
    ctx.fillStyle = "#38bdf8";
    ctx.fillRect(p.x - 8, p.y - p.height * 0.45, 16, 5);

    ctx.restore();
  }

  private renderSnow() {
    const ctx = this.ctx;
    ctx.save();
    for (const flake of this.snowflakes) {
      ctx.beginPath();
      ctx.fillStyle = "rgba(248,250,252,0.92)";
      ctx.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private renderWindowFrame() {
    const ctx = this.ctx;
    const w = this.width;

    const frameHeight = this.groundTop * 0.3;

    // 실내/창틀 위쪽 영역
    ctx.fillStyle = "rgba(15,23,42,0.96)";
    ctx.fillRect(0, 0, w, frameHeight);

    // 창틀 라인
    ctx.fillStyle = "rgba(148,163,184,0.7)";
    ctx.fillRect(0, frameHeight, w, 2);

    // 실내 반사 약간 (유저가 안쪽에서 밖을 내려다보는 느낌)
    const g = ctx.createLinearGradient(0, 0, 0, frameHeight);
    g.addColorStop(0, "rgba(15,23,42,0.9)");
    g.addColorStop(1, "rgba(15,23,42,0.0)");

    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, frameHeight);
  }

  private render() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    this.renderBackground();
    this.renderGround();
    this.renderFootprints();
    this.renderPerson();
    this.renderSnow();
    this.renderWindowFrame();
  }

  dispose() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
    }
    window.removeEventListener("resize", this.handleResizeBound);
  }
}
