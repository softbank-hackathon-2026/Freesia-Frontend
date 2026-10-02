# Infra AI flow correction — 2026-10-01
Status: completed — corrected scope verified locally; no publication/live integration
Approval: User clarified comparison belongs to Applications only and requested resume. Infra: same-Space Q&A -> directly generate/review Terraform -> Apply -> result. Bounded extension of existing demo flow; no new backend/dependencies/cloud. Code publication requires new authorization.
## Acceptance
- Space creation captures identity/target/region, not mandatory fixed template.
- Same Space owns persisted conversation/structured answers and generated Terraform. Free text must not pretend to be AI analyzed.
- Generate only after required answers are complete; no Infra candidate comparison or selection. Changing answers clears stale code/review/result. Preserve Application candidate comparison unchanged.
- Explicit code review and Apply-demo action. Pending/in-progress/success or error visible. Incomplete/failed operation is not offered as ready foundation; state survives nav/reload and no auto restart.
- Preserve old localStorage data, explicitly separate legacy samples and old unattached designs, no destructive migration or ready-state bypass for new flow. Valid previously selected Infra alternatives retain their effective configuration, exact code and Apply state.
- API mode invokes no invented endpoint; no secret/cloud/Terraform process.
- Quota/corruption errors visible; failed save doesn't advance state or simulate Apply success.
## Files / ownership
Worker: src/App.tsx, src/components/InfraBuilder.tsx, InfraSpaceForm.tsx, src/lib/meeting.ts (and focused state helper if needed), tests, scripts/browser-check.mjs, minimal CSS. Adapt rather than revert others' changes.
Parent: docs/contracts.md, README if needed, docs/plans records, workspace Archify/status.
## Verification
Behavioral RED before implementation. npm run check (type/lint/native/build) and npm run test:e2e. Desktop/mobile captures, independent read-only review of contract and state boundaries. Record unverified live integration.
## 2026-10-01 — Name-only Space and network meaning correction (approved)
User requested a new feature branch after CD merge, name-only Infra Space creation, and clarification of ambiguous network/deployment labels. Bounded update of existing flow: create with name only; no implicit enterprise/region selection; gather region during the same-Space demo conversation before Terraform generation. Preserve existing saved regions/legacy templates/code/apply states and app compatibility filtering. Network table shows understandable configuration summaries, including both access and AZ choices when available; does not invent missing API topology. Compute candidates move out of the Infra table and are explained as Application execution options in details. App selector identifies Infra Space by name.
Ownership: worker owns form/builder/meeting/infraFlow and native/browser tests; parent owns App/Applications copy and docs. No new dependencies, API contracts, backend/cloud/Notion changes or Git publication. User approves these specified UI corrections; commit/push/PR/merge remain separate.
Verification: failing behavioral test first, native checks and full browser suite; persisted incomplete/revised/legacy flows, name-only form, dialogue region in Terraform, desktop/mobile screenshots and independent read-only review.

## 2026-10-01 — Approved legacy hiding and draft cancellation
User approved prior proposal with “그럼구현해줘”: hide legacy standalone-design UI while preserving stored records; add cancel -> native confirmation -> remove only the selected undeployed/unlinked Space. Existing Back retains work. Block deletion during pending/applying/success or when an app references the Space. Persist before navigation; storage failure keeps draft and displays error. No deployed-resource destruction, API/backend/cloud/Notion changes or Git publication. Worker owns App/InfraBuilder/minimal state helper/tests; parent owns docs. RED then native/full browser checks, desktop/mobile screenshots and readonly review.

## 2026-10-01 — Approved URL registration with fixed main
User approved Integration URL-only registration and implicit main branch; no account/OAuth UI. New repositories register immediately for Application selection, with normalized GitHub HTTPS owner/repo URLs; trim trailing slash/.git, reject malformed/duplicate entries. Remove registration without changing existing apps. Preserve legacy saved registrations/data and input on storage failure. Backend origin/main ff3c3b5 inspected: repository endpoints still absent; real GitHub/main/public availability unverified. Deliver functional browser demo; API mode remains explicitly unsupported, no invented requests/fallback. Worker owns Integration/meeting/App wiring/Applications copy/tests; parent docs/review. No dependencies, backend, cloud, Notion or Git publication. RED before implementation; full check/browser, desktop/mobile review.

2026-10-01 approved small copy correction: three foundation sample display names become fictional service names 쇼핑몰 서비스 / 사내 업무 서비스 / 결제 서비스. Existing IDs/network descriptions/compute metadata stay intact. Existing browser selectors follow display text; full required checks. No new test suite or APIs.

## 2026-10-01 — Approved sample detail parity
User approved correcting seeded service details to use the same Infra Space detail as user-created records. Reuse InfraBuilder with authored sample Q&A/configuration, matching generated Terraform and explicitly preprepared DEMO completion. Keep demo-public/private/ha identifiers, names, app links and compute eligibility. Implementation choice: prepared samples read-only through the shared view (download/back retained); user-created flow remains editable. No seed persistence/migration or fabricated real history. API sample responses continue existing simple detail without invented flow. Worker owns sample data/App routing/InfraBuilder guard/tests, parent docs/review. RED then full check/browser, all3 samples and existing own/API flows, desktop/mobile visual review. No Git publication/backend/cloud/Notion/dependencies.

## Approved local API integration — 2026-10-02
User approved preceding sequence: latest backend preparation, local runtime, Repository API connection, browser integration. Scope: API repository list/register/unregister and API app creation from selected registered repo + server Infra IDs. Demo storage behavior preserved. New repo branch defaults main. POST returns201, delete204, duplicate409, validation422 and404 are visible errors. No fallback or submitting demo IDs. Success: repo registered in local DB and selected for app creation; existing app analysis/deployment/SSE shown against real local FastAPI routes; reload and errors tested. No plans/AI/monitoring new endpoints, external GitHub/AWS operations, backend source modifications, dependency manifest changes or Git publication.

## Approved shared demo/API UI — 2026-10-02
User approved the preceding shared-screen design with “그럼 개발 해줘”. Bounded change: keep the same Infra detail sections, app labels and explicit recommendation choice, Terraform review -> deployment flow in both modes. API source remains server-only; absent create/Q&A/plan/log/metric APIs show unavailable placeholders and disabled execution, never fabricated values. Existing Repository CRUD/app creation and saved deployment GET/SSE remain available. Preserve demo data/behavior, server names/IDs, old records and request-race protection. No backend source/cloud/Notion/dependency changes or commit/push approval.
Implementation: parent InfraBuilder shared layout/name-only form/App routing/docs; worker Applications shared steps; worker existing browser/local verification scripts. Verify no API auto-choice/no unsupported mutations or demo fallback; desktop/mobile layouts; check + browser tests + real local Repository/app flow. Earlier API direct sample-deploy and simple Infra detail are superseded by this record.

## Approved frontend completion — 2026-10-02
User approved recommended order 1 -> 2 -> 4 -> 5 and preparation of 3, explicitly requested a new branch and commit/push on completion. Branch codex/frontend-deployment-flow carries the approved, already validated shared-UI changes from 238def9. Scope: update isolated local backend runtime with data backup, analysis pending/running polling with timeout/cancel, six deployment steps with SSE reconnection/snapshot restoration and failure reason, resource status API/view, template+values plan UI/typed adapters and explicit unsupported state while /plans absent; support old/new network enum. Monitoring remains in fork and is not edited here. No real AWS/GitHub workflow execution, backend source modifications, Notion changes, dependency manifest changes, PR or main merge.
Success: old demo storage stays readable, API data never falls back; delayed/stale responses ignored; real latest local CRUD and SSE/resources retrieval validated; proposed plans contract tested using explicit fixtures only; no deployment without reviewed server plan. Required check and browser tests plus independent source/visual review. User authorized commit AND push of this scope including carried shared-UI diff to the named new branch; not PR/merge.


## Backend plans compatibility — 2026-10-02 (active)
User supplied latest backend message and asked to continue. Bounded existing-flow adaptation: readiness deployable_computes separate from recommendation computes; one plan goes directly to template/values review with explicit deploy and plan_id; analysis polling150seconds proposed team value (not final agreement); server-derived analysis explanation;400notready/409ongoing handling; latest isolated backend53dfc2d/migrations0003/0004 with data preservation. No backend source/cloud/Notion changes, no monitoring. New branch codex/backend-plan-readiness. Prior publication approval covered91745a6 only; no publication this follow-up without explicit approval.
Ownership APIworker types/api/unit/local-integration script; UIworker Applications/browser checks; parent Appbanner/runtime/docs/review. Checks type/lint/unit/build + browser + latest real-local plan→deploy SSE roundtrip. Singleplan requires review, not an extra choice. Missing readiness is unknown, no fabricated support. No dependency/buildconfig changes.

## Space list UI/UX refresh — 2026-10-02 (proposed)
Status: design/implementation plan proposed; combined stage approval pending. User-requested per-unit commit/push is recorded separately from implementation approval. The [spec](../2026-09-30-day3-spec.md#space-list-uiux-refresh--2026-10-02-proposed) and [plan](../2026-09-30-day3-plan.md#space-list-uiux-refresh--2026-10-02-proposed) define the exact scope; prior completed contracts do not authorize this new design.

| Unit | Owned files | Design and verification |
|---|---|---|
| UI-01 | `src/App.tsx`, scoped sidebar rules in `src/styles.css`, affected navigation selectors in `scripts/browser-check.mjs` and `scripts/local-api-check.mjs`; related docs | Exact three labels in visible/accessibility text, existing `nav()` and menu state retained. Targeted browser assertions for active destination, keyboard and mobile close behavior. |
| UI-02 | Infra list rendering in `src/App.tsx`, scoped list/table rules in `src/styles.css`, `scripts/browser-check.mjs`; related docs | Move existing refresh/create controls into the reference-like list header; preserve handlers, network summary and current app counts. Add creation-time placeholder without type/state/API changes. Verify demo relations and server count independently, name detail entry, refresh/create, empty/error/loading and mobile table scroll. Keep draft rows and cancel behavior. |
| UI-03 | Application list rendering in `src/components/Applications.tsx`, scoped card rules in `src/styles.css`, `scripts/browser-check.mjs`; related docs | Card fields use existing app name, URL+branch Repository lookup and Infra-ID lookup. Existing `open(app)` retained. No nested interactive controls. Verify three labels/values, loading/error/unregistered/missing relations, same URL with different branches, long names, keyboard entry, reload and demo/API isolation. |

Owner: parent coordinates docs, per-unit implementation, verification and publication; independent reviewer inspects source/contract/captures without editing. Shared files are handled sequentially to keep unit diffs isolated. Existing checks are extended rather than introducing a test framework.

Gate per unit: meaningful browser assertion RED before implementation; `npm run check` and `npm run test:e2e` PASS; 1440px/390px screenshots inspected; read-only source/visual review with Design Quality, Originality, Craft and Functionality each at least 6/10; `git diff --check` PASS. After approval, implementation, tests and review, record commit SHA/push/remote SHA as distinct evidence. Failure or a material scope change stops publication of that unit until resolved.

Approval record pending: capture date and the user's exact combined approval covering Ideation scope, Inception requirements/architecture and all three Construction unit plans. Do not implement before this is recorded. Real backend/cloud execution and deployment are unverified and outside this contract.

Approval recorded 2026-10-02: user `ㄱ ㄱ` to the preceding combined scope/design/three-unit proposal. Ideation, Inception and UI-01/02/03 Construction plans approved together. Status now approved; UI-01 in progress. Original per-unit commit/push instruction authorizes publication after each unit's tests/review. Backend/cloud/deployment remain outside the scope.

2026-10-02 unit status: UI-01 implemented/tested/reviewed/committed/pushed (`bdaa4bb`, matching remote SHA verified). UI-02 in progress; UI-03 approved and pending. Exact execution evidence is in eval/handoff.

2026-10-02 unit status: UI-02 implemented/tested/reviewed/committed/pushed (`b566cb4`, matching remote SHA verified). UI-03 in progress under the approved card design and plan.

2026-10-02 final unit status: UI-03 implemented/tested/reviewed/committed/pushed (`0e489d7`, matching remote SHA verified). All three approved units are complete; no remaining implementation or publication gate for this scope. The original proposed/in-progress entries are historical. Final handoff and unverified backend/cloud/deployment limits are recorded in [eval/handoff](infra-ai-flow-eval.md#space-list-uiux-completed-handoff--2026-10-02).

## Honeycomb palette follow-up — 2026-10-02 (proposed)
Status: user approved the updated emphasis colors and white site background on 2026-10-02. UI-04 implementation, checks and independent review are complete; publication approval for this diff remains pending.

| Unit | Owned files | Design and verification |
|---|---|---|
| UI-04 | `src/styles.css`, `scripts/browser-check.mjs`; existing spec/plan/eval docs | Reuse global CSS. `#FFC107` for primary fills with dark text; `#F9E076` for hover/secondary emphasis and non-error mode banners; `#FFFDD0` for soft component surfaces; `#895129` for links, focus and selected accents. Set the document/body canvas to `#FFFFFF`, keep actual error red semantic. Add RED browser checks for canvas/palette/contrast; run required checks; inspect desktop/mobile captures; independent readonly source/visual review; record commit/push approval separately. No behavior/API/data changes. |

Acceptance: normal-size text contrast at least 4.5:1; controls and keyboard focus remain visible; all current routes use the shared Honeycomb palette; page canvas stays white; no interaction or stored data changes. Actual backend/cloud and deployment remain outside scope. Commit/push approval for this new diff is not yet recorded.

2026-10-02 approval: user `ㄱㄱ` approved the Honeycomb palette scope, requirements and UI-04 plan above. Implementation may proceed; commit/push and PR #5 update require separate explicit approval after final diff review.

2026-10-02 completion: implementation, `npm run check`, `npm run test:e2e` (20 browser groups), `git diff --check`, desktop/mobile inspection and independent review passed. Design Quality 8, Originality 7, Craft 8, Functionality 8. Final diff is ready for user review; publication approval remains pending.

## Yellow and charcoal reference revision — 2026-10-02
Current UI-04 design: the user's new reference explicitly replaces Honeycomb. Reuse the approved CSS-only unit and owned files: `src/styles.css`, `scripts/browser-check.mjs`, existing spec/plan/contract/eval and README. Yellow `#FFE500` masthead/actions/selected navigation, charcoal `#37383E` sidebar/section headings, white canvas/cards, neutral gray support surfaces, flat corners and sans-serif branding. Preserve current screen layout, all interactions and red error semantics.

Implementation plan remains native shared CSS without new assets or dependencies. Revised computed-style assertions must first fail against Honeycomb; checks, desktop/mobile capture inspection and independent read-only review are required again. Text >=4.5:1, interactive borders/focus >=3:1. Current request approves the revised visual requirement under the existing unit plan; implementation is in progress and commit/push/PR update approval remains pending.

2026-10-02 current completion: implementation, `npm run check` (35 native tests/build), `npm run test:e2e` (20 browser groups), fresh desktop/mobile inspection and independent review PASS. Design Quality 8, Originality 7, Craft 8, Functionality 8. This supersedes the in-progress state above and the historical Honeycomb verification. Revised diff remains uncommitted/unpushed and PR update awaits explicit approval.

## Honeycomb restoration — 2026-10-02
Latest user correction reinstates the approved Honeycomb UI-04 requirements/design and same CSS/browser-check unit plan. Restore the four supplied Honeycomb colors, white surfaces, rounded geometry and earlier typography. Retain brown interactive borders/focus and the corrected pre-activation keyboard test. Existing owned files and behavior/API/data boundaries remain.

2026-10-02 current completion: exact Honeycomb CSS restoration, required `npm run check` (35 native tests/build), `npm run test:e2e` (20 browser groups) and fresh independent source/desktop/mobile review PASS. Design Quality 8, Originality 7, Craft 8, Functionality 8; no blocking findings. Current [eval/handoff](infra-ai-flow-eval.md#honeycomb-restoration--2026-10-02) applies. Git publication is still unapproved.

## Yellow dashboard reference — 2026-10-02
Current UI-04 requirement is the user's compact dashboard screenshot, with its green upper backdrop replaced by `#FFC107`/`#F9E076` and the page canvas kept white. Reuse the approved native-CSS/browser-check plan: compact white navigation and masthead, modern sans-serif type, violet actions, white cards/table panels, light neutral secondary surfaces and subtle shadows. No extra ticket widgets or statistics. Existing three sidebar labels, linked-app counts and Application relationship fields/actions remain.

Ownership remains `src/styles.css`, `scripts/browser-check.mjs`, existing spec/plan/contract/eval and README. Add a failing backdrop/theme/contrast assertion before CSS; run both required commands and fresh independent source/desktop/mobile review with all four design scores >=6. Controls/focus >=3:1 and normal text >=4.5:1. The explicit current instruction approves the changed visual requirements within this existing unit plan. Handlers, markup, data, API, storage, routes and dependencies are outside the diff. Commit/push/PR update remain pending explicit approval.

2026-10-02 current completion: native shared-CSS implementation, `npm run check` (35 native tests/build), `npm run test:e2e` (20 browser groups) and fresh independent source/desktop/mobile review PASS. Design Quality 8, Originality 7, Craft 8, Functionality 8; no blocking findings. This supersedes prior theme verification. The reviewed seven-file diff is uncommitted/unpushed.

### Brown borderless correction — 2026-10-02
The current explicit correction authorizes brown actions (`#895129`, hover `#714322`) and borderless ordinary buttons/cards/panels with warm `#FFF7DF` secondary/selected fills. Reuse existing UI-04 design/implementation/verification ownership; current yellow dashboard layout and behavior stay unchanged. Remove frame borders and active-menu edge stripe; preserve input boundaries, row dividers, semantic errors and visible keyboard focus. Acceptance: no violet accents, zero-width ordinary button/card/panel borders, text >=4.5:1 and necessary control/focus indicators >=3:1, required check/E2E and independent desktop/mobile review with all four scores >=6. No publication approval.

2026-10-02 current completion: implementation, required check (35 native tests/build), E2E (20 browser groups) and independent source/desktop/mobile review PASS. Design Quality 8, Originality 7, Craft 8, Functionality 8; no blockers. Ordinary default/hover frame borders are absent, input/error boundaries and focus remain accessible. Prior violet results are historical; current diff remains unpublished.

2026-10-02 current publication: user `커밋 푸시` explicitly approves commit/push of the reviewed seven-file UI-04 unit. Product commit `acf4bb2f5eea1dccf59ce6e8fa32c03a609375af` is committed and pushed on `feat/ui`, exact remote SHA verified. Previous unapproved/unpublished statuses are historical. Application verification remains applicable to identical tested CSS/browser-check blobs; the remaining publication-record diff is documentation only.
