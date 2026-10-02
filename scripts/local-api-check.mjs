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
const deploymentPosts=[];
page.on("request",request=>{if(request.method()==="POST"&&request.url().endsWith("/deployments")) deploymentPosts.push({url:request.url(),body:request.postDataJSON()})});
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
  assert.equal(await page.getByLabel("Repository URL").count(), 0);
  await page.getByRole("button", { name: "등록", exact: true }).click();
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
  assert.equal(await page.getByLabel("Repository URL").count(), 0);
  await page.getByRole("button", { name: "등록", exact: true }).click();
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
  await page.getByRole("button", { name: "애플리케이션 생성", exact: true }).click();
  await page.getByLabel("앱 이름").fill(appName);
  await page.getByLabel("등록한 Repository", { exact: true }).selectOption(repo.id);
  await page.getByLabel("Infra Space", { exact: true }).selectOption(infras[0].id);
  const appCreation = page.waitForResponse((r) => r.url().endsWith("/api/app-spaces") && r.request().method() === "POST");
  await page.getByRole("button", { name: "애플리케이션 생성", exact: true }).click();
  const appResponse = await appCreation;
  assert.equal(appResponse.status(), 201);
  const app = await appResponse.json();
  assert.equal(app.repo_url, repoURL);
  assert.equal(app.branch, "main");
  assert.equal(app.infra_id, infras[0].id);
  assert.ok(!app.infra_id.startsWith("demo-"));
  const appButton = page.getByRole("button", { name: new RegExp(appName) });
  if (await appButton.count()) await appButton.click();
  await page.getByRole("button",{name:"배포",exact:true}).click();
  await page.getByRole("heading",{name:"실행 환경 후보",exact:true}).waitFor();
  assert.equal(await page.locator(".candidate.chosen").count(),0);
  assert.match(await page.locator(".deploy-actions").innerText(),/사용자 선택: 없음/);
  const fargate = page.locator(".candidate").filter({has:page.getByText("ecs-fargate",{exact:true})});
  await fargate.getByRole("button",{name:"이 후보 선택",exact:true}).click();
  const review=page.getByRole("region",{name:"배포 변경 확인",exact:true});
  await review.waitFor();
  const planResponse = page.waitForResponse(r=>r.url().endsWith(`/app-spaces/${app.id}/plans`) && r.request().method()==="POST");
  await page.getByRole("button",{name:"선택한 환경으로 구성안 조회",exact:true}).click();
  const planReply=await planResponse;
  assert.equal(planReply.status(),200);
  const planSet=await planReply.json();
  assert.equal(planSet.status,"done");
  assert.equal(planSet.compute,"ecs-fargate");
  assert.equal(planSet.plans.length,1);
  assert.ok(infras[0].deployable_computes.includes("ecs-fargate"));
  assert.equal(await review.getByRole("button",{name:"선택한 구성안으로 배포",exact:true}).isDisabled(),true);
  assert.equal(await review.getByRole("button",{name:"이 구성안 선택",exact:true}).count(),0);
  await review.getByLabel("설정값을 확인했습니다").check();
  await page.screenshot({path:"artifacts/local-api-plan-ready-desktop.png",fullPage:true});
  for(const compute of ["lambda","ec2"]){
    assert.equal(infras[0].deployable_computes.includes(compute),false);
    const unsupported=await api.post(baseURL+`/api/app-spaces/${app.id}/plans`,{data:{compute}});
    assert.equal(unsupported.status(),400);
    assert.equal((await unsupported.json()).error,"compute_not_ready");
  }
  const deploymentReply=page.waitForResponse(r=>r.url().endsWith(`/app-spaces/${app.id}/deployments`)&&r.request().method()==="POST");
  await review.getByRole("button",{name:"선택한 구성안으로 배포",exact:true}).click();
  const depResponse=await deploymentReply;
  assert.equal(depResponse.status(),201);
  const dep=await depResponse.json();
  assert.equal(deploymentPosts.length,1);
  assert.deepEqual(deploymentPosts[0].body,{compute:"ecs-fargate",plan_id:planSet.plans[0].id});
  const duplicateDeployment=await api.post(baseURL+`/api/app-spaces/${app.id}/deployments`,{data:{compute:"ecs-fargate",plan_id:planSet.plans[0].id}});
  assert.equal(duplicateDeployment.status(),409);
  assert.equal((await duplicateDeployment.json()).error,"deployment_in_progress");
  assert.equal((await (await get(`/app-spaces/${app.id}`)).json()).latest_deployment_id,dep.id);
  results.push("app create201, actual single server plan200, explicit plan/settings review, UI deployment201 sends plan_id, unready compute400, duplicate deployment409 preserves current ID");
  await page.getByRole("heading",{name:"배포 상태",exact:true}).waitFor();
  assert.equal(await page.locator(".pipeline-steps li").count(),6);
  await page.waitForFunction(()=>Number(document.querySelector('progress[aria-label="배포 진행률"]')?.getAttribute("value"))>0);
  await page.reload();
  await page.getByLabel("데이터 소스").selectOption("api");
  await navigate("애플리케이션");
  if (await page.getByRole("button",{name:new RegExp(appName)}).count()) await page.getByRole("button",{name:new RegExp(appName)}).click();
  await page.waitForFunction(()=>document.querySelector('progress[aria-label="배포 진행률"]')?.getAttribute("value")==="100",{},{timeout:45000});
  assert.equal((await (await get(`/deployments/${dep.id}`)).json()).status,"success");
  assert.deepEqual(await (await get(`/deployments/${dep.id}/resources`)).json(),[]);
  await page.getByText("아직 보고된 자원이 없습니다.",{exact:false}).waitFor();
  await page.screenshot({path:"artifacts/local-api-deployment-desktop.png",fullPage:true});
  assert.equal(deploymentPosts.length,1);
  results.push("reviewed UI local simulation, no duplicate POST on reload, six steps, refresh SSE current-state restoration, terminal success, empty resources remain unknown");

  if(process.env.LOCAL_RESOURCE_APP_NAME){
    await page.getByRole("button",{name:"앱 목록으로",exact:true}).click();
    await page.getByRole("button",{name:new RegExp(process.env.LOCAL_RESOURCE_APP_NAME)}).click();
    const resourcePanel=page.getByRole("region",{name:"배포 자원 상태",exact:true});
    await resourcePanel.getByText(/1\/3개 완료/).waitFor();
    assert.match(await resourcePanel.innerText(),/완료/);
    assert.match(await resourcePanel.innerText(),/진행 중/);
    assert.match(await resourcePanel.innerText(),/실패/);
    await page.screenshot({path:"artifacts/local-api-resources-desktop.png",fullPage:true});
    results.push("explicit local DB resource fixture rendered actual type/address/action and done/in_progress/failed states");
  }
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
    results, appId: app.id,
    limits: "SQLite local runtime; model-missing sample analysis, actual server catalog plan and UI deployment with DEPLOY_SIMULATE=true; optional resource fixture is local DB data; no external GitHub/AWS execution.",
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
