// app/works/donut/core/App.ts
import { Donut } from "./donut";

// 🔤 폰트 패밀리 매핑 (key → CSS font-family 문자열)
const FONT_FAMILIES: Record<string, string> = {
  gothic:
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  serif: '"Times New Roman", "Nanum Myeongjo", serif',
  mono: '"JetBrains Mono", "DM Mono", monospace',

  // 한글 산세리프
  hangulSans:
    '"Noto Sans KR", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  // 한글 명조
  hangulSerif: '"Nanum Myeongjo", "Noto Serif KR", serif',

  // 한글+한자 포함 CJK 계열
  cjkSans:
    '"Noto Sans CJK KR", "Noto Sans KR", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  cjkSerif:
    '"Noto Serif CJK KR", "Noto Serif KR", "Nanum Myeongjo", serif',

  // 수식·기호용
  math: '"STIX Two Math", "Latin Modern Math", "Times New Roman", serif',
  // 아랍어용
  arabic: '"Amiri", "Scheherazade New", serif',
};

function getFontFamily(key: string) {
  return FONT_FAMILIES[key] ?? FONT_FAMILIES["gothic"];
}

// 🎲 폰트 + 문자셋 랜덤 프리셋
const FONT_CHARSET_PRESETS: { fontKey: string; charsetKey: string }[] = [
  { fontKey: "gothic", charsetKey: "latin_inverse" },
  { fontKey: "serif", charsetKey: "latin" },
  { fontKey: "mono", charsetKey: "latin_void" },
  { fontKey: "mono", charsetKey: "latin_void_2" },
  { fontKey: "hangulSans", charsetKey: "hangul_void" },
  { fontKey: "hangulSerif", charsetKey: "hangul" },
  { fontKey: "cjkSans", charsetKey: "hanja" },
  { fontKey: "math", charsetKey: "math" },
  { fontKey: "arabic", charsetKey: "arabic" },
  { fontKey: "gothic", charsetKey: "DNA" },
  { fontKey: "serif", charsetKey: "DNA_2" },
  { fontKey: "mono", charsetKey: "DNA_3" },
  { fontKey: "gothic", charsetKey: "DNA_4" },
];

type DonutConfig = {
  size: number; // 0 ~ 1
  distance: number; // 0 ~ 1
  speed: number; // 0 ~ 1
  rotX: number; // -1 ~ 1
  rotY: number;
  rotZ: number;
  lightX: number; // -1 ~ 1
  lightY: number;
  lightZ: number;

  // 🎨 글자 컬러 모드 + 시드
  colorMode: boolean;
  colorSeed: number;

  // 🆕 폰트 + 문자셋 키
  fontKey: string; // "gothic" | "serif" | "mono" | "hangulSans" | ...
  charsetKey: string; // "latin" | "hangul" | "hanja" | "arabic" | "math" | ...

  // 🅰 폰트 크기 (px)
  fontSize: number;

  // 🌀 도넛 모드 (0: dot, 1: ascii)
  mode: number;
};

export class App {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  pixelRatio: number;

  stageWidth = 0;
  stageHeight = 0;

  e = 0;

  L2donut: number;
  magfactor: number;
  resolutionCircle: number;
  resolutionTube: number;
  donutOuterSize: number;
  donutinternalSize: number;
  xAngle: number;
  yAngle: number;
  zAngle: number;
  mode: number;
  fontSize: number;

  donut: Donut | null = null;

  private animationId: number | null = null;
  private resizeHandler: () => void;
  private clickHandler: (e: MouseEvent) => void;

  private config: DonutConfig = {
    size: 0.5,
    distance: 0.5,
    speed: 0.5,
    rotX: 0.7,
    rotY: 0.8,
    rotZ: 0.6,
    lightX: -1 / Math.sqrt(3),
    lightY: -1 / Math.sqrt(3),
    lightZ: 1 / Math.sqrt(3),

    colorMode: false,
    colorSeed: 0,

    fontKey: "gothic",
    charsetKey: "latin",

    fontSize: 12,

    mode: 1,
  };

  lightX: number;
  lightY: number;
  lightZ: number;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2D context not available");
    }
    this.ctx = ctx;

    this.pixelRatio = 1;

    const isMobile = window.innerWidth < 768;

    if (isMobile) {
      this.config.size = this.config.size * 0.3;  // 기존의 절반
      // this.config.distance = this.config.distance * 0.5; // 거리도 줄임
    }

    // 원본 기준 초기 값
    this.L2donut = 10;
    this.magfactor = 600;

    // 해상도 (조절해서 성능 튜닝)
    this.resolutionCircle = 100;
    this.resolutionTube = 200;

    this.donutOuterSize = 2;
    this.donutinternalSize = 1;

    this.xAngle = (-2 * Math.PI) / 350;
    this.yAngle = (2 * Math.PI) / 150;
    this.zAngle = (-2 * Math.PI) / 700;

    this.mode = this.config.mode;
    this.fontSize = this.config.fontSize;

    this.lightX = this.config.lightX;
    this.lightY = this.config.lightY;
    this.lightZ = this.config.lightZ;

    this.resizeHandler = this.resize.bind(this);
    window.addEventListener("resize", this.resizeHandler, false);
    this.resize();

    // ⬇⬇ 클릭 시: 폰트/문자셋/모드/색 전부 랜덤화 (dice + paint 효과)
    this.clickHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;

      if (
        target &&
        (target.closest(".orbit-fab") ||
          target.closest(".orbit-side-panel") ||
          target.closest(".orbit-control-panel"))
      ) {
        return;
      }

      const rect = this.canvas.getBoundingClientRect();
      if (
        e.clientX < rect.left ||
        e.clientX > rect.right ||
        e.clientY < rect.top ||
        e.clientY > rect.bottom
      ) {
        return;
      }

      // 🎲 + 🎨 한 번에
      this.randomizeVisualStyle({ withPaint: true });
    };
    window.addEventListener("click", this.clickHandler);

    this.rebuildDonut();

    this.animate = this.animate.bind(this);
    this.animationId = window.requestAnimationFrame(this.animate);
  }

  private applyConfigToParameters() {
    const {
      size,
      distance,
      speed,
      rotX,
      rotY,
      rotZ,
      lightX,
      lightY,
      lightZ,
    } = this.config;

    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    const sizeNorm = clamp01(size);
    const distNorm = clamp01(distance);
    const speedNorm = clamp01(speed);

    // ----- 회전 방향 벡터 정규화 -----
    const clampAxis = (v: number) => Math.max(-1, Math.min(1, v));
    let vx = clampAxis(rotX);
    let vy = clampAxis(rotY);
    let vz = clampAxis(rotZ);

    let lenDir = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (lenDir < 1e-3) {
      vx = 1;
      vy = 0;
      vz = 0;
      lenDir = 1;
    }
    const dirX = vx / lenDir;
    const dirY = vy / lenDir;
    const dirZ = vz / lenDir;

    // 크기 (도넛 반지름)
    this.donutinternalSize = 1.5 + sizeNorm * 1.5; // 1.5 ~ 3.0
    this.donutOuterSize = 3 + sizeNorm * 3.0; // 3 ~ 6

    // 거리감
    this.L2donut = 8 + distNorm * 22; // 8 ~ 30
    this.magfactor = 400 + (1 - distNorm) * 400; // 400 ~ 800

    // 속도
    const speedFactor = 0.3 + speedNorm * 2.0;

    const baseX = (-2 * Math.PI) / 350;
    const baseY = (2 * Math.PI) / 150;
    const baseZ = (-2 * Math.PI) / 700;

    this.xAngle = baseX * speedFactor * dirX;
    this.yAngle = baseY * speedFactor * dirY;
    this.zAngle = baseZ * speedFactor * dirZ;

    // 빛 방향 정규화
    const lenLight = Math.sqrt(
      lightX * lightX + lightY * lightY + lightZ * lightZ
    );
    if (lenLight > 1e-3) {
      this.lightX = lightX / lenLight;
      this.lightY = lightY / lenLight;
      this.lightZ = lightZ / lenLight;
    }
  }

  private rebuildDonut() {
    this.applyConfigToParameters();

    if (this.stageWidth === 0 || this.stageHeight === 0) return;

    this.fontSize = this.config.fontSize;
    this.mode = this.config.mode;

    this.donut = new Donut(
      this.mode,
      this.fontSize,
      this.canvas,
      this.stageWidth,
      this.stageHeight,
      this.e,
      this.donutinternalSize,
      this.donutOuterSize,
      this.stageWidth / 2,
      this.stageHeight / 2,
      this.magfactor,
      this.L2donut,
      this.resolutionCircle,
      this.resolutionTube,
      this.xAngle,
      this.yAngle,
      this.zAngle
    );

    this.donut.setLightDirection(this.lightX, this.lightY, this.lightZ);
    this.donut.setColorMode(this.config.colorMode, this.config.colorSeed);

    // 폰트/문자셋 적용
    this.donut.setFontSize(this.config.fontSize);
    this.donut.setFontFamily(getFontFamily(this.config.fontKey));
    this.donut.setCharsetPreset(this.config.charsetKey as any);
  }

  resize() {
    this.stageWidth = window.innerWidth;
    this.stageHeight = window.innerHeight;

    this.canvas.width = this.stageWidth * this.pixelRatio;
    this.canvas.height = this.stageHeight * this.pixelRatio;

    this.rebuildDonut();
  }

  animate() {
    this.animationId = window.requestAnimationFrame(this.animate);
    this.ctx.clearRect(0, 0, this.stageWidth, this.stageHeight);

    if (!this.donut) return;

    this.donut.rotation();
    this.donut.drawDonut();
  }

  updateConfig(partial: Partial<DonutConfig>) {
    this.config = {
      ...this.config,
      ...partial,
    };

    const sizeChanged = partial.size !== undefined;
    const distanceChanged = partial.distance !== undefined;
    const speedChanged = partial.speed !== undefined;
    const rotChanged =
      partial.rotX !== undefined ||
      partial.rotY !== undefined ||
      partial.rotZ !== undefined;
    const lightChanged =
      partial.lightX !== undefined ||
      partial.lightY !== undefined ||
      partial.lightZ !== undefined;
    const colorChanged =
      partial.colorMode !== undefined || partial.colorSeed !== undefined;

    const fontSizeChanged = partial.fontSize !== undefined;
    const fontKeyChanged = partial.fontKey !== undefined;
    const charsetChanged = partial.charsetKey !== undefined;
    const modeChanged = partial.mode !== undefined;

    this.applyConfigToParameters();

    if (!this.donut) {
      this.rebuildDonut();
      return;
    }

    if (rotChanged || speedChanged) {
      this.donut.setRotationAngles(this.xAngle, this.yAngle, this.zAngle);
    }

    if (distanceChanged) {
      this.donut.setProjectionParams(this.magfactor, this.L2donut);
    }

    if (lightChanged) {
      this.donut.setLightDirection(this.lightX, this.lightY, this.lightZ);
    }

    if (colorChanged) {
      this.donut.setColorMode(this.config.colorMode, this.config.colorSeed);
    }

    if (fontSizeChanged) {
      this.donut.setFontSize(this.config.fontSize);
    }

    if (fontKeyChanged) {
      this.donut.setFontFamily(getFontFamily(this.config.fontKey));
    }

    if (charsetChanged) {
      this.donut.setCharsetPreset(this.config.charsetKey as any);
    }

    if (modeChanged) {
      this.mode = this.config.mode;
      this.donut.setMode(this.mode);
    }

    if (sizeChanged) {
      this.rebuildDonut();
    }
  }

  // 🎲 외부에서 호출할 수 있는 랜덤 스타일 함수
  //   withPaint = true면 색 모드 + 팔레트까지 같이 랜덤
  public randomizeVisualStyle(options?: { withPaint?: boolean }) {
    const withPaint = options?.withPaint ?? false;

    const pick =
      FONT_CHARSET_PRESETS[
        Math.floor(Math.random() * FONT_CHARSET_PRESETS.length)
      ];

    const nextMode = Math.random() < (1/FONT_CHARSET_PRESETS.length) ? 0 : 1;
    const patch: Partial<DonutConfig> = {
      fontKey: pick.fontKey,
      charsetKey: pick.charsetKey,
      mode: nextMode,
    };

    if (withPaint) {
      patch.colorMode = true;
      patch.colorSeed = Date.now();
    }

    this.updateConfig(patch);
  }

  destroy() {
    if (this.animationId !== null) {
      window.cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    window.removeEventListener("resize", this.resizeHandler);
    window.removeEventListener("click", this.clickHandler);
    this.donut = null;
  }
}
