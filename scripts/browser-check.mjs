import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { initialDemo, makeDesign } from "../src/lib/demo.ts";
import { makeInfraSpace, connectGitHubDemo, registerRepository } from "../src/lib/meeting.ts";
import { reviseInfra, generateInfra, startInfraApply, advanceInfraApply } from "../src/lib/infraFlow.ts";
const flowerBackup = await readFile(
  new URL("../public/freesia-flower.svg", import.meta.url),
  "utf8",
);
const port = process.env.BROWSER_CHECK_PORT || "5173";
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "--host",
    "localhost",
    "--port",
    port,
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
const url = `http://localhost:${port}`;
const results = [];
const record = result => { results.push(result); console.log("PASS " + result.name); };
let browser;
function luminance(color) {
  const channels = color.match(/[\d.]+/g).slice(0, 3).map((value) => {
    const channel = Number(value) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrastRatio(foreground, background) {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
const infra = {
  id: "api-infra",
  name: "API 기반",
  description: "서버 샘플",
  network: "public",
  computes: ["ecs-fargate", "lambda"],
  deployable_computes: ["ecs-fargate", "lambda"],
  app_count: 0,
};
const repository = { id: "repo-api", name: "team/web", repo_url: "https://github.com/team/web", branch: "main", created_at: "2026-10-02T00:00:00Z" };
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
async function switchSource(page, source) {
  const destination = new URL(page.url());
  if (!destination.searchParams.has("page")) destination.searchParams.set("page", destination.searchParams.has("app") ? "apps" : "infra");
  destination.searchParams.set("source", source);
  destination.searchParams.delete("app");
  destination.searchParams.delete("tab");
  await page.goto(destination.href);
}
async function assertReadOnlyInfra(page) {
  for (const name of ["새로고침", "스페이스 생성", "스페이스 삭제"])
    assert.equal(await page.locator(".infra-list").getByRole("button", { name, exact: true }).count(), 0, "API infra is read-only: " + name + " is absent");
  assert.equal(await page.getByLabel("Space 이름", { exact: true }).count(), 0, "API mode has no infra creation form");
  assert.equal(await page.getByRole("dialog", { name: "스페이스 삭제", exact: true, includeHidden: true }).count(), 0, "API mode has no infra deletion dialog");
}
async function reviewDeploymentStep(page, label) {
  const target = page.getByRole("navigation", { name: "배포 단계", exact: true }).getByRole("button", { name: label, exact: true });
  await target.click();
  assert.equal(await target.getAttribute("aria-current"), "step");
}
async function openNavigation(page) {
  if (!(await page.locator("#primary-navigation").isVisible()))
    await page
      .getByRole("button", { name: "주요 메뉴 열기", exact: true })
      .click();
}
async function navigate(page, name) {
  await openNavigation(page);
  const link = page
    .locator(".sidebar-nav")
    .getByRole("button", { name, exact: true, includeHidden: true });
  await link.click();
  assert.equal(await link.getAttribute("aria-current"), "page");
  assert.equal(
    await page.locator('.sidebar-link[aria-current="page"]').count(),
    1,
  );
  if (await page.locator(".sidebar-toggle").isVisible()) {
    assert.equal(
      await page.locator(".sidebar-toggle").getAttribute("aria-expanded"),
      "false",
    );
    assert.equal(await page.locator("#primary-navigation").isVisible(), false);
  }
}
async function checkDashboardTheme(page) {
  const colors = await page.evaluate(() => {
    const root = window.getComputedStyle(document.documentElement);
    const style = (selector) => window.getComputedStyle(document.querySelector(selector));
    const primary = style(".primary");
    const active = style(".sidebar-link.active");
    const link = style(".text-button");
    return {
      canvas: root.backgroundColor,
      body: window.getComputedStyle(document.body).backgroundColor,
      sidebar: style(".sidebar").backgroundColor,
      masthead: style(".masthead").backgroundColor,
      backdrop: style(".console").backgroundImage,
      heroColor: style(".page-heading h1").color,
      primaryRadius: primary.borderTopLeftRadius,
      inactiveColor: style(".sidebar-link:not(.active)").color,
      primaryBackground: primary.backgroundColor,
      primaryColor: primary.color,
      primaryBorderWidth: primary.borderTopWidth,
      secondaryBorderWidth: style(".secondary").borderTopWidth,
      panelBorderWidth: style(".infra-list").borderTopWidth,
      bannerBorderWidth: style(".source-banner").borderTopWidth,
      activeBackground: active.backgroundColor,
      activeColor: active.color,
      linkColor: link.color,
    };
  });
  assert.equal(colors.canvas, "rgb(255, 255, 255)");
  assert.equal(colors.body, "rgb(255, 255, 255)");
  assert.equal(colors.sidebar, "rgb(255, 255, 255)");
  assert.match(colors.backdrop, /rgb\(255, 193, 7\)/);
  assert.match(colors.backdrop, /rgb\(249, 224, 118\)/);
  assert.ok(contrastRatio(colors.heroColor, "rgb(255, 193, 7)") >= 4.5);
  assert.ok(contrastRatio(colors.heroColor, "rgb(249, 224, 118)") >= 4.5);
  assert.equal(colors.masthead, "rgba(0, 0, 0, 0)");
  assert.equal(colors.inactiveColor, "rgb(43, 46, 70)");
  assert.ok(contrastRatio(colors.inactiveColor, colors.sidebar) >= 4.5);
  assert.equal(colors.primaryBackground, "rgb(47, 92, 200)");
  assert.equal(colors.primaryColor, "rgb(255, 255, 255)");
  for (const border of [colors.primaryBorderWidth, colors.secondaryBorderWidth, colors.panelBorderWidth, colors.bannerBorderWidth]) {
    assert.equal(border, "0px");
  }
  assert.equal(colors.primaryRadius, "6px");
  assert.ok(contrastRatio(colors.primaryColor, colors.primaryBackground) >= 4.5);
  assert.ok(contrastRatio(colors.primaryBackground, "rgb(255, 193, 7)") >= 3);
  assert.equal(colors.activeBackground, "rgb(234, 241, 255)");
  assert.equal(colors.activeColor, "rgb(36, 73, 159)");
  assert.ok(contrastRatio(colors.activeColor, colors.activeBackground) >= 4.5);
  assert.equal(colors.linkColor, "rgb(47, 92, 200)");
  assert.ok(contrastRatio(colors.linkColor, "rgb(255, 255, 255)") >= 4.5);

  const primary = page.locator(".primary").first();
  await primary.hover();
  const hover = await primary.evaluate((button) => {
    const style = window.getComputedStyle(button);
    return { background: style.backgroundColor, color: style.color };
  });
  assert.deepEqual(hover, { background: "rgb(36, 73, 159)", color: "rgb(255, 255, 255)" });
  assert.ok(contrastRatio(hover.color, hover.background) >= 4.5);
  await page.mouse.move(0, 0);
}
async function checkDashboardSurfaces(page) {
  await checkPanelShadow(page);
  const surface = await page.locator(".section-heading").first().evaluate((element) => {
    const style = window.getComputedStyle(element);
    return { background: style.backgroundColor, color: style.color };
  });
  assert.deepEqual(surface, { background: "rgb(255, 255, 255)", color: "rgb(43, 46, 70)" });
  assert.ok(contrastRatio(surface.color, surface.background) >= 4.5);
  const card = await page.locator(".app-space-card").first().evaluate((element) => {
    const style = window.getComputedStyle(element);
    return { background: style.backgroundColor, border: style.borderTopWidth };
  });
  assert.deepEqual(card, { background: "rgb(255, 255, 255)", border: "0px" });
}
async function checkPanelShadow(page) {
  const shadows = await page.locator(".panel").evaluateAll(elements => elements.map(element => window.getComputedStyle(element).boxShadow));
  assert.ok(shadows.length > 0);
  for (const shadow of shadows)
    assert.equal(shadow, "rgba(43, 46, 70, 0.094) 0px 3px 20px 0px");
}
async function checkSourceBanner(page) {
  const colors = await page.locator(".source-banner").evaluate((banner) => {
    const style = window.getComputedStyle(banner);
    return {
      color: style.color,
      background: style.backgroundColor,
    };
  });
  colors.contrast = contrastRatio(colors.color, colors.background);
  assert.ok(colors.contrast >= 4.5, `Source banner contrast: ${colors.contrast}`);
  assert.equal(colors.background, "rgb(249, 224, 118)");
  assert.equal(colors.color, "rgb(43, 46, 70)");
}
async function checkSidebar(page, mobile) {
  const sidebar = page.locator("#primary-navigation");
  const toggle = page.locator(".sidebar-toggle");
  assert.equal(await page.locator(".space-map").count(), 0);
  assert.equal(await page.getByLabel("데모 역할", { exact: true }).count(), 0);
  assert.equal(await page.locator(".role-note").count(), 0);
  const brandIcon = sidebar.locator(".brand .brand-icon");
  assert.equal(await brandIcon.count(), 1);
  assert.equal(await brandIcon.getAttribute("src"), "/freesia-mascot.jpg");
  await brandIcon.evaluate((image) => image.decode());
  assert.ok(await brandIcon.evaluate((image) => image.naturalWidth > 0));
  const flower = await page.evaluate((source) => {
    const svg = new window.DOMParser().parseFromString(source, "image/svg+xml");
    return {
      valid: !svg.querySelector("parsererror") &&
        svg.documentElement.namespaceURI === "http://www.w3.org/2000/svg",
      viewBox: svg.documentElement.getAttribute("viewBox"),
      paths: svg.querySelectorAll("path").length,
    };
  }, flowerBackup);
  assert.deepEqual(flower, { valid: true, viewBox: "0 0 54 62", paths: 6 });
  await checkSourceBanner(page);
  assert.equal(await sidebar.locator(".sidebar-link").count(), 3);
  const labels = ["인프라 스페이스", "애플리케이션", "통합"];
  assert.deepEqual(await sidebar.locator(".sidebar-label").allTextContents(), labels);
  assert.deepEqual(await sidebar.locator(".sidebar-link").evaluateAll((links) => links.map((link) => link.getAttribute("aria-label"))), labels);
  assert.equal(
    await page.locator('.sidebar-link.active[aria-current="page"]').count(),
    1,
  );
  if (mobile) {
    assert.equal(await sidebar.isVisible(), false);
    assert.equal(await toggle.getAttribute("aria-controls"), "primary-navigation");
    assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    await toggle.focus();
    await page.keyboard.press("Enter");
    assert.equal(await toggle.getAttribute("aria-expanded"), "true");
    assert.equal(await sidebar.isVisible(), true);
    const headerBox = await page.locator(".masthead").boundingBox();
    const sidebarBox = await sidebar.boundingBox();
    const contentBox = await page.locator(".workspace").boundingBox();
    assert.ok(sidebarBox.y >= headerBox.y + headerBox.height - 1);
    assert.ok(contentBox.y >= sidebarBox.y + sidebarBox.height - 1);
    await page.screenshot({ path: "artifacts/ui-01-sidebar-mobile.png", fullPage: true });
    await toggle.click();
    assert.equal(await sidebar.isVisible(), false);
  } else {
    assert.equal(await sidebar.isVisible(), true);
    assert.equal(await toggle.isVisible(), false);
    const sidebarBox = await sidebar.boundingBox();
    const contentBox = await page.locator(".workspace").boundingBox();
    assert.ok(sidebarBox.x + sidebarBox.width <= contentBox.x + 1);
    await page.screenshot({ path: "artifacts/ui-01-sidebar-desktop.png", fullPage: true });
  }
  for (const name of [labels[1], labels[2], labels[0]]) {
    if (mobile) await toggle.click();
    const link = sidebar.getByRole("button", { name, exact: true, includeHidden: true });
    assert.equal(await link.evaluate((button) => button.scrollWidth > button.clientWidth), false);
    await link.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    const focus = await link.evaluate((button) => {
      const style = window.getComputedStyle(button);
      return {
        visible: button.matches(":focus-visible"),
        outline: style.outlineColor,
        style: style.outlineStyle,
      };
    });
    assert.deepEqual(focus, {
      visible: true,
      outline: "rgb(47, 92, 200)",
      style: "solid",
    });
    assert.ok(contrastRatio(focus.outline, "rgb(255, 255, 255)") >= 3);
    await page.keyboard.press("Enter");
    assert.equal(await link.getAttribute("aria-current"), "page");
    assert.equal(await sidebar.locator('[aria-current="page"]').count(), 1);
    await checkPanelShadow(page);
    if (mobile) {
      assert.equal(await toggle.getAttribute("aria-expanded"), "false");
      assert.equal(await sidebar.isVisible(), false);
    }
  }
}
async function createInfra(page,name) {
 await page.getByRole("button",{name:"스페이스 생성",exact:true}).click();
 assert.equal(await page.locator(".app-form input").count(),1);
 assert.equal(await page.locator(".app-form select").count(),0);
 await page.getByLabel("Space 이름",{exact:true}).fill(name);
 await page.getByRole("button",{name:"Space 생성",exact:true}).click();
}
async function answerInfra(page,request,availability="Multi AZ · 2개") {
 await page.getByLabel("인프라 요구사항",{exact:true}).fill(request);
 await page.getByRole("button",{name:"질문 시작",exact:true}).click();
 await page.getByRole("button",{name:"서울 · ap-northeast-2",exact:true}).click();
 await page.getByRole("button",{name:"Private · 외부 경로 제외",exact:true}).click();
 await page.getByRole("button",{name:availability,exact:true}).click();
}
async function openIntegrationForm(page) {
  assert.equal(await page.getByLabel("Repository URL", { exact: true }).count(), 0);
  const entry = page.getByRole("button", { name: "등록", exact: true });
  assert.equal(await entry.count(), 1);
  assert.equal(await page.locator(".repository-space-list .section-heading .heading-actions").getByRole("button", { name: "등록", exact: true }).count(), 1);
  assert.equal(await page.locator(".page-heading").getByRole("button", { name: "등록", exact: true }).count(), 0);
  await checkPanelShadow(page);
  await entry.focus();
  await page.keyboard.press("Enter");
  await page.getByLabel("Repository URL", { exact: true }).waitFor();
}
async function appForm(page, name, infraId) {
  await navigate(page, "통합");
  if (!(await page.getByRole("button",{name:"등록 해제: softbank-hackathon-2026/Freesia-Frontend (main)",exact:true}).count())) {
    await openIntegrationForm(page);
    await page.getByLabel("Repository URL",{exact:true}).fill("https://github.com/softbank-hackathon-2026/Freesia-Frontend");
    await page.getByRole("button",{name:"Repository 등록",exact:true}).click();
  }
  await navigate(page, "애플리케이션");
  await page.getByRole("button", { name: "애플리케이션 생성", exact: true }).click();
  await page.getByLabel("앱 이름", { exact: true }).fill(name);
  await page
    .getByLabel("등록한 Repository", { exact: true })
    .selectOption(
      { label: "softbank-hackathon-2026/Freesia-Frontend · main" },
    );
  await page
    .getByLabel("Infra Space", { exact: true })
    .selectOption(infraId);
  assert.equal(
    await page.locator('input[placeholder*="github"],#repo-url').count(),
    0,
  );
}

async function checkSandboxCreation(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const defaultInfra = { ...infra, id: "sandbox-default", name: "서버 기본 샌드박스" };
  const createdApps = [];
  const posts = [];
  const detailReads = [];
  const analyzed = new Set();
  const defaultInfraError = "서버 계약 오류: DefaultInfra가 설정되지 않았습니다.";
  let rejectDefault = false;
  let defaultDetailHold;
  let defaultDetailRequested;
  let defaultReady = true;
  await page.route("**/api/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace("/api", "");
    const json = (value, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    if (path === "/infra-spaces") return json([infra]);
    if (path === "/infra-spaces/sandbox-default") {
      detailReads.push(path);
      if (defaultDetailHold) {
        defaultDetailRequested();
        await defaultDetailHold;
      }
      return json({ ...defaultInfra, deployable_computes: defaultReady ? defaultInfra.deployable_computes : [] });
    }
    if (path === "/repositories") return json([repository]);
    if (path === "/app-spaces" && request.method() === "POST") {
      const body = request.postDataJSON();
      posts.push(body);
      if (rejectDefault && !Object.hasOwn(body, "infra_id"))
        return json({ error: "no_default_infra", message: defaultInfraError }, 400);
      const created = { ...app, ...body, id: `sandbox-app-${posts.length}`, infra_id: body.infra_id ?? defaultInfra.id };
      createdApps.push(created);
      return json(created, 201);
    }
    if (path === "/app-spaces") return json(createdApps);
    if (path.endsWith("/analysis")) {
      if (request.method() === "POST") analyzed.add(path);
      return analyzed.has(path) ? json(analysis) : json({ message: "Analysis has not started" }, 404);
    }
    if (path.startsWith("/app-spaces/")) {
      const created = createdApps.find(entry => entry.id === path.split("/")[2]);
      if (created && path === `/app-spaces/${created.id}`) return json(created);
    }
    throw new Error(`Unexpected sandbox fixture request: ${request.method()} ${path}`);
  });
  await page.goto(url + "/?source=api&page=apps");
  const name = page.getByLabel("앱 이름", { exact: true });
  const repositorySelect = page.getByLabel("등록한 Repository", { exact: true });
  const infraSelect = page.getByLabel("Infra Space", { exact: true });
  const sandbox = page.getByRole("checkbox", { name: "샌드박스 배포", exact: true });
  const submit = page.getByRole("button", { name: "애플리케이션 생성", exact: true });
  const openForm = async value => {
    await submit.click();
    await name.fill(value);
    await repositorySelect.selectOption(repository.id);
  };
  const create = async value => {
    await submit.click();
    await page.getByRole("heading", { name: value, exact: true }).waitFor();
  };
  await openForm("explicit-infra");
  assert.equal(await sandbox.count(), 1, "API creation provides the sandbox checkbox beside Infra Space");
  assert.equal(await sandbox.isChecked(), false);
  assert.equal(await infraSelect.isDisabled(), false);
  await infraSelect.selectOption(infra.id);
  await create("explicit-infra");
  assert.deepEqual(posts[0], { name: "explicit-infra", repo_url: repository.repo_url, branch: "main", infra_id: infra.id });
  await page.getByRole("button", { name: "앱 목록으로", exact: true }).click();
  await openForm("checked-sandbox");
  await infraSelect.selectOption(infra.id);
  await sandbox.check();
  assert.equal(await infraSelect.isDisabled(), true);
  assert.equal(await infraSelect.inputValue(), infra.id);
  await sandbox.uncheck();
  assert.equal(await infraSelect.isDisabled(), false);
  assert.equal(await infraSelect.inputValue(), infra.id, "unchecking preserves the chosen infrastructure");
  await sandbox.check();
  for (const [viewportName, viewport] of [["desktop", { width: 1440, height: 1000 }], ["mobile", { width: 390, height: 844 }]]) {
    await page.setViewportSize(viewport);
    const selectBox = await infraSelect.boundingBox();
    const checkboxBox = await sandbox.boundingBox();
    assert.ok(selectBox && checkboxBox);
    assert.ok(checkboxBox.x >= selectBox.x + selectBox.width - 1, `${viewportName}: checkbox sits to the right of Infra Space`);
    assert.ok(Math.min(selectBox.y + selectBox.height, checkboxBox.y + checkboxBox.height) > Math.max(selectBox.y, checkboxBox.y), `${viewportName}: select and checkbox share a row`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${viewportName}: no horizontal overflow`);
    await page.screenshot({ path: `artifacts/sandbox-create-${viewportName}.png`, fullPage: true });
  }
  await navigate(page, "통합");
  await navigate(page, "애플리케이션");
  await submit.click();
  assert.equal(await name.inputValue(), "checked-sandbox");
  assert.equal(await repositorySelect.inputValue(), repository.id);
  assert.equal(await sandbox.isChecked(), true, "sandbox draft persists navigation away and back");
  assert.equal(await infraSelect.isDisabled(), true);
  assert.equal(await infraSelect.inputValue(), infra.id);
  await create("checked-sandbox");
  assert.deepEqual(posts[1], { name: "checked-sandbox", repo_url: repository.repo_url, branch: "main" }, "checked sandbox omits infra_id and UI-only state");
  await page.getByRole("button", { name: "코드 분석 시작", exact: true }).click();
  const candidate = page.locator(".candidate").filter({ hasText: "ecs-fargate" }).getByRole("button", { name: "이 후보 선택", exact: true });
  await candidate.click();
  await page.waitForFunction(() => !Array.from(document.querySelectorAll("button")).find(button => button.textContent.trim() === "선택한 환경으로 구성안 조회")?.disabled);
  assert.equal(await page.getByRole("button", { name: "선택한 환경으로 구성안 조회", exact: true }).isDisabled(), false, "hidden default infra supports normal candidate readiness");
  assert.ok(detailReads.length > 0, "hidden default infra is fetched by its concrete id for readiness");
  assert.ok(analyzed.has("/app-spaces/sandbox-app-2/analysis"), "sandbox app uses the normal analysis endpoint");
  await page.getByRole("button", { name: "앱 목록으로", exact: true }).click();
  let releaseDefaultDetail;
  defaultDetailHold = new Promise(resolve => { releaseDefaultDetail = resolve; });
  const detailRequested = new Promise(resolve => { defaultDetailRequested = resolve; });
  defaultReady = false;
  await page.getByRole("button", { name: "checked-sandbox 상세 보기", exact: true }).click();
  await detailRequested;
  await page.getByRole("heading", { name: "실행 환경 후보", exact: true }).waitFor();
  assert.equal(await page.locator(".candidate").count(), 0, "reopening hides old candidates while fresh default infrastructure is pending");
  assert.equal(await page.getByRole("button", { name: "선택한 환경으로 구성안 조회", exact: true }).isDisabled(), true, "pending infrastructure cannot reuse cached readiness");
  releaseDefaultDetail();
  defaultDetailHold = undefined;
  await candidate.waitFor();
  await candidate.click();
  assert.match(await page.locator(".candidate").filter({ hasText: "ecs-fargate" }).innerText(), /배포 준비 중/);
  assert.equal(await page.getByRole("button", { name: "선택한 환경으로 구성안 조회", exact: true }).isDisabled(), true, "fresh empty deployable_computes overrides previously ready infrastructure");
  await page.getByRole("button", { name: "앱 목록으로", exact: true }).click();
  await openForm("implicit-sandbox");
  await sandbox.uncheck();
  await infraSelect.selectOption("");
  assert.equal(await infraSelect.locator(`option[value="${defaultInfra.id}"]`).count(), 0, "the hidden server default never becomes a selectable infrastructure");
  await create("implicit-sandbox");
  assert.deepEqual(posts[2], { name: "implicit-sandbox", repo_url: repository.repo_url, branch: "main" }, "empty infrastructure also omits infra_id");
  const readsBeforeSwitch = detailReads.length;
  const switchedInfraRead = page.waitForResponse(response => new URL(response.url()).pathname.endsWith("/infra-spaces/sandbox-default"));
  await page.evaluate(id => { const next = new URL(window.location.href); next.searchParams.set("app", id); next.searchParams.delete("tab"); window.history.pushState(null, "", next); window.dispatchEvent(new window.PopStateEvent("popstate")); }, "sandbox-app-2");
  await switchedInfraRead;
  await page.getByRole("heading", { name: "checked-sandbox", exact: true }).waitFor();
  await candidate.waitFor();
  assert.ok(detailReads.length > readsBeforeSwitch, "direct same-default app switch fetches its own infrastructure detail");
  await page.getByRole("button", { name: "앱 목록으로", exact: true }).click();
  await openForm("retained-on-no-default");
  await infraSelect.selectOption(infra.id);
  await sandbox.check();
  rejectDefault = true;
  await submit.click();
  await page.getByRole("alert").waitFor();
  assert.equal(await page.getByRole("alert").innerText(), defaultInfraError, "server no_default_infra message is displayed verbatim");
  assert.equal(await name.inputValue(), "retained-on-no-default");
  assert.equal(await repositorySelect.inputValue(), repository.id);
  assert.equal(await infraSelect.inputValue(), infra.id);
  assert.equal(await sandbox.isChecked(), true);
  assert.equal(await infraSelect.isDisabled(), true);
  assert.equal(await submit.isDisabled(), false, "failed server creation keeps a retryable draft");
  assert.deepEqual(posts[3], { name: "retained-on-no-default", repo_url: repository.repo_url, branch: "main" });
  await page.close();
  record({ name: "api-sandbox-creation", checks: "explicit and omitted infra payloads; checkbox override/toggle/draft; no_default_infra retains draft; hidden default detail permits analysis/readiness; reopen clears cached readiness while pending and honors fresh empty readiness; direct same-default app switch refreshes detail; desktop/mobile same-row checkbox and no overflow" });
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
  await checkSandboxCreation(browser);
  // This fixture verifies the public default independently of the retained demo QA flow.
  const defaultPage = await browser.newPage();
  const defaultRequests = [];
  await defaultPage.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    defaultRequests.push(path);
    const value = path.endsWith("/infra-spaces") ? [{ ...infra, name: "Default API fixture" }]
      : path.endsWith("/app-spaces") ? [app] : path.endsWith("/repositories") ? [repository] : [];
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(value) });
  });
  await defaultPage.goto(url);
  await defaultPage.waitForTimeout(500);
  assert.ok(defaultRequests.some(path => path.endsWith("/infra-spaces")), "plain URL must fetch backend API rather than start the demo");
  assert.equal(await defaultPage.getByRole("button", { name: "Default API fixture", exact: true }).count(), 1);
  assert.equal(await defaultPage.getByLabel("데이터 소스", { exact: true }).count(), 0, "upper-right source selector is removed");
  await assertReadOnlyInfra(defaultPage);
  assert.doesNotMatch(await defaultPage.locator("main").innerText(), /쇼핑몰 서비스|사내 업무 서비스|결제 서비스/);
  await defaultPage.screenshot({ path: "artifacts/default-api-desktop.png", fullPage: true });
  await defaultPage.setViewportSize({ width: 390, height: 844 });
  assert.equal(await defaultPage.getByLabel("데이터 소스", { exact: true }).count(), 0);
  await assertReadOnlyInfra(defaultPage);
  assert.equal(await defaultPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await defaultPage.screenshot({ path: "artifacts/default-api-mobile.png", fullPage: true });
  await defaultPage.close();
  record({ name: "default-api-without-source-selector", checks: "plain URL requests controlled backend fixtures, renders API Infra and hides the source selector" });
  const providerPage = await browser.newPage();
  const providerCases = [
    { provider: "aws", label: "AWS", icon: "/providers/aws.png" },
    { provider: "onprem", label: "온프레미스", icon: "/providers/on-premise.png" },
    { provider: "gcp", label: "GCP", icon: "/providers/gcp.png" },
    { provider: "azure", label: "Azure", icon: "/providers/azure.png" },
    { provider: "future-provider", label: "환경 미확인" },
    { provider: null, label: "환경 미확인" },
    { label: "환경 미확인" },
  ];
  const providerInfras = providerCases.map((item, index) => ({
    ...infra, id: `provider-${index}`, name: `Provider fixture ${index + 1}`,
    ...(Object.hasOwn(item, "provider") ? { provider: item.provider } : {}),
  }));
  const providerCalls = [];
  await providerPage.route("**/api/**", route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api/, "");
    providerCalls.push({ path, method: request.method() });
    const detail = providerInfras.find(item => path === `/infra-spaces/${item.id}`);
    const value = path === "/infra-spaces" ? providerInfras : detail ?? [];
    return route.fulfill({ contentType: "application/json", body: JSON.stringify(value) });
  });
  await providerPage.goto(url + "/?source=api&page=infra");
  const providerPanel = providerPage.locator(".infra-list");
  await providerPanel.getByRole("button", { name: providerInfras[0].name, exact: true }).waitFor();
  for (const [size, viewport] of [["desktop", { width: 1440, height: 1050 }], ["mobile", { width: 390, height: 844 }]]) {
    await providerPage.setViewportSize(viewport);
    assert.deepEqual(await providerPanel.getByRole("columnheader").allTextContents(), ["이름", "네트워크 구성", "연결된 애플리케이션", "생성된 시간"]);
    const backgrounds = [];
    for (const [index, item] of providerCases.entries()) {
      const row = providerPanel.locator("tbody tr").filter({ has: providerPage.getByRole("button", { name: providerInfras[index].name, exact: true }) });
      assert.equal(await row.getAttribute("data-provider"), item.icon ? item.provider : "unknown");
      const cell = row.getByRole("cell").first();
      assert.equal(await cell.getByText(item.label, { exact: true }).count(), 1);
      assert.match(await cell.innerText(), new RegExp(providerInfras[index].id));
      backgrounds.push(await row.evaluate(element => window.getComputedStyle(element).backgroundColor));
      if (item.icon) {
        const icon = cell.locator(`img[src="${item.icon}"]`);
        assert.equal(await icon.count(), 1);
        await icon.evaluate(image => image.decode());
        assert.ok(await icon.evaluate(image => image.naturalWidth > 0 && image.naturalHeight > 0));
        const iconBox = await icon.boundingBox();
        const nameBox = await cell.getByRole("button", { name: providerInfras[index].name, exact: true }).boundingBox();
        assert.ok(iconBox.x + iconBox.width <= nameBox.x + 1, "provider icon precedes the name");
      } else {
        assert.equal(await cell.locator("img").count(), 0, "unknown provider has no fabricated cloud logo");
        assert.equal(await cell.getByText("AWS", { exact: true }).count(), 0);
      }
    }
    assert.equal(backgrounds[0], backgrounds[2]);
    assert.equal(backgrounds[0], backgrounds[3]);
    const orange = backgrounds[0].match(/[\d.]+/g).slice(0, 3).map(Number);
    assert.ok(orange[0] >= 245 && orange[0] > orange[1] && orange[1] > orange[2] && orange[2] >= 210, "cloud rows use pale orange");
    const gray = backgrounds[1].match(/[\d.]+/g).slice(0, 3).map(Number);
    assert.ok(Math.min(...gray) >= 230 && Math.max(...gray) - Math.min(...gray) <= 12, "on-premise rows use pale gray");
    assert.equal(backgrounds[4], backgrounds[5]);
    assert.equal(backgrounds[4], backgrounds[6]);
    assert.notEqual(backgrounds[4], backgrounds[0], "unknown providers keep a neutral background");
    assert.equal(await providerPage.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    if (size === "mobile") {
      const scroller = providerPanel.locator(".table-scroll");
      assert.ok(await scroller.evaluate(element => element.scrollWidth > element.clientWidth));
      await scroller.focus();
      await providerPage.keyboard.press("ArrowRight");
      await providerPage.waitForFunction(() => document.querySelector(".infra-list .table-scroll").scrollLeft > 0);
      await scroller.evaluate(element => { element.scrollLeft = 0; });
    }
    await providerPage.screenshot({ path: `artifacts/infra-providers-${size}.png`, fullPage: true });
    for (const [index, item] of providerCases.entries()) {
      const name = providerInfras[index].name;
      const button = providerPanel.getByRole("button", { name, exact: true });
      await button.focus();
      await providerPage.keyboard.press("Enter");
      await providerPage.getByRole("heading", { name, exact: true }).waitFor();
      assert.ok(await providerPage.locator("main").getByText(item.label, { exact: true }).count() > 0, "selected infra keeps its provider label");
      if (!item.icon) assert.equal(await providerPage.locator("main img[src='/providers/aws.png']").count(), 0);
      assert.equal(await providerPage.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      if (index === 1) await providerPage.screenshot({ path: `artifacts/infra-provider-detail-${size}.png`, fullPage: true });
      await providerPage.getByRole("button", { name: "목록으로", exact: true }).click();
    }
  }
  assert.ok(providerCalls.length > 0);
  assert.ok(providerCalls.every(call => call.method === "GET"), "provider rendering never mutates backend or infrastructure");
  await providerPage.close();
  record({ name: "infra-provider-icons", checks: "four loaded provider icons, preserved columns/IDs, cloud/on-premise/unknown backgrounds, null/missing/unknown safety, keyboard detail navigation and mobile internal scroll" });
  const readinessPage=await browser.newPage();
  let readinessKnown=false, readinessPlanReject=false, readinessExisting=false, readinessPlanPosts=0, readinessDeployPosts=0;
  const readinessAnalyses = new Map();
  await readinessPage.route("**/api/**",async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    const json=(body,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(body)});
    if(path.endsWith("/infra-spaces")){const {deployable_computes:ignored,...base}=infra;void ignored;return json([{...base,...(readinessKnown?{deployable_computes:["ecs-fargate"]}:{})}]);}
    if(path.endsWith("/repositories"))return json([repository]);
    if(path.endsWith("/app-spaces"))return json([app]);
    if(path.endsWith("/app-api"))return json({...app,latest_deployment_id:readinessExisting?"dep-api":null});
    if(path.endsWith("/analysis")) {
      if(req.method()==="POST") readinessAnalyses.set(path,analysis);
      return readinessAnalyses.has(path) ? json(readinessAnalyses.get(path)) : json({message:"Analysis has not started"},404);
    }
    if(path.endsWith("/plans")){
      readinessPlanPosts++;
      if(readinessPlanReject)return json({error:"compute_not_ready",message:"아직 준비되지 않은 컴퓨팅"},400);
      return json({status:"done",compute:"ecs-fargate",plans:[{id:"ready-plan",name:"기본 구성",summary:"기본값",pros:[],cons:[],template:"ecs-fargate/basic",values:{cpu:256,memory:512,container_port:3000}}]});
    }
    if(path.endsWith("/deployments")) {readinessDeployPosts++;readinessExisting=true;return json({error:"deployment_in_progress",message:"이미 배포가 진행 중입니다"},409);}
    if(req.method()==="GET" && path.endsWith("/logs"))return json({status:"waiting",message:null,lines:[]});
    if(req.method()==="GET" && path.endsWith("/metrics"))return json({status:"waiting",message:null,compute:"ecs-fargate",cpu_percent:null,memory_percent:null,response_time_ms:null,request_count:null,error_count:null,measured_at:null});
    if(path.endsWith("/resources"))return json([]);
    if(path.endsWith("/events"))return route.fulfill({contentType:"text/event-stream",body:'event: progress\ndata: '+JSON.stringify({status:"success",step:"done",progress:100,message:"기존 배포 완료",url:null,at:"now"})+'\n\n'});
    return json({...deployment,compute:"ecs-fargate",status:"success"});
  });
  await readinessPage.goto(url+"/?source=api&app=app-api");
  await readinessPage.getByRole("button",{name:"코드 분석 시작",exact:true}).click();
  await readinessPage.locator(".candidate").filter({hasText:"ecs-fargate"}).getByRole("button",{name:"이 후보 선택",exact:true}).click();
  assert.equal(await readinessPage.getByRole("button",{name:"선택한 환경으로 구성안 조회",exact:true}).isDisabled(),true,"missing readiness must block plan request");
  assert.match(await readinessPage.locator(".deploy-actions").innerText(),/배포 가능 여부 미확인/);
  assert.equal(await readinessPage.getByRole("img",{name:"읽기 전용 분석 분기 트리"}).count(),0,"API never fabricates a demo decision tree");
  readinessKnown=true;await readinessPage.reload();
  await readinessPage.getByRole("heading",{name:"실행 환경 후보",exact:true}).waitFor();
  await readinessPage.getByRole("navigation",{name:"배포 단계",exact:true}).getByRole("button",{name:"코드 분석",exact:true}).click();
  await readinessPage.getByRole("button",{name:"다시 분석",exact:true}).click();
  const lambdaCard=readinessPage.locator(".candidate").filter({hasText:"lambda"});
  await lambdaCard.getByRole("button",{name:"이 후보 선택",exact:true}).click();
  assert.match(await lambdaCard.innerText(),/배포 준비 중/);
  assert.equal(await readinessPage.getByRole("button",{name:"선택한 환경으로 구성안 조회",exact:true}).isDisabled(),true);
  assert.equal(readinessPlanPosts,0);
  await readinessPage.locator(".candidate").filter({hasText:"ecs-fargate"}).getByRole("button",{name:"이 후보 선택",exact:true}).click();
  readinessPlanReject=true;await readinessPage.getByRole("button",{name:"선택한 환경으로 구성안 조회",exact:true}).click();
  await readinessPage.getByText(/배포 준비 중입니다/).waitFor();
  readinessPlanReject=false;await readinessPage.getByRole("button",{name:"선택한 환경으로 구성안 조회",exact:true}).click();
  const singleReview=readinessPage.getByRole("region",{name:"구성안 검토",exact:true});
  await singleReview.getByRole("heading",{name:"기본 구성",exact:true}).waitFor();
  assert.equal(await singleReview.getByRole("button",{name:"이 구성안 선택",exact:true}).count(),0);
  assert.equal(await singleReview.getByLabel("설정값을 확인했습니다",{exact:true}).isDisabled(),false);
  assert.equal(await singleReview.getByRole("button",{name:"선택한 구성안으로 배포",exact:true}).isDisabled(),true);
  await singleReview.getByLabel("설정값을 확인했습니다",{exact:true}).check();
  await singleReview.getByRole("button",{name:"선택한 구성안으로 배포",exact:true}).click();
  await readinessPage.getByText("기존 배포 완료",{exact:true}).waitFor();
  assert.match(await readinessPage.getByRole("alert").innerText(),/이미 배포가 진행 중/);
  assert.equal(readinessDeployPosts,1,"409 restores existing deployment and never retries POST");
  await readinessPage.close();
  record({name:"deployment-readiness",checks:"unknown readiness blocked; unready recommendations retained; compute400 shown; single plan directly reviewed; deployment409 resumes existing SSE without duplicate POST"});
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
    await page.goto(url + "/?source=demo");
    await checkSidebar(page, name === "mobile");
    await page.getByRole("heading", { name: "인프라 스페이스", exact: true }).waitFor();
    await checkDashboardTheme(page);
    assert.deepEqual(await page.getByRole("columnheader").allTextContents(), ["이름", "네트워크 구성", "연결된 애플리케이션", "생성된 시간"]);
    assert.equal(await page.getByRole("columnheader",{name:"네트워크 유형",exact:true}).count(),0);
    assert.equal(await page.getByRole("columnheader",{name:"배포 대상",exact:true}).count(),0);
    assert.equal(await page.getByRole("columnheader",{name:"네트워크 구성",exact:true}).count(),1);
    assert.match(await page.locator("table").innerText(),/인터넷 경로 포함/);
    const infraPanel = page.locator(".infra-list");
    assert.equal(await infraPanel.getByRole("heading", { name: "인프라 스페이스 (3)", exact: true }).count(), 1);
    assert.equal(await infraPanel.locator(".section-heading").getByRole("button", { name: "새로고침", exact: true }).count(), 1);
    assert.equal(await infraPanel.locator(".section-heading").getByRole("button", { name: "스페이스 생성", exact: true }).count(), 1);
    const refresh = infraPanel.getByRole("button", { name: "새로고침", exact: true });
    assert.equal(await refresh.innerText(), "");
    assert.equal(await refresh.getAttribute("title"), "새로고침");
    assert.equal(await refresh.locator('svg[aria-hidden="true"]').count(), 1);
    await refresh.focus();
    await page.keyboard.press("Enter");
    assert.equal(await infraPanel.getByRole("button", { name: "스페이스 삭제", exact: true }).isDisabled(), true);
    assert.deepEqual(await infraPanel.locator("tbody tr").evaluateAll((rows) => rows.map((row) => [row.cells[2].textContent.trim(), row.cells[3].textContent.trim()])), [["0", "미제공"], ["0", "미제공"], ["0", "미제공"]]);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (name === "mobile") {
      const scroller = infraPanel.locator(".table-scroll");
      assert.equal(await scroller.evaluate((element) => element.scrollWidth > element.clientWidth), true);
      await scroller.focus();
      await page.keyboard.press("ArrowRight");
      await page.waitForFunction(() => document.querySelector(".infra-list .table-scroll").scrollLeft > 0);
      await scroller.evaluate((element) => { element.scrollLeft = 0; });
    }
    await page.screenshot({ path: `artifacts/ui-02-infra-list-${name}.png`, fullPage: true });

    const seedStorage = await page.evaluate(()=>localStorage.getItem("freesia.demo.v1"));
    for (const [index, service] of ["쇼핑몰 서비스","사내 업무 서비스","결제 서비스"].entries()) {
      const spaceLink = page.getByRole("button",{name:service,exact:true});
      if (index === 0) {
        await spaceLink.focus();
        await page.keyboard.press("Enter");
      } else await spaceLink.click();
      await page.getByRole("region",{name:"인프라 질의응답",exact:true}).waitFor();
      assert.equal(await page.getByRole("heading",{name:service,exact:true}).count(),1);
      assert.match(await page.getByLabel("Terraform 코드").innerText(),/resource "aws_vpc"/);
      assert.match(await page.getByRole("region",{name:"인프라 Apply 결과",exact:true}).innerText(),/미리 준비한 DEMO Apply 완료 예시/);
      assert.match(await page.locator("main").innerText(),/미리 준비한 데모 예시 · 읽기 전용/);
      assert.equal(await page.getByRole("region",{name:"인프라 상세",exact:true}).count(),0);
      assert.equal(await page.getByRole("button",{name:"답변 수정 · 이후 결과 초기화",exact:true}).count(),0);
      assert.equal(await page.getByRole("button",{name:"작성 취소",exact:true}).count(),0);
      assert.equal(await page.getByLabel("Apply 실패 시연",{exact:true}).count(),0);
      assert.equal(await page.getByRole("button",{name:".tf 다운로드",exact:true}).count(),1);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false);
      await page.screenshot({path:"artifacts/prepared-infra-"+index+"-"+name+".png",fullPage:true});
      await page.getByRole("button",{name:"목록으로",exact:true}).click();
      assert.equal(await page.getByRole("row").count(),4);
    }
    assert.equal(await page.evaluate(()=>localStorage.getItem("freesia.demo.v1")),seedStorage);

    await createInfra(page, "conversation-foundation");
    await page.getByRole("button", {name:"질문 시작",exact:true}).click();
    assert.match(await page.getByRole("alert").innerText(), /요구사항/);
    await answerInfra(page, "서울 리전에 내부 API를 위한 인프라가 필요합니다. 두 가용 영역을 비교하고 싶습니다.");
    assert.equal(await page.getByLabel("Terraform 코드").count(),0);
    assert.equal(await page.getByRole("radio").count(),0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({path:`artifacts/infra-generation-${name}.png`,fullPage:true});
    await page.getByRole("button",{name:"답변으로 Terraform 생성",exact:true}).click();
    assert.match(await page.getByLabel("Terraform 코드").innerText(), /count = 2/);
    assert.doesNotMatch(await page.getByLabel("Terraform 코드").innerText(), /window.bad/);
    assert.equal(await page.evaluate(()=>window.bad),undefined);
    const downloaded=page.waitForEvent("download");
    await page.getByRole("button",{name:".tf 다운로드"}).click();
    assert.equal((await downloaded).suggestedFilename(),"main.tf");
    await navigate(page,"통합"); await navigate(page,"인프라 스페이스");
    await page.getByRole("button",{name:"Space 상세: conversation-foundation",exact:true}).click();
    await page.getByLabel("Terraform 코드").waitFor();
    await page.reload();
    await page.getByRole("button",{name:"Space 상세: conversation-foundation",exact:true}).click();
    await page.getByLabel("Terraform 코드").waitFor();
    await page.getByRole("button",{name:"답변 수정 · 이후 결과 초기화",exact:true}).click();
    await answerInfra(page,"서울 리전의 내부 API용 단일 영역 구성이 필요합니다.","Single AZ · 1개");
    assert.equal(await page.getByLabel("Terraform 코드").count(),0);
    await page.getByRole("button",{name:"답변으로 Terraform 생성",exact:true}).click();
    assert.match(await page.getByLabel("Terraform 코드").innerText(), /count = 1/);
    assert.equal(await page.getByRole("button",{name:"Apply 시작 · 데모",exact:true}).isDisabled(),true);
    await page.getByLabel("선택한 코드와 데모 제한을 검토했습니다",{exact:true}).check();
    await page.getByLabel("Apply 실패 시연",{exact:true}).check();
    await page.getByRole("button",{name:"Apply 시작 · 데모",exact:true}).click();
    await page.getByText("Apply 실패 시연 · 준비된 기반으로 등록되지 않았습니다.",{exact:true}).waitFor();
    await page.getByLabel("Apply 실패 시연",{exact:true}).uncheck();
    await page.getByRole("button",{name:"Apply 다시 시도 · 데모",exact:true}).click();
    await page.getByRole("button",{name:"진행 일시정지",exact:true}).click();
    await page.reload();
    await page.getByRole("button",{name:"Space 상세: conversation-foundation",exact:true}).click();
    await page.getByRole("button",{name:"Apply 데모 이어하기",exact:true}).waitFor();
    assert.equal(await page.getByRole("button",{name:"작성 취소",exact:true}).isDisabled(),true);
    assert.equal(await page.getByText(/DEMO Apply 완료/).count(),0);
    await page.getByRole("button",{name:"Apply 데모 이어하기",exact:true}).click();
    await page.getByText(/DEMO Apply 완료/).waitFor();
    assert.equal(await page.getByRole("button",{name:"작성 취소",exact:true}).count(),0);
    for (const checkbox of await page.locator('.infra-flow-panel input[type="checkbox"]').all()) {
      const box = await checkbox.boundingBox();
      assert.ok(box && box.width > 0 && box.width <= 32, "Infra checkbox retains native control width");
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({path:`artifacts/infra-apply-${name}.png`,fullPage:true});
    await page.getByRole("button",{name:"답변 수정 · 이후 결과 초기화",exact:true}).click();
    assert.equal(await page.getByLabel("Terraform 코드").count(),0);
    assert.equal(await page.getByRole("region",{name:"인프라 Apply 결과"}).count(),0);
    await navigate(page, "애플리케이션");
    const applicationPanel = page.locator(".app-space-list");
    assert.equal(await applicationPanel.count(), 1);
    const appRefresh = applicationPanel.getByRole("button", { name: "새로고침", exact: true });
    assert.equal(await appRefresh.count(), 1);
    assert.equal(await appRefresh.innerText(), "");
    assert.equal(await appRefresh.getAttribute("title"), "새로고침");
    assert.equal(await appRefresh.locator('svg[aria-hidden="true"]').count(), 1);
    assert.equal(await appRefresh.evaluate(element => window.getComputedStyle(element).width), "38px");
    await appRefresh.focus();
    await page.keyboard.press("Enter");
    assert.equal(await applicationPanel.getByRole("button", { name: "애플리케이션 삭제", exact: true }).isDisabled(), true);
    const connectAction = applicationPanel.locator(".section-heading .heading-actions").getByRole("button", { name: "애플리케이션 생성", exact: true });
    assert.equal(await connectAction.count(), 1);
    assert.equal(await page.getByRole("button", { name: "애플리케이션 생성", exact: true }).count(), 1);
    assert.equal(await page.locator(".page-heading").getByRole("button", { name: "애플리케이션 생성", exact: true }).count(), 0);
    assert.equal(await connectAction.evaluate(element => window.getComputedStyle(element).minHeight), "38px");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `artifacts/ui-06-app-list-empty-${name}.png`, fullPage: true });
    await connectAction.focus();
    await page.keyboard.press("Enter");
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
    await navigate(page, "통합");
    await navigate(page, "애플리케이션");
    await page.getByRole("button", { name: "애플리케이션 생성", exact: true }).click();
    assert.equal(
      await page.getByLabel("앱 이름", { exact: true }).inputValue(),
      "demo-web",
    );
    assert.match(
      await page.locator("#registered-repo option:checked").innerText(),
      /Freesia-Frontend/,
    );
    await page.screenshot({path:`artifacts/day3-app-form-${name}.png`,fullPage:true});
    const disabled = page
      .locator("#infra-select option")
      .filter({ hasText: "conversation-foundation" });
    assert.equal(await disabled.count(), 0);
    await page
      .getByLabel("등록한 Repository", { exact: true })
      .selectOption("");
    await page.getByRole("button", { name: "애플리케이션 생성" }).click();
    assert.match(await page.getByRole("alert").innerText(), /등록/);
    await page
      .getByLabel("등록한 Repository", { exact: true })
      .selectOption(
        { label: "softbank-hackathon-2026/Freesia-Frontend · main" },
      );
    await page.getByRole("button", { name: "애플리케이션 생성" }).click();
    await page.getByRole("button", { name: "코드 분석 시작", exact: true }).click();
    await page
      .getByRole("heading", { name: "실행 환경 후보", exact: true })
      .waitFor();
    await page.screenshot({
      path: `artifacts/sprint02-analysis-${name}.png`,
      fullPage: true,
    });
    assert.equal(await page.locator(".candidate").count(), 2);
    await reviewDeploymentStep(page, "코드 분석");
    await page.getByRole("img", { name: "읽기 전용 분석 분기 트리" }).waitFor();
    await reviewDeploymentStep(page, "실행 환경 선택");
    await page
      .locator(".candidate")
      .filter({ hasText: "lambda" })
      .getByRole("button", { name: "이 후보 선택", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "선택한 환경으로 구성안 조회",
        exact: true,
      })
      .click();
    assert.match(
      await page.getByLabel("샘플 템플릿 설정값").innerText(),
      /memory/,
    );
    await page.screenshot({
      path: "artifacts/day3-terraform-" + name + ".png",
      fullPage: true,
    });
    await page.getByLabel("설정값을 확인했습니다",{exact:true}).check();
    await page.getByLabel("CI 실패 시뮬레이션 · DEMO").check();
    await page
      .getByRole("button", {
        name: "선택한 구성안으로 배포 · 데모",
        exact: true,
      })
      .click();
    await page.getByRole("heading", { name: /^배포 상태.*failed$/ }).waitFor();
    await page
      .getByRole("button", {
        name: "실패 내용 확인 · 재시도 준비",
        exact: true,
      })
      .click();
    await page.getByLabel("설정값을 확인했습니다",{exact:true}).check();
    await page
      .getByRole("button", {
        name: "실패한 데모 파이프라인 재시도",
        exact: true,
      })
      .click();
    await page.getByRole("button", { name: "앱 목록으로" }).click();
    await page.reload();
    await navigate(page, "애플리케이션");
    const appCard = page.locator(".app-space-card").filter({ hasText: "demo-web" });
    assert.equal(await appCard.count(), 1, "application list renders a linked Space card");
    for (const label of ["애플리케이션 이름", "연결된 통합", "연결된 인프라 스페이스"])
      assert.equal(await appCard.getByText(label, { exact: true }).count(), 1);
    for (const value of ["demo-web", "Freesia-Frontend", "쇼핑몰 서비스"])
      assert.match(await appCard.innerText(), new RegExp(value));
    assert.equal(await page.locator("h1").innerText(), "애플리케이션");
    assert.equal(await appCard.getAttribute("aria-label"), "demo-web 상세 보기");
    const cardDescription = await appCard.evaluate(button => (button.getAttribute("aria-describedby") ?? "").split(/\s+/).filter(Boolean).map(id => document.getElementById(id)?.textContent ?? "").join(" "));
    for (const value of ["Freesia-Frontend", "쇼핑몰 서비스", "브랜치 main"])
      assert.match(cardDescription, new RegExp(value), "focused card exposes its linked names and branch as an accessible description");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: `artifacts/ui-03-app-cards-${name}.png`, fullPage: true });
    await appCard.focus();
    await appCard.press("Enter");
    await page.getByRole("heading", { name: "demo-web", exact: true }).waitFor();
    await page.getByRole("heading", { name: /^배포 상태.*success$/ }).waitFor();
    await page.screenshot({path:`artifacts/day3-pipeline-result-${name}.png`,fullPage:true});
    await page.getByRole("tab", { name: "로그", exact: true }).click();
    assert.match(await page.locator(".log-output").innerText(), /DEMO/);
    await page.getByRole("tab", { name: "모니터링", exact: true }).click();
    await page.getByText("24%", { exact: true }).waitFor();
    await page.screenshot({
      path: `artifacts/sprint02-monitoring-${name}.png`,
      fullPage: true,
    });

    const appStore = await page.evaluate(()=>localStorage.getItem("freesia.demo.v1"));
    await navigate(page,"인프라 스페이스");
    const shopRow = page.getByRole("row").filter({has:page.getByRole("button",{name:"쇼핑몰 서비스",exact:true})});
    assert.equal(await shopRow.getByRole("cell").nth(2).innerText(),String(JSON.parse(appStore).apps.filter(app=>app.infra_id==="demo-public").length));
    assert.equal(await shopRow.getByRole("cell").nth(3).innerText(), "미제공");
    await page.getByRole("button",{name:"쇼핑몰 서비스",exact:true}).click();
    await page.getByRole("button",{name:"목록으로",exact:true}).click();
    assert.equal(await page.evaluate(()=>localStorage.getItem("freesia.demo.v1")),appStore);
    await switchSource(page, "api");
    await checkSourceBanner(page);
    await page.getByRole("alert").first().waitFor();
    assert.match(
      await page.getByRole("alert").first().innerText(),
      /테스트 백엔드 연결 실패/,
    );
    await navigate(page, "인프라 스페이스");
    await assertReadOnlyInfra(page);
    assert.equal(await page.locator(".infra-list .section-heading").getByRole("heading").innerText(), "인프라 스페이스");
    assert.equal(await page.getByText("등록된 기반이 없습니다.", { exact: true }).count(), 0);
    assert.equal(
      await page
        .getByRole("button", { name: "쇼핑몰 서비스", exact: true })
        .count(),
      0,
    );
    assert.equal(
      await page.getByRole("button", { name: "AI로 인프라 설계" }).count(),
      0,
    );
    assert.match(
      await page.locator("main").innerText(),
      /애플리케이션 담당자는 준비된 인프라를 조회/,
    );
    await switchSource(page, "demo");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.deepEqual(errors, []);
    record({
      name,
      width,
      checks:
        "sidebar/active-menu/mobile-toggle/same-space-answers/direct-generate/review/apply-failure/retry/pause/reload/invalidation/invalid-form/app-analysis/deploy/log/metrics/API-error/no-fallback/keyboard/no-overflow/JS0 passed",
    });
    await page.close();
  }
  const countPage = await browser.newPage();
  await countPage.goto(url + "/?source=demo");
  await countPage.evaluate((value) => localStorage.setItem("freesia.demo.v1", JSON.stringify(value)), {
    ...initialDemo(),
    apps: [{ ...app, id: "count-first", infra_id: "demo-public" }, { ...app, id: "count-second", infra_id: "demo-public" }],
  });
  await countPage.reload();
  const multipleAppRow = countPage.getByRole("row").filter({ has: countPage.getByRole("button", { name: "쇼핑몰 서비스", exact: true }) });
  assert.equal(await multipleAppRow.getByRole("cell").nth(2).innerText(), "2");
  assert.equal(await multipleAppRow.getByRole("cell").nth(3).innerText(), "미제공");
  await countPage.close();
  record({ name: "infra-linked-app-counts", checks: "zero and multiple demo app relations; unavailable creation dates passed" });

  const apiPage = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  let apiStoreBefore;
  const calls = [];
  let serverStatus = "pending";
  let hasDeployment = false;
  let apiRepositories = [repository];
  const apiAnalyses = new Map();
  let apiInfras = [infra], infraRequestHold, infraFailure = false;
  await apiPage.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace("/api", "");
    calls.push({ path, method: req.method(), body: req.postData() });
    let value;
    if (path === "/repositories") {
      if (req.method() === "POST") {
        const body = req.postDataJSON();
        if (body.repo_url.endsWith("/conflict")) return route.fulfill({status:409,contentType:"application/json",body:JSON.stringify({message:"서버 중복 등록"})});
        value = {...repository,...body,id:"repo-added",name:body.repo_url.slice("https://github.com/".length)};
        apiRepositories = [value,...apiRepositories];
      } else value = apiRepositories;
    }
    else if (path.startsWith("/repositories/") && req.method() === "DELETE") {
      apiRepositories = apiRepositories.filter(repo=>repo.id!==path.split("/").at(-1));
      return route.fulfill({status:204});
    }
    else if (path === "/infra-spaces") {
      if (infraRequestHold) await infraRequestHold;
      if (infraFailure) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "인프라 조회 실패 fixture" }) });
      value = apiInfras;
    }
    else if (path === "/app-spaces" && req.method() === "GET") value = [app];
    else if (path === "/app-spaces") value = {...app,...req.postDataJSON(),id:"app-created"};
    else if (path === "/app-spaces/app-api")
      value = {
        ...app,
        latest_deployment_id: hasDeployment ? "dep-api" : null,
      };
    else if (path.endsWith("/logs")) value = {status:"waiting",message:"서버 로그 수집 대기",lines:[]};
    else if (path.endsWith("/metrics")) value = {status:"waiting",message:"서버 지표 수집 대기",compute:"ecs-fargate",cpu_percent:null,memory_percent:null,response_time_ms:null,request_count:null,error_count:null,measured_at:null};
    else if (path.endsWith("/analysis")) {
      if(req.method()==="POST") apiAnalyses.set(path,analysis);
      if(!apiAnalyses.has(path)) return route.fulfill({status:404,contentType:"application/json",body:JSON.stringify({message:"Analysis has not started"})});
      value=apiAnalyses.get(path);
    }
    else if (path.endsWith("/plans")) return route.fulfill({status:404,contentType:"application/json",body:JSON.stringify({detail:"Not Found"})});
    else if (path.endsWith("/resources")) value = [{address:"aws_ecs_service.web",type:"aws_ecs_service",action:"create",state:"done",reason:null,updated_at:"now"}];
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
  await switchSource(apiPage, "api");
  await apiPage.getByRole("button", { name: "API 기반", exact: true }).waitFor();
  const apiInfraPanel = apiPage.locator(".infra-list");
  await assertReadOnlyInfra(apiPage);
  assert.match(await apiPage.locator("main").innerText(), /애플리케이션 담당자는 준비된 인프라를 조회/);
  assert.deepEqual(calls.filter(call => call.path.startsWith("/infra-spaces") && call.method !== "GET"), []);
  const apiInfraRow = apiInfraPanel.getByRole("row").filter({ has: apiPage.getByRole("button", { name: "API 기반", exact: true }) });
  assert.equal(await apiInfraRow.getByRole("cell").nth(2).innerText(), "0", "keep server app_count even when the app list contains a linked app");
  assert.equal(await apiInfraRow.getByRole("cell").nth(3).innerText(), "미제공");
  apiInfras = [];
  let releaseInfra;
  infraRequestHold = new Promise((resolve) => { releaseInfra = resolve; });
  await apiPage.reload();
  await apiInfraPanel.getByText("불러오는 중…", { exact: true }).waitFor();
  await assertReadOnlyInfra(apiPage);
  assert.equal(await apiInfraPanel.locator(".section-heading").getByRole("heading").innerText(), "인프라 스페이스");
  releaseInfra();
  infraRequestHold = undefined;
  await apiInfraPanel.getByText("등록된 기반이 없습니다.", { exact: true }).waitFor();
  assert.equal(await apiInfraPanel.getByRole("heading", { name: "인프라 스페이스 (0)", exact: true }).count(), 1);
  await assertReadOnlyInfra(apiPage);
  apiInfras = [infra];
  infraFailure = true;
  await apiPage.reload();
  const infraAlert = apiPage.getByRole("alert").filter({ hasText: "인프라 목록을 불러오지 못했습니다." });
  await infraAlert.waitFor();
  assert.match(await infraAlert.innerText(), /인프라 조회 실패 fixture/);
  await assertReadOnlyInfra(apiPage);
  const infraReadsBeforeRetry = calls.filter(call => call.path === "/infra-spaces" && call.method === "GET").length;
  infraFailure = false;
  await infraAlert.getByRole("button", { name: "다시 시도", exact: true }).click();
  await apiPage.getByRole("button", { name: "API 기반", exact: true }).waitFor();
  assert.ok(calls.filter(call => call.path === "/infra-spaces" && call.method === "GET").length > infraReadsBeforeRetry, "error retry preserves GET-only infra recovery");

  for (const [size,width,height] of [["desktop",1440,1000],["mobile",390,844]]) {
    await apiPage.setViewportSize({width,height});
    assert.equal(await apiInfraRow.getByRole("cell").nth(2).innerText(), "0");
    assert.equal(await apiPage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await apiPage.screenshot({ path: `artifacts/ui-02-api-infra-list-${size}.png`, fullPage: true });
    await assertReadOnlyInfra(apiPage);
    await apiPage.getByRole("button",{name:"API 기반",exact:true}).click();
    for (const name of ["인프라 질의응답","인프라 코드 검토","인프라 Apply 결과"]) {
      await apiPage.getByRole("region",{name,exact:true}).waitFor();
    }
    assert.equal(await apiPage.getByRole("heading",{name:"API 기반",exact:true}).count(),1);
    assert.equal(await apiPage.getByLabel("Terraform 코드").count(),0);
    assert.equal(await apiPage.getByRole("button",{name:".tf 다운로드",exact:true}).isDisabled(),true);
    assert.doesNotMatch(await apiPage.locator("main").innerText(),/resource "aws_|DEMO Apply 완료/);
    assert.equal(await apiPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await apiPage.screenshot({path:"artifacts/api-infra-parity-"+size+".png",fullPage:true});
    await apiPage.getByRole("button",{name:"목록으로",exact:true}).click();
  }
  await apiPage.setViewportSize({width:1440,height:1000});

  await navigate(apiPage,"통합");
  await apiPage.getByRole("button",{name:"등록 해제: team/web (main)",exact:true}).waitFor();
  await openIntegrationForm(apiPage);
  await apiPage.getByLabel("Repository URL",{exact:true}).fill(" https://github.com/team/added.git/ ");
  await apiPage.getByRole("button",{name:"Repository 등록",exact:true}).click();
  await apiPage.getByRole("button",{name:"등록 해제: team/added (main)",exact:true}).waitFor();
  assert.deepEqual(JSON.parse(calls.find(call=>call.path==="/repositories"&&call.method==="POST").body),{repo_url:"https://github.com/team/added",branch:"main"});
  await openIntegrationForm(apiPage);
  await apiPage.getByLabel("Repository URL",{exact:true}).fill("https://github.com/team/conflict");
  await apiPage.getByRole("button",{name:"Repository 등록",exact:true}).click();
  await apiPage.getByRole("alert").waitFor();
  assert.match(await apiPage.getByRole("alert").innerText(),/서버 중복 등록/);
  assert.equal(await apiPage.getByLabel("Repository URL",{exact:true}).inputValue(),"https://github.com/team/conflict");
  assert.equal(await apiPage.getByRole("heading", { name: "등록", exact: true }).count(), 1);
  await apiPage.getByRole("button", { name: "목록으로", exact: true }).click();
  await apiPage.getByRole("button",{name:"등록 해제: team/added (main)",exact:true}).click();
  await apiPage.getByRole("button",{name:"등록 해제: team/added (main)",exact:true}).waitFor({state:"detached"});
  await navigate(apiPage,"애플리케이션");
  await apiPage.getByRole("button",{name:"애플리케이션 생성",exact:true}).click();
  assert.equal(await apiPage.locator("#repo-url").count(),0);
  assert.deepEqual(await apiPage.locator("#infra-select option").evaluateAll(items=>items.map(item=>item.value)),["","api-infra"]);
  await apiPage.getByLabel("앱 이름",{exact:true}).fill("created-api-app");
  await apiPage.getByLabel("등록한 Repository",{exact:true}).selectOption("repo-api");
  await apiPage.getByLabel("Infra Space",{exact:true}).selectOption("api-infra");
  await apiPage.getByRole("button",{name:"애플리케이션 생성",exact:true}).click();
  await apiPage.getByRole("heading",{name:"created-api-app",exact:true}).waitFor();
  assert.deepEqual(JSON.parse(calls.find(call=>call.path==="/app-spaces"&&call.method==="POST").body),{name:"created-api-app",repo_url:repository.repo_url,branch:"main",infra_id:"api-infra"});
  await apiPage.getByRole("button",{name:"앱 목록으로",exact:true}).click();
  await apiPage.getByRole("button", { name: /api-web/ }).click();
  await apiPage
    .getByRole("button", { name: "코드 분석 시작", exact: true })
    .click();
  await apiPage.getByRole("heading",{name:"실행 환경 후보",exact:true}).waitFor();
  assert.equal(await apiPage.locator(".candidate.chosen").count(),0,"server recommendation is not a user selection");
  assert.match(await apiPage.locator(".deploy-actions").innerText(),/사용자 선택: 없음/);
  assert.equal(await apiPage.getByRole("button",{name:"선택한 환경으로 구성안 조회",exact:true}).isDisabled(),true);
  await apiPage.locator(".candidate").filter({hasText:"lambda"}).getByRole("button",{name:"이 후보 선택",exact:true}).click();
  await apiPage.getByRole("button",{name:"선택한 환경으로 구성안 조회",exact:true}).click();
  await apiPage.getByText(/구성안 API 연동 대기입니다/).waitFor();
  for (const [size,width,height] of [["desktop",1440,1000],["mobile",390,844]]) {
    await apiPage.setViewportSize({width,height});
    const review=apiPage.getByRole("region",{name:"실행 환경 선택",exact:true});
    await review.waitFor();
    assert.match(await review.innerText(),/lambda/);
    assert.match(await review.innerText(),/연동 대기/);
    assert.equal(await apiPage.getByLabel("샘플 템플릿 설정값",{exact:true}).count(),0);
    assert.equal(await apiPage.getByRole("button",{name:"선택한 환경으로 구성안 조회",exact:true}).isDisabled(),false);
    assert.equal(await review.getByRole("button",{name:"선택한 구성안으로 배포",exact:true}).count(),0);
    assert.equal(await apiPage.getByRole("navigation",{name:"배포 단계",exact:true}).getByRole("button",{name:"구성안 검토",exact:true}).isDisabled(),true);
    assert.equal(await apiPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await apiPage.screenshot({path:"artifacts/api-app-parity-"+size+".png",fullPage:true});
  }
  assert.equal(calls.filter(c=>c.path.endsWith("/deployments")&&c.method==="POST").length,0,"no sample deployment may bypass missing plan API");
  assert.deepEqual(calls.filter(call => call.path.startsWith("/infra-spaces") && call.method !== "GET"), [], "API infra list/detail/loading/empty/error retry never mutates infrastructure");
  assert.equal(await apiPage.locator(".candidate").filter({hasText:"ecs-fargate"}).getByText("추천",{exact:true}).count(),1);
  // Existing server deployment remains observable even though new deployment is unavailable.
  hasDeployment=true;
  serverStatus="building";
  await apiPage.getByRole("button",{name:"앱 목록으로",exact:true}).click();
  await apiPage.getByRole("button",{name:/api-web/}).click();
  await apiPage.getByRole("heading",{name:/^배포 상태.*success$/}).waitFor();
  assert.equal(await apiPage.locator(".pipeline-steps li").count(),6);
  assert.equal(await apiPage.locator(".pipeline-steps .complete").count(),6);
  assert.deepEqual(await apiPage.locator(".pipeline-steps li span").allTextContents(),Array(6).fill("완료"));
  assert.equal(await apiPage.getByText("샘플 commit:",{exact:false}).count(),0);
  await apiPage.screenshot({path:"artifacts/api-existing-deployment-parity-mobile.png",fullPage:true});
  assert.equal(calls.filter(c=>c.path.endsWith("/events")).length,1,"existing active deployment resumes SSE");
  await apiPage.getByRole("button",{name:"앱 목록으로",exact:true}).click();
  await apiPage.getByRole("button",{name:/api-web/}).click();
  await apiPage.getByRole("heading",{name:/^배포 상태.*success$/}).waitFor();
  await apiPage.waitForFunction(()=>document.querySelectorAll(".pipeline-steps .complete").length===6);
  assert.equal(calls.filter(c=>c.path.endsWith("/events")).length,2,"terminal deployment receives current snapshot after reentry");
  await apiPage.locator("details").filter({hasText:"aws_ecs_service.web"}).locator("summary").click();
  await apiPage.getByText("aws_ecs_service.web",{exact:true}).waitFor();
  await apiPage.reload();
  await apiPage.getByRole("heading",{name:/^배포 상태.*success$/}).waitFor();
  await apiPage.waitForFunction(()=>document.querySelectorAll(".pipeline-steps .complete").length===6);
  assert.equal(calls.filter(c=>c.path.endsWith("/events")).length,3,"refresh restores app and terminal snapshot");
  await apiPage.getByRole("tab", { name: "로그", exact: true }).click();
  await apiPage.getByText("서버 로그 수집 대기",{exact:true}).waitFor();
  assert.equal(await apiPage.locator(".log-output").count(),0,"waiting API logs never display demo lines");
  assert.ok(calls.some(call=>call.path.endsWith("/logs?limit=100") || call.path.endsWith("/logs")));
  await apiPage.getByRole("tab",{name:"모니터링",exact:true}).click();
  await apiPage.getByText("서버 지표 수집 대기",{exact:true}).waitFor();
  assert.doesNotMatch(await apiPage.getByRole("region",{name:"모니터링",exact:true}).innerText(),/24%|38%|128 ms/);
  assert.equal(await apiPage.locator(".metrics meter").count(),0);
  await apiPage.screenshot({path:"artifacts/api-metrics-parity-mobile.png",fullPage:true});
  assert.equal(
    await apiPage.evaluate(() => localStorage.getItem("freesia.demo.v1")),
    apiStoreBefore,
    "API lifecycle must not write demo storage",
  );
  await switchSource(apiPage, "demo");
  await apiPage
    .getByRole("heading", { name: "아직 애플리케이션이 없습니다" })
    .waitFor();
  record({
    name: "API",
    checks:
      "API repositories list/register/409/delete204 and create from registered repo+serverinfra; explicit recommendation choice; unavailable Terraform/CI controls; existing deployment SSE; desktop/mobile parity; demo isolation passed",
  });
  await apiPage.close();

  const cardPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const longRepository = { ...repository, id: "repo-long", name: "긴이름의연결된통합".repeat(12), repo_url: "https://github.com/team/" + "long-repository-name-".repeat(8) };
  const cardRepositories = [
    { ...repository, name: "운영 통합" },
    { ...repository, id: "repo-develop", name: "개발 통합", branch: "develop" },
    { ...repository, id: "repo-blank", name: " \t ", repo_url: "https://github.com/team/blank" },
    longRepository,
  ];
  const cardInfras = [infra, { ...infra, id: "infra-blank", name: " \t " }, { ...infra, id: "infra-long", name: "길게작성한운영인프라스페이스".repeat(6) }];
  const longAppName = "길게작성한애플리케이션스페이스".repeat(5);
  const cardApps = [
    { ...app, id: "card-main", name: "운영 웹" },
    { ...app, id: "card-develop", name: "개발 웹", branch: "develop" },
    { ...app, id: "card-blank", name: "이름 없는 연결", repo_url: "https://github.com/team/blank", infra_id: "infra-blank" },
    { ...app, id: "card-missing", name: "저장된 연결 확인", repo_url: "https://github.com/team/unregistered", infra_id: "infra-missing" },
    { ...app, id: "card-long", name: longAppName, repo_url: longRepository.repo_url, infra_id: "infra-long" },
  ];
  let cardRepositoryState = "loading", releaseCardRepositories, cardAppHold, cardAppError = false;
  const cardRepositoryPending = new Promise(resolve => { releaseCardRepositories = resolve; });
  const cardRequests = [];
  await cardPage.route("**/api/**", async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    cardRequests.push({ path, method: req.method() });
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path.endsWith("/repositories")) {
      if (cardRepositoryState === "loading") await cardRepositoryPending;
      return cardRepositoryState === "error" ? json({ message: "통합 조회 테스트 실패" }, 503) : json(cardRepositories);
    }
    if (path.endsWith("/infra-spaces")) return json(cardInfras);
    if (path.endsWith("/app-spaces")) {
      if (cardAppHold) await cardAppHold;
      return cardAppError ? json({ message: "애플리케이션 조회 테스트 실패" }, 503) : json(cardApps);
    }
    return json(cardApps.find(item => path.endsWith("/" + item.id)));
  });
  await cardPage.goto(url + "/?source=api");
  const cardDemoBefore = await cardPage.evaluate(() => localStorage.getItem("freesia.demo.v1"));
  await navigate(cardPage, "애플리케이션");
  await checkDashboardSurfaces(cardPage);
  const mainCard = cardPage.getByRole("button", { name: "운영 웹 상세 보기", exact: true });
  await mainCard.getByText("통합 정보 불러오는 중…", { exact: true }).waitFor();
  assert.match(await mainCard.innerText(), /https:\/\/github\.com\/team\/web/);
  assert.match(await mainCard.innerText(), /브랜치 main/);
  assert.equal(await cardPage.getByRole("button", { name: "애플리케이션 생성", exact: true }).isDisabled(), true);
  assert.equal(await cardPage.locator(".app-space-list .section-heading .heading-actions").getByRole("button", { name: "애플리케이션 생성", exact: true }).isDisabled(), true);
  assert.equal(await cardPage.getByRole("button", { name: "새로고침", exact: true }).isDisabled(), true);
  assert.equal(await cardPage.getByRole("button", { name: "애플리케이션 삭제", exact: true }).isDisabled(), true);
  assert.equal(await cardPage.getByText("애플리케이션 삭제 API가 아직 없습니다.", { exact: true }).count(), 0);
  await cardPage.screenshot({ path: "artifacts/ui-03-app-cards-api-loading.png", fullPage: true });
  cardRepositoryState = "error";
  releaseCardRepositories();
  await mainCard.getByText("통합 정보 조회 실패", { exact: true }).waitFor();
  assert.match(await cardPage.getByRole("alert").innerText(), /통합 조회 테스트 실패/);
  assert.match(await mainCard.innerText(), /https:\/\/github\.com\/team\/web/);
  await cardPage.screenshot({ path: "artifacts/ui-03-app-cards-api-error.png", fullPage: true });
  cardRepositoryState = "ready";
  await cardPage.getByRole("button", { name: "Repository 다시 조회", exact: true }).click();
  await mainCard.getByText("운영 통합", { exact: true }).waitFor();
  assert.equal(await cardPage.locator(".app-space-card").count(), cardApps.length);
  assert.equal(await cardPage.getByRole("alert").count(), 0);
  const developCard = cardPage.getByRole("button", { name: "개발 웹 상세 보기", exact: true });
  assert.equal(await developCard.getByText("개발 통합", { exact: true }).count(), 1);
  assert.equal(await developCard.getByText("운영 통합", { exact: true }).count(), 0);
  assert.match(await developCard.innerText(), /브랜치 develop/);
  const blankCard = cardPage.getByRole("button", { name: "이름 없는 연결 상세 보기", exact: true });
  for (const value of ["통합 이름 미제공", "인프라 이름 미제공", "infra-blank", "https://github.com/team/blank"])
    assert.equal(await blankCard.getByText(value, { exact: true }).count(), 1);
  const missingCard = cardPage.getByRole("button", { name: "저장된 연결 확인 상세 보기", exact: true });
  for (const value of ["통합 등록 정보 없음", "인프라 이름 미확인", "infra-missing", "https://github.com/team/unregistered"])
    assert.equal(await missingCard.getByText(value, { exact: true }).count(), 1);
  const appReadsBefore = cardRequests.filter(item => item.path.endsWith("/app-spaces")).length;
  let releaseAppRefresh;
  cardAppHold = new Promise(resolve => { releaseAppRefresh = resolve; });
  const refreshRequest = cardPage.waitForRequest(request => request.url().endsWith("/app-spaces"));
  const appRefresh = cardPage.getByRole("button", { name: "새로고침", exact: true });
  await appRefresh.focus();
  await cardPage.keyboard.press("Enter");
  await refreshRequest;
  await cardPage.getByText("애플리케이션 불러오는 중…", { exact: true }).waitFor();
  assert.equal(await appRefresh.isDisabled(), true);
  assert.equal(await cardPage.getByRole("button", { name: "애플리케이션 생성", exact: true }).isDisabled(), true);
  cardAppError = true;
  releaseAppRefresh();
  cardAppHold = undefined;
  await cardPage.getByText("애플리케이션 조회 테스트 실패", { exact: true }).waitFor();
  assert.equal(await cardPage.locator(".app-space-card").count(), 0);
  cardAppError = false;
  await appRefresh.click();
  await mainCard.getByText("운영 통합", { exact: true }).waitFor();
  assert.equal(cardRequests.filter(item => item.path.endsWith("/app-spaces")).length, appReadsBefore + 2);
  assert.equal(await cardPage.getByRole("alert").count(), 0);
  for (const [size, width, height, columns] of [["desktop", 1440, 1000, 3], ["tablet", 1000, 900, 2], ["mobile", 390, 844, 1]]) {
    await cardPage.setViewportSize({ width, height });
    assert.equal(await cardPage.locator(".app-space-cards").evaluate(element => window.getComputedStyle(element).gridTemplateColumns.split(" ").length), columns);
    assert.equal(await cardPage.locator(".app-space-list .section-heading .heading-actions").getByRole("button", { name: "애플리케이션 생성", exact: true }).count(), 1);
    assert.equal(await cardPage.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, "long card names and URLs wrap within the viewport");
    assert.equal(await cardPage.getByRole("button", { name: longAppName + " 상세 보기", exact: true }).getByText(longRepository.name, { exact: true }).count(), 1);
    assert.doesNotMatch(await cardPage.locator("main").innerText(), /쇼핑몰 서비스|사내 업무 서비스|결제 서비스/);
    if (size !== "tablet") await cardPage.screenshot({ path: `artifacts/ui-03-app-cards-api-${size}.png`, fullPage: true });
  }
  await mainCard.focus();
  await mainCard.press("Enter");
  await cardPage.getByRole("heading", { name: "운영 웹", exact: true }).waitFor();
  assert.equal(new URL(cardPage.url()).searchParams.get("app"), "card-main");
  await cardPage.reload();
  await cardPage.getByRole("heading", { name: "운영 웹", exact: true }).waitFor();
  assert.equal(await cardPage.evaluate(() => localStorage.getItem("freesia.demo.v1")), cardDemoBefore);
  assert.equal(cardRequests.every(item => item.method === "GET"), true, "card rendering and opening never mutate API data");
  await cardPage.close();
  record({ name: "application-space-cards", checks: "API loading/error/retry, URL+branch integration names, blank/unregistered/missing names and stored references; 3/2/1 responsive columns with long text; keyboard detail entry/reload and demo isolation passed" });

  const racePage = await browser.newPage();
  let phase = "analysis";
  const raceAnalyses = new Map();
  let eventRequests = 0;
  const a = { ...app, id: "app-a", name: "app-A" };
  const b = { ...app, id: "app-b", name: "app-B" };
  await racePage.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/repositories")) return route.fulfill({contentType:"application/json",body:JSON.stringify([repository])});
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
        body: JSON.stringify(path.endsWith("/app-a") ? {...a,latest_deployment_id:phase==="detail"?"dep-api":null} : b),
      });
    if (path.endsWith("/analysis")) {
      if(route.request().method()==="GET") return route.fulfill({status:raceAnalyses.has(path)?200:404,contentType:"application/json",body:JSON.stringify(raceAnalyses.get(path) || {message:"Analysis has not started"})});
      if (phase === "analysis") await new Promise((r) => setTimeout(r, 350));
      raceAnalyses.set(path,analysis);
      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(analysis),
      });
    }
    if (path.endsWith("/deployments/dep-api")) {
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
  await switchSource(racePage, "api");
  await racePage
    .getByRole("button", { name: "API 기반", exact: true })
    .waitFor();
  await navigate(racePage, "애플리케이션");
  await racePage.getByRole("button", { name: /app-A/ }).click();
  const analysisStarted = racePage.waitForRequest(request => request.url().endsWith("/app-a/analysis") && request.method()==="POST");
  await racePage
    .getByRole("button", { name: "코드 분석 시작", exact: true })
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
  phase = "detail";
  await racePage.getByRole("button",{name:"앱 목록으로",exact:true}).click();
  const detailStarted=racePage.waitForRequest("**/deployments/dep-api");
  await racePage.getByRole("button",{name:/app-A/}).click();
  await detailStarted;
  await racePage.getByRole("button", { name: "앱 목록으로" }).click();
  await racePage.getByRole("button", { name: /app-B/ }).click();
  await racePage.waitForTimeout(500);
  assert.equal(
    await racePage
      .getByRole("heading", { name:/^배포 상태/ })
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
  record({
    name: "async-navigation",
    checks: "late A analysis/existing deployment detail ignored after opening B passed",
  });
  const listOnly = await browser.newPage();
  let operation = "analysis";
  const listAnalyses = new Map();
  let listEventRequests = 0;
  await listOnly.route("**/api/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const fulfill = (value) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(value),
      });
    if (path.endsWith("/repositories")) return fulfill([repository]);
    if (path.endsWith("/infra-spaces")) return fulfill([infra]);
    if (path.endsWith("/app-spaces")) {
      if (req.method() === "POST") {
        await new Promise((r) => setTimeout(r, 350));
        return fulfill({ ...app, name: "late-created" });
      }
      return fulfill([a, b]);
    }
    if (path.endsWith("/app-a") || path.endsWith("/app-b"))
      return fulfill(path.endsWith("/app-a") ? {...a,latest_deployment_id:operation==="detail"?"dep-api":null} : b);
    if (path.endsWith("/analysis")) {
      if(req.method()==="GET") return route.fulfill({status:listAnalyses.has(path)?200:404,contentType:"application/json",body:JSON.stringify(listAnalyses.get(path) || {message:"Analysis has not started"})});
      listAnalyses.set(path,analysis);
      if (operation === "analysis")
        await new Promise((r) => setTimeout(r, 350));
      return fulfill(analysis);
    }
    if (path.endsWith("/deployments/dep-api")) {
      await new Promise((r) => setTimeout(r, 350));
      return fulfill({ ...deployment, app_space_id: "app-a" });
    }
    if (path.endsWith("/events")) {
      listEventRequests++;
      return route.fulfill({ contentType: "text/event-stream", body: "" });
    }
  });
  await listOnly.goto(url);
  await switchSource(listOnly, "api");
  await listOnly
    .getByRole("button", { name: "API 기반", exact: true })
    .waitFor();
  await navigate(listOnly, "애플리케이션");
  await listOnly.getByRole("button",{name:"애플리케이션 생성",exact:true}).click();
  await listOnly.getByLabel("앱 이름",{exact:true}).fill("late-created");
  await listOnly.getByLabel("등록한 Repository",{exact:true}).selectOption("repo-api");
  await listOnly.getByLabel("Infra Space",{exact:true}).selectOption("api-infra");
  const createRequest=listOnly.waitForRequest(request=>request.url().endsWith("/app-spaces")&&request.method()==="POST");
  await listOnly.getByRole("button",{name:"애플리케이션 생성",exact:true}).click();
  await createRequest;
  await listOnly.getByRole("button",{name:"앱 목록으로",exact:true}).click();
  await listOnly.waitForTimeout(500);
  assert.equal(await listOnly.getByRole("heading",{name:"late-created",exact:true}).count(),0);
  operation = "analysis";
  await listOnly.getByRole("button", { name: /app-A/ }).click();
  const listAnalyzeReq = listOnly.waitForRequest(request => request.url().endsWith("/app-a/analysis") && request.method()==="POST");
  await listOnly
    .getByRole("button", { name: "코드 분석 시작", exact: true })
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
  operation = "detail";
  const listDetailReq=listOnly.waitForRequest("**/deployments/dep-api");
  await listOnly.getByRole("button",{name:/app-A/}).click();
  await listDetailReq;
  await listOnly.getByRole("button", { name: "앱 목록으로" }).click();
  await listOnly.waitForTimeout(500);
  assert.equal(
    listEventRequests,
    0,
    "late list-only deployment must not start stream",
  );
  assert.equal(
    await listOnly
      .getByRole("heading", { name:/^배포 상태/ })
      .count(),
    0,
  );
  await listOnly.close();
  record({
    name: "list-only-navigation",
    checks:
      "API late create/analyze/existing-deployment-detail ignored on Back without opening B passed",
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
    await page.goto(url + "/?source=demo");
    for (const name of ["인프라 스페이스", "애플리케이션", "통합"])
      assert.equal(
        await page
          .getByRole("button", { name, exact: true, includeHidden: true })
          .count(),
        1,
      );
    await page.screenshot({
      path: "artifacts/day3-main-" + viewportName + ".png",
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "스페이스 생성", exact: true })
      .click();
    await page
      .getByLabel("Space 이름", { exact: true })
      .fill("preserved-foundation");
    await navigate(page, "통합");
    await navigate(page, "인프라 스페이스");
    await page
      .getByRole("button", { name: "스페이스 생성", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("Space 이름", { exact: true }).inputValue(),
      "preserved-foundation",
    );
    for (let i=0;i<3;i++) {
      if (i) await page.getByRole("button",{name:"스페이스 생성",exact:true}).click();
      await page.getByLabel("Space 이름",{exact:true}).fill("sample-"+i);
      assert.equal(await page.locator(".app-form input").count(),1);
      assert.equal(await page.locator(".app-form select").count(),0);
      assert.equal(await page.getByRole("radio").count(),0);
      if(i===2) await page.screenshot({path:"artifacts/day3-infra-form-"+viewportName+".png",fullPage:true});
      await page.getByRole("button",{name:"Space 생성",exact:true}).click();
      assert.match(await page.locator(".page-heading").innerText(),/리전 미정/);
      assert.doesNotMatch(await page.locator(".page-heading").innerText(),/AWS 샘플 대상|ap-northeast/);
      const emptyDraft = await page.evaluate((name)=>JSON.parse(localStorage.getItem("freesia.demo.v1")).meeting.spaces.find((space)=>space.name===name),"sample-"+i);
      assert.equal(emptyDraft.region,"");
      assert.equal(emptyDraft.target,undefined);
      await answerInfra(page,"샘플 요구사항");
      await page.getByRole("button",{name:"답변으로 Terraform 생성",exact:true}).click();
      await page.getByLabel("선택한 코드와 데모 제한을 검토했습니다",{exact:true}).check();
      await page.getByRole("button",{name:"Apply 시작 · 데모",exact:true}).click();
      await page.getByText(/DEMO Apply 완료/).waitFor();
      await page.getByRole("button",{name:"목록으로",exact:true}).click();
      assert.equal(await page.getByRole("button",{name:"sample-"+i,exact:true}).count(),1);
      const row=page.getByRole("row").filter({has:page.getByRole("button",{name:"sample-"+i,exact:true})});
      assert.match(await row.innerText(),/외부 직접 경로 없음, 다중 AZ/);
      assert.doesNotMatch(await row.innerText(),/ecs-fargate|\blambda\b|\bec2\b|AWS 샘플 대상/);
    }
    await page.screenshot({
      path: "artifacts/day3-infra-ready-" + viewportName + ".png",
      fullPage: true,
    });
    await navigate(page, "통합");
    assert.equal(await page.getByRole("button",{name:"GitHub 연결 · 데모",exact:true}).count(),0);
    assert.equal(await page.getByLabel("Repository URL", { exact: true }).count(), 0);
    await page.screenshot({ path: "artifacts/ui-07-integration-list-empty-" + viewportName + ".png", fullPage: true });
    const integrationBefore = await page.evaluate(() => localStorage.getItem("freesia.demo.v1"));
    await openIntegrationForm(page);
    assert.equal(await page.getByRole("heading", { name: "등록", exact: true }).count(), 1);
    assert.equal(await page.locator(".repository-list").count(), 0);
    assert.equal(await page.getByLabel("Repository URL", { exact: true }).evaluate(element => element === document.activeElement), true);
    await page.getByLabel("Repository URL", { exact: true }).fill("https://github.com/team/unfinished");
    await page.getByRole("button", { name: "목록으로", exact: true }).click();
    assert.equal(await page.getByLabel("Repository URL", { exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "등록", exact: true }).evaluate(element => element === document.activeElement), true);
    await openIntegrationForm(page);
    assert.equal(await page.getByLabel("Repository URL", { exact: true }).inputValue(), "https://github.com/team/unfinished");
    await page.getByRole("button", { name: "취소", exact: true }).click();
    assert.equal(await page.getByLabel("Repository URL", { exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => localStorage.getItem("freesia.demo.v1")), integrationBefore);
    await openIntegrationForm(page);
    assert.equal(await page.locator(".app-form input").count(),1);
    assert.equal(await page.locator(".app-form select").count(),0);
    await page.getByLabel("Repository URL",{exact:true}).fill("https://github.com/owner/repo/tree/main");
    await page.getByRole("button",{name:"Repository 등록",exact:true}).click();
    assert.match(await page.getByRole("alert").innerText(),/URL/);
    assert.equal(await page.getByLabel("Repository URL", { exact: true }).inputValue(), "https://github.com/owner/repo/tree/main");
    assert.equal(await page.evaluate(() => localStorage.getItem("freesia.demo.v1")), integrationBefore);
    await page.screenshot({ path: "artifacts/ui-07-integration-create-" + viewportName + ".png", fullPage: true });
    assert.match(await page.locator("main").innerText(), /존재, 공개 여부, main 브랜치와 접근 권한은 확인하지 않습니다/);
    await page.getByLabel("Repository URL",{exact:true}).fill("  https://github.com/softbank-hackathon-2026/Freesia-Frontend.git/  ");
    await page.getByRole("button",{name:"Repository 등록",exact:true}).click();
    assert.equal(await page.getByLabel("Repository URL", { exact: true }).count(), 0);
    assert.equal(await page.getByRole("heading", { name: "통합", exact: true }).count(), 1);
    await openIntegrationForm(page);
    assert.equal(await page.getByLabel("Repository URL", { exact: true }).inputValue(), "");
    await page.getByLabel("Repository URL",{exact:true}).fill("https://github.com/SOFTBANK-HACKATHON-2026/freesia-frontend");
    await page.getByRole("button",{name:"Repository 등록",exact:true}).click();
    assert.match(await page.getByRole("alert").innerText(),/이미 등록/);
    assert.equal(await page.locator(".repository-row").count(),0);
    await page.getByLabel("Repository URL",{exact:true}).fill("https://github.com/team/custom-app");
    await page.getByRole("button",{name:"Repository 등록",exact:true}).click();
    assert.equal(await page.locator(".repository-row").count(),2);
    assert.equal(await page.getByLabel("Repository URL", { exact: true }).count(), 0);
    await page.screenshot({
      path: "artifacts/day3-integration-" + viewportName + ".png",
      fullPage: true,
    });
    await navigate(page, "애플리케이션");
    await page.getByRole("button", { name: "애플리케이션 생성", exact: true }).click();
    await page.getByLabel("앱 이름", { exact: true }).fill("sample-foundation-web");
    await page
      .getByLabel("등록한 Repository", { exact: true })
      .selectOption(
        { label: "softbank-hackathon-2026/Freesia-Frontend · main" },
      );
    const readyOption = page
      .locator("#infra-select option")
      .filter({ hasText: "sample-0" });
    assert.equal(await readyOption.getAttribute("disabled"), null);
    await page
      .getByLabel("Infra Space", { exact: true })
      .selectOption(await readyOption.getAttribute("value"));
    await page.getByRole("button", { name: "애플리케이션 생성", exact: true }).click();
    await page
      .getByRole("heading", { name: "sample-foundation-web", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "앱 목록으로", exact: true }).click();
    await page.getByRole("button", { name: /sample-foundation-web/ }).waitFor();
    assert.equal(
      await page.getByRole("button", { name: /sample-foundation-web/ }).count(),
      1,
    );
    await page.reload();
    await navigate(page, "통합");
    assert.equal(
      await page
        .getByRole("button", {
          name: "등록 해제: softbank-hackathon-2026/Freesia-Frontend (main)",
          exact: true,
        })
        .count(),
      1,
    );
    const previousApps = await page.evaluate(()=>JSON.parse(localStorage.getItem("freesia.demo.v1")).apps);
    await page.getByRole("button",{name:"등록 해제: softbank-hackathon-2026/Freesia-Frontend (main)",exact:true}).click();
    assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem("freesia.demo.v1")).apps),previousApps);
    await navigate(page, "애플리케이션");
    const unregisteredApp = page.getByRole("button", { name: "sample-foundation-web 상세 보기", exact: true });
    assert.match(await unregisteredApp.innerText(), /통합 등록 정보 없음/);
    assert.match(await unregisteredApp.innerText(), /https:\/\/github\.com\/softbank-hackathon-2026\/Freesia-Frontend/);
    assert.match(await unregisteredApp.innerText(), /sample-0/);
    await unregisteredApp.click();
    await page.getByRole("heading", { name: "sample-foundation-web", exact: true }).waitFor();
    assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem("freesia.demo.v1")).apps),previousApps);
    await page.reload();
    await navigate(page,"통합");
    assert.equal(await page.getByRole("button",{name:"등록 해제: softbank-hackathon-2026/Freesia-Frontend (main)",exact:true}).count(),0);
    await openIntegrationForm(page);
    await page.getByLabel("Repository URL",{exact:true}).fill("https://github.com/softbank-hackathon-2026/Freesia-Frontend");
    await page.getByRole("button",{name:"Repository 등록",exact:true}).click();
    assert.equal(await page.locator(".repository-row").count(),2);
    await page.evaluate(()=>{window.originalSetItem = Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException("quota","QuotaExceededError");};});
    await page.getByRole("button",{name:"등록 해제: team/custom-app (main)",exact:true}).click();
    assert.match(await page.getByRole("alert").innerText(),/저장하지 못/);
    assert.equal(await page.locator(".repository-row").count(),2);
    await page.evaluate(()=>{Storage.prototype.setItem=window.originalSetItem;delete window.originalSetItem;});
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("freesia.demo.v1")),
    );
    assert.equal(saved.meeting.spaces.length, 3);
    assert.equal(
      saved.meeting.spaces.every((s) => s.status === "demo_deployed"),
      true,
    );
    await switchSource(page, "api");
    assert.equal(
      await page
        .getByRole("button", { name: "GitHub 연결 · 데모", exact: true })
        .count(),
      0,
    );
    assert.equal(await page.getByLabel("Repository URL",{exact:true}).count(),0);
    await page.getByRole("button",{name:"Repository 다시 조회",exact:true}).waitFor();
    await openIntegrationForm(page);
    assert.equal(await page.getByRole("button",{name:"Repository 등록",exact:true}).isDisabled(),true);
    assert.equal(await page.locator(".repository-row").count(),0);
    await navigate(page, "인프라 스페이스");
    await assertReadOnlyInfra(page);
    for (const name of [
      "AI로 인프라 설계",
      "인프라 배포 · 데모",
    ])
      assert.equal(
        await page.getByRole("button", { name, exact: true }).count(),
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
    record({
      name: "day3-sprint01-" + viewportName,
      checks:
        "three entry points, direct generation/review/apply->demo-ready, role-free infra/repo/app flow, draft retention, explicit repo registration, reload/API isolation passed",
    });
  }

  for (const [name, width, height] of [["desktop",1440,1000],["mobile",390,844]]) {
    const deletePage = await browser.newPage({ viewport: { width, height } });
    const target = makeInfraSpace({ name: "목록에서 삭제할 Space" });
    const retained = makeInfraSpace({ name: "남길 미구축 Space" });
    const linked = makeInfraSpace({ name: "앱 연결 보호" });
    const legacy = makeInfraSpace({ name: "이전 템플릿 보호", target: "AWS 샘플 대상", region: "ap-northeast-2", template: "public" });
    const generated = generateInfra(reviseInfra(makeInfraSpace({ name: "Apply 보호" }), "내부 API 인프라", { region: "ap-northeast-2", visibility: "private", availability: "single" }, 2));
    const pending = startInfraApply({ ...generated, flow: { ...generated.flow, reviewed: true } }, false);
    const applying = advanceInfraApply({ ...pending, id: "protected-applying", name: "Apply 진행 보호" });
    const completed = advanceInfraApply(advanceInfraApply({ ...applying, id: "protected-completed", name: "배포 완료 보호" }));
    const fixture = { ...initialDemo(), apps: [{ ...app, infra_id: linked.id }], meeting: { spaces: [target, retained, linked, legacy, pending, applying, completed], github: null } };
    await deletePage.goto(url + "/?source=demo");
    await deletePage.evaluate(value => localStorage.setItem("freesia.demo.v1", JSON.stringify(value)), fixture);
    await deletePage.reload();
    const before = await deletePage.evaluate(() => JSON.parse(localStorage.getItem("freesia.demo.v1")));
    const opener = deletePage.getByRole("button", { name: "스페이스 삭제", exact: true });
    await opener.focus();
    await deletePage.keyboard.press("Enter");
    const dialog = deletePage.getByRole("dialog", { name: "스페이스 삭제", exact: true });
    await dialog.waitFor();
    const choices = dialog.getByLabel("삭제할 Space", { exact: true });
    assert.deepEqual(await choices.locator("option").evaluateAll(items => items.map(item => item.value)), [target.id, retained.id]);
    assert.equal(await choices.inputValue(), target.id);
    assert.ok((await choices.boundingBox()).height >= 38, "native delete selector remains usable on touch screens");
    assert.match(await dialog.innerText(), /요구사항.*코드/);
    assert.equal(await dialog.getByRole("button", { name: "선택한 Space 삭제", exact: true }).isEnabled(), true);
    assert.equal(await deletePage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await deletePage.screenshot({ path: "artifacts/infra-delete-" + name + ".png", fullPage: true });
    await deletePage.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await opener.evaluate(element => element === document.activeElement), true);
    assert.deepEqual(await deletePage.evaluate(() => JSON.parse(localStorage.getItem("freesia.demo.v1"))), before);
    await opener.click();
    await choices.selectOption(retained.id);
    await dialog.getByRole("button", { name: "취소", exact: true }).click();
    assert.deepEqual(await deletePage.evaluate(() => JSON.parse(localStorage.getItem("freesia.demo.v1"))), before);
    await opener.click();
    await choices.selectOption(target.id);
    await dialog.getByRole("button", { name: "선택한 Space 삭제", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    const after = { ...before, meeting: { ...before.meeting, spaces: before.meeting.spaces.filter(space => space.id !== target.id) } };
    assert.deepEqual(await deletePage.evaluate(() => JSON.parse(localStorage.getItem("freesia.demo.v1"))), after);
    await deletePage.reload();
    assert.equal(await deletePage.getByRole("button", { name: "Space 상세: " + target.name, exact: true }).count(), 0);
    await deletePage.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException("quota", "QuotaExceededError"); }; });
    await opener.click();
    await dialog.getByRole("button", { name: "선택한 Space 삭제", exact: true }).click();
    assert.match(await dialog.getByRole("alert").innerText(), /저장하지 못/);
    assert.equal(await choices.inputValue(), retained.id);
    assert.equal(await dialog.isVisible(), true);
    assert.deepEqual(await deletePage.evaluate(() => JSON.parse(localStorage.getItem("freesia.demo.v1"))), after);
    await deletePage.close();
    record({ name: "infra-list-delete-" + name, checks: "keyboard/icon; one-target confirm; cancel/Escape/focus; protected seed/legacy/linked/pending/applying/deployed; reload; persist-failure selection/data retention passed" });
  }

  for (const [name, width, height] of [["desktop",1440,1000],["mobile",390,844]]) {
    const deletePage = await browser.newPage({ viewport: { width, height } });
    const target = { ...app, id: "delete-app", name: "삭제할 애플리케이션", infra_id: "demo-public" };
    const retained = { ...target, id: "keep-app", name: "남길 애플리케이션" };
    const statuses = ["pending", "building", "deploying", "success", "failed"];
    const protectedApps = statuses.map(status => ({ ...target, id: "protect-" + status, name: "배포 이력 " + status }));
    const histories = protectedApps.map((entry, index) => ({ ...deployment, id: "history-" + index, app_space_id: entry.id, status: statuses[index] }));
    const pointed = { ...target, id: "pointer-only", name: "배포 포인터 보호", latest_deployment_id: "unknown-history" };
    const fixture = { ...initialDemo(), apps: [target, retained, ...protectedApps, pointed], deployments: histories, designs: [makeDesign("설계 보존", "보존", { region: "ap-northeast-2", visibility: "private", availability: "single" })], meeting: { spaces: [makeInfraSpace({ name: "인프라 보존" })], github: registerRepository(null, target.repo_url) } };
    await deletePage.route("**/api/**", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ message: "모드 전환 테스트 연결 실패" }) }));
    await deletePage.goto(url + "/?source=demo");
    await deletePage.evaluate(value => localStorage.setItem("freesia.demo.v1", JSON.stringify(value)), fixture);
    await deletePage.reload();
    await navigate(deletePage, "애플리케이션");
    const before = await deletePage.evaluate(() => JSON.parse(localStorage.getItem("freesia.demo.v1")));
    const refresh = deletePage.getByRole("button", { name: "새로고침", exact: true });
    await refresh.click();
    assert.deepEqual(await deletePage.evaluate(() => JSON.parse(localStorage.getItem("freesia.demo.v1"))), before);
    assert.equal(await deletePage.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await deletePage.screenshot({ path: `artifacts/ui-09-app-list-${name}.png`, fullPage: false });
    const opener = deletePage.getByRole("button", { name: "애플리케이션 삭제", exact: true });
    await opener.focus();
    await deletePage.keyboard.press("Enter");
    const dialog = deletePage.getByRole("dialog", { name: "애플리케이션 삭제", exact: true });
    await dialog.waitFor();
    const choices = dialog.getByLabel("삭제할 애플리케이션", { exact: true });
    assert.deepEqual(await choices.locator("option").evaluateAll(items => items.map(item => item.value)), [target.id, retained.id]);
    assert.ok((await choices.boundingBox()).height >= 38);
    assert.match(await dialog.innerText(), /배포 이력/);
    await deletePage.screenshot({ path: `artifacts/ui-09-app-delete-${name}.png`, fullPage: false });
    await deletePage.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await opener.evaluate(element => element === document.activeElement), true);
    assert.deepEqual(await deletePage.evaluate(() => JSON.parse(localStorage.getItem("freesia.demo.v1"))), before);
    await opener.click();
    await choices.selectOption(retained.id);
    await dialog.getByRole("button", { name: "취소", exact: true }).click();
    assert.deepEqual(await deletePage.evaluate(() => JSON.parse(localStorage.getItem("freesia.demo.v1"))), before);
    await opener.click();
    await choices.selectOption(target.id);
    const confirm = dialog.getByRole("button", { name: "선택한 애플리케이션 삭제", exact: true });
    await confirm.click();
    await dialog.waitFor({ state: "hidden" });
    const after = { ...before, apps: before.apps.filter(entry => entry.id !== target.id) };
    assert.deepEqual(await deletePage.evaluate(() => JSON.parse(localStorage.getItem("freesia.demo.v1"))), after);
    await deletePage.reload();
    await navigate(deletePage, "애플리케이션");
    assert.equal(await deletePage.getByRole("button", { name: target.name + " 상세 보기", exact: true }).count(), 0);
    assert.equal(await deletePage.locator(".app-space-card").count(), after.apps.length);
    await navigate(deletePage, "인프라 스페이스");
    const row = deletePage.getByRole("row").filter({ has: deletePage.getByRole("button", { name: "쇼핑몰 서비스", exact: true }) });
    assert.equal(await row.locator("td").nth(2).innerText(), String(after.apps.length));
    await navigate(deletePage, "애플리케이션");
    await deletePage.evaluate(() => { window.originalSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new DOMException("quota", "QuotaExceededError"); }; });
    await opener.click();
    await confirm.click();
    assert.match(await dialog.getByRole("alert").innerText(), /저장하지 못/);
    assert.equal(await choices.inputValue(), retained.id);
    assert.equal(await dialog.isVisible(), true);
    assert.deepEqual(await deletePage.evaluate(() => JSON.parse(localStorage.getItem("freesia.demo.v1"))), after);
    await deletePage.screenshot({ path: `artifacts/ui-09-app-delete-error-${name}.png`, fullPage: false });
    await deletePage.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; delete window.originalSetItem; });
    await confirm.click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await opener.isDisabled(), true);
    assert.equal(await deletePage.getByText("삭제할 수 있는 배포 이력 없는 DEMO 애플리케이션이 없습니다.", { exact: true }).count(), 1);
    const protectedState = { ...after, apps: after.apps.filter(entry => entry.id !== retained.id) };
    assert.deepEqual(await deletePage.evaluate(() => JSON.parse(localStorage.getItem("freesia.demo.v1"))), protectedState);
    await deletePage.evaluate(value => localStorage.setItem("freesia.demo.v1", JSON.stringify(value)), before);
    await deletePage.reload();
    await navigate(deletePage, "애플리케이션");
    await opener.click();
    await choices.evaluate(element => { element.add(new window.Option("없는 대상", "missing-app")); element.value = "missing-app"; element.dispatchEvent(new window.Event("change", { bubbles: true })); });
    assert.equal(await confirm.isDisabled(), true);
    assert.deepEqual(await deletePage.evaluate(() => JSON.parse(localStorage.getItem("freesia.demo.v1"))), before);
    await deletePage.keyboard.press("Escape");
    await opener.click();
    await switchSource(deletePage, "api");
    assert.equal(await deletePage.getByRole("dialog", { name: "애플리케이션 삭제", exact: true }).count(), 0);
    assert.deepEqual(await deletePage.evaluate(() => JSON.parse(localStorage.getItem("freesia.demo.v1"))), before);
    await switchSource(deletePage, "demo");
    await opener.click();
    await deletePage.locator(".sidebar-nav").getByRole("button", { name: "인프라 스페이스", exact: true, includeHidden: true }).evaluate(element => element.click());
    assert.equal(await deletePage.getByRole("dialog", { name: "애플리케이션 삭제", exact: true }).count(), 0);
    assert.deepEqual(await deletePage.evaluate(() => JSON.parse(localStorage.getItem("freesia.demo.v1"))), before);
    await deletePage.close();
    record({ name: "application-list-delete-" + name, checks: "icon/toolbar; demo refresh retains state; strict no-pointer/no-history target filtering; single removal/unrelated records/counts/reload; cancel/Escape/focus; storage error retains dialog/app; missing/protected targets; no-target state passed" });
  }

  for (const [name, width, height] of [["desktop",1440,1000],["mobile",390,844]]) {
    const cancelPage = await browser.newPage({ viewport: { width, height } });
    const preserved = makeInfraSpace({ name: "보존할 Space" });
    const discarded = makeInfraSpace({ name: "취소할 Space" });
    const fixture = {
      ...initialDemo(),
      designs: [makeDesign("이전 설계 보존", "legacy", {region:"ap-northeast-2",visibility:"private",availability:"single"})],
      apps: [{ ...app, infra_id: preserved.id }],
      meeting: { spaces: [discarded,preserved], github: null },
    };
    await cancelPage.goto(url + "/?source=demo");
    await cancelPage.evaluate((value)=>localStorage.setItem("freesia.demo.v1",JSON.stringify(value)),fixture);
    await cancelPage.reload();
    assert.equal(await cancelPage.getByRole("heading",{name:"이전 별도 설계 · 읽기 전용",exact:true}).count(),0);
    assert.equal(await cancelPage.getByRole("button",{name:"이전 설계 보존",exact:true}).count(),0);
    await cancelPage.getByRole("button",{name:"Space 상세: 취소할 Space",exact:true}).click();
    await cancelPage.getByLabel("인프라 요구사항",{exact:true}).fill("유지할 작성 내용");
    const before = await cancelPage.evaluate(()=>JSON.parse(localStorage.getItem("freesia.demo.v1")));
    await cancelPage.screenshot({path:"artifacts/infra-cancel-"+name+".png",fullPage:true});
    const rejected = cancelPage.waitForEvent("dialog");
    const dismissClick = cancelPage.getByRole("button",{name:"작성 취소",exact:true}).click();
    const dismissDialog = await rejected;
    assert.equal(dismissDialog.type(),"confirm");
    assert.match(dismissDialog.message(),/취소할 Space/);
    await dismissDialog.dismiss(); await dismissClick;
    assert.equal(await cancelPage.getByLabel("인프라 요구사항",{exact:true}).inputValue(),"유지할 작성 내용");
    assert.deepEqual(await cancelPage.evaluate(()=>JSON.parse(localStorage.getItem("freesia.demo.v1"))),before);
    const accepted = cancelPage.waitForEvent("dialog");
    const acceptClick = cancelPage.getByRole("button",{name:"작성 취소",exact:true}).click();
    await (await accepted).accept(); await acceptClick;
    await cancelPage.getByRole("heading",{name:"인프라 스페이스",exact:true}).waitFor();
    const after = await cancelPage.evaluate(()=>JSON.parse(localStorage.getItem("freesia.demo.v1")));
    assert.deepEqual(after,{...before,meeting:{...before.meeting,spaces:[preserved]}});
    await cancelPage.reload();
    assert.equal(await cancelPage.getByRole("button",{name:"Space 상세: 취소할 Space",exact:true}).count(),0);
    await cancelPage.getByRole("button",{name:"Space 상세: 보존할 Space",exact:true}).click();
    assert.equal(await cancelPage.getByRole("button",{name:"작성 취소",exact:true}).isDisabled(),true);
    await cancelPage.getByRole("button",{name:"목록으로",exact:true}).click();
    await createInfra(cancelPage,"저장 실패 보존");
    const beforeFailure = await cancelPage.evaluate(()=>JSON.parse(localStorage.getItem("freesia.demo.v1")));
    await cancelPage.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException("quota","QuotaExceededError");};});
    const failure = cancelPage.waitForEvent("dialog");
    const failureClick = cancelPage.getByRole("button",{name:"작성 취소",exact:true}).click();
    await (await failure).accept(); await failureClick;
    assert.match(await cancelPage.getByRole("alert").innerText(),/저장하지 못/);
    assert.equal(await cancelPage.getByRole("heading",{name:"저장 실패 보존",exact:true}).count(),1);
    assert.deepEqual(await cancelPage.evaluate(()=>JSON.parse(localStorage.getItem("freesia.demo.v1"))),beforeFailure);
    await cancelPage.close();
    record({name:"infra-cancel-"+name,checks:"confirm dismiss retains draft; accept removes only selected Space across reload; linked guard; legacy/apps retained; persistence failure retains draft passed"});
  }

  const branchPage = await browser.newPage();
  const legacyRepositories = connectGitHubDemo();
  legacyRepositories.repositories[0].branch = "develop";
  legacyRepositories.registeredIds = [legacyRepositories.repositories[0].id];
  const branchRepositories = registerRepository(legacyRepositories,legacyRepositories.repositories[0].repo_url);
  await branchPage.goto(url + "/?source=demo");
  await branchPage.evaluate((github)=>localStorage.setItem("freesia.demo.v1",JSON.stringify({version:1,designs:[],apps:[],deployments:[],meeting:{spaces:[],github}})),branchRepositories);
  await branchPage.reload();
  await navigate(branchPage,"애플리케이션");
  await branchPage.getByRole("button",{name:"애플리케이션 생성",exact:true}).click();
  const branchOptions = await branchPage.locator("#registered-repo option").evaluateAll(items=>items.map(item=>item.value));
  assert.equal(new Set(branchOptions).size,branchOptions.length);
  await branchPage.getByLabel("등록한 Repository",{exact:true}).selectOption({label:"softbank-hackathon-2026/Freesia-Frontend · develop"});
  assert.match(await branchPage.locator("main").innerText(),/등록된 브랜치: develop/);
  await branchPage.getByLabel("등록한 Repository",{exact:true}).selectOption({label:"softbank-hackathon-2026/Freesia-Frontend · main"});
  assert.match(await branchPage.locator("main").innerText(),/등록된 브랜치: main/);
  await branchPage.getByLabel("앱 이름",{exact:true}).fill("main-branch-app");
  await branchPage.getByLabel("Infra Space",{exact:true}).selectOption("demo-public");
  await branchPage.getByRole("button",{name:"애플리케이션 생성",exact:true}).click();
  assert.equal(await branchPage.evaluate(()=>JSON.parse(localStorage.getItem("freesia.demo.v1")).apps[0].branch),"main");
  await branchPage.close();
  record({name:"legacy-repository-branches",checks:"registered legacy develop and same-URL main remain independently selectable; app persists main passed"});

  const repositoryRace = await browser.newPage();
  let repositoryCalls = 0;
  let repositoryList = [repository];
  let repositoryRequestHold, releaseRepositoryPost;
  await repositoryRace.route("**/api/**",async route=>{
    const request=route.request();
    const path=new URL(request.url()).pathname;
    const json=value=>route.fulfill({contentType:"application/json",body:JSON.stringify(value)});
    if(path.endsWith("/repositories")) {
      if(request.method()==="POST") {
        repositoryCalls++;
        await repositoryRequestHold;
        const body = request.postDataJSON();
        const added={...repository,...body,id:"late-repository-"+repositoryCalls,name:body.repo_url.slice("https://github.com/".length)};
        repositoryList=[...repositoryList,added];
        return json(added);
      }
      return json(repositoryList);
    }
    if(path.endsWith("/infra-spaces"))return json([infra]);
    if(path.endsWith("/app-spaces"))return json([]);
  });
  await repositoryRace.goto(url + "/?source=demo");
  await navigate(repositoryRace,"통합");
  await openIntegrationForm(repositoryRace);
  await repositoryRace.getByLabel("Repository URL",{exact:true}).fill("https://github.com/demo/only");
  await repositoryRace.getByRole("button",{name:"Repository 등록",exact:true}).click();
  const demoRegistry=await repositoryRace.evaluate(()=>localStorage.getItem("freesia.demo.v1"));
  await switchSource(repositoryRace, "api");
  await repositoryRace.getByRole("button",{name:"등록 해제: team/web (main)",exact:true}).waitFor();
  await openIntegrationForm(repositoryRace);
  await repositoryRace.getByLabel("Repository URL",{exact:true}).fill("https://github.com/team/late");
  repositoryRequestHold = new Promise(resolve => { releaseRepositoryPost = resolve; });
  const pendingRepository=repositoryRace.waitForRequest(request=>request.url().endsWith("/repositories")&&request.method()==="POST");
  await repositoryRace.getByRole("button",{name:"Repository 등록",exact:true}).click();
  await pendingRepository;
  assert.equal(await repositoryRace.getByRole("button", { name: "목록으로", exact: true }).isDisabled(), true);
  assert.equal(await repositoryRace.getByRole("button", { name: "취소", exact: true }).isDisabled(), true);
  await switchSource(repositoryRace, "demo");
  await openIntegrationForm(repositoryRace);
  await repositoryRace.getByLabel("Repository URL",{exact:true}).fill("https://github.com/demo/unfinished");
  releaseRepositoryPost();
  repositoryRequestHold = undefined;
  await repositoryRace.waitForTimeout(500);
  assert.equal(repositoryCalls,1);
  assert.equal(await repositoryRace.locator(".repository-row").count(),0);
  assert.equal(await repositoryRace.getByLabel("Repository URL",{exact:true}).inputValue(),"https://github.com/demo/unfinished");
  assert.equal(await repositoryRace.evaluate(()=>localStorage.getItem("freesia.demo.v1")),demoRegistry);
  await switchSource(repositoryRace, "api");
  await repositoryRace.getByRole("button",{name:"등록 해제: team/late (main)",exact:true}).waitFor();
  assert.equal(await repositoryRace.locator(".repository-row").count(),2);
  await openIntegrationForm(repositoryRace);
  await repositoryRace.getByLabel("Repository URL", { exact: true }).fill("https://github.com/team/navigation-late");
  repositoryRequestHold = new Promise(resolve => { releaseRepositoryPost = resolve; });
  const pendingNavigationRepository = repositoryRace.waitForRequest(request => request.url().endsWith("/repositories") && request.method() === "POST");
  await repositoryRace.getByRole("button", { name: "Repository 등록", exact: true }).click();
  await pendingNavigationRepository;
  await navigate(repositoryRace, "인프라 스페이스");
  releaseRepositoryPost();
  repositoryRequestHold = undefined;
  await repositoryRace.waitForTimeout(500);
  assert.equal(await repositoryRace.getByRole("heading", { name: "인프라 스페이스", exact: true }).count(), 1);
  assert.equal(await repositoryRace.getByRole("heading", { name: "등록", exact: true }).count(), 0);
  assert.equal(await repositoryRace.getByLabel("Repository URL", { exact: true }).count(), 0);
  assert.equal(await repositoryRace.evaluate(() => localStorage.getItem("freesia.demo.v1")), demoRegistry);
  await navigate(repositoryRace, "통합");
  await repositoryRace.getByRole("button", { name: "등록 해제: team/navigation-late (main)", exact: true }).waitFor();
  assert.equal(repositoryCalls, 2);
  assert.equal(await repositoryRace.locator(".repository-row").count(), 3);
  await repositoryRace.close();
  record({name:"repository-mode-race",checks:"pending form Back/cancel disabled; source and main-navigation unmount ignore late API registration; demo input/storage retained; reentry reloads actual fixture list passed"});
  const quota = await browser.newPage();
  await quota.goto(url + "/?source=demo");
  await createInfra(quota,"retain-code"); await answerInfra(quota,"<script>window.bad=1</script> 저장 오류 확인용");
  await quota.getByRole("button",{name:"답변으로 Terraform 생성",exact:true}).click();
  assert.doesNotMatch(await quota.getByLabel("Terraform 코드").innerText(),/window.bad/);
  assert.equal(await quota.evaluate(()=>window.bad),undefined);
  await quota.getByLabel("선택한 코드와 데모 제한을 검토했습니다",{exact:true}).check();
  await quota.evaluate(()=>{Storage.prototype.setItem=function(){throw new DOMException("quota","QuotaExceededError");};});
  await quota.getByRole("button",{name:"Apply 시작 · 데모",exact:true}).click();
  assert.match(await quota.getByRole("alert").innerText(),/저장하지 못/);
  await quota.getByLabel("Terraform 코드").waitFor();
  assert.equal(await quota.getByRole("region",{name:"인프라 Apply 결과"}).count(),0);
  await quota.close();
  record({name:"quota",checks:"Apply persistence failure retains reviewed code without advancing passed"});

  const infraQuota = await browser.newPage();
  await infraQuota.addInitScript(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException("quota", "QuotaExceededError");
    };
  });
  await infraQuota.goto(url + "/?source=demo");
  await infraQuota
    .getByRole("button", { name: "스페이스 생성", exact: true })
    .click();
  await infraQuota
    .getByLabel("Space 이름", { exact: true })
    .fill("retain-space-draft");
  await infraQuota
    .getByRole("button", { name: "Space 생성", exact: true })
    .click();
  assert.match(await infraQuota.getByRole("alert").innerText(), /저장하지 못/);
  assert.equal(
    await infraQuota.getByLabel("Space 이름", { exact: true }).inputValue(),
    "retain-space-draft",
  );
  await navigate(infraQuota, "통합");
  await openIntegrationForm(infraQuota);
  await infraQuota.getByLabel("Repository URL",{exact:true}).fill("https://github.com/team/retained");
  await infraQuota.getByRole("button",{name:"Repository 등록",exact:true}).click();
  assert.equal(await infraQuota.getByLabel("Repository URL",{exact:true}).inputValue(),"https://github.com/team/retained");
  assert.equal(await infraQuota.locator(".repository-row").count(),0);
  assert.match(await infraQuota.getByRole("alert").innerText(), /저장하지 못/);
  await infraQuota.close();
  record({
    name: "meeting-quota",
    checks:
      "new Infra draft retained; Repository input retained and no registered item on persistence failure passed",
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
  await pipelineQuota.goto(url + "/?source=demo");
  await appForm(pipelineQuota, "retain-plan", "demo-public");
  await pipelineQuota
    .getByRole("button", { name: "애플리케이션 생성", exact: true })
    .click();
  await pipelineQuota
    .getByRole("button", { name: "코드 분석 시작", exact: true })
    .click();
  await pipelineQuota
    .locator(".candidate")
    .filter({ hasText: "ecs-fargate" })
    .getByRole("button", { name: "이 후보 선택", exact: true })
    .click();
  await pipelineQuota
    .getByRole("button", {
      name: "선택한 환경으로 구성안 조회",
      exact: true,
    })
    .click();
  await pipelineQuota.getByLabel("설정값을 확인했습니다",{exact:true}).check();
  await pipelineQuota
    .getByRole("button", {
      name: "선택한 구성안으로 배포 · 데모",
      exact: true,
    })
    .click();
  assert.match(
    await pipelineQuota.getByRole("alert").innerText(),
    /저장하지 못/,
  );
  assert.equal(
    await pipelineQuota.getByLabel("샘플 템플릿 설정값").count(),
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
  record({
    name: "pipeline-quota",
    checks:
      "failure to persist start does not run pipeline; selected Terraform preview retained passed",
  });
  const corrupt = await browser.newPage();
  await corrupt.addInitScript(() =>
    localStorage.setItem("freesia.demo.v1", '{"version":99}'),
  );
  await corrupt.goto(url + "/?source=demo");
  await corrupt.getByRole("alert").waitFor();
  await navigate(corrupt, "애플리케이션");
  assert.equal(await corrupt.getByRole("button", { name: "애플리케이션 삭제", exact: true }).isDisabled(), true);
  assert.equal(await corrupt.getByRole("dialog", { name: "애플리케이션 삭제", exact: true }).count(), 0);
  assert.equal(await corrupt.evaluate(() => localStorage.getItem("freesia.demo.v1")), '{"version":99}');
  await corrupt
    .getByRole("button", { name: "손상된 데모 데이터 초기화" })
    .click();
  assert.equal(await corrupt.getByRole("alert").count(), 0);
  await corrupt.close();
  record({
    name: "corrupt-store",
    checks: "visible error + explicit reset passed",
  });
  const legacyProgress = await browser.newPage();
  const oldDeployment={...deployment,id:"demo-old",app_space_id:"demo-old-app",status:"success",url:null};
  const oldApp={...app,id:"demo-old-app",name:"이전 배포",infra_id:"demo-public",latest_deployment_id:"demo-old"};
  await legacyProgress.goto(url + "/?source=demo");
  await legacyProgress.evaluate(({oldApp,oldDeployment,state})=>{state.apps=[oldApp];state.deployments=[oldDeployment];localStorage.setItem("freesia.demo.v1",JSON.stringify(state));},{oldApp,oldDeployment,state:initialDemo()});
  await legacyProgress.goto(url+"/?source=demo&app=demo-old-app");
  await legacyProgress.getByRole("heading",{name:"이전 배포 (Lambda)",exact:true}).waitFor();
  await legacyProgress.getByText("현재 진행률 확인 중…",{exact:true}).waitFor();
  assert.equal(await legacyProgress.getByLabel("배포 진행률",{exact:true}).getAttribute("value"),null);
  await legacyProgress.close();
  record({name:"legacy-progress",checks:"saved deployment without per-stage metadata stays indeterminate instead of negative/fabricated progress"});
  const plansPage = await browser.newPage();
  let analysisReads=0, planReads=0, planCount=2, resourceMode="empty", deployBodies=[], failAnalysis=true, failPlans=true;
  let plansAnalysisSnapshot=null;
  const config={id:"plan-one",name:"기본 구성",summary:"설정 검토",pros:["단순"],cons:["단일 구성"],template:"lambda/basic",values:{memory:512,timeout:30}};
  await plansPage.route("**/api/**", async route=>{
    const req=route.request(), path=new URL(req.url()).pathname;
    const json=(value,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(value)});
    if(path.endsWith("/repositories"))return json([repository]);
    if(path.endsWith("/infra-spaces"))return json([infra]);
    if(path.endsWith("/app-spaces"))return json([app]);
    if(path.endsWith("/app-api"))return json(app);
    if(path.endsWith("/analysis")){
      if(req.method()==="POST") {
        plansAnalysisSnapshot={...analysis,status:failAnalysis?"failed":"running",candidates:[],mascot_message:null};
        return json(plansAnalysisSnapshot);
      }
      if(!plansAnalysisSnapshot)return json({message:"Analysis has not started"},404);
      analysisReads++; plansAnalysisSnapshot=analysis; return json(analysis);
    }
    if(path.endsWith("/plans")){
      if(req.method()==="POST")return json({status:failPlans?"failed":"running",compute:"lambda",plans:[]});
      planReads++; return json({status:"done",compute:"lambda",plans:planCount===1?[config]:[config,{...config,id:"plan-two",name:"확장 구성",values:{memory:1024}}]});
    }
    if(path.endsWith("/deployments")){deployBodies.push(req.postDataJSON());return json(deployment,201);}
    if(path.endsWith("/resources"))return resourceMode==="error"?json({message:"자원 수집 실패"},500):json([]);
    if(path.endsWith("/events"))return route.fulfill({contentType:"text/event-stream",body:'event: progress\ndata: '+JSON.stringify({status:"failed",step:"build",progress:40,message:"빌드 중단",url:null,at:"2026-10-02T01:00:00Z"})+'\n\n'});
    return json({...deployment,status:"failed",reason:"컨테이너 빌드 실패 이유"});
  });
  await plansPage.goto(url+"/?source=api&app=app-api");
  await plansPage.getByRole("heading",{name:"api-web",exact:true}).waitFor();
  const plansDemoBefore=await plansPage.evaluate(()=>localStorage.getItem("freesia.demo.v1"));
  await plansPage.getByRole("button",{name:"코드 분석 시작",exact:true}).click();
  await plansPage.getByText(/분석에 실패했습니다/).waitFor();
  failAnalysis=false;
  await plansPage.getByRole("button",{name:"다시 분석",exact:true}).click();
  await plansPage.getByText(/코드를 분석하고 있습니다/).waitFor();
  await plansPage.getByRole("heading",{name:"실행 환경 후보",exact:true}).waitFor();
  assert.equal(analysisReads,1);
  await plansPage.locator(".candidate").filter({hasText:"lambda"}).getByRole("button",{name:"이 후보 선택",exact:true}).click();
  await plansPage.getByRole("button",{name:"선택한 환경으로 구성안 조회",exact:true}).click();
  await plansPage.getByText(/구성안 준비에 실패했습니다/).waitFor();
  failPlans=false;
  await plansPage.getByRole("button",{name:"선택한 환경으로 구성안 조회",exact:true}).click();
  const review=plansPage.getByRole("region",{name:"구성안 검토",exact:true});
  await review.getByRole("heading",{name:"확장 구성",exact:true}).waitFor();
  assert.equal(planReads,1); assert.equal(await review.locator(".candidate").count(),2);
  assert.equal(await review.getByRole("button",{name:"선택한 구성안으로 배포",exact:true}).isDisabled(),true);
  await review.locator(".candidate").filter({hasText:"확장 구성"}).getByRole("button").click();
  assert.equal(await review.getByRole("button",{name:"선택한 구성안으로 배포",exact:true}).isDisabled(),true);
  await review.getByLabel("설정값을 확인했습니다",{exact:true}).check();
  // A single plan goes directly to review without a redundant selection step.
  planCount=1;
  await reviewDeploymentStep(plansPage, "실행 환경 선택");
  await plansPage.getByRole("button",{name:"선택한 환경으로 구성안 조회",exact:true}).click();
  await review.getByRole("heading",{name:"기본 구성",exact:true}).waitFor();
  assert.equal(await review.locator(".candidate").count(),1);
  assert.equal(await review.getByLabel("설정값을 확인했습니다",{exact:true}).isChecked(),false);
  assert.equal(await review.getByRole("button",{name:"이 구성안 선택",exact:true}).count(),0);
  await review.getByLabel("설정값을 확인했습니다",{exact:true}).check();
  await review.getByRole("button",{name:"선택한 구성안으로 배포",exact:true}).click();
  await plansPage.getByText("컨테이너 빌드 실패 이유",{exact:true}).waitFor();
  assert.deepEqual(deployBodies,[{compute:"lambda",plan_id:"plan-one"}]);
  assert.equal(await plansPage.locator(".pipeline-steps li").nth(2).locator("span").innerText(),"실패");
  await plansPage.getByText(/아직 보고된 자원이 없습니다/).waitFor();
  resourceMode="error";
  await plansPage.getByRole("button",{name:"자원 상태 다시 조회",exact:true}).click();
  await plansPage.getByText("자원 수집 실패",{exact:true}).waitFor();
  resourceMode="empty";
  await plansPage.getByRole("button",{name:"자원 상태 다시 조회",exact:true}).click();
  await plansPage.getByText(/아직 보고된 자원이 없습니다/).waitFor();
  assert.equal(await plansPage.evaluate(()=>localStorage.getItem("freesia.demo.v1")),plansDemoBefore);
  await plansPage.screenshot({path:"artifacts/api-config-reviewed.png",fullPage:true});
  await plansPage.close();
  record({name:"analysis-plans-resources",checks:"pending analysis and plans poll; 1/N plans require explicit review; plan_id submitted; failed reason restored; resource empty/error/retry passed"});
  await writeFile(
    "artifacts/browser-results.json",
    JSON.stringify({ status: "passed", results }, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser?.close();
  server.kill();
}
