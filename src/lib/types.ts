import type { DemoPipeline } from "./pipeline.ts";
export type InfraSpace = {
  id: string;
  name: string;
  description: string;
  network: "public" | "private" | "ha";
  computes: string[];
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
