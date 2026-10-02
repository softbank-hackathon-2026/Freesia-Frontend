import { useEffect, useRef, useState } from "react";
import DeploymentResources from "./DeploymentResources.tsx";
import ApplicationLogs from "./ApplicationLogs.tsx";
import ApplicationMetrics from "./ApplicationMetrics.tsx";
import { ApiError, createApi, watchDeployment } from "../lib/api.ts";
import {
  availableCandidates,
  sampleAnalysis,
  validateApp,
} from "../lib/demo.ts";
import type { InfraDesign } from "../lib/demo.ts";
import type {
  Analysis,
  AppSpace,
  AppSpaceCreate,
  DataMode,
  Deployment,
  DeploymentEvent,
  InfraSpace,
  Repository,
  PlanSet,
} from "../lib/types.ts";
import { registeredRepositories } from "../lib/meeting.ts";
import type { MeetingState } from "../lib/meeting.ts";
import {
  advancePipeline,
  makeAppPlan,
  pipelineSteps,
  pipelineStepIds,
  demoStep,
  startDemoDeployment,
} from "../lib/pipeline.ts";
import type { AppPlan } from "../lib/pipeline.ts";
const apiBase = import.meta.env.VITE_API_BASE_URL || "/api";
const api = createApi(apiBase);
export default function Applications({
  mode,
  apps,
  infras,
  designs,
  deployments,
  onCreate,
  onDeployment,
  meeting,
  onIntegration,
  onStartDeployment,
  initialForm,
  onDraftChange,
  apiRepositories, repositoryLoading, repositoryError, onRefresh,
  loading, loadError, discardableApps, onDiscard, storageBlocked,
}: {
  mode: DataMode;
  apiRepositories: Repository[];
  repositoryLoading: boolean;
  repositoryError: string;
  onRefresh: () => void;
  loading: boolean;
  loadError: string;
  discardableApps: AppSpace[];
  onDiscard: (id: string, signal?: AbortSignal) => void | Promise<void>;
  storageBlocked: boolean;
  apps: AppSpace[];
  infras: InfraSpace[];
  designs: InfraDesign[];
  deployments: Deployment[];
  onCreate: (app: AppSpace) => void;
  onDeployment: (deployment: Deployment) => void;
  onStartDeployment: (deployment: Deployment) => void;
  initialForm: AppSpaceCreate | null;
  onDraftChange: (form: AppSpaceCreate) => void;
  meeting: MeetingState;
  onIntegration: () => void;
}) {
  const session = useRef(0);
  const request = useRef<AbortController | null>(null);
  const restored = useRef(false);
  const teardownRequest = useRef<string | null>(null);
  const teardownBaseline = useRef(new Map<string, string | null | undefined>());
  const demoResumeStatus = useRef<Deployment["status"]>("pending");
  const redeployDialog = useRef<HTMLDialogElement>(null);
  const redeployTarget = useRef<{ appId: string; deploymentId: string | undefined; session: number } | null>(null);
  const [redeployReviewed, setRedeployReviewed] = useState(false);
  const [redeployError, setRedeployError] = useState("");
  const discardDialog = useRef<HTMLDialogElement>(null);
  const discardRequest = useRef<AbortController | null>(null);
  const [discardId, setDiscardId] = useState("");
  const [discardError, setDiscardError] = useState("");
  const [discarding, setDiscarding] = useState(false);
  useEffect(
    () => () => {
      request.current?.abort();
      discardRequest.current?.abort();
      session.current++;
    },
    [],
  );
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<AppSpace | null>(null);
  const [form, setForm] = useState<AppSpaceCreate>(
    initialForm ?? {
      name: "",
      repo_url: "",
      branch: "main",
      infra_id: "",
    },
  );
  useEffect(() => onDraftChange(form), [form, onDraftChange]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [event, setEvent] = useState<DeploymentEvent | null>(null);
  const [streamId, setStreamId] = useState("");
  const [tab, setTab] = useState<"overview" | "logs" | "metrics">("overview");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [teardownError, setTeardownError] = useState("");
  const [teardownPending, setTeardownPending] = useState<string[]>([]);
  const [chosen, setChosen] = useState("");
  const [plan, setPlan] = useState<AppPlan | null>(null);
  const [plans, setPlans] = useState<PlanSet | null>(null);
  const [planId, setPlanId] = useState("");
  const [planError, setPlanError] = useState("");
  const [failCI, setFailCI] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [analysisPending, setAnalysisPending] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [streamError, setStreamError] = useState("");
  const [streamRetry, setStreamRetry] = useState(0);
  const demoRegistered = registeredRepositories(meeting.github);
  const registered = mode === "demo" ? demoRegistered : apiRepositories;
  const preview =
    plan ??
    (deployment?.demo_pipeline?.plan.compute === chosen
      ? deployment.demo_pipeline.plan
      : null);
  const infra = infras.find((i) => i.id === selected?.infra_id);
  const currentProgress = event?.progress ?? (mode === "demo" && deployment && demoStep(deployment) >= 0 ? Math.round(demoStep(deployment)/5*100) : undefined);
  const pendingTeardown = !!selected && teardownPending.includes(selected.id);
  const teardownStatus = selected?.teardown_status;
  const hasNewDeployment = !!deployment && !!selected?.teardown_requested_at && Date.parse(deployment.created_at) > Date.parse(selected.teardown_requested_at);
  const teardownComplete = mode === "api" && teardownStatus === "success" && !hasNewDeployment;
  const teardownUnconfirmed = mode === "api" && !!selected && (teardownStatus === "requested" || pendingTeardown || (teardownStatus === undefined && !!selected.teardown_requested_at));
  const appHistory = mode === "demo" ? deployments.filter(entry => entry.app_space_id === selected?.id) : [];
  const hasDeploymentHistory = !!deployment || !!selected?.latest_deployment_id || appHistory.length > 0;
  const lastSuccess = appHistory.filter(entry => entry.status === "success")
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  const reusablePlan = lastSuccess?.demo_pipeline?.plan;
  const canReusePlan = reusablePlan?.status === "template_ready" && reusablePlan.repo_url === selected?.repo_url && reusablePlan.branch === selected?.branch;
  const redeployBlocked = busy || discarding || loading || !!streamId || teardownUnconfirmed
    || (!!deployment && !["success", "failed"].includes(deployment.status))
    || (mode === "demo" ? storageBlocked || appHistory.some(entry => !["success", "failed"].includes(entry.status))
      : !!selected?.latest_deployment_id && !deployment);
  const teardownAppId = selected?.id;
  useEffect(() => {
    if (mode !== "api" || !teardownAppId || !teardownUnconfirmed || (busy && pendingTeardown)) return;
    const token = session.current;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const fresh = await api.app(teardownAppId!, controller.signal);
        if (controller.signal.aborted || token !== session.current) return;
        // An ambiguous POST may still finish after a GET; an old snapshot cannot unlock it.
        const confirmed = !pendingTeardown || fresh.teardown_status === "requested" || (!!fresh.teardown_requested_at && fresh.teardown_requested_at !== teardownBaseline.current.get(teardownAppId!));
        if (confirmed) {
          setSelected(current => current?.id === teardownAppId ? fresh : current);
          if (fresh.teardown_status !== undefined) {
            setTeardownError("");
            setTeardownPending(current => current.filter(id => id !== teardownAppId));
          }
          if (fresh.teardown_status !== undefined && fresh.teardown_status !== "requested") return;
        }
      } catch (e) {
        if (controller.signal.aborted || token !== session.current) return;
        setTeardownError(`내리기 상태 조회 실패 · 3초 후 다시 확인합니다. ${e instanceof Error ? e.message : "조회 오류"}`);
      }
      if (!controller.signal.aborted && token === session.current) timer = setTimeout(poll, 3000);
    }
    timer = setTimeout(poll, 3000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [mode, teardownAppId, teardownUnconfirmed, pendingTeardown, busy]);
  const canDeploy = mode === "demo" || infra?.deployable_computes?.includes(chosen) === true;
  const readinessMessage = infra?.deployable_computes === undefined ? "배포 가능 여부 미확인" : "배포 준비 중";
  const allowed = analysis
    ? availableCandidates(analysis.candidates, infra?.computes ?? [])
    : [];
  useEffect(() => {
    if (!streamId) return;
    const token = session.current;
    if (mode === "api")
      return watchDeployment(
        apiBase,
        streamId,
        (data) => {
          if (token !== session.current) return;
          setReconnecting(false);
          setEvent(data);
          setDeployment((current) =>
            current
              ? { ...current, status: data.status, url: data.url }
              : current,
          );
          if (data.status === "success" || data.status === "failed") {
            setStreamId("");
            void api.deployment(streamId).then(value => {
              if (token === session.current) setDeployment(current => current?.id === streamId ? value : current);
            }).catch(e => { if (token === session.current) setError(e instanceof Error ? e.message : "배포 결과 조회 실패"); });
          }
        },
        (message) => {
          if (token === session.current) { setReconnecting(true); setStreamError(message); }
        },
        undefined,
        () => { if (token === session.current) { setReconnecting(false); setStreamError(""); } },
      );
    if (deployment?.demo_pipeline) {
      let current = deployment;
      const timer = setInterval(() => {
        if (token !== session.current) return;
        current = advancePipeline(current);
        setDeployment(current);
        setEvent({
          status: current.status,
          progress: Math.round((demoStep(current) / 5) * 100),
          message: pipelineSteps[demoStep(current)],
          step: pipelineStepIds[demoStep(current)],
          url: null,
          at: new Date().toISOString(),
        });
        if (["success", "failed"].includes(current.status)) {
          clearInterval(timer);
          setStreamId("");
        }
      }, 650);
      return () => clearInterval(timer);
    }
    const steps = [
      ["building", 30, "컨테이너 빌드 샘플"],
      ["deploying", 70, "리소스 배포 샘플"],
      ["success", 100, "배포 완료 샘플"],
    ] as const;
    let index =
      demoResumeStatus.current === "deploying"
        ? 2
        : demoResumeStatus.current === "building"
          ? 1
          : 0;
    const timer = setInterval(() => {
      if (token !== session.current) return;
      const [status, progress, message] = steps[index++];
      setEvent({
        status,
        progress,
        message,
        step: "demo",
        url: status === "success" ? "https://sample.demo.freesia.dev" : null,
        at: new Date().toISOString(),
      });
      setDeployment((current) =>
        current
          ? {
              ...current,
              status,
              url:
                status === "success" ? "https://sample.demo.freesia.dev" : null,
            }
          : current,
      );
      if (index === steps.length) {
        clearInterval(timer);
        setStreamId("");
      }
    }, 650);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamId, mode, streamRetry]);
  useEffect(() => {
    if (deployment) onDeployment(deployment);
  }, [deployment, mode, onDeployment]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const token = session.current;
    if (mode === "api" && (repositoryLoading || repositoryError)) {
      setError("Repository 목록을 먼저 불러오세요.");
      return;
    }
    if (
      !registered.some(
        (r) => r.repo_url === form.repo_url && r.branch === form.branch,
      )
    ) {
      setError("통합에 등록된 Repository를 선택하세요.");
      return;
    }
    const clean = {
      ...form,
      name: form.name.trim(),
      repo_url: form.repo_url.trim(),
      branch: form.branch?.trim(),
    };
    const problem = validateApp(
      clean,
      infras.map((i) => i.id),
    );
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const app =
        mode === "demo"
          ? {
              ...clean,
              branch: clean.branch!,
              id: `demo-app-${crypto.randomUUID()}`,
              created_at: new Date().toISOString(),
              latest_deployment_id: null,
            }
          : await api.createApp(clean);
      if (token !== session.current) { onRefresh(); return; }
      onCreate(app);
      setCreating(false);
      restored.current = true;
      const url = new URL(window.location.href); url.searchParams.set("app", app.id); url.searchParams.set("source", mode); history.replaceState(null, "", url);
      setSelected(app);
      setAnalysis(null);
      setDeployment(null);
    } catch (e) {
      const uncertain = mode === "api" && e instanceof ApiError &&
        (!e.status || e.status >= 500 || e.status < 300);
      if (uncertain) onRefresh();
      if (token === session.current) {
        if (uncertain) setCreating(false);
        setError(uncertain
          ? "생성 결과를 확인하지 못했습니다. 목록을 다시 조회합니다. 같은 앱이 있는지 확인한 뒤 다시 시도하세요."
          : e instanceof Error ? e.message : "앱 생성 실패");
      }
    } finally {
      if (token === session.current) setBusy(false);
    }
  }
  function openRedeploy() {
    if (!selected || !hasDeploymentHistory || redeployBlocked) return;
    redeployTarget.current = { appId: selected.id, deploymentId: lastSuccess?.id, session: session.current };
    setRedeployReviewed(false); setRedeployError("");
    redeployDialog.current?.showModal();
    redeployDialog.current?.querySelector("h2")?.focus();
  }
  function redeploy() {
    const target = redeployTarget.current;
    if (mode !== "demo" || !selected || !target || target.appId !== selected.id || target.session !== session.current
      || target.deploymentId !== lastSuccess?.id || redeployBlocked || !redeployReviewed || !canReusePlan) return;
    try {
      const result = startDemoDeployment(selected.id, reusablePlan!, false);
      onStartDeployment(result);
      request.current?.abort(); session.current++;
      redeployTarget.current = null;
      setSelected({ ...selected, latest_deployment_id: result.id });
      setPlan(reusablePlan!); setChosen(result.compute); setReviewed(false); setFailCI(false);
      setError(""); setPlanError(""); setDeployment(result); setEvent(null); setStreamId(result.id);
      demoResumeStatus.current = result.status;
      redeployDialog.current?.close();
    } catch (e) {
      setRedeployError(e instanceof Error ? e.message : "재배포를 저장하지 못했습니다.");
    }
  }
  function backToList() {
    redeployDialog.current?.close(); redeployTarget.current = null;
    request.current?.abort();
    discardRequest.current?.abort();
    session.current++;
    setBusy(false);
    setDiscarding(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("app");
    history.replaceState(null, "", url);
    setSelected(null);
    setCreating(false);
    setStreamId("");
    setError("");
  }
  async function discard() {
    if (discardRequest.current || (selected && selected.id !== discardId) || !discardableApps.some(app => app.id === discardId)) return;
    const controller = new AbortController();
    discardRequest.current = controller;
    const token = session.current;
    setDiscarding(true);
    setDiscardError("");
    try {
      await onDiscard(discardId, controller.signal);
      if (token === session.current && !controller.signal.aborted) {
        discardDialog.current?.close();
        if (selected?.id === discardId) backToList();
      }
    } catch (e) {
      if (token === session.current && !controller.signal.aborted)
        setDiscardError(e instanceof Error ? e.message : "애플리케이션을 삭제하지 못했습니다.");
    } finally {
      if (discardRequest.current === controller) discardRequest.current = null;
      if (token === session.current) setDiscarding(false);
    }
  }
  async function open(app: AppSpace) {
    redeployDialog.current?.close(); redeployTarget.current = null;
    restored.current = true;
    request.current?.abort();
    const url = new URL(window.location.href);
    url.searchParams.set("app", app.id);
    url.searchParams.set("source", mode);
    history.replaceState(null, "", url);
    const token = ++session.current;
    setBusy(false);
    setSelected(app);
    setTeardownError("");
    setCreating(false);
    setAnalysis(null);
    setChosen("");
    setPlan(null); setPlans(null); setPlanId(""); setPlanError("");
    setReviewed(false);
    setAnalysisPending(false);
    setReconnecting(false);
    setEvent(null);
    setStreamId("");
    setError("");
    setTab("overview");
    setDeployment(
      mode === "demo"
        ? (deployments.find((d) => d.id === app.latest_deployment_id) ?? null)
        : null,
    );
    if (mode === "demo") {
      const saved = deployments.find((d) => d.id === app.latest_deployment_id);
      if (saved?.demo_pipeline) {
        setAnalysis(sampleAnalysis);
        setChosen(saved.compute);
      }
      demoResumeStatus.current = saved?.status ?? "pending";
      if (saved && !["success", "failed"].includes(saved.status))
        setStreamId(saved.id);
    }
    if (mode === "api") {
      try {
        const fresh = await api.app(app.id);
        if (token !== session.current) return;
        setSelected(fresh);
        if (fresh.latest_deployment_id) {
          const value = await api.deployment(fresh.latest_deployment_id);
          if (token !== session.current) return;
          setDeployment(value);
          setStreamId(value.id);
        }
      } catch (e) {
        if (token === session.current)
          setError(e instanceof Error ? e.message : "상태 조회 실패");
      }
    }
  }
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("app");
    if (restored.current || !id || !apps.length) return;
    restored.current = true;
    const app = apps.find(a => a.id === id);
    // URL restoration synchronizes this view with browser navigation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (app) void open(app);
    // Restore only on entry; app updates must not restart an active request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apps]);
  async function analyze() {
    if (!selected || busy || discarding || !!streamId || teardownUnconfirmed) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const token = session.current;
    setBusy(true); setAnalysisPending(true); setError("");
    setPlan(null); setPlans(null); setPlanId(""); setPlanError(""); setReviewed(false); setChosen(""); setAnalysis(null);
    try {
      const result = mode === "demo" ? sampleAnalysis : await api.analyzeUntilDone(selected.id, {signal: controller.signal});
      if (token !== session.current || controller.signal.aborted) return;
      if(result.status === "failed") throw new Error("분석에 실패했습니다. 배포 버튼으로 다시 분석하세요.");
      setAnalysis(result);
    } catch (e) {
      if (token === session.current && !controller.signal.aborted)
        setError(e instanceof Error ? e.message : "분석 실패");
    } finally {
      if (token === session.current && !controller.signal.aborted) { setBusy(false); setAnalysisPending(false); }
    }
  }
  async function preparePlans() {
    if (!selected || !chosen || !canDeploy) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const token = session.current;
    setBusy(true); setError(""); setPlanError(""); setPlan(null); setPlans(null); setPlanId(""); setReviewed(false);
    try {
      if (mode === "demo") setPlan(makeAppPlan(selected, chosen, allowed, demoRegistered));
      else {
        const result = await api.plansUntilDone(selected.id, chosen, { signal: controller.signal });
        if (token !== session.current || controller.signal.aborted) return;
        if(result.status === "failed") throw new Error("구성안 준비에 실패했습니다. 구성안을 다시 조회하세요.");
        if(result.compute !== chosen) throw new Error("선택한 실행 환경과 구성안 응답이 다릅니다. 다시 조회하세요.");
        setPlans(result);
        if (result.plans.length === 1) setPlanId(result.plans[0].id);
      }
    } catch(e) {
      if (token === session.current && !controller.signal.aborted)
        setPlanError(e instanceof ApiError && e.code === "compute_not_ready" ? "선택한 실행 환경은 배포 준비 중입니다. 다른 후보를 선택하거나 서버 지원 상태를 확인하세요." : e instanceof ApiError && (e.status === 404 || e.status === 501) ? "구성안 API 연동 대기입니다. 서버에 템플릿과 설정값 조회 기능이 아직 없습니다." : e instanceof Error ? e.message : "구성안 조회 실패");
    } finally { if (token === session.current && !controller.signal.aborted) setBusy(false); }
  }
  async function deploy() {
    if (!selected || !reviewed || !canDeploy || teardownUnconfirmed || !allowed.some(c => c.compute === chosen)) return;
    const realPlan = plans?.compute === chosen && plans.status === "done" ? plans.plans.find(p => p.id === planId) : null;
    if ((mode === "api" && !realPlan) || (mode === "demo" && (!preview || preview.compute !== chosen || preview.status !== "template_ready"))) {
      setError("현재 선택한 환경의 구성안을 조회하고 설정값을 확인하세요."); return;
    }
    const token = ++session.current;
    request.current?.abort(); const controller = new AbortController(); request.current = controller;
    setBusy(true); setError("");
    try {
      const result = mode === "demo" ? startDemoDeployment(selected.id, preview!, failCI) : await api.deploy(selected.id, chosen, realPlan!.id, controller.signal);
      if (token !== session.current || controller.signal.aborted) return;
      onStartDeployment(result); demoResumeStatus.current = result.status;
      setDeployment(result); setEvent(null); setStreamId(result.id);
    } catch(e) {
      if(token !== session.current || controller.signal.aborted) return;
      setError(e instanceof ApiError && e.code === "compute_not_ready" ? "선택한 실행 환경은 배포 준비 중입니다. 서버 지원 상태를 확인하세요." : e instanceof Error ? e.message : "배포 요청 실패");
      if (e instanceof ApiError && e.status === 409 && e.code === "teardown_in_progress") {
        setSelected(current => current?.id === selected.id ? { ...current, teardown_status: "requested" } : current);
        setError("");
        setTeardownError("앱을 내리는 중입니다. 완료 후 다시 배포하세요.");
      }
      if (e instanceof ApiError && e.status === 409 && e.code === "deployment_in_progress") {
        try {
          const fresh = await api.app(selected.id, controller.signal);
          if(token !== session.current || controller.signal.aborted) return;
          setSelected(fresh);
          if(fresh.latest_deployment_id) {
            const existing = await api.deployment(fresh.latest_deployment_id, controller.signal);
            if(token !== session.current || controller.signal.aborted) return;
            setDeployment(existing); setEvent(null); setStreamId(existing.id);
          }
        } catch(refreshError) {
          if(token === session.current && !controller.signal.aborted) setError(`${e.message} · 현재 배포 조회 실패: ${refreshError instanceof Error ? refreshError.message : "다시 앱을 열어 확인하세요."}`);
        }
      }
    }
    finally { if(token === session.current && !controller.signal.aborted)setBusy(false); }
  }
  async function teardown() {
    if (mode !== "api" || !selected || (selected.teardown_status === undefined && selected.teardown_requested_at !== null) || teardownComplete || teardownUnconfirmed || !deployment || !["success", "failed"].includes(deployment.status) || busy || streamId || teardownPending.includes(selected.id) || teardownRequest.current === selected.id) return;
    if (!window.confirm(`${selected.name} 앱을 내릴까요? 앱 전용 클라우드 자원이 삭제될 수 있습니다. 공유 네트워크 등 삭제 범위는 배포 설정을 확인하세요.`)) return;
    const appId = selected.id;
    teardownRequest.current = appId;
    teardownBaseline.current.set(appId, selected.teardown_requested_at);
    setTeardownPending(current => [...current, appId]);
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const token = session.current;
    setBusy(true); setTeardownError("");
    try {
      const receipt = await api.teardown(appId, controller.signal);
      if (token !== session.current || controller.signal.aborted) return;
      setSelected(current => current?.id === appId ? { ...current, teardown_requested_at: receipt.requested_at, teardown_status: "requested", teardown_finished_at: null, teardown_reason: null } : current);
      setTeardownPending(current => current.filter(id => id !== appId));
    } catch (e) {
      if (token !== session.current || controller.signal.aborted) return;
      if (e instanceof ApiError && ([404, 501].includes(e.status ?? 0) || (e.status === 502 && e.code === "teardown_failed") || (e.status === 409 && ["not_deployed", "deployment_in_progress", "teardown_in_progress"].includes(e.code ?? "")))) setTeardownPending(current => current.filter(id => id !== appId));
      if (e instanceof ApiError && e.code === "teardown_in_progress") {
        setSelected(current => current?.id === appId ? { ...current, teardown_status: "requested" } : current);
      }
      setTeardownError(e instanceof ApiError && e.status === 502 && e.code === "teardown_failed" ? `내리기 실행 요청에 실패했습니다. 다시 시도할 수 있습니다. ${e.message}`
        : e instanceof ApiError && e.code === "teardown_in_progress" ? "이미 앱을 내리는 중입니다. 완료 상태를 확인하고 있습니다."
        : e instanceof ApiError && e.code === "not_deployed" ? "실제 배포 기록이 없어 내릴 수 없습니다. 모의 배포는 내리기 대상이 아닙니다."
        : e instanceof ApiError && e.code === "deployment_in_progress" ? "배포가 진행 중입니다. 현재 배포 상태를 확인한 뒤 다시 시도하세요."
        : e instanceof ApiError && (e.status === 404 || e.status === 501) ? "내리기 API 연동 대기입니다. 현재 서버에서 지원하지 않습니다."
        : `내리기 요청의 처리 여부를 확인할 수 없습니다. 중복 요청 전에 담당자에게 확인하세요. ${e instanceof Error ? e.message : "요청 오류"}`);
      if (e instanceof ApiError && ["deployment_in_progress", "teardown_failed"].includes(e.code ?? "")) {
        try {
          const fresh = await api.app(appId, controller.signal);
          if (token !== session.current || controller.signal.aborted) return;
          setSelected(fresh);
          if (e.code === "teardown_failed" && fresh.teardown_status !== undefined) {
            setTeardownPending(current => current.filter(id => id !== appId));
            setTeardownError(`내리기 실행 요청에 실패했습니다. 다시 시도할 수 있습니다. ${e.message}`);
          }
          if (e.code === "deployment_in_progress" && fresh.latest_deployment_id) {
            const current = await api.deployment(fresh.latest_deployment_id, controller.signal);
            if (token !== session.current || controller.signal.aborted) return;
            setDeployment(current); setEvent(null); setStreamId(current.id);
          }
        } catch { /* Preserve the original conflict if refreshing fails. */ }
      }
    } finally {
      if (teardownRequest.current === appId) teardownRequest.current = null;
      if (token === session.current && !controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">APPLICATION</div>
          <h1>
            {selected ? selected.name : creating ? "애플리케이션 생성" : "애플리케이션"}
          </h1>
          <p>
            {selected
              ? "기반·분석 근거·배포 상태를 확인하세요."
              : "통합에 등록한 Repository와 준비된 Infra Space를 선택하세요."}
          </p>
        </div>
        {(selected || creating) && (
          <div className="heading-actions">
            {selected && <button className="secondary"
              disabled={discarding || busy || teardownUnconfirmed || !!deployment && !["success", "failed"].includes(deployment.status) || (mode === "demo" && storageBlocked) || !discardableApps.some(app => app.id === selected.id)}
              title={mode === "demo" ? "배포 이력 없는 DEMO 애플리케이션 삭제" : "배포·내리기 중에는 삭제할 수 없습니다."}
              onClick={() => { setDiscardId(selected.id); setDiscardError(""); discardDialog.current?.showModal(); }}>
              애플리케이션 삭제
            </button>}
            <button disabled={discarding} onClick={backToList}>앱 목록으로</button>
          </div>
        )}
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {mode === "api" && !selected && (
        <p className="notice">
          서버에 등록된 Repository와 Infra Space로 앱을 생성합니다. 분석·배포 결과는 서버가 제공하며 실제 실행 여부는 서버 설정과 상태를 확인하세요.
        </p>
      )}
      {mode === "api" && repositoryError && <div className="error" role="alert">{repositoryError}<button onClick={onRefresh}>Repository 다시 조회</button></div>}
      {creating && mode === "api" && repositoryLoading ? <p role="status">Repository 불러오는 중…</p> : creating && !registered.length ? (
        <section className="panel detail">
          <h2>등록한 Repository가 없습니다</h2>
          <p>통합에서 사용할 public GitHub Repository URL을 먼저 등록하세요.</p>
          <button className="primary" onClick={onIntegration}>
            통합에서 Repository 등록
          </button>
        </section>
      ) : creating ? (
        <form className="panel app-form" onSubmit={submit}>
          <h2>저장소와 배포 기반</h2>
          <label htmlFor="app-name">앱 이름</label>
          <input
            id="app-name"
            maxLength={80}
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <label htmlFor="registered-repo">등록한 Repository</label>
          <select
            id="registered-repo"
            value={registered.find((repo) => repo.repo_url === form.repo_url && repo.branch === form.branch)?.id ?? ""}
            onChange={(e) => {
              const repo = registered.find(
                (r) => r.id === e.target.value,
              );
              setForm((f) => ({
                ...f,
                repo_url: repo?.repo_url ?? "",
                branch: repo?.branch ?? "main",
              }));
            }}
          >
            <option value="">Repository 선택</option>
            {registered.map((repo) => (
              <option key={repo.id} value={repo.id}>
                {repo.name} · {repo.branch}
              </option>
            ))}
          </select>
          <p className="muted">
            등록된 브랜치: {form.branch} · 실제 GitHub 접근 미확인
          </p>
          <label htmlFor="infra-select">Infra Space</label>
          <select
            id="infra-select"
            value={form.infra_id}
            onChange={(e) =>
              setForm((f) => ({ ...f, infra_id: e.target.value }))
            }
          >
            <option value="">기반 선택</option>
            {infras.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
            {mode === "demo" &&
              designs.map((d) => (
                <option key={d.id} value={d.id} disabled>
                  {d.name} — 미구축 · 선택 불가
                </option>
              ))}
          </select>
          <p className="muted">
            Terraform 설계는 적용·리소스 동기화 후 사용할 수 있습니다. 현재 이
            과정은 연결되지 않았습니다.
          </p>
          {busy && <p role="status">앱을 생성하고 있습니다. 화면을 이동해도 서버의 생성 작업은 계속됩니다.</p>}
          <div className="form-actions">
            <button className="primary" disabled={busy}>
              {busy ? "생성 중…" : "애플리케이션 생성"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                request.current?.abort();
                session.current++;
                setBusy(false);
                setCreating(false);
              }}
            >
              취소
            </button>
          </div>
        </form>
      ) : selected ? (
        <>
          <div className="tabs" role="tablist" aria-label="앱 상세">
            <button
              role="tab"
              aria-selected={tab === "overview"}
              onClick={() => setTab("overview")}
            >
              개요
            </button>
            <button
              role="tab"
              aria-selected={tab === "logs"}
              onClick={() => setTab("logs")}
            >
              로그
            </button>
            <button
              role="tab"
              aria-selected={tab === "metrics"}
              onClick={() => setTab("metrics")}
            >
              모니터링
            </button>
          </div>
          <div role="tabpanel">
            {tab === "overview" ? (
              <>
                <section className="panel detail">
                  <div className="section-heading">
                    <h2>앱 정보</h2>
                    <span className="badge">
                      {mode === "demo" ? "데모 앱" : "서버 등록 앱"}
                    </span>
                  </div>
                  <dl>
                    <dt>저장소</dt>
                    <dd className="break-word">{selected.repo_url}</dd>
                    <dt>브랜치</dt>
                    <dd>{selected.branch}</dd>
                    <dt>연결한 기반</dt>
                    <dd>{infra?.name ?? selected.infra_id}</dd>
                  </dl>
                </section>
                {hasDeploymentHistory && <section className="panel detail" aria-label="새 버전 재배포">
                  <div className="section-heading">
                    <h2>새 버전 재배포</h2>
                    <button className="primary" disabled={redeployBlocked} onClick={openRedeploy}>새 버전 재배포</button>
                  </div>
                  <p>이전 성공 설정을 유지하는 재배포입니다. 설정을 바꾸려면 아래의 재분석을 선택하세요.</p>
                  <p className="muted">{mode === "demo" ? "DEMO · 저장된 설정으로 로컬 배포 과정을 시연합니다." : "연동 대기 · 최신 커밋 확인과 이전 성공 설정 재사용을 서버에서 지원해야 실행할 수 있습니다."}</p>
                  {redeployBlocked && <p role="status">진행 중인 작업이나 상태 조회가 끝난 뒤 다시 확인하세요. 저장 오류가 있다면 먼저 해결하세요.</p>}
                </section>}
                <section className="panel">
                  <div className="section-heading">
                    <h2>코드 분석과 배포 선택</h2>
                    <button
                      className="primary"
                      disabled={busy || discarding || !!streamId || teardownUnconfirmed}
                      onClick={analyze}
                    >
                      {busy
                        ? analysisPending ? "분석 중…" : "요청 중…"
                        : hasDeploymentHistory
                          ? "설정 변경 · 재분석"
                          : analysis ? "분석 다시 보기" : "배포"}
                    </button>
                  </div>
                  <div className="panel-body">
                    <p className="muted">
                      {mode === "demo"
                        ? "고정 샘플 분석입니다. 저장소 코드를 읽거나 AI를 호출하지 않습니다."
                        : "서버가 반환한 요구사항·근거·실행 환경 후보입니다. 추천과 현재 배포 지원 여부를 구분해 확인하세요."}
                    </p>
                    {hasDeploymentHistory && <p className="notice">{mode === "demo" ? "재분석은 별도 샘플 구성 선택 과정입니다. 기존 성공 설정이 바뀔 수 있습니다." : "재분석은 AI 분석과 새 구성 선택 과정이며 기존 설정이 바뀔 수 있습니다. 현재 서버에서 새 코드를 반영하려면 이 과정을 거쳐야 합니다."}</p>}
                    {analysisPending && <p role="status">코드를 분석하고 있습니다. 완료까지 자동으로 다시 조회합니다.</p>}
                    {analysis ? (
                      <>
                        {mode === "demo" && <div
                          className="decision-tree"
                          role="img"
                          aria-label="읽기 전용 분석 분기 트리"
                        >
                          <strong>
                            고정 샘플 근거 · README / package.json / Dockerfile
                          </strong>
                          <ul>
                            <li>
                              <span>HTTP 서버·상시 실행이 필요한가?</span>
                              <ul>
                                <li>
                                  <em>예 · 컨테이너 실행 검토</em>
                                  <strong>
                                    {allowed.find(
                                      (c) => c.compute === "ecs-fargate",
                                    )
                                      ? "ECS Fargate · 적합 후보"
                                      : "기반에서 지원하는 다른 후보 검토"}
                                  </strong>
                                </li>
                                <li>
                                  <em>이벤트·짧은 요청형으로 구성 가능한가?</em>
                                  <strong>
                                    {allowed.find((c) => c.compute === "lambda")
                                      ? "Lambda · 적합 대안"
                                      : "함수 환경은 이 기반에서 제외"}
                                  </strong>
                                </li>
                              </ul>
                            </li>
                          </ul>
                          {allowed.some((c) => c.compute === "ec2") && (
                            <ul>
                              <li>
                                <em>VM 수준 관리가 필요한가?</em>
                                <strong>EC2 · 적합 후보</strong>
                              </li>
                            </ul>
                          )}
                          <small>
                            조건 분기는 설명용 샘플입니다. 실제 코드 분석·조건
                            판정이 아닙니다.
                          </small>
                        </div>}
                        <h3>확인된 요구사항</h3>
                        <ul>
                          {analysis.requirements.map((r) => (
                            <li key={r}>{r}</li>
                          ))}
                        </ul>
                        <h3>근거와 불확실성</h3>
                        <div className="evidence-list">
                          {analysis.evidence.map((e, i) => (
                            <div key={i}>
                              <span
                                className={
                                  "badge " + (e.certain ? "" : "caution")
                                }
                              >
                                {e.certain ? mode === "demo" ? "샘플 근거" : "서버 분석 근거" : "불확실"}
                              </span>
                              <strong>{e.file}</strong>
                              <p>{e.finding}</p>
                            </div>
                          ))}
                        </div>
                        <h3>실행 환경 후보</h3>
                        {allowed.length < 2 && (
                          <p className="notice">
                            현재 기반과 분석 결과에서 적합한 후보는{" "}
                            {allowed.length}개입니다. 적합하지 않은 환경을
                            대안으로 채우지 않습니다. 기반의 실행 환경 지원
                            범위와 분석 조건을 확인하세요.
                          </p>
                        )}
                        <div className="candidate-grid">
                          {allowed.map((c) => (
                            <div
                              key={c.compute}
                              className={
                                "candidate " +
                                (chosen === c.compute ? "chosen" : "")
                              }
                            >
                              <div className="candidate-title">
                                <strong>{c.compute}</strong>
                                <span className="badge">
                                  {c.state === "selected"
                                    ? "추천"
                                    : c.state === "alternative"
                                      ? "대안"
                                      : "제외"}
                                </span>
                              </div>
                              {mode === "api" && !infra?.deployable_computes?.includes(c.compute) && <p className="badge caution">{readinessMessage}</p>}
                              <p>{c.reason}</p>
                              {!!c.evidence_files?.length && <p className="muted">근거 파일: {c.evidence_files.join(", ")}</p>}
                              <ul>
                                {c.cons.map((reason) => (
                                  <li key={reason}>{reason}</li>
                                ))}
                              </ul>
                              <button
                                disabled={
                                  !allowed.some(
                                    (a) => a.compute === c.compute,
                                  ) || !!streamId || busy
                                }
                                onClick={() => {
                                  setChosen(c.compute);
                                  setReviewed(false);
                                  setPlan(null); setPlans(null); setPlanId(""); setPlanError("");
                                }}
                              >
                                {!infra?.computes.includes(c.compute)
                                  ? "기반에서 미지원"
                                  : c.state === "unsuitable"
                                    ? "추천 제외"
                                    : chosen === c.compute
                                      ? "사용자 선택됨"
                                      : "이 후보 선택"}
                              </button>
                            </div>
                          ))}
                        </div>
                        {analysis.mascot_message && (
                          <div className="mascot">
                            <img
                              src="/freesia-mascot.jpg"
                              alt="Freesia 집 캐릭터"
                            />
                            <p>{analysis.mascot_message}</p>
                          </div>
                        )}
                        <div className="deploy-actions">
                          <div>
                            <strong>사용자 선택: {chosen || "없음"}</strong>
                            <p className="muted">
                              추천 표시와 사용자 선택은 별개입니다.
                              {mode === "demo" ? " 실제 클라우드 변경 없이 샘플 상태만 진행합니다." : " 선택 후 서버의 템플릿과 설정값을 검토합니다."}
                            </p>
                          </div>
                          {mode === "api" && chosen && !canDeploy && <p role="status">{readinessMessage} · 추천 결과는 확인할 수 있지만 현재 이 환경으로 배포할 수 없습니다.</p>}
                          <button className="primary" disabled={busy || !!streamId || !chosen || !canDeploy || analysis.status !== "done"} onClick={preparePlans}>
                            선택한 환경으로 구성안 조회
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="empty">
                        <p>
                          코드 분석을 시작하면 요구사항과 후보별 이유를 볼 수
                          있습니다.
                        </p>
                      </div>
                    )}
                  </div>
                </section>
                {(preview || chosen) && (
                  <section className="panel detail" aria-label="배포 변경 확인">
                    <div className="section-heading"><h2>템플릿 · 설정값 검토</h2><span className="badge caution">{mode === "demo" ? "샘플 구성안" : "서버 구성안"}</span></div>
                    <p>실행 환경: {chosen}</p>
                    {planError && <p role="alert">{planError}</p>}
                    {busy && !analysisPending && <p role="status">요청 처리 중…</p>}
                    {mode === "api" && !plans && !planError && <p>구성안 조회 후 템플릿과 설정값을 확인하세요.</p>}
                    {mode === "api" && plans && (plans.plans.length ? <div className={plans.plans.length > 1 ? "candidate-grid" : undefined}>{plans.plans.map(p => <div className={"candidate " + (planId === p.id ? "chosen" : "")} key={p.id}>
                      <h3>{p.name}</h3><p>{p.summary}</p><p>템플릿: {p.template}</p>
                      <ul>{p.pros.map((v,i)=><li key={i}>장점: {v}</li>)}{p.cons.map((v,i)=><li key={i}>고려사항: {v}</li>)}</ul>
                      {(chosen === "ecs-fargate" || "container_port" in p.values) && <><p>컨테이너 포트: {typeof p.values.container_port === "number" && Number.isInteger(p.values.container_port) && p.values.container_port >= 1 && p.values.container_port <= 65535 ? p.values.container_port : "서버 값 확인 필요"}</p>
                      {!(typeof p.values.container_port === "number" && Number.isInteger(p.values.container_port) && p.values.container_port >= 1 && p.values.container_port <= 65535) && <p className="notice">container_port가 없거나 유효한 포트가 아닙니다. 앱의 실제 수신 포트와 서버 구성안을 확인하세요. 프론트에서는 값을 보정하지 않습니다.</p>}</>}
                      <pre tabIndex={0} aria-label={p.name + " 설정값"}>{JSON.stringify(p.values,null,2)}</pre>
                      {plans.plans.length > 1 && <button disabled={busy || !!streamId} onClick={()=>{setPlanId(p.id);setReviewed(false);}}>{planId===p.id?"구성안 선택됨":"이 구성안 선택"}</button>}
                    </div>)}</div> : <p>제공된 구성안이 없습니다. 다시 조회하거나 분석 결과를 확인하세요.</p>)}
                    {mode === "demo" && preview && (preview.status === "template_ready" ? <><p>템플릿: {preview.template}</p><pre tabIndex={0} aria-label="샘플 템플릿 설정값">{JSON.stringify(preview.values,null,2)}</pre><p className="notice">고정 샘플 템플릿과 설정값입니다. 저장소 commit/push와 실제 클라우드 작업은 실행하지 않습니다.</p></> : <><p>이전 버전의 코드 기록입니다. 새 구성안을 조회해야 배포할 수 있습니다.</p><pre tabIndex={0}>{preview.code}</pre></>)}
                    <label className="failure-option"><input type="checkbox" checked={reviewed} disabled={busy || !!streamId || (mode === "api" ? !planId : preview?.status !== "template_ready")} onChange={e=>setReviewed(e.target.checked)}/> 설정값을 확인했습니다</label>
                    {mode === "demo" && <label className="failure-option"><input type="checkbox" checked={failCI} onChange={e=>setFailCI(e.target.checked)} disabled={!!streamId}/> CI 실패 시뮬레이션 · DEMO</label>}
                    <button className="primary" disabled={!reviewed || !canDeploy || teardownUnconfirmed || !!streamId || busy || (mode === "api" ? !planId : preview?.status !== "template_ready")} onClick={deploy}>{mode === "demo" && deployment?.status === "failed" ? "실패한 데모 파이프라인 재시도" : `선택한 구성안으로 배포${mode === "demo" ? " · 데모" : ""}`}</button>
                  </section>
                )}
                {deployment && (
                  <section className="panel">
                    <div className="section-heading">
                      <h2>배포 상태</h2>
                      <span className="badge">{deployment.status}</span>
                    </div>
                    <div className="panel-body">
                      <p>{event?.message ?? "현재 배포 상태를 표시합니다."}</p>
                      {reconnecting && <p role="status">배포 연결 복구 중… {streamError} <button onClick={()=>{setStreamError("");setStreamRetry(n=>n+1);}}>배포 상태 다시 연결</button></p>}
                      <ol className="pipeline-steps">
                        {pipelineSteps.map((step,i)=>{
                          const current = mode === "demo" ? demoStep(deployment) : pipelineStepIds.indexOf(event?.step ?? "");
                          const label = current < 0 ? "확인 중" : i < current || (i === current && deployment.status === "success") ? "완료" : i === current ? deployment.status === "failed" ? "실패" : "진행 중" : "대기";
                          return <li key={step} className={label === "완료" ? "complete" : ""}><span>{label}</span>{step}</li>;
                        })}
                      </ol>
                      {mode === "demo" && <p className="notice">로컬 샘플 진행입니다. 외부 GitHub·AWS 작업은 실행하지 않습니다.</p>}
                      {deployment.demo_pipeline && deployment.status === "failed" && <button onClick={()=>{setPlan(deployment.demo_pipeline!.plan);setChosen(deployment.compute);setReviewed(false);setFailCI(false);}}>실패 내용 확인 · 재시도 준비</button>}
                      <progress max={100} value={currentProgress} aria-label="배포 진행률"/>
                      <p>{currentProgress === undefined ? "현재 진행률 확인 중…" : `${currentProgress}%`}</p>
                      <p>실행 환경: {deployment.compute}</p>
                      {deployment.url && !teardownComplete && (
                        <p className="break-word">
                          {mode === "demo" ? "샘플 URL" : "서버 보고 URL"}: <code>{deployment.url}</code>
                        </p>
                      )}
                      <p className="notice">
                        URL 연결·고객 앱 헬스체크는 검증되지 않았습니다. 플랫폼
                        /health는 고객 앱 상태가 아닙니다.
                      </p>
                      {deployment.reason && (
                        <p role="alert">{deployment.reason}</p>
                      )}
                    </div>
                  </section>
                )}
                {mode === "api" && deployment && <section className="panel" aria-label="앱 내리기">
                  <div className="section-heading"><h2>앱 내리기</h2></div>
                  <div className="panel-body">
                  {teardownStatus === "requested" ? <p role="status">앱을 내리는 중입니다. 3초마다 상태를 확인합니다. {selected.teardown_requested_at && `요청 시각: ${selected.teardown_requested_at}`} 화면을 이동해도 접수된 작업은 계속됩니다.</p>
                    : teardownComplete ? <p role="status">내림 완료{selected.teardown_finished_at ? `: ${selected.teardown_finished_at}` : ""} · 이전 앱 주소는 더 이상 사용할 수 없습니다. 다시 배포할 수 있습니다.</p>
                    : teardownStatus === "failed" && !hasNewDeployment ? <p role="alert">내리기 실패: {selected.teardown_reason || "서버에서 실패 이유를 제공하지 않았습니다."} 다시 시도할 수 있습니다.</p>
                    : teardownStatus === undefined && selected.teardown_requested_at === undefined ? <p>내리기 API 연동 대기 · 현재 서버는 내리기 요청 상태를 제공하지 않습니다.</p>
                    : teardownStatus === undefined && selected.teardown_requested_at ? <p role="status">내리기 요청 접수: {selected.teardown_requested_at} · 현재 서버는 완료·실패 상태를 제공하지 않습니다. 확인 전에는 다시 요청할 수 없습니다.</p>
                    : <p>앱 전용 자원을 내리는 요청입니다. 요청 접수는 삭제 완료가 아닙니다. 화면을 이동해도 서버에 접수된 작업은 취소되지 않습니다.</p>}
                  {pendingTeardown && teardownStatus !== "requested" && <p role="status">내리기 요청 중이거나 처리 여부가 확인되지 않았습니다. 서버 상태를 다시 확인하는 동안 내리기·재배포를 잠시 막습니다.</p>}
                  {teardownError && <p role="alert">{teardownError}</p>}
                  <button disabled={(teardownStatus === undefined && selected.teardown_requested_at !== null) || teardownComplete || teardownUnconfirmed || busy || !!streamId || !["success", "failed"].includes(deployment.status)} onClick={teardown}>앱 내리기</button>
                  </div>
                </section>}
                {mode === "api" && deployment && <DeploymentResources key={deployment.id} id={deployment.id} refresh={`${event?.at ?? "initial"}:${selected.teardown_status ?? "none"}:${selected.teardown_finished_at ?? ""}`} appName={selected.name}/>}
              </>
            ) : tab === "logs" ? (
              <ApplicationLogs key={`${mode}:${selected.id}:${deployment?.id ?? selected.latest_deployment_id ?? "none"}:${deployment?.status ?? "none"}:${selected.teardown_status ?? "none"}:${selected.teardown_requested_at ?? ""}:${selected.teardown_finished_at ?? ""}`} id={selected.id} mode={mode}/>
            ) : (
              <ApplicationMetrics key={`${mode}:${selected.id}:${deployment?.id ?? selected.latest_deployment_id ?? "none"}:${deployment?.status ?? "none"}:${selected.teardown_status ?? "none"}:${selected.teardown_requested_at ?? ""}:${selected.teardown_finished_at ?? ""}`} id={selected.id} mode={mode}/>
            )}
          </div>
        </>
      ) : (
        <>
        <section className="panel app-space-list">
          <div className="section-heading">
            <h2>애플리케이션</h2>
            <div className="heading-actions">
              <span className="badge">{loading ? "조회 중" : loadError ? "조회 실패" : `${apps.length}개`}</span>
              <button className="secondary icon-button" aria-label="새로고침" title="새로고침" disabled={loading || repositoryLoading} onClick={onRefresh}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 7v5h-5M4 17v-5h5" />
                  <path d="M6.1 6.1A8 8 0 0 1 20 12M4 12a8 8 0 0 0 13.9 5.9" />
                </svg>
              </button>
              <button
                className="primary"
                disabled={loading || (mode === "api" && repositoryLoading)}
                onClick={() => {
                  request.current?.abort();
                  session.current++;
                  setBusy(false);
                  setCreating(true);
                  setAnalysis(null); setChosen(""); setPlan(null); setEvent(null); setDeployment(null); setTab("overview");
                  setError("");
                }}
              >
                애플리케이션 생성
              </button>
              <button className="secondary" disabled={loading || repositoryLoading || discarding || (mode === "demo" && storageBlocked) || !discardableApps.length}
                title={mode === "api" ? "애플리케이션을 목록에서 삭제" : "배포 이력 없는 DEMO 애플리케이션 삭제"}
                onClick={() => { setDiscardId(discardableApps[0].id); setDiscardError(""); discardDialog.current?.showModal(); }}>
                애플리케이션 삭제
              </button>
            </div>
          </div>
          {loading ? <div className="empty" role="status">애플리케이션 불러오는 중…</div> : loadError ? <p className="empty">목록을 확인하지 못했습니다. 앱 목록을 다시 조회하세요.</p> : apps.length ? (
            <div className="app-space-cards">
              {apps.map((app) => {
                const cardId = `app-card-${encodeURIComponent(app.id)}`;
                const repository = registered.find((repo) => repo.repo_url === app.repo_url && repo.branch === app.branch);
                const linkedInfra = infras.find((item) => item.id === app.infra_id);
                const integrationName = mode === "api" && repositoryLoading ? "통합 정보 불러오는 중…"
                  : mode === "api" && repositoryError ? "통합 정보 조회 실패"
                  : repository ? repository.name.trim() || "통합 이름 미제공" : "통합 등록 정보 없음";
                return (
                  <button className="app-space-card" key={app.id} aria-label={`${app.name} 상세 보기`} aria-describedby={`${cardId}-integration ${cardId}-infra ${cardId}-branch`} onClick={() => open(app)}>
                    <span className="app-card-field">
                      <span className="app-card-label">애플리케이션 이름</span>
                      <strong className="app-card-name">{app.name}</strong>
                    </span>
                    <span className="app-card-field" id={`${cardId}-integration`}>
                      <span className="app-card-label">연결된 통합</span>
                      <strong>{integrationName}</strong>
                      <span className="app-card-reference">{app.repo_url}</span>
                    </span>
                    <span className="app-card-field" id={`${cardId}-infra`}>
                      <span className="app-card-label">연결된 인프라 스페이스</span>
                      <strong>{linkedInfra ? linkedInfra.name.trim() || "인프라 이름 미제공" : "인프라 이름 미확인"}</strong>
                      {!linkedInfra?.name.trim() && <span className="app-card-reference">{app.infra_id}</span>}
                    </span>
                    <span className="app-card-footer"><span id={`${cardId}-branch`}>브랜치 {app.branch}</span><span>상세 보기 →</span></span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="empty">
              <div className="empty-icon">◫</div>
              <h2>아직 애플리케이션이 없습니다</h2>
              <p>준비된 기반을 선택하고 저장소를 연결하세요.</p>
            </div>
          )}
        </section>
        {mode === "demo" && !discardableApps.length && <p className="muted">삭제할 수 있는 배포 이력 없는 DEMO 애플리케이션이 없습니다.</p>}

        </>
      )}
      {selected && <dialog ref={redeployDialog} className="discard-dialog detail" aria-labelledby="app-redeploy-heading" aria-describedby="app-redeploy-description"
        onClose={() => { redeployTarget.current = null; setRedeployReviewed(false); setRedeployError(""); }}>
        <h2 id="app-redeploy-heading" tabIndex={-1}>새 버전 재배포</h2>
        <p id="app-redeploy-description">{mode === "demo" ? "DEMO · 최신 커밋을 확인하지 않는 로컬 시연입니다. 실제 코드 갱신·AI 분석·클라우드 배포는 실행하지 않습니다." : "연동 대기 · 최신 커밋 확인과 이전 성공 설정 재사용을 위한 서버 계약이 필요합니다."}</p>
        <dl>
          <dt>애플리케이션</dt><dd className="break-word">{selected.name}</dd>
          <dt>저장소</dt><dd className="break-word">{selected.repo_url}</dd>
          <dt>브랜치</dt><dd className="break-word">{selected.branch}</dd>
          <dt>{mode === "demo" ? "이전 성공 배포" : "조회된 배포"}</dt>
          <dd className="break-word">{mode === "demo" ? lastSuccess?.id ?? "성공 이력 없음" : deployment ? deployment.id + " · " + deployment.status : selected.latest_deployment_id ?? "미확인"}</dd>
        </dl>
        {mode === "demo" ? canReusePlan ? <>
          <p>실행 환경: {reusablePlan!.compute} · 템플릿: {reusablePlan!.template}</p>
          <pre tabIndex={0} aria-label="재사용할 설정값">{JSON.stringify(reusablePlan!.values, null, 2)}</pre>
          <label className="failure-option"><input type="checkbox" checked={redeployReviewed} disabled={redeployBlocked} onChange={e => setRedeployReviewed(e.target.checked)}/> 이전 성공 설정을 그대로 재사용합니다</label>
        </> : <p className="notice">재사용할 성공 배포 구성이 없습니다. 가장 최근 성공 기록의 템플릿·설정값이 없거나 현재 저장소·브랜치와 다릅니다. 설정 변경 · 재분석에서 새 구성을 확인하세요.</p>
          : <p className="notice">대상 커밋 SHA: 서버 미제공<br/>이전 성공 설정: 서버 미제공<br/>대상 버전과 재사용 설정을 확인할 수 없어 재배포를 실행할 수 없습니다.</p>}
        {redeployError && <p className="error" role="alert">{redeployError}</p>}
        <div className="form-actions">
          <button className="primary" disabled={mode !== "demo" || redeployBlocked || !canReusePlan || !redeployReviewed} onClick={redeploy}>{mode === "demo" ? "이 설정으로 재배포 · 데모" : "재배포 연동 대기"}</button>
          <button className="secondary" onClick={() => redeployDialog.current?.close()}>취소</button>
        </div>
      </dialog>}
      {!creating && (
        <dialog ref={discardDialog} className="discard-dialog" aria-labelledby="app-discard-heading" aria-describedby="app-discard-description" aria-busy={discarding} onCancel={event => { if (discarding) event.preventDefault(); }}>
          <h2 id="app-discard-heading">애플리케이션 삭제</h2>
          <p id="app-discard-description">{mode === "api"
            ? "선택한 애플리케이션을 목록에서 숨깁니다. 배포·분석 기록과 연결된 인프라·Repository는 유지됩니다. AWS에 배포된 앱은 먼저 내리기를 완료해 주세요. 배포·내리기 중에는 삭제할 수 없습니다."
            : "선택한 DEMO 애플리케이션이 브라우저에서 삭제돼요. 배포 이력이 있는 애플리케이션은 삭제할 수 없어요. 연결된 인프라와 Repository는 유지돼요."}</p>
          <label htmlFor="app-discard-target">삭제할 애플리케이션</label>
          {selected ? <input id="app-discard-target" value={selected.name} readOnly /> : <select id="app-discard-target" disabled={discarding} value={discardId} onChange={(event) => { setDiscardId(event.target.value); setDiscardError(""); }}>
            {discardableApps.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select>}
          {discardError && <p className="error" role="alert">{discardError}</p>}
          <div className="form-actions">
            <button className="primary" disabled={discarding || (mode === "demo" && storageBlocked) || !discardableApps.some((entry) => entry.id === discardId)} onClick={() => void discard()}>선택한 애플리케이션 삭제</button>
            <button className="secondary" disabled={discarding} onClick={() => discardDialog.current?.close()}>취소</button>
            {discarding && <span role="status">삭제 요청 중…</span>}
          </div>
        </dialog>
      )}
    </>
  );
}
