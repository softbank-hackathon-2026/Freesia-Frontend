# Spec: Freesia working frontend and infrastructure registration
## Problem
Current Open Design prototype is clickable but no actual frontend repository implementation exists. Infra Space cannot accept any infrastructure input. User requires actual development to start in specified repository with a repeatable harness.
## Agreed intent
Manager supplies existing common infrastructure; app user connects public GitHub repo and selects infrastructure, receives analysis/condition/recommendation and deployment status. Preserve app overview/log/monitoring and Nebius-inspired shell. User approves existing registration design and React+TS+Vite.
## Success criteria
1. npm run dev opens responsive React console with Infra and Applications navigation.
2. Infra AI design conversation accepts requirements and explicit guided answers, previews sample Terraform and saves persistent unprovisioned demo design in list/details. Saved designs are excluded from deployment until provisioned; API mode reports missing conversation/save routes.
3. HTTP API client follows actual backend schemas/routes and displays backend errors, no silent fallback to fabricated success.
4. App create/analyze/recommendations/deploy status uses existing API where available; demo mode explicitly labeled, logs/metrics unsupported in API mode until contract exists.
5. build, typecheck, lint, test and browser harness are repeatable from repo; keyboard/mobile/screenshots reviewed.
6. Open Design original revised through its own official API to show registration journey.
## Non goals
Cloud infrastructure creation, real AI implementation, backend mutation, login, Git publication, pretending local demo records are server-stored.
## Resolved input
User confirms AI Q&A produces Terraform source. Actual AI API absent; demo plus integration contracts explicitly approved.

## User input correction — confirmed
Infra input is an AI conversation that produces Terraform code, not resource ID form or output import. UI: requirement -> guided Q&A -> summary/code -> save Infra Space design. No AI chat/generation/save route exists. Demo guided conversation clearly labeled, no claims of real AI inference. API mode reports unsupported. Generated design is NOT ready/provisioned infrastructure; cannot be used to deploy until apply/sync exists. No Terraform execution in scope.


### EC2 log compatibility — 2026-10-03
User requests frontend integration after backend PR32 support. Existing users open the same app-detail logs tab for Fargate, Lambda or EC2. Success means current-deployment EC2 application logs and common status/error/polling behavior work without backend-specific UI forks or sample fallback. Keep the unchanged status/message/lines API and remove hardcoded query-period copy. No new API, screen, monitoring feature, backend change, Terraform, paid deployment or Git publication is in scope. Current log window is1hour; open PR30's7day proposal is not implemented.

## Post-deployment observation and TXT export - approved 2026-10-03
User approval: 'recommended design implementation' to the in-chat bounded design. Show logs and metrics beneath successful deployment results, read each immediately and independently, preserve waiting/error states and response-completion-based ~15s polling, export the fetched maximum100 log lines as UTF-8 TXT. Preview latest15 lines; export includes timestamps, Windows-safe appname and save-time filename. Keep individual tabs and existing GET/status/null/source/context contracts.
Users: application owners checking a completed deployment. Success: no tab change needed for both reads; partial data is shown independently; a TXT download preserves Korean and all fetched lines; failed/running/teardown transitions remove the successful inline context; old requests abort and cannot leak results. CloudWatch first-data latency is not guaranteed, and observation is not an app health verdict.
Scope: frontend only, existing React components, no backend/API/Terraform/AWS/dependencies/Notion changes. No app invocation, real redeployment, Git publication or CD execution authorized.
Ownership: root Applications.tsx/minimal CSS/docs; component worker ApplicationLogs.tsx/minimal TXT helper and meaningful tests; browser worker scripts/monitoring-check.mjs; read-only reviewer final contract/code/desktop/mobile evaluation. Workers must preserve each other's edits and latest main redeploy#16.
Verification: focused browser RED before implementation, then check (TypeScript/ESLint/native tests/build), full E2E, focused parallel reads/states/lifecycle/download bytes and desktop1440/mobile390 screenshots. Read-only existing production GET may supplement fixtures; no runtime cloud mutations.
Current: approval recorded; branch codex/post-deploy-observation from main556d32c in isolated Freesia-Frontend-ec2-logs. Implementation/tests/review pending. Reuse existing session records; no separate design document.

2026-10-03T19:23:57.1550943 Post-deployment observation/TXT locally complete: check55/E2E25/focused19/liveEC2GET+TXT and independentreview7/6/6/7PASS. See infra-ai-flow-eval.md current handoff. No publication/deployment authorized or performed.

## Deployment panel typography correction - user requested 2026-10-03
User reported inconsistent text sizes in the code-analysis panel and requested a new branch, fix, commit and push. Bounded visual bugfix: keep title16px and standardize panel body, direct helper/status paragraphs and inherited buttons at14px/1.6 line-height. Preserve colors, wording, API/state/polling/actions; no dependency/build/backend/cloud/Notion change. Root owns styles.css and existing records; independent reviewer owns read-only source/desktop/mobile evaluation. No new unit test for static CSS; use browser computed-size/layout verification and requiredcheck/fullE2E. Commit/push authorized for this described diff on codex/fix-analysis-typography; no PR/main merge/deploy request.
Browser reproduction before fix with20px inherited document text: title16/body20/helper13/status20/button20. Explicit panel scale prevents browser default text size producing inconsistent inheritance. Verify after on1440and390, including enlarged document default, nooverflow and unchanged disabled running-analysis action.
Base origin/main a1bf997 includes prior monitoringPR17, sandboxPR18 and providerPR19. Reuse clean isolated Freesia-Frontend-ec2-logs; primary/5173 unchanged. Implementation/verification pending.
## AWS compute candidate icons — approved 2026-10-04
User explicitly requests the supplied Lambda/ECS Fargate/EC2 images before their names on the existing recommendation cards, at the same height as the text, and authorizes commit+push. This bounded design preserves card text/order, recommendation labels, selection behavior, API and deployment state. Use local original PNG assets and CSS 1em sizing; remove only display padding through CSS if needed, with decorative empty alt. Unknown compute names remain text-only. No dependencies, backend, Notion, cloud, PR or main merge. Success: three correct icons with text-height sizing, desktop/mobile no overflow, card selection unchanged, required check/E2E and focused rendered-image checks pass.

## Monitoring values first — approved 2026-10-04
User asks CPU/memory/mean response-time metrics to appear first and excessive text beneath, followed by commit/push. Bounded user-directed layout: monitoring header keeps collection badge and manual refresh, values are first body block, compact footer holds compute/aggregate/update period/measurement time and visible missing-data/support notices. Long timestamp nuance is available through a native details affordance. Demo sample labels stay explicit. Preserve fetch, polling15s, errors/status/null/zero, compute-specific fields and previous typography/AWS icons. No backend/dependency/API/Notion/cloud/PR/mainmerge changes. Success: cards precede text in DOM/rendering, desktop/mobile fit, refresh/states unchanged, required suites and focused state/layout review pass.

## Contextual help and app access placement — approved 2026-10-04
User directed removing the two persistent Infra/API application instructional banners, moving useful context behind clicked ? help, removing the endpoint health caveat banner, and relocating the deployed-app access button. Scope: native auto popover help at relevant headings; keep actual errors, demo labels, in-flight status and endpoint HTTP(S)/success/teardown guards. Move the existing safe link from progress-body footer to the deployment-result header; API/state/actions unchanged. Local branch codex/contextual-help integrates origin/main dbe1eb6 with --no-commit so the existing AppActions/link changes are preserved alongside prior icons/typography/metrics. Local merge is uncommitted. No commit, push, PR, merge publication, backend, cloud, dependency or Notion edits authorized.
Design/plan: root owns ContextHelp.tsx, App.tsx, Applications.tsx and scoped styles; browser worker owns existing E2E expectation maintenance and focused QA. Acceptance: instructions absent by default, clicked/keyboard help opens and Escape/outside closes, no form submit, safe access link appears once beside result title and is hidden for invalid/non-success/demo/teardown cases, no desktop/mobile overflow. Required check and E2E plus focused QA/review before local completion.

Contextual-help local completion 2026-10-04: implemented/tested/reviewed (check59/E2E27/focused10/reviewPASS); new help API provenance guard included. No Git publication. Refer to infra-ai-flow-eval.md current verified record.


## Log search and refresh pause — approved 2026-10-04
User approved recommended bounded in-chat design: literal case-insensitive message search/highlights over fetched maximum100 logs, filter before preview cap; logs-only pause/resume, one-shot manual refresh while paused, immediate resume followed by existing completion-based15s polling. Preserve complete-source UTF-8 TXT export with explicit label, sample/API/error/status separation and independent metrics polling. Reset query/pause/snapshot on app/mode change; abort/ignore stale requests and preserve last snapshot when pausing. Root owns scripts/monitoring-check.mjs and existing records; worker owns ApplicationLogs.tsx and scoped styles.css, no reverting other edits. TDD: observe missing searchbox failure before product edits; then focused search/literal/XSS/full-source export/pause/manual/resume/race/reset/keyboard/mobile assertions, required check/full browser and independent review. Optional last-query time is not included. No backend, dependency, API, Terraform, Notion or Git publication changes. Branch codex/log-search-pause from origin/main3050fda; local preview5174. Implementation and verification pending.


## Infra title help removal — approved 2026-10-04
User explicitly requested removing the question-mark beside the Infra Space page title and committing/pushing the change. Bounded scope: remove that ContextHelp and unused App import, update existing API-mode help expectations to absence, preserve all other page behavior/help. Branch codex/remove-infra-title-help from main21eb80c. Existing check/full browser and desktop/mobile API title verification; implementation pending. Commit and named feature-branch push approved; no PR/main merge/deploy/backend/Notion actions.
