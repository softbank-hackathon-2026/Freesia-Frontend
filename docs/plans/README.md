# AI-DLC development harness

기존 `docs/plans`의 spec, plan, sprint contract/eval/handoff로 AI-Driven Development Life Cycle(AI-DLC)을 진행한다. 별도 문서 체계를 만들지 않는다.

최신 작업 기준: [main 병합 완료 기록](sprints/infra-ai-flow-eval.md#main-integration-publication--2026-10-02). 기존 목록/삭제 UI와 원격의 자원 트리, 포트 확인, 내리기 요청 UI를 함께 보존했다. check38, E2E24와 집중 검사가 통과했고 병합 커밋 `655847c`를 main에 푸시해 원격 SHA 일치까지 확인했다.

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

## Previous UI-04 handoff — brown palette (2026-10-02)
The reviewed brown, borderless dashboard update is implemented, checked and independently reviewed. Commit `acf4bb2f5eea1dccf59ce6e8fa32c03a609375af` is pushed to `feat/ui`, and the remote SHA was verified. PR #5 was merged with head `e36abd0` before this update and does not include the new UI-04 commit. No new PR, PR-text edit, merge or deployment was performed. See [publication evidence](sprints/infra-ai-flow-eval.md#ui-04-publication-verification--2026-10-02).

## Current UI-04 follow-up — blue palette (2026-10-02)
The user clarified that the original yellow backdrop must remain; the all-blue backdrop was a mistaken interpretation. Current scope is blue buttons/sidebar/interactive accents with the original yellow backdrop/notices. The current Yellow backdrop clarification in the [spec](2026-09-30-day3-spec.md#yellow-backdrop-clarification--2026-10-02), [plan](2026-09-30-day3-plan.md#yellow-backdrop-clarification--2026-10-02), [contract](sprints/infra-ai-flow-contract.md#yellow-backdrop-clarification--2026-10-02) and [eval/handoff](sprints/infra-ai-flow-eval.md#yellow-backdrop-clarification--2026-10-02) supersedes the mistaken blue-backdrop record. Same seven owned files, compact white/borderless layout and behavior boundaries. Corrected implementation, check (35 native tests/build), E2E (20 browser groups) and fresh independent source/desktop/mobile review PASS (8/7/8/8). Current preview is `http://localhost:5173/`, HTTP 200 and yellow/blue CSS verified. Under user `커밋 푸시`, product commit `46aee04e477e2e8b81bbb7670cc2386ef48d8ae2` is committed/pushed on `feat/ui`, local/tracking/remote SHA verified. [Current publication handoff](sprints/infra-ai-flow-eval.md#yellow-and-blue-publication--2026-10-02) records execution. Final publication-record updates are documentation only under the same approval; no new PR/merge/deployment.

## Current work — List actions and Integration creation (2026-10-02)
Requested: Infra `스페이스 생성`, accessible icon-only refresh and `스페이스 삭제`; Application create action in the same list-header position; Integration overview -> `통합 생성` -> separate registration form. Proposed deletion reuses existing eligible demo-draft removal via native dialog; server Infra deletion remains unsupported. Preserve yellow backdrop/blue accents and all existing data/API boundaries.

Current [spec](2026-09-30-day3-spec.md#list-actions-and-integration-creation--2026-10-02-proposed), [plan](2026-09-30-day3-plan.md#list-actions-and-integration-creation--2026-10-02-proposed), [contract](sprints/infra-ai-flow-contract.md#list-actions-and-integration-creation--2026-10-02-proposed), [API/UI contract](../contracts.md#list-actions-and-integration-creation--2026-10-02-proposed-not-implemented) and [eval/handoff](sprints/infra-ai-flow-eval.md#list-actions-and-integration-creation--2026-10-02-proposed) preserve the original proposal. On 2026-10-02, user `ㄱㄱ` approved the presented Ideation scope, Inception requirements/architecture and Construction UI-05/06/07 designs/unit plans together. UI-05 is in progress; UI-06/07 follow sequentially with required checks and independent desktop/mobile review after each unit. Application verification is pending; live integration, deployment and Git publication remain unperformed/unapproved for this task.

2026-10-02 current unit status: UI-05 implemented/tested/reviewed PASS (`check`: 35 native tests/build; E2E: 22 groups; independent review 8/6/8/8, no blockers). [UI-05 evidence](sprints/infra-ai-flow-eval.md#ui-05-verification--2026-10-02) is current. UI-06 starts under the existing approval; UI-07 is approved/pending. No publication or live deployment.

2026-10-02 current unit status: UI-06 implemented/tested/reviewed PASS (`check`: 35 native tests/build; E2E: 22 groups; independent review 8/6/8/8, no blockers). [UI-06 evidence](sprints/infra-ai-flow-eval.md#ui-06-verification--2026-10-02) is current. UI-05 remains complete; UI-07 starts under the combined approval. Git publication and live backend/cloud/deployment remain unperformed.

2026-10-02 completed: UI-05/06/07 are implemented/tested/reviewed under the combined approval. Latest `npm run check` PASS (35 native tests/build), `npm run test:e2e` PASS (22 groups), and independent desktop/mobile review PASS for each unit (8/6/8/8, no blockers). [Completed handoff](sprints/infra-ai-flow-eval.md#list-actions-and-integration-creation-completed-handoff--2026-10-02) is the current applicable record; earlier proposal/in-progress states are historical. Preview `http://localhost:5173/` serves current code/CSS (HTTP 200 verified). Infra deletion supports eligible undeployed/unlinked demo flows; server deletion remains unsupported. Local-API script syntax is checked, its live roundtrip is unexecuted in this task. No commit/push/PR/live backend/cloud/deployment for these changes. Next: user review of the local diff/preview; Git publication requires a separate explicit request.

## Current proposal — Terminology, Application actions and panel shadow (2026-10-02)
User requests `애플리케이션 스페이스` -> `애플리케이션`, `앱 연결` -> `애플리케이션 생성`, `통합 생성` -> `등록` with the entry at the panel top; Application refresh/delete like Infra; slightly stronger shared panel shadows.

Concrete proposed presentation: Integration `등록` goes in the Repository list panel's top-right actions beside its count, matching the Infra/Application panel headers. Its separate URL/main form is headed `등록`. Application list actions are accessible icon-only refresh, `애플리케이션 생성`, `애플리케이션 삭제`; creation submit uses the same create wording. Shared `.panel` shadow keeps `0 3px 20px` and changes color alpha from `#2b2e460c` to `#2b2e4618`.

Deletion contract: select/confirm one demo application only when `latest_deployment_id === null` and there is no deployment record for its ID. Persist the filtered app list before closing; retain the app/dialog on failure. Repository, Infra and deployment records are preserved. API delete is disabled with a visible unsupported explanation: the current adapter has no Application DELETE endpoint. Refresh reuses the existing reload callback, preserving demo state and requerying API lists.

Current [spec](2026-09-30-day3-spec.md#terminology-application-actions-and-panel-shadow--2026-10-02-proposed), [plan](2026-09-30-day3-plan.md#terminology-application-actions-and-panel-shadow--2026-10-02-proposed), [sprint contract](sprints/infra-ai-flow-contract.md#terminology-application-actions-and-panel-shadow--2026-10-02-proposed), [UI/data contract](../contracts.md#terminology-application-actions-and-panel-shadow--2026-10-02-proposed) and [evaluation/handoff](sprints/infra-ai-flow-eval.md#terminology-application-actions-and-panel-shadow--2026-10-02-proposed) jointly present Ideation scope, Inception requirements/architecture and UI-08/09 Construction designs/plans for one approval. New deletion behavior changes scope; AGENTS.md requires this plan approval before implementation. Product changes/checks/review for this proposal are pending; prior 35-test/22-group results are baseline evidence only. Git publication remains separately unapproved. Next: obtain combined approval, then implement and verify UI-08 -> UI-09.

2026-10-02 current approval: after the combined terminology/action/shadow scope and existing spec/plan/contract were presented, user `ㄱㄱ` explicitly approved Ideation scope, Inception requirements/architecture and Construction UI-08/09 designs, owned files, acceptance and sequential verification/review together. This covers exact wording, registration entry in the Repository panel header, shared shadow alpha, Application refresh and guarded no-pointer/no-history single-target demo deletion with API/store-error restrictions. UI-08 starts with targeted RED assertions; UI-09 follows without renewed approval for routine choices. Earlier pending-approval records are historical. Git publication, backend/cloud changes and live deployment remain outside approval.

2026-10-02 current unit status: UI-08 implemented/tested with expected RED (old Application sidebar label), `npm run check` PASS (TypeScript/ESLint/35 native tests/build), full E2E PASS (22 groups) and local-API script syntax PASS. Exact terms, panel-header registration placement and shared shadow assertions pass across current flows. Fresh desktop/mobile captures are available; independent read-only review is pending. UI-09 remains approved/pending. No live backend/cloud/deployment or Git publication.

2026-10-02 current unit completion: UI-08 implemented/tested/reviewed PASS. Required check 35 native tests/build, E2E 22 groups, independent source/desktop/mobile Design Quality/Originality/Craft/Functionality 8/6/8/8, no blocker. Additional API Application mobile viewport/DOM evidence confirms one console/masthead, one card column and no overflow; full-page repeated header is a capture artifact. UI-09 starts under the same combined approval with targeted failing toolbar/deletion checks. No live backend/cloud/deployment or Git publication.

2026-10-02 current unit status: UI-09 implemented/tested PASS. Latest `npm run check` passes TypeScript/ESLint/35 native tests/build (`index-CTH8ST01.js`); final E2E passes 24 browser groups, including API reason placement before long lists, refresh/loading/error/retry/no mutations and desktop/mobile deletion/storage/protection/source-unmount checks. Product/test files are final for independent read-only review, which is pending. UI-08 remains complete; live backend/cloud/deployment and Git publication remain unperformed/unapproved.

2026-10-02 current completion: UI-08/09 implemented/tested/reviewed PASS within the combined user `ㄱㄱ` approval. Requested Application/create/registration terms, Repository panel-header registration entry, stronger shared shadow and matching Application refresh/delete controls are complete. Latest check TypeScript/ESLint/35 native tests/build and E2E24 PASS; independent source/desktop/mobile review for each unit 8/6/8/8 with no blocker. Demo deletion remains single-target/null-pointer/no-history/persist-first, and API deletion remains disabled with reason before the cards. Preview restored at 5173 and HTTP 200 verified. Earlier proposed/pending/running entries are historical. Live backend/cloud/deployment and Git publication were not performed; final documentation verification follows.

2026-10-02 publication authorization: after the completed diff and verification state were recorded above, user explicitly requested `커밋 푸시`. This authorizes committing and pushing the exact current 14-file diff on `feat/ui` only. No PR, merge or deployment action is included. Record the resulting Git evidence in the current handoff.

2026-10-02 final pre-publication verification: after a small demo sample-summary wording correction, `npm run check` PASS (TypeScript, ESLint, 35 native tests and build) and `CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:e2e` PASS (24 groups). Documentation/path checks are recorded in the current evaluation handoff; commit and push are now next.


## Deployment resource tree — 2026-10-02
User approved the preceding screenshot-based bounded design with "일단 만들고 확인을 받는건 어떰?". App root -> server/storage/connection (other for unmapped types) -> actual resources; completion counts/progress, concurrent active highlights, failure reasons and group summaries. Display grouping only, not dependency edges. Keep current SSE-triggered GET/abort/manual refresh; no polling or backend/schema changes. Unknown/empty data cannot become fabricated resources. API data view is the scope; browser fixtures give an explicit review preview. No Notion writes, no Git publication or cloud mutation. Branch codex/deployment-resource-tree from origin/main c9baa52. Product owner worker: DeploymentResources.tsx/styles.css/minimal Applications.tsx props; parent owns browser regression/docs/review. Gate: focused fixture check RED/GREEN, check, full browser regression, desktop/mobile visual review.

2026-10-02 resource tree complete locally: check35/full browser20/focused tree and review PASS; explicitly labeled review HTML generated. No real AWS validation or publication. See infra-ai-flow-eval latest record.


2026-10-02T15:57:11.741576+09:00 publication gate: user explicitly requested committing and pushing the current resource-tree work to a non-main branch. Target codex/deployment-resource-tree; no PR/merge/deploy requested. Fresh checks PASS: node scripts/check.mjs (35 unit tests, TypeScript, ESLint, build), node scripts/resource-tree-check.mjs, full scripts/browser-check.mjs via temporary port15173 copy (20 groups, temporary file removed), git diff --check. Local API london resources[] and demo-mode exclusion are verified limitations; fixtures do not prove real AWS callback integration. Commit/push follows this gate; verify remote SHA before reporting publication.


## Deployment follow-up — approved 2026-10-02T16:08:31.696930+09:00
User requested all previously listed remaining local work and teammate questions. Bounded scope: preserve/reveal plan container_port without overriding server values; add PR13 teardown request-only adapter/UI with explicit confirmation, accepted receipt restoration from optional teardown_requested_at and no invented terminal status/URL deletion; verify real local signed resource callback -> DB/GET/SSE -> React using an isolated temporary backend. Existing main lacking optional teardown field is unavailable. No automatic retries, backend-source edits, cloud mutations, dependencies or Notion. Public deployment/teardown completion remain blocked on team contract/activation. Parent owns API/types/unit tests/docs; worker owns Applications.tsx and focused browser test; integration worker owns isolated callback script. Verification: regression RED/GREEN, check, full browser harness, focused follow-up browser, isolated callback integration, source review. This new diff has no commit/push/PR approval; prior 66fabd5 publication is complete.

2026-10-02T16:20:58.920421+09:00 follow-up localimplementationverified: check38/browser20/focusedport-teardown/isolatedrealcallback PASS; newdiffunpublished on codex/deployment-resource-tree. ActualAWS/teardownterminalcontract outstanding. See latesteval.


2026-10-02T16:52:15.576988+09:00 publication approval: user explicitly requested commit and push of the current follow-up diff. Target codex/deployment-resource-tree. Scope: port display, request-only teardown with guards, unit/browser/isolated callback checks and related docs. Existing verification38unit/20browser/focused/isolatedcallback PASS remains applicable; no subsequent product changes. Fresh git diff --check PASS. No PR/merge/deploy requested. Publication result will be tracked in session/wiki after remote SHA verification.


## Teardown lifecycle — approved 2026-10-02
User explicitly approved implementing the four previously presented steps: optional status/finished/reason schema, requested-state polling with reload restoration, terminal result/URL/retry handling, and deploy/teardown conflict recovery. Branch codex/teardown-status from main58e3314. Backend main6da543a (PR13 merged) verified. Keep existing confirmation, native AbortController and app/session isolation; 3-second sequential GET polling, terminal stop and visible retryable read errors. Terminal teardown records persist across redeployment: compare latest deployment creation time against teardown_requested_at before hiding a new URL. No dependency/backend/cloud/Notion changes and no publication approval. Parent owns schema/API/unit tests/docs; worker owns Applications and focused browser regression. Verify RED/GREEN, check, full browser regression, focused teardown lifecycle, source review. This supersedes request-only limitations for the approved scope; real AWS remains untested.

2026-10-02 teardown lifecycle completed/tested/reviewed locally: check39/fullbrowser20/focusedPASS; see latest eval. Branch codex/teardown-status uncommitted/unpushed. New UI main22b7b33 inspected but notintegrated.

2026-10-02T17:43:56.246687+09:00 Publication approval: user explicitly requested commit & push of current verified teardown lifecycle diff on codex/teardown-status. check39/fullbrowser20/focusedPASS unchanged; fresh diffcheckPASS. Latest main UI remains unintegrated. No PR/merge/deploy authorization.


## PR7 local UI integration — approved 2026-10-02
User approved the preceding recommendation: integrate latest main into codex/teardown-status, preserve both features, resolve3conflicts and verify locally before reporting. No new commit/push/remote merge authorization. Source main22b7b33 + head6f86d8d. Applications conflict keeps new teardown lifecycle within automatically merged upstream list/actions/props; document conflicts preserve both histories. Gates: check, latest full browser regression, focused teardown, resource tree, source review and rendered combined UI. Git merge --no-commit --no-ff intentionally pending until separate publicationapproval.

2026-10-02T18:13:54.768651+09:00 PR7 localUIintegration verified: check39/browser24/focusedteardown/tree/reviewPASS, all3conflictsresolved. Pendingmergecommit+pushapproval; remotePR7unchanged. See latesteval.

2026-10-02T18:21:52.224174+09:00 Publication approved: user explicitly requested commit & push of the verified local main UI + teardown integration on codex/teardown-status. Merge parent22b7b33, featureparent6f86d8d; check39/browser24/focused/tree/reviewPASS unchanged. Fresh diffchecksPASS/no unmergedpaths. Finish mergecommit and pushbranch, verifyPR7mergeability; do notmergePR ordeploy.


## Current work — App deletion and deleted resources (2026-10-02)
Approved on codex/app-delete-resource-deleted: connect existing Application deletion dialog to server soft-delete API and accept/display deleted tree nodes. See current appended sections in day3 spec/plan and infra-ai-flow-contract. Implementation/checks pending; commit/push authorized for this diff, PR/merge/deployment excluded.

Current app-delete/resource-deleted status: implemented/tested/reviewed PASS (check41/full E2E/three focused browser checks). See latest infra-ai-flow-eval handoff. User-authorized branch commit/push next; no PR/merge/deployment.

Current follow-up: detail app deletion and delete-before-cancel action order approved; reuse current dialog, verification pending. Prior da042ec is published; this new diff is not approved for publication.

Detail-deletion/action-order follow-up verified: check41/E2E24/focused desktop-mobile+demo/review PASS. Local uncommitted diff; no new commit/push/merge/deployment.

2026-10-02T22:24:32.665610+09:00 Detail-deletion follow-up commit/push authorized by user; verified source/test diff unchanged. Publishing current branch only; main merge/deployment not included.


## Active — redeployment entry (2026-10-02)
User authorized branch implementation on codex/app-redeploy-flow. Current scope is in the appended Day3 spec/plan and infra-ai-flow-contract: demo configuration reuse and explicit API waiting state until verified latest-code/config-reuse contract. No publication authorization.

Redeployment UI preparation completed locally: check41/fullE2E24/focused redeploy+teardown PASS and parent source/visual review. See latest infra-ai-flow-eval. API latest-code/config-reuse integration remains unavailable pending backend contract; uncommitted/unpushed.

User authorized commit/push of the verified redeployment UI preparation on codex/app-redeploy-flow. Implementation/check results unchanged; PR/main merge/deployment are not included. See latest eval publication record.


## Application monitoring approval — 2026-10-02T23:55:24.590378+09:00
Current active unit: logs API connection, then metrics. User approved implementation plus feature-separated commit/push on codex/app-monitoring-api; backend3d04671 contracts verified read-only. No PR/main merge/deployment/Notion changes.

Logs unit verified 2026-10-03T00:05:57.966227+09:00: check42/E2E/focused/source+visual PASS. Authorized separate commit/push next; metrics unit remains pending.

Logs unit published0b386ce; remote exact/clean verified. Metrics unit now active under the same user approval; separate commit/push after checks.

Monitoring implementation complete 2026-10-03T00:21:02.655594+09:00: logs0b386ce already published; metrics validated check43/E2E24/focused8/source+visual. Feature-separated publication approved on codex/app-monitoring-api. No live monitoring verification, PR/main merge or deployment in this task.


## Five frontend UX fixes — approved 2026-10-03T01:17:33.173690+09:00
User approved new branch codex/frontend-ux-fixes, ordered units1–5, separate commit and push after each verified unit. Approval covers requirements/design/implementation and publication of each described unit; no PR/merge/deployment/backend/Notion work. Existing architecture, React/native browser APIs and installed dependencies are reused.
1. Creation safety: block cancel while creating, retain successful server result across view changes, reconcile uncertain outcomes by listing apps; prevent accidental duplicate submit.
2. List accuracy: independent infra/apps loading/errors so one failure cannot erase the other; refresh infra counts after successful app creation.
3. Navigation: persist page/app/tab in query parameters, reload restoration and Back/Forward via browser history; preserve existing app/source deep links and cancel stale async view work.
4. Action copy: code analysis start/reanalysis labels match POST behavior; actual deployment wording remains separate.
5. Keyboard: mobile menu focus on open/return on close; proper tab roving focus, arrows/Home/End and tab-panel association.
Verification per unit: focused behavior regression, npm run check, npm run test:e2e, source review; UI units also desktop/mobile inspection. Existing docs/plans and sprint evaluation record each result. Product unit ownership is sequential to avoid conflicts in App.tsx/Applications.tsx. Follow-up work (polling layout, repository confirmation, demo infra reset) excluded.


## UX unit1 verified — 2026-10-03T01:25:19.234760+09:00
Creation cancel disabled in flight; late success refreshes canonical list instead of overwriting current view/draft; uncertain network/5xx/invalid-success results reconcile via GET without retrying POST. Focused RED(cancel enabled) then GREEN(cancel guard, GET-before-POST race, unknown503/no retry); check43 PASS; full browser see artifact groups PASS; independent source review PASS after stale-response fix. No actual backend/AWS mutations. User-approved unit1 commit/push on codex/frontend-ux-fixes.


## UX unit2 verified — 2026-10-03T01:30:51.219602+09:00
Independent infra/app loading and error states; success creation refreshes linked infra counts; error is not an empty list. Focused RED apps500 removed valid infra then GREEN independent failures/count4; check43 PASS; E2E24 PASS; independent source review PASS. Existing desktop/mobile app list layout preserved. Unit1 published0383c0a; user-approved unit2 commit/push next, then unit3 URL navigation.


## UX unit3 verified — 2026-10-03T01:51:48.085139+09:00
Native page/source/app/tab URL state restores reload and Back/Forward without restarting same-app work. Direct app reads support legacy deep links even when list fails; app GET success plus deployment GET failure preserves app and tabs. Focused RED/GREEN including delayed reads, source switch, unknown app and partial read failure; check43/E2E24 PASS. Independent source review PASS; desktop1440/mobile390 screenshots inspected, no horizontal overflow. No dependency, backend or cloud changes. User-approved unit3 commit/push, then unit4 analysis action copy.


## UX unit4 verified — 2026-10-03T01:56:07.865869+09:00
Analysis button says 코드 분석 시작 / 다시 분석; existing deployment history action remains 설정 변경 · 재분석 and actual deploy actions unchanged. Matching existing test selectors updated. Focused label/API regression RED then GREEN (two analysis POSTs); check43/E2E24 and independent source review PASS. User-approved individual commit/push before unit5 keyboard focus.


## UX unit5 verified — 2026-10-03T02:06:34.121726+09:00
Mobile disclosure focuses first navigation item on open and restores the visible toggle after close/navigation. Escape is scoped to menu/toggle targets so native dialogs keep their own cancellation. App tabs use one Tab stop, arrows/wrap/Home/End via existing navigation, associated focusable panel and visible focus styles. Focused RED tabIndex then GREEN; extra RED native dialog Escape conflict fixed and regression GREEN. Final check43/E2E24 and independent re-review PASS;1440/390 focus screenshots inspected. No new dependencies. All five approved units complete; unit5 separate commit/push on codex/frontend-ux-fixes. Main merge, PR and deployment are outside this authorization.


## Monitoring clarity follow-up — 2026-10-03 03:09
Approved: app title with parenthesized successful deployment compute and 60-second/latest measurement copy. Existing infra-ai-flow contract contains ownership and checks. Implementation/verification pending on codex/monitoring-label-clarity; no Git publication authorized.

Monitoring clarity implementation and local verification completed: matching successful compute in parentheses,60-second/latest reading copy; check43/E2E24/focused9 and independent source/visual PASS. See infra-ai-flow-eval. Local codex/monitoring-label-clarity diff only, publication/deployment pending.

## Current follow-up — API default entry (2026-10-03)
The user narrowed demo removal to API-by-default and no upper-right source selector. Demo code/tests retained, explicit source=demo only for internal QA. Applicable Day3 spec/plan and sprint contract section API default entry. Product edit implemented locally on codex/api-only-ui; check/E2E/source/visual verification pending, no publication/deployment.


API default entry verification completed 2026-10-03T11:09:11.6806661+09:00: minimal App.tsx edit, retained demo code; check43/E2E25/targeted monitoring+UX+delete/source+visual PASS. See infra-ai-flow-eval.md. Local codex/api-only-ui, no Git publication or deployment.


## Current follow-up — application deployment step flow (proposed2026-10-03)
User requested automatic staged screens instead of cumulative scrolling. Concrete existing-flow spec/plan/contract above are ready for one combined scope/design/unit-plan approval. No product edit yet. Reference Claude artifact access failed403; five-stage design reflects the user's stated intent and inspected existing handlers. No publication approved.


## Application stepflow approved - 2026-10-03T11:25:38.3542723+09:00
User explicitly approved the presented five-step design, existing-flow spec/plan/unit contract and implementation on another branch, followed by commit and push of the completed diff. Current branch codex/deployment-step-flow. Approval covers scoped feature implementation/verification and publication to this branch only; main merge, PR, deployment/backend/cloud/Notion changes not included.

Application deployment step flow implementation and verification completed 2026-10-03T11:41:33.0681214+09:00: five-stage/current-panel UI; check43/E2E25/focused4/source+visual PASS. User-approved commit/push to codex/deployment-step-flow next; no PR/main merge/deploy. See infra-ai-flow-eval.md for evidence and fixture limitations.

## Current follow-up: AI analysis failure/recovery
User-approved three-point bugfix on codex/analysis-recovery from fee2c0d. Existing spec/plan/unit contract defines server error preservation,190sdeadline,GET-only restore and bounded timeout recovery. RED confirmed before product edits. Implementation/verification active; no publication approval for this new diff.

AI analysis recovery implementation/verification completed 2026-10-03T12:59:04.0486758+09:00: check47/focused14/E2E25/source+visualPASS. Branchcodex/analysis-recovery local/uncommitted/unpushed; no remote publication authorized. See infra-ai-flow-eval.md.

Header teardown follow-up approved and implemented 2026-10-03T13:06:30.4480069+09:00: top button beside delete; status panel above tabs. Verification active on codex/analysis-recovery; previous analysis fixes retained; still uncommitted/unpushed.

Header teardown placement verification completed 2026-10-03T13:07:44.6156382+09:00: check47/E2E25/flow14 and desktop/mobile header/cancel/all-tabsPASS. Current analysis-recovery diff remains local/unpublished.

## Publication authorized - 2026-10-03T13:10:12.9117391+09:00
User explicitly requested commit and push of the current diff, then PR-based merge of all completed work into main. Scope: prior five-stage deployment commit fee2c0d plus current analysis failure/190s/GET recovery and header teardown changes. Latest origin/main54fbd4e is an ancestor; no integration conflicts. Product source unchanged since check47/E2E25/flow14 and desktop/mobile verification. Commit/push codex/analysis-recovery, create English PR, inspect CI and merge; no manual production Deploy dispatch.

Current follow-up: resource tree visibility regression on codex/resource-tree-visibility. See current Day3 plan/spec and infra-ai-flow contract. Browser reproduction before minimal product fix; verification/publication pending.

Resource-tree visibility follow-up verified 2026-10-03T13:27:06.9663764+09:00: check47/E2E25/flow15/tree/source+visual PASS. Implementation complete on codex/resource-tree-visibility; local only, no Git publication or production deployment. See infra-ai-flow-eval current section.

Publication now explicitly authorized 2026-10-03T13:34:24.1659173+09:00: commit/push codex/resource-tree-visibility and merge into main after CI. Actual123 resource data is empty in local simulation; the UI fix does not create resources.

Current bounded task: horizontal deployment-stage cards, user screenshot directed. Branch codex/horizontal-deployment-stages; existing spec/plan/contract updated; verification in progress, no publication.

Horizontal deployment-stage cards completed 2026-10-03T14:04:23.5065395+09:00: check47/E2E25/flow15/visual4 PASS. Six cards in one row with mobile keyboard scrolling and state colors; existing progress/tree preserved. codex/horizontal-deployment-stages remains local/uncommitted/unpushed. See infra-ai-flow-eval.md.

2026-10-03T14:07:10.2337429+09:00 user approved current branch commit/push and runtime title investigation. Existing parenthesized compute contract checked against4513f4e, verification in progress; no PR/main merge/deploy approval.

2026-10-03T14:08:47.5152085+09:00 compute-title investigation completed: actual123 ECS Fargate title visible; Lambda/Fargate/failure/teardown fixture4 PASS. No title code edit needed. Horizontal cards ready for user-authorized commit/push on codex/horizontal-deployment-stages; no PR/merge/deploy.

Current task 2026-10-03T14:11:35.9407734+09:00 API Infra read-only action cleanup on codex/horizontal-deployment-stages. User approved commit/push of this follow-up; root owns product/docs, worker existing API E2E. No PR/merge/deploy.

2026-10-03T14:19:28.6801179+09:00 API Infra read-only follow-up verified: check47/E2E25/harnesslint/diffPASS;1440/390buttonsabsent,list/detail/retryretained,legacydemo unchanged. User-authorized currentbranchcommit/push next; no PR/merge/deploy.

Current 2026-10-03T14:32:30.0726816+09:00: resource tree only on progress/result and belowstatus. codex/deployment-tree-below; implementation/verificationactive, no commit/push/merge authorization. See latest spec/plan/contract.

2026-10-03T14:35:28.3436042+09:00 userapproved currenttree-placement commit/push andmainmerge afterverification. No manualDeploy.

2026-10-03T14:37:37.6646201+09:00 treebelowstatus locallyverified: check47/E2E25/flow15PASS,desktop/mobile1-3hidden/4-5stacked. Userauthorizedcommit/push/mainmerge; noDeploy. Seeevalevidence.

2026-10-03T14:44:32.0337938+09:00 duplicate completion message bugfixactive, branchcodex/deployment-result-message. Display-onlyserver-firstsingleparagraph; no publication.

- 2026-10-03T14:49:20.2243407+09:00: Duplicate result message fixed locally on codex/deployment-result-message. check/E2E and five browser message cases passed; server details/failure reason retained. See latest infra-ai-flow-eval.md. Uncommitted and unpublished; no new publication approval.

2026-10-03T15:43:39.5912887+09:00: Approved header deployment-management shortcut and red app-delete buttons, together with existing message fix; current branch commit/push requested after verification.

2026-10-03T15:51:58.2230410+09:00: Header shortcut/red delete controls and previous duplicate-message fix verified (check47/E2E25/browser6navigation/14layout/8colors); user-approved codex/deployment-result-message commit/push next. Backend offline, browser checks used controlled GET-only fixtures. No PR/merge/deploy.

2026-10-03 16:06:02 EC2 log frontend integration active on codex/ec2-log-integration. Existing shared GET contract retained, backend PR32 verified, PR30 pending. Scope/acceptance/owners are recorded in the existing frontend spec/plan and infra-ai-flow contract. Tests and review pending; no publication or cloud deployment.

2026-10-03T16:24:34+09:00: EC2 logs integration complete locally on codex/ec2-log-integration in Freesia-Frontend-ec2-logs. Actual EC2 GET/render verified via localhost5174 production API proxy; check47/focused10/review PASS and prior identical-tree E2E25 PASS. See infra-ai-flow-eval.md. Unpublished; shared primary checkout and localhost5173 preserved.

2026-10-03T16:36:06+09:00: User explicitly approved commit and push of the current EC2 log diff to codex/ec2-log-integration. Verified product/tests unchanged. No PR/main merge/deploy requested.
2026-10-03T16:21:08.5128734+09:00: Issue8 full-stack implementation approved on isolated codex/issue-8-redeploy in both repos. New preview+execution contract; frontend and backend workers active; feature-only PRs requested after verification. No live deployment/mainmerge.

2026-10-03T16:56:26.4392114+09:00 Issue8 implemented and locally verified on latest main; separate review PRs next. See latest infra-ai-flow-eval and docs/contracts; no merge/deploy.


2026-10-03T17:43:42.2253243 Post-deployment observation/TXT: approved; codex/post-deploy-observation based main556d32c. Existing spec/plan/contract contain scope and acceptance; implementation/testing/review pending. No publication or cloud change.


2026-10-03T19:23:57.1550943 Post-deployment observation/TXT locally complete: check55/E2E25/focused19/liveEC2GET+TXT and independentreview7/6/6/7PASS. See infra-ai-flow-eval.md current handoff. No publication/deployment authorized or performed.


2026-10-03T19:48:06.3244625 Publication approved: user requested push of current verified post-deployment observation/TXT diff, then PR creation. Current codex/post-deploy-observation scope includes product3files+helper, tests3files and existingcontracts/plans6files. Commit/push/EnglishreviewPR next; no mainmerge or cloud deployment requested. Prior verification remains check55/E2E25/focused19/liveEC2GET+TXT/independentreviewPASS. Previous no-publication wording is a historical pre-approval state.

## Provider icon preparation — 2026-10-03
Provider icons asset preparation (2026-10-03): user requested the supplied AWS, on-premise, Azure and GCP images. Added unmodified PNGs under public/providers on codex/infra-provider-icons. SHA256 matches each source; PNG signatures verified. Asset filenames are not an API enum. Provider field name is planned; values and Infra response shape remain pending. No API parser, UI mapping, dependencies, backend or deployment changes. No commit/push authorization. Product check/E2E not run for this asset-only preparation.

## Infra provider display — 2026-10-03 active
Asset preparation above now continues with the user-supplied provider contract in backend PR38 and API section4. Latest Day3 spec/plan and infra-ai-flow-contract define this bounded implementation; worker verification/desktop-mobile review pending. No publication authorized.

2026-10-03 Infra provider display complete locally: check57/E2E26/source+desktop-mobile review PASS (7/6/7/8). Current contract PR38 aws/onprem/gcp/azure, rollout not verified. See infra-ai-flow-eval latest entry; branch codex/infra-provider-icons, uncommitted/unpushed. App Space remains separate.

## Sandbox selection — approved user-directed UI, 2026-10-03
User requested Infra Space dropdown with right-side "샌드박스 배포" checkbox: checked locks dropdown; app creation without an Infra selection uses sandbox. This explicit layout/request authorizes bounded frontend implementation. Latest backend main ff7d8ab/merged PR36 now supports omitted or null infra_id; omit the key, never send empty string or UI-only sandbox. Server selects its sole ready DefaultInfra-tagged foundation; no_default_infra is a visible creation error. Sandbox here is the server default foundation, not a promise of security isolation or free resources.
Frontend-only draft sandbox flag retains prior selected infra when toggled and survives tab navigation. Existing demo creation keeps required-foundation semantics; API empty selection uses default. Name/repository/branch validation remains. App response infra_id stays required. Default infra is hidden from GET list but detail GET is allowed; resolve current app's missing foundation with bounded, abortable detail GET, do not inject default into selection list. Show unknown/error instead of fabricating readiness.
Owned product files root: Applications.tsx, App.tsx, types.ts, api.ts, demo.ts, styles.css. Worker owns browser-check.mjs; reviewer read-only. Reuse docs spec/plan/contract/eval. Required check/E2E, explicit+omitted request tests, checkbox lock/toggle/draft/no-default-error, default detail candidates and desktop/mobile visual verification. Preserve main be2dde7 including PR16 redeploy/PR17 observation; no backend/Notion/cloud/dependency changes. Commit/push/PR/merge not authorized. Current: implementation pending; verification pending.


## Sandbox selection local completion — 2026-10-03
Implemented on codex/sandbox-selection from main be2dde7 in isolated frontend-sandbox. API create UI has same-row right checkbox; forced sandbox disables select while retaining prior choice; empty selection also omits infra_id. UI-only draft flag persists navigation, never sent to server. Existing demo still requires explicit foundation. Response infra_id remains required. Hidden default detail is read with existing API, matched by infra/app/list identity and aborted on change; stale readiness cannot enable candidates on reopen/direct switch. No-default400 preserves inputs and displays actionable message.
Verification: bundled Node24.19.0 check PASS (TypeScript, ESLint, 55 native tests, build); full test:e2e PASS26 scenarios. RED reproduced absent checkbox then stale-candidate2-vs0; GREEN after scoped fixes. Final test-script browser-global qualification ESLint PASS. Source/desktop1440/mobile390 independent review PASS, scores7/6/8/8. Diff whitespace check PASS. Runtime preview localhost5185 (PID/session tracked in local INDEX), API proxy localhost8000. Actual backend/cloud mutations and DefaultInfra AWS setup not exercised; browser responses were controlled fixtures. No commit/push/PR/merge. Backend main PR36 supplies omitted/null default selection; older deployment may reject it visibly without fallback.
Handoff: user can review local preview or sandbox-create-desktop/mobile artifacts; next publication requires current-diff user approval, then real server default-infra roundtrip when available. Infra CSP/on-premise field contract remains unrelated and unresolved. No Notion edits.


## Sandbox publication approval - 2026-10-03
User explicitly approved committing and pushing the current sandbox-selection implementation and its tests/docs to codex/sandbox-selection. Fresh check55 native/types/lint/build PASS; full browser26 PASS with the final test-file qualifiers. No PR/main merge or deployment requested. Earlier unpublished statements describe the pre-approval state.


## Sandbox API-only follow-up — approved 2026-10-03
User explicitly requests API wiring with the existing UI unchanged. Preserve checkbox/dropdown layout, omission of infra_id for default selection, concrete returned infra_id, and hidden-foundation detail lookup. Show no_default_infra server message verbatim instead of replacing it. Verification: reproduce exact-message browser RED, add omitted-body/returned-ID/detail and error preservation API tests, then required check/full E2E and isolated latest-main FastAPI HTTP contract tests without AWS or existing DB access. No backend product edits, production mutations or Git publication authorized for this follow-up.


## Sandbox API-only follow-up completion — 2026-10-03
No UI markup/style/label changes. Default selection already omitted infra_id and preserved the backend concrete ID for hidden-infra detail GET; removed only no_default_infra custom-copy replacement so server message is displayed verbatim. Browser RED reproduced the previous replacement; GREEN now asserts exact text and retained inputs. Fresh Node24 scripts/check.mjs PASS: TypeScript, ESLint,57 native tests, production build. BROWSER_CHECK_PORT=5186 scripts/browser-check.mjs PASS26. Independent read-only source review PASS; diff whitespace PASS. Latest backend main f24109c isolated FastAPI on8006 with memory SQLite passed9 real-HTTP checks: hidden list/detail, omitted/null/explicit/empty IDs, no-default message, AWS boundary0calls; server stopped and temporary source/runner cleaned. Evidence artifacts/sandbox-api-followup-{check,e2e}.log, browser-results.json and workspace .Codex/scratch/sandbox-api-integration/result.json. Operating API/AWS app creation and default tag setup not exercised. Current follow-up is uncommitted/unpublished on codex/sandbox-selection; previous489637b remains published. No backend product/Notion/cloud mutations.


## Sandbox API follow-up publication approval — 2026-10-03
User explicitly requested commit and push of the current API-only follow-up diff to codex/sandbox-selection. Product delta preserves server no_default_infra message with unchanged UI; related API/browser tests and existing contract/plan/evaluation records are included. Prior implementation verification: check57/fullE2E26/isolated latest-backend HTTP9/read-only review PASS. No product/test change since those runs. Commit/push approved; PR/main merge/cloud deployment not requested.

2026-10-03: user-requested deployment panel typography correction active on codex/fix-analysis-typography, maina1bf997. Scoped styles/records; commit+push authorized after verification, no PR/merge/deploy.

2026-10-03T23:47:49.8207046 Typography correction: localcheck59/fullE2E27/computedstyle4PASS. Scoped2CSSrules; independentreview next, userauthorizedcommit/push, noPR/merge/deploy.

Independent read-only typography review PASS: source/scope/computed4/screenshots, grades7/6/7/7. check59/E2E27 confirmed. Actual browser200percent zoom not tested; documentbase20 tested. Ready for userauthorizedcurrentdiffcommit/push; noPR/mainmerge/deploy.
