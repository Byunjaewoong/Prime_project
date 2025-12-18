// app/works/fluid/core/utils.ts

export class FluidUtils {
  static random(min: number, max: number): number {
    return Math.random() * (max - min) + min;
  }

  // ✨ Hex 색상(#ffffff)을 RGB 객체({r,g,b})로 변환하는 함수 추가
  static hexToRgb(hex: string) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : { r: 0, g: 0, b: 0 }; // 실패 시 검정
  }
}
