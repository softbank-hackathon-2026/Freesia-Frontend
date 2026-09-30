import assert from "node:assert/strict";
import { test } from "node:test";
import {
  initialDemo,
  parseDemo,
  generateTerraform,
  makeDesign,
  validateApp,
  availableCandidates,
} from "../src/lib/demo.ts";

test("AI guided template requires complete choices; raw request never becomes executable code", () => {
  assert.throws(
    () => generateTerraform({ region: "", visibility: "", availability: "" }),
    /질문/,
  );
  const choices = {
    region: "ap-northeast-2",
    visibility: "private",
    availability: "multi",
  } as const;
  const code = generateTerraform(choices);
  assert.match(code, /aws_vpc/);
  assert.match(code, /count = 2/);
  assert.doesNotMatch(code, /aws_instance|terraform apply/);
  const design = makeDesign(
    "prod",
    '<script>alert(1)</script> ${file("secret")}',
    choices,
  );
  assert.equal(design.status, "source_generated");
  assert.equal(
    design.requirement,
    '<script>alert(1)</script> ${file("secret")}',
  );
  assert.doesNotMatch(design.code, /script|file\("secret"/);
  assert.throws(() => makeDesign("", "req", choices), /이름/);
  assert.throws(() => makeDesign("prod", "", choices), /요구/);
});

test("saved designs persist safely and invalid stores report errors", () => {
  const state = initialDemo();
  state.designs.push(
    makeDesign("dev", "웹 서비스", {
      region: "ap-northeast-2",
      visibility: "public",
      availability: "single",
    }),
  );
  assert.deepEqual(parseDemo(JSON.stringify(state)), state);
  assert.deepEqual(parseDemo(null), initialDemo());
  for (const bad of [
    "bad-json",
    "{}",
    '{"version":99}',
    '{"version":1,"designs":[{}],"apps":[],"deployments":[]}',
  ])
    assert.throws(() => parseDemo(bad), /저장/);
  assert.equal(state.designs[0].status, "source_generated");
});

test("app creation validates GitHub syntax/name/branch and never deploys unsupported candidates", () => {
  const form = {
    name: "web",
    repo_url: "https://github.com/acme/web.git",
    branch: "main",
    infra_id: "ready",
  };
  assert.equal(validateApp(form, ["ready"]), null);
  for (const change of [
    { name: "" },
    { repo_url: "javascript:alert(1)" },
    { repo_url: "https://github.com/a/b/tree/main" },
    { repo_url: "https://gitlab.com/a/b" },
    { branch: "" },
    { infra_id: "saved-design" },
  ])
    assert.ok(validateApp({ ...form, ...change }, ["ready"]));
  assert.deepEqual(
    availableCandidates(
      [
        { compute: "lambda", state: "selected", reason: "", cons: [] },
        { compute: "ec2", state: "unsuitable", reason: "", cons: [] },
      ],
      ["ecs-fargate", "ec2"],
    ),
    [],
  );
});
