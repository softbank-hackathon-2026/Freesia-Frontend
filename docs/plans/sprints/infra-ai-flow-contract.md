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