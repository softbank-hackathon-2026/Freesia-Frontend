# Freesia Frontend
React + TypeScript + Vite 기반 플랫폼 콘솔입니다. Node.js 24 이상을 사용합니다.

## 실행
```sh
npm ci
npm run dev
```
http://localhost:5173 에서 확인합니다. `.env.example`을 `.env.local`로 복사해 `VITE_API_BASE_URL`을 설정할 수 있습니다. 기본 `/api`는 Vite가 접두사를 유지하여 `http://localhost:8000/api`로 전달합니다. 백엔드는 모든 API에 `/api`를 사용하는 버전이 필요합니다. 다른 서버에 직접 연결하려면 `VITE_API_BASE_URL=https://backend.example.com/api`처럼 `/api`까지 포함하세요. 배포 빌드에는 Vite 개발 프록시가 포함되지 않으므로 배포 환경도 `/api`를 유지하는 reverse proxy 또는 backend CORS 설정이 필요합니다.

## 검증 하네스
```sh
npm run check
npm run test:e2e
```
프록시 회귀 테스트는 실제 Vite 서버와 로컬 HTTP 테스트 서버로 GET·POST·SSE 경로 전달을 확인합니다. 실제 FastAPI·AI·클라우드 배포 검증은 아닙니다.

check는 TypeScript → ESLint → Node 네이티브 테스트 → Vite build를 실행하며 첫 실패 시 종료합니다. e2e는 로컬 Vite 서버와 설치된 Chrome을 실행하고 desktop/mobile 스크린샷을 `artifacts/`에 저장합니다. `CHROME_PATH` 환경변수로 실행 파일을 바꿀 수 있습니다. 브라우저 추가 다운로드는 하지 않습니다.

## 구현 경계
데모는 브라우저 샘플 데이터이며 API 오류 시 자동 대체하지 않습니다. API 모드는 실제 FastAPI 계약을 따르지만 현행 서버의 분석·배포도 mock 데이터입니다. 실제 AI 호출·AWS 리소스 생성·로그·메트릭·고객 앱 헬스체크는 연결되지 않았습니다. AI 대화로 작성한 Terraform은 미구축 설계이며 생성한 코드만으로 배포 가능 기반이 되지 않습니다. backend는 읽기 전용으로 참고했습니다. Git commit/push/PR이나 Terraform 실행은 수행하지 않습니다.

## 인프라 설계와 앱 흐름
메인은 **인프라 / 애플리케이션 / 통합**의 세 진입점입니다. 인프라는 **Space 생성 → AI 질의응답 → Terraform 생성·검토 → Apply · 데모 → 진행·결과 확인** 순서입니다. 답변과 코드는 같은 Space에 연결되며, 답변을 바꾸면 이전 코드와 적용 결과는 다시 검토해야 합니다. 생성 단계에서 시연용 Public·Multi-AZ·DB 격리 3종을 필수 템플릿으로 선택하지 않습니다.

실제 AI·Terraform 검증·클라우드 Apply는 연결되어 있지 않습니다. 인프라 코드는 구조화된 답변에 따른 데모이며 자유 입력을 AI가 분석했다고 표시하지 않습니다. 코드 미리보기·저장만으로 준비된 기반이 되지 않으며 명시적인 데모 Apply의 완료도 실제 AWS 리소스 생성을 의미하지 않습니다. 예전에 별도로 저장한 설계는 기존 자료로 보존합니다.

통합 → GitHub 샘플 연결 → 사용할 Repository 등록 → 앱에서 등록 Repository·기업/배포 대상 Infra Space 선택 → 배포 버튼 → 분석 근거·후보·캐릭터·분기 트리 → 후보 명시 선택 → Terraform·저장소·브랜치·반영 경로 확인 → 데모 commit/push·CI/CD → 결과 순서입니다. 앱 화면에는 Repository URL 입력란이 없습니다. 생성 코드는 불완전한 고정 샘플이며, 실제 GitHub 쓰기·Actions·Terraform 실행은 수행하지 않습니다. 실패 시연·재시도·중단된 데모 재진입을 제공합니다.

API mode는 기존 앱 조회·분석·배포와 정확한 event: progress 계약을 유지합니다. Repository 등록 계약이 없는 신규 앱 생성, 인프라 생성/배포, 통합은 미지원으로 표시하며 없는 경로를 호출하지 않습니다. 앱 상세는 개요/로그/모니터링을 유지합니다. 브라우저 저장 손상·권한·용량 문제를 화면에서 표시합니다. 현재/제안 계약 구분은 docs/contracts.md에 있습니다.

추천안 2~3개 비교·선택은 **애플리케이션 배포** 흐름에만 있습니다. 인프라는 답변 후 코드를 직접 생성합니다.
