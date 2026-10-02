import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { setTimeout, clearTimeout } from "node:timers";
import assert from "node:assert/strict";

const port = process.env.UX_CHECK_PORT || "15177";
const base = `http://localhost:${port}`;
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "localhost", "--port", port, "--strictPort"], { stdio: "pipe" });
let browser, release = () => {};
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Vite startup timeout")), 15000);
    server.once("exit", code => { clearTimeout(timer); reject(new Error(`Vite exited ${code}`)); });
    server.stderr.on("data", data => process.stderr.write(data));
    server.stdout.on("data", data => { if (String(data).includes("Local:")) { clearTimeout(timer); resolve(); } });
  });
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(7000);
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  const infra = { id: "infra-ux", name: "UX Infra", description: "", network: "public", computes: ["ecs-fargate"], app_count: 0 };
  const repo = { id: "repo-ux", name: "example/shop", repo_url: "https://github.com/example/shop", branch: "main", created_at: "2026-10-03T00:00:00Z" };
  let apps = [], postCount = 0, createMode = "held", postStarted;
  let appsFail = false, infraFail = false;
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    const json = (value, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    if (path.endsWith("/repositories")) return json([repo]);
    if (path.endsWith("/infra-spaces")) return infraFail ? json({ message: "Infra list unavailable" }, 500) : json([{ ...infra, app_count: apps.length }]);
    if (path.endsWith("/app-spaces")) {
      if (route.request().method() !== "POST") return appsFail ? json({ message: "App list unavailable" }, 500) : json(apps);
      postCount++;
      const app = { ...route.request().postDataJSON(), id: `app-ux-${postCount}`, created_at: "2026-10-03T00:00:00Z", latest_deployment_id: null };
      apps = [...apps, app];
      postStarted?.();
      if (createMode === "held") await new Promise(resolve => release = resolve);
      return createMode === "uncertain" ? json({ message: "Response lost after creation" }, 503) : json(app, 201);
    }
    const app = apps.find(value => path.endsWith("/" + value.id));
    if (app) return json(app);
    return json({ message: "Unused fixture route" }, 404);
  });
  const create = async name => {
    await page.getByRole("button", { name: "애플리케이션", exact: true }).click();
    const back = page.getByRole("button", { name: "앱 목록으로", exact: true });
    if (await back.isVisible()) await back.click();
    await page.getByRole("button", { name: "애플리케이션 생성", exact: true }).click();
    await page.getByLabel("앱 이름", { exact: true }).fill(name);
    await page.getByLabel("등록한 Repository", { exact: true }).selectOption(repo.id);
    await page.getByLabel("Infra Space", { exact: true }).selectOption(infra.id);
    const started = new Promise(resolve => postStarted = resolve);
    await page.getByRole("button", { name: "애플리케이션 생성", exact: true }).click();
    await started;
  };
  await page.goto(base + "/?source=api");
  await create("First app");
  assert.equal(await page.getByRole("button", { name: "취소", exact: true }).isDisabled(), true, "Creation cancel must be disabled while POST is pending");
  release();
  await page.getByRole("heading", { name: "First app", exact: true }).waitFor();
  assert.equal(postCount, 1);
  await create("Background app");
  await page.getByRole("button", { name: "통합", exact: true }).click();
  const listed = page.waitForResponse(response => response.request().method() === "GET" && response.url().endsWith("/app-spaces"));
  await page.getByRole("button", { name: "Repository 새로고침", exact: true }).click();
  await listed;
  const completed = page.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith("/app-spaces"));
  release();
  await completed;
  await page.getByRole("button", { name: "애플리케이션", exact: true }).click();
  await page.getByRole("button", { name: "Background app 상세 보기", exact: true }).waitFor();
  createMode = "uncertain";
  await create("Uncertain app");
  await page.getByRole("alert").filter({ hasText: "생성 결과" }).waitFor();
  await page.getByRole("button", { name: "Uncertain app 상세 보기", exact: true }).waitFor();
  assert.equal(postCount, 3, "Uncertain creation must never automatically retry POST");
  appsFail = true;
  await page.goto(base + "/?source=api");
  await page.getByRole("button", { name: "UX Infra", exact: true }).waitFor();
  appsFail = false; infraFail = true;
  await page.reload();
  await page.getByRole("button", { name: "애플리케이션", exact: true }).click();
  await page.getByRole("button", { name: "First app 상세 보기", exact: true }).waitFor();
  infraFail = false; createMode = "ok";
  await page.goto(base + "/?source=api");
  await create("Count app");
  await page.getByRole("heading", { name: "Count app", exact: true }).waitFor();
  await page.getByRole("button", { name: "인프라 스페이스", exact: true }).click();
  const infraRow = page.getByRole("row").filter({ has: page.getByRole("button", { name: "UX Infra", exact: true }) });
  await infraRow.getByRole("cell", { name: "4", exact: true }).waitFor();
  console.log("PASS lists: independent failures and app count refresh after creation");
  assert.deepEqual(errors, []);
  console.log("PASS creation: cancel guard, background success, uncertain-outcome reconciliation");
} finally {
  release();
  await browser?.close();
  server.kill();
}
