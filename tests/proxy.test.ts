import assert from "node:assert/strict";
import { createServer as createHttpServer } from "node:http";
import { once } from "node:events";
import { test } from "node:test";
import { createServer } from "vite";
import config from "../vite.config.ts";

test("Vite forwards API paths, POST bodies and SSE without stripping /api", { timeout: 15000 }, async (t) => {
  const received: { url: string; method: string; body: string }[] = [];
  const upstream = createHttpServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    received.push({ url: req.url!, method: req.method!, body });
    if (!req.url?.startsWith("/api/")) {
      res.writeHead(404).end();
      return;
    }
    if (req.url.endsWith("/events")) {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.end('event: progress\ndata: {"status":"success"}\n\n');
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("[]");
    }
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  t.after(() => new Promise<void>((resolve, reject) => {
    upstream.close((error) => error ? reject(error) : resolve());
    upstream.closeAllConnections();
  }));
  const address = upstream.address();
  assert.ok(address && typeof address !== "string");
  const vite = await createServer({
    ...config,
    configFile: false,
    logLevel: "silent",
    server: {
      ...config.server,
      host: "127.0.0.1",
      port: 0,
      hmr: false,
      watch: null,
      proxy: {
        "/api": {
          ...config.server!.proxy!["/api"] as object,
          target: `http://127.0.0.1:${address.port}`,
        },
      },
    },
  });
  t.after(() => vite.close());
  await vite.listen();
  const base = vite.resolvedUrls!.local[0];
  const requests = [
    { path: "/api/infra-spaces", method: "GET", body: "" },
    { path: "/api/app-spaces?limit=10", method: "GET", body: "" },
    { path: "/api/app-spaces", method: "POST", body: '{"name":"web","repo_url":"https://github.com/team/web","infra_id":"infra"}' },
    { path: "/api/app-spaces/app-1/analysis", method: "POST", body: "" },
    { path: "/api/app-spaces/app-1/analysis", method: "GET", body: "" },
    { path: "/api/app-spaces/app-1/deployments", method: "POST", body: '{"compute":"ecs-fargate"}' },
    { path: "/api/deployments/dep-1", method: "GET", body: "" },
    { path: "/api/deployments/dep-1/events", method: "GET", body: "" },
  ];
  for (const { path, method, body } of requests) {
    const response = await fetch(new URL(path, base), {
      method,
      ...(body ? { body, headers: { "Content-Type": "application/json" } } : {}),
      signal: AbortSignal.timeout(3000),
    });
    assert.equal(response.status, 200, path);
    const text = await response.text();
    if (path.endsWith("/events")) {
      assert.match(response.headers.get("content-type")!, /text\/event-stream/);
      assert.match(text, /event: progress\ndata:/);
    }
  }
  assert.deepEqual(received, requests.map(({ path, method, body }) => ({ url: path, method, body })));
});
