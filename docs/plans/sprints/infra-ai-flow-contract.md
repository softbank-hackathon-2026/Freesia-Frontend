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
