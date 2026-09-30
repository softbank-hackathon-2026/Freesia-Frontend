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
