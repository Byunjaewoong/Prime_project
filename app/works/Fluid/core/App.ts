// app/works/fluid/core/App.ts
import { createNoise3D } from "simplex-noise";
import { FluidUtils } from "./utils";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  color: string;
  rgb: { r: number; g: number; b: number };
  speed: number;
};

export class App {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  stageWidth = 0;
  stageHeight = 0;
  pixelRatio = 1;

  private particles: Particle[] = [];
  private particleCount = 1000; 
  private noise3D = createNoise3D();
  private time = 0;

  // ✨ 실행 상태 제어 플래그 (기본값 false: 정지 상태로 시작)
  private isRunning: boolean = false;

  // 반응형 윈도우 변수
  private windowRadius = 0;
  private centerX = 0;
  private centerY = 0;

  private readonly imgOriginalWidth = 2559; 
  private readonly imgOriginalHeight = 1440;
  private readonly circleRadiusRatio = 0.29; 

  private colors = [
    "#013771", 
    "#005580", 
    "#00648b", 
    "#005685", 
    "#004078", 
    "#00336e", 
    "#046d93", 
    "#005080", 
  ];

  private animationId: number | null = null;
  private resizeHandler: () => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = this.canvas.getContext("2d", { alpha: true });
    if (!ctx) throw new Error("2D context not available");
    this.ctx = ctx;

    this.pixelRatio = typeof window !== 'undefined' && window.devicePixelRatio > 1 ? 2 : 1;

    this.resizeHandler = this.resize.bind(this);
    window.addEventListener("resize", this.resizeHandler, false);
    this.resize();

    this.initParticles();

    this.animate = this.animate.bind(this);
    this.animationId = window.requestAnimationFrame(this.animate);
  }

  // ✨ 외부에서 애니메이션 실행 여부를 제어하는 메서드
  public setIsRunning(state: boolean) {
    this.isRunning = state;
  }

  resize() {
    this.stageWidth = document.body.clientWidth;
    this.stageHeight = document.body.clientHeight;

    this.canvas.width = this.stageWidth * this.pixelRatio;
    this.canvas.height = this.stageHeight * this.pixelRatio;
    this.ctx.scale(this.pixelRatio, this.pixelRatio);

    const screenRatio = this.stageWidth / this.stageHeight;
    const imageRatio = this.imgOriginalWidth / this.imgOriginalHeight;

    let renderImgHeight;

    if (screenRatio > imageRatio) {
      renderImgHeight = this.stageWidth / imageRatio;
    } else {
      renderImgHeight = this.stageHeight;
    }

    this.centerX = this.stageWidth / 2;
    this.centerY = this.stageHeight / 2;
    this.windowRadius = renderImgHeight * this.circleRadiusRatio;
  }

  initParticles() {
    this.particles = [];
    for (let i = 0; i < this.particleCount; i++) {
      this.particles.push(this.createParticle());
    }
  }

  createParticle(): Particle {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * this.windowRadius;
    
    const colorIdx = Math.random() > 0.8 
      ? Math.floor(FluidUtils.random(4, 7)) 
      : Math.floor(FluidUtils.random(0, 4));
    
    const hexColor = this.colors[colorIdx];

    return {
      x: this.centerX + Math.cos(angle) * r,
      y: this.centerY + Math.sin(angle) * r,
      vx: 0,
      vy: 0,
      age: 0,
      life: FluidUtils.random(100, 200),
      size: FluidUtils.random(50, 100),
      speed: FluidUtils.random(5, 15),
      color: hexColor,
      rgb: FluidUtils.hexToRgb(hexColor),
    };
  }

  animate() {
    this.animationId = window.requestAnimationFrame(this.animate);

    // ✨ isRunning이 false면 그리기 로직을 건너뜀 (화면 정지 효과)
    if (!this.isRunning) return;

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.arc(this.centerX, this.centerY, this.windowRadius, 0, Math.PI * 2);
    this.ctx.clip();

    this.ctx.fillStyle = "rgba(2, 12, 27, 0.1)";
    this.ctx.fillRect(0, 0, this.stageWidth, this.stageHeight);

    this.time += 0.002;
    const noiseScale = 0.02;

    this.particles.forEach((p, index) => {
      const noiseVal = this.noise3D(p.x * noiseScale, p.y * noiseScale, this.time);
      const angle = noiseVal * Math.PI * 5;

      p.vx += Math.cos(angle) * 0.05;
      p.vy += Math.sin(angle) * 0.05;
      
      p.x += p.vx * p.speed;
      p.y += p.vy * p.speed;
      
      p.vx *= 0.9;
      p.vy *= 0.9;
      
      p.age++;

      const gradient = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
      
      gradient.addColorStop(0, `rgba(${p.rgb.r}, ${p.rgb.g}, ${p.rgb.b}, 1)`);
      gradient.addColorStop(0.4, `rgba(${p.rgb.r}, ${p.rgb.g}, ${p.rgb.b}, 0.4)`);
      gradient.addColorStop(1, `rgba(${p.rgb.r}, ${p.rgb.g}, ${p.rgb.b}, 0)`);

      this.ctx.beginPath();
      this.ctx.fillStyle = gradient;
      this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      this.ctx.fill();

      const dx = p.x - this.centerX;
      const dy = p.y - this.centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > this.windowRadius || p.age > p.life) {
        if (Math.random() > 0.1) {
             this.particles[index] = this.createParticle();
        }
      }
    });

    this.ctx.restore();
  }

  destroy() {
    if (this.animationId !== null) {
      window.cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    window.removeEventListener("resize", this.resizeHandler);
  }
}
