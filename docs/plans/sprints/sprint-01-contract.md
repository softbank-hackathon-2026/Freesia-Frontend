# Sprint01: executable console foundation and FastAPI adapter
Type: frontend
Goal: runnable React+TS+Vite console foundation, exact existing API client and repeated check commands.
Files: package/lock/config, src/main.tsx, src/App.tsx initial shell, src/styles.css, src/lib/api.ts/types.ts, tests/api.test.ts, scripts/check.mjs, README/.env.example/.gitignore.
Success:
- dev/build work; header/sidebar render Infra/Applications with no crash on 390/1440 widths.
- actual GET/list/detail and app/create/analyze/recommend/deploy endpoints use actual schemas, structured errors, nonJSON/network handling; tests capture method/body and no fabricated success.
- npm run check invokes build, test, lint, typecheck; any failure exits nonzero.
- README runnable instructions, VITE_API_BASE_URL and explicit backend/mock limitations.
Constraints: backend read-only, no login/AWS/Git publication. Reuse current design style. Input-format-dependent form belongs sprint02, do not decide it.
Evaluation: npm run build, npm test, npm run lint, npm run typecheck; independent agent reads; desktop/mobile screenshot.
