import assert from "node:assert/strict";
import { test } from "node:test";
import { initialDemo, parseDemo } from "../src/lib/demo.ts";
import {
  newMeetingState,
  makeInfraSpace,
  markDemoDeployed,
  connectGitHubDemo,
  validMeetingState,
} from "../src/lib/meeting.ts";
test("three templates create source-only Space until explicit sample deployment", () => {
  for (const template of ["public", "multi-az", "db-isolated"] as const) {
    const space = makeInfraSpace({
      name: "team-foundation",
      target: "LINE 샘플 대상",
      region: "ap-northeast-2",
      template,
    });
    assert.equal(space.status, "source_generated");
    assert.equal(space.target, "LINE 샘플 대상");
    assert.equal(markDemoDeployed(space).status, "demo_deployed");
    assert.ok(space.limitations.includes("실제 AWS 리소스 없음"));
  }
  assert.throws(
    () =>
      makeInfraSpace({
        name: "",
        target: "AWS 샘플 대상",
        region: "ap-northeast-2",
        template: "public",
      }),
    /이름/,
  );
});
test("v1 data preserves old ids while meeting metadata is validated and persists", () => {
  const old = initialDemo();
  assert.equal(parseDemo(JSON.stringify(old)).version, 1);
  const meeting = newMeetingState();
  meeting.spaces.push(
    makeInfraSpace({
      name: "new-space",
      target: "AWS 샘플 대상",
      region: "ap-northeast-2",
      template: "multi-az",
    }),
  );
  meeting.github = connectGitHubDemo();
  assert.equal(validMeetingState(meeting), true);
  assert.deepEqual(
    parseDemo(JSON.stringify({ ...old, meeting })).meeting,
    meeting,
  );
  assert.throws(
    () =>
      parseDemo(
        JSON.stringify({ ...old, meeting: { spaces: [{}], github: null } }),
      ),
    /저장/,
  );
  assert.ok(
    meeting.github.repositories.every(
      (r) => r.branch === "main" && r.visibility === "sample",
    ),
  );
});

test("connected repositories require explicit registration before app selection", async () => {
  const { registeredRepositories } = await import("../src/lib/meeting.ts");
  const github = connectGitHubDemo();
  assert.deepEqual(registeredRepositories(github), []);
  assert.deepEqual(
    registeredRepositories({
      ...github,
      registeredIds: [github.repositories[0].id],
    }).map((r) => r.id),
    [github.repositories[0].id],
  );
  assert.equal(
    validMeetingState({
      spaces: [],
      github: { ...github, registeredIds: ["unknown"] },
    }),
    false,
  );
});

test("external template ids reject inherited Object keys", () => {
  const space = makeInfraSpace({
    name: "valid",
    target: "AWS 샘플 대상",
    region: "ap-northeast-2",
    template: "public",
  });
  for (const template of ["constructor", "__proto__"]) {
    assert.equal(
      validMeetingState({ spaces: [{ ...space, template }], github: null }),
      false,
    );
    assert.throws(
      () =>
        makeInfraSpace({
          name: "bad",
          target: "AWS 샘플 대상",
          region: "ap-northeast-2",
          template: template as never,
        }),
      /템플릿/,
    );
  }
});
