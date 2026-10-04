import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";

// Every API response is a local fixture; this harness cannot mutate a live backend.
const port = process.env.ANALYSIS_RETRY_PORT || "15246";
const base = `http://localhost:${port}`;
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "localhost", "--port", port, "--strictPort"], { stdio: "pipe" });
let serverLog = "", browser;
server.stdout.on("data", chunk => serverLog += chunk);
server.stderr.on("data", chunk => serverLog += chunk);
const app = { id: "retry-app", name: "분석 재시도 검증 앱", repo_url: "https://github.com/fixture/retry", branch: "main", infra_id: "retry-infra", created_at: "2026-10-03T00:00:00Z", latest_deployment_id: null, teardown_requested_at: null, teardown_status: null };
const other = { ...app, id: "other-app", name: "다른 검증 앱" };
const infra = { id: app.infra_id, name: "Controlled Infra", description: "Test fixture", network: "public", computes: ["lambda"], deployable_computes: ["lambda"], app_count: 2 };
const done = { status: "done", requirements: ["Node.js20"], evidence: [], candidates: [{ compute: "lambda", state: "selected", reason: "Controlled recommendation", cons: [] }], mascot_message: null };
const failed = attempt => ({ ...done, status: "failed", candidates: [], mascot_message: `Fixture attempt ${attempt} failed: throttled` });
const running = { ...done, status: "running", candidates: [] };
const records = [];
const record = value => { records.push(value); console.log("PASS " + value); };
const stage = (page, label) => page.getByRole("navigation", { name: "배포 단계", exact: true }).getByRole("button", { name: label, exact: true });
async function atStage(page, label) {
  await page.waitForFunction(expected => document.querySelector('[aria-current="step"]')?.getAttribute("aria-label") === expected, label);
  assert.equal(await stage(page, label).getAttribute("aria-current"), "step");
}
async function scenario(options = {}) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(9000);
  const state = { posts: 0, reads: 0, failures: 0, snapshot: null, holdPosts: new Set(), releases: new Map(), holdPoll: false, releasePoll: null, response: done, httpError: false, errors: [], unexpected: [], ...options };
  page.on("pageerror", error => state.errors.push(error.message));
  await page.route("**/api/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    const json = (value, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/infra-spaces")) return json([infra]);
    if (path.endsWith("/" + infra.id)) return json(infra);
    if (path.endsWith("/repositories")) return json([]);
    if (path.endsWith("/app-spaces")) return json([app, other]);
    if (path.endsWith("/" + app.id)) return json(app);
    if (path.endsWith("/" + other.id)) return json(other);
    if (path.endsWith("/analysis")) {
      if (request.method() === "GET") {
        state.reads++;
        if (path.includes("/" + other.id + "/")) return json({ message: "Not started" }, 404);
        if (state.posts && state.holdPoll) await new Promise(resolve => state.releasePoll = resolve);
        return state.snapshot ? json(state.snapshot) : json({ message: "Not started" }, 404);
      }
      assert.ok(path.includes("/" + app.id + "/"), "only explicitly selected app is analyzed");
      const attempt = ++state.posts;
      if (state.holdPosts.has(attempt)) await new Promise(resolve => state.releases.set(attempt, resolve));
      if (state.httpError) return json({ message: "Controlled request outage" }, 503);
      state.snapshot = attempt <= state.failures ? failed(attempt) : state.response;
      return json(state.snapshot);
    }
    state.unexpected.push(path);
    return json({ message: "Unexpected fixture route" }, 404);
  });
  await page.goto(`${base}/?source=api&app=${app.id}`);
  await page.getByRole("heading", { name: app.name, exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector(".deployment-stage-actions button")?.disabled);
  await page.evaluate(() => {
    window.observedFailures = [];
    new window.MutationObserver(() => {
      for (const element of document.querySelectorAll('[role="alert"], .mascot')) {
        if (/Fixture attempt|분석에 실패했습니다/.test(element.textContent)) window.observedFailures.push(element.textContent);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  return { page, state };
}
async function until(page, check) {
  for (let count = 0; count < 180; count++) {
    if (check()) return;
    await page.waitForTimeout(50);
  }
  assert.fail("fixture did not reach expected request state");
}
async function noFailure(page) {
  assert.equal(await page.getByRole("alert").count(), 0, "intermediate failures never display an alert");
  assert.deepEqual(await page.evaluate(() => window.observedFailures), [], "no transient failure alert or mascot was rendered");
}
async function clean(page, state) {
  assert.deepEqual(state.errors, []);
  assert.deepEqual(state.unexpected, [], "all API requests use controlled fixtures");
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.close();
}
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error(serverLog);
    try { if ((await fetch(base)).ok) { ready = true; break; } } catch { /* Await owned Vite server. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, serverLog || "Vite failed to start");
  await mkdir("artifacts", { recursive: true });
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  {
    const { page, state } = await scenario({ failures: 1, holdPosts: new Set([1]), response: running, holdPoll: true });
    await page.getByRole("button", { name: "코드 분석 시작", exact: true }).click();
    await until(page, () => state.releases.has(1));
    await page.getByRole("status").filter({ hasText: "코드를 분석하고 있습니다." }).waitFor();
    state.releases.get(1)();
    await until(page, () => state.releasePoll);
    await page.getByRole("status").filter({ hasText: "분석을 자동으로 재시도하고 있습니다." }).waitFor();
    await atStage(page, "코드 분석"); await noFailure(page);
    assert.doesNotMatch(await page.getByRole("status").allTextContents().then(values => values.join(" ")), /\([1-5]\/5\)/, "retry status hides numeric attempt counts");
    assert.equal(state.posts, 2);
    await page.screenshot({ path: "artifacts/analysis-auto-retry-desktop.png", fullPage: true });
    state.snapshot = done; state.holdPoll = false; state.releasePoll();
    await atStage(page, "실행 환경 선택"); await noFailure(page);
    assert.equal(state.posts, 2);
    await clean(page, state); record("first failure retries silently; pending second attempt succeeds and advances to stage 2");
  }
  {
    const { page, state } = await scenario({ failures: 5 });
    await page.getByRole("button", { name: "코드 분석 시작", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: failed(5).mascot_message }).waitFor();
    await atStage(page, "코드 분석");
    await page.waitForTimeout(2500);
    assert.equal(state.posts, 5, "five total attempts includes the initial POST; no sixth automatic POST");
    const failures = await page.evaluate(() => window.observedFailures);
    assert.ok(failures.length > 0);
    assert.ok(failures.every(text => text.includes("Fixture attempt 5 failed")), "only final reason can become visible");
    await page.screenshot({ path: "artifacts/analysis-retry-exhausted-desktop.png", fullPage: true });
    state.failures = 0; state.holdPosts.add(6);
    await page.getByRole("button", { name: "다시 분석", exact: true }).click();
    await until(page, () => state.releases.has(6));
    await page.getByRole("status").filter({ hasText: "코드를 분석하고 있습니다." }).waitFor();
    assert.equal(await page.getByRole("alert").count(), 0, "manual session clears previous final error");
    assert.doesNotMatch(await page.getByRole("status").allTextContents().then(values => values.join(" ")), /\([1-5]\/5\)/, "fresh session hides numeric attempt counts");
    state.releases.get(6)();
    await atStage(page, "실행 환경 선택");
    assert.equal(state.posts, 6);
    await clean(page, state); record("five failures expose only the final reason; manual retry starts a fresh session and succeeds");
  }
  {
    const { page, state } = await scenario({ failures: 5, holdPosts: new Set([2]) });
    await page.getByRole("button", { name: "코드 분석 시작", exact: true }).click();
    await until(page, () => state.releases.has(2));
    await page.getByRole("button", { name: "앱 목록으로", exact: true }).click();
    await page.getByRole("button", { name: other.name + " 상세 보기", exact: true }).click();
    await page.getByRole("heading", { name: other.name, exact: true }).waitFor();
    state.releases.get(2)();
    await page.waitForTimeout(2500);
    assert.equal(state.posts, 2, "leaving aborts the session before any subsequent retry");
    await atStage(page, "코드 분석"); await noFailure(page);
    assert.equal(await page.getByRole("status").filter({ hasText: /[1-5]\/5/ }).count(), 0, "other app has no stale retry count");
    await clean(page, state); record("switching apps during attempt 2 cancels retries and prevents stale failure/state");
  }
  {
    const { page, state } = await scenario({ snapshot: failed("historical") });
    await page.getByRole("alert").filter({ hasText: failed("historical").mascot_message }).waitFor();
    await page.waitForTimeout(2500);
    assert.equal(state.posts, 0, "restored failed snapshot never authorizes a new analysis POST");
    await clean(page, state); record("historical failed GET remains read-only with no automatic POST");
  }
  {
    const { page, state } = await scenario({ httpError: true });
    await page.getByRole("button", { name: "코드 분석 시작", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Controlled request outage" }).waitFor();
    await page.waitForTimeout(2500);
    assert.equal(state.posts, 1, "HTTP error is not confirmed analysis failure and cannot auto POST");
    await clean(page, state); record("HTTP request errors are surfaced without retrying analysis POST");
  }
  console.log(JSON.stringify({ passed: records.length, results: records }, null, 2));
} finally {
  await browser?.close();
  server.kill();
}
