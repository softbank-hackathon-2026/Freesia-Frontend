import type {
  Analysis,
  AppSpace,
  AppSpaceCreate,
  Deployment,
  DeploymentEvent,
  InfraSpace,
  Repository,
} from "./types.ts";

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
const strings = (value: unknown) =>
  Array.isArray(value) && value.every((item) => typeof item === "string");
const nullableString = (value: unknown) =>
  value === null || typeof value === "string";
function infraShape(value: unknown): boolean {
  const v = record(value);
  return (
    !!v &&
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.description === "string" &&
    ["public", "private", "ha"].includes(String(v.network)) &&
    strings(v.computes) &&
    typeof v.app_count === "number"
  );
}
function repositoryShape(value: unknown): boolean {
  const v = record(value);
  return !!v && ["id", "name", "repo_url", "branch", "created_at"].every((key) => typeof v[key] === "string");
}
function appShape(value: unknown): boolean {
  const v = record(value);
  return (
    !!v &&
    ["id", "name", "repo_url", "branch", "infra_id", "created_at"].every(
      (key) => typeof v[key] === "string",
    ) &&
    nullableString(v.latest_deployment_id)
  );
}
function deploymentShape(value: unknown): boolean {
  const v = record(value);
  return (
    !!v &&
    ["id", "app_space_id", "compute", "created_at"].every(
      (key) => typeof v[key] === "string",
    ) &&
    ["pending", "building", "deploying", "success", "failed"].includes(
      String(v.status),
    ) &&
    nullableString(v.url) &&
    nullableString(v.reason)
  );
}
function analysisShape(value: unknown): boolean {
  const v = record(value);
  return (
    !!v &&
    ["pending", "running", "done", "failed"].includes(String(v.status)) &&
    strings(v.requirements) &&
    nullableString(v.mascot_message) &&
    Array.isArray(v.evidence) &&
    v.evidence.every((item) => {
      const e = record(item);
      return (
        !!e &&
        typeof e.file === "string" &&
        typeof e.finding === "string" &&
        typeof e.certain === "boolean"
      );
    }) &&
    Array.isArray(v.candidates) &&
    v.candidates.every((item) => {
      const c = record(item);
      return (
        !!c &&
        typeof c.compute === "string" &&
        ["selected", "alternative", "unsuitable"].includes(String(c.state)) &&
        typeof c.reason === "string" &&
        strings(c.cons)
      );
    })
  );
}
function validShape(path: string, value: unknown, post: boolean): boolean {
  if (path === "/repositories") return post ? repositoryShape(value) : Array.isArray(value) && value.every(repositoryShape);
  if (path === "/infra-spaces")
    return Array.isArray(value) && value.every(infraShape);
  if (path.startsWith("/infra-spaces/")) return infraShape(value);
  if (path.endsWith("/analysis")) return analysisShape(value);
  if (path.includes("/deployments")) return deploymentShape(value);
  if (path === "/app-spaces" && !post)
    return Array.isArray(value) && value.every(appShape);
  return appShape(value);
}
export function createApi(base: string, fetcher: typeof fetch = fetch) {
  const root = base.replace(/\/$/, "");
  async function request<T>(
    path: string,
    body?: unknown,
    method: "GET" | "POST" | "DELETE" = "GET",
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetcher(`${root}${path}`, {
        method,
        ...(body === undefined
          ? {}
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }),
      });
    } catch {
      throw new Error(
        "백엔드에 연결할 수 없습니다. 주소와 서버 상태를 확인하세요.",
      );
    }
    if (method === "DELETE" && response.status === 204) return undefined as T;
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new Error(
        response.ok
          ? "백엔드 응답이 JSON 형식이 아닙니다."
          : `요청 실패 (HTTP ${response.status})`,
      );
    }
    if (!response.ok) {
      const message =
        data &&
        typeof data === "object" &&
        "message" in data &&
        typeof data.message === "string"
          ? data.message
          : `요청 실패 (HTTP ${response.status})`;
      throw new Error(message);
    }
    if (!validShape(path, data, method === "POST"))
      throw new Error("백엔드 응답 형식이 올바르지 않습니다.");
    return data as T;
  }
  const appPath = (id: string) => `/app-spaces/${encodeURIComponent(id)}`;
  return {
    repositories: () => request<Repository[]>("/repositories"),
    registerRepository: (body: { repo_url: string; branch: string }) => request<Repository>("/repositories", body, "POST"),
    deleteRepository: (id: string) => request<void>(`/repositories/${encodeURIComponent(id)}`, undefined, "DELETE"),
    infras: () => request<InfraSpace[]>("/infra-spaces"),
    infra: (id: string) =>
      request<InfraSpace>(`/infra-spaces/${encodeURIComponent(id)}`),
    apps: () => request<AppSpace[]>("/app-spaces"),
    app: (id: string) => request<AppSpace>(appPath(id)),
    createApp: (body: AppSpaceCreate) =>
      request<AppSpace>("/app-spaces", body, "POST"),
    analyze: (id: string) =>
      request<Analysis>(`${appPath(id)}/analysis`, undefined, "POST"),
    analysis: (id: string) => request<Analysis>(`${appPath(id)}/analysis`),
    deploy: (id: string, compute: string) =>
      request<Deployment>(`${appPath(id)}/deployments`, { compute }, "POST"),
    deployment: (id: string) =>
      request<Deployment>(`/deployments/${encodeURIComponent(id)}`),
  };
}

type Stream = {
  addEventListener: (name: string, listener: EventListener) => void;
  close: () => void;
};
export function watchDeployment(
  base: string,
  id: string,
  onProgress: (event: DeploymentEvent) => void,
  onError: (message: string) => void,
  open: (url: string) => Stream = (url) => new EventSource(url),
) {
  const source = open(
    `${base.replace(/\/$/, "")}/deployments/${encodeURIComponent(id)}/events`,
  );
  source.addEventListener("progress", ((event: MessageEvent) => {
    try {
      const value = JSON.parse(event.data) as DeploymentEvent;
      if (
        !value ||
        !["pending", "building", "deploying", "success", "failed"].includes(
          value.status,
        ) ||
        typeof value.progress !== "number" ||
        value.progress < 0 ||
        value.progress > 100 ||
        typeof value.message !== "string" ||
        typeof value.step !== "string" ||
        typeof value.at !== "string" ||
        (value.url !== null && typeof value.url !== "string")
      )
        throw new Error("invalid");
      onProgress(value);
      if (value.status === "success" || value.status === "failed")
        source.close();
    } catch {
      source.close();
      onError("배포 이벤트 형식을 확인할 수 없습니다.");
    }
  }) as EventListener);
  source.addEventListener("error", () => {
    source.close();
    onError("배포 상태 연결이 끊겼습니다. 상태를 다시 확인하세요.");
  });
  return () => source.close();
}
