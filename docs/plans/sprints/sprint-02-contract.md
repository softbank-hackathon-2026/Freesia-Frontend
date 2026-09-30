# Sprint02: Infra AI design conversation and application flow
Type: frontend
Goal: implement approved Infra conversation -> Terraform preview -> saved design and existing app analysis/deployment/observability UX.
## User-approved design
Infra Space input is user-AI Q&A producing Terraform, not direct resource IDs. Keep prepared foundations separate from saved/unprovisioned designs. Full-page conversational builder with requirement input, follow-up options/free text, summary and Terraform code panel; final save name stores local demo design, list/details shows code, app dropdown excludes not-ready design with clear explanation. Mobile panels stack.
## Files
src/components/*, src/lib/demo.ts and conversation model, tests/*.test.ts, App.tsx integration/styles.css, browser tests/config/scripts, README updates and docs/contracts.md.
## Success
- Sample guided conversation labeled demo; no real AI claims; unsupported free text kept as user requirement, choices determine only documented template. Never execute Terraform.
- Prevent empty/incomplete save; request/code rendered as text not HTML; save/reload retains design; clipboard/download code available where browser allows.
- New design status '설계 저장 · 미구축' and excluded from ready deployment list (no fabricated VPC IDs); previous prepared infra stays selectable.
- App creation validates public github URL syntax, name/branch/infra; demo/API state strictly separate.
- Analysis displays evidence certainty and backend candidate reasons, selected/alternative/unsuitable; backend computes/candidates intersection controls deploy.
- Deployment POST follows backend compute and event:progress SSE handles terminal/error/cleanup; mock API results explicit, URL not claimed healthchecked.
- Overview/log/monitoring pages: demo sample clearly labeled; API mode unsupported no fabricated metrics. Loading/empty/errors recoverable.
- build/test/lint/typecheck/browser harness passes; 390+1440 responsive screenshot grade >=6 all4. Browser flows include keyboard cancel/back, chat->code->save->reload->notready, existinginfra->app->analyze->deploy, API errors without fallback.
## Constraints
No backend writes/routes invented, login/cloud/apply/Git publication. No real AI dependency needed without agreed API. No local data mixed with backend IDs.
