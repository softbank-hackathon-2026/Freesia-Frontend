# AI-DLC development harness

기존 `docs/plans`의 spec, plan, sprint contract/eval/handoff로 AI-Driven Development Life Cycle(AI-DLC)을 진행한다. 별도 문서 체계를 만들지 않는다.

## 단계와 승인

| 단계 | 기존 기록 | 사용자 확인 |
|---|---|---|
| Ideation | 작업 spec: 문제, 성공 기준, 범위, 제외 범위 | 범위 승인 |
| Inception | 작업 spec/plan: 요구사항, API 계약, 설계, 작업 분할 | 요구사항과 설계 승인 |
| Construction | sprint contract → 구현 → eval → handoff | 작업별 구현 계획 승인 후 구현, 검증 결과 확인 |
| Operation | plan/handoff: 배포, 관측, 롤백, 운영 결과 | 실제 운영 변경의 범위 확인 |

승인은 해당 spec/plan/contract에 날짜, 사용자 요청/승인 근거, 승인한 범위·요구사항·구현 계획을 기록한다.
여러 단계를 함께 제시한 계획에 명시적인 일괄 승인을 받으면 함께 기록한다. 이미 승인된 범위와 계획은 다시 묻지 않고 진행하며, 범위·완료 조건·핵심 설계가 바뀌면 변경분을 재승인받는다.
작은 수정은 관련 기존 기록에 반영한다. 기존 spec/plan은 과거 결정의 기록으로 유지하고 후속 변경을 명시한다.

## 구현과 검증 규칙

1. 작업 spec/plan과 [현재·제안 API 계약](../contracts.md)을 읽고, 범위와 backend 미지원 기능을 명시한다. Frontend는 이 저장소에서 구현하고 backend는 읽기 전용으로 참고한다. 클라우드 apply는 자동 실행하지 않는다.
2. sprint 구현 전에 contract에 목표·성공 기준·담당 파일·검증 방법을 작성하고, 실패하는 행동 검사를 먼저 추가한다.
3. 앱 구현 변경은 `npm run check`와 `npm run test:e2e`를 실행한다. 실패가 있으면 완료 처리하지 않는다. 문서만 변경하면 diff·링크·지침 일관성을 확인한다.
4. 독립적인 읽기 전용 리뷰어가 계약과 결과를 확인한다. UI 구현 변경은 desktop/mobile 스크린샷을 평가하며, Design Quality, Originality, Craft, Functionality는 각각 6/10 이상이어야 한다.
5. eval/handoff에 실행한 검증·미실행 항목·다음 작업을 기록한다. 로컬 세션 상태는 별도로 관리할 수 있으며, commit·push·PR은 각각 사용자의 명시적 승인이 필요하다.

## 문서 기준 상태 — 2026-10-01

이번 지침 변경 승인: 2026-10-01 사용자 `수정해주셈` — `AGENTS.md`와 이 문서의 단계·승인·검증 규칙 보완.

| 항목 | 기록된 상태와 근거 |
|---|---|
| 최신 UI 구현 | [Day3 spec](2026-09-30-day3-spec.md) / [plan](2026-09-30-day3-plan.md): 인프라·애플리케이션·통합 진입점, 등록 Repository 선택, 명시적인 DEMO 흐름 |
| 자동검사·화면 평가 | [Day3 Sprint02 eval](sprints/day3-sprint-02-eval.md): 당시 native 13/13, browser 11/11, 독립 평가 7/7/7/7 PASS. 현재 변경에 대한 재실행 결과는 아님 |
| 이번 지침 변경 검증 | 2026-10-01: 기존 Node 24.19.0으로 `npm run check`의 TypeScript·ESLint·테스트 14개·빌드 PASS. `npm run test:e2e` 11 묶음 PASS. 실제 backend·배포 검증은 포함하지 않음 |
| 실제 backend 연동 | 기존 API adapter는 구현됨. 최신 eval에서 live backend는 미검증이며, 신규 앱 생성·인프라 생성/배포·GitHub 통합 API는 미지원 |
| AI·클라우드·배포 | 고정 샘플/DEMO이며 실제 AI, OAuth, GitHub 쓰기, AWS 배포·고객 앱 헬스체크는 미연결·미검증 |
| Git publication | [Day3 handoff](sprints/day3-sprint-02-handoff.md)에 commit/push/PR 미수행으로 기록됨. 현재 Git 상태는 별도로 확인 |

`proposed / approved / implemented / tested / live-integrated / deployed / committed / pushed`를 구분하고 PR 생성 여부도 별도로 기록한다. 자동검사 통과로 실제 backend 검증·배포·Git publication 상태를 올리지 않는다. 제안 API를 구현된 endpoint로 취급하거나 DEMO 성공을 실제 배포 성공으로 기록하지 않는다.
다음 개발 요청은 최신 spec/plan과 계약을 읽고 목표·성공 기준·범위를 정한 뒤, 승인된 작업 계획과 기존 검증 규칙으로 진행한다. 실제 연동이 필요한 작업은 누락된 계약과 검증 환경부터 확인한다.

## 이전 기록

- [초기 frontend spec](2026-09-30-frontend-spec.md) / [plan](2026-09-30-frontend-plan.md) / [Sprint02 eval](sprints/sprint-02-eval.md): 초기 구현의 native 7/7·browser 7 suites·독립 평가 7/6/7/7.
- [Freesia brand refresh](2026-09-30-freesia-brand-ui.md): 당시 독립 평가 8/7/7/7. 최신 상태와 구분하는 과거 기록이다.

## 현재 작업 — Infra AI 흐름 정정 (2026-10-01)
사용자가 앞서 제시한 동일 Space 흐름의 구현을 요청하여 로컬 구현·검증 완료: Space → 질의응답 → 인프라 구성안 2~3개 → 선택 → Terraform 검토 → Apply 데모 → 결과.
기존 [Day3 spec](2026-09-30-day3-spec.md) / [plan](2026-09-30-day3-plan.md)의 후속 정정과 [작업 계약](sprints/infra-ai-flow-contract.md)이 이 범위의 최신 기준이다. 후속 정정 완료: 2~3개 비교는 애플리케이션에만 적용하고 인프라는 답변에서 직접 Terraform을 생성한다. check17·browser11 및 독립 검토 PASS. [평가·인수인계](sprints/infra-ai-flow-eval.md)에 결과를 기록했다. 실제 AI/클라우드 및 이번 diff의 commit/push는 승인 범위 밖이다.

## Completed local follow-up — Infra Space clarity
Branch codex/infra-space-clarity, based on merged CD main ea35423. User requested name-only creation and clarified network vs app compute semantics. Existing infra-ai-flow contract/spec/plan updated. Implementation and verification complete: check19/browser11, independent code/visual review PASS. Local uncommitted changes; no commit/push/merge.

Completed local follow-up: legacy standalone UI hidden, undeployed drafts cancel with confirmation. Earlier branch diff retained. check20/browser13 and readonly source/visual review PASS; no Git publication.

Completed local follow-up: Integration URL-only/main registration without account connection. Backend ff3c3b5 lacks repository endpoints; browser demo works with explicit API boundary. check22/browser14 and independent review PASS. Same uncommitted branch, no publication.

2026-10-01 sample display-name correction completed: three fictional service names; existing check22/browser14 PASS. Local branch only.

Completed local follow-up: seeded services open shared InfraBuilder with explicit readonly sample config/code/result. check23/browser14/source+visual review PASS. Existing branch preserved, no publication.

## Active — local API integration (2026-10-02)
User-approved runtime setup and API Repository/app creation connection. Backend current f7a29a9 has real DB repositories CRUD; older unsupported notes above are historical. Contract in Day3 latest addition. Worker owns product/tests, parent runtime/docs/review. Required check + browser regression + local FastAPI roundtrip; record limits separately.

2026-10-02 completion: API repositoryCRUD/appcreation implemented; check25/browser15/live-localAPI PASS, readonlyreviewPASS. SQLite localbackendf7a29a9. Backendpytest28pass2Windowsencodingfailure; no actualAI/AWS. Currentbranchlocaluncommitted. See infra-ai-flow-eval latestrecord and scripts/local-api-check.mjs for real local roundtrip.

## Active — shared demo/API UI (2026-10-02)
Approved same layout/explicit choice/review flow, server-only data and unavailable placeholders. Existing infra-ai-flow contract latest entry applies; repository integration was pushed as 238def9. This follow-up is not approved for Git publication.

2026-10-02 shared UI completed locally: Infra/app/review/monitoring common layout with unavailable API actions gated; existing server SSE retained. check25/browser15/actual-localAPI/source+visual review PASS. Latest infra-ai-flow-eval applies. Current follow-up uncommitted/unpushed.

## Active — frontend completion (2026-10-02)
User-approved 1/2/4/5 then template-plan UI readiness; codex/frontend-deployment-flow. Commit/push authorized on verified completion, no PR/merge. Latest infra-ai-flow-contract applies.

2026-10-02 frontend completion verified: check33/browser17/live-localAPI5groups/review PASS. Template+values UI and six-stage SSE/resources ready; latest backend8d99b37 still lacks plans/real analysis/workflow dispatch. User-authorized commit/push on codex/frontend-deployment-flow includes previous shared UI; no PR/merge. See infra-ai-flow-eval for evidence and runtime preservation.


## Backend plans compatibility — 2026-10-02 (active)
User supplied latest backend message and asked to continue. Bounded existing-flow adaptation: readiness deployable_computes separate from recommendation computes; one plan goes directly to template/values review with explicit deploy and plan_id; analysis polling150seconds proposed team value (not final agreement); server-derived analysis explanation;400notready/409ongoing handling; latest isolated backend53dfc2d/migrations0003/0004 with data preservation. No backend source/cloud/Notion changes, no monitoring. New branch codex/backend-plan-readiness. Prior publication approval covered91745a6 only; no publication this follow-up without explicit approval.
Ownership APIworker types/api/unit/local-integration script; UIworker Applications/browser checks; parent Appbanner/runtime/docs/review. Checks type/lint/unit/build + browser + latest real-local plan→deploy SSE roundtrip. Singleplan requires review, not an extra choice. Missing readiness is unknown, no fabricated support. No dependency/buildconfig changes.

2026-10-02 backend readiness completed locally:35unit/18browser/5liveAPIgroups+reviewPASS. codex/backend-plan-readiness uncommitted/unpushed; no new publication approval. Actual53dfc2d planAPI nowconnected;150secondanalysis deadline provisional;model/cloud unverified.

2026-10-02 publication approval: user explicitly requested commit and push of the verified13-file backend-plan-readiness diff. Existing35unit/18browser/5localAPI results apply; no product changes since final verification. Commit/push only, no PR/merge.

## Current proposal — Space list UI/UX refresh (2026-10-02)
The latest presentation-only task uses the existing [Day3 spec](2026-09-30-day3-spec.md#space-list-uiux-refresh--2026-10-02-proposed), [plan](2026-09-30-day3-plan.md#space-list-uiux-refresh--2026-10-02-proposed), [sprint contract](sprints/infra-ai-flow-contract.md#space-list-uiux-refresh--2026-10-02-proposed) and [eval/handoff](sprints/infra-ai-flow-eval.md#space-list-uiux-proposal--2026-10-02). Historical completed work above remains intact.

Requested: exact three sidebar labels, reference-like Infra table with linked application counts, and Application cards showing Space/integration/Infra names. Proposed units UI-01/02/03 run sequentially on existing `feat/ui` with required checks, desktop/mobile and independent review before each commit/push. Current types provide no Infra creation time; proposed reference column uses `미제공` and introduces no schema/API change.

Status: design and unit plans proposed; combined Ideation/Inception/Construction approval pending. The user explicitly requested per-unit commit/push, retained as publication authorization for this scope. No application implementation or checks, commit/push, backend work or deployment has occurred for this task. Next action: present the concrete spec/plan/contract for one combined approval, then implement the verified units without repeated routine approval requests.

2026-10-02 current status: user `ㄱ ㄱ` approved the preceding scope/design and all three Construction units together. Implementation started with UI-01 on `feat/ui`; each unit must pass checks and independent review before its authorized commit/push. Latest execution evidence will be recorded in [eval/handoff](sprints/infra-ai-flow-eval.md#space-list-uiux-implementation--2026-10-02).

2026-10-02 UI-01 verified: sidebar implementation, `npm run check` (35 native tests) and `npm run test:e2e` (18 browser groups) PASS; independent source/desktop/open-mobile review PASS (7/6/8/8). Authorized unit commit/push is the next action. UI-02/03 remain approved and unimplemented; actual backend/cloud/deployment not verified by this UI-only work.

2026-10-02 UI-01 published: `bdaa4bb` on `feat/ui`, push and matching remote SHA confirmed. UI-02 Infra list implementation in progress; UI-03 approved and pending.

2026-10-02 UI-02 verified: reference-like Infra table/header and explicit unavailable timestamps, `npm run check` (35 native tests) and `npm run test:e2e` (19 browser groups) PASS; independent Demo/API desktop/mobile source/visual review PASS (8/6/8/8). Authorized unit commit/push next; UI-03 remains approved and pending. Current evidence is in eval/handoff.

2026-10-02 UI-02 published: `b566cb4` on `feat/ui`, push and matching remote SHA confirmed. UI-03 Application cards in progress.

2026-10-02 UI-03 verified: three-field cards, responsive layout, unavailable-name states and screen-reader relation descriptions implemented; `npm run check` (35 native tests), `npm run test:e2e` (20 browser groups) and independent source/visual review PASS (8/6/8/8). API mobile full-page capture artifact was replaced as review evidence by trusted viewport/long-card captures plus DOM checks. Authorized UI-03 commit/push next; local preview is at `http://localhost:5173/`. Actual backend/cloud/deployment remain unverified and outside this UI task.

2026-10-02 current handoff: UI-03 published as `0e489d7`; push and matching remote SHA confirmed. All three approved UI units are implemented, tested, independently reviewed and individually committed/pushed on `feat/ui` (`bdaa4bb`, `b566cb4`, `0e489d7`). Earlier proposed/in-progress entries above are historical. [Completed handoff](sprints/infra-ai-flow-eval.md#space-list-uiux-completed-handoff--2026-10-02) is the applicable record. Local preview remains `http://localhost:5173/`; no PR/merge or deployment.


## PR #5 favicon follow-up — 2026-10-02
User explicitly requested adding the previously described favicon fix to PR #5. Approved scope: index.html references existing /freesia-mascot.jpg; verify and commit/push feat/ui to update that PR. No merge/deployment. Existing stash remains preserved. Verification pending in infra-ai-flow-eval.md.

2026-10-02 verification complete: check35/browser20/favicon200/built asset PASS. Automatic approval review rejected commit for lack of explicit current-diff commit wording. Commit/push remain pending fresh user approval; previous scope interpretation above does not constitute publication evidence.

2026-10-02 publication approval: user explicitly answered "ㅇㅇ 반영해줘" to the request to commit and push the verified three-file favicon diff on feat/ui into PR #5. Prior approval-review block resolved by this explicit approval. Product diff unchanged since check35/browser20/favicon200 verification; git diff --check PASS. No merge or deployment authorized.

## Previous follow-up — Honeycomb palette (2026-10-02)
User requested palette colors from the supplied reference with a white site background. UI-04 updates existing CSS emphasis and theme checks only: `#FFC107`, `#F9E076`, `#FFFDD0`, and `#895129`; accessible dark text, visible focus and semantic red errors remain, while non-error mode banners use the soft yellow. Existing PR #5 is open on `feat/ui`. Revised scope/plan is recorded in the [spec](2026-09-30-day3-spec.md#honeycomb-palette-follow-up--2026-10-02-proposed), [plan](2026-09-30-day3-plan.md#honeycomb-palette-follow-up--2026-10-02-proposed) and [contract](sprints/infra-ai-flow-contract.md#honeycomb-palette-follow-up--2026-10-02-proposed). User `ㄱㄱ` approved the requirement and implementation plan. UI-04 implementation, checks, visual inspection and independent review are complete; commit/push and PR #5 update await explicit publication approval.

## Previous follow-up — Yellow and charcoal reference (2026-10-02)
This historical correction replaced Honeycomb with the supplied yellow/charcoal reference while retaining the white site canvas. The same uncommitted UI-04 CSS/browser-check plan and owned files applied. Historical [spec](2026-09-30-day3-spec.md#yellow-and-charcoal-reference-revision--2026-10-02), [plan](2026-09-30-day3-plan.md#yellow-and-charcoal-reference-revision--2026-10-02), [contract](sprints/infra-ai-flow-contract.md#yellow-and-charcoal-reference-revision--2026-10-02) and [eval/handoff](sprints/infra-ai-flow-eval.md#yellow-and-charcoal-reference-revision--2026-10-02) record the completed implementation and verification at that revision. The restoration below supersedes it; no charcoal publication occurred.

## Previous follow-up — Honeycomb restoration (2026-10-02)
This historical request restored the original Honeycomb colors, white header/sidebar, rounded geometry and typography, retaining the visible-menu keyboard test correction. Historical [spec](2026-09-30-day3-spec.md#honeycomb-restoration--2026-10-02), [plan](2026-09-30-day3-plan.md#honeycomb-restoration--2026-10-02), [contract](sprints/infra-ai-flow-contract.md#honeycomb-restoration--2026-10-02) and [eval/handoff](sprints/infra-ai-flow-eval.md#honeycomb-restoration--2026-10-02) record the completed 35-test/20-browser-group verification and review (8/7/8/8) at that revision. The latest dashboard reference below supersedes it; no restoration publication occurred.

## Current follow-up — Yellow dashboard reference (2026-10-02)
The user explicitly requests the latest compact white-sidebar/card dashboard reference, replacing only its green upper backdrop with the supplied yellow while retaining a white site canvas. The existing native-CSS UI-04 plan and seven owned files apply. Current [spec](2026-09-30-day3-spec.md#yellow-dashboard-reference--2026-10-02), [plan](2026-09-30-day3-plan.md#yellow-dashboard-reference--2026-10-02), [contract](sprints/infra-ai-flow-contract.md#yellow-dashboard-reference--2026-10-02) and [eval/handoff](sprints/infra-ai-flow-eval.md#yellow-dashboard-reference--2026-10-02) supersede previous theme records. Implementation, check (35 native tests/build), E2E (20 browser groups) and fresh independent source/desktop/mobile review PASS (8/7/8/8). Current preview is `http://localhost:5173/`, HTTP 200 and latest CSS verified. The reviewed diff remains uncommitted/unpushed and PR #5 is unchanged for UI-04; publication awaits approval.

2026-10-02 current correction: the user rejects violet buttons and requests harmonious colors and fewer borders. The matching Brown borderless correction in the existing spec/plan/contract/eval reuses UI-04 to apply supplied brown accents and remove ordinary framing, preserving the yellow backdrop, white canvas and all behavior. Fresh check (35 native tests/build), E2E (20 browser groups) and independent desktop/mobile review PASS (8/7/8/8); preceding violet results are historical. Latest local preview serves the brown CSS at `http://localhost:5173/` (HTTP 200 verified).

2026-10-02 current publication: user `커밋 푸시` explicitly approved the reviewed seven-file UI-04 diff. Product commit `acf4bb2` is pushed on `feat/ui`, with exact remote SHA verified. The unit is implemented/tested/reviewed/committed/pushed; earlier uncommitted/unapproved snapshots are historical. Upstream favicon and its records are preserved. PR #5 is already merged, so this publication updates `feat/ui` without a new PR/merge/deployment. [UI-04 publication handoff](sprints/infra-ai-flow-eval.md#ui-04-publication--2026-10-02) is current; final publication-record updates are documentation only under the same approval.

## Current UI-04 handoff — 2026-10-02
The reviewed brown, borderless dashboard update is implemented, checked and independently reviewed. Commit `acf4bb2f5eea1dccf59ce6e8fa32c03a609375af` is pushed to `feat/ui`, and the remote SHA was verified. PR #5 was merged with head `e36abd0` before this update and does not include the new UI-04 commit. No new PR, PR-text edit, merge or deployment was performed. See [publication evidence](sprints/infra-ai-flow-eval.md#ui-04-publication-verification--2026-10-02).
