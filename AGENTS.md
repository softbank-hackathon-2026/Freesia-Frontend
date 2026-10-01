# Freesia Frontend contributor instructions
- React + TypeScript + Vite; follow docs/plans spec/plan and docs/contracts.md.
- Demo and API are separate. Existing backend APIs currently mock. Never silently fall back to demos on API error.
- Infra input is AI Q&A generating Terraform. Saved code is an unprovisioned design, not a deployable foundation.
- Backend has no AI conversation/infra save/logs/metrics APIs yet. Do not invent working routes or claim real AI/cloud outcomes.
- Required checks for implementation changes: npm run check and npm run test:e2e. Run meaningful tests for new behavior.
- No git commit/push/PR without explicit user approval for current diff/action.
- Do not change backend or provision AWS/Terraform from this repository task.
- UI copy Korean, code comments English. Errors, sample data and unsupported states must be clear.

## AI-DLC workflow
- Before starting, read `docs/plans/README.md`, `docs/contracts.md` and the relevant spec, plan, contract, evaluation and handoff. Reuse these documents; do not create a parallel `docs/ai-dlc` structure.
- **Ideation:** record the problem, users, success criteria, scope and non-goals in the spec. Get human approval before moving to Inception; do not implement yet.
- **Inception:** record functional/non-functional requirements, architecture, units of work and acceptance criteria in the spec/plan. Requirements and architecture need human approval before implementation.
- **Construction:** for each unit, record design, implementation plan, owned files and verification in its sprint contract. Follow Design -> Implementation Plan -> Approval -> Implementation -> Test -> Review. Run the required checks for implementation changes and record results in the evaluation/handoff.
- **Operation:** when deployment is in the approved scope, record deployment, observability, rollback and runbook instructions in the related plan/handoff. This does not authorize backend changes, AWS/Terraform provisioning or Git publication.
- Record approval date and the exact scope/requirements/unit plan approved. One explicit approval may cover multiple stages only when those stages and plans were presented together. Reuse valid approvals for the same scope; do not ask again for approved routine implementation decisions. Changed scope, acceptance criteria or material architecture requires renewed approval.
- Keep the related documents and `docs/plans/README.md` current when an approved stage, verification result or next action changes. Separate proposed, approved, implemented, tested, live-integrated, deployed, committed and pushed states. Verification records include the date, command, result and unverified items; never mark an unexecuted check PASS.
- Preserve historical spec/plan/evaluation records and identify the current applicable record. Small changes reuse the relevant documents rather than creating a new document per edit. Documentation-only changes require diff, link and instruction-consistency checks; application checks remain required for implementation changes.
