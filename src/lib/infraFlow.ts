import type { Choices } from "./demo.ts";
import type { MeetingInfraSpace } from "./meeting.ts";
import { generateTerraform, complete } from "./terraform.ts";
export type InfraFlow = {
  request: string;
  step: number;
  choices: Choices;
  selected?: string | null; // Legacy storage input only; normalized on load.
  legacySelection?: string;
  reviewed: boolean;
  apply: null | {
    status: "pending" | "applying" | "success" | "failed";
    phase: number;
    fail: boolean;
  };
};
export function newInfraFlow(region: string): InfraFlow {
  return { request: "", step: -1, choices: { region, visibility: "", availability: "" }, reviewed: false, apply: null };
}
// Preserve the effective configuration of earlier recommendation-based saves.
export function normalizeInfraSpace(space: MeetingInfraSpace): MeetingInfraSpace {
  const flow = space?.flow;
  if (!flow || !Object.hasOwn(flow, "selected")) return space;
  const { selected, ...rest } = flow;
  if (selected !== null && !["matched", "availability", "access"].includes(selected ?? ""))
    throw new Error("이전 인프라 선택 정보를 확인하세요.");
  if (selected !== null && (flow.step !== 2 || !flow.choices || !complete(flow.choices)))
    throw new Error("이전 인프라 답변 정보를 확인하세요.");
  if (selected === null && space.code) throw new Error("선택되지 않은 인프라 코드입니다.");
  const choices = { ...flow.choices };
  if (selected === "availability") choices.availability = choices.availability === "single" ? "multi" : "single";
  if (selected === "access") choices.visibility = choices.visibility === "public" ? "private" : "public";
  return { ...space, flow: { ...rest, choices, ...(selected ? { legacySelection: selected } : {}) } };
}
export function reviseInfra(space: MeetingInfraSpace, request: string, choices: Choices, step: number): MeetingInfraSpace {
  return { ...space, region: choices.region, status: "draft", code: "", flow: { ...newInfraFlow(space.region), request, choices, step } };
}
export function generateInfra(space: MeetingInfraSpace): MeetingInfraSpace {
  if (!space.flow || space.flow.step !== 2 || !complete(space.flow.choices))
    throw new Error("필수 질문에 먼저 답변하세요.");
  return {
    ...space, region: space.flow.choices.region, status: "source_generated", code: generateTerraform(space.flow.choices),
    flow: { ...space.flow, reviewed: false, apply: null },
  };
}
export function startInfraApply(space: MeetingInfraSpace, fail: boolean): MeetingInfraSpace {
  if (!space.flow?.reviewed
      || !space.code
      || !validInfraFlow(space))
    throw new Error("선택한 코드와 데모 제한을 먼저 검토하세요.");
  return { ...space, status: "source_generated", flow: { ...space.flow, apply: { status: "pending", phase: 0, fail } } };
}
export function advanceInfraApply(space: MeetingInfraSpace): MeetingInfraSpace {
  const flow = space.flow;
  if (!flow?.apply
      || !["pending", "applying"].includes(flow.apply.status))
    throw new Error("진행 중인 Apply가 없습니다.");
  const phase = Math.min(3, flow.apply.phase + 1);
  const status = phase === 3 ? (flow.apply.fail ? "failed" : "success") : "applying";
  return { ...space, status: status === "success" ? "demo_deployed" : "source_generated", flow: { ...flow, apply: { ...flow.apply, phase, status } } };
}
export function validInfraFlow(space: MeetingInfraSpace): boolean {
  const f = space.flow;
  if (!f
      || typeof f.request !== "string"
      || f.request.length > 4000
      || ![-1, 0, 1, 2].includes(f.step)
      || !f.choices
      || !["", "ap-northeast-1", "ap-northeast-2"].includes(space.region)
      || f.choices.region !== space.region
      || !["", "public", "private"].includes(f.choices.visibility)
      || !["", "single", "multi"].includes(f.choices.availability)
      || typeof f.reviewed !== "boolean")
    return false;
  if (f.step >= 0 && !f.request.trim()
      || f.step >= 1 && (!f.choices.region || !f.choices.visibility)
      || f.step === 2 && !complete(f.choices))
    return false;
  if (f.selected !== undefined || (f.legacySelection !== undefined && !["matched", "availability", "access"].includes(f.legacySelection)))
    return false;
  if (space.code && (f.step !== 2 || !complete(f.choices) || space.code !== generateTerraform(f.choices)))
    return false;
  if ((f.reviewed
      || f.apply) && !space.code)
    return false;
  if (f.apply && (!f.reviewed
      || !["pending", "applying", "success", "failed"].includes(f.apply.status)
      || !Number.isInteger(f.apply.phase)
      || f.apply.phase < 0
      || f.apply.phase > 3
      || typeof f.apply.fail !== "boolean"
      || (["success", "failed"].includes(f.apply.status) !== (f.apply.phase === 3))
      || (f.apply.status === "success" && f.apply.fail)))
    return false;
  return space.status === (f.apply?.status === "success" ? "demo_deployed" : space.code ? "source_generated" : "draft");
}

export function canDiscardInfra(space: MeetingInfraSpace, apps: readonly { infra_id: string }[]): boolean {
  return !!space.flow
    && space.status !== "demo_deployed"
    && !["pending", "applying", "success"].includes(space.flow.apply?.status ?? "")
    && !apps.some((app) => app.infra_id === space.id);
}
