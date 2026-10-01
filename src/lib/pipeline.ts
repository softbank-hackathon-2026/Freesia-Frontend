import type { Analysis, AppSpace, Deployment } from './types.ts';
import type { RemoteRepository } from './meeting.ts';
export type AppPlan = {
  compute: string; repo_url: string; branch: string;
  template?: string; values?: Record<string, string | number | boolean>;
  path?: '.freesia/app/main.tf'; code?: string;
  status: 'source_generated' | 'template_ready';
};
export type DemoPipeline = {plan: AppPlan; phase: number; failCI: boolean; commit: string | null; version?: 2};
export const pipelineStepIds = ['queued','prepare','build','deploy','verify','done'];
export const pipelineSteps = ['대기','배포 준비','빌드','배포','정상 응답 확인','완료'];
export function makeAppPlan(app:AppSpace,compute:string,candidates:Analysis['candidates'],repositories:RemoteRepository[]):AppPlan {
 const repo=repositories.find(r=>r.repo_url===app.repo_url);
 if(!repo)throw new Error('통합에서 Repository를 먼저 등록하세요.');
 if(repo.branch!==app.branch)throw new Error('등록된 Repository 브랜치와 앱 브랜치가 다릅니다.');
 if(!candidates.some(c=>c.compute===compute && c.state!=='unsuitable') || !['ecs-fargate','lambda','ec2'].includes(compute))throw new Error('적합한 후보를 선택하세요.');
 return {compute,repo_url:repo.repo_url,branch:repo.branch,status:'template_ready',template:compute+'/basic',values:compute==='ec2'?{instance_type:'t3.micro',container_port:3000,health_check_path:'/'}:compute==='lambda'?{memory:512,timeout:30}:{cpu:256,memory:512,container_port:3000,health_check_path:'/'}};
}
export function startDemoDeployment(appId:string,plan:AppPlan,failCI:boolean):Deployment {
 return {id:`demo-dep-${crypto.randomUUID()}`,app_space_id:appId,compute:plan.compute,status:'pending',url:null,reason:null,created_at:new Date().toISOString(),demo_pipeline:{plan,phase:0,failCI,commit:null,version:2}};
}
export function advancePipeline(dep:Deployment):Deployment {
 const meta=dep.demo_pipeline;
 if(!meta || ['success','failed'].includes(dep.status))return dep;
 const phase=meta.phase+1;
 const legacy=meta.version!==2;
 const failed=meta.failCI && phase===(legacy?5:2);
 return {...dep,status:failed?'failed':phase===(legacy?7:5)?'success':phase>=(legacy?6:3)?'deploying':'building',url:null,reason:failed?'DEMO 빌드 검사 실패입니다. 외부 GitHub·AWS 작업은 실행되지 않았습니다.':null,demo_pipeline:{...meta,phase}};
}
export function demoStep(dep:Deployment):number {
 const p=dep.demo_pipeline;
 if(!p)return -1;
 return p.version===2?p.phase:dep.status==='success'?5:p.phase>=6?3:p.phase>=4?2:p.phase>=1?1:0;
}
export function validPipeline(value:unknown):value is DemoPipeline {
 if(!value || typeof value!=='object')return false;
 const p=value as DemoPipeline;
 return Number.isInteger(p.phase)&&p.phase>=0&&p.phase<=(p.version===2?5:7)&&typeof p.failCI==='boolean'&&(p.commit===null||typeof p.commit==='string')&&!!p.plan&&['ecs-fargate','lambda','ec2'].includes(p.plan.compute)&&typeof p.plan.branch==='string'&&typeof p.plan.repo_url==='string'&&/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(p.plan.repo_url)&&((p.plan.status==='source_generated'&&p.plan.path==='.freesia/app/main.tf'&&typeof p.plan.code==='string')||(p.plan.status==='template_ready'&&typeof p.plan.template==='string'&&!!p.plan.values&&typeof p.plan.values==='object'&&!Array.isArray(p.plan.values)));
}
