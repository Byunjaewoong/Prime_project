# Prime

GrimGriGi의 인터랙티브 2D/3D 크리에이티브 코딩 포트폴리오입니다.

## 실행

Node.js 24와 npm을 사용합니다.

```powershell
npm ci
npm run dev
```

http://localhost:3000 에서 실행합니다. 프로덕션은 npm run build 후 npm start로 실행합니다.
빌드 시 Courier Prime 폰트를 다운로드하므로 Google Fonts에 접근할 수 있어야 합니다.

## 작품

| 경로 | 구현 |
| --- | --- |
| /works/Geo-centr | Canvas 2D, 마우스 태양과 행성 생성 |
| /works/Helio-centr | Canvas 2D, 고정 태양과 공전 |
| /works/ASCII-Donut | Canvas 2D, ASCII 도넛과 문자/빛/색 제어 |
| /works/Perlin-noise | Canvas 2D, 절차적 파형 |
| /works/Snow-walker | Three.js, 보행 모델·발자국·눈밭/초록/금빛 잔디·우클릭 나무 |
| /works/Emergence | Lenia, Boids, Gray-Scott, Physarum 시뮬레이션 |
| /works/Vortex | CPU 유체 계산, GPU 고해상도 색상 표현 |
| /works/Vortex_GPU | WebGL2 GPU 유체 시뮬레이션 |
| /works/Fluid | Canvas 2D, 이미지·블렌드·사운드 |
| /works/weatherProject | Three.js, 인물·태양·후처리 |

홈 Work Archives와 /works/laboratory에서 작품을 엽니다. WebGL 작품은 지원되는 브라우저가 필요합니다.

## 검증

```powershell
npm run lint -- --max-warnings=0
npm run build
npm run typecheck
npm audit
```

GitHub Actions에서도 lint, build, typecheck를 실행합니다.
브라우저 검증 스크립트는 scripts/verify-browser.mjs이며, 임시 설치한 Playwright의 package.json 경로를 인자로 전달합니다. 로컬 프로덕션 서버와 Chrome이 필요합니다.
스크린샷과 결과는 artifacts/browser-260914에 생성됩니다.

## GitHub 및 백업

원격 저장소: https://github.com/Byunjaewoong/Prime_project
수정 전 2026-09-14 백업은 backup-260914 브랜치이며 기준 커밋은 405495f입니다.
이 백업은 Git이 추적하는 소스와 에셋을 보존합니다. node_modules, .next, .env 및 미추적 로컬 파일은 포함하지 않습니다.

변경한 파일을 검토해 git add, git commit을 실행하고 git push origin main으로 업로드합니다.
기존 버전은 git switch backup-260914로 확인할 수 있습니다. 작업 중 변경 사항이 있으면 먼저 커밋하거나 보관해야 합니다.

초기 점검은 [PROJECT_AUDIT.md](PROJECT_AUDIT.md), 수정과 브라우저 검증 결과는 [MAINTENANCE_260914.md](MAINTENANCE_260914.md)를 참고하세요.

## Vortex 4K 개선

Vortex는 기존 CPU 흐름을 유지하고 색상 표현을 GPU로 처리합니다. 4K 화면에서도 움직임 격자는 1080p 기준 크기로 유지하며 색상은 최대 2048×1152(16:9), 출력은 3840×2160까지 사용합니다. WebGL2/부동소수점 framebuffer 미지원 또는 context loss 시 기존 Canvas 출력으로 전환합니다.

구현 전 백업: `backup-260914-before-vortex-4k` (`58afedf`). `vortex-4k-260914`에서 구현한 변경은 main에 반영하며, Vortex의 기본 Vorticity는 6.0입니다. 비교 결과와 되돌리는 방법은 [VORTEX_4K_260914.md](VORTEX_4K_260914.md)에 기록합니다.

## Snow-walker 필드 전환

왼쪽 클릭 또는 탭으로 눈밭 → 초록 잔디 → 금빛 잔디를 순환합니다. 인물·걷기 경로·발자국·기존 나무를 유지하며 바닥 재질과 조명을 부드럽게 전환합니다. 오른쪽 클릭은 클릭한 지면에 나무를 생성합니다.

구현 전 백업: `backup-260914-before-snow-fields` (`f19b283`). 작업 브랜치: `snow-fields-260914`. 구현 및 검증·복원 방법은 [SNOW_FIELDS_260914.md](SNOW_FIELDS_260914.md)에 기록합니다.
