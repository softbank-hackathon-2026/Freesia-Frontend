import type { Analysis, AppSpace, Deployment } from "./types.ts";
import type { RemoteRepository } from "./meeting.ts";
export type AppPlan = {
  compute: string;
  repo_url: string;
  branch: string;
  path: ".freesia/app/main.tf";
  code: string;
  status: "source_generated";
};
export type DemoPipeline = {
  plan: AppPlan;
  phase: number;
  failCI: boolean;
  commit: string | null;
};
export const pipelineSteps = [
  "Terraform 코드 준비",
  "선택 Repository에 commit · DEMO",
  "원격 push · DEMO",
  "GitHub Actions 빌드 · DEMO",
  "CI 검사 · DEMO",
  "앱 실행 자원 생성 · DEMO",
  "앱 배포·확인 완료 · DEMO",
];
export function makeAppPlan(
  app: AppSpace,
  compute: string,
  candidates: Analysis["candidates"],
  repositories: RemoteRepository[],
): AppPlan {
  const repo = repositories.find((r) => r.repo_url === app.repo_url);
  if (!repo) throw new Error("통합에서 Repository를 먼저 등록하세요.");
  if (repo.branch !== app.branch)
    throw new Error("등록된 Repository 브랜치와 앱 브랜치가 다릅니다.");
  if (
    !candidates.some(
      (c) => c.compute === compute && c.state !== "unsuitable",
    ) ||
    !["ecs-fargate", "lambda", "ec2"].includes(compute)
  )
    throw new Error("적합한 후보를 선택하세요.");
  const resource =
    compute === "lambda"
      ? `resource "aws_lambda_function" "sample" {\n  function_name = "freesia-demo"\n  role = "REPLACE_WITH_ROLE_ARN"\n  runtime = "nodejs20.x"\n  handler = "index.handler"\n  filename = "REPLACE_WITH_BUILD_ZIP"\n}`
      : compute === "ecs-fargate"
        ? `resource "aws_ecs_task_definition" "sample" {\n  family = "freesia-demo"\n  requires_compatibilities = ["FARGATE"]\n  network_mode = "awsvpc"\n  cpu = "256"\n  memory = "512"\n  container_definitions = jsonencode([{name = "app", image = "REPLACE_WITH_IMAGE_URI", essential = true}])\n}`
        : `resource "aws_instance" "sample" {\n  ami = "REPLACE_WITH_AMI"\n  instance_type = "t3.micro"\n}`;
  return {
    compute,
    repo_url: repo.repo_url,
    branch: repo.branch,
    path: ".freesia/app/main.tf",
    status: "source_generated",
    code: `# DEMO template only. Not AI generated, validated or executable as-is.\n# Missing runtime artifacts, IAM, connections, service and security configuration.\n${resource}\n`,
  };
}
export function startDemoDeployment(
  appId: string,
  plan: AppPlan,
  failCI: boolean,
): Deployment {
  return {
    id: `demo-dep-${crypto.randomUUID()}`,
    app_space_id: appId,
    compute: plan.compute,
    status: "pending",
    url: null,
    reason: null,
    created_at: new Date().toISOString(),
    demo_pipeline: { plan, phase: 0, failCI, commit: null },
  };
}
export function advancePipeline(dep: Deployment): Deployment {
  const meta = dep.demo_pipeline;
  if (!meta || ["success", "failed"].includes(dep.status)) return dep;
  const phase = meta.phase + 1;
  const failed = meta.failCI && phase === 5;
  return {
    ...dep,
    status: failed
      ? "failed"
      : phase === 7
        ? "success"
        : phase >= 6
          ? "deploying"
          : "building",
    url: null,
    reason: failed
      ? "DEMO CI 검사 실패입니다. 외부 GitHub·AWS 작업은 실행되지 않았습니다."
      : null,
    demo_pipeline: {
      ...meta,
      phase,
      commit: phase >= 2 ? `DEMO-${dep.id.slice(-8)}` : null,
    },
  };
}
export function validPipeline(value: unknown): value is DemoPipeline {
  if (!value || typeof value !== "object") return false;
  const p = value as DemoPipeline;
  return (
    Number.isInteger(p.phase) &&
    p.phase >= 0 &&
    p.phase <= 7 &&
    typeof p.failCI === "boolean" &&
    (p.commit === null || typeof p.commit === "string") &&
    !!p.plan &&
    p.plan.status === "source_generated" &&
    p.plan.path === ".freesia/app/main.tf" &&
    ["ecs-fargate", "lambda", "ec2"].includes(p.plan.compute) &&
    typeof p.plan.branch === "string" &&
    typeof p.plan.code === "string" &&
    typeof p.plan.repo_url === "string" &&
    /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(p.plan.repo_url)
  );
}
