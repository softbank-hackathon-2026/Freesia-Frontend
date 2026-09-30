import assert from "node:assert/strict";
import { test } from "node:test";
import { sampleAnalysis, availableCandidates } from "../src/lib/demo.ts";
import {
  connectGitHubDemo,
  registeredRepositories,
} from "../src/lib/meeting.ts";
test("app plan requires a registered repository and eligible runtime; code alone cannot deploy", async () => {
  const { makeAppPlan } = await import("../src/lib/pipeline.ts");
  const github = connectGitHubDemo();
  const repo = github.repositories[0];
  const app = {
    id: "demo-app",
    name: "safe",
    repo_url: repo.repo_url,
    branch: repo.branch,
    infra_id: "demo-public",
    created_at: "sample",
    latest_deployment_id: null,
  };
  const candidates = availableCandidates(sampleAnalysis.candidates, [
    "ecs-fargate",
    "lambda",
  ]);
  assert.throws(
    () =>
      makeAppPlan(app, "lambda", candidates, registeredRepositories(github)),
    /등록/,
  );
  const plan = makeAppPlan(
    app,
    "lambda",
    candidates,
    registeredRepositories({ ...github, registeredIds: [repo.id] }),
  );
  assert.equal(plan.repo_url, app.repo_url);
  assert.equal(plan.branch, app.branch);
  assert.equal(plan.compute, "lambda");
  assert.equal(plan.path, ".freesia/app/main.tf");
  assert.match(plan.code, /aws_lambda_function/);
  assert.equal(plan.status, "source_generated");
  assert.throws(() => makeAppPlan(app, "ec2", candidates, [repo]), /후보/);
  assert.throws(
    () =>
      makeAppPlan({ ...app, branch: "other" }, "lambda", candidates, [repo]),
    /브랜치/,
  );
});
test("demo pipeline failure and retry retain plan and resume precise remaining phase", async () => {
  const { advancePipeline, startDemoDeployment } =
    await import("../src/lib/pipeline.ts");
  const plan = {
    compute: "lambda",
    repo_url: "https://github.com/team/repo",
    branch: "main",
    path: ".freesia/app/main.tf" as const,
    code: "sample",
    status: "source_generated" as const,
  };
  let dep = startDemoDeployment("demo-app", plan, true);
  assert.equal(dep.status, "pending");
  for (let i = 0; i < 5; i++) dep = advancePipeline(dep);
  assert.equal(dep.status, "failed");
  assert.equal(dep.demo_pipeline?.phase, 5);
  assert.deepEqual(dep.demo_pipeline?.plan, plan);
  dep = startDemoDeployment("demo-app", plan, false);
  for (let i = 0; i < 7; i++) dep = advancePipeline(dep);
  assert.equal(dep.status, "success");
  assert.equal(dep.url, null);
  assert.match(dep.demo_pipeline?.commit ?? "", /^DEMO-/);
});
