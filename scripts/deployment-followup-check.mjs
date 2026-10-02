import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const base=process.env.FOLLOWUP_CHECK_URL||'http://localhost:5173';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const stamp='2026-10-02T09:00:00Z';
const app={id:'followup-a',name:'Followup A',repo_url:'https://github.com/example/a',branch:'main',infra_id:'infra',created_at:stamp,latest_deployment_id:'dep-a',teardown_requested_at:null};
const second={...app,id:'followup-b',name:'Followup B',latest_deployment_id:null};
const deployment={id:'dep-a',app_space_id:app.id,compute:'ecs-fargate',status:'success',url:'https://sample.example.test',reason:null,created_at:stamp};
const analysis={status:'done',requirements:[],evidence:[],candidates:[{compute:'ecs-fargate',state:'selected',reason:'fixture',cons:[]}],mascot_message:null};
let teardownStatus=null,finished=null,reason=null,appGets=0,appError=false,deployConflict=false,holdGet=false,releaseGet,holdGetReady;
let fieldKnown=true,receipt=null,responseCode=202,errorCode='',posts=0,port=3000,hasDeployment=true,hold=false,release;
const bodies=[],errors=[];
try {
 await mkdir('artifacts',{recursive:true});
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.EventSource=class extends window.EventTarget{constructor(){super();setTimeout(()=>this.dispatchEvent(new window.MessageEvent('progress',{data:JSON.stringify({status:'success',step:'done',message:'fixture complete',progress:100,url:'https://sample.example.test',at:'2026-10-02T09:00:00Z'})})),10);}close(){}};});
 await page.route('**/api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  const json=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
  const current={...app,latest_deployment_id:hasDeployment?'dep-a':null,...(fieldKnown?{teardown_requested_at:receipt,teardown_status:teardownStatus,teardown_finished_at:finished,teardown_reason:reason}:{})};if(!fieldKnown)delete current.teardown_requested_at;
  if(path.endsWith('/teardown')){posts++;if(responseCode===0)return route.abort('failed');if(hold)await new Promise(resolve=>release=resolve);if(responseCode===202){receipt=stamp;teardownStatus='requested';return json({app_space_id:app.id,status:'requested',requested_at:stamp},202);}return json({error:errorCode,message:'fixture teardown error'},responseCode);}
  if(path.endsWith('/repositories'))return json([]);
  if(path.endsWith('/infra-spaces'))return json([{id:'infra',name:'Fixture',description:'fixture',network:'public',computes:['ecs-fargate'],deployable_computes:['ecs-fargate'],app_count:2}]);
  if(path.endsWith('/app-spaces'))return json([current,second]);
  if(path.endsWith('/'+app.id)){appGets++;if(holdGet){holdGetReady();await new Promise(resolve=>releaseGet=resolve);}if(appError)return json({error:'temporary',message:'fixture poll failure'},503);return json(current);}
  if(path.endsWith('/'+second.id))return json(second);
  if(path.endsWith('/analysis'))return json(analysis);
  if(path.endsWith('/plans'))return json({status:'done',compute:'ecs-fargate',plans:[{id:'port-plan',name:'포트 검증',summary:'fixture',pros:[],cons:[],template:'ecs-fargate/basic',values:port===undefined?{}:{container_port:port}}]});
  if(path.endsWith('/deployments')){bodies.push(req.postDataJSON());if(deployConflict){teardownStatus='requested';receipt=stamp;return json({error:'teardown_in_progress',message:'fixture conflict'},409);}return json(deployment,201);}
  if(path.endsWith('/resources'))return json([{address:'aws_ecs_service.web',type:'aws_ecs_service',action:'create',state:teardownStatus==='success'?'deleted':'done',reason:null,updated_at:stamp}]);
  if(path.endsWith('/dep-a'))return json(deployment);
  return json({message:'unexpected fixture request'},404);
 });
 const open=async()=>{await page.goto(`${base}/?source=api&app=${app.id}`);await page.getByRole('heading',{name:app.name,exact:true}).waitFor();};
 const teardown=()=>page.getByRole('button',{name:'앱 내리기',exact:true});
 const confirm=()=>page.once('dialog',dialog=>dialog.accept());
 const prepare=async()=>{await page.getByRole('button',{name:hasDeployment?'설정 변경 · 재분석':'배포',exact:true}).click();await page.getByRole('button',{name:'이 후보 선택',exact:true}).click();await page.getByRole('button',{name:'선택한 환경으로 구성안 조회',exact:true}).click();await page.getByRole('checkbox',{name:'설정값을 확인했습니다'}).check();};
 const deployButton=()=>page.getByRole('button',{name:'선택한 구성안으로 배포',exact:true});
 const reset=()=>{receipt=null;teardownStatus=null;finished=null;reason=null;responseCode=202;errorCode='';appError=false;deployConflict=false;};
 // Existing servers without teardown fields stay safely disabled.
 fieldKnown=false;await open();await teardown().waitFor();assert.ok(await teardown().isDisabled());await page.getByText(/내리기 API 연동 대기/).waitFor();
 fieldKnown=true;await open();await teardown().waitFor();page.once('dialog',dialog=>dialog.dismiss());await teardown().click();assert.equal(posts,0);
 confirm();await teardown().click();await page.getByText(/앱을 내리는 중/).waitFor();assert.equal(posts,1);assert.ok(await teardown().isDisabled());
 // Reload resumes polling. No new POST is sent; deployment controls remain blocked.
 await open();await page.getByText(/앱을 내리는 중/).waitFor();assert.equal(posts,1);assert.ok(await page.getByRole('button',{name:'설정 변경 · 재분석',exact:true}).isDisabled());assert.ok(await page.getByRole('button',{name:'새 버전 재배포',exact:true}).isDisabled());
 teardownStatus='success';finished=stamp;await page.getByText(/내림 완료/).waitFor({timeout:7000});assert.equal(await page.getByText(deployment.url,{exact:true}).count(),0);assert.ok(await teardown().isDisabled());await prepare();assert.ok(await deployButton().isEnabled());await page.locator('.resource-tree-node.state-deleted').waitFor();assert.equal(await page.getByRole('progressbar',{name:'자원 완료율'}).count(),0);
 await page.getByRole('region',{name:'앱 내리기',exact:true}).screenshot({path:'artifacts/teardown-receipt.png'});
 const terminalGets=appGets;await page.waitForTimeout(3300);assert.equal(appGets,terminalGets);
 await open();await page.getByText(/내림 완료/).waitFor();assert.equal(await page.getByText(deployment.url,{exact:true}).count(),0);
 // A newer deployment must not inherit the previous teardown's success lock or hidden URL.
 deployment.created_at='2026-10-02T10:00:00Z';await open();await teardown().waitFor();await page.getByText(deployment.url,{exact:true}).waitFor();assert.ok(await teardown().isEnabled());deployment.created_at=stamp;
 // Failed completion reveals reason and permits another request despite requested_at.
 reset();teardownStatus='requested';receipt=stamp;await open();await page.getByText(/앱을 내리는 중/).waitFor();teardownStatus='failed';reason='quota fixture';finished=stamp;await page.getByRole('alert').filter({hasText:'quota fixture'}).waitFor({timeout:7000});assert.ok(await teardown().isEnabled());const beforeRetry=posts;confirm();await teardown().click();await page.getByText(/앱을 내리는 중/).waitFor();assert.equal(posts,beforeRetry+1);
 // Poll errors retain locks and recover automatically when the server responds again.
 appError=true;await page.getByRole('alert').filter({hasText:'상태 조회 실패'}).waitFor({timeout:7000});assert.ok(await teardown().isDisabled());appError=false;teardownStatus='success';finished=stamp;await page.getByText(/내림 완료/).waitFor({timeout:7000});assert.equal(await page.getByRole('alert').filter({hasText:'상태 조회 실패'}).count(),0);
 for(const [status,code,text] of [[409,'not_deployed','실제 배포 기록'],[409,'deployment_in_progress','배포가 진행 중'],[502,'teardown_failed','다시 시도할 수'],[0,'network','처리 여부'],[404,'not_found','API 연동 대기']]){
  reset();responseCode=status;errorCode=code;await open();confirm();await teardown().click();await page.getByRole('alert').filter({hasText:text}).waitFor();await page.getByText(deployment.url,{exact:true}).waitFor();
  if(status===0){assert.ok(await teardown().isDisabled());await page.waitForTimeout(3300);assert.ok(await teardown().isDisabled());}
  if(status===502)assert.ok(await teardown().isEnabled());
 }
 // A confirmed dispatch failure permits retry even if the reconciliation GET fails.
 reset();responseCode=502;errorCode='teardown_failed';await open();appError=true;confirm();await teardown().click();await page.getByRole('alert').filter({hasText:'다시 시도할 수'}).waitFor();await teardown().click({trial:true});assert.ok(await teardown().isEnabled());appError=false;await page.waitForTimeout(3300);assert.ok(await teardown().isEnabled());
 // Both conflict paths recover into requested polling without issuing another POST.
 reset();responseCode=409;errorCode='teardown_in_progress';await open();confirm();await teardown().click();teardownStatus='requested';receipt=stamp;await page.getByText(/앱을 내리는 중/).first().waitFor();assert.ok(await teardown().isDisabled());teardownStatus='success';finished=stamp;await page.getByText(/내림 완료/).waitFor({timeout:7000});
 reset();await open();await prepare();deployConflict=true;await deployButton().click();await page.getByText(/앱을 내리는 중/).first().waitFor();assert.ok(await deployButton().isDisabled());teardownStatus='failed';reason='conflict fixture';await page.getByRole('alert').filter({hasText:'conflict fixture'}).waitFor({timeout:7000});assert.ok(await deployButton().isEnabled());assert.equal(await page.getByText('앱을 내리는 중입니다. 완료 후 다시 배포하세요.',{exact:true}).count(),0);bodies.length=0;
 // Late POST and GET responses must never overwrite another app's detail view.
 reset();hold=true;await open();confirm();const started=page.waitForRequest('**/teardown');await teardown().click();await started;
 await page.getByRole('button',{name:'앱 목록으로',exact:true}).click();
 // Main's new list toolbar and card navigation coexist with teardown cancellation.
 const list=page.locator('.app-space-list');
 await list.getByRole('button',{name:'새로고침',exact:true}).waitFor();
 assert.ok(await list.getByRole('button',{name:'애플리케이션 생성',exact:true}).isEnabled());
 assert.ok(await list.getByRole('button',{name:'애플리케이션 삭제',exact:true}).isEnabled());
 await list.screenshot({path:'artifacts/teardown-merged-app-list.png'});
 await page.getByRole('button',{name:second.name+' 상세 보기',exact:true}).click();release();hold=false;await page.getByRole('heading',{name:second.name,exact:true}).waitFor();assert.equal(await page.getByText(/앱을 내리는 중/).count(),0);
 reset();teardownStatus='requested';receipt=stamp;await open();await page.getByText(/앱을 내리는 중/).waitFor();holdGet=true;await new Promise(resolve=>holdGetReady=resolve);const inFlightGets=appGets;await page.waitForTimeout(3300);assert.equal(appGets,inFlightGets);await page.getByRole('button',{name:'앱 목록으로',exact:true}).click();await page.getByRole('button',{name:second.name+' 상세 보기',exact:true}).click();holdGet=false;releaseGet();await page.getByRole('heading',{name:second.name,exact:true}).waitFor();assert.equal(await page.getByText(/앱을 내리는 중/).count(),0);const afterNavigation=appGets;await page.waitForTimeout(3300);assert.equal(appGets,afterNavigation);
 reset();
 receipt=null;hasDeployment=false;
 for(const value of [3000,80,undefined,0,65536,'3000']){
  port=value;await open();await page.getByRole('button',{name:'배포',exact:true}).click();await page.getByRole('button',{name:'이 후보 선택',exact:true}).click();await page.getByRole('button',{name:'선택한 환경으로 구성안 조회',exact:true}).click();
  const review=page.getByRole('region',{name:'배포 변경 확인'});await review.getByRole('heading',{name:'포트 검증',exact:true}).waitFor();
  if(typeof value==='number'&&value>0&&value<=65535)await review.getByText(`컨테이너 포트: ${value}`,{exact:true}).waitFor();else await review.getByText(/서버 값 확인 필요/).waitFor();
  if(value===3000){await review.screenshot({path:'artifacts/container-port-review.png'});assert.equal(JSON.parse(await review.getByLabel('포트 검증 설정값').innerText()).container_port,3000);await review.getByRole('checkbox',{name:'설정값을 확인했습니다'}).check();await review.getByRole('button',{name:'선택한 구성안으로 배포',exact:true}).click();await page.getByRole('heading',{name:'배포 상태',exact:true}).waitFor();assert.deepEqual(bodies,[{compute:'ecs-fargate',plan_id:'port-plan'}]);}
 }
 assert.deepEqual(errors,[]);console.log('PASS followup: requested polling/reload, terminal success/failure/retry, stale success redeploy, both 409 conflicts, errors and app-switch cancellation, port preservation; browser mocks only');
}finally{await browser.close();}
