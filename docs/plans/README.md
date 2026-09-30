# Development harness
1. Read the spec and plan; keep scope and backend unsupported capabilities explicit.
2. Before implementing a sprint, write goal/success/owned-files/tests in its contract. Add a failing behavioral check first.
3. Run npm run check and npm run test:e2e. Any failure blocks completion.
4. Independent read-only reviewer checks the contract and desktop/mobile screenshots. Design Quality, Originality, Craft, Functionality must each be >=6/10.
5. Record results and handoff. Local session state may be tracked separately; commit/push/PR always need explicit human approval.
Current: Sprint01 and Sprint02 PASS. Final native7/7, browser7 suites, independent scores7/6/7/7. See sprints/sprint-02-eval.md. Initial local implementation complete; live backend/AI/cloud remain unconnected.
Frontend code lives in this repository; backend is reference-only. Actual AI/API gaps are documented separately, no automatic cloud apply.


Brand refresh complete: [Freesia flower/connected Spaces](2026-09-30-freesia-brand-ui.md), independent8/7/7/7. Same existing check/e2e harness; no dependencies changed.
