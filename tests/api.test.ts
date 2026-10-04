import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError, createApi, watchDeployment } from "../src/lib/api.ts";

test("uses exact FastAPI routes, methods and payloads", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const api = createApi("/api", async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(
      JSON.stringify(
        String(url).endsWith("/infra-spaces")
          ? []
          : String(url).includes("/infra-spaces/")
            ? {
                id: "i",
                name: "infra",
                description: "",
                network: "public",
                computes: [],
                app_count: 0,
              }
            : String(url).endsWith("/analysis")
              ? {
                  status: "done",
                  requirements: [],
                  evidence: [],
                  candidates: [],
                  mascot_message: null,
                }
              : String(url).includes("/deployments")
                ? {
                    id: "dep-1",
                    app_space_id: "app-1",
                    compute: "ecs-fargate",
                    status: "pending",
                    url: null,
                    reason: null,
                    created_at: "now",
                  }
                : String(url).endsWith("/app-spaces") && !init?.body
                  ? []
                  : {
                      id: "app-1",
                      name: "web",
                      repo_url: "https://github.com/o/r",
                      branch: "main",
                      infra_id: "i",
                      created_at: "now",
                      latest_deployment_id: null,
                    },
      ),
      { headers: { "Content-Type": "application/json" } },
    );
  });
  await api.infras();
  await api.infra("infra/a");
  await api.apps();
  await api.app("app-1");
  await api.createApp({
    name: "web",
    repo_url: "https://github.com/org/repo",
    branch: "main",
    infra_id: "i",
  });
  await api.analyze("app-1");
  await api.analysis("app-1");
  await api.deploy("app-1", "ecs-fargate");
  await api.deployment("dep-1");
  assert.deepEqual(
    calls.map((c) => [c.url, c.init?.method ?? "GET"]),
    [
      ["/api/infra-spaces", "GET"],
      ["/api/infra-spaces/infra%2Fa", "GET"],
      ["/api/app-spaces", "GET"],
      ["/api/app-spaces/app-1", "GET"],
      ["/api/app-spaces", "POST"],
      ["/api/app-spaces/app-1/analysis", "POST"],
      ["/api/app-spaces/app-1/analysis", "GET"],
      ["/api/app-spaces/app-1/deployments", "POST"],
      ["/api/deployments/dep-1", "GET"],
    ],
  );
  assert.deepEqual(JSON.parse(calls[4].init!.body as string), {
    name: "web",
    repo_url: "https://github.com/org/repo",
    branch: "main",
    infra_id: "i",
  });
  assert.deepEqual(JSON.parse(calls[7].init!.body as string), {
    compute: "ecs-fargate",
  });
  assert.equal(calls[5].init?.body, undefined);
});

test("sandbox creation omits infra selection and retains the server default for detail lookup", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const payload = { name: "sandbox-web", repo_url: "https://github.com/team/web", branch: "main" };
  const created = { ...payload, id: "sandbox-app", infra_id: "default/infra", created_at: "now", latest_deployment_id: null };
  const defaultInfra = { id: created.infra_id, name: "DefaultInfra", description: "", network: "public", computes: ["ecs-fargate"], deployable_computes: ["ecs-fargate"], app_count: 1 };
  const api = createApi("/api", async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(init?.method === "POST" ? created : defaultInfra), { status: init?.method === "POST" ? 201 : 200 });
  });
  const result = await api.createApp(payload);
  assert.deepEqual(result, created, "the backend's concrete infra_id remains in the app response");
  assert.deepEqual(await api.infra(result.infra_id), defaultInfra);
  assert.deepEqual(calls.map(call => [call.url, call.init?.method ?? "GET"]), [
    ["/api/app-spaces", "POST"],
    ["/api/infra-spaces/default%2Finfra", "GET"],
  ]);
  assert.deepEqual(JSON.parse(calls[0].init!.body as string), payload);
});

test("sandbox creation preserves the no_default_infra error code and server message", async () => {
  const message = "서버 계약 오류: DefaultInfra가 설정되지 않았습니다.";
  const api = createApi("/api", async () => new Response(JSON.stringify({ error: "no_default_infra", message }), { status: 400 }));
  await assert.rejects(api.createApp({ name: "sandbox-web", repo_url: "https://github.com/team/web", branch: "main" }), error => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 400);
    assert.equal(error.code, "no_default_infra");
    assert.equal(error.message, message);
    return true;
  });
});
test("surfaces structured HTTP, non-JSON and network errors without demo fallback", async () => {
  await assert.rejects(
    createApi(
      "",
      async () =>
        new Response(
          JSON.stringify({ error: "infra_not_found", message: "기반 없음" }),
          { status: 404 },
        ),
    ).infras(),
    /기반 없음/,
  );
  await assert.rejects(
    createApi(
      "",
      async () => new Response("<html>bad gateway</html>", { status: 502 }),
    ).infras(),
    /HTTP 502/,
  );
  await assert.rejects(
    createApi(
      "",
      async () => new Response("not json", { status: 200 }),
    ).infras(),
    /JSON/,
  );
  await assert.rejects(
    createApi("", async () => {
      throw new TypeError("offline");
    }).infras(),
    /연결/,
  );
});

test("named progress events close on terminal/malformed; transport failure preserves native reconnect", () => {
  let listener: ((event: MessageEvent) => void) | undefined;
  let errorListener: (() => void) | undefined;
  let closed = 0;
  const source = {
    addEventListener: (name: string, fn: EventListener) => {
      if (name === "progress") listener = fn as unknown as typeof listener;
      else if (name === "error") errorListener = fn as unknown as () => void;
    },
    close: () => {
      closed++;
    },
  };
  const seen: string[] = [];
  const errors: string[] = [];
  const cleanup = watchDeployment(
    "/api",
    "dep-1",
    (e) => seen.push(e.status),
    (e) => errors.push(e),
    () => source,
  );
  listener!(
    new MessageEvent("progress", {
      data: JSON.stringify({
        status: "building",
        progress: 30,
        step: "build",
        message: "build",
        url: null,
        at: "now",
      }),
    }),
  );
  listener!(
    new MessageEvent("progress", {
      data: JSON.stringify({
        status: "success",
        progress: 100,
        step: "done",
        message: "done",
        url: null,
        at: "now",
      }),
    }),
  );
  assert.deepEqual(seen, ["building", "success"]);
  assert.equal(closed, 1);
  cleanup();
  assert.equal(closed, 1);
  watchDeployment(
    "/api",
    "dep-2",
    () => {},
    (e) => errors.push(e),
    () => source,
  );
  listener!(new MessageEvent("progress", { data: "invalid" }));
  assert.equal(errors.length, 1);
  assert.equal(closed, 2);
  watchDeployment(
    "/api",
    "dep-3",
    () => {},
    (e) => errors.push(e),
    () => source,
  );
  errorListener!();
  assert.equal(errors.length, 2);
  assert.equal(closed, 2);
});

test("rejects malformed JSON shapes at the API boundary", async () => {
  for (const bad of [
    {},
    [{}],
    [
      {
        id: "i",
        name: "bad",
        description: "",
        network: "public",
        computes: "not-array",
        app_count: 0,
      },
    ],
  ]) {
    await assert.rejects(
      createApi("", async () => new Response(JSON.stringify(bad))).infras(),
      /応答|응답/,
    );
  }
  await assert.rejects(
    createApi(
      "",
      async () =>
        new Response(JSON.stringify({ status: "done", evidence: null })),
    ).analysis("x"),
    /응답/,
  );
});

test("Repository API uses registered records, exact mutations and empty DELETE 204", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const repository = { id: "repo/1", name: "team/web", repo_url: "https://github.com/team/web", branch: "main", created_at: "2026-10-02T00:00:00Z" };
  const api = createApi("/api/", async (url, init) => {
    calls.push({ url: String(url), init });
    if (init?.method === "DELETE") return new Response(null, {status:204});
    return new Response(JSON.stringify(init?.method === "POST" ? repository : [repository]), {status:init?.method === "POST" ? 201 : 200});
  });
  assert.deepEqual(await api.repositories(),[repository]);
  assert.deepEqual(await api.registerRepository({repo_url:repository.repo_url,branch:"main"}),repository);
  assert.equal(await api.deleteRepository(repository.id),undefined);
  assert.deepEqual(calls.map(call=>[call.url,call.init?.method]),[
    ["/api/repositories","GET"],["/api/repositories","POST"],["/api/repositories/repo%2F1","DELETE"],
  ]);
  assert.deepEqual(JSON.parse(calls[1].init!.body as string),{repo_url:repository.repo_url,branch:"main"});
  assert.equal(calls[2].init?.body,undefined);
});
test("Repository errors and malformed responses stay visible without synthetic records", async () => {
  for (const status of [404,409,422]) {
    const api = createApi("/api", async()=>new Response(JSON.stringify({error:"repository_error",message:"저장소 오류 "+status}),{status}));
    await assert.rejects(api.registerRepository({repo_url:"https://github.com/team/web",branch:"main"}),new RegExp(String(status)));
    await assert.rejects(api.deleteRepository("missing"),new RegExp(String(status)));
  }
  for (const value of [{},[{}],[{id:"r",name:"repo",repo_url:42,branch:"main",created_at:"now"}]]) {
    await assert.rejects(createApi("/api",async()=>new Response(JSON.stringify(value))).repositories(),/응답/);
  }
  await assert.rejects(createApi("/api",async()=>new Response(null,{status:204})).repositories(),/JSON|응답/);
});

test("analysis polls after one POST, supports cancellation and enforces deadline", async () => {
  const calls: string[] = [];
  const statuses = ["pending", "running", "done"];
  const seen: string[] = [];
  const api = createApi("/api", async (_url, init) => {
    calls.push(init!.method!);
    return new Response(JSON.stringify({ status: statuses.shift(), requirements: [], evidence: [], candidates: [], mascot_message: null }));
  });
  assert.equal((await api.analyzeUntilDone("a", { intervalMs: 1, timeoutMs: 1000, onUpdate: value => seen.push(value.status) })).status, "done");
  assert.deepEqual(calls, ["POST", "GET", "GET"]);
  assert.deepEqual(seen, ["pending", "running", "done"]);
  let aborted = false;
  const hanging = createApi("/api", (_url, init) => new Promise((_resolve, reject) => {
    init!.signal!.addEventListener("abort", () => { aborted = true; reject(init!.signal!.reason); }, { once: true });
  }));
  await assert.rejects(hanging.analyzeUntilDone("a", {timeoutMs: 5}), /시간/);
  assert.equal(aborted, true);
  const controller = new AbortController();
  const task = hanging.analyzeUntilDone("a", {signal:controller.signal});
  controller.abort();
  await assert.rejects(task, {name:"AbortError"});
});

test("resources and plan adapters preserve structured unsupported errors and exact payloads", async () => {
  const calls: { url:string; init?:RequestInit }[] = [];
  const resource = {address:"aws_lb.app",type:"aws_lb",action:"create",state:"in_progress",reason:null,updated_at:"now"};
  const planSet = {status:"done",compute:"ecs-fargate",plans:[{id:"p1",name:"small",summary:"sample",pros:[],cons:[],template:"ecs-basic",values:{cpu:256,env:{MODE:"test"}}}]};
  const api = createApi("/api", async(url,init)=>{
    calls.push({url:String(url),init});
    return new Response(JSON.stringify(String(url).endsWith("/resources")?[resource]:planSet));
  });
  assert.deepEqual(await api.resources("dep/a"),[resource]);
  assert.deepEqual(await api.createPlans("app/a","ecs-fargate"),planSet);
  assert.deepEqual(await api.plans("app/a","ecs-fargate"),planSet);
  assert.equal(calls[0].url,"/api/deployments/dep%2Fa/resources");
  assert.deepEqual(JSON.parse(calls[1].init!.body as string),{compute:"ecs-fargate"});
  assert.equal(calls[2].url,"/api/app-spaces/app%2Fa/plans?compute=ecs-fargate");
  await assert.rejects(createApi("",async()=>new Response(JSON.stringify({error:"not_implemented",message:"연동 대기"}),{status:501})).createPlans("a","ec2"), error => error instanceof Error && "status" in error && error.status===501 && "code" in error && error.code==="not_implemented");
  await assert.rejects(createApi("",async()=>new Response(JSON.stringify([{...resource,state:"magic"}]))).resources("a"),/응답/);
});


test("analysis failure terminates polling and abort during delay sends no GET or late update", async () => {
  const failed = {status:"failed",requirements:[],evidence:[],candidates:[],mascot_message:"분석 실패"};
  let calls=0;
  assert.equal((await createApi("",async()=>{calls++;return new Response(JSON.stringify(failed));}).analyzeUntilDone("x")).status,"failed");
  assert.equal(calls,1);
  const controller = new AbortController();
  const statuses:string[]=[];
  const api=createApi("",async()=>{calls++;return new Response(JSON.stringify({...failed,status:"running"}));});
  const result=api.analyzeUntilDone("x",{signal:controller.signal,intervalMs:1000,onUpdate:value=>{statuses.push(value.status);queueMicrotask(()=>controller.abort());}});
  await assert.rejects(result,{name:"AbortError"});
  assert.equal(calls,2);
  assert.deepEqual(statuses,["running"]);
});

test("SSE transport failure recovers on open and ignores late events after cleanup",()=>{
  const listeners:Record<string,EventListener>={};
  let closed=0,recovered=0,progress=0;
  const errors:string[]=[];
  const stop=watchDeployment("/api","x",()=>progress++,message=>errors.push(message),()=>({addEventListener:(name,fn)=>{listeners[name]=fn;},close:()=>{closed++;}}),()=>recovered++);
  listeners.error(new Event("error"));
  assert.equal(closed,0);
  listeners.open(new Event("open"));
  assert.equal(recovered,1);
  stop();stop();
  listeners.open(new Event("open"));
  listeners.error(new Event("error"));
  listeners.progress(new MessageEvent("progress",{data:JSON.stringify({status:"success",progress:100,step:"done",message:"done",at:"now",url:null})}));
  assert.equal(closed,1);
  assert.equal(recovered,1);
  assert.equal(progress,0);
  assert.equal(errors.length,1);
});

test("old and new infrastructure enums and candidate evidence remain supported", async()=>{
  for(const network of ["public","private","ha","multi-az","db-isolated"]){
    const data={id:"i",name:"i",description:"",network,computes:[],app_count:0};
    assert.deepEqual(await createApi("",async()=>new Response(JSON.stringify([data]))).infras(),[data]);
  }
  const data={status:"done",requirements:[],evidence:[],mascot_message:null,candidates:[{compute:"ecs-fargate",state:"selected",reason:"yes",cons:[],evidence_files:["Dockerfile"]}]};
  assert.deepEqual(await createApi("",async()=>new Response(JSON.stringify(data))).analysis("x"),data);
});

test("plan generation polls one POST then GET until review is ready",async()=>{
  const calls:string[]=[];
  const api=createApi("/api",async(_url,init)=>{
    calls.push(init!.method!);
    return new Response(JSON.stringify({status:calls.length===1?"running":"done",compute:"ec2",plans:[]}));
  });
  assert.equal((await api.plansUntilDone("a","ec2",{intervalMs:1})).status,"done");
  assert.deepEqual(calls,["POST","GET"]);
});

test("deployment sends the reviewed plan identity and abort never becomes connection error",async()=>{
  let body:unknown;
  const data={id:"d",app_space_id:"a",compute:"ec2",status:"pending",url:null,reason:null,created_at:"now"};
  const api=createApi("",async(_url,init)=>{body=JSON.parse(String(init!.body));return new Response(JSON.stringify(data));});
  await api.deploy("a","ec2","plan-1");
  assert.deepEqual(body,{compute:"ec2",plan_id:"plan-1"});
  const controller=new AbortController();controller.abort();
  await assert.rejects(api.resources("d",controller.signal),{name:"AbortError"});
});

test("deployable computes remains optional but invalid readiness metadata is rejected",async()=>{
  const infra={id:"i",name:"i",description:"",network:"public",computes:["ecs-fargate","lambda","ec2"],app_count:0};
  const legacy=await createApi("",async()=>new Response(JSON.stringify([infra]))).infras();
  assert.equal(legacy[0].deployable_computes,undefined);
  for(const deployable_computes of [[],["ecs-fargate"]]){
    const data={...infra,deployable_computes};
    assert.deepEqual(await createApi("",async()=>new Response(JSON.stringify([data]))).infras(),[data]);
  }
  for(const deployable_computes of [null,"ecs-fargate",[42]]){
    await assert.rejects(createApi("",async()=>new Response(JSON.stringify([{...infra,deployable_computes}]))).infras(),/응답/);
  }
});

test("analysis deadline is 190 seconds while plan deadline remains 60 seconds",async(t)=>{
  t.mock.timers.enable({apis:["setTimeout"]});
  let aborted=0;
  const api=createApi("",(_url,init)=>new Promise((_resolve,reject)=>{
    init!.signal!.addEventListener("abort",()=>{aborted++;reject(init!.signal!.reason);},{once:true});
  }));
  const analysis=assert.rejects(api.analyzeUntilDone("a"),/시간/);
  t.mock.timers.tick(189_999);
  assert.equal(aborted,0);
  t.mock.timers.tick(1);
  await analysis;
  assert.equal(aborted,1);
  const plans=assert.rejects(api.plansUntilDone("a","ecs-fargate"),/시간/);
  t.mock.timers.tick(59_999);
  assert.equal(aborted,1);
  t.mock.timers.tick(1);
  await plans;
  assert.equal(aborted,2);
});


test("teardown accepts only a matching request receipt and preserves abort/errors", async () => {
  const receipt = { app_space_id: "app/a", status: "requested", requested_at: "2026-10-02T07:00:00Z" };
  const calls: {url:string; init?:RequestInit}[]=[];
  const api=createApi("/api",async(url,init)=>{calls.push({url:String(url),init});return new Response(JSON.stringify(receipt),{status:202});});
  assert.deepEqual(await api.teardown("app/a"),receipt);
  assert.equal(calls[0].url,"/api/app-spaces/app%2Fa/teardown");
  assert.equal(calls[0].init?.method,"POST");
  assert.equal(calls[0].init?.body,undefined);
  for (const data of [{...receipt,status:"done"},{...receipt,app_space_id:"another"},{...receipt,requested_at:null}]) {
    await assert.rejects(createApi("/api",async()=>new Response(JSON.stringify(data),{status:202})).teardown("app/a"), /응답/);
  }
  await assert.rejects(createApi("/api",async()=>new Response(JSON.stringify(receipt),{status:200})).teardown("app/a"), /응답/);
  for(const [status,code] of [[409,"not_deployed"],[409,"deployment_in_progress"],[409,"teardown_in_progress"],[502,"teardown_failed"],[404,"http_error"]] as const) {
    await assert.rejects(createApi("/api",async()=>new Response(JSON.stringify({error:code,message:"server reason"}),{status})).teardown("app/a"),{status,code,message:"server reason"});
  }
  const controller=new AbortController();controller.abort();
  let fetched=false;
  await assert.rejects(createApi("/api",async()=>{fetched=true;return new Response();}).teardown("a",controller.signal),{name:"AbortError"});
  assert.equal(fetched,false);
});

test("app teardown receipt is optional for older backends but validated when supplied", async()=>{
  const app={id:"a",name:"app",repo_url:"https://github.com/a/b",branch:"main",infra_id:"i",created_at:"now",latest_deployment_id:null};
  for(const extra of [{},{teardown_requested_at:null},{teardown_requested_at:"2026-10-02T07:00:00Z"}]) {
    const data={...app,...extra};
    assert.deepEqual(await createApi("/api",async()=>new Response(JSON.stringify(data))).app("a"),data);
  }
  await assert.rejects(createApi("/api",async()=>new Response(JSON.stringify({...app,teardown_requested_at:42}))).app("a"),/응답/);
});

test("plan container port is preserved and deployment uses the reviewed plan identity",async()=>{
  const plan={status:"done",compute:"ecs-fargate",plans:[{id:"port-plan",name:"port plan",summary:"",pros:[],cons:[],template:"ecs-fargate/basic",values:{container_port:3000}}]};
  let posted:unknown;
  const api=createApi("/api",async(url,init)=>{
    if(String(url).endsWith("/plans"))return new Response(JSON.stringify(plan));
    posted=JSON.parse(String(init?.body));
    return new Response(JSON.stringify({id:"d",app_space_id:"a",compute:"ecs-fargate",status:"pending",url:null,reason:null,created_at:"now"}));
  });
  const result=await api.createPlans("a","ecs-fargate");
  assert.equal(result.plans[0].values.container_port,3000);
  await api.deploy("a",result.compute,result.plans[0].id);
  assert.deepEqual(posted,{compute:"ecs-fargate",plan_id:"port-plan"});
});


test("app teardown lifecycle validates status and nullable metadata on detail and list", async()=>{
  const app={id:"a",name:"app",repo_url:"https://github.com/a/b",branch:"main",infra_id:"i",created_at:"now",latest_deployment_id:null};
  for(const status of [null,"requested","success","failed"]) {
    const data={...app,teardown_status:status,teardown_requested_at:"2026-10-02T07:00:00Z",teardown_finished_at:status===null?null:"2026-10-02T07:03:00Z",teardown_reason:status==="failed"?"Destroy failed":null};
    assert.deepEqual(await createApi("/api",async()=>new Response(JSON.stringify(data))).app("a"),data);
    assert.deepEqual(await createApi("/api",async()=>new Response(JSON.stringify([data]))).apps(),[data]);
  }
  for(const extra of [{teardown_status:"done"},{teardown_status:1},{teardown_status:{}},{teardown_finished_at:42},{teardown_reason:false}]) {
    const data={...app,...extra};
    await assert.rejects(createApi("/api",async()=>new Response(JSON.stringify(data))).app("a"),/응답/);
    await assert.rejects(createApi("/api",async()=>new Response(JSON.stringify([data]))).apps(),/응답/);
  }
});


test("app deletion requires empty 204, encodes IDs and preserves conflict codes", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const api = createApi("/api", async (url, init) => {
    calls.push({url: String(url), init});
    return new Response(null, {status:204});
  });
  const controller = new AbortController();
  assert.equal(await api.deleteApp("app/one", controller.signal), undefined);
  assert.equal(calls[0].url, "/api/app-spaces/app%2Fone");
  assert.equal(calls[0].init?.method, "DELETE");
  assert.equal(calls[0].init?.body, undefined);
  assert.equal(calls[0].init?.signal, controller.signal);
  for (const code of ["app_still_deployed", "deployment_in_progress", "teardown_in_progress"]) {
    await assert.rejects(createApi("/api", async () => new Response(JSON.stringify({error:code,message:code}), {status:409})).deleteApp("app"), {status:409,code});
  }
  await assert.rejects(createApi("/api", async () => new Response("{}", {status:200})).deleteApp("app"), {code:"invalid_response"});
});

test("resource API accepts deleted but rejects unknown states", async () => {
  const resource = {address:"aws_ecs_service.web",type:"aws_ecs_service",action:"create",state:"deleted",reason:null,updated_at:"now"};
  const response = (state: string) => createApi("/api", async () => new Response(JSON.stringify([{...resource,state}]))).resources("dep");
  assert.deepEqual(await response("deleted"), [resource]);
  await assert.rejects(response("unexpected"), {code:"invalid_response"});
});


test("logs use encoded GET route and validate every monitoring state and line", async () => {
  const calls: {url:string; init?:RequestInit}[] = [];
  const data = {status:"ok",message:null,lines:[{at:"2026-10-02T12:00:00Z",message:"<script>not markup</script>"}]};
  const controller = new AbortController();
  const api = createApi("/api/", async (url,init) => {
    calls.push({url:String(url),init});
    return new Response(JSON.stringify(data));
  });
  assert.deepEqual(await api.logs("app/one",controller.signal),data);
  assert.equal(calls[0].url,"/api/app-spaces/app%2Fone/logs?limit=100");
  assert.equal(calls[0].init?.method,"GET");
  assert.equal(calls[0].init?.body,undefined);
  assert.equal(calls[0].init?.signal,controller.signal);
  for (const status of ["waiting","not_deployed","unsupported","error"]) {
    const body={status,message:"server explanation",lines:[]};
    assert.deepEqual(await createApi("/api",async()=>new Response(JSON.stringify(body))).logs("a"),body);
  }
  for (const patch of [{status:"healthy"},{message:3},{lines:null},{lines:[{at:1,message:"bad"}]},{lines:[{at:"now",message:[]}]},{lines:[null]}]) {
    await assert.rejects(createApi("/api",async()=>new Response(JSON.stringify({...data,...patch}))).logs("a"),{code:"invalid_response"});
  }
  await assert.rejects(createApi("/api",async()=>new Response(JSON.stringify({error:"not_found",message:"missing app"}),{status:404})).logs("a"),{status:404,code:"not_found"});
  controller.abort();
  await assert.rejects(api.logs("a",controller.signal),{name:"AbortError"});
  assert.equal(calls.length,1);
});


test("metrics preserve partial null and real zero with compute-specific validated GET data", async () => {
  const data = {status:"ok",message:null,compute:"ecs-fargate",cpu_percent:24.5,memory_percent:null,response_time_ms:12.5,request_count:42,error_count:0,measured_at:"2026-10-02T12:00:00Z"};
  const calls: {url:string;init?:RequestInit}[]=[];
  const controller=new AbortController();
  const api=createApi("/api",async(url,init)=>{
    calls.push({url:String(url),init});
    return new Response(JSON.stringify(data));
  });
  assert.deepEqual(await api.metrics("app/one",controller.signal),data);
  assert.equal(calls[0].url,"/api/app-spaces/app%2Fone/metrics");
  assert.equal(calls[0].init?.method,"GET");
  assert.equal(calls[0].init?.body,undefined);
  assert.equal(calls[0].init?.signal,controller.signal);
  const empty={cpu_percent:null,memory_percent:null,response_time_ms:null,request_count:null,error_count:null,measured_at:null};
  for (const compute of ["ecs-fargate","lambda","ec2",null]) {
    for (const status of ["ok","waiting","not_deployed","unsupported","error"]) {
      const body={...data,...empty,compute,status};
      assert.deepEqual(await createApi("/api",async()=>new Response(JSON.stringify(body))).metrics("a"),body);
    }
  }
  for (const patch of [{status:"healthy"},{compute:"unknown"},{cpu_percent:"24"},{cpu_percent:-1},{memory_percent:false},{response_time_ms:[]},{request_count:1.5},{error_count:-1},{measured_at:42},{message:[]},{cpu_percent:undefined}]) {
    await assert.rejects(createApi("/api",async()=>new Response(JSON.stringify({...data,...patch}))).metrics("a"),{code:"invalid_response"});
  }
  await assert.rejects(createApi("/api",async()=>new Response(JSON.stringify({error:"unavailable",message:"try later"}),{status:503})).metrics("a"),{status:503,code:"unavailable"});
  controller.abort();
  await assert.rejects(api.metrics("a",controller.signal),{name:"AbortError"});
  assert.equal(calls.length,1);
});

test("existing analysis restoration polls GET only with the default interval and no overlapping reads", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const calls: { url: string; init?: RequestInit }[] = [];
  const statuses: string[] = [];
  let firstUpdate!: () => void;
  const firstSeen = new Promise<void>(resolve => { firstUpdate = resolve; });
  let secondStarted!: () => void;
  const secondRead = new Promise<void>(resolve => { secondStarted = resolve; });
  let finishRead!: (value: Response) => void;
  const value = { status: "running", requirements: [], evidence: [], candidates: [], mascot_message: null };
  const api = createApi("/api", (url, init) => {
    calls.push({ url: String(url), init });
    if (calls.length === 1) return Promise.resolve(new Response(JSON.stringify(value)));
    secondStarted();
    return new Promise<Response>(resolve => { finishRead = resolve; });
  });
  assert.equal(typeof api.analysisUntilDone, "function", "existing analysis needs a GET-only restoration helper");
  const task = api.analysisUntilDone("app/a", { onUpdate: result => { statuses.push(result.status); firstUpdate(); } });
  await firstSeen;
  t.mock.timers.tick(1_999);
  assert.equal(calls.length, 1);
  t.mock.timers.tick(1);
  await secondRead;
  t.mock.timers.tick(10_000);
  assert.equal(calls.length, 2, "a pending GET must finish before another poll");
  finishRead(new Response(JSON.stringify({ ...value, status: "done" })));
  assert.equal((await task).status, "done");
  assert.deepEqual(calls.map(call => [call.url, call.init?.method, call.init?.body]), [
    ["/api/app-spaces/app%2Fa/analysis", "GET", undefined],
    ["/api/app-spaces/app%2Fa/analysis", "GET", undefined],
  ]);
  assert.deepEqual(statuses, ["running", "done"]);
});

test("existing analysis restoration returns terminal snapshots and preserves missing/invalid response errors", async () => {
  const value = { status: "done", requirements: [], evidence: [], candidates: [], mascot_message: null };
  for (const status of ["done", "failed"]) {
    const methods: string[] = [];
    const api = createApi("/api", async (_url, init) => {
      methods.push(init!.method!);
      return new Response(JSON.stringify({ ...value, status }));
    });
    assert.equal(typeof api.analysisUntilDone, "function");
    assert.equal((await api.analysisUntilDone("a")).status, status);
    assert.deepEqual(methods, ["GET"]);
  }
  for (const missing of [false, true]) {
    const methods: string[] = [];
    const api = createApi("/api", async (_url, init) => {
      methods.push(init!.method!);
      return new Response(JSON.stringify(missing ? { error: "analysis_not_found", message: "분석 이력 없음" } : {}), { status: missing ? 404 : 200 });
    });
    await assert.rejects(api.analysisUntilDone("a"), error => error instanceof ApiError && (missing ? error.status === 404 && error.code === "analysis_not_found" : /응답/.test(error.message)));
    assert.deepEqual(methods, ["GET"]);
  }
});

test("existing analysis restoration cancellation preserves its reason and sends no later GET", async () => {
  const controller = new AbortController();
  const reason = new Error("application navigation canceled the analysis read");
  const methods: string[] = [];
  const statuses: string[] = [];
  const api = createApi("/api", async (_url, init) => {
    methods.push(init!.method!);
    return new Response(JSON.stringify({ status: "pending", requirements: [], evidence: [], candidates: [], mascot_message: null }));
  });
  assert.equal(typeof api.analysisUntilDone, "function");
  await assert.rejects(api.analysisUntilDone("a", {
    signal: controller.signal,
    onUpdate: value => { statuses.push(value.status); queueMicrotask(() => controller.abort(reason)); },
  }), error => error === reason);
  assert.deepEqual(methods, ["GET"]);
  assert.deepEqual(statuses, ["pending"]);
  await assert.rejects(api.analysisUntilDone("a", { signal: controller.signal }), error => error === reason);
  assert.deepEqual(methods, ["GET"], "an already aborted restore cannot send a request");
});

test("existing analysis restoration has a typed 190-second deadline distinct from external cancellation", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const methods: string[] = [];
  let aborted = 0;
  const api = createApi("/api", (_url, init) => {
    methods.push(init!.method!);
    return new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => { aborted++; reject(init!.signal!.reason); }, { once: true });
    });
  });
  assert.equal(typeof api.analysisUntilDone, "function");
  const deadline = assert.rejects(api.analysisUntilDone("a"), error => error instanceof ApiError && error.code === "poll_timeout");
  t.mock.timers.tick(189_999);
  assert.equal(aborted, 0);
  t.mock.timers.tick(1);
  await deadline;
  assert.equal(aborted, 1);
  assert.deepEqual(methods, ["GET"], "timeout must not restart analysis or perform caller-owned final recovery");
  const controller = new AbortController();
  const reason = new DOMException("navigation", "AbortError");
  const canceled = assert.rejects(api.analysisUntilDone("a", { signal: controller.signal }), error => error === reason && !(error instanceof ApiError));
  controller.abort(reason);
  await canceled;
  assert.equal(aborted, 2);
  assert.deepEqual(methods, ["GET", "GET"]);
});

const redeployContext = {
  app_space_id: 'app-1', repo_url: 'https://github.com/team/web', branch: 'main',
  source_deployment_id: 'success-1', source_commit_sha: null, target_commit_sha: 'b'.repeat(40), compute: 'ecs-fargate',
  plan: {id: 'saved-plan', template: 'ecs-fargate/basic', values: {container_port: 4123, nested: {enabled:true}}},
};
const redeployResult = {id:'new-deployment', app_space_id:'app-1', compute:'ecs-fargate', status:'pending', url:null, reason:null, created_at:'now', commit_sha:'b'.repeat(40), plan_id:'saved-plan', source_deployment_id:'success-1'};
test('redeploy preview is GET-only and execution sends exactly reviewed source and SHA', async () => {
  const calls: {url:string;init?:RequestInit}[] = [];
  const api = createApi('/api', async (url,init) => {calls.push({url:String(url),init}); return Response.json(String(url).endsWith('redeploy-context') ? redeployContext : redeployResult, {status:init?.method === 'POST' ? 201 : 200});});
  assert.deepEqual(await api.redeployContext('app-1'),redeployContext);
  assert.equal(calls[0].init?.method,'GET'); assert.equal(calls[0].init?.body,undefined);
  assert.deepEqual(await api.redeploy('app-1',{source_deployment_id:'success-1',target_commit_sha:'b'.repeat(40)}),redeployResult);
  assert.equal(calls[1].url,'/api/app-spaces/app-1/redeployments');
  assert.deepEqual(JSON.parse(String(calls[1].init?.body)),{source_deployment_id:'success-1',target_commit_sha:'b'.repeat(40)});
  assert.deepEqual(await api.deployment('new-deployment'),redeployResult);
});
test('redeploy rejects malformed and wrong-app contexts before execution', async () => {
  for (const invalid of [null, {...redeployContext,app_space_id:'other'}, {...redeployContext,source_commit_sha:15}, {...redeployContext,target_commit_sha:'not-a-sha'}, {...redeployContext,source_deployment_id:''}, {...redeployContext,compute:'unknown'}, {...redeployContext,plan:{...redeployContext.plan,values:[]}}, {...redeployContext,plan:{...redeployContext.plan,id:''}}]) {
    const api=createApi('/api',async()=>Response.json(invalid));
    await assert.rejects(api.redeployContext('app-1'),{code:'invalid_response'});
  }
});
test('redeploy rejects mismatched returned identity and provenance while legacy deployment metadata stays optional', async () => {
  for (const invalid of [{...redeployResult,app_space_id:'other'}, {...redeployResult,id:'success-1'}, {...redeployResult,commit_sha:'a'.repeat(40)}, {...redeployResult,source_deployment_id:'other'}, {...redeployResult,plan_id:24}]) {
    const api=createApi('/api',async()=>Response.json(invalid,{status:201}));
    await assert.rejects(api.redeploy('app-1',{source_deployment_id:'success-1',target_commit_sha:'b'.repeat(40)}),{code:'invalid_response'});
  }
  const legacy={...redeployResult,commit_sha:undefined,plan_id:null,source_deployment_id:undefined};
  assert.equal((await createApi('/api',async()=>Response.json(legacy)).deployment('new-deployment')).plan_id,null);
});
test('redeploy propagates cancellation and structured conflicts without a fallback request', async () => {
  const controller=new AbortController(); let count=0;
  const api=createApi('/api',async()=>{count++;controller.abort();return Response.json(redeployContext);});
  await assert.rejects(api.redeployContext('app-1',controller.signal),{name:'AbortError'});
  assert.equal(count,1);
  const conflict=createApi('/api',async()=>Response.json({error:'redeploy_target_changed',message:'Changed'},{status:409}));
  await assert.rejects(conflict.redeploy('app-1',{source_deployment_id:'success-1',target_commit_sha:'b'.repeat(40)}),{code:'redeploy_target_changed',status:409});
});

test("Infra Space providers preserve known, unknown, null and absent values on list and detail", async () => {
  const base = { id: "infra-provider", name: "Provider fixture", description: "", network: "public", computes: [], app_count: 0 };
  for (const provider of ["aws", "onprem", "gcp", "azure", "future-provider", "", null, undefined]) {
    const fixture = { ...base, ...(provider === undefined ? {} : { provider }) };
    const api = createApi("/api", async (url) => new Response(JSON.stringify(String(url).endsWith("/infra-spaces") ? [fixture] : fixture)));
    assert.deepEqual(await api.infras(), [fixture], `list preserves ${String(provider)}`);
    assert.deepEqual(await api.infra(base.id), fixture, `detail preserves ${String(provider)}`);
  }
});

test("Infra Space rejects malformed provider values on both list and detail", async () => {
  for (const provider of [42, false, [], {}, ["aws"]]) {
    const fixture = { id: "infra-provider", name: "Provider fixture", description: "", network: "public", computes: [], app_count: 0, provider };
    const api = createApi("/api", async (url) => new Response(JSON.stringify(String(url).endsWith("/infra-spaces") ? [fixture] : fixture)));
    for (const request of [() => api.infras(), () => api.infra(fixture.id)]) {
      await assert.rejects(request, (error: unknown) => error instanceof ApiError && error.code === "invalid_response", `reject malformed provider ${JSON.stringify(provider)}`);
    }
  }
});

test("Infra Space accepts a mixed AWS and on-premise VM network list", async () => {
  const aws = ["public", "private", "multi-az"].map((network, index) => ({
    id: `aws-${index}`, name: `AWS ${index}`, description: "", provider: "aws", network,
    computes: ["ecs-fargate"], deployable_computes: ["ecs-fargate"], app_count: index,
  }));
  const onprem = { id: "vm-codex", name: "VM Codex", description: "", provider: "onprem", network: "vm", computes: ["vm"], deployable_computes: ["vm"], app_count: 0 };
  const fixtures = [...aws, onprem];
  const api = createApi("/api", async () => Response.json(fixtures));
  assert.deepEqual(await api.infras(), fixtures, "an on-premise VM row must not discard the three AWS rows");
});

test("Infra Space accepts on-premise VM network detail", async () => {
  const fixture = { id: "vm-codex", name: "VM Codex", description: "", provider: "onprem", network: "vm", computes: ["vm"], deployable_computes: ["vm"], app_count: 0 };
  const api = createApi("/api", async () => Response.json(fixture));
  assert.deepEqual(await api.infra(fixture.id), fixture);
});

test("Infra Space still rejects unknown networks on list and detail", async () => {
  const fixture = { id: "unknown-network", name: "Unknown network", description: "", provider: "onprem", network: "unknown-network", computes: ["vm"], deployable_computes: ["vm"], app_count: 0 };
  const api = createApi("/api", async (url) => Response.json(String(url).endsWith("/infra-spaces") ? [fixture] : fixture));
  for (const request of [() => api.infras(), () => api.infra(fixture.id)]) {
    await assert.rejects(request, (error: unknown) => error instanceof ApiError && error.code === "invalid_response");
  }
});
test("onprem plans, deployments and Ansible resources use existing API routes", async () => {
  const planSet = {status:"done",compute:"onprem",plans:[{id:"onprem-plan",name:"VM",summary:"",pros:[],cons:[],template:"onprem/basic",values:{container_port:3000}}]};
  const deployment = {...redeployResult,compute:"onprem",plan_id:"onprem-plan"};
  const resources = [{address:"ansible.deploy_container",type:"ansible_task",action:"create",state:"done",reason:null,updated_at:"now"}];
  const calls: {url:string;init?:RequestInit}[] = [];
  const api = createApi("/api", async (url,init) => {
    calls.push({url:String(url),init});
    return Response.json(String(url).endsWith("/resources") ? resources : String(url).endsWith("/deployments") ? deployment : planSet);
  });
  assert.deepEqual(await api.createPlans("app/one","onprem"),planSet);
  assert.deepEqual(await api.plans("app/one","onprem"),planSet);
  assert.deepEqual(await api.deploy("app/one","onprem","onprem-plan"),deployment);
  assert.deepEqual(await api.resources(deployment.id),resources);
  assert.deepEqual(calls.map(({url,init})=>[url,init?.method]),[
    ["/api/app-spaces/app%2Fone/plans","POST"],
    ["/api/app-spaces/app%2Fone/plans?compute=onprem","GET"],
    ["/api/app-spaces/app%2Fone/deployments","POST"],
    ["/api/deployments/new-deployment/resources","GET"],
  ]);
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)),{compute:"onprem"});
  assert.deepEqual(JSON.parse(String(calls[2].init?.body)),{compute:"onprem",plan_id:"onprem-plan"});
});

test("onprem redeploy accepts the saved context and retains source and SHA guards", async () => {
  const context = {...redeployContext,compute:"onprem",plan:{...redeployContext.plan,template:"onprem/basic"}};
  const result = {...redeployResult,compute:"onprem"};
  const calls: {url:string;init?:RequestInit}[] = [];
  const api = createApi("/api", async (url,init) => {
    calls.push({url:String(url),init});
    return Response.json(String(url).endsWith("/redeploy-context") ? context : result);
  });
  assert.deepEqual(await api.redeployContext("app-1"),context);
  const body = {source_deployment_id:context.source_deployment_id,target_commit_sha:context.target_commit_sha};
  assert.deepEqual(await api.redeploy("app-1",body),result);
  assert.deepEqual(calls.map(({url,init})=>[url,init?.method]),[
    ["/api/app-spaces/app-1/redeploy-context","GET"],
    ["/api/app-spaces/app-1/redeployments","POST"],
  ]);
  assert.equal(calls[0].init?.body,undefined);
  assert.deepEqual(JSON.parse(String(calls[1].init?.body)),body);
  for (const compute of ["vm","on-prem","onprem-future",["onprem"],null]) {
    await assert.rejects(createApi("/api",async()=>Response.json({...context,compute})).redeployContext("app-1"),{code:"invalid_response"});
  }
  await assert.rejects(createApi("/api",async()=>Response.json({...context,app_space_id:"other"})).redeployContext("app-1"),{code:"invalid_response"});
  await assert.rejects(createApi("/api",async()=>Response.json({...result,commit_sha:"a".repeat(40)})).redeploy("app-1",body),{code:"invalid_response"});
});

test("onprem-container redeploy submits the reviewed context source and SHA", async () => {
  const context = {...redeployContext,compute:"onprem-container",plan:{...redeployContext.plan,template:"onprem-container/basic"}};
  const result = {...redeployResult,compute:"onprem-container"};
  const calls: {url:string;init?:RequestInit}[] = [];
  const api = createApi("/api", async (url,init) => {
    calls.push({url:String(url),init});
    return Response.json(String(url).endsWith("/redeploy-context") ? context : result, {status:init?.method === "POST" ? 201 : 200});
  });
  const reviewed = await api.redeployContext("app-1");
  assert.deepEqual(reviewed,context);
  assert.deepEqual(await api.redeploy("app-1",{
    source_deployment_id:reviewed.source_deployment_id,
    target_commit_sha:reviewed.target_commit_sha,
  }),result);
  assert.deepEqual(calls.map(({url,init})=>[url,init?.method]),[
    ["/api/app-spaces/app-1/redeploy-context","GET"],
    ["/api/app-spaces/app-1/redeployments","POST"],
  ]);
  assert.equal(calls[0].init?.body,undefined);
  assert.deepEqual(JSON.parse(String(calls[1].init?.body)),{source_deployment_id:"success-1",target_commit_sha:"b".repeat(40)});
});
test("onprem unsupported metrics preserve the server explanation and null measurements", async () => {
  const data = {status:"unsupported",message:"On-premises metrics are not supported.",compute:"onprem",cpu_percent:null,memory_percent:null,response_time_ms:null,request_count:null,error_count:null,measured_at:null};
  const calls: {url:string;init?:RequestInit}[] = [];
  const api = createApi("/api",async(url,init)=>{calls.push({url:String(url),init});return Response.json(data);});
  assert.deepEqual(await api.metrics("app/one"),data);
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,"/api/app-spaces/app%2Fone/metrics");
  assert.equal(calls[0].init?.method,"GET");
  assert.equal(calls[0].init?.body,undefined);
  for (const compute of ["vm","on-prem","onprem-future",["onprem"]]) {
    await assert.rejects(createApi("/api",async()=>Response.json({...data,compute})).metrics("app/one"),{code:"invalid_response"});
  }
});