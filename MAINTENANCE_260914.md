# 260914 유지보수 결과

## 백업

수정 전 `405495f466b912fbf3d9f053ae4227d6390e5d9e`를 로컬 `backup-260914` 브랜치로 보존했다. Git 추적 소스와 public 에셋을 포함하며 node_modules, .next, .env 및 미추적 파일은 포함하지 않는다. 기존 버전을 확인하려면 작업 중 변경 사항을 보관한 뒤 `git switch backup-260914`를 사용한다.

GitHub 업로드 대상은 기존 origin인 `https://github.com/Byunjaewoong/Prime_project.git`이다. 최초 백업 push는 자동 승인 검토에서 해당 목적지에 대한 구체적인 승인이 없다는 이유로 거부됐다. 목적지를 명시해 사용자 승인을 받은 뒤 수정 커밋 `35cc080`의 main과 `backup-260914`를 atomic push했고, 원격 커밋 일치를 확인했다. 이후 이 보고서의 업로드 완료 기록도 main에 반영한다.

## 변경 사항

- Next.js 16.0.7 → 16.3.5, React/React DOM 19.2.0 → 19.3.0, eslint-config-next 16.0.3 → 16.3.5. 나머지 의존성도 기존 package.json 호환 범위에서 갱신하고 보안 패치를 반영했다. Three.js 등의 큰 버전 변경은 적용하지 않았다.
- Perlin-noise click 이벤트, Snow-walker/weatherProject resize 이벤트를 등록 당시와 동일한 handler로 제거한다.
- Snow-walker/weatherProject의 scene geometry/material/texture, 그림자, mixer 및 후처리 자원을 정리한다. 비동기 모델 로드가 종료 뒤 완료되면 모델을 정리한다.
- Vortex_GPU의 resize에서 기존 texture/framebuffer를 삭제하고, 종료 시 program/buffer도 삭제한다. shader는 link 뒤 삭제 대상으로 표시한다.
- Fluid의 renderer를 mount 시 한 번 생성하고 navigation 시 animation frame과 이벤트를 정리한다. 이미지 배경은 Next Image로 전환했다.
- 행성 그룹과 ASCII 문자 설정에서 any를 제거하고 실제 타입으로 좁힌다. Vortex의 App 인스턴스는 React state 대신 ref로 관리한다.
- Emergence effect의 동기 setState를 제거하고 기존 200 ms 파라미터 polling을 유지한다.
- 미사용 코드/import와 prefer-const/prefer-spread 문제를 정리했다. 의도적으로 사용하지 않는 위치 인자는 밑줄 이름으로 명시했다.
- Snow-walker canvas의 유효하지 않은 CSS 크기 100을 100%로 수정했다.
- 활성 코드에서 사용하지 않는 weatherProject의 App copy.ts를 제거했다. 원본은 backup-260914와 Git 이력에 남아 있다.
- README/CLAUDE.md를 현재 경로와 구현으로 갱신하고 Node.js 24 실행 조건 및 typecheck 명령을 추가했다.
- GitHub Actions에 lint(경고 0), build, typecheck를 추가했다. 실제 원격 Actions 실행은 push 뒤 확인이 필요하다.

## 자동 검사

Node.js 24.11.1, npm 11.6.2에서 검증했다.

- `npm ci`: 잠금 파일에서 새로 설치 성공(375개 설치), 보안 검사 0건.
- `npm run lint -- --max-warnings=0`: 통과, 오류·경고 0.
- `npm run typecheck`: 통과.
- `npm run build`: 통과, 홈/Laboratory/작품 10개 모두 정적 페이지 생성.
- 네트워크 접근을 허용한 npm 보안 검사: 보고된 취약점 0.
- `git -c core.whitespace=cr-at-eol diff --check`: 통과. 기존 Windows CRLF는 유지한다.

## 브라우저 검증 방법

Playwright 1.63.0으로 실제 설치된 Chrome을 headless 실행하고 로컬 프로덕션 서버를 검사했다. 데스크톱 1280×800, 모바일 에뮬레이션 390×844 및 가로 화면을 사용했다. 브라우저 JS 오류, console error, 로컬 HTTP 오류, canvas 크기, 그리기 활동, 메뉴/가능한 슬라이더/벡터 토글, resize 및 홈 이동 뒤 렌더링 정지를 확인했다. Fluid는 오디오가 재생·정지되는 상태도 확인했다.

Emergence는 Lenia/Boids/Gray-Scott/Physarum을 각각 선택해 스크린샷을 만들었다. 캡처된 작품 화면과 하위 시뮬레이션을 직접 열어 시각적으로 검토했다.

최종 결과는 20/20 통과다. 전 경로 HTTP 200, 브라우저 JS/console 오류 및 로컬 HTTP 오류 0건, resize 뒤 가로 넘침 없음, 홈 이동 뒤 그리기 활동 0을 확인했다.

| 작품 | 데스크톱 Chrome | 모바일 에뮬레이션 |
| --- | --- | --- |
| Geo-centr | 통과 | 통과 |
| Helio-centr | 통과 | 통과 |
| ASCII-Donut | 통과 | 통과 |
| Perlin-noise | 통과 | 통과 |
| Snow-walker | 통과 | 통과 |
| Emergence (하위 4종 포함) | 통과 | 통과 |
| Vortex | 통과 | 통과 |
| Vortex_GPU | 통과 | 통과 |
| Fluid (오디오 상태 포함) | 통과 | 통과 |
| weatherProject | 통과 | 통과 |

스크립트: `scripts/verify-browser.mjs`. Chrome과 별도 Playwright 설치가 필요하다. Playwright package.json의 절대 경로를 인자로 전달한다. 예:

```powershell
node scripts/verify-browser.mjs <Playwright 설치 경로>/package.json
```

스크린샷 및 상세 JSON 결과는 Git에서 제외한 `artifacts/browser-260914/`에 보관한다. 이 검증은 실제 iPhone/Android 하드웨어나 Safari의 호환성 및 GPU 성능을 보장하지 않는다. 사운드는 브라우저의 재생 상태를 확인했으며 실제 스피커 청취는 하지 않았다. 이전 버전과의 픽셀 단위 비교 및 장시간 성능 검사는 수행하지 않았다.

## GPU 자원 및 모바일 터치 추가 검사

`scripts/verify-gpu-resources.mjs`로 모바일 화면에서 실제 Chrome CDP 터치 이동을 입력했다. 색상이 있는 픽셀 4,834개가 검출됐고 WebGL error는 0이었다.

| 자원 | 초기 | 네 번 resize 뒤 | 홈 이동 뒤 |
| --- | ---: | ---: | ---: |
| Texture | 8 | 8 | 0 |
| Framebuffer | 8 | 8 | 0 |
| Program | 12 | 12 | 0 |
| Shader | 0 | 0 | 0 |
| Buffer | 1 | 1 | 0 |

Shader의 0은 생성한 shader가 link 뒤 deleteShader로 표시된 상태를 뜻한다. 드라이버 내부의 물리적 GPU 메모리 사용량을 측정한 값은 아니다.
