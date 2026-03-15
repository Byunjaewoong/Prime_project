// hooks/useIsMobile.ts (파일을 새로 만드세요)
import { useState, useEffect } from "react";

export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // 클라이언트 사이드인지 체크 (window 객체 확인)
    if (typeof window !== "undefined") {
      const checkScreenSize = () => {
        setIsMobile(window.innerWidth < breakpoint);
      };

      // 초기 실행
      checkScreenSize();

      // 리사이즈 이벤트 감지
      window.addEventListener("resize", checkScreenSize);

      // 클린업
      return () => window.removeEventListener("resize", checkScreenSize);
    }
  }, [breakpoint]);

  return isMobile;
}
