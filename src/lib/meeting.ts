import { generateTerraform } from "./terraform.ts";
import { newInfraFlow, validInfraFlow } from "./infraFlow.ts";
import type { InfraFlow } from "./infraFlow.ts";
import type { InfraSpace } from "./types.ts";
export type InfraTemplate = "public" | "multi-az" | "db-isolated";
export const targets = ["AWS 샘플 대상", "LINE 샘플 대상"] as const;
export type Target = (typeof targets)[number];
export const templates: Record<
  InfraTemplate,
  { name: string; summary: string; contents: string[] }
> = {
  public: {
    name: "Public 중심",
    summary: "개발·공개 서비스의 공통 기반 샘플",
    contents: ["Public 진입점", "VPC/Subnet"],
  },
  "multi-az": {
    name: "Multi-AZ",
    summary: "여러 가용 영역에 기반을 분산하는 샘플",
    contents: ["Multi-AZ Subnet", "공통 진입점"],
  },
  "db-isolated": {
    name: "DB 격리",
    summary: "DB 접근을 별도로 분리하는 샘플",
    contents: ["격리된 DB 영역", "Bastion", "VPC Gateway Endpoint"],
  },
};
export type MeetingInfraSpace = {
  id: string;
  name: string;
  target?: Target;
  region: string;
  template?: InfraTemplate;
  flow?: InfraFlow;
  status: "draft" | "source_generated" | "demo_deployed";
  computes: string[];
  code: string;
  limitations: string[];
};
export type RemoteRepository = {
  id: string;
  name: string;
  repo_url: string;
  branch: string;
  visibility: "sample";
};
export type GitHubConnection = {
  account: string;
  repositories: RemoteRepository[];
  registeredIds?: string[];
};
export type MeetingState = {
  spaces: MeetingInfraSpace[];
  github: GitHubConnection | null;
};
export function newMeetingState(): MeetingState {
  return { spaces: [], github: null };
}
export function makeInfraSpace(input: {
  name: string;
  target?: Target;
  region?: string;
  template?: InfraTemplate;
}): MeetingInfraSpace {
  if (!input.name.trim() || input.name.length > 80)
    throw new Error("Space 이름을 1~80자로 입력하세요.");
  if (
    (input.target !== undefined && !targets.includes(input.target)) ||
    (input.template !== undefined && !Object.hasOwn(templates, input.template)) ||
    (input.region !== undefined && !["ap-northeast-2", "ap-northeast-1"].includes(input.region)) ||
    (input.template !== undefined && (!input.target || !input.region))
  )
    throw new Error("대상·리전·템플릿을 선택하세요.");
  if (input.template === undefined) return {
    ...input, region: input.region ?? "", name: input.name.trim(), id: `demo-space-${crypto.randomUUID()}`,
    status: "draft", computes: ["ecs-fargate", "lambda", "ec2"], code: "",
    limitations: ["실제 AWS 리소스 없음", "고정 VPC/Subnet 샘플 · 실제 AI 생성/검증/적용 없음"],
    flow: newInfraFlow(input.region ?? ""),
  };
  return {
    ...input,
    region: input.region!,
    name: input.name.trim(),
    id: `demo-space-${crypto.randomUUID()}`,
    status: "source_generated",
    computes: ["ecs-fargate", "lambda", "ec2"],
    code: generateTerraform({
      region: input.region!,
      visibility: input.template === "public" ? "public" : "private",
      availability: input.template === "public" ? "single" : "multi",
    }),
    limitations: [
      "실제 AWS 리소스 없음",
      "고정 VPC/Subnet 초안이며 AI 호출·Terraform 검증·적용 없음",
      ...(input.template === "db-isolated"
        ? [
            "DB 격리·Bastion·VPC Gateway Endpoint는 템플릿 설명이며 코드에 생성되지 않음",
          ]
        : ["ALB·ECS Cluster·IAM·NAT 등 전체 기반 코드 미구현"]),
    ],
  };
}
export function markDemoDeployed(space: MeetingInfraSpace): MeetingInfraSpace {
  if (space.flow) throw new Error("질의응답·코드 검토 후 Apply 데모를 진행하세요.");
  return { ...space, status: "demo_deployed" };
}
export function connectGitHubDemo(): GitHubConnection {
  return {
    account: "freesia-demo-team",
    repositories: [
      {
        id: "repo-front",
        name: "softbank-hackathon-2026/Freesia-Frontend",
        repo_url: "https://github.com/softbank-hackathon-2026/Freesia-Frontend",
        branch: "main",
        visibility: "sample",
      },
      {
        id: "repo-back",
        name: "softbank-hackathon-2026/Freesia-backend",
        repo_url: "https://github.com/softbank-hackathon-2026/Freesia-backend",
        branch: "main",
        visibility: "sample",
      },
    ],
  };
}
export function validMeetingState(value: unknown): value is MeetingState {
  if (!value || typeof value !== "object") return false;
  const s = value as MeetingState;
  if (
    !Array.isArray(s.spaces) ||
    s.spaces.some(
      (i) =>
        !i ||
        ["id", "name", "region", "code"].some(
          (k) =>
            typeof (i as unknown as Record<string, unknown>)[k] !== "string",
        ) ||
        (i.target !== undefined ? !targets.includes(i.target) : !i.flow) ||
        (i.flow ? !validInfraFlow(i) : (!i.template || !Object.hasOwn(templates, i.template) || !["source_generated", "demo_deployed"].includes(i.status))) ||
        !Array.isArray(i.computes) ||
        !i.computes.every((c) => typeof c === "string") ||
        !Array.isArray(i.limitations) ||
        !i.limitations.every((c) => typeof c === "string"),
    )
  )
    return false;
  if (
    s.github !== null &&
    (!s.github ||
      typeof s.github.account !== "string" ||
      !Array.isArray(s.github.repositories) ||
      s.github.repositories.some(
        (r) =>
          !r ||
          ["id", "name", "repo_url", "branch"].some(
            (k) =>
              typeof (r as unknown as Record<string, unknown>)[k] !== "string",
          ) ||
          r.visibility !== "sample" ||
          !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(r.repo_url),
      ))
  )
    return false;
  if (
    s.github?.registeredIds !== undefined &&
    (!Array.isArray(s.github.registeredIds) ||
      !s.github.registeredIds.every(
        (id) =>
          typeof id === "string" &&
          s.github?.repositories.some((r) => r.id === id),
      ))
  )
    return false;
  return true;
}
export function registeredRepositories(
  connection: GitHubConnection | null,
): RemoteRepository[] {
  return (
    connection?.repositories.filter((r) =>
      connection.registeredIds?.includes(r.id),
    ) ?? []
  );
}
export function readyMeetingSpaces(state: MeetingState): InfraSpace[] {
  return state.spaces
    .filter((s) => s.status === "demo_deployed" && (!s.flow || s.flow.apply?.status === "success"))
    .map((s) => ({
      id: s.id,
      name: s.name,
      description: `${s.target ? s.target + " · " : ""}데모 배포된 기반 샘플. 실제 AWS 리소스가 아닙니다.`,
      network:
        (s.flow ? s.flow.choices.visibility === "public" : s.template === "public")
          ? "public"
          : (s.flow ? s.flow.choices.availability === "multi" : s.template === "multi-az")
            ? "ha"
            : "private",
      computes: s.computes,
      app_count: 0,
    }));
}
export function foundationTarget(id: string, state: MeetingState): Target | undefined {
  const space = state.spaces.find((s) => s.id === id);
  if (space) return space.target;
  return id === "demo-private" ? "LINE 샘플 대상" : id === "demo-public" || id === "demo-ha" ? "AWS 샘플 대상" : undefined;
}

export function normalizeRepositoryUrl(input: string): string {
  const normalized = input.trim().replace(/\/+$/, "").replace(/\.git$/i, "");
  const match = /^https:\/\/github\.com\/([a-z0-9][a-z0-9-]*)\/([\w.-]+)$/i.exec(normalized);
  if (!match || input.length > 2048 || [".", ".."].includes(match[2]))
    throw new Error("https://github.com/owner/repository 형식의 Repository URL을 입력하세요.");
  return `https://github.com/${match[1]}/${match[2]}`;
}
export function registerRepository(connection: GitHubConnection | null, input: string): GitHubConnection {
  const repoUrl = normalizeRepositoryUrl(input);
  const sameMain = connection?.repositories.find((repo) =>
    repo.repo_url.replace(/\.git$/i, "").toLowerCase() === repoUrl.toLowerCase() && repo.branch === "main");
  if (sameMain && connection?.registeredIds?.includes(sameMain.id))
    throw new Error("이미 등록한 Repository입니다.");
  const repo: RemoteRepository = sameMain ?? {
    id: `repo-${crypto.randomUUID()}`, name: repoUrl.slice("https://github.com/".length),
    repo_url: repoUrl, branch: "main", visibility: "sample",
  };
  return {
    account: connection?.account ?? "",
    repositories: sameMain ? connection!.repositories : [...(connection?.repositories ?? []), repo],
    registeredIds: [...(connection?.registeredIds ?? []), repo.id],
  };
}
