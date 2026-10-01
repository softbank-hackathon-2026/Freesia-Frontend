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

test("name-only creation keeps input and legacy boundaries validated", () => {
  assert.throws(() => makeInfraSpace({ name: "   " }), /이름/);
  assert.throws(() => makeInfraSpace({ name: "a".repeat(81) }), /이름/);
  assert.throws(() => makeInfraSpace({ name: "bad", region: "unsupported" }), /리전/);
  assert.throws(() => makeInfraSpace({ name: "bad", target: "other" as never }), /대상/);
  assert.throws(() => makeInfraSpace({ name: "bad", template: "public" }), /템플릿/);
  const draft = makeInfraSpace({ name: " trimmed " });
  assert.equal(draft.name, "trimmed");
  assert.equal(validMeetingState({ spaces: [{ ...draft, target: "other" }], github: null }), false);
});

test("URL registration normalizes GitHub URLs and preserves previous repository history", async () => {
  const { registerRepository, registeredRepositories } = await import("../src/lib/meeting.ts");
  let connection = registerRepository(null, "  https://github.com/Team/My-App.git/  ");
  assert.equal(connection.account, "");
  assert.equal(registeredRepositories(connection)[0].repo_url, "https://github.com/Team/My-App");
  assert.equal(registeredRepositories(connection)[0].branch, "main");
  assert.throws(() => registerRepository(connection, "https://GITHUB.com/team/my-app/"), /이미 등록/);
  const id = registeredRepositories(connection)[0].id;
  connection = { ...connection, registeredIds: [] };
  connection = registerRepository(connection, "https://github.com/team/my-app");
  assert.equal(registeredRepositories(connection)[0].id, id);
  assert.equal(connection.repositories.length, 1);
  const legacy = connectGitHubDemo();
  legacy.repositories[0].branch = "develop";
  legacy.registeredIds = legacy.repositories.map((repo) => repo.id);
  const updated = registerRepository(legacy, legacy.repositories[0].repo_url);
  assert.deepEqual(updated.repositories.slice(0,2),legacy.repositories);
  assert.equal(registeredRepositories(updated).length,3);
  assert.equal(registeredRepositories(updated).at(-1)!.branch,"main");
  assert.deepEqual(parseDemo(JSON.stringify({...initialDemo(),meeting:{spaces:[],github:updated}})).meeting!.github,updated);
});
test("URL registration rejects non-repository URLs and never mutates existing state", async () => {
  const { registerRepository } = await import("../src/lib/meeting.ts");
  const connection = connectGitHubDemo();
  const before = structuredClone(connection);
  for (const url of ["", "http://github.com/a/b", "https://gitlab.com/a/b", "https://user@github.com/a/b", "https://github.com/a/b?token=x", "https://github.com/a/b#readme", "https://github.com/a/b/tree/main", "https://github.com/a", "https://github.com:443/a/b", "https://github.com/a/.."]) {
    assert.throws(()=>registerRepository(connection,url),/URL/);
  }
  assert.deepEqual(connection,before);
});
