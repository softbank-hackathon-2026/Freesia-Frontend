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
const labels = ["코드 분석", "실행 환경 선택", "구성안 검토", "배포 진행", "전체 구성"];
const results = [];
const record = result => { results.push(result); console.log("PASS " + result); };
const app = { id: "flow-app", name: "배포 단계 검증 앱", repo_url: "https://github.com/fixture/flow", branch: "main", infra_id: "flow-infra", created_at: "2026-10-03T00:00:00Z", latest_deployment_id: null, teardown_requested_at: null, teardown_status: null };
const infra = { id: "flow-infra", name: "Controlled Infra", description: "Test fixture", network: "public", computes: ["ecs-fargate", "lambda"], deployable_computes: ["ecs-fargate", "lambda"], app_count: 1 };
const analysis = { status: "done", requirements: ["Node.js20"], evidence: [{ file: "package.json", finding: "Controlled fixture", certain: true }], candidates: [{ compute: "ecs-fargate", state: "selected", reason: "Controlled server recommendation", cons: [] }, { compute: "lambda", state: "alternative", reason: "Controlled alternate", cons: [] }], mascot_message: null };
const plan = { id: "flow-plan", name: "Controlled configuration", summary: "Fixture values", pros: [], cons: [], template: "lambda/basic", values: { memory: 512, timeout: 30 } };
const dep = { id: "flow-deployment", app_space_id: app.id, compute: "lambda", status: "pending", url: null, reason: null, created_at: "2026-10-03T00:00:00Z" };
const otherApp = { ...app, id: "other-app", name: "다른 검증 앱" };
const fallback = "분석에 실패했습니다. 코드 분석을 다시 시작하세요.";
const runningAnalysis = status => ({ ...analysis, status, candidates: [], mascot_message: null });
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
  const state = { calls: [], unexpected: [], errors: [], latest: null, deployment: { ...dep }, event: progress(), eventReads: 0, dropFirstEvent: false, analysisFailures: 0, planFailures: 0, deployFailures: 0, holdAnalysis: false, releaseAnalysis: null, appExtra: {}, analysisSnapshot: null, failedMessage: null, analysisHttpError: false, postAnalysis: analysis, holdAnalysisGet: false, releaseAnalysisGet: null, analysisReads: 0, otherApp: false, clock: false, resourceStatus: 200, resourcePayload: null, wrongDeploymentId: null, ...options };
  if (state.clock) {
    const instant = new Date("2026-10-03T00:00:00Z");
    await page.clock.install({ time: instant }); await page.clock.pauseAt(instant);
  }
  page.on("pageerror", error => state.errors.push(error.message));
  await page.route("**/api/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    state.calls.push({ method: request.method(), path, body: request.postData() ? request.postDataJSON() : null });
    const json = (value, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/infra-spaces")) return json([infra]);
    if (path.endsWith("/" + infra.id)) return json(infra);
    if (path.endsWith("/repositories")) return json([]);
    if (path.endsWith("/app-spaces")) return json([{ ...app, latest_deployment_id: state.latest, ...state.appExtra }, ...(state.otherApp ? [otherApp] : [])]);
    if (state.otherApp && path.endsWith("/" + otherApp.id)) return json(otherApp);
    if (path.endsWith("/" + app.id)) return json({ ...app, latest_deployment_id: state.latest, ...state.appExtra });
    if (path.endsWith("/teardown")) {
      state.appExtra = { teardown_requested_at: "2026-10-03T02:00:00Z", teardown_status: "requested", teardown_finished_at: null, teardown_reason: null };
      return json({ app_space_id: app.id, status: "requested", requested_at: state.appExtra.teardown_requested_at }, 202);
    }
    if (path.endsWith("/analysis")) {
      if (request.method() === "GET") {
        state.analysisReads++;
        if (state.analysisHttpError) return json({ message: "Controlled analysis read outage" }, 503);
        const snapshot = path.includes("/" + otherApp.id + "/") ? null : state.analysisSnapshot;
        if (state.holdAnalysisGet) await new Promise(resolve => state.releaseAnalysisGet = resolve);
        return snapshot ? json(snapshot) : json({ message: "Analysis has not started" }, 404);
      }
      if (state.holdAnalysis) await new Promise(resolve => state.releaseAnalysis = resolve);
      state.analysisSnapshot = state.analysisFailures > 0
        ? { ...analysis, status: "failed", mascot_message: state.failedMessage }
        : state.postAnalysis;
      if (state.analysisFailures > 0) state.analysisFailures--;
      return json(state.analysisSnapshot);
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
    if (path.endsWith("/resources")) return json(state.resourcePayload ?? [{ address: "aws_lambda_function.fixture", type: "aws_lambda_function", action: "create", state: state.appExtra.teardown_status === "success" ? "deleted" : state.event.status === "success" ? "done" : "in_progress", reason: null, updated_at: "2026-10-03T01:00:00Z" }], state.resourceStatus);
    if (path.endsWith("/events")) {
      state.eventReads++;
      if (state.dropFirstEvent && state.eventReads === 1) return route.abort();
      return route.fulfill({ contentType: "text/event-stream", body: `event: progress\ndata: ${JSON.stringify(state.event)}\n\n` });
    }
    if (path.endsWith("/" + dep.id) || path.endsWith("/old-success")) return json({ ...state.deployment, id: state.wrongDeploymentId ?? state.latest ?? dep.id });
    if (path.endsWith("/logs")) return json({ status: "waiting", message: "Controlled log collection waiting", lines: [] });
    if (path.endsWith("/metrics")) return json({ status: "waiting", message: "Controlled metric collection waiting", compute: "lambda", cpu_percent: null, memory_percent: null, response_time_ms: null, request_count: null, error_count: null, measured_at: null });
    state.unexpected.push(path);
    return json({ message: "Unexpected controlled fixture route" }, 404);
  });
  await page.goto(`${base}/?source=api&app=${app.id}`);
  await page.getByRole("heading", { name: new RegExp("^" + app.name) }).waitFor();
  assert.equal(await navigation(page).count(), 1, "deployment workflow must expose the five-step navigation instead of stacked sections");
  assert.equal(await navigation(page).getByRole("button").count(), 5);
  return { page, state };
}
async function visibleResources(page) {
  const tree = page.getByRole("region", { name: "배포 자원 상태", exact: true });
  assert.equal(await tree.count(), 1, "only whole configuration displays the current app resource snapshot");
  assert.equal(await tree.isVisible(), true);
  await tree.locator(".resource-tree-node").waitFor();
  assert.match(await tree.textContent(), /aws_lambda_function.fixture/);
}
async function hiddenResources(page) {
  assert.equal(await page.getByRole("region", { name: "배포 자원 상태", exact: true }).count(), 0, "analysis/choice/review/progress do not display the deployment resource tree");
}
async function resourcesWithinStage(page) {
  await visibleResources(page);
  const panels = await page.locator(".deployment-stage").evaluate(element => {
    const tree = element.querySelector(".resource-tree");
    const rect = panel => { const { x, y, right, bottom } = panel.getBoundingClientRect(); return { x, y, right, bottom }; };
    return tree ? { stage: rect(element), tree: rect(tree) } : null;
  });
  assert.ok(panels, "resource tree is embedded in the whole-configuration stage");
  assert.ok(panels.tree.x >= panels.stage.x && panels.tree.right <= panels.stage.right && panels.tree.y >= panels.stage.y && panels.tree.bottom <= panels.stage.bottom, "resource snapshot is contained by its stage");
  assert.equal(await page.getByRole("heading", { name: "전체 구성", exact: true }).count(), 1, "embedded resources do not repeat the stage heading");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
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
    const { page, state } = await scenario({ latest: dep.id, wrongDeploymentId: "wrong-deployment-id", deployment: { ...dep, status: "success" }, event: progress("success", 100) });
    await page.locator('.resource-tree, [role="alert"]').first().waitFor();
    assert.equal(await page.getByRole("alert").count(), 1, "same-app wrong-ID deployment snapshot must report a restoration error");
    await hiddenResources(page);
    assert.equal(await page.getByRole("heading", { name: /^배포 상태/ }).count(), 0, "mismatched deployment never mounts a progress body");
    assert.equal(state.calls.filter(call => call.path.endsWith("/resources")).length, 0, "mismatched deployment never requests resource snapshots");
    assert.equal(state.calls.filter(call => call.path.endsWith("/events")).length, 0, "mismatched deployment never starts its event stream");
    assert.deepEqual(mutations(state), []);
    await clean(page, state); record("same-app wrong-ID deployment is rejected before progress/events/resources mount");
  }
  {
    const { page, state } = await scenario({ latest: dep.id, deployment: { ...dep, status: "success" }, event: progress("success", 100), analysisSnapshot: analysis });
    assert.deepEqual(await navigation(page).getByRole("button").evaluateAll(elements => elements.map(element => element.getAttribute("aria-label"))), labels, "fifth stage is 전체 구성");
    await step(page, 5); await resourcesWithinStage(page);
    assert.equal(await page.getByRole("heading", { name: /^배포 상태/ }).count(), 0, "whole configuration owns the resource tree without progress panels");
    assert.equal(await page.getByLabel("배포 진행률", { exact: true }).count(), 0);
    for (const [size, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844]]) {
      await page.setViewportSize({ width, height }); await resourcesWithinStage(page);
      await page.screenshot({ path: "artifacts/deployment-stage5-tree-" + size + ".png", fullPage: true });
    }
    for (const name of ["배포 후 운영 확인", "애플리케이션 로그", "모니터링"])
      assert.equal(await page.getByRole("region", { name, exact: true }).count(), 0, "whole configuration does not mount monitoring: " + name);
    assert.equal(state.calls.filter(call => /\/(logs|metrics)$/.test(call.path)).length, 0, "whole configuration starts no monitoring GET");
    const reads = state.calls.filter(call => /\/(resources|logs|metrics)$/.test(call.path)).length;
    await visitStep(page, 4);
    await page.getByRole("heading", { name: /^배포 상태.*success$/ }).waitFor(); await hiddenResources(page);
    for (const [size, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844]]) {
      await page.setViewportSize({ width, height }); await hiddenResources(page);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: "artifacts/deployment-stage4-progress-" + size + ".png", fullPage: true });
    }
    assert.equal(state.calls.filter(call => /\/(resources|logs|metrics)$/.test(call.path)).length, reads, "visiting progress starts no resource or monitoring GET");
    await clean(page, state); record("stage4 owns progress; stage5 owns only resource configuration; no inline monitoring reads");
  }
  {
    const { page, state } = await scenario({ latest: dep.id, deployment: { ...dep, status: "failed", reason: "Restored failure reason" }, event: progress("failed", 63), analysisSnapshot: analysis });
    await step(page, 4); await hiddenResources(page);
    await page.getByRole("alert").filter({ hasText: "Restored failure reason" }).waitFor();
    const retry = page.getByRole("button", { name: "구성 다시 확인 · 재시도 준비", exact: true });
    assert.equal(await retry.count(), 1, "restored failed deployment offers retry preparation without a saved selected plan");
    assert.equal(await retry.isEnabled(), true);
    await retry.click(); await step(page, 1); await hiddenResources(page);
    assert.deepEqual(mutations(state), [], "retry preparation changes view without automatically posting analysis/plans/deployment");
    assert.equal(state.calls.filter(call => call.path.endsWith("/resources")).length, 0);
    await clean(page, state); record("restored failure has explicit retry preparation; returns to analysis without automatic POSTs");
  }
  for (const resourceStatus of [200, 503]) {
    const { page, state } = await scenario({ latest: dep.id, deployment: { ...dep, status: "success" }, event: progress("success", 100), resourceStatus, resourcePayload: resourceStatus === 200 ? [] : { message: "Controlled resource read outage" } });
    await step(page, 5);
    const tree = page.getByRole("region", { name: "배포 자원 상태", exact: true });
    if (resourceStatus === 200) await tree.getByText("아직 보고된 자원이 없습니다. 실제 배포 자원 유무는 확인되지 않았습니다.", { exact: true }).waitFor();
    else await tree.getByRole("alert").filter({ hasText: "Controlled resource read outage" }).waitFor();
    assert.equal(await tree.locator(".resource-tree-node").count(), 0, "empty/error response cannot fabricate resources");
    const reads = state.calls.filter(call => call.path.endsWith("/resources")).length;
    await visitStep(page, 4); await hiddenResources(page);
    assert.equal(state.calls.filter(call => call.path.endsWith("/resources")).length, reads);
    state.resourceStatus = 200; state.resourcePayload = null;
    await visitStep(page, 5); await resourcesWithinStage(page);
    assert.deepEqual(mutations(state), []);
    await clean(page, state);
  }
  record("whole-configuration resource empty/error states stay honest; stage4 starts no reads; returning to5 recovers GET-only");
  {
    const { page, state } = await scenario({ latest: dep.id, deployment: { ...dep, status: "success" }, event: progress("success", 100), analysisSnapshot: analysis, holdAnalysis: true, otherApp: true });
    await step(page, 5); await visibleResources(page);
    const restored = mutations(state);
    await visitStep(page, 1); await hiddenResources(page);
    await visitStep(page, 2); await hiddenResources(page);
    assert.deepEqual(mutations(state), restored, "visiting earlier stages only changes the workflow view");
    await visitStep(page, 1);
    const started = page.waitForRequest(request => request.url().endsWith("/analysis") && request.method() === "POST");
    await page.getByRole("button", { name: "배포 관리", exact: true }).click();
    await page.getByRole("dialog", { name: "배포 관리", exact: true }).getByRole("button", { name: /^설정 변경 · 재분석/ }).click(); await started;
    await step(page, 1); await hiddenResources(page);
    assert.equal(await button(page, 5).isDisabled(), true, "old result cannot replace the active reanalysis step");
    await page.screenshot({ path: "artifacts/deployment-resource-hidden-reanalysis-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await hiddenResources(page);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: "artifacts/deployment-resource-hidden-reanalysis-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    state.holdAnalysis = false; state.releaseAnalysis();
    await step(page, 2); await hiddenResources(page);
    await chooseAndReview(page); await hiddenResources(page);
    await page.screenshot({ path: "artifacts/deployment-resource-hidden-review-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await hiddenResources(page);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: "artifacts/deployment-resource-hidden-review-mobile.png", fullPage: true });
    assert.deepEqual(mutations(state).map(call => call[2]), [null, { compute: "lambda" }], "resource visibility never submits a deployment");
    await page.reload(); await step(page, 5);
    for (const [size, width, height] of [["desktop", 1440, 1000], ["mobile", 390, 844]]) {
      await page.setViewportSize({ width, height }); await resourcesWithinStage(page);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.screenshot({ path: "artifacts/deployment-resource-result-" + size + ".png", fullPage: true });
    }
    const resourceReads = state.calls.filter(call => call.path.endsWith("/resources")).length;
    await page.getByRole("button", { name: "앱 목록으로", exact: true }).click();
    await page.getByRole("button", { name: otherApp.name + " 상세 보기", exact: true }).click();
    await page.getByRole("heading", { name: otherApp.name, exact: true }).waitFor(); await step(page, 1);
    assert.equal(await page.getByRole("region", { name: "배포 자원 상태", exact: true }).count(), 0, "app B never inherits app A's resource tree");
    assert.equal(state.calls.filter(call => call.path.endsWith("/resources")).length, resourceReads, "never-deployed app B does not fetch resources");
    await clean(page, state); record("resource tree stays hidden in analysis/reanalysis/choice/review/progress, restores inside whole configuration, and clears when switching apps");
  }
  {
    const { page, state } = await scenario({ analysisFailures: 5, failedMessage: "Controlled server failure: Bedrock throttled" });
    await page.getByRole("button", { name: "코드 분석 시작", exact: true }).click();
    const failure = page.getByRole("alert");
    await failure.waitFor();
    assert.match(await failure.innerText(), /Controlled server failure: Bedrock throttled/, "failed analysis must show the server mascot_message instead of discarding it");
    await clean(page, state); record("server failure mascot_message is preserved");
  }
  {
    const { page, state } = await scenario();
    await page.getByRole("button", { name: "코드 분석 시작", exact: true }).waitFor();
    await page.waitForFunction(() => !document.querySelector("button.primary")?.disabled);
    assert.equal(await page.getByRole("alert").count(), 0, "GET404 is a normal unanalysed app");
    assert.deepEqual(mutations(state), []);
    assert.ok(state.analysisReads >= 1);
    await clean(page, state); record("GET404 restores an unanalysed app without an error or POST");
  }
  for (const message of [null, "", "   "]) {
    const { page, state } = await scenario({ analysisSnapshot: { ...analysis, status: "failed", mascot_message: message } });
    await page.getByRole("alert").waitFor(); await step(page, 1);
    assert.equal(await page.getByRole("alert").innerText(), fallback);
    assert.equal(await button(page, 2).isDisabled(), true, "failed analysis candidates never unlock choice");
    assert.equal(await page.locator(".candidate").count(), 0);
    assert.deepEqual(mutations(state), []);
    await clean(page, state);
  }
  record("null/empty/whitespace server failure fallback; failed candidates remain locked");
  {
    const message = "Controlled server failure: Bedrock throttled\n  Keep server spacing";
    const { page, state } = await scenario({ analysisSnapshot: { ...analysis, status: "failed", mascot_message: message } });
    await page.getByRole("alert").waitFor(); await step(page, 1);
    assert.equal(await page.getByRole("alert").textContent(), message, "raw failure text and spacing are preserved");
    await page.screenshot({ path: "artifacts/analysis-recovery-failure-desktop.png", fullPage: false });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: "artifacts/analysis-recovery-failure-mobile.png", fullPage: false });
    assert.deepEqual(mutations(state), []); await clean(page, state);
    record("saved failed analysis shows raw server text on desktop/mobile");
  }
  {
    const { page, state } = await scenario({ analysisSnapshot: analysis });
    await step(page, 2);
    assert.equal(await page.locator(".candidate.chosen").count(), 0);
    assert.equal(await page.getByRole("button", { name: "선택한 환경으로 구성안 조회", exact: true }).isDisabled(), true);
    await page.screenshot({ path: "artifacts/analysis-recovery-choice-desktop.png", fullPage: false });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: "artifacts/analysis-recovery-choice-mobile.png", fullPage: false });
    await page.reload(); await step(page, 2);
    assert.equal(await page.locator(".candidate.chosen").count(), 0);
    assert.deepEqual(mutations(state), []);
    await clean(page, state); record("saved done restores choice across reload without auto-selection or POST");
  }
  for (const status of ["pending", "running"]) {
    const { page, state } = await scenario({ clock: true, analysisSnapshot: runningAnalysis(status) });
    await page.getByText("코드 분석 상태를 확인하고 있습니다. 완료까지 자동으로 다시 조회합니다.", { exact: true }).waitFor();
    await step(page, 1); assert.deepEqual(mutations(state), []);
    state.analysisSnapshot = analysis; await page.clock.fastForward(2100); await step(page, 2);
    assert.ok(state.analysisReads >= 2); assert.deepEqual(mutations(state), []);
    await clean(page, state);
  }
  record("saved pending/running resumes GET-only polling then restores choice");
  {
    const { page, state } = await scenario({ analysisHttpError: true });
    await page.getByRole("alert").waitFor(); await step(page, 1);
    assert.match(await page.getByRole("alert").innerText(), /Controlled analysis read outage/);
    state.analysisHttpError = false; state.analysisSnapshot = analysis;
    await page.getByRole("button", { name: "분석 상태 다시 확인", exact: true }).click(); await step(page, 2);
    assert.deepEqual(mutations(state), []);
    await clean(page, state); record("non404 restore outage is visible and status retry reads GET only");
  }
  for (const finalStatus of ["done", "failed", "running"]) {
    const { page, state } = await scenario({ clock: true, postAnalysis: runningAnalysis("running") });
    await page.waitForFunction(() => !document.querySelector(".deployment-stage-actions button")?.disabled);
    // Paused virtual time freezes actionability animation frames; enabled state is checked above.
    await page.getByRole("button", { name: "코드 분석 시작", exact: true }).click({ force: true });
    await page.getByText("코드를 분석하고 있습니다.", { exact: true }).waitFor();
    await page.clock.fastForward(150_000);
    assert.equal(await page.getByRole("button", { name: "분석 상태 다시 확인", exact: true }).count(), 0, "analysis remains active past the former 150s deadline");
    await page.clock.fastForward(39_000);
    await page.getByText("코드를 분석하고 있습니다.", { exact: true }).waitFor();
    const reads = state.analysisReads;
    state.analysisSnapshot = finalStatus === "done" ? analysis : { ...runningAnalysis(finalStatus), mascot_message: finalStatus === "failed" ? "Controlled final GET failure" : null };
    if (finalStatus === "failed") state.postAnalysis = analysis;
    await page.clock.fastForward(2000);
    if (finalStatus === "done") await step(page, 2);
    else if (finalStatus === "failed") {
      // runFor executes the retry delay while allowing the final GET promise to settle.
      await page.clock.runFor(500);
      await step(page, 2);
      assert.equal(await page.getByRole("alert").count(), 0, "confirmed final GET failure retries and succeeds without a transient alert");
    }
    else {
      await step(page, 1); await page.getByText(/분석 대기 시간이 지나 자동 확인을 중단했습니다/).waitFor();
      assert.equal(await page.getByRole("button", { name: "다시 분석", exact: true }).isDisabled(), true, "known running server analysis cannot create a duplicate POST");
      const stoppedReads = state.analysisReads;
      await page.clock.fastForward(10_000); assert.equal(state.analysisReads, stoppedReads, "timeout stops automatic polling");
      state.analysisSnapshot = analysis;
      await page.getByRole("button", { name: "분석 상태 다시 확인", exact: true }).click({ force: true }); await step(page, 2);
    }
    assert.ok(state.analysisReads > reads, "190s deadline performs a final GET");
    assert.equal(mutations(state).length, finalStatus === "failed" ? 2 : 1, "only confirmed final GET failure retries POST; timeout and status recovery remain GET-only");
    await clean(page, state);
  }
  record("190s final GET restores done, retries confirmed failure, or stops running state for GET-only recovery");
  {
    const { page, state } = await scenario({ holdAnalysisGet: true, analysisSnapshot: analysis, otherApp: true });
    while (!state.releaseAnalysisGet) await page.waitForTimeout(20);
    const release = state.releaseAnalysisGet; state.holdAnalysisGet = false;
    await page.getByRole("button", { name: "앱 목록으로", exact: true }).click();
    await page.getByRole("button", { name: otherApp.name + " 상세 보기", exact: true }).click();
    await page.getByRole("heading", { name: otherApp.name, exact: true }).waitFor();
    release(); await page.waitForTimeout(100); await step(page, 1);
    assert.equal(await page.locator(".candidate").count(), 0);
    assert.deepEqual(mutations(state), []);
    await clean(page, state); record("late app A GET cannot replace app B state after Back and selection");
  }
  {
    const { page, state } = await scenario({ holdAnalysisGet: true, analysisSnapshot: analysis });
    while (!state.releaseAnalysisGet) await page.waitForTimeout(20);
    const release = state.releaseAnalysisGet; state.holdAnalysisGet = false; state.analysisSnapshot = null;
    await page.reload(); await step(page, 1); release(); await page.waitForTimeout(100); await step(page, 1);
    assert.equal(await page.locator(".candidate").count(), 0); assert.deepEqual(mutations(state), []);
    await clean(page, state); record("reload aborts the old GET and restores the current server snapshot");
  }
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
    assert.equal(await page.getByRole("region", { name: "배포 자원 상태", exact: true }).count(), 0, "an undeployed app never fabricates a resource tree");
    assert.equal(state.calls.filter(call => call.path.endsWith("/resources")).length, 0, "analysis/choice/review do not fetch resources before a deployment exists");
    await deploy.click(); await step(page, 4);
    await page.screenshot({ path: "artifacts/deployment-flow-progress-viewport-mobile.png", fullPage: false });
    await page.getByText("Controlled event deploying", { exact: true }).waitFor();
    assert.equal(await page.getByLabel("배포 진행률", { exact: true }).getAttribute("value"), "63");
    await hiddenResources(page);
    assert.equal(state.calls.filter(call => call.path.endsWith("/resources")).length, 0, "active progress does not query resources");
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({ path: "artifacts/deployment-resource-progress-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await hiddenResources(page);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({ path: "artifacts/deployment-resource-progress-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.deepEqual(mutations(state).map(call => call[2]), [null, { compute: "lambda" }, { compute: "lambda", plan_id: plan.id }]);
    state.event = progress("success", 100); state.deployment = { ...dep, status: "success" };
    await step(page, 5);
    assert.equal(await page.getByRole("heading", { name: /^배포 상태.*success$/ }).count(), 0);
    await resourcesWithinStage(page);
    await page.locator("details").filter({ hasText: "aws_lambda_function.fixture" }).locator("summary").click();
    await page.getByText("aws_lambda_function.fixture", { exact: true }).waitFor();
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
    await clean(page, state); record("happy flow, sticky/mobile/keyboard review, explicit confirmation, server progress/tree, monitoring and teardown preserved");
  }
  {
    const { page, state } = await scenario({ analysisFailures: 5, planFailures: 1, deployFailures: 1 });
    await page.getByRole("button", { name: "코드 분석 시작", exact: true }).click();
    await page.getByText(/분석에 실패했습니다/).waitFor(); await step(page, 1);
    await page.getByRole("button", { name: "다시 분석", exact: true }).click(); await step(page, 2);
    await page.locator(".candidate").filter({ hasText: "lambda" }).getByRole("button", { name: "이 후보 선택", exact: true }).click();
    await page.getByRole("button", { name: "선택한 환경으로 구성안 조회", exact: true }).click();
    await page.getByText(/배포 준비 중입니다/).waitFor(); await step(page, 2);
    await page.getByRole("button", { name: "선택한 환경으로 구성안 조회", exact: true }).click(); await step(page, 3);
    await page.getByLabel("설정값을 확인했습니다", { exact: true }).check();
    await page.getByRole("button", { name: "선택한 구성안으로 배포", exact: true }).click();
    await page.getByText("Controlled deployment rejection", { exact: true }).waitFor(); await step(page, 3);
    state.event = progress("failed", 63); state.deployment = { ...dep, status: "failed", reason: "Controlled terminal failure" };
    await page.getByRole("button", { name: "선택한 구성안으로 배포", exact: true }).click(); await step(page, 4);
    await page.getByRole("alert").filter({ hasText: "Controlled terminal failure" }).waitFor(); await hiddenResources(page);
    assert.equal(state.calls.filter(call => call.path.endsWith("/resources")).length, 0);
    await page.getByRole("button", { name: "설정값 확인 · 배포 재시도", exact: true }).waitFor();
    await visitStep(page, 5); await resourcesWithinStage(page);
    await visitStep(page, 4);
    await page.getByRole("button", { name: "설정값 확인 · 배포 재시도", exact: true }).click(); await step(page, 3);
    assert.equal(await page.getByLabel("설정값을 확인했습니다", { exact: true }).isChecked(), false);
    assert.equal(state.calls.filter(call => call.method === "POST" && call.path.endsWith("/analysis")).length, 6, "five automatic attempts plus one successful manual retry");
    assert.equal(state.calls.filter(call => call.method === "POST" && call.path.endsWith("/plans")).length, 2);
    assert.equal(state.calls.filter(call => call.method === "POST" && call.path.endsWith("/deployments")).length, 2);
    await clean(page, state); record("analysis/config/deploy failures stay in their stage; explicit retries; failed terminal stays in progress with reason/retry and manual resource inspection");
  }
  for (const status of ["deploying", "success", "failed"]) {
    const { page, state } = await scenario({ latest: dep.id, deployment: { ...dep, status, reason: status === "failed" ? "Restored failure reason" : null }, event: progress(status, status === "success" ? 100 : 63), dropFirstEvent: status === "deploying", analysisSnapshot: analysis });
    await step(page, status === "success" ? 5 : 4);
    if (status === "deploying") {
      await page.getByText(/배포 상태 연결이 끊겼습니다/).waitFor();
      await page.getByText("Controlled event deploying", { exact: true }).waitFor();
      assert.ok(state.eventReads >= 2, "SSE reconnect resumes the same current step");
    }
    assert.deepEqual(mutations(state), [], "restoration never repeats business POSTs");
    await page.reload(); await step(page, status === "success" ? 5 : 4);
    if (status === "success") await resourcesWithinStage(page);
    else {
      await hiddenResources(page);
      assert.equal(state.calls.filter(call => call.path.endsWith("/resources")).length, 0);
      if (status === "failed") {
        await page.getByRole("alert").filter({ hasText: "Restored failure reason" }).waitFor();
        await visitStep(page, 5); await resourcesWithinStage(page);
      }
    }
    assert.deepEqual(mutations(state), []);
    await clean(page, state);
  }
  record("running/success/failure restore on reload; SSE reconnect; no restoration POSTs");
  {
    const { page, state } = await scenario({ latest: "old-success", deployment: { ...dep, id: "old-success", status: "success" }, event: progress("success", 100), holdAnalysis: true });
    await step(page, 5);
    const started = page.waitForRequest(request => request.url().endsWith("/analysis") && request.method() === "POST");
    await page.getByRole("button", { name: "배포 관리", exact: true }).click();
    await page.getByRole("dialog", { name: "배포 관리", exact: true }).getByRole("button", { name: /^설정 변경 · 재분석/ }).click(); await started;
    await step(page, 1); await page.waitForTimeout(200); await step(page, 1);
    assert.equal(await button(page, 5).isDisabled(), true, "old terminal success is outside the new analysis flow");
    state.holdAnalysis = false; state.releaseAnalysis(); await step(page, 2);
    await clean(page, state); record("old successful deployment never steals the active reanalysis step");
  }
  await writeFile("artifacts/deployment-flow-results.json", JSON.stringify({ status: "passed", results }, null, 2));
  console.log("PASS deployment flow: " + results.join("; "));
} finally { await browser?.close(); server.kill(); }
