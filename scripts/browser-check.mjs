import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { initialDemo, makeDesign } from "../src/lib/demo.ts";
import { makeInfraSpace, connectGitHubDemo, registerRepository } from "../src/lib/meeting.ts";
const flowerBackup = await readFile(
  new URL("../public/freesia-flower.svg", import.meta.url),
  "utf8",
);
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
async function checkSourceBanner(page) {
  const colors = await page.locator(".source-banner").evaluate((banner) => {
    const style = window.getComputedStyle(banner);
    const luminance = (color) => {
      const channels = color.match(/[\d.]+/g).slice(0, 3).map((value) => {
        const channel = Number(value) / 255;
        return channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const foreground = luminance(style.color);
    const background = luminance(style.backgroundColor);
    return {
      color: style.color,
      background: style.backgroundColor,
      contrast: (Math.max(foreground, background) + 0.05) /
        (Math.min(foreground, background) + 0.05),
      demo: banner.classList.contains("demo"),
    };
  });
  assert.ok(colors.contrast >= 4.5, `Source banner contrast: ${colors.contrast}`);
  if (colors.demo) {
    assert.equal(colors.background, "rgb(180, 35, 24)");
    assert.equal(colors.color, "rgb(255, 255, 255)");
  }
}
async function checkSidebar(page, mobile) {
  const sidebar = page.locator("#primary-navigation");
  const toggle = page.getByRole("button", { name: "주요 메뉴 열기", exact: true });
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
    await toggle.click();
    assert.equal(await sidebar.isVisible(), false);
  } else {
    assert.equal(await sidebar.isVisible(), true);
    assert.equal(await toggle.isVisible(), false);
    const sidebarBox = await sidebar.boundingBox();
    const contentBox = await page.locator(".workspace").boundingBox();
    assert.ok(sidebarBox.x + sidebarBox.width <= contentBox.x + 1);
  }
  await navigate(page, "애플리케이션");
  await navigate(page, "통합");
  await navigate(page, "인프라");
}
async function createInfra(page,name) {
 await page.getByRole("button",{name:"Infra Space 만들기",exact:true}).click();
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
async function appForm(page, name, infraId) {
  await navigate(page, "통합");
  if (!(await page.getByRole("button",{name:"등록 해제: softbank-hackathon-2026/Freesia-Frontend (main)",exact:true}).count())) {
    await page.getByLabel("Repository URL",{exact:true}).fill("https://github.com/softbank-hackathon-2026/Freesia-Frontend");
    await page.getByRole("button",{name:"Repository 등록",exact:true}).click();
  }
  await navigate(page, "애플리케이션");
  await page.getByRole("button", { name: "앱 연결", exact: true }).click();
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
  const readinessPage=await browser.newPage();
  let readinessKnown=false, readinessPlanReject=false, readinessExisting=false, readinessPlanPosts=0, readinessDeployPosts=0;
  await readinessPage.route("**/api/**",async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    const json=(body,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(body)});
    if(path.endsWith("/infra-spaces")){const {deployable_computes:ignored,...base}=infra;void ignored;return json([{...base,...(readinessKnown?{deployable_computes:["ecs-fargate"]}:{})}]);}
    if(path.endsWith("/repositories"))return json([repository]);
    if(path.endsWith("/app-spaces"))return json([app]);
    if(path.endsWith("/app-api"))return json({...app,latest_deployment_id:readinessExisting?"dep-api":null});
    if(path.endsWith("/analysis"))return json(analysis);
    if(path.endsWith("/plans")){
      readinessPlanPosts++;
      if(readinessPlanReject)return json({error:"compute_not_ready",message:"아직 준비되지 않은 컴퓨팅"},400);
      return json({status:"done",compute:"ecs-fargate",plans:[{id:"ready-plan",name:"기본 구성",summary:"기본값",pros:[],cons:[],template:"ecs-fargate/basic",values:{cpu:256,memory:512,container_port:3000}}]});
    }
    if(path.endsWith("/deployments")) {readinessDeployPosts++;readinessExisting=true;return json({error:"deployment_in_progress",message:"이미 배포가 진행 중입니다"},409);}
    if(path.endsWith("/resources"))return json([]);
    if(path.endsWith("/events"))return route.fulfill({contentType:"text/event-stream",body:'event: progress\ndata: '+JSON.stringify({status:"success",step:"done",progress:100,message:"기존 배포 완료",url:null,at:"now"})+'\n\n'});
    return json({...deployment,compute:"ecs-fargate",status:"success"});
  });
  await readinessPage.goto(url+"/?source=api&app=app-api");
  await readinessPage.getByRole("button",{name:"배포",exact:true}).click();
  await readinessPage.locator(".candidate").filter({hasText:"ecs-fargate"}).getByRole("button",{name:"이 후보 선택",exact:true}).click();
  assert.equal(await readinessPage.getByRole("button",{name:"선택한 환경으로 구성안 조회",exact:true}).isDisabled(),true,"missing readiness must block plan request");
  assert.match(await readinessPage.locator(".deploy-actions").innerText(),/배포 가능 여부 미확인/);
  assert.equal(await readinessPage.getByRole("img",{name:"읽기 전용 분석 분기 트리"}).count(),0,"API never fabricates a demo decision tree");
  readinessKnown=true;await readinessPage.reload();
  await readinessPage.getByRole("button",{name:"배포",exact:true}).click();
  const lambdaCard=readinessPage.locator(".candidate").filter({hasText:"lambda"});
  await lambdaCard.getByRole("button",{name:"이 후보 선택",exact:true}).click();
  assert.match(await lambdaCard.innerText(),/배포 준비 중/);
  assert.equal(await readinessPage.getByRole("button",{name:"선택한 환경으로 구성안 조회",exact:true}).isDisabled(),true);
  assert.equal(readinessPlanPosts,0);
  await readinessPage.locator(".candidate").filter({hasText:"ecs-fargate"}).getByRole("button",{name:"이 후보 선택",exact:true}).click();
  readinessPlanReject=true;await readinessPage.getByRole("button",{name:"선택한 환경으로 구성안 조회",exact:true}).click();
  await readinessPage.getByText(/배포 준비 중입니다/).waitFor();
  readinessPlanReject=false;await readinessPage.getByRole("button",{name:"선택한 환경으로 구성안 조회",exact:true}).click();
  const singleReview=readinessPage.getByRole("region",{name:"배포 변경 확인",exact:true});
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
  results.push({name:"deployment-readiness",checks:"unknown readiness blocked; unready recommendations retained; compute400 shown; single plan directly reviewed; deployment409 resumes existing SSE without duplicate POST"});
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
    await checkSidebar(page, name === "mobile");
    await page.getByRole("heading", { name: "인프라", exact: true }).waitFor();
    assert.equal(await page.getByRole("columnheader",{name:"네트워크 유형",exact:true}).count(),0);
    assert.equal(await page.getByRole("columnheader",{name:"배포 대상",exact:true}).count(),0);
    assert.equal(await page.getByRole("columnheader",{name:"네트워크 구성",exact:true}).count(),1);
    assert.match(await page.locator("table").innerText(),/인터넷 경로 포함/);

    const seedStorage = await page.evaluate(()=>localStorage.getItem("freesia.demo.v1"));
    for (const [index, service] of ["쇼핑몰 서비스","사내 업무 서비스","결제 서비스"].entries()) {
      await page.getByRole("button",{name:service,exact:true}).click();
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
    await navigate(page,"통합"); await navigate(page,"인프라");
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
    await navigate(page, "통합");
    await navigate(page, "애플리케이션");
    await page.getByRole("button", { name: "앱 연결", exact: true }).click();
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
    await page.getByRole("button", { name: "앱 만들기" }).click();
    assert.match(await page.getByRole("alert").innerText(), /등록/);
    await page
      .getByLabel("등록한 Repository", { exact: true })
      .selectOption(
        { label: "softbank-hackathon-2026/Freesia-Frontend · main" },
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
    await page.getByText("failed", { exact: true }).waitFor();
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

    const appStore = await page.evaluate(()=>localStorage.getItem("freesia.demo.v1"));
    await navigate(page,"인프라");
    const shopRow = page.getByRole("row").filter({has:page.getByRole("button",{name:"쇼핑몰 서비스",exact:true})});
    assert.equal(await shopRow.getByRole("cell").last().innerText(),String(JSON.parse(appStore).apps.filter(app=>app.infra_id==="demo-public").length));
    await page.getByRole("button",{name:"쇼핑몰 서비스",exact:true}).click();
    await page.getByRole("button",{name:"목록으로",exact:true}).click();
    assert.equal(await page.evaluate(()=>localStorage.getItem("freesia.demo.v1")),appStore);
    await page.getByLabel("데이터 소스").selectOption("api");
    await checkSourceBanner(page);
    await page.getByRole("alert").first().waitFor();
    assert.match(
      await page.getByRole("alert").first().innerText(),
      /테스트 백엔드 연결 실패/,
    );
    await navigate(page, "인프라");
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
        "sidebar/active-menu/mobile-toggle/same-space-answers/direct-generate/review/apply-failure/retry/pause/reload/invalidation/invalid-form/app-analysis/deploy/log/metrics/API-error/no-fallback/keyboard/no-overflow/JS0 passed",
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
  let apiRepositories = [repository];
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
    else if (path === "/infra-spaces") value = [infra];
    else if (path === "/app-spaces" && req.method() === "GET") value = [app];
    else if (path === "/app-spaces") value = {...app,...req.postDataJSON(),id:"app-created"};
    else if (path === "/app-spaces/app-api")
      value = {
        ...app,
        latest_deployment_id: hasDeployment ? "dep-api" : null,
      };
    else if (path.endsWith("/analysis")) value = analysis;
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
  await apiPage.getByLabel("데이터 소스").selectOption("api");

  for (const [size,width,height] of [["desktop",1440,1000],["mobile",390,844]]) {
    await apiPage.setViewportSize({width,height});
    await apiPage.getByRole("button",{name:"Infra Space 만들기",exact:true}).click();
    await apiPage.getByLabel("Space 이름",{exact:true}).fill("not-created");
    assert.equal(await apiPage.getByRole("button",{name:"Space 생성",exact:true}).isDisabled(),true);
    await apiPage.getByRole("button",{name:"목록으로",exact:true}).click();
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
  await apiPage.getByLabel("Repository URL",{exact:true}).fill(" https://github.com/team/added.git/ ");
  await apiPage.getByRole("button",{name:"Repository 등록",exact:true}).click();
  await apiPage.getByRole("button",{name:"등록 해제: team/added (main)",exact:true}).waitFor();
  assert.deepEqual(JSON.parse(calls.find(call=>call.path==="/repositories"&&call.method==="POST").body),{repo_url:"https://github.com/team/added",branch:"main"});
  await apiPage.getByLabel("Repository URL",{exact:true}).fill("https://github.com/team/conflict");
  await apiPage.getByRole("button",{name:"Repository 등록",exact:true}).click();
  await apiPage.getByRole("alert").waitFor();
  assert.match(await apiPage.getByRole("alert").innerText(),/서버 중복 등록/);
  assert.equal(await apiPage.getByLabel("Repository URL",{exact:true}).inputValue(),"https://github.com/team/conflict");
  await apiPage.getByRole("button",{name:"등록 해제: team/added (main)",exact:true}).click();
  await apiPage.getByRole("button",{name:"등록 해제: team/added (main)",exact:true}).waitFor({state:"detached"});
  await navigate(apiPage,"애플리케이션");
  await apiPage.getByRole("button",{name:"앱 연결",exact:true}).click();
  assert.equal(await apiPage.locator("#repo-url").count(),0);
  assert.deepEqual(await apiPage.locator("#infra-select option").evaluateAll(items=>items.map(item=>item.value)),["","api-infra"]);
  await apiPage.getByLabel("앱 이름",{exact:true}).fill("created-api-app");
  await apiPage.getByLabel("등록한 Repository",{exact:true}).selectOption("repo-api");
  await apiPage.getByLabel("Infra Space",{exact:true}).selectOption("api-infra");
  await apiPage.getByRole("button",{name:"앱 만들기",exact:true}).click();
  await apiPage.getByRole("heading",{name:"created-api-app",exact:true}).waitFor();
  assert.deepEqual(JSON.parse(calls.find(call=>call.path==="/app-spaces"&&call.method==="POST").body),{name:"created-api-app",repo_url:repository.repo_url,branch:"main",infra_id:"api-infra"});
  await apiPage.getByRole("button",{name:"앱 목록으로",exact:true}).click();
  await apiPage.getByRole("button", { name: /api-web/ }).click();
  await apiPage
    .getByRole("button", { name: "배포", exact: true })
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
    const review=apiPage.getByRole("region",{name:"배포 변경 확인",exact:true});
    await review.waitFor();
    assert.match(await review.innerText(),/lambda/);
    assert.match(await review.innerText(),/연동 대기/);
    assert.equal(await apiPage.getByLabel("샘플 템플릿 설정값",{exact:true}).count(),0);
    assert.equal(await apiPage.getByRole("button",{name:"선택한 환경으로 구성안 조회",exact:true}).isDisabled(),false);
    assert.equal(await review.getByRole("button",{name:"선택한 구성안으로 배포",exact:true}).isDisabled(),true);
    assert.equal(await apiPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await apiPage.screenshot({path:"artifacts/api-app-parity-"+size+".png",fullPage:true});
  }
  assert.equal(calls.filter(c=>c.path.endsWith("/deployments")&&c.method==="POST").length,0,"no sample deployment may bypass missing plan API");
  assert.equal(calls.filter(c=>c.path==="/infra-spaces"&&c.method==="POST").length,0);
  assert.equal(await apiPage.locator(".candidate").filter({hasText:"ecs-fargate"}).getByText("추천",{exact:true}).count(),1);
  // Existing server deployment remains observable even though new deployment is unavailable.
  hasDeployment=true;
  serverStatus="building";
  await apiPage.getByRole("button",{name:"앱 목록으로",exact:true}).click();
  await apiPage.getByRole("button",{name:/api-web/}).click();
  await apiPage.getByText("success",{exact:true}).waitFor();
  assert.equal(await apiPage.locator(".pipeline-steps li").count(),6);
  assert.equal(await apiPage.locator(".pipeline-steps .complete").count(),6);
  assert.deepEqual(await apiPage.locator(".pipeline-steps li span").allTextContents(),Array(6).fill("완료"));
  assert.equal(await apiPage.getByText("샘플 commit:",{exact:false}).count(),0);
  await apiPage.screenshot({path:"artifacts/api-existing-deployment-parity-mobile.png",fullPage:true});
  assert.equal(calls.filter(c=>c.path.endsWith("/events")).length,1,"existing active deployment resumes SSE");
  await apiPage.getByRole("button",{name:"앱 목록으로",exact:true}).click();
  await apiPage.getByRole("button",{name:/api-web/}).click();
  await apiPage.getByText("success",{exact:true}).waitFor();
  await apiPage.waitForFunction(()=>document.querySelectorAll(".pipeline-steps .complete").length===6);
  assert.equal(calls.filter(c=>c.path.endsWith("/events")).length,2,"terminal deployment receives current snapshot after reentry");
  await apiPage.getByText("aws_ecs_service.web",{exact:true}).waitFor();
  await apiPage.reload();
  await apiPage.getByText("success",{exact:true}).waitFor();
  await apiPage.waitForFunction(()=>document.querySelectorAll(".pipeline-steps .complete").length===6);
  assert.equal(calls.filter(c=>c.path.endsWith("/events")).length,3,"refresh restores app and terminal snapshot");
  await apiPage.getByRole("tab", { name: "로그", exact: true }).click();
  assert.match(await apiPage.locator(".log-output").innerText(),/연동 대기/);
  assert.doesNotMatch(await apiPage.locator(".log-output").innerText(),/HTTP server started|GET \/ -> 200/);
  await apiPage.getByRole("tab",{name:"모니터링",exact:true}).click();
  assert.deepEqual(await apiPage.locator(".metrics strong").allTextContents(),["—","—","—"]);
  assert.equal(await apiPage.locator(".metrics meter").count(),0);
  await apiPage.screenshot({path:"artifacts/api-metrics-parity-mobile.png",fullPage:true});
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
      "API repositories list/register/409/delete204 and create from registered repo+serverinfra; explicit recommendation choice; unavailable Terraform/CI controls; existing deployment SSE; desktop/mobile parity; demo isolation passed",
  });
  await apiPage.close();
  const racePage = await browser.newPage();
  let phase = "analysis";
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
      if (phase === "analysis") await new Promise((r) => setTimeout(r, 350));
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
  await racePage.getByLabel("데이터 소스").selectOption("api");
  await racePage
    .getByRole("button", { name: "API 기반", exact: true })
    .waitFor();
  await navigate(racePage, "애플리케이션");
  await racePage.getByRole("button", { name: /app-A/ }).click();
  const analysisStarted = racePage.waitForRequest("**/app-a/analysis");
  await racePage
    .getByRole("button", { name: "배포", exact: true })
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
    checks: "late A analysis/existing deployment detail ignored after opening B passed",
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
  await listOnly.getByLabel("데이터 소스").selectOption("api");
  await listOnly
    .getByRole("button", { name: "API 기반", exact: true })
    .waitFor();
  await navigate(listOnly, "애플리케이션");
  await listOnly.getByRole("button",{name:"앱 연결",exact:true}).click();
  await listOnly.getByLabel("앱 이름",{exact:true}).fill("late-created");
  await listOnly.getByLabel("등록한 Repository",{exact:true}).selectOption("repo-api");
  await listOnly.getByLabel("Infra Space",{exact:true}).selectOption("api-infra");
  const createRequest=listOnly.waitForRequest(request=>request.url().endsWith("/app-spaces")&&request.method()==="POST");
  await listOnly.getByRole("button",{name:"앱 만들기",exact:true}).click();
  await createRequest;
  await listOnly.getByRole("button",{name:"앱 목록으로",exact:true}).click();
  await listOnly.waitForTimeout(500);
  assert.equal(await listOnly.getByRole("heading",{name:"late-created",exact:true}).count(),0);
  operation = "analysis";
  await listOnly.getByRole("button", { name: /app-A/ }).click();
  const listAnalyzeReq = listOnly.waitForRequest("**/app-a/analysis");
  await listOnly
    .getByRole("button", { name: "배포", exact: true })
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
      .getByRole("heading", { name: "배포 상태", exact: true })
      .count(),
    0,
  );
  await listOnly.close();
  results.push({
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
    await page.goto(url);
    for (const name of ["인프라", "애플리케이션", "통합"])
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
      .getByRole("button", { name: "Infra Space 만들기", exact: true })
      .click();
    await page
      .getByLabel("Space 이름", { exact: true })
      .fill("preserved-foundation");
    await navigate(page, "통합");
    await navigate(page, "인프라");
    await page
      .getByRole("button", { name: "Infra Space 만들기", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("Space 이름", { exact: true }).inputValue(),
      "preserved-foundation",
    );
    for (let i=0;i<3;i++) {
      if (i) await page.getByRole("button",{name:"Infra Space 만들기",exact:true}).click();
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
      assert.match(await row.innerText(),/외부 직접 경로 없음 · 다중 AZ/);
      assert.doesNotMatch(await row.innerText(),/ecs-fargate|\blambda\b|\bec2\b|AWS 샘플 대상/);
    }
    await page.screenshot({
      path: "artifacts/day3-infra-ready-" + viewportName + ".png",
      fullPage: true,
    });
    await navigate(page, "통합");
    assert.equal(await page.getByRole("button",{name:"GitHub 연결 · 데모",exact:true}).count(),0);
    assert.equal(await page.locator(".app-form input").count(),1);
    assert.equal(await page.locator(".app-form select").count(),0);
    await page.getByLabel("Repository URL",{exact:true}).fill("https://github.com/owner/repo/tree/main");
    await page.getByRole("button",{name:"Repository 등록",exact:true}).click();
    assert.match(await page.getByRole("alert").innerText(),/URL/);
    await page.getByLabel("Repository URL",{exact:true}).fill("  https://github.com/softbank-hackathon-2026/Freesia-Frontend.git/  ");
    await page.getByRole("button",{name:"Repository 등록",exact:true}).click();
    assert.equal(await page.getByLabel("Repository URL",{exact:true}).inputValue(),"");
    await page.getByLabel("Repository URL",{exact:true}).fill("https://github.com/SOFTBANK-HACKATHON-2026/freesia-frontend");
    await page.getByRole("button",{name:"Repository 등록",exact:true}).click();
    assert.match(await page.getByRole("alert").innerText(),/이미 등록/);
    assert.equal(await page.locator(".repository-row").count(),1);
    await page.getByLabel("Repository URL",{exact:true}).fill("https://github.com/team/custom-app");
    await page.getByRole("button",{name:"Repository 등록",exact:true}).click();
    assert.equal(await page.locator(".repository-row").count(),2);
    assert.match(await page.locator("main").innerText(),/존재·공개 여부·main 브랜치와 접근 권한은 확인하지 않습니다/);
    await page.screenshot({
      path: "artifacts/day3-integration-" + viewportName + ".png",
      fullPage: true,
    });
    await navigate(page, "애플리케이션");
    await page.getByRole("button", { name: "앱 연결", exact: true }).click();
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
    await page.getByRole("button", { name: "앱 만들기", exact: true }).click();
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
    await page.reload();
    await navigate(page,"통합");
    assert.equal(await page.getByRole("button",{name:"등록 해제: softbank-hackathon-2026/Freesia-Frontend (main)",exact:true}).count(),0);
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
    await page.getByLabel("데이터 소스").selectOption("api");
    assert.equal(
      await page
        .getByRole("button", { name: "GitHub 연결 · 데모", exact: true })
        .count(),
      0,
    );
    assert.equal(await page.getByLabel("Repository URL",{exact:true}).count(),1);
    await page.getByRole("button",{name:"Repository 다시 조회",exact:true}).waitFor();
    assert.equal(await page.getByRole("button",{name:"Repository 등록",exact:true}).isDisabled(),true);
    assert.equal(await page.locator(".repository-row").count(),0);
    await navigate(page, "인프라");
    assert.equal(await page.getByRole("button",{name:"Infra Space 만들기",exact:true}).count(),1);
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
    results.push({
      name: "day3-sprint01-" + viewportName,
      checks:
        "three entry points, direct generation/review/apply->demo-ready, role-free infra/repo/app flow, draft retention, explicit repo registration, reload/API isolation passed",
    });
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
    await cancelPage.goto(url);
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
    await cancelPage.getByRole("heading",{name:"인프라",exact:true}).waitFor();
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
    results.push({name:"infra-cancel-"+name,checks:"confirm dismiss retains draft; accept removes only selected Space across reload; linked guard; legacy/apps retained; persistence failure retains draft passed"});
  }

  const branchPage = await browser.newPage();
  const legacyRepositories = connectGitHubDemo();
  legacyRepositories.repositories[0].branch = "develop";
  legacyRepositories.registeredIds = [legacyRepositories.repositories[0].id];
  const branchRepositories = registerRepository(legacyRepositories,legacyRepositories.repositories[0].repo_url);
  await branchPage.goto(url);
  await branchPage.evaluate((github)=>localStorage.setItem("freesia.demo.v1",JSON.stringify({version:1,designs:[],apps:[],deployments:[],meeting:{spaces:[],github}})),branchRepositories);
  await branchPage.reload();
  await navigate(branchPage,"애플리케이션");
  await branchPage.getByRole("button",{name:"앱 연결",exact:true}).click();
  const branchOptions = await branchPage.locator("#registered-repo option").evaluateAll(items=>items.map(item=>item.value));
  assert.equal(new Set(branchOptions).size,branchOptions.length);
  await branchPage.getByLabel("등록한 Repository",{exact:true}).selectOption({label:"softbank-hackathon-2026/Freesia-Frontend · develop"});
  assert.match(await branchPage.locator("main").innerText(),/등록된 브랜치: develop/);
  await branchPage.getByLabel("등록한 Repository",{exact:true}).selectOption({label:"softbank-hackathon-2026/Freesia-Frontend · main"});
  assert.match(await branchPage.locator("main").innerText(),/등록된 브랜치: main/);
  await branchPage.getByLabel("앱 이름",{exact:true}).fill("main-branch-app");
  await branchPage.getByLabel("Infra Space",{exact:true}).selectOption("demo-public");
  await branchPage.getByRole("button",{name:"앱 만들기",exact:true}).click();
  assert.equal(await branchPage.evaluate(()=>JSON.parse(localStorage.getItem("freesia.demo.v1")).apps[0].branch),"main");
  await branchPage.close();
  results.push({name:"legacy-repository-branches",checks:"registered legacy develop and same-URL main remain independently selectable; app persists main passed"});

  const repositoryRace = await browser.newPage();
  let repositoryCalls = 0;
  let repositoryList = [repository];
  await repositoryRace.route("**/api/**",async route=>{
    const request=route.request();
    const path=new URL(request.url()).pathname;
    const json=value=>route.fulfill({contentType:"application/json",body:JSON.stringify(value)});
    if(path.endsWith("/repositories")) {
      if(request.method()==="POST") {
        repositoryCalls++;
        await new Promise(resolve=>setTimeout(resolve,350));
        const added={...repository,...request.postDataJSON(),id:"late-repository",name:"team/late"};
        repositoryList=[...repositoryList,added];
        return json(added);
      }
      return json(repositoryList);
    }
    if(path.endsWith("/infra-spaces"))return json([infra]);
    if(path.endsWith("/app-spaces"))return json([]);
  });
  await repositoryRace.goto(url);
  await navigate(repositoryRace,"통합");
  await repositoryRace.getByLabel("Repository URL",{exact:true}).fill("https://github.com/demo/only");
  await repositoryRace.getByRole("button",{name:"Repository 등록",exact:true}).click();
  const demoRegistry=await repositoryRace.evaluate(()=>localStorage.getItem("freesia.demo.v1"));
  await repositoryRace.getByLabel("데이터 소스").selectOption("api");
  await repositoryRace.getByRole("button",{name:"등록 해제: team/web (main)",exact:true}).waitFor();
  await repositoryRace.getByLabel("Repository URL",{exact:true}).fill("https://github.com/team/late");
  const pendingRepository=repositoryRace.waitForRequest(request=>request.url().endsWith("/repositories")&&request.method()==="POST");
  await repositoryRace.getByRole("button",{name:"Repository 등록",exact:true}).click();
  await pendingRepository;
  await repositoryRace.getByLabel("데이터 소스").selectOption("demo");
  await repositoryRace.getByLabel("Repository URL",{exact:true}).fill("https://github.com/demo/unfinished");
  await repositoryRace.waitForTimeout(500);
  assert.equal(repositoryCalls,1);
  assert.equal(await repositoryRace.locator(".repository-row").count(),1);
  assert.equal(await repositoryRace.getByLabel("Repository URL",{exact:true}).inputValue(),"https://github.com/demo/unfinished");
  assert.equal(await repositoryRace.evaluate(()=>localStorage.getItem("freesia.demo.v1")),demoRegistry);
  await repositoryRace.getByLabel("데이터 소스").selectOption("api");
  await repositoryRace.getByRole("button",{name:"등록 해제: team/late (main)",exact:true}).waitFor();
  assert.equal(await repositoryRace.locator(".repository-row").count(),2);
  await repositoryRace.close();
  results.push({name:"repository-mode-race",checks:"late API registration cannot overwrite demo records/input; reentry reloads actual server list passed"});
  const quota = await browser.newPage();
  await quota.goto(url);
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
  results.push({name:"quota",checks:"Apply persistence failure retains reviewed code without advancing passed"});

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
    .getByRole("button", { name: "Space 생성", exact: true })
    .click();
  assert.match(await infraQuota.getByRole("alert").innerText(), /저장하지 못/);
  assert.equal(
    await infraQuota.getByLabel("Space 이름", { exact: true }).inputValue(),
    "retain-space-draft",
  );
  await navigate(infraQuota, "통합");
  await infraQuota.getByLabel("Repository URL",{exact:true}).fill("https://github.com/team/retained");
  await infraQuota.getByRole("button",{name:"Repository 등록",exact:true}).click();
  assert.equal(await infraQuota.getByLabel("Repository URL",{exact:true}).inputValue(),"https://github.com/team/retained");
  assert.equal(await infraQuota.locator(".repository-row").count(),0);
  assert.match(await infraQuota.getByRole("alert").innerText(), /저장하지 못/);
  await infraQuota.close();
  results.push({
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
  const legacyProgress = await browser.newPage();
  const oldDeployment={...deployment,id:"demo-old",app_space_id:"demo-old-app",status:"success",url:null};
  const oldApp={...app,id:"demo-old-app",name:"이전 배포",infra_id:"demo-public",latest_deployment_id:"demo-old"};
  await legacyProgress.goto(url);
  await legacyProgress.evaluate(({oldApp,oldDeployment,state})=>{state.apps=[oldApp];state.deployments=[oldDeployment];localStorage.setItem("freesia.demo.v1",JSON.stringify(state));},{oldApp,oldDeployment,state:initialDemo()});
  await legacyProgress.goto(url+"/?source=demo&app=demo-old-app");
  await legacyProgress.getByRole("heading",{name:"이전 배포",exact:true}).waitFor();
  await legacyProgress.getByText("현재 진행률 확인 중…",{exact:true}).waitFor();
  assert.equal(await legacyProgress.getByLabel("배포 진행률",{exact:true}).getAttribute("value"),null);
  await legacyProgress.close();
  results.push({name:"legacy-progress",checks:"saved deployment without per-stage metadata stays indeterminate instead of negative/fabricated progress"});
  const plansPage = await browser.newPage();
  let analysisReads=0, planReads=0, planCount=2, resourceMode="empty", deployBodies=[], failAnalysis=true, failPlans=true;
  const config={id:"plan-one",name:"기본 구성",summary:"설정 검토",pros:["단순"],cons:["단일 구성"],template:"lambda/basic",values:{memory:512,timeout:30}};
  await plansPage.route("**/api/**", async route=>{
    const req=route.request(), path=new URL(req.url()).pathname;
    const json=(value,status=200)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(value)});
    if(path.endsWith("/repositories"))return json([repository]);
    if(path.endsWith("/infra-spaces"))return json([infra]);
    if(path.endsWith("/app-spaces"))return json([app]);
    if(path.endsWith("/app-api"))return json(app);
    if(path.endsWith("/analysis")){
      if(req.method()==="POST")return json({...analysis,status:failAnalysis?"failed":"running",candidates:[]});
      analysisReads++; return json(analysis);
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
  await plansPage.getByRole("button",{name:"배포",exact:true}).click();
  await plansPage.getByText(/분석에 실패했습니다/).waitFor();
  failAnalysis=false;
  await plansPage.getByRole("button",{name:"배포",exact:true}).click();
  await plansPage.getByText(/코드를 분석하고 있습니다/).waitFor();
  await plansPage.getByRole("heading",{name:"실행 환경 후보",exact:true}).waitFor();
  assert.equal(analysisReads,1);
  await plansPage.locator(".candidate").filter({hasText:"lambda"}).getByRole("button",{name:"이 후보 선택",exact:true}).click();
  await plansPage.getByRole("button",{name:"선택한 환경으로 구성안 조회",exact:true}).click();
  await plansPage.getByText(/구성안 준비에 실패했습니다/).waitFor();
  failPlans=false;
  await plansPage.getByRole("button",{name:"선택한 환경으로 구성안 조회",exact:true}).click();
  const review=plansPage.getByRole("region",{name:"배포 변경 확인",exact:true});
  await review.getByRole("heading",{name:"확장 구성",exact:true}).waitFor();
  assert.equal(planReads,1); assert.equal(await review.locator(".candidate").count(),2);
  assert.equal(await review.getByRole("button",{name:"선택한 구성안으로 배포",exact:true}).isDisabled(),true);
  await review.locator(".candidate").filter({hasText:"확장 구성"}).getByRole("button").click();
  assert.equal(await review.getByRole("button",{name:"선택한 구성안으로 배포",exact:true}).isDisabled(),true);
  await review.getByLabel("설정값을 확인했습니다",{exact:true}).check();
  // A single plan goes directly to review without a redundant selection step.
  planCount=1;
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
  results.push({name:"analysis-plans-resources",checks:"pending analysis and plans poll; 1/N plans require explicit review; plan_id submitted; failed reason restored; resource empty/error/retry passed"});
  await writeFile(
    "artifacts/browser-results.json",
    JSON.stringify({ status: "passed", results }, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser?.close();
  server.kill();
}
