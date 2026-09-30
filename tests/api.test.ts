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

test("named progress events close on terminal, malformed event or transport failure; cleanup closes", () => {
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
  assert.equal(closed, 2);
  watchDeployment(
    "/api",
    "dep-2",
    () => {},
    (e) => errors.push(e),
    () => source,
  );
  listener!(new MessageEvent("progress", { data: "invalid" }));
  assert.equal(errors.length, 1);
  assert.equal(closed, 3);
  watchDeployment(
    "/api",
    "dep-3",
    () => {},
    (e) => errors.push(e),
    () => source,
  );
  errorListener!();
  assert.equal(errors.length, 2);
  assert.equal(closed, 4);
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
