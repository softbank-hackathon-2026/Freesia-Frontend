import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sampleAnalysis } from '../src/lib/demo.ts';
import { makeAppPlan, startDemoDeployment, advancePipeline, validPipeline, pipelineSteps } from '../src/lib/pipeline.ts';
import type { Deployment } from '../src/lib/types.ts';
const repo = {visibility:'sample' as const,id:'repo', name:'repo',repo_url:'https://github.com/team/repo',branch:'main'};
const app = {id:'demo-app',name:'safe',repo_url:repo.repo_url,branch:'main',infra_id:'demo-public',created_at:'sample',latest_deployment_id:null};
test('demo template requires registered repository and eligible runtime',()=>{
 assert.throws(()=>makeAppPlan(app,'lambda',sampleAnalysis.candidates,[]),/등록/);
 const plan=makeAppPlan(app,'lambda',sampleAnalysis.candidates,[repo]);
 assert.equal(plan.template,'lambda/basic'); assert.equal(plan.values?.memory,512); assert.equal(plan.code,undefined);
 assert.throws(()=>makeAppPlan({...app,branch:'other'},'lambda',sampleAnalysis.candidates,[repo]),/브랜치/);
 assert.throws(()=>makeAppPlan(app,'unknown',sampleAnalysis.candidates,[repo]),/후보/);
});
test('six stage demo retains selected configuration and never invents a commit',()=>{
 const plan=makeAppPlan(app,'lambda',sampleAnalysis.candidates,[repo]);
 let dep=startDemoDeployment(app.id,plan,true);
 for(let i=0;i<2;i++)dep=advancePipeline(dep);
 assert.equal(dep.status,'failed'); assert.equal(dep.demo_pipeline?.phase,2);
 dep=startDemoDeployment(app.id,plan,false);
 for(let i=0;i<5;i++)dep=advancePipeline(dep);
 assert.equal(pipelineSteps.length,6); assert.equal(dep.status,'success'); assert.equal(dep.demo_pipeline?.commit,null);
 assert.ok(validPipeline(dep.demo_pipeline)); assert.deepEqual(dep.demo_pipeline?.plan,plan);
});
test('legacy saved Terraform records remain readable and can resume without rewriting storage',()=>{
 const legacy={plan:{compute:'lambda',repo_url:repo.repo_url,branch:'main',path:'.freesia/app/main.tf' as const,code:'sample',status:'source_generated' as const},phase:4,failCI:false,commit:'DEMO-old'};
 assert.ok(validPipeline(legacy));
 let dep:Deployment={...startDemoDeployment(app.id,legacy.plan,false),demo_pipeline:legacy};
 for(let i=0;i<3;i++)dep=advancePipeline(dep);
 assert.equal(dep.status,'success'); assert.equal(dep.demo_pipeline?.phase,7);
});
