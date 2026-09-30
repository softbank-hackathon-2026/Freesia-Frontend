# Implementation plan
## Architecture
Vite React TypeScript app. Small API client for FastAPI request/response contract. Explicit demo/API data-source selection; API mode never silent mock fallback. Demo state localStorage with validated parsing. Existing Nebius sidebar/white content as design reference, infra registration kept separate from AWS provisioning.
## Sprint01 — scaffold, shell, API contract, executable harness
Files package.json, lockfile, index.html, Vite/TS/ESLint configs, src/main.tsx, src/App.tsx (initial shell), src/styles.css, src/lib/api.ts, src/lib/types.ts, tests/api.test.ts, scripts/check.mjs, README, .env.example, .gitignore. Only approved dependencies. Create tests first and verify expected failure for nontrivial API behavior. Build/typecheck/lint/test; shell browser screenshot. No unimplemented routes invented.
## Sprint02 — Infra registration and app experience
Input shape comes from user reply; app schemas from backend-contract.md. Files src/components/*, src/lib/demo.ts, necessary App integration, registration tests and scripts/browser-check.mjs. Add tests for invalid payload, register persistence, list/details and deployment selection, backend failures and mode distinction. No invalid source code execution/Terraform apply. Registered entries remain demo-local unless backend contract supports creation.
## Open Design track
Independent owner updates same existing project via local official API. Back up before change, Infra design CTA + conversation + Terraform preview + save + persistent local design registry; exclude unprovisioned entries from app dropdown; preserve current flow. Verify sample/real distinction and responsive drawers.
## Review gates
One independent plan review before implementation. Each sprint build/test/lint/typecheck, read-only evaluator and screenshot grading (4 dimensions >=6). Fix findings before next sprint. Never auto-commit: user P0 overrides skill.
## Contract gaps
Backend infra GET-only, observability/questions APIs absent; document implemented vs mocked states. Input confirmed as AI Q&A producing Terraform; actual AI endpoint absent and demo explicitly approved. No backend edit in this task.

## User input correction — confirmed
Infra input is an AI conversation that produces Terraform code, not resource ID form or output import. UI: requirement -> guided Q&A -> summary/code -> save Infra Space design. No AI chat/generation/save route exists. Demo guided conversation clearly labeled, no claims of real AI inference. API mode reports unsupported. Generated design is NOT ready/provisioned infrastructure; cannot be used to deploy until apply/sync exists. No Terraform execution in scope.
