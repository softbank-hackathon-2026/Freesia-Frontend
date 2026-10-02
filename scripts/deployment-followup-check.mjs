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
let fieldKnown=true,receipt=null,responseCode=202,errorCode='',posts=0,port=3000,hasDeployment=true,hold=false,release;
const bodies=[],errors=[];
try {
 await mkdir('artifacts',{recursive:true});
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.EventSource=class extends window.EventTarget{constructor(){super();setTimeout(()=>this.dispatchEvent(new window.MessageEvent('progress',{data:JSON.stringify({status:'success',step:'done',message:'fixture complete',progress:100,url:'https://sample.example.test',at:'2026-10-02T09:00:00Z'})})),10);}close(){}};});
 await page.route('**/api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  const json=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
  const current={...app,latest_deployment_id:hasDeployment?'dep-a':null,...(fieldKnown?{teardown_requested_at:receipt}:{})};if(!fieldKnown)delete current.teardown_requested_at;
  if(path.endsWith('/teardown')){posts++;if(responseCode===0)return route.abort('failed');if(hold)await new Promise(resolve=>release=resolve);if(responseCode===202){receipt=stamp;return json({app_space_id:app.id,status:'requested',requested_at:stamp},202);}return json({error:errorCode,message:'fixture teardown error'},responseCode);}
  if(path.endsWith('/repositories'))return json([]);
  if(path.endsWith('/infra-spaces'))return json([{id:'infra',name:'Fixture',description:'fixture',network:'public',computes:['ecs-fargate'],deployable_computes:['ecs-fargate'],app_count:2}]);
  if(path.endsWith('/app-spaces'))return json([current,second]);
  if(path.endsWith('/'+app.id))return json(current);
  if(path.endsWith('/'+second.id))return json(second);
  if(path.endsWith('/analysis'))return json(analysis);
  if(path.endsWith('/plans'))return json({status:'done',compute:'ecs-fargate',plans:[{id:'port-plan',name:'포트 검증',summary:'fixture',pros:[],cons:[],template:'ecs-fargate/basic',values:port===undefined?{}:{container_port:port}}]});
  if(path.endsWith('/deployments')){bodies.push(req.postDataJSON());return json(deployment,201);}
  if(path.endsWith('/resources'))return json([]);
  if(path.endsWith('/dep-a'))return json(deployment);
  return json({message:'unexpected fixture request'},404);
 });
 const open=async()=>{await page.goto(`${base}/?source=api&app=${app.id}`);await page.getByRole('heading',{name:app.name,exact:true}).waitFor();};
 const teardown=()=>page.getByRole('button',{name:'앱 내리기',exact:true});
 fieldKnown=false;await open();await teardown().waitFor({timeout:3000});assert.ok(await teardown().isDisabled());await page.getByText(/내리기 API 연동 대기/).waitFor();
 fieldKnown=true;await open();await teardown().waitFor();
 page.once('dialog',dialog=>dialog.dismiss());await teardown().click();assert.equal(posts,0);
 page.once('dialog',dialog=>dialog.accept());await teardown().click();await page.getByText(/내리기 요청 접수/).first().waitFor();assert.equal(posts,1);assert.ok(await teardown().isDisabled());assert.ok((await page.locator('body').innerText()).includes(deployment.url));await page.getByText(stamp,{exact:false}).first().waitFor();
 await open();await page.getByText(/내리기 요청 접수/).first().waitFor();assert.ok(await teardown().isDisabled());assert.equal(posts,1);
 await page.getByRole('button',{name:'배포',exact:true}).click();await page.getByRole('button',{name:'이 후보 선택',exact:true}).click();await page.getByRole('button',{name:'선택한 환경으로 구성안 조회',exact:true}).click();await page.getByRole('checkbox',{name:'설정값을 확인했습니다'}).check();assert.ok(await page.getByRole('button',{name:'선택한 구성안으로 배포',exact:true}).isDisabled());assert.deepEqual(bodies,[]);
 await page.getByRole('region',{name:'앱 내리기',exact:true}).screenshot({path:'artifacts/teardown-receipt.png'});
 for(const [status,code,text] of [[409,'not_deployed','실제 배포 기록'],[409,'deployment_in_progress','배포가 진행 중'],[502,'teardown_failed','처리 여부'],[0,'network','처리 여부'],[404,'not_found','API 연동 대기']]){
  receipt=null;responseCode=status;errorCode=code;await open();page.once('dialog',dialog=>dialog.accept());await teardown().click();await page.getByRole('alert').filter({hasText:text}).waitFor();assert.ok((await page.locator('body').innerText()).includes(deployment.url));if(status===502||status===0){assert.ok(await teardown().isDisabled());const count=posts;await page.getByRole('button',{name:'앱 목록으로',exact:true}).click();await page.getByRole('button',{name:app.name+' 상세 보기',exact:true}).click();await teardown().waitFor();assert.ok(await teardown().isDisabled());assert.equal(posts,count);}
 }
 receipt=null;responseCode=202;hold=true;await open();page.once('dialog',dialog=>dialog.accept());const started=page.waitForRequest('**/teardown');await teardown().click();await started;
 await page.getByRole('button',{name:'앱 목록으로',exact:true}).click();await page.getByRole('button',{name:second.name+' 상세 보기',exact:true}).click();release();hold=false;await page.getByRole('heading',{name:second.name,exact:true}).waitFor();assert.equal(await page.getByText(/내리기 요청 접수/).count(),0);
 receipt=null;hasDeployment=false;
 for(const value of [3000,80,undefined,0,65536,'3000']){
  port=value;await open();await page.getByRole('button',{name:'배포',exact:true}).click();await page.getByRole('button',{name:'이 후보 선택',exact:true}).click();await page.getByRole('button',{name:'선택한 환경으로 구성안 조회',exact:true}).click();
  const review=page.getByRole('region',{name:'배포 변경 확인'});await review.getByRole('heading',{name:'포트 검증',exact:true}).waitFor();
  if(typeof value==='number'&&value>0&&value<=65535)await review.getByText(`컨테이너 포트: ${value}`,{exact:true}).waitFor();else await review.getByText(/서버 값 확인 필요/).waitFor();
  if(value===3000){await review.screenshot({path:'artifacts/container-port-review.png'});assert.equal(JSON.parse(await review.getByLabel('포트 검증 설정값').innerText()).container_port,3000);await review.getByRole('checkbox',{name:'설정값을 확인했습니다'}).check();await review.getByRole('button',{name:'선택한 구성안으로 배포',exact:true}).click();await page.getByRole('heading',{name:'배포 상태',exact:true}).waitFor();assert.deepEqual(bodies,[{compute:'ecs-fargate',plan_id:'port-plan'}]);}
 }
 assert.deepEqual(errors,[]);console.log('PASS followup: port preservation, missing/invalid port, teardown unavailable/cancel/receipt/reload/errors/navigation; browser mocks only');
}finally{await browser.close();}
