import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

// Only run against the explicitly marked local backend, never the public service.
const baseURL = "http://localhost:5173";
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const api = context.request;
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const suffix = Date.now().toString(36);
const repoURL = "https://github.com/local-integration/freesia-" + suffix;
const appName = "local-integration-" + suffix;
let repositoryId;
const results = [];
const get = (path) => api.get(baseURL + "/api" + path);
async function navigate(name) {
  if (await page.locator(".sidebar-toggle").isVisible()) {
    const button = page.locator(".sidebar-toggle");
    if (await button.getAttribute("aria-expanded") !== "true") await button.click();
  }
  await page.locator(".sidebar-nav").getByRole("button", { name, exact: true }).click();
}
try {
  const versionResponse = await get("/version.txt");
  assert.equal(versionResponse.status(), 200);
  const version = (await versionResponse.text()).trim();
  assert.match(version, /^local-/);
  assert.equal((await get("/health/db")).status(), 200);
  await mkdir("artifacts", { recursive: true });
  const infraResponse = await get("/infra-spaces");
  assert.equal(infraResponse.status(), 200);
  const infras = await infraResponse.json();
  assert.ok(infras.length > 0);
  await page.goto(baseURL);
  const demoBefore = await page.evaluate(() => localStorage.getItem("freesia.demo.v1"));
  await page.getByLabel("데이터 소스").selectOption("api");
  await navigate("통합");
  await page.getByLabel("Repository URL").fill(repoURL);
  const registration = page.waitForResponse((r) => r.url().endsWith("/api/repositories") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Repository 등록", exact: true }).click();
  const created = await registration;
  assert.equal(created.status(), 201);
  const repo = await created.json();
  repositoryId = repo.id;
  assert.equal(repo.branch, "main");
  assert.equal(repo.repo_url, repoURL);
  await page.getByRole("button", { name: "등록 해제: " + repo.name + " (main)", exact: true }).waitFor();
  await page.getByLabel("Repository URL").fill(repoURL);
  await page.getByRole("button", { name: "Repository 등록", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "이미 등록한 Repository" }).waitFor();
  const duplicate = await api.post(baseURL + "/api/repositories", { data: { repo_url: repoURL } });
  assert.equal(duplicate.status(), 409);
  const invalid = await api.post(baseURL + "/api/repositories", { data: { repo_url: "https://example.com/invalid" } });
  assert.equal(invalid.status(), 422);
  await page.reload();
  await page.getByLabel("데이터 소스").selectOption("api");
  await navigate("통합");
  await page.getByRole("button", { name: "등록 해제: " + repo.name + " (main)", exact: true }).waitFor();
  await page.screenshot({ path: "artifacts/local-api-integration-desktop.png", fullPage: true });
  results.push("repository register201, duplicate409 UI, validation422, reload/list persistence");

  await navigate("애플리케이션");
  await page.getByRole("button", { name: "앱 연결", exact: true }).click();
  await page.getByLabel("앱 이름").fill(appName);
  await page.getByLabel("등록한 Repository", { exact: true }).selectOption(repo.id);
  await page.getByLabel("Infra Space", { exact: true }).selectOption(infras[0].id);
  const appCreation = page.waitForResponse((r) => r.url().endsWith("/api/app-spaces") && r.request().method() === "POST");
  await page.getByRole("button", { name: "앱 만들기", exact: true }).click();
  const appResponse = await appCreation;
  assert.equal(appResponse.status(), 201);
  const app = await appResponse.json();
  assert.equal(app.repo_url, repoURL);
  assert.equal(app.branch, "main");
  assert.equal(app.infra_id, infras[0].id);
  assert.ok(!app.infra_id.startsWith("demo-"));
  const appButton = page.getByRole("button", { name: new RegExp(appName) });
  if (await appButton.count()) await appButton.click();
  await page.getByRole("button", { name: "기존 앱 샘플 분석", exact: true }).click();
  await page.locator(".candidate").filter({ hasText: "ecs-fargate" }).getByRole("button").first().waitFor();
  const deploymentResponse = page.waitForResponse((r) => r.url().endsWith("/deployments") && r.request().method() === "POST");
  await page.getByRole("button", { name: "기존 API 샘플 배포", exact: true }).click();
  const deployment = await (await deploymentResponse).json();
  await page.getByText("success", { exact: true }).waitFor({ timeout: 25000 });
  assert.equal((await (await get("/deployments/" + deployment.id)).json()).status, "success");
  await page.screenshot({ path: "artifacts/local-api-deployment-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "앱 목록으로", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(appName) }).click();
  await page.getByText("success", { exact: true }).waitFor();
  results.push("app create201 from registered repo/server infra, sample analysis, real SSE transport success, detail reentry");

  await page.setViewportSize({ width: 390, height: 844 });
  await navigate("통합");
  await page.getByRole("button", { name: "등록 해제: " + repo.name + " (main)", exact: true }).waitFor();
  await page.screenshot({ path: "artifacts/local-api-integration-mobile.png", fullPage: true });
  const removal = page.waitForResponse((r) => r.url().endsWith("/api/repositories/" + repo.id) && r.request().method() === "DELETE");
  await page.getByRole("button", { name: "등록 해제: " + repo.name + " (main)", exact: true }).click();
  assert.equal((await removal).status(), 204);
  repositoryId = undefined;
  assert.equal((await (await get("/repositories")).json()).some((r) => r.id === repo.id), false);
  assert.equal((await get("/app-spaces/" + app.id)).status(), 200);
  const demoAfter = await page.evaluate(() => localStorage.getItem("freesia.demo.v1"));
  assert.equal(demoAfter, demoBefore);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  assert.deepEqual(errors, []);
  results.push("mobile unregister204 preserves existing app, demo storage unchanged, no overflow/page errors");
  await writeFile("artifacts/local-api-results.json", JSON.stringify({
    status: "passed", backendVersion: version, testedAt: new Date().toISOString(),
    results, appId: app.id, deploymentId: deployment.id,
    limits: "SQLite local runtime; backend AI/deployment are samples; no external GitHub/AWS execution.",
  }, null, 2));
  console.log(JSON.stringify({ status: "passed", backendVersion: version, results }));
} catch (error) {
  await page.screenshot({ path: "artifacts/local-api-failure.png", fullPage: true });
  console.error((await page.locator("body").innerText()).slice(-1600));
  throw error;
} finally {
  if (repositoryId) await api.delete(baseURL + "/api/repositories/" + repositoryId);
  await browser.close();
}
