import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const base = process.env.DELETE_CHECK_URL || "http://localhost:5173";
const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe"});
const stamp = "2026-10-02T10:00:00Z";
const app = {id:"delete-api",name:"삭제 검증 앱",repo_url:"https://github.com/example/app",branch:"main",infra_id:"infra",created_at:stamp,latest_deployment_id:null};
let apps = [app], deletes = 0, outcome = "success", release;
const mutations = [], errors = [];
try {
  const page = await browser.newPage({viewport:{width:1280,height:900}});
  page.setDefaultTimeout(6000);
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/**", async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    const json = (body,status=200) => route.fulfill({status,contentType:"application/json",body:JSON.stringify(body)});
    if(req.method() !== "GET") mutations.push([req.method(),path]);
    if(req.method() === "DELETE") {
      deletes++;
      if(outcome === "hold") await new Promise(resolve => {release=resolve;});
      if(outcome === "network") return route.abort();
      if(outcome === "server") return json({message:"삭제 처리 실패"},500);
      if(!["success","hold"].includes(outcome)) return json({error:outcome,message:outcome === "app_still_deployed" ? "먼저 내려 주세요." : outcome === "deployment_in_progress" ? "배포가 끝난 뒤에 삭제할 수 있습니다." : "이미 내리는 중입니다."},409);
      apps=[];
      return route.fulfill({status:204});
    }
    if(path.endsWith("/infra-spaces")) return json([]);
    if(path.endsWith("/repositories")) return json([]);
    if(path.endsWith("/app-spaces")) return json(apps);
    throw new Error("Unexpected API request: "+path);
  });
  const open = async () => {
    await page.goto(base+"/?source=api");
    await page.locator(".sidebar-nav").getByRole("button",{name:"애플리케이션",exact:true}).click();
    await page.getByRole("button",{name:app.name+" 상세 보기",exact:true}).waitFor();
  };
  const opener = page.getByRole("button",{name:"애플리케이션 삭제",exact:true});
  const dialog = page.getByRole("dialog",{name:"애플리케이션 삭제",exact:true});
  const confirm = dialog.getByRole("button",{name:"선택한 애플리케이션 삭제",exact:true});
  await open();
  assert.equal(await opener.isEnabled(),true,"API app deletion must be enabled");
  const storage = await page.evaluate(()=>localStorage.getItem("freesia.demo.v1"));
  await opener.click();
  assert.match(await dialog.innerText(),/기록.*유지/);
  await dialog.getByRole("button",{name:"취소",exact:true}).click();
  assert.equal(deletes,0);
  for(const code of ["app_still_deployed","deployment_in_progress","teardown_in_progress","server","network"]) {
    outcome=code;
    await opener.click();await confirm.click();
    await dialog.getByRole("alert").waitFor();
    assert.equal(await page.getByRole("button",{name:app.name+" 상세 보기",exact:true}).count(),1);
    assert.equal(await confirm.isEnabled(),true);
    await dialog.getByRole("button",{name:"취소",exact:true}).click();
  }
  outcome="hold";await opener.click();await confirm.click();
  await page.waitForFunction(()=>document.querySelector("#app-discard-target")?.disabled);
  assert.equal(await dialog.getByRole("button",{name:"취소",exact:true}).isDisabled(),true);
  await page.keyboard.press("Escape");assert.equal(await dialog.isVisible(),true);
  assert.equal(await confirm.isDisabled(),true,"pending confirmation must block duplicate submission");
  assert.equal(deletes,6,"double submission must be blocked");
  release();await dialog.waitFor({state:"hidden"});
  await page.getByRole("heading",{name:"아직 애플리케이션이 없습니다",exact:true}).waitFor();
  assert.equal(await page.getByRole("button",{name:app.name+" 상세 보기",exact:true}).count(),0);
  assert.equal(await page.evaluate(()=>localStorage.getItem("freesia.demo.v1")),storage);
  await page.reload();await page.locator(".sidebar-nav").getByRole("button",{name:"애플리케이션",exact:true}).click();
  await page.getByRole("heading",{name:"아직 애플리케이션이 없습니다",exact:true}).waitFor();
  assert.ok(mutations.every(([method,path])=>method==="DELETE"&&path==="/api/app-spaces/delete-api"));
  await mkdir("artifacts",{recursive:true});await page.screenshot({path:"artifacts/app-delete-api.png",fullPage:true});
  apps=[app];outcome="hold";await open();await opener.click();await confirm.click();
  await page.waitForFunction(()=>document.querySelector("#app-discard-target")?.disabled);
  await page.getByLabel("데이터 소스",{exact:true}).evaluate(select => {select.value="demo";select.dispatchEvent(new window.Event("change",{bubbles:true}));});
  await page.getByText(/데모 모드 ·/).waitFor();
  release();
  await page.getByRole("button",{name:"애플리케이션 삭제",exact:true}).waitFor();
  assert.equal(await page.getByRole("dialog",{name:"애플리케이션 삭제",exact:true}).isVisible(),false);
  assert.equal(await page.evaluate(()=>localStorage.getItem("freesia.demo.v1")),storage);
  assert.deepEqual(errors,[]);
  console.log("PASS app deletion: confirm/cancel, 204/reload, 3x409, 500/network preserve app, pending duplicate guard, source-change cancellation, demo storage isolation; mocked API only");
} finally { await browser.close(); }
