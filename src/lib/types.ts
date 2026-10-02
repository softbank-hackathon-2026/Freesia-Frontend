export type Repository = {
  id: string;
  name: string;
  repo_url: string;
  branch: string;
  created_at: string;
};
import type { DemoPipeline } from "./pipeline.ts";
export type InfraSpace = {
  id: string;
  name: string;
  description: string;
  network: "public" | "private" | "ha" | "multi-az" | "db-isolated";
  computes: string[];
  deployable_computes?: string[];
  app_count: number;
};
export type AppSpaceCreate = {
  name: string;
  repo_url: string;
  branch?: string;
  infra_id: string;
};
export type AppSpace = AppSpaceCreate & {
  id: string;
  branch: string;
  created_at: string;
  latest_deployment_id: string | null;
  teardown_requested_at?: string | null;
  teardown_status?: "requested" | "success" | "failed" | null;
  teardown_finished_at?: string | null;
  teardown_reason?: string | null;
};
export type TeardownReceipt = {
  app_space_id: string;
  status: "requested";
  requested_at: string;
};
export type Analysis = {
  status: "pending" | "running" | "done" | "failed";
  requirements: string[];
  evidence: { file: string; finding: string; certain: boolean }[];
  candidates: {
    compute: string;
    state: "selected" | "alternative" | "unsuitable";
    reason: string;
    cons: string[];
    evidence_files?: string[];
  }[];
  mascot_message: string | null;
};
export type Deployment = {
  demo_pipeline?: DemoPipeline;
  id: string;
  app_space_id: string;
  compute: string;
  status: "pending" | "building" | "deploying" | "success" | "failed";
  url: string | null;
  reason: string | null;
  created_at: string;
};
export type DeploymentEvent = {
  status: Deployment["status"];
  step: string;
  message: string;
  progress: number;
  url: string | null;
  at: string;
};
export type DataMode = "demo" | "api";
export type DeploymentResource = {
  address: string;
  type: string;
  action: string;
  state: "pending" | "in_progress" | "done" | "failed" | "deleted";
  reason: string | null;
  updated_at: string;
};
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type DeploymentPlan = {
  id: string;
  name: string;
  summary: string;
  pros: string[];
  cons: string[];
  template: string;
  values: Record<string, JsonValue>;
};
export type PlanSet = {
  status: Analysis["status"];
  compute: string;
  plans: DeploymentPlan[];
};

export type MonitoringStatus = "ok" | "waiting" | "not_deployed" | "unsupported" | "error";
export type AppLogs = {
  status: MonitoringStatus;
  message: string | null;
  lines: { at: string; message: string }[];
};
