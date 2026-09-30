import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "localhost",
    "--port",
    "5173",
    "--strictPort",
  ],
  { stdio: "pipe" },
);
let serverLog = "";
server.stderr.on("data", (c) => {
  serverLog += c;
});
server.stdout.on("data", (c) => {
  serverLog += c;
});
const url = "http://localhost:5173";
const results = [];
let browser;
const infra = {
  id: "api-infra",
  name: "API 기반",
  description: "서버 샘플",
  network: "public",
  computes: ["ecs-fargate", "lambda"],
  app_count: 0,
};
const app = {
  id: "app-api",
  name: "api-web",
  repo_url: "https://github.com/team/web",
  branch: "main",
  infra_id: "api-infra",
  created_at: "2026-09-30",
  latest_deployment_id: null,
};
const analysis = {
  status: "done",
  requirements: ["Node.js20"],
  evidence: [
    { file: "package.json", finding: "서버 샘플", certain: true },
    { file: "README", finding: "트래픽 미확인", certain: false },
  ],
  candidates: [
    {
      compute: "ecs-fargate",
      state: "selected",
      reason: "샘플 추천",
      cons: [],
    },
    { compute: "lambda", state: "alternative", reason: "샘플 대안", cons: [] },
    { compute: "ec2", state: "unsuitable", reason: "제외", cons: [] },
  ],
  mascot_message: "서버 분석 샘플",
};
const deployment = {
  id: "dep-api",
  app_space_id: "app-api",
  compute: "lambda",
  status: "pending",
  url: null,
  reason: null,
  created_at: "2026-09-30",
};
async function appForm(page, name, infraId) {
  await page.getByRole("button", { name: "통합", exact: true }).click();
  if (
    await page
      .getByRole("button", { name: "GitHub 연결 · 데모", exact: true })
      .count()
  )
    await page
      .getByRole("button", { name: "GitHub 연결 · 데모", exact: true })
      .click();
  const register = page.getByRole("button", {
    name: "Repository 등록: softbank-hackathon-2026/Freesia-Frontend",
    exact: true,
  });
  if (await register.count()) await register.click();
  await page.getByRole("button", { name: "애플리케이션", exact: true }).click();
  await page.getByRole("button", { name: "앱 연결", exact: true }).click();
  await page.getByLabel("앱 이름", { exact: true }).fill(name);
  await page
    .getByLabel("등록한 Repository", { exact: true })
    .selectOption(
      "https://github.com/softbank-hackathon-2026/Freesia-Frontend",
    );
  await page
    .getByLabel("기업 / 대상 Space", { exact: true })
    .selectOption(infraId);
  assert.equal(
    await page.locator('input[placeholder*="github"],#repo-url').count(),
    0,
  );
}

try {
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error(serverLog);
    try {
      if ((await fetch(url)).ok) break;
    } catch {
      /* Vite startup. */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  await mkdir("artifacts", { recursive: true });
  browser = await chromium.launch({
    executablePath:
      process.env.CHROME_PATH ||
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ]) {
    const page = await browser.newPage({
      viewport: { width, height },
      acceptDownloads: true,
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/**", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: "unavailable",
          message: "테스트 백엔드 연결 실패",
        }),
      }),
    );
    await page.goto(url);
    await page.getByRole("heading", { name: "인프라", exact: true }).waitFor();
    await page
      .getByRole("button", { name: "공개 웹 서비스용", exact: true })
      .click();
    await page.getByRole("region", { name: "인프라 상세" }).waitFor();
    await page.getByRole("button", { name: "닫기", exact: true }).click();
    await page.getByRole("button", { name: "AI로 인프라 설계" }).click();
    await page.getByRole("button", { name: "목록으로" }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("heading", { name: "인프라", exact: true }).waitFor();
    await page.getByRole("button", { name: "AI로 인프라 설계" }).click();
    await page.getByRole("button", { name: "질문 시작" }).click();
    assert.match(await page.getByRole("alert").innerText(), /요구사항/);
    const request = "<script>window.bad=1</script> 서울 개발용 웹 서비스";
    await page.getByLabel("인프라 요구사항").fill(request);
    await page.getByRole("button", { name: "질문 시작" }).click();
    await page.getByRole("button", { name: "목록으로" }).click();
    await page.getByRole("dialog", { name: "설계 대화 닫기" }).waitFor();
    await page.keyboard.press("Escape");
    assert.equal(
      await page.getByRole("dialog", { name: "설계 대화 닫기" }).count(),
      0,
    );
    assert.match(
      await page.locator(".chat.user").first().innerText(),
      /서울 개발용/,
    );
    await page.getByRole("button", { name: "서울", exact: true }).click();
    await page
      .getByRole("button", { name: "Private · 외부 경로 제외", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Multi AZ · 2개", exact: true })
      .click();
    assert.match(
      await page.getByLabel("Terraform 코드").innerText(),
      /count = 2/,
    );
    assert.doesNotMatch(
      await page.getByLabel("Terraform 코드").innerText(),
      /window.bad/,
    );
    assert.equal(await page.evaluate(() => window.bad), undefined);
    assert.equal(
      await page
        .getByRole("button", { name: "설계 저장", exact: true })
        .isDisabled(),
      true,
    );
    await page.screenshot({
      path: `artifacts/sprint02-builder-${name}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "애플리케이션", exact: false })
      .click();
    await page.getByRole("button", { name: "인프라", exact: false }).click();
    await page.getByRole("button", { name: "AI로 인프라 설계" }).click();
    assert.match(
      await page.getByLabel("Terraform 코드").innerText(),
      /count = 2/,
    );
    await page.locator(".brand").click();
    await page.getByRole("button", { name: "AI로 인프라 설계" }).click();
    assert.match(
      await page.locator(".chat.user").first().innerText(),
      /서울 개발용/,
    );
    await page.getByLabel("데이터 소스").selectOption("api");
    await page.getByLabel("데이터 소스").selectOption("demo");
    await page.getByRole("button", { name: "AI로 인프라 설계" }).click();
    assert.match(
      await page.getByLabel("Terraform 코드").innerText(),
      /count = 2/,
    );
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: ".tf 다운로드" }).click();
    assert.equal((await downloaded).suggestedFilename(), "main.tf");
    await page.getByLabel("설계 이름").fill("conversation-foundation");
    await page.getByRole("button", { name: "설계 저장", exact: true }).click();
    await page.getByRole("region", { name: "저장한 설계 상세" }).waitFor();
    await page.reload();
    await page.getByRole("button", { name: /conversation-foundation/ }).click();
    assert.match(
      await page.getByRole("region", { name: "저장한 설계 상세" }).innerText(),
      /미구축/,
    );
    await page
      .getByRole("button", { name: "애플리케이션", exact: false })
      .click();
    await page.getByLabel("데모 역할").selectOption("app");
    await page.getByRole("button", { name: "앱 연결", exact: true }).click();
    await page
      .getByRole("heading", {
        name: "등록한 Repository가 없습니다",
        exact: true,
      })
      .waitFor();
    await page
      .getByRole("button", { name: "통합에서 Repository 등록", exact: true })
      .click();
    await appForm(page, "demo-web", "demo-public");
    assert.equal(await page.locator("#registered-repo option").count(), 2);
    await page.getByRole("button", { name: "통합", exact: true }).click();
    await page
      .getByRole("button", { name: "애플리케이션", exact: true })
      .click();
    await page.getByRole("button", { name: "앱 연결", exact: true }).click();
    assert.equal(
      await page.getByLabel("앱 이름", { exact: true }).inputValue(),
      "demo-web",
    );
    assert.match(
      await page.getByLabel("등록한 Repository", { exact: true }).inputValue(),
      /Freesia-Frontend/,
    );
    await page.screenshot({path:`artifacts/day3-app-form-${name}.png`,fullPage:true});
    const disabled = page
      .locator("#infra-select option")
      .filter({ hasText: "conversation-foundation" });
    assert.equal(await disabled.getAttribute("disabled"), "");
    await page
      .getByLabel("등록한 Repository", { exact: true })
      .selectOption("");
    await page.getByRole("button", { name: "앱 만들기" }).click();
    assert.match(await page.getByRole("alert").innerText(), /등록/);
    await page
      .getByLabel("등록한 Repository", { exact: true })
      .selectOption(
        "https://github.com/softbank-hackathon-2026/Freesia-Frontend",
      );
    await page.getByRole("button", { name: "앱 만들기" }).click();
    await page.getByRole("button", { name: "배포", exact: true }).click();
    await page
      .getByRole("heading", { name: "실행 환경 후보", exact: true })
      .waitFor();
    await page.screenshot({
      path: `artifacts/sprint02-analysis-${name}.png`,
      fullPage: true,
    });
    assert.equal(await page.locator(".candidate").count(), 2);
    await page.getByRole("img", { name: "읽기 전용 분석 분기 트리" }).waitFor();
    await page
      .locator(".candidate")
      .filter({ hasText: "lambda" })
      .getByRole("button", { name: "이 후보 선택", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "선택한 환경으로 Terraform 준비",
        exact: true,
      })
      .click();
    assert.match(
      await page.getByLabel("앱 Terraform 미리보기").innerText(),
      /aws_lambda_function/,
    );
    await page.screenshot({
      path: "artifacts/day3-terraform-" + name + ".png",
      fullPage: true,
    });
    await page.getByLabel("CI 실패 시뮬레이션 · DEMO").check();
    await page
      .getByRole("button", {
        name: "commit / push 및 CI/CD 시작 · 데모",
        exact: true,
      })
      .click();
    await page.getByText("failed", { exact: true }).waitFor();
    await page
      .getByRole("button", {
        name: "실패 내용 확인 · 재시도 준비",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", {
        name: "실패한 데모 파이프라인 재시도",
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: "앱 목록으로" }).click();
    await page.reload();
    await page
      .getByRole("button", { name: "애플리케이션", exact: false })
      .click();
    await page.getByRole("button", { name: /demo-web/ }).click();
    await page.getByText("success", { exact: true }).waitFor();
    await page.screenshot({path:`artifacts/day3-pipeline-result-${name}.png`,fullPage:true});
    await page.getByRole("tab", { name: "로그", exact: true }).click();
    assert.match(await page.locator(".log-output").innerText(), /DEMO/);
    await page.getByRole("tab", { name: "모니터링", exact: true }).click();
    await page.getByText("24%", { exact: true }).waitFor();
    await page.screenshot({
      path: `artifacts/sprint02-monitoring-${name}.png`,
      fullPage: true,
    });
    await page.getByLabel("데이터 소스").selectOption("api");
    await page.getByRole("alert").waitFor();
    assert.match(
      await page.getByRole("alert").innerText(),
      /테스트 백엔드 연결 실패/,
    );
    await page.getByRole("button", { name: "인프라", exact: false }).click();
    assert.equal(
      await page
        .getByRole("button", { name: "공개 웹 서비스용", exact: true })
        .count(),
      0,
    );
    assert.equal(
      await page.getByRole("button", { name: "AI로 인프라 설계" }).count(),
      0,
    );
    assert.match(
      await page.locator("main").innerText(),
      /Infra Space 생성·인프라 배포 API는 아직/,
    );
    await page.getByLabel("데이터 소스").selectOption("demo");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    results.push({
      name,
      width,
      checks:
        "guided-chat/save/reload/not-deployable/invalid-form/app-analysis/deploy/log/metrics/API-error/no-fallback/keyboard/no-overflow/JS0 passed",
    });
    await page.close();
  }
  const apiPage = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  let apiStoreBefore;
  const calls = [];
  let serverStatus = "pending";
  let hasDeployment = false;
  await apiPage.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace("/api", "");
    calls.push({ path, method: req.method(), body: req.postData() });
    let value;
    if (path === "/infra-spaces") value = [infra];
    else if (path === "/app-spaces" && req.method() === "GET") value = [app];
    else if (path === "/app-spaces") value = app;
    else if (path === "/app-spaces/app-api")
      value = {
        ...app,
        latest_deployment_id: hasDeployment ? "dep-api" : null,
      };
    else if (path.endsWith("/analysis")) value = analysis;
    else if (path.endsWith("/events")) {
      serverStatus = "success";
      const progress = {
        status: "success",
        step: "done",
        message: "SSE 완료 샘플",
        progress: 100,
        url: "https://api.demo.freesia.dev",
        at: "now",
      };
      await route.fulfill({
        contentType: "text/event-stream",
        body: `event: progress\ndata: ${JSON.stringify(progress)}\n\n`,
      });
      return;
    } else if (path.endsWith("/deployments")) {
      hasDeployment = true;
      value = deployment;
    } else value = { ...deployment, status: serverStatus };
    await route.fulfill({
      status: req.method() === "POST" ? 201 : 200,
      contentType: "application/json",
      body: JSON.stringify(value),
    });
  });
  await apiPage.goto(url);
  apiStoreBefore = await apiPage.evaluate(() =>
    localStorage.getItem("freesia.demo.v1"),
  );
  await apiPage.getByLabel("데이터 소스").selectOption("api");
  await apiPage
    .getByRole("button", { name: "API 기반", exact: true })
    .waitFor();
  await apiPage
    .getByRole("button", { name: "애플리케이션", exact: false })
    .click();
  assert.equal(
    await apiPage
      .getByRole("button", { name: "앱 연결", exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(await apiPage.locator("#repo-url").count(), 0);
  await apiPage.getByRole("button", { name: /api-web/ }).click();
  await apiPage
    .getByRole("button", { name: "기존 앱 샘플 분석", exact: true })
    .click();
  await apiPage
    .getByRole("button", { name: "이 후보 선택", exact: true })
    .click();
  await apiPage.getByRole("button", { name: "기존 API 샘플 배포" }).click();
  await apiPage.getByText("success", { exact: true }).waitFor();
  assert.match(
    await apiPage.getByText("샘플 URL:", { exact: false }).innerText(),
    /api.demo/,
  );
  assert.deepEqual(
    JSON.parse(calls.find((c) => c.path.endsWith("/deployments")).body),
    { compute: "lambda" },
  );
  assert.equal(
    await apiPage
      .locator(".candidate")
      .filter({ hasText: "ecs-fargate" })
      .getByText("추천", { exact: true })
      .count(),
    1,
  );
  serverStatus = "building";
  await apiPage.getByRole("button", { name: "앱 목록으로" }).click();
  await apiPage.getByRole("button", { name: /api-web/ }).click();
  await apiPage.waitForTimeout(250);
  assert.equal(
    calls.filter((c) => c.path.endsWith("/events")).length,
    2,
    "reopening active deployment must resume SSE",
  );
  await apiPage.getByText("success", { exact: true }).waitFor();
  await apiPage.getByRole("button", { name: "앱 목록으로" }).click();
  await apiPage.getByRole("button", { name: /api-web/ }).click();
  await apiPage.getByText("success", { exact: true }).waitFor();
  assert.equal(
    calls.filter((c) => c.path.endsWith("/events")).length,
    2,
    "terminal deployment must not resubscribe",
  );
  await apiPage.getByRole("tab", { name: "로그", exact: true }).click();
  await apiPage
    .getByRole("heading", { name: "로그 조회 API가 아직 없습니다" })
    .waitFor();
  await apiPage.getByRole("tab", { name: "모니터링", exact: true }).click();
  await apiPage
    .getByRole("heading", { name: "메트릭·알림 API가 아직 없습니다" })
    .waitFor();
  assert.equal(
    await apiPage.evaluate(() => localStorage.getItem("freesia.demo.v1")),
    apiStoreBefore,
    "API lifecycle must not write demo storage",
  );
  await apiPage.getByLabel("데이터 소스").selectOption("demo");
  await apiPage
    .getByRole("heading", { name: "아직 애플리케이션이 없습니다" })
    .waitFor();
  results.push({
    name: "API",
    checks:
      "API create disabled/no URL; exact existing-app analyze/alternative/deploy payload/named SSE success/log-metric unsupported/isolation passed",
  });
  await apiPage.close();
  const racePage = await browser.newPage();
  let phase = "analysis";
  let eventRequests = 0;
  const a = { ...app, id: "app-a", name: "app-A" };
  const b = { ...app, id: "app-b", name: "app-B" };
  await racePage.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/infra-spaces"))
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([infra]),
      });
    if (path.endsWith("/app-spaces"))
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify([a, b]),
      });
    if (path.endsWith("/app-a") || path.endsWith("/app-b"))
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(path.endsWith("/app-a") ? a : b),
      });
    if (path.endsWith("/analysis")) {
      if (phase === "analysis") await new Promise((r) => setTimeout(r, 350));
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(analysis),
      });
    }
    if (path.endsWith("/deployments")) {
      await new Promise((r) => setTimeout(r, 350));
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ ...deployment, app_space_id: "app-a" }),
      });
    }
    if (path.endsWith("/events")) {
      eventRequests++;
      return route.fulfill({ contentType: "text/event-stream", body: "" });
    }
  });
  await racePage.goto(url);
  await racePage.getByLabel("데이터 소스").selectOption("api");
  await racePage
    .getByRole("button", { name: "API 기반", exact: true })
    .waitFor();
  await racePage
    .getByRole("button", { name: "애플리케이션", exact: false })
    .click();
  await racePage.getByRole("button", { name: /app-A/ }).click();
  const analysisStarted = racePage.waitForRequest("**/app-a/analysis");
  await racePage
    .getByRole("button", { name: "기존 앱 샘플 분석", exact: true })
    .click();
  await analysisStarted;
  await racePage.getByRole("button", { name: "앱 목록으로" }).click();
  await racePage.getByRole("button", { name: /app-B/ }).click();
  await racePage.waitForTimeout(500);
  assert.equal(
    await racePage
      .getByRole("heading", { name: "실행 환경 후보", exact: true })
      .count(),
    0,
    "late app A analysis must not populate app B",
  );
  phase = "deploy";
  await racePage.getByRole("button", { name: "앱 목록으로" }).click();
  await racePage.getByRole("button", { name: /app-A/ }).click();
  await racePage
    .getByRole("button", { name: "기존 앱 샘플 분석", exact: true })
    .click();
  await racePage
    .getByRole("heading", { name: "실행 환경 후보", exact: true })
    .waitFor();
  const deployStarted = racePage.waitForRequest("**/app-a/deployments");
  await racePage.getByRole("button", { name: "기존 API 샘플 배포" }).click();
  await deployStarted;
  await racePage.getByRole("button", { name: "앱 목록으로" }).click();
  await racePage.getByRole("button", { name: /app-B/ }).click();
  await racePage.waitForTimeout(500);
  assert.equal(
    await racePage
      .getByRole("heading", { name: "배포 상태", exact: true })
      .count(),
    0,
    "late app A deploy must not populate app B",
  );
  assert.equal(
    eventRequests,
    0,
    "late deployment must not start a stream after leaving detail",
  );
  await racePage.close();
  results.push({
    name: "async-navigation",
    checks: "late A analysis/deployment ignored after opening B passed",
  });
  const listOnly = await browser.newPage();
  let operation = "analysis";
  let listEventRequests = 0;
  await listOnly.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const fulfill = (value) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(value),
      });
    if (path.endsWith("/infra-spaces")) return fulfill([infra]);
    if (path.endsWith("/app-spaces")) {
      if (req.method() === "POST") {
        await new Promise((r) => setTimeout(r, 350));
        return fulfill({ ...app, name: "late-created" });
      }
      return fulfill([a, b]);
    }
    if (path.endsWith("/app-a") || path.endsWith("/app-b"))
      return fulfill(path.endsWith("/app-a") ? a : b);
    if (path.endsWith("/analysis")) {
      if (operation === "analysis")
        await new Promise((r) => setTimeout(r, 350));
      return fulfill(analysis);
    }
    if (path.endsWith("/deployments")) {
      await new Promise((r) => setTimeout(r, 350));
      return fulfill({ ...deployment, app_space_id: "app-a" });
    }
    if (path.endsWith("/events")) {
      listEventRequests++;
      return route.fulfill({ contentType: "text/event-stream", body: "" });
    }
  });
  await listOnly.goto(url);
  await listOnly.getByLabel("데이터 소스").selectOption("api");
  await listOnly
    .getByRole("button", { name: "API 기반", exact: true })
    .waitFor();
  await listOnly
    .getByRole("button", { name: "애플리케이션", exact: false })
    .click();
  assert.equal(
    await listOnly
      .getByRole("button", { name: "앱 연결", exact: true })
      .isDisabled(),
    true,
  );
  operation = "analysis";
  await listOnly.getByRole("button", { name: /app-A/ }).click();
  const listAnalyzeReq = listOnly.waitForRequest("**/app-a/analysis");
  await listOnly
    .getByRole("button", { name: "기존 앱 샘플 분석", exact: true })
    .click();
  await listAnalyzeReq;
  await listOnly.getByRole("button", { name: "앱 목록으로" }).click();
  await listOnly.waitForTimeout(500);
  assert.equal(
    await listOnly
      .getByRole("heading", { name: "실행 환경 후보", exact: true })
      .count(),
    0,
  );
  operation = "deploy";
  await listOnly.getByRole("button", { name: /app-A/ }).click();
  await listOnly
    .getByRole("button", { name: "기존 앱 샘플 분석", exact: true })
    .click();
  await listOnly
    .getByRole("heading", { name: "실행 환경 후보", exact: true })
    .waitFor();
  const listDeployReq = listOnly.waitForRequest("**/app-a/deployments");
  await listOnly.getByRole("button", { name: "기존 API 샘플 배포" }).click();
  await listDeployReq;
  await listOnly.getByRole("button", { name: "앱 목록으로" }).click();
  await listOnly.waitForTimeout(500);
  assert.equal(
    listEventRequests,
    0,
    "late list-only deployment must not start stream",
  );
  assert.equal(
    await listOnly
      .getByRole("heading", { name: "배포 상태", exact: true })
      .count(),
    0,
  );
  await listOnly.close();
  results.push({
    name: "list-only-navigation",
    checks:
      "API create disabled; late analyze/deploy ignored on Back without opening B passed",
  });

  for (const [viewportName, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/**", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "연결 실패" }),
      }),
    );
    await page.goto(url);
    for (const name of ["인프라", "애플리케이션", "통합"])
      assert.equal(
        await page.getByRole("button", { name, exact: true }).count(),
        1,
      );
    await page.screenshot({
      path: "artifacts/day3-main-" + viewportName + ".png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Infra Space 만들기", exact: true })
      .click();
    await page
      .getByLabel("Space 이름", { exact: true })
      .fill("preserved-foundation");
    await page.getByRole("button", { name: "통합", exact: true }).click();
    await page.getByRole("button", { name: "인프라", exact: true }).click();
    await page
      .getByRole("button", { name: "Infra Space 만들기", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("Space 이름", { exact: true }).inputValue(),
      "preserved-foundation",
    );
    for (const [i, template] of [
      "Public 중심",
      "Multi-AZ",
      "DB 격리",
    ].entries()) {
      if (i)
        await page
          .getByRole("button", { name: "Infra Space 만들기", exact: true })
          .click();
      await page.getByLabel("Space 이름", { exact: true }).fill("sample-" + i);
      await page
        .getByLabel("기업 / 대상", { exact: true })
        .selectOption("LINE 샘플 대상");
      await page.getByRole("radio", { name: new RegExp(template) }).check();
      if (i === 2)
        await page.screenshot({
          path: "artifacts/day3-infra-form-" + viewportName + ".png",
          fullPage: true,
        });
      await page
        .getByRole("button", { name: "Space 생성 · 데모", exact: true })
        .click();
      const detail = page.getByRole("region", {
        name: "Space 상세",
        exact: true,
      });
      assert.match(await detail.innerText(), /미구축/);
      if (i === 2)
        assert.match(
          await detail.innerText(),
          /Bastion.*VPC Gateway Endpoint.*코드에 생성되지/s,
        );
      await page.getByLabel("데모 역할").selectOption("app");
      assert.equal(
        await page
          .getByRole("button", { name: "인프라 배포 · 데모", exact: true })
          .count(),
        0,
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Infra Space 만들기", exact: true })
          .count(),
        0,
      );
      assert.equal(
        await page
          .getByRole("button", { name: "AI로 인프라 설계", exact: true })
          .count(),
        0,
      );
      await page.getByLabel("데모 역할").selectOption("infra");
      await page
        .getByRole("button", { name: "인프라 배포 · 데모", exact: true })
        .click();
      assert.match(await detail.innerText(), /DEMO 배포 완료.*실제 AWS/s);
      assert.equal(
        await page
          .getByRole("button", { name: "sample-" + i, exact: true })
          .count(),
        1,
      );
    }
    await page.screenshot({
      path: "artifacts/day3-infra-ready-" + viewportName + ".png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "통합", exact: true }).click();
    await page
      .getByRole("button", { name: "GitHub 연결 · 데모", exact: true })
      .click();
    assert.equal(
      await page.getByRole("button", { name: /Repository 등록:/ }).count(),
      2,
    );
    await page
      .getByRole("button", {
        name: "Repository 등록: softbank-hackathon-2026/Freesia-Frontend",
        exact: true,
      })
      .click();
    await page.screenshot({
      path: "artifacts/day3-integration-" + viewportName + ".png",
      fullPage: true,
    });
    await page.reload();
    await page.getByRole("button", { name: "통합", exact: true }).click();
    assert.equal(
      await page
        .getByRole("button", {
          name: "등록 해제: softbank-hackathon-2026/Freesia-Frontend",
          exact: true,
        })
        .count(),
      1,
    );
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("freesia.demo.v1")),
    );
    assert.equal(saved.meeting.spaces.length, 3);
    assert.equal(
      saved.meeting.spaces.every((s) => s.status === "demo_deployed"),
      true,
    );
    await page.getByLabel("데이터 소스").selectOption("api");
    assert.equal(
      await page
        .getByRole("button", { name: "GitHub 연결 · 데모", exact: true })
        .count(),
      0,
    );
    assert.match(await page.locator("main").innerText(), /OAuth.*API가 아직/s);
    await page.getByRole("button", { name: "인프라", exact: true }).click();
    assert.equal(
      await page
        .getByRole("button", { name: "Infra Space 만들기", exact: true })
        .count(),
      0,
    );
    assert.equal(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("freesia.demo.v1")).meeting.spaces
            .length,
      ),
      3,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    await page.close();
    results.push({
      name: "day3-sprint01-" + viewportName,
      checks:
        "three entry points, three templates source->demo-ready, role read-only, draft retention, explicit repo registration, reload/API isolation passed",
    });
  }
  const quota = await browser.newPage();
  await quota.addInitScript(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException("quota", "QuotaExceededError");
    };
  });
  await quota.goto(url);
  await quota.getByRole("button", { name: "AI로 인프라 설계" }).click();
  await quota.getByLabel("인프라 요구사항").fill("저장 오류 확인용");
  await quota.getByRole("button", { name: "질문 시작" }).click();
  await quota.getByRole("button", { name: "서울", exact: true }).click();
  await quota
    .getByRole("button", { name: "Public · 인터넷 경로 포함", exact: true })
    .click();
  await quota
    .getByRole("button", { name: "Single AZ · 1개", exact: true })
    .click();
  await quota.getByLabel("설계 이름").fill("retain-draft");
  await quota.getByRole("button", { name: "설계 저장", exact: true }).click();
  assert.match(await quota.getByRole("alert").innerText(), /저장하지 못/);
  assert.equal(
    await quota.getByLabel("설계 이름").inputValue(),
    "retain-draft",
  );
  await quota.getByLabel("Terraform 코드").waitFor();
  await quota.close();
  results.push({
    name: "quota",
    checks:
      "storage failure visible and conversation/code/name retained passed",
  });

  const infraQuota = await browser.newPage();
  await infraQuota.addInitScript(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException("quota", "QuotaExceededError");
    };
  });
  await infraQuota.goto(url);
  await infraQuota
    .getByRole("button", { name: "Infra Space 만들기", exact: true })
    .click();
  await infraQuota
    .getByLabel("Space 이름", { exact: true })
    .fill("retain-space-draft");
  await infraQuota
    .getByRole("button", { name: "Space 생성 · 데모", exact: true })
    .click();
  assert.match(await infraQuota.getByRole("alert").innerText(), /저장하지 못/);
  assert.equal(
    await infraQuota.getByLabel("Space 이름", { exact: true }).inputValue(),
    "retain-space-draft",
  );
  await infraQuota.getByRole("button", { name: "통합", exact: true }).click();
  await infraQuota
    .getByRole("button", { name: "GitHub 연결 · 데모", exact: true })
    .click();
  assert.match(await infraQuota.getByRole("alert").innerText(), /저장하지 못/);
  await infraQuota.close();
  results.push({
    name: "meeting-quota",
    checks:
      "new Infra draft retained; GitHub connection persistence error visible passed",
  });
  const pipelineQuota = await browser.newPage();
  await pipelineQuota.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (String(value).includes('"demo_pipeline"'))
        throw new DOMException("quota", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await pipelineQuota.goto(url);
  await appForm(pipelineQuota, "retain-plan", "demo-public");
  await pipelineQuota
    .getByRole("button", { name: "앱 만들기", exact: true })
    .click();
  await pipelineQuota
    .getByRole("button", { name: "배포", exact: true })
    .click();
  await pipelineQuota
    .locator(".candidate")
    .filter({ hasText: "ecs-fargate" })
    .getByRole("button", { name: "이 후보 선택", exact: true })
    .click();
  await pipelineQuota
    .getByRole("button", {
      name: "선택한 환경으로 Terraform 준비",
      exact: true,
    })
    .click();
  await pipelineQuota
    .getByRole("button", {
      name: "commit / push 및 CI/CD 시작 · 데모",
      exact: true,
    })
    .click();
  assert.match(
    await pipelineQuota.getByRole("alert").innerText(),
    /저장하지 못/,
  );
  assert.equal(
    await pipelineQuota.getByLabel("앱 Terraform 미리보기").count(),
    1,
  );
  assert.equal(
    await pipelineQuota.evaluate(
      () =>
        JSON.parse(localStorage.getItem("freesia.demo.v1")).deployments.length,
    ),
    0,
  );
  await pipelineQuota.close();
  results.push({
    name: "pipeline-quota",
    checks:
      "failure to persist start does not run pipeline; selected Terraform preview retained passed",
  });
  const corrupt = await browser.newPage();
  await corrupt.addInitScript(() =>
    localStorage.setItem("freesia.demo.v1", '{"version":99}'),
  );
  await corrupt.goto(url);
  await corrupt.getByRole("alert").waitFor();
  await corrupt
    .getByRole("button", { name: "손상된 데모 데이터 초기화" })
    .click();
  assert.equal(await corrupt.getByRole("alert").count(), 0);
  await corrupt.close();
  results.push({
    name: "corrupt-store",
    checks: "visible error + explicit reset passed",
  });
  await writeFile(
    "artifacts/browser-results.json",
    JSON.stringify({ status: "passed", results }, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser?.close();
  server.kill();
}
