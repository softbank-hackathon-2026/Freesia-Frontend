import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

// All backend responses in this harness are controlled API fixtures.
const port = process.env.DEPLOYMENT_FLOW_PORT || "5194";
const base = `http://localhost:${port}`;
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "localhost", "--port", port, "--strictPort"], { stdio: "pipe" });
let serverLog = "", browser;
server.stdout.on("data", chunk => serverLog += chunk);
server.stderr.on("data", chunk => serverLog += chunk);
const labels = ["코드 분석", "실행 환경 선택", "구성안 검토", "배포 진행", "배포 결과"];
const results = [];
const app = { id: "flow-app", name: "배포 단계 검증 앱", repo_url: "https://github.com/fixture/flow", branch: "main", infra_id: "flow-infra", created_at: "2026-10-03T00:00:00Z", latest_deployment_id: null, teardown_requested_at: null, teardown_status: null };
const infra = { id: "flow-infra", name: "Controlled Infra", description: "Test fixture", network: "public", computes: ["ecs-fargate", "lambda"], deployable_computes: ["ecs-fargate", "lambda"], app_count: 1 };
const analysis = { status: "done", requirements: ["Node.js20"], evidence: [{ file: "package.json", finding: "Controlled fixture", certain: true }], candidates: [{ compute: "ecs-fargate", state: "selected", reason: "Controlled server recommendation", cons: [] }, { compute: "lambda", state: "alternative", reason: "Controlled alternate", cons: [] }], mascot_message: null };
const plan = { id: "flow-plan", name: "Controlled configuration", summary: "Fixture values", pros: [], cons: [], template: "lambda/basic", values: { memory: 512, timeout: 30 } };
const dep = { id: "flow-deployment", app_space_id: app.id, compute: "lambda", status: "pending", url: null, reason: null, created_at: "2026-10-03T00:00:00Z" };
const progress = (status = "deploying", percentage = 63) => ({ status, step: status === "success" ? "done" : "deploy", message: "Controlled event " + status, progress: percentage, url: null, at: "2026-10-03T01:00:00Z" });
const navigation = page => page.getByRole("navigation", { name: "배포 단계", exact: true });
const button = (page, index) => navigation(page).getByRole("button", { name: labels[index - 1], exact: true });
const mutations = state => state.calls.filter(call => call.method !== "GET").map(call => [call.method, call.path, call.body]);
async function step(page, index) {
  await page.waitForFunction(label => [...document.querySelectorAll('[aria-current="step"]')].some(element => element.getAttribute("aria-label") === label || element.textContent.includes(label)), labels[index - 1]);
  assert.equal(await navigation(page).locator('[aria-current="step"]').count(), 1);
  assert.equal(await button(page, index).getAttribute("aria-current"), "step");
  const panels = page.locator('[aria-labelledby="deployment-step-heading"]');
  assert.equal(await panels.count(), 1, "exactly one workflow panel is mounted");
  assert.equal(await panels.isVisible(), true);
  assert.match(await page.locator("#deployment-step-heading").innerText(), new RegExp(labels[index - 1]));
}
async function visitStep(page, index) {
  await button(page, index).focus();
  await page.keyboard.press("Enter");
  await step(page, index);
}
async function scenario(options = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(9000);
  const state = { calls: [], unexpected: [], errors: [], latest: null, deployment: { ...dep }, event: progress(), eventReads: 0, dropFirstEvent: false, analysisFailures: 0, planFailures: 0, deployFailures: 0, holdAnalysis: false, releaseAnalysis: null, appExtra: {}, ...options };
  page.on("pageerror", error => state.errors.push(error.message));
  await page.route("**/api/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    state.calls.push({ method: request.method(), path, body: request.postData() ? request.postDataJSON() : null });
    const json = (value, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/infra-spaces")) return json([infra]);
    if (path.endsWith("/repositories")) return json([]);
    if (path.endsWith("/app-spaces")) return json([{ ...app, latest_deployment_id: state.latest, ...state.appExtra }]);
    if (path.endsWith("/" + app.id)) return json({ ...app, latest_deployment_id: state.latest, ...state.appExtra });
    if (path.endsWith("/teardown")) {
      state.appExtra = { teardown_requested_at: "2026-10-03T02:00:00Z", teardown_status: "requested", teardown_finished_at: null, teardown_reason: null };
      return json({ app_space_id: app.id, status: "requested", requested_at: state.appExtra.teardown_requested_at }, 202);
    }
    if (path.endsWith("/analysis")) {
      if (state.holdAnalysis) await new Promise(resolve => state.releaseAnalysis = resolve);
      if (state.analysisFailures > 0) { state.analysisFailures--; return json({ ...analysis, status: "failed", candidates: [] }); }
      return json(analysis);
    }
    if (path.endsWith("/plans")) {
      if (state.planFailures > 0) { state.planFailures--; return json({ error: "compute_not_ready", message: "Controlled configuration failure" }, 400); }
      return json({ status: "done", compute: "lambda", plans: [plan] });
    }
    if (path.endsWith("/deployments") && request.method() === "POST") {
      if (state.deployFailures > 0) { state.deployFailures--; return json({ message: "Controlled deployment rejection" }, 503); }
      state.latest = dep.id;
      return json(state.deployment, 201);
    }
    if (path.endsWith("/resources")) return json([{ address: "aws_lambda_function.fixture", type: "aws_lambda_function", action: "create", state: state.appExtra.teardown_status === "success" ? "deleted" : state.event.status === "success" ? "done" : "in_progress", reason: null, updated_at: "2026-10-03T01:00:00Z" }]);
    if (path.endsWith("/events")) {
      state.eventReads++;
      if (state.dropFirstEvent && state.eventReads === 1) return route.abort();
      return route.fulfill({ contentType: "text/event-stream", body: `event: progress\ndata: ${JSON.stringify(state.event)}\n\n` });
    }
    if (path.endsWith("/" + dep.id) || path.endsWith("/old-success")) return json({ ...state.deployment, id: state.latest || dep.id });
    if (path.endsWith("/logs")) return json({ status: "waiting", message: "Controlled log collection waiting", lines: [] });
    if (path.endsWith("/metrics")) return json({ status: "waiting", message: "Controlled metric collection waiting", compute: "lambda", cpu_percent: null, memory_percent: null, response_time_ms: null, request_count: null, error_count: null, measured_at: null });
    state.unexpected.push(path);
    return json({ message: "Unexpected controlled fixture route" }, 404);
  });
  await page.goto(`${base}/?source=api&app=${app.id}`);
  await page.getByRole("heading", { name: app.name, exact: true }).waitFor();
  assert.equal(await navigation(page).count(), 1, "deployment workflow must expose the five-step navigation instead of stacked sections");
  assert.equal(await navigation(page).getByRole("button").count(), 5);
  return { page, state };
}
async function chooseAndReview(page) {
  await step(page, 2);
  assert.equal(await page.locator(".candidate.chosen").count(), 0, "server recommendation is not explicit user choice");
  assert.equal(await page.getByRole("button", { name: "선택한 환경으로 구성안 조회", exact: true }).isDisabled(), true);
  await page.locator(".candidate").filter({ hasText: "lambda" }).getByRole("button", { name: "이 후보 선택", exact: true }).click();
  await page.getByRole("button", { name: "선택한 환경으로 구성안 조회", exact: true }).click();
  await step(page, 3);
  await page.getByRole("region", { name: "구성안 검토", exact: true }).waitFor();
}
async function clean(page, state) {
  assert.deepEqual(state.unexpected, [], "all requests use explicit test-only fixtures");
  assert.deepEqual(state.errors, []);
  await page.close();
}
try {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error(serverLog);
    try { if ((await fetch(base)).ok) break; } catch { /* Vite startup. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await mkdir("artifacts", { recursive: true });
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  {
    const { page, state } = await scenario();
    await step(page, 1);
    for (const index of [2, 3, 4, 5]) assert.equal(await button(page, index).isDisabled(), true);
    assert.equal(await navigation(page).evaluate(element => { for (let current = element; current; current = current.parentElement) if (window.getComputedStyle(current).position === "sticky") return true; return false; }), true, "step header stays sticky");
    await page.getByRole("button", { name: "코드 분석 시작", exact: true }).click();
    await chooseAndReview(page);
    const reviewed = mutations(state);
    for (const index of [1, 2, 3]) await visitStep(page, index);
    assert.deepEqual(mutations(state), reviewed, "rendering and earlier review never repeat analysis/configuration POSTs");
    for (const index of [4, 5]) assert.equal(await button(page, index).isDisabled(), true);
    const deploy = page.getByRole("button", { name: "선택한 구성안으로 배포", exact: true });
    assert.equal(await deploy.isDisabled(), true);
    await page.getByLabel("설정값을 확인했습니다", { exact: true }).check();
    await page.screenshot({ path: "artifacts/deployment-flow-review-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await visitStep(page, 2); await visitStep(page, 3);
    assert.deepEqual(mutations(state), reviewed);
    await page.screenshot({ path: "artifacts/deployment-flow-review-mobile.png", fullPage: true });
    await deploy.click(); await step(page, 4);
    await page.screenshot({ path: "artifacts/deployment-flow-progress-viewport-mobile.png", fullPage: false });
    await page.getByText("Controlled event deploying", { exact: true }).waitFor();
    assert.equal(await page.getByLabel("배포 진행률", { exact: true }).getAttribute("value"), "63");
    await page.locator("details").filter({ hasText: "aws_lambda_function.fixture" }).locator("summary").click();
    await page.getByText("aws_lambda_function.fixture", { exact: true }).waitFor();
    assert.deepEqual(mutations(state).map(call => call[2]), [null, { compute: "lambda" }, { compute: "lambda", plan_id: plan.id }]);
    state.event = progress("success", 100); state.deployment = { ...dep, status: "success" };
    await step(page, 5);
    assert.equal(await page.getByRole("heading", { name: /^배포 상태.*success$/ }).count(), 1);
    const terminal = mutations(state);
    await page.getByRole("tab", { name: "로그", exact: true }).click();
    await page.getByText("Controlled log collection waiting", { exact: true }).waitFor();
    await page.getByRole("tab", { name: "모니터링", exact: true }).click();
    await page.getByText("Controlled metric collection waiting", { exact: true }).waitFor();
    await page.getByRole("tab", { name: "개요", exact: true }).click(); await step(page, 5);
    assert.deepEqual(mutations(state), terminal, "monitoring tabs never mutate the deployment workflow");
    await page.screenshot({ path: "artifacts/deployment-flow-result-mobile.png", fullPage: true });
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "앱 내리기", exact: true }).click();
    await page.getByText(/앱을 내리는 중/).waitFor();
    state.appExtra.teardown_status = "success"; state.appExtra.teardown_finished_at = "2026-10-03T02:01:00Z";
    await page.getByText(/내림 완료/).waitFor(); await step(page, 5);
    await page.locator(".resource-tree-node.state-deleted").waitFor();
    assert.equal(await page.getByRole("progressbar", { name: "자원 완료율" }).count(), 0);
    assert.equal(mutations(state).length, terminal.length + 1, "teardown remains a separate explicit operation");
    await clean(page, state); results.push("happy flow, sticky/mobile/keyboard review, explicit confirmation, server progress/tree, monitoring and teardown preserved");
  }
  {
    const { page, state } = await scenario({ analysisFailures: 1, planFailures: 1, deployFailures: 1 });
    await page.getByRole("button", { name: "코드 분석 시작", exact: true }).click();
    await page.getByText(/분석에 실패했습니다/).waitFor(); await step(page, 1);
    await page.getByRole("button", { name: "코드 분석 시작", exact: true }).click(); await step(page, 2);
    await page.locator(".candidate").filter({ hasText: "lambda" }).getByRole("button", { name: "이 후보 선택", exact: true }).click();
    await page.getByRole("button", { name: "선택한 환경으로 구성안 조회", exact: true }).click();
    await page.getByText(/배포 준비 중입니다/).waitFor(); await step(page, 2);
    await page.getByRole("button", { name: "선택한 환경으로 구성안 조회", exact: true }).click(); await step(page, 3);
    await page.getByLabel("설정값을 확인했습니다", { exact: true }).check();
    await page.getByRole("button", { name: "선택한 구성안으로 배포", exact: true }).click();
    await page.getByText("Controlled deployment rejection", { exact: true }).waitFor(); await step(page, 3);
    state.event = progress("failed", 63); state.deployment = { ...dep, reason: "Controlled terminal failure" };
    await page.getByRole("button", { name: "선택한 구성안으로 배포", exact: true }).click(); await step(page, 5);
    assert.equal(state.calls.filter(call => call.method === "POST" && call.path.endsWith("/analysis")).length, 2);
    assert.equal(state.calls.filter(call => call.method === "POST" && call.path.endsWith("/plans")).length, 2);
    assert.equal(state.calls.filter(call => call.method === "POST" && call.path.endsWith("/deployments")).length, 2);
    await clean(page, state); results.push("analysis/config/deploy failures stay in their stage; explicit retries; matching failed terminal result");
  }
  for (const status of ["deploying", "success", "failed"]) {
    const { page, state } = await scenario({ latest: dep.id, deployment: { ...dep, status, reason: status === "failed" ? "Restored failure reason" : null }, event: progress(status, status === "success" ? 100 : 63), dropFirstEvent: status === "deploying" });
    await step(page, status === "deploying" ? 4 : 5);
    if (status === "deploying") {
      await page.getByText(/배포 상태 연결이 끊겼습니다/).waitFor();
      await page.getByText("Controlled event deploying", { exact: true }).waitFor();
      assert.ok(state.eventReads >= 2, "SSE reconnect resumes the same current step");
    }
    assert.deepEqual(mutations(state), [], "restoration never repeats business POSTs");
    await page.reload(); await step(page, status === "deploying" ? 4 : 5);
    assert.deepEqual(mutations(state), []);
    await clean(page, state);
  }
  results.push("running/success/failure restore on reload; SSE reconnect; no restoration POSTs");
  {
    const { page, state } = await scenario({ latest: "old-success", deployment: { ...dep, id: "old-success", status: "success" }, event: progress("success", 100), holdAnalysis: true });
    await step(page, 5);
    const started = page.waitForRequest(request => request.url().endsWith("/analysis") && request.method() === "POST");
    await page.getByRole("button", { name: "설정 변경 · 재분석", exact: true }).click(); await started;
    await step(page, 1); await page.waitForTimeout(200); await step(page, 1);
    assert.equal(await button(page, 5).isDisabled(), true, "old terminal success is outside the new analysis flow");
    state.holdAnalysis = false; state.releaseAnalysis(); await step(page, 2);
    await clean(page, state); results.push("old successful deployment never steals the active reanalysis step");
  }
  await writeFile("artifacts/deployment-flow-results.json", JSON.stringify({ status: "passed", results }, null, 2));
  console.log("PASS deployment flow: " + results.join("; "));
} finally { await browser?.close(); server.kill(); }
