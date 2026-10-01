import assert from "node:assert/strict";
import { test } from "node:test";
import { createApi, watchDeployment } from "../src/lib/api.ts";

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

test("analysis deadline is 150 seconds while plan deadline remains 60 seconds",async(t)=>{
  t.mock.timers.enable({apis:["setTimeout"]});
  let aborted=0;
  const api=createApi("",(_url,init)=>new Promise((_resolve,reject)=>{
    init!.signal!.addEventListener("abort",()=>{aborted++;reject(init!.signal!.reason);},{once:true});
  }));
  const analysis=assert.rejects(api.analyzeUntilDone("a"),/시간/);
  t.mock.timers.tick(149_999);
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
