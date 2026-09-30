# Freesia Frontend
React + TypeScript + Vite 기반 플랫폼 콘솔입니다. Node.js 24 이상을 사용합니다.

## 실행
```sh
npm ci
npm run dev
```
http://localhost:5173 에서 확인합니다. `.env.example`을 `.env.local`로 복사해 `VITE_API_BASE_URL`을 설정할 수 있습니다. 기본 `/api`는 Vite가 `http://localhost:8000`으로 전달하며 별도 API prefix는 없습니다. 배포 환경은 API reverse proxy 또는 backend CORS 설정이 필요합니다.

## 검증 하네스
```sh
npm run check
npm run test:e2e
```
check는 TypeScript → ESLint → Node 네이티브 테스트 → Vite build를 실행하며 첫 실패 시 종료합니다. e2e는 로컬 Vite 서버와 설치된 Chrome을 실행하고 desktop/mobile 스크린샷을 `artifacts/`에 저장합니다. `CHROME_PATH` 환경변수로 실행 파일을 바꿀 수 있습니다. 브라우저 추가 다운로드는 하지 않습니다.

## 구현 경계
데모는 브라우저 샘플 데이터이며 API 오류 시 자동 대체하지 않습니다. API 모드는 실제 FastAPI 계약을 따르지만 현행 서버의 분석·배포도 mock 데이터입니다. 실제 AI 호출·AWS 리소스 생성·로그·메트릭·고객 앱 헬스체크는 연결되지 않았습니다. AI 대화로 작성한 Terraform은 미구축 설계이며 생성한 코드만으로 배포 가능 기반이 되지 않습니다. backend는 읽기 전용으로 참고했습니다. Git commit/push/PR이나 Terraform 실행은 수행하지 않습니다.

## 인프라 설계와 앱 흐름
인프라 → AI로 인프라 설계 → 요구사항 → 리전/접근 방식/가용 영역 질문 → Terraform 미리보기 → 설계 저장을 제공합니다. 이는 실제 LLM 대신 고정 가이드와 VPC/Subnet 템플릿으로 동작합니다. 자유 입력은 보존되지만 분석/코드 반영되지 않습니다. 설계는 source_generated 상태로 별도 표시되며 미구축 설계를 앱 배포 목록에서 선택할 수 없습니다. 코드 복사/.tf 다운로드만 가능하고 Terraform 검증·적용을 실행하지 않습니다.

메인은 **인프라 / 애플리케이션 / 통합**의 세 진입점입니다. 인프라 관리자는 Infra Space를 생성하고 명시적인 데모 인프라 배포를 시작합니다. 앱 관리자는 인프라를 읽기 전용으로 확인합니다. `demo_deployed`는 로컬 시연 상태이며 실제 AWS 기반 준비 완료가 아닙니다.

통합 → GitHub 샘플 연결 → 사용할 Repository 등록 → 앱에서 등록 Repository·기업/배포 대상 Infra Space 선택 → 배포 버튼 → 분석 근거·후보·캐릭터·분기 트리 → 후보 명시 선택 → Terraform·저장소·브랜치·반영 경로 확인 → 데모 commit/push·CI/CD → 결과 순서입니다. 앱 화면에는 Repository URL 입력란이 없습니다. 생성 코드는 불완전한 고정 샘플이며, 실제 GitHub 쓰기·Actions·Terraform 실행은 수행하지 않습니다. 실패 시연·재시도·중단된 데모 재진입을 제공합니다.

API mode는 기존 앱 조회·분석·배포와 정확한 event: progress 계약을 유지합니다. Repository 등록 계약이 없는 신규 앱 생성, 인프라 생성/배포, 통합은 미지원으로 표시하며 없는 경로를 호출하지 않습니다. 앱 상세는 개요/로그/모니터링을 유지합니다. 브라우저 저장 손상·권한·용량 문제를 화면에서 표시합니다. 현재/제안 계약 구분은 docs/contracts.md에 있습니다.
