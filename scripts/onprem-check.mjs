import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

// Controlled API responses only. No real deployment or backend writes.
const base = process.env.ONPREM_CHECK_URL || 'http://localhost:5185';
const browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const stamp = '2026-10-04T01:15:58Z';
const infra = {id:'vm-codex',name:'On-premises fixture',provider:'onprem',network:'vm',description:'Fixture',computes:['onprem'],deployable_computes:['onprem'],app_count:1};
const app = {id:'onprem-check',name:'Shop API fixture',repo_url:'https://github.com/softbank-hackathon-2026/shop-api',branch:'main',infra_id:infra.id,created_at:stamp,latest_deployment_id:null};
const analysis = {status:'done',requirements:['Node.js'],evidence:[],candidates:[{compute:'onprem',state:'selected',reason:'VM runtime',cons:[]}],mascot_message:null};
const plan = {id:'onprem-plan',name:'VM configuration',summary:'Ansible values',template:'onprem',pros:[],cons:[],values:{runtime:'node',start_command:'node server.js',app_port:8080}};
const dep = {id:'onprem-deployment',app_space_id:app.id,compute:'onprem',status:'success',reason:null,url:'http://192.0.2.10:8080',plan_id:plan.id,created_at:stamp,commit_sha:'a'.repeat(40)};
const metrics = {status:'unsupported',compute:'onprem',message:'아직 모니터링을 지원하지 않습니다.',cpu_percent:null,memory_percent:null,response_time_ms:null,request_count:null,error_count:null,measured_at:null};
const task = (address,state,extra={})=>({address,type:'ansible_task',action:'create',state,reason:null,updated_at:stamp,...extra});
const results=[];
try {
  await mkdir('artifacts',{recursive:true});
  const page = await browser.newPage({viewport:{width:1440,height:1050}});
  page.setDefaultTimeout(12000);
  let analyzed=false, planned=false, latest=null, resources=[], resourceError=false;
  const requests=[], unexpected=[], errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',async route=>{
    const req=route.request(), path=new URL(req.url()).pathname, method=req.method();
    requests.push({path,method,body:req.postData()?req.postDataJSON():null});
    const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
    if(path==='/api/infra-spaces')return json([infra]);
    if(path==='/api/infra-spaces/'+infra.id)return json(infra);
    if(path==='/api/repositories')return json([]);
    if(path==='/api/app-spaces')return json([{...app,latest_deployment_id:latest}]);
    if(path==='/api/app-spaces/'+app.id)return json({...app,latest_deployment_id:latest});
    if(path.endsWith('/analysis')){if(method==='POST')analyzed=true;return analyzed?json(analysis):json({error:'analysis_not_found',message:'분석 없음'},404);}
    if(path.endsWith('/plans')){if(method==='POST')planned=true;return planned?json({status:'done',compute:'onprem',plans:[plan]}):json({error:'not_found',message:'구성안 없음'},404);}
    if(path.endsWith('/deployments')&&method==='POST'){latest=dep.id;return json({...dep,status:'pending'},201);}
    if(path==='/api/deployments/'+dep.id)return json(dep);
    if(path.endsWith('/events'))return route.fulfill({status:200,contentType:'text/event-stream',body:'event: progress\ndata: '+JSON.stringify({status:dep.status,step:dep.status==='success'?'done':'deploy',progress:dep.status==='success'?100:60,message:'Fixture deployment',url:dep.url,at:stamp})+'\n\n'});
    if(path.endsWith('/resources'))return resourceError?json({error:'temporary',message:'작업 조회 일시 실패'},503):json(resources);
    if(path.endsWith('/metrics'))return json(metrics);
    if(path.endsWith('/redeploy-context'))return json({app_space_id:app.id,repo_url:app.repo_url,branch:'main',source_deployment_id:dep.id,source_commit_sha:'a'.repeat(40),target_commit_sha:'b'.repeat(40),compute:'onprem',plan});
    unexpected.push({path,method});return json({error:'unexpected',message:path},404);
  });
  await page.goto(base+'/?source=api&app='+app.id);
  await page.getByRole('button',{name:'코드 분석 시작',exact:true}).click();

  const candidate=page.locator('.candidate').filter({hasText:'VM runtime'});
  await candidate.getByText('On-premises',{exact:true}).waitFor();
  assert.equal(await candidate.locator('img').getAttribute('src'),'/providers/on-premise.png');
  await candidate.getByRole('button',{name:'이 후보 선택',exact:true}).click();
  await page.getByRole('button',{name:'선택한 환경으로 구성안 조회',exact:true}).click();
  await page.getByText('실행 환경: On-premises',{exact:true}).waitFor();
  await page.getByRole('checkbox',{name:'설정값을 확인했습니다',exact:true}).check();
  await page.getByRole('button',{name:'선택한 구성안으로 배포',exact:true}).click();
  await page.getByRole('heading',{name:'Ansible 작업 현황',exact:true}).waitFor();
  await page.getByText('아직 수신된 작업이 없습니다. Ansible 작업 콜백을 기다리고 있습니다.',{exact:true}).waitFor();
  assert.deepEqual(requests.filter(r=>r.path.endsWith('/plans')&&r.method==='POST').at(-1).body,{compute:'onprem'});
  assert.deepEqual(requests.filter(r=>r.path.endsWith('/deployments')&&r.method==='POST').at(-1).body,{compute:'onprem',plan_id:plan.id});
  results.push('analysis/plan/deploy use the existing endpoints with onprem and reviewed plan_id; callback-empty state');
  const tree=page.getByRole('region',{name:'Ansible 작업 상태',exact:true});
  resources=[task('Gathering Facts','done'),task('Install Node.js runtime','in_progress'),task('Start app service','pending'),task('Verify app answers','failed',{reason:'Health check timed out'}),task('Remove old release','deleted'),task('Future node','pending',{type:'future_resource'})];
  await tree.getByRole('button',{name:'작업 상태 다시 조회',exact:true}).click();
  await tree.getByText('Install Node.js runtime',{exact:true}).first().waitFor();
  assert.equal(await tree.locator('.resource-tree-node').count(),6);
  assert.equal(await tree.locator('.state-deleted').count(),1);
  assert.match(await tree.innerText(),/Ansible 작업/);
  assert.match(await tree.innerText(),/기타/);
  assert.match(await tree.innerText(),/전체 배포 진행률 아님/);
  const failed=tree.locator('details').filter({hasText:'Verify app answers'});
  await failed.locator('summary').click();
  await failed.getByText('Health check timed out',{exact:true}).waitFor();
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:1000});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'viewport must not overflow');
    const node=tree.locator('summary').filter({hasText:'Install Node.js runtime'});
    assert.ok(await node.evaluate(el=>el.scrollWidth<=el.clientWidth),'full task names wrap within nodes');
    await tree.screenshot({path:'artifacts/onprem-tree-'+width+'.png'});
  }
  results.push('full dotted task names; mixed known/unknown types; all five states; failure details; desktop/mobile layout');
  resourceError=true;
  await tree.getByRole('button',{name:'작업 상태 다시 조회',exact:true}).click();
  await tree.getByRole('alert').waitFor();
  resourceError=false;
  await tree.getByRole('button',{name:'작업 상태 다시 조회',exact:true}).click();
  await tree.locator('.resource-tree-node').first().waitFor();
  await page.getByRole('tab',{name:'모니터링',exact:true}).click();
  await page.getByText(metrics.message,{exact:true}).waitFor();
  assert.equal(await page.getByRole('alert').count(),0);
  assert.equal(await page.locator('.metrics meter').count(),0);
  await page.screenshot({path:'artifacts/onprem-unsupported-metrics.png',fullPage:true});
  await page.getByRole('button',{name:'배포 관리',exact:true}).click();
  await page.getByRole('button',{name:/^새 버전 재배포/}).click();
  const dialog=page.getByRole('dialog',{name:'새 버전 재배포',exact:true});
  await dialog.getByLabel('재사용할 설정값').waitFor();
  assert.equal(await dialog.getByRole('alert').count(),0);
  assert.match(await dialog.innerText(),/bbbbbbbb/);
  await dialog.getByRole('button',{name:'취소',exact:true}).click();
  assert.equal(requests.filter(r=>r.path.endsWith('/redeployments')||r.path.endsWith('/teardown')).length,0);
  results.push('resource fetch retry; unsupported metrics accepted with no fake metrics; onprem redeploy review/cancel without mutations');
  assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);
  await writeFile('artifacts/onprem-results.json',JSON.stringify({status:'passed',results},null,2));
  console.log('PASS onprem browser:',results);
} finally {await browser.close();}
