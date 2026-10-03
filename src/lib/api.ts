import type { Analysis, AppLogs, AppMetrics, AppSpace, AppSpaceCreate, Deployment, DeploymentEvent, InfraSpace, Repository, DeploymentResource, PlanSet, TeardownReceipt } from "./types.ts";

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
const strings = (value: unknown) => Array.isArray(value) && value.every(item => typeof item === "string");
const nullableString = (value: unknown) => value === null || typeof value === "string";
const fields = (v: Record<string, unknown>, keys: string[]) => keys.every(key => typeof v[key] === "string");
function infraShape(value: unknown): boolean {
  const v = record(value);
  return !!v && fields(v,["id","name","description"]) && ["public","private","ha","multi-az","db-isolated"].includes(String(v.network)) && strings(v.computes) && (v.deployable_computes === undefined || strings(v.deployable_computes)) && typeof v.app_count === "number";
}
function repositoryShape(value: unknown): boolean {
  const v = record(value);
  return !!v && fields(v,["id","name","repo_url","branch","created_at"]);
}
function appShape(value: unknown): boolean {
  const v = record(value);
  return !!v && fields(v,["id","name","repo_url","branch","infra_id","created_at"]) && nullableString(v.latest_deployment_id)
    && (v.teardown_status === undefined || v.teardown_status === null || (typeof v.teardown_status === "string" && ["requested","success","failed"].includes(v.teardown_status)))
    && ["teardown_requested_at","teardown_finished_at","teardown_reason"].every(key => v[key] === undefined || nullableString(v[key]));
}
function deploymentShape(value: unknown): boolean {
  const v = record(value);
  return !!v && fields(v,["id","app_space_id","compute","created_at"]) && ["pending","building","deploying","success","failed"].includes(String(v.status)) && nullableString(v.url) && nullableString(v.reason);
}
function analysisShape(value: unknown): boolean {
  const v = record(value);
  return !!v && ["pending","running","done","failed"].includes(String(v.status)) && strings(v.requirements) && nullableString(v.mascot_message) && Array.isArray(v.evidence) && v.evidence.every(item => {
    const e = record(item);
    return !!e && fields(e,["file","finding"]) && typeof e.certain === "boolean";
  }) && Array.isArray(v.candidates) && v.candidates.every(item => {
    const c = record(item);
    return !!c && fields(c,["compute","reason"]) && ["selected","alternative","unsuitable"].includes(String(c.state)) && strings(c.cons) && (c.evidence_files === undefined || strings(c.evidence_files));
  });
}
function resourceShape(value: unknown): boolean {
  const v = record(value);
  return !!v && fields(v,["address","type","action","updated_at"]) && ["pending","in_progress","done","failed","deleted"].includes(String(v.state)) && nullableString(v.reason);
}
function jsonValue(value: unknown): boolean {
  return value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)) || (Array.isArray(value) ? value.every(jsonValue) : !!record(value) && Object.values(value as object).every(jsonValue));
}
function planSetShape(value: unknown): boolean {
  const v = record(value);
  return !!v && ["pending","running","done","failed"].includes(String(v.status)) && typeof v.compute === "string" && Array.isArray(v.plans) && v.plans.every(item => {
    const p = record(item);
    return !!p && fields(p,["id","name","summary","template"]) && strings(p.pros) && strings(p.cons) && !!record(p.values) && jsonValue(p.values);
  });
}
function monitoringShape(v: Record<string, unknown>): boolean {
  return typeof v.status === "string" && ["ok","waiting","not_deployed","unsupported","error"].includes(v.status) && nullableString(v.message);
}
function logsShape(value: unknown): boolean {
  const v = record(value);
  return !!v && monitoringShape(v) && Array.isArray(v.lines) && v.lines.every(item => {
    const line = record(item);
    return !!line && fields(line,["at","message"]);
  });
}
function metricsShape(value: unknown): boolean {
  const v = record(value);
  return !!v && monitoringShape(v)
    && (v.compute === null || (typeof v.compute === "string" && ["ecs-fargate","lambda","ec2"].includes(v.compute)))
    && ["cpu_percent","memory_percent","response_time_ms","request_count","error_count"].every(key => v[key] === null || (typeof v[key] === "number" && Number.isFinite(v[key]) && v[key] >= 0))
    && ["request_count","error_count"].every(key => v[key] === null || Number.isInteger(v[key]))
    && nullableString(v.measured_at);
}
function validShape(path: string, value: unknown, post: boolean): boolean {
  if (/^\/app-spaces\/[^/]+\/metrics$/.test(path)) return metricsShape(value);
  if (/^\/app-spaces\/[^/]+\/logs(?:\?|$)/.test(path)) return logsShape(value);
  if (path.endsWith("/teardown")) {
    const v = record(value);
    return !!v && fields(v,["app_space_id","requested_at"]) && v.status === "requested";
  }
  if (/^\/deployments\/[^/]+\/resources$/.test(path)) return Array.isArray(value) && value.every(resourceShape);
  if (/\/plans(?:\?|$)/.test(path)) return planSetShape(value);
  if (path === "/repositories") return post ? repositoryShape(value) : Array.isArray(value) && value.every(repositoryShape);
  if (path === "/infra-spaces") return Array.isArray(value) && value.every(infraShape);
  if (path.startsWith("/infra-spaces/")) return infraShape(value);
  if (path.endsWith("/analysis")) return analysisShape(value);
  if (path.includes("/deployments")) return deploymentShape(value);
  if (path === "/app-spaces" && !post) return Array.isArray(value) && value.every(appShape);
  return appShape(value);
}
export class ApiError extends Error {
  status?: number;
  code?: string;
  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}
export function createApi(base: string, fetcher: typeof fetch = fetch) {
  const root = base.replace(/\/$/, "");
  async function request<T>(path: string, body?: unknown, method: "GET" | "POST" | "DELETE" = "GET", signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted();
    let response: Response;
    try {
      response = await fetcher(`${root}${path}`, { method, signal, ...(body === undefined ? {} : { headers:{"Content-Type":"application/json"}, body:JSON.stringify(body) }) });
    } catch {
      signal?.throwIfAborted();
      throw new ApiError("백엔드에 연결할 수 없습니다. 주소와 서버 상태를 확인하세요.");
    }
    signal?.throwIfAborted();
    if (method === "DELETE") {
      if (response.status === 204) return undefined as T;
      if (response.ok) throw new ApiError("백엔드 삭제 응답 형식이 올바르지 않습니다.", response.status, "invalid_response");
    }
    let data: unknown;
    try { data = await response.json(); }
    catch {
      signal?.throwIfAborted();
      throw new ApiError(response.ok ? "백엔드 응답이 JSON 형식이 아닙니다." : `요청 실패 (HTTP ${response.status})`, response.status);
    }
    signal?.throwIfAborted();
    if (!response.ok) {
      const error = record(data);
      throw new ApiError(typeof error?.message === "string" ? error.message : `요청 실패 (HTTP ${response.status})`, response.status, typeof error?.error === "string" ? error.error : undefined);
    }
    if ((path.endsWith("/teardown") && response.status !== 202) || !validShape(path, data, method === "POST")) throw new ApiError("백엔드 응답 형식이 올바르지 않습니다.",response.status,"invalid_response");
    return data as T;
  }
  const appPath = (id: string) => `/app-spaces/${encodeURIComponent(id)}`;
  const analyze = (id: string, signal?: AbortSignal) => request<Analysis>(`${appPath(id)}/analysis`,undefined,"POST",signal);
  const analysis = (id: string, signal?: AbortSignal) => request<Analysis>(`${appPath(id)}/analysis`,undefined,"GET",signal);
  async function pollUntilDone<T extends {status: Analysis["status"]}>(start:(signal:AbortSignal)=>Promise<T>, read:(signal:AbortSignal)=>Promise<T>, label:string, options:{signal?:AbortSignal;onUpdate?:(value:T)=>void;intervalMs?:number;timeoutMs?:number} = {}) {
      const controller = new AbortController();
      const cancel = () => controller.abort(options.signal?.reason);
      options.signal?.addEventListener("abort",cancel,{once:true});
      if (options.signal?.aborted) cancel();
      const deadline = setTimeout(() => controller.abort(new ApiError(`${label} 대기 시간이 초과되었습니다. 다시 시도하세요.`,undefined,"poll_timeout")),options.timeoutMs ?? 60_000);
      try {
        controller.signal.throwIfAborted();
        let value = await start(controller.signal);
        while (true) {
          controller.signal.throwIfAborted();
          options.onUpdate?.(value);
          if (value.status === "done" || value.status === "failed") return value;
          await new Promise<void>((resolve,reject) => {
            const abort = () => {clearTimeout(timer);reject(controller.signal.reason);};
            const timer = setTimeout(() => {controller.signal.removeEventListener("abort",abort);resolve();},options.intervalMs ?? 2_000);
            controller.signal.addEventListener("abort",abort,{once:true});
            if (controller.signal.aborted) abort();
          });
          controller.signal.throwIfAborted();
          value = await read(controller.signal);
        }
      } finally {
        clearTimeout(deadline);
        options.signal?.removeEventListener("abort",cancel);
      }
    }
  return {
    repositories: (signal?: AbortSignal) => request<Repository[]>("/repositories",undefined,"GET",signal),
    registerRepository: (body: {repo_url:string;branch:string}, signal?: AbortSignal) => request<Repository>("/repositories",body,"POST",signal),
    deleteRepository: (id:string, signal?:AbortSignal) => request<void>(`/repositories/${encodeURIComponent(id)}`,undefined,"DELETE",signal),
    infras: (signal?:AbortSignal) => request<InfraSpace[]>("/infra-spaces",undefined,"GET",signal),
    infra: (id:string, signal?:AbortSignal) => request<InfraSpace>(`/infra-spaces/${encodeURIComponent(id)}`,undefined,"GET",signal),
    apps: (signal?:AbortSignal) => request<AppSpace[]>("/app-spaces",undefined,"GET",signal),
    app: (id:string, signal?:AbortSignal) => request<AppSpace>(appPath(id),undefined,"GET",signal),
    metrics: (id:string, signal?:AbortSignal) => request<AppMetrics>(`${appPath(id)}/metrics`,undefined,"GET",signal),
    logs: (id:string, signal?:AbortSignal) => request<AppLogs>(`${appPath(id)}/logs?limit=100`,undefined,"GET",signal),
    deleteApp: (id:string, signal?:AbortSignal) => request<void>(appPath(id),undefined,"DELETE",signal),
    createApp: (body:AppSpaceCreate, signal?:AbortSignal) => request<AppSpace>("/app-spaces",body,"POST",signal),
    analyze,
    analysis,
    analyzeUntilDone: (id:string, options?:{signal?:AbortSignal;onUpdate?:(value:Analysis)=>void;intervalMs?:number;timeoutMs?:number}) => pollUntilDone(signal=>analyze(id,signal),signal=>analysis(id,signal),"분석",{...options, timeoutMs:options?.timeoutMs ?? 190_000}),
    analysisUntilDone: (id:string, options?:{signal?:AbortSignal;onUpdate?:(value:Analysis)=>void;intervalMs?:number;timeoutMs?:number}) => pollUntilDone(signal=>analysis(id,signal),signal=>analysis(id,signal),"분석",{...options, timeoutMs:options?.timeoutMs ?? 190_000}),
    plansUntilDone: (id:string,compute:string,options?:{signal?:AbortSignal;onUpdate?:(value:PlanSet)=>void;intervalMs?:number;timeoutMs?:number}) => pollUntilDone(signal=>request<PlanSet>(`${appPath(id)}/plans`,{compute},"POST",signal),signal=>request<PlanSet>(`${appPath(id)}/plans?compute=${encodeURIComponent(compute)}`,undefined,"GET",signal),"구성안",options),
    createPlans: (id:string,compute:string,signal?:AbortSignal) => request<PlanSet>(`${appPath(id)}/plans`,{compute},"POST",signal),
    plans: (id:string,compute:string,signal?:AbortSignal) => request<PlanSet>(`${appPath(id)}/plans?compute=${encodeURIComponent(compute)}`,undefined,"GET",signal),
    deploy: (id:string,compute:string,planId?:string,signal?:AbortSignal) => request<Deployment>(`${appPath(id)}/deployments`,{compute,...(planId ? {plan_id:planId} : {})},"POST",signal),
    teardown: async (id:string,signal?:AbortSignal) => {
      const receipt = await request<TeardownReceipt>(`${appPath(id)}/teardown`,undefined,"POST",signal);
      if (receipt.app_space_id !== id) throw new ApiError("내리기 응답의 앱이 요청과 다릅니다.",202,"invalid_response");
      return receipt;
    },
    deployment: (id:string,signal?:AbortSignal) => request<Deployment>(`/deployments/${encodeURIComponent(id)}`,undefined,"GET",signal),
    resources: (id:string,signal?:AbortSignal) => request<DeploymentResource[]>(`/deployments/${encodeURIComponent(id)}/resources`,undefined,"GET",signal),
  };
}
type Stream = { addEventListener:(name:string,listener:EventListener)=>void; close:()=>void };
export function watchDeployment(base:string,id:string,onProgress:(event:DeploymentEvent)=>void,onError:(message:string)=>void,open:(url:string)=>Stream = url=>new EventSource(url),onReconnect?:()=>void) {
  const source = open(`${base.replace(/\/$/,"")}/deployments/${encodeURIComponent(id)}/events`);
  let stopped = false;
  const close = () => { if (!stopped) {stopped=true;source.close();} };
  source.addEventListener("open",()=>{if (!stopped) onReconnect?.();});
  source.addEventListener("progress",((event:MessageEvent)=>{
    if (stopped) return;
    let value: DeploymentEvent;
    try {
      value = JSON.parse(event.data) as DeploymentEvent;
      if (!value || !["pending","building","deploying","success","failed"].includes(value.status) || !Number.isFinite(value.progress) || value.progress<0 || value.progress>100 || typeof value.message!=="string" || typeof value.step!=="string" || typeof value.at!=="string" || !nullableString(value.url)) throw new Error("invalid");
    } catch {close();onError("배포 이벤트 형식을 확인할 수 없습니다.");return;}
    onProgress(value);
    if (value.status==="success" || value.status==="failed") close();
  }) as EventListener);
  source.addEventListener("error",()=>{
    if (!stopped) onError("배포 상태 연결이 끊겼습니다. 자동으로 다시 연결합니다.");
  });
  return close;
}
