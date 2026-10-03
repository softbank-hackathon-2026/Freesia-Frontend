import { normalizeInfraSpace } from "./infraFlow.ts";
import { validPipeline } from "./pipeline.ts";
import { complete, generateTerraform } from "./terraform.ts";
export { generateTerraform } from "./terraform.ts";
import type {
  Analysis,
  AppSpace,
  AppSpaceCreate,
  Deployment,
  InfraSpace,
} from "./types.ts";
import { validMeetingState } from "./meeting.ts";
import type { MeetingState, MeetingInfraSpace } from "./meeting.ts";
export const STORE_KEY = "freesia.demo.v1";
export type Choices = {
  region: string;
  visibility: string;
  availability: string;
};
export type InfraDesign = {
  id: string;
  name: string;
  requirement: string;
  choices: Choices;
  code: string;
  status: "source_generated";
  created_at: string;
};
export type DemoState = {
  version: 1;
  meeting?: MeetingState;
  designs: InfraDesign[];
  apps: AppSpace[];
  deployments: Deployment[];
};
export const foundations: InfraSpace[] = [
  {
    id: "demo-public",
    name: "쇼핑몰 서비스",
    description:
      "준비된 기반 샘플입니다. 실제 리소스 정보는 연결되지 않았습니다.",
    network: "public",
    computes: ["ecs-fargate", "lambda", "ec2"],
    app_count: 0,
  },
  {
    id: "demo-private",
    name: "사내 업무 서비스",
    description: "준비된 내부 API 기반 샘플입니다.",
    network: "private",
    computes: ["ecs-fargate", "lambda"],
    app_count: 0,
  },
  {
    id: "demo-ha",
    name: "결제 서비스",
    description:
      "외부 직접 경로 없이 두 가용 영역에 배치한 네트워크 데모 예시입니다.",
    network: "ha",
    computes: ["ecs-fargate", "ec2"],
    app_count: 0,
  },
];

const preparedConfigurations: Record<string, { request: string; choices: Choices }> = {
  "demo-public": {
    request: "쇼핑몰용 공개 네트워크의 단일 가용 영역 구성 예시입니다.",
    choices: { region: "ap-northeast-2", visibility: "public", availability: "single" },
  },
  "demo-private": {
    request: "사내 업무용으로 외부 직접 경로가 없는 단일 가용 영역 구성 예시입니다.",
    choices: { region: "ap-northeast-2", visibility: "private", availability: "single" },
  },
  "demo-ha": {
    request: "결제용 네트워크를 두 가용 영역에 배치하는 내부 경로 구성 예시입니다.",
    choices: { region: "ap-northeast-2", visibility: "private", availability: "multi" },
  },
};
export const preparedInfraSpaces: MeetingInfraSpace[] = foundations.map((infra) => {
  const { request, choices } = preparedConfigurations[infra.id];
  return {
    id: infra.id, name: infra.name, region: choices.region, computes: infra.computes,
    status: "demo_deployed", code: generateTerraform(choices),
    limitations: ["미리 준비한 읽기 전용 데모 예시", "실제 AI 대화·Terraform 검증·AWS 적용 이력 없음"],
    flow: { request, step: 2, choices, reviewed: true, apply: { status: "success", phase: 3, fail: false } },
  };
});

export const sampleAnalysis: Analysis = {
  status: "done",
  requirements: [
    "Node.js 20",
    "HTTP 서버 · PORT 3000",
    "상시 실행 웹 애플리케이션",
  ],
  evidence: [
    {
      file: "Dockerfile",
      finding: "Node.js 20 실행 환경이 선언되어 있습니다.",
      certain: true,
    },
    {
      file: "package.json",
      finding: "start 명령으로 HTTP 서버를 시작합니다.",
      certain: true,
    },
    {
      file: "README.md",
      finding: "트래픽 규모는 샘플 추정이며 검증되지 않았습니다.",
      certain: false,
    },
  ],
  candidates: [
    {
      compute: "ecs-fargate",
      state: "selected",
      reason: "상시 실행 컨테이너 서버에 적합한 샘플 선택입니다.",
      cons: ["최소 실행 비용이 발생합니다."],
    },
    {
      compute: "lambda",
      state: "alternative",
      reason: "요청 기반 실행을 위해 앱 변환이 필요할 수 있습니다.",
      cons: ["콜드 스타트", "서버 구조 수정 필요"],
    },
    {
      compute: "ec2",
      state: "unsuitable",
      reason: "이 샘플에서는 직접 서버 운영이 요구사항보다 복잡합니다.",
      cons: ["운영·패치 부담"],
    },
  ],
  mascot_message:
    "선택 이유와 불확실한 근거를 확인한 뒤 배포하세요. 이 분석은 저장소를 읽지 않은 샘플입니다.",
};
export function initialDemo(): DemoState {
  return { version: 1, designs: [], apps: [], deployments: [] };
}
export function parseDemo(raw: string | null): DemoState {
  if (raw === null) return initialDemo();
  try {
    const s = JSON.parse(raw) as DemoState;
    if (
      !s ||
      s.version !== 1 ||
      !Array.isArray(s.designs) ||
      !Array.isArray(s.apps) ||
      !Array.isArray(s.deployments)
    )
      throw new Error();
    if (
      s.designs.some(
        (d) =>
          !d ||
          ["id", "name", "requirement", "code", "created_at"].some(
            (k) =>
              typeof (d as unknown as Record<string, unknown>)[k] !== "string",
          ) ||
          d.status !== "source_generated" ||
          !d.choices ||
          !complete(d.choices),
      )
    )
      throw new Error();
    if (
      s.apps.some(
        (a) =>
          !a ||
          ["id", "name", "repo_url", "branch", "infra_id", "created_at"].some(
            (k) =>
              typeof (a as unknown as Record<string, unknown>)[k] !== "string",
          ) ||
          (a.latest_deployment_id !== null &&
            typeof a.latest_deployment_id !== "string"),
      )
    )
      throw new Error();
    if (
      s.deployments.some(
        (d) =>
          !d ||
          ["id", "app_space_id", "compute", "created_at"].some(
            (k) =>
              typeof (d as unknown as Record<string, unknown>)[k] !== "string",
          ) ||
          !["pending", "building", "deploying", "success", "failed"].includes(
            d.status,
          ) ||
          (d.url !== null && typeof d.url !== "string") ||
          (d.reason !== null && typeof d.reason !== "string") ||
          (d.demo_pipeline !== undefined &&
            (!validPipeline(d.demo_pipeline) ||
              d.demo_pipeline.plan.compute !== d.compute)),
      )
    )
      throw new Error();
    if (Array.isArray(s.meeting?.spaces))
      s.meeting.spaces = s.meeting.spaces.map(normalizeInfraSpace);
    if (s.meeting !== undefined && !validMeetingState(s.meeting))
      throw new Error();
    return s;
  } catch {
    throw new Error(
      "브라우저 저장 데이터가 손상되었거나 지원하지 않는 버전입니다. 초기화 전에 필요한 데이터를 확인하세요.",
    );
  }
}
export function makeDesign(
  name: string,
  requirement: string,
  choices: Choices,
): InfraDesign {
  if (!name.trim() || name.trim().length > 80)
    throw new Error("설계 이름을 1~80자로 입력하세요.");
  if (!requirement.trim() || requirement.length > 4000)
    throw new Error("요구사항을 1~4000자로 입력하세요.");
  return {
    id: `design-${crypto.randomUUID()}`,
    name: name.trim(),
    requirement: requirement.trim(),
    choices: { ...choices },
    code: generateTerraform(choices),
    status: "source_generated",
    created_at: new Date().toISOString(),
  };
}
export function validateApp(
  form: AppSpaceCreate,
  infraIds: string[],
  allowMissingInfra = false,
): string | null {
  if (!form.name.trim() || form.name.length > 80)
    return "앱 이름을 1~80자로 입력하세요.";
  if (
    !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?\/?$/.test(
      form.repo_url,
    ) ||
    form.repo_url.includes("/../")
  )
    return "GitHub 저장소 URL을 입력하세요. 예: https://github.com/team/repo";
  if (
    !form.branch?.trim() ||
    form.branch.length > 200 ||
    /[\s~^:?*[\\]|\.\.|\/\//.test(form.branch)
  )
    return "유효한 브랜치 이름을 입력하세요.";
  if (!(allowMissingInfra && !form.infra_id) && !infraIds.includes(form.infra_id))
    return "준비된 기반을 선택하세요. 미구축 설계에는 배포할 수 없습니다.";
  return null;
}
export function availableCandidates(
  candidates: Analysis["candidates"],
  computes: string[],
) {
  return candidates.filter(
    (c) => c.state !== "unsuitable" && computes.includes(c.compute),
  );
}
