# Freesia Frontend contributor instructions
- React + TypeScript + Vite; follow docs/plans spec/plan and docs/contracts.md.
- Demo and API are separate. Existing backend APIs currently mock. Never silently fall back to demos on API error.
- Infra input is AI Q&A generating Terraform. Saved code is an unprovisioned design, not a deployable foundation.
- Backend has no AI conversation/infra save/logs/metrics APIs yet. Do not invent working routes or claim real AI/cloud outcomes.
- Required checks: npm run check and npm run test:e2e. Run meaningful tests for new behavior.
- No git commit/push/PR without explicit user approval for current diff/action.
- Do not change backend or provision AWS/Terraform from this repository task.
- UI copy Korean, code comments English. Errors, sample data and unsupported states must be clear.
