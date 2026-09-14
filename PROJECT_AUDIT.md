# Prime 프로젝트 점검

점검일: 2026-09-14. 기준 커밋: `405495f`.

아래 내용은 수정 전 초기 점검 기록이다. 이후 수정 및 검증 결과는 [MAINTENANCE_260914.md](MAINTENANCE_260914.md)에 기록한다.

## 현재 상태

- Git 추적 파일 91개. Next.js App Router 기반 인터랙티브 포트폴리오이며 작품 페이지 10개와 Laboratory, 홈으로 구성된다.
- 마지막 커밋은 2026-03-16이다. 사용자가 언급한 10개월과 달리 현재 main 기록상 약 6개월이다.
- 점검 시작 시 작업 트리는 깨끗했다. 소스 및 의존성 변경 없이 이 보고서만 추가했다.
- `npx --no-install tsc --noEmit`: 통과.
- `npm run build`: 네트워크 허용 후 통과. 모든 작품 경로가 정적 페이지로 생성된다. 첫 실행은 Google Fonts 다운로드 차단 때문에 실패했다.
- `npm run lint`: 오류 28개, 경고 25개로 실패.
- 최신 레지스트리의 `npm audit --json`: 취약 패키지 15개(critical 1, high 9, moderate 4, low 1). 개발용 간접 의존성도 포함한 수치이며 실제 악용 가능성은 기능 및 배포 환경에 따라 다르다. 제한된 환경의 첫 audit 결과 0개는 최신 보안 상태를 반영하지 않아 사용하지 않았다.

## 우선순위별 발견 사항

### 1. 보안 의존성 업데이트

현재 Next.js는 16.0.7, React/React DOM은 19.2.0, eslint-config-next는 16.0.3이다. 레지스트리 조회 시 Next.js 최신 버전은 16.3.5였다. Next.js와 eslint-config-next를 같은 버전으로 맞추고, React 계열 및 간접 의존성 보안 패치를 적용한 뒤 빌드와 작품 동작을 재검증해야 한다.

Next.js 16.0.7은 Windows 서버에서 원격 코드 실행이 가능한 취약 버전 범위에 포함된다. 이 특정 취약점의 수정 버전은 16.3.3이다. 로컬 Windows 개발 환경이라는 사실만으로 외부 노출된 서버라고 판단할 수는 없다. 근거: [Next.js 공식 보안 공지](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36).

Three.js(0.181.2 → 0.186.0), ESLint(9 → 10), TypeScript(5 → 7), framer-motion(12 → 13) 등의 큰 버전 변경은 보안 패치와 분리해 호환성을 확인하는 편이 좋다. `npm audit fix --force`를 일괄 적용하기보다 변경 범위를 검토해야 한다.

### 2. 이벤트 및 그래픽 자원 해제

- `app/works/Perlin-noise/core/App.ts:61`: 익명 함수로 등록한 window click 이벤트를 destroy에서 제거하지 않는다. 페이지 재진입 시 이전 인스턴스가 이벤트에 남아 중복 처리될 수 있다.
- `app/works/Snow-walker/core/App.ts:105,551`, `app/works/weatherProject/core/App.ts:79,781`: 등록과 해제에서 각각 `this.resize.bind(this)`를 호출한다. 매번 다른 함수가 만들어져 resize 이벤트가 제거되지 않는다. 동일한 handler를 보관해 사용해야 한다.
- `app/works/Vortex_GPU/core/FluidGL.ts:652,660`: resize마다 FBO/texture를 새로 만들지만 이전 자원을 삭제하지 않으며 destroy도 비어 있다. 반복 resize 시 GPU 자원 누적 위험이 있다. canvas 제거에만 해제를 맡기지 말고 texture/framebuffer/program/buffer를 명시적으로 정리해야 한다.
- Snow-walker와 weatherProject의 destroy는 renderer만 dispose한다. scene의 geometry/material/texture, weatherProject의 composer/pass 및 mixer 정리도 필요하다. 모델 비동기 로드 완료가 unmount 뒤에 실행되는 상황에 대한 방어도 보이지 않는다.

위 항목은 코드에서 확인한 문제이며 브라우저 메모리 프로파일로 누적량을 측정하지는 않았다.

### 3. 린트 및 유지보수

- ASCII-Donut, Geo-centr, Helio-centr에 명시적 `any` 사용이 다수 있다.
- Emergence의 effect 내 동기 setState 2건, Vortex/Vortex_GPU의 React state에 담긴 App 인스턴스 직접 수정이 lint 오류다. 외부 렌더러 인스턴스는 ref로 관리하는 구조를 검토할 수 있다.
- prefer-const 4건과 Perlin-noise의 prefer-spread 1건도 오류다.
- 경고는 사용하지 않는 변수/import, effect 의존성 누락, Fluid의 img 최적화 등이다.
- 자동 테스트 및 GitHub Actions 설정이 없다. 최소한 타입 검사와 빌드를 지속적으로 실행하고, lint 정리 후 lint도 포함하는 것이 좋다.

### 4. 문서와 파일 정리

- README는 create-next-app 기본 템플릿이다. 실제 Courier Prime 대신 Geist를 설명한다. 프로젝트 소개, 작품 목록, 설치 조건, 실행/검증 및 GitHub 작업 방법으로 교체할 필요가 있다.
- CLAUDE.md는 이전 orbit/orbit2 등의 경로를 설명한다. Snow-walker는 실제 Three.js 구현인데 2D Canvas 목록에 있고, Emergence/Vortex/Vortex_GPU 설명이 빠져 있다.
- `app/works/weatherProject/core/App copy.ts`는 활성 CanvasApp에서 import되지 않는 백업 코드다. 삭제 여부를 검토하고 Git 기록으로 백업을 관리하면 중복 유지보수를 줄일 수 있다.
- public 최대 모델은 약 20.9 MB와 18.8 MB다. Snow-walker가 이 모델을 로드하므로 모바일 초기 다운로드와 GPU 비용을 확인하고 모델 압축을 검토해야 한다.
- .gitignore가 node_modules, .next, .env*, pem 등을 제외한다. 추적 파일에서 .env/pem/key 파일은 발견하지 않았다. Git 전체 이력의 비밀값 탐지는 수행하지 않았다.
- Node 24.11.1/npm 11.6.2에서 검증했지만 package.json에 engines 등 실행 버전 고정이 없다.

## GitHub 연결

이미 origin이 `https://github.com/Byunjaewoong/Prime_project.git`로 설정되어 있다. main은 origin/main을 추적한다. 실제 `git ls-remote origin refs/heads/main` 조회에서도 로컬과 같은 `405495f466b912fbf3d9f053ae4227d6390e5d9e`가 확인됐다.

따라서 저장소 연결을 새로 만들 필요는 없다. 읽기 접근은 확인했지만 쓰기 권한/인증과 push는 검증하지 않았다. GitHub CLI(gh)는 현재 PATH에서 발견되지 않았으며 일반 Git 사용에는 필수가 아니다.

일반적인 수정 업로드 절차:

```powershell
git status
git add <검토한 파일 경로>
git commit -m "Describe the change"
git push origin main
```

여러 변경을 진행할 때에는 작업 브랜치를 만들고 GitHub Pull Request로 검토하는 방식도 가능하다. 이번 점검에서는 commit/push하지 않았다.

## 점검 범위와 다음 작업

전체 파일 목록, 설정/문서/의존성, 라우트 연결 및 렌더러 생명주기 코드를 조사하고 타입 검사·lint·프로덕션 빌드·최신 보안/버전 조회·원격 main 조회를 실행했다. 모든 파일에 대한 행별 검토, 브라우저에서의 시각적 비교, 모바일/WebGL 기기별 실행, 배포 상태 및 GitHub 쓰기 권한 검증은 포함하지 않았다.

권장 순서: 보안 업데이트 → 이벤트/GPU 자원 해제 → lint 정리 → README/CLAUDE 갱신 → GitHub 자동 검증 도입.
