import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { initialDemo } from '../src/lib/demo.ts';
const base = process.env.REDEPLOY_CHECK_URL || 'http://localhost:15173';
const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const stamp = '2026-10-02T10:00:00Z';
const app = {id:'redeploy-app',name:'재배포 확인 앱',repo_url:'https://github.com/example/redeploy',branch:'release',infra_id:'demo-public',created_at:stamp,latest_deployment_id:'failed-newest'};
const plan = {compute:'ecs-fargate',repo_url:app.repo_url,branch:app.branch,status:'template_ready',template:'ecs-fargate/custom',values:{cpu:1024,memory:2048,container_port:4123,health_check_path:'/ready',custom_flag:true}};
const previous = {id:'success-config',app_space_id:app.id,compute:plan.compute,status:'success',url:null,reason:null,created_at:stamp,demo_pipeline:{plan,phase:5,failCI:false,commit:null,version:2}};
const newest = {...previous,id:'failed-newest',status:'failed',created_at:'2026-10-02T11:00:00Z',demo_pipeline:{...previous.demo_pipeline,plan:{...plan,values:{container_port:9999}}}};
const foreign = {...previous,id:'foreign-success',app_space_id:'other-app',created_at:'2026-10-02T12:00:00Z',demo_pipeline:{...previous.demo_pipeline,plan:{...plan,values:{container_port:8888}}}};
const older = {...previous,id:'older-success',created_at:'2026-10-01T10:00:00Z',demo_pipeline:{...previous.demo_pipeline,plan:{...plan,values:{container_port:7777}}}};
const state = {...initialDemo(),apps:[app],deployments:[older,foreign,newest,previous]};
const errors = [], mutations = [], requests = [];
try {
  await mkdir('artifacts',{recursive:true});
  const page = await browser.newPage({viewport:{width:1280,height:900}});
  page.setDefaultTimeout(6000);
  await page.emulateMedia({reducedMotion:'reduce'});
  page.on('pageerror',e=>errors.push(e.message));
  const opener = page.getByRole('button',{name:'배포 관리',exact:true});
  const dialog = page.getByRole('dialog',{name:'새 버전 재배포',exact:true});
  const chooser = page.getByRole('dialog',{name:'배포 관리',exact:true});
  const openRedeploy = async()=>{await opener.click();await chooser.getByRole('button',{name:/^새 버전 재배포/}).click();assert.equal(await page.locator('dialog[open]').count(),1,'chooser and review use one dialog');};
  const expectBlocked = async()=>{await opener.click();assert.ok(await chooser.getByRole('button',{name:/^새 버전 재배포/}).isDisabled());await chooser.getByRole('button',{name:'취소',exact:true}).click();};
  const confirm = dialog.getByRole('button',{name:'이 설정으로 재배포 · 데모',exact:true});
  const saved = ()=>page.evaluate(()=>JSON.parse(localStorage.getItem('freesia.demo.v1')));
  await page.route('**/api/**',route=>{requests.push(route.request().url());return route.abort();});
  await page.goto(base + "/?source=demo");
  const seed = async (value=state)=>{
    await page.goto(base + '/?source=demo');
    await page.evaluate(value=>localStorage.setItem('freesia.demo.v1',JSON.stringify(value)),value);
    await page.goto(`${base}/?source=demo&app=${app.id}`);
    await page.getByRole('heading',{name:new RegExp('^'+app.name)}).waitFor().catch(async error=>{console.log(errors,await page.locator('body').innerText());throw error;});
  };
  await seed();
  assert.equal(await opener.count(),1,'deployed app must expose a separate redeploy entry');
  await opener.focus();await page.keyboard.press('Enter');
  await chooser.waitFor();assert.equal(await page.locator('dialog[open]').count(),1);await chooser.getByRole('button',{name:/^새 버전 재배포/}).click();
  await dialog.waitFor();
  assert.ok(await confirm.isDisabled(),'explicit review required');
  assert.match(await dialog.innerText(),/success-config/);
  assert.deepEqual(JSON.parse(await dialog.getByLabel('재사용할 설정값').innerText()),plan.values);
  for(let index=0;index<6;index++){await page.keyboard.press('Tab');assert.ok(await dialog.evaluate(el=>document.activeElement===document.body || el.contains(document.activeElement)),'keyboard cannot focus background controls');}
  await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
  assert.equal(await opener.evaluate(el=>el===document.activeElement),true,'Escape restores focus');
  assert.deepEqual(await saved(),state,'opening and cancelling must not change stored state');
  for(const width of [1280,390]) {
    await page.setViewportSize({width,height:900});await openRedeploy();
    assert.match(await dialog.innerText(),/최신 커밋.*확인하지/);
    assert.deepEqual(await dialog.locator('.form-actions button').allTextContents(),['이 설정으로 재배포 · 데모','배포 관리로','취소']);
    assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth),'dialog must not overflow horizontally');
    await dialog.screenshot({path:`artifacts/redeploy-demo-${width}.png`});
    await page.screenshot({path:`artifacts/redeploy-demo-screen-${width}.png`});
    await dialog.getByRole('button',{name:'배포 관리로',exact:true}).click();assert.equal(await chooser.isVisible(),true);assert.equal(await page.locator('dialog[open]').count(),1);await chooser.getByRole('button',{name:'취소',exact:true}).click();
  }
  await openRedeploy();await dialog.getByRole('checkbox').check();
  await page.evaluate(()=>{window.originalStorageWrite=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='freesia.demo.v1')throw new Error('fixture quota');return window.originalStorageWrite.call(this,key,value);};});
  await confirm.click();await dialog.getByRole('alert').waitFor();
  assert.deepEqual(await saved(),state,'failed persistence cannot start deployment');
  await page.evaluate(()=>{Storage.prototype.setItem=window.originalStorageWrite;});
  await confirm.click();await dialog.waitFor({state:'hidden'});
  const after = await saved(), created = after.deployments[0];
  assert.notEqual(created.id,previous.id);assert.equal(created.app_space_id,app.id);
  assert.equal(after.deployments.length,state.deployments.length+1);
  assert.deepEqual(created.demo_pipeline.plan,plan,'exact prior successful configuration must survive');
  assert.equal(after.apps[0].latest_deployment_id,created.id);
  await expectBlocked();
  await page.reload();
  await page.waitForFunction(id=>JSON.parse(localStorage.getItem('freesia.demo.v1')).deployments.find(d=>d.id===id)?.status==='success',created.id);
  assert.equal((await saved()).apps[0].latest_deployment_id,created.id);
  await openRedeploy();assert.match(await dialog.innerText(),new RegExp(created.id));
  await page.reload();assert.equal(await dialog.isVisible(),false,'reload discards unconfirmed dialog');
  assert.equal((await saved()).deployments.length,state.deployments.length+1);
  for(const record of [{...previous,demo_pipeline:undefined}, {...previous,demo_pipeline:{...previous.demo_pipeline,plan:{compute:plan.compute,repo_url:app.repo_url,branch:app.branch,status:'source_generated',path:'.freesia/app/main.tf',code:'legacy'}}}, newest]) {
    await seed({...state,apps:[{...app,latest_deployment_id:record.id}],deployments:record.status==='success' ? [record,older,foreign] : [record,foreign]});
    await openRedeploy();assert.ok(await confirm.isDisabled());
    assert.match(await dialog.innerText(),/재사용할.*성공.*구성.*없/);
    await dialog.getByRole('button',{name:'배포 관리로',exact:true}).click();assert.equal(await chooser.isVisible(),true);assert.equal(await page.locator('dialog[open]').count(),1);await chooser.getByRole('button',{name:'취소',exact:true}).click();
  }
  await seed({...state,apps:[{...app,latest_deployment_id:null}],deployments:[]});
  assert.equal(await opener.count(),0,'first deployment retains existing analysis flow');
  for(const status of ['pending','building','deploying']) {
    await seed({...state,apps:[{...app,latest_deployment_id:null}],deployments:[previous,{...newest,status}]});
    await expectBlocked();
  }
  assert.deepEqual(requests,[],'demo redeploy must make no API requests');
  await page.unroute('**/api/**');
  let apiApp = {...app,latest_deployment_id:previous.id,teardown_status:null,teardown_requested_at:null};
  const originalContext={app_space_id:app.id,repo_url:app.repo_url,branch:app.branch,source_deployment_id:previous.id,source_commit_sha:null,target_commit_sha:'b'.repeat(40),compute:plan.compute,plan:{id:'saved-plan',template:plan.template,values:plan.values}};
  let context=globalThis.structuredClone(originalContext), previewError=null, postError=null, holdPreview=false, holdPost=false, pendingPreview, pendingPost, previewCount=0;
  const createdApi={...previous,id:'api-new-deployment',demo_pipeline:undefined,status:'success',commit_sha:'b'.repeat(40),plan_id:'saved-plan',source_deployment_id:previous.id};
  let apiDeployment={...previous,demo_pipeline:undefined};
  await page.addInitScript(()=>{window.streamUrls=[];window.EventSource=class extends window.EventTarget{constructor(url){super();window.streamUrls.push(url);setTimeout(()=>this.dispatchEvent(new window.MessageEvent('progress',{data:JSON.stringify({status:'success',step:'done',message:'fixture complete',progress:100,url:null,at:'2026-10-02T10:00:00Z'})})),10);}close(){}};});
  await page.route('**/api/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)}).catch(()=>{});
    if(req.method()!=='GET')mutations.push({path,body:req.postDataJSON()});
    if(path.endsWith('/redeploy-context')){previewCount++;const snapshot=globalThis.structuredClone(context);if(holdPreview)await new Promise(resolve=>pendingPreview=resolve);return previewError ? json(previewError.body,previewError.status) : json(snapshot);}
    if(path.endsWith('/redeployments')){if(holdPost)await new Promise(resolve=>pendingPost=resolve);if(postError)return json(postError.body,postError.status);apiApp={...apiApp,latest_deployment_id:createdApi.id};return json(createdApi,201);}
    if(path.endsWith('/repositories'))return json([]);
    if(path.endsWith('/infra-spaces'))return json([{id:'demo-public',name:'서버 기반',description:'fixture',network:'public',computes:['ecs-fargate'],deployable_computes:['ecs-fargate'],app_count:1}]);
    if(path.endsWith('/app-spaces'))return json([apiApp]);
    if(path.endsWith('/'+app.id))return json(apiApp);
    if(path.endsWith('/resources')){requests.push(path);return json([]);}
    if(path.endsWith('/'+createdApi.id))return json(createdApi);
    if(path.endsWith('/'+previous.id))return json(apiDeployment);
    if(path.endsWith('/analysis'))return json({status:req.method()==='POST'?'running':'done',requirements:[],evidence:[],candidates:[],mascot_message:null});
    return json({error:'not_found'},404);
  });
  const openApi=async()=>{await page.goto(`${base}/?source=api&app=${app.id}`);await page.getByRole('heading',{name:/^배포 상태/}).waitFor();await opener.waitFor();await page.waitForFunction(()=>{const b=[...document.querySelectorAll('button')].find(el=>el.textContent==='배포 관리');return b&&!b.disabled;});};
  const apiConfirm=dialog.getByRole('button',{name:'이 설정으로 재배포',exact:true});
  const beforeApi=await saved();
  for(const width of [1280,390]){
    await page.setViewportSize({width,height:900});await openApi();
    await page.waitForFunction(()=>document.activeElement?.id==='deployment-step-heading');
    await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
    await page.screenshot({path:'artifacts/app-actions-header-api-'+width+'.png',fullPage:true});
    const scrollBefore=await page.evaluate(()=>window.scrollY), previewsBefore=previewCount;await opener.click();
    assert.equal(previewCount,previewsBefore,'chooser does not load redeploy context');assert.equal(await page.evaluate(()=>window.scrollY),scrollBefore,'management does not scroll to a removed panel');
    await chooser.screenshot({path:'artifacts/deployment-management-chooser-'+width+'.png'});
    await page.keyboard.press('Escape');await chooser.waitFor({state:'hidden'});assert.equal(await opener.evaluate(el=>el===document.activeElement),true,'chooser Escape restores header focus');assert.equal(previewCount,previewsBefore);
    await openRedeploy();
    await dialog.getByLabel('재사용할 설정값').waitFor();
    assert.equal(await apiConfirm.isDisabled(),true,'preview requires explicit settings review');
    assert.match(await dialog.innerText(),/bbbbbbbb/);assert.match(await dialog.innerText(),/커밋.*미제공/);
    assert.deepEqual(JSON.parse(await dialog.getByLabel('재사용할 설정값').innerText()),plan.values);
    assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth));
    await dialog.screenshot({path:`artifacts/redeploy-api-${width}.png`});
    await page.screenshot({path:`artifacts/redeploy-api-screen-${width}.png`});
    await dialog.getByRole('checkbox').check();await apiConfirm.scrollIntoViewIfNeeded();await dialog.screenshot({path:`artifacts/redeploy-api-review-${width}.png`});await page.keyboard.press('Escape');
    await dialog.waitFor({state:'hidden'});assert.equal(await opener.evaluate(el=>el===document.activeElement),true);
    assert.deepEqual(mutations,[],'preview and cancellation must never mutate');
  }
  for(const value of [{...originalContext,app_space_id:'other-app'},{...originalContext,repo_url:'https://github.com/other/repo'},{...originalContext,target_commit_sha:'invalid'}]){
    context=value;await openRedeploy();await dialog.getByRole('alert').waitFor();assert.ok(await apiConfirm.isDisabled());await dialog.getByRole('button',{name:'취소',exact:true}).click();
  }
  context=globalThis.structuredClone(originalContext);
  for(const [status,code] of [[404,'not_found'],[501,'not_supported'],[409,'redeploy_unavailable'],[409,'not_deployed'],[502,'github_error']]){
    previewError={status,body:{error:code,message:code}};await openRedeploy();await dialog.getByRole('alert').waitFor();assert.ok(await apiConfirm.isDisabled());await dialog.getByRole('button',{name:'취소',exact:true}).click();
  }
  previewError=null;holdPreview=true;await openRedeploy();await dialog.getByText('재배포 설정 조회 중…',{exact:true}).waitFor();await dialog.getByRole('button',{name:'취소',exact:true}).click();holdPreview=false;pendingPreview();
  context={...originalContext,target_commit_sha:'c'.repeat(40)};await openRedeploy();await dialog.getByLabel('재사용할 설정값').waitFor();assert.match(await dialog.innerText(),/cccccccc/);assert.ok(await apiConfirm.isDisabled());await dialog.getByRole('button',{name:'취소',exact:true}).click();
  context=globalThis.structuredClone(originalContext);
  for(const code of ['redeploy_source_changed','redeploy_target_changed']){
    await openRedeploy();await dialog.getByRole('checkbox').check();const count=previewCount;
    postError={status:409,body:{error:code,message:'Changed'}};context={...context,target_commit_sha:'c'.repeat(40),source_deployment_id:'new-source'};
    await apiConfirm.click();await page.waitForFunction(()=>{const d=document.querySelector('dialog[open]');return d?.textContent.includes('cccccccc')});
    assert.equal(previewCount,count+1);assert.ok(await apiConfirm.isDisabled());assert.equal(await dialog.getByRole('checkbox').isChecked(),false);await dialog.getByRole('button',{name:'취소',exact:true}).click();context=globalThis.structuredClone(originalContext);
  }
  const initialMutations=mutations.length;
  postError=null;holdPost=true;await openRedeploy();await dialog.getByRole('checkbox').check();
  await apiConfirm.evaluate(el=>{el.click();el.click();});await dialog.getByText('재배포 요청 중…',{exact:true}).waitFor();
  await page.keyboard.press('Escape');assert.ok(await dialog.isVisible());assert.ok(await dialog.getByRole('button',{name:'취소',exact:true}).isDisabled());assert.equal(mutations.length,initialMutations+1,'synchronous duplicate guard');
  holdPost=false;pendingPost();await dialog.waitFor({state:'hidden'});
  assert.deepEqual(mutations.at(-1),{path:`/api/app-spaces/${app.id}/redeployments`,body:{source_deployment_id:previous.id,target_commit_sha:'b'.repeat(40)}});
  await page.getByText('구성안: saved-plan',{exact:true}).waitFor();
  assert.ok(await page.evaluate(()=>window.streamUrls.some(url=>url.includes('/api-new-deployment/events'))));
  assert.ok(requests.some(path=>path.includes('/api-new-deployment/resources')));
  await page.reload();await page.getByText('구성안: saved-plan',{exact:true}).waitFor();assert.match(await page.locator('main').innerText(),/bbbbbbbb/);
  assert.deepEqual(await saved(),beforeApi,'API must not alter DEMO storage');
  assert.ok(mutations.every(entry=>entry.path.endsWith('/redeployments')),'redeploy never analyzes or creates plans');
  apiApp={...apiApp,latest_deployment_id:previous.id};
  for(const code of ['deployment_in_progress','teardown_in_progress']){
    await openApi();await openRedeploy();await dialog.getByRole('checkbox').check();
    postError={status:409,body:{error:code,message:code}};
    if(code==='deployment_in_progress')apiApp={...apiApp,latest_deployment_id:createdApi.id};else apiApp={...apiApp,teardown_status:'requested',teardown_requested_at:stamp};
    await apiConfirm.click();await dialog.waitFor({state:'hidden'});
    if(code==='deployment_in_progress')await page.getByText('구성안: saved-plan',{exact:true}).waitFor();else await expectBlocked();
  }
  apiApp={...apiApp,teardown_status:null,teardown_requested_at:null};postError=null;await openApi();holdPreview=true;await openRedeploy();await dialog.getByText('재배포 설정 조회 중…',{exact:true}).waitFor();
  await page.getByRole('button',{name:'앱 목록으로',exact:true}).evaluate(el=>el.click());holdPreview=false;pendingPreview();assert.equal(await dialog.isVisible(),false);
  await openApi();await page.getByRole('tab',{name:'로그',exact:true}).click();await opener.click();assert.equal(await page.getByRole('tab',{name:'로그',exact:true}).getAttribute('aria-selected'),'true','opening the chooser preserves the current tab');
  await chooser.getByRole('button',{name:/^설정 변경 · 재분석/}).click();await page.getByText(/코드를 분석하고 있습니다/).waitFor();assert.equal(await page.getByRole('tab',{name:'개요',exact:true}).getAttribute('aria-selected'),'true');assert.equal(await page.locator('dialog[open]').count(),0,'reanalysis closes management before starting the workflow');await expectBlocked();
  assert.equal(mutations.at(-1).path,`/api/app-spaces/${app.id}/analysis`);
  assert.deepEqual(errors,[]);
  console.log('PASS redeploy: DEMO regression; API GET-only review, full SHA/template/values, schema/wrong-app checks, errors/unavailable, cancellation/races, source/target mismatch reconfirmation, duplicate/pending locks, new ID SSE/resources/reload metadata, busy/teardown recovery, explicit separate analysis, desktop/mobile; mocked API only');} finally {await browser.close();}
