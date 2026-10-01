import { useEffect, useRef, useState } from "react";
import { createApi, watchDeployment } from "../lib/api.ts";
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
} from "../lib/types.ts";
import { registeredRepositories } from "../lib/meeting.ts";
import type { MeetingState } from "../lib/meeting.ts";
import {
  advancePipeline,
  makeAppPlan,
  pipelineSteps,
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
  apiRepositories, repositoryLoading, repositoryError, onRefreshRepositories,
}: {
  mode: DataMode;
  apiRepositories: Repository[];
  repositoryLoading: boolean;
  repositoryError: string;
  onRefreshRepositories: () => void;
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
  const demoResumeStatus = useRef<Deployment["status"]>("pending");
  useEffect(
    () => () => {
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
  const [chosen, setChosen] = useState("");
  const [plan, setPlan] = useState<AppPlan | null>(null);
  const [failCI, setFailCI] = useState(false);
  const demoRegistered = registeredRepositories(meeting.github);
  const registered = mode === "demo" ? demoRegistered : apiRepositories;
  const preview =
    plan ??
    (deployment?.demo_pipeline?.plan.compute === chosen
      ? deployment.demo_pipeline.plan
      : null);
  const infra = infras.find((i) => i.id === selected?.infra_id);
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
          setEvent(data);
          setDeployment((current) =>
            current
              ? { ...current, status: data.status, url: data.url }
              : current,
          );
          if (data.status === "success" || data.status === "failed")
            setStreamId("");
        },
        (message) => {
          if (token === session.current) setError(message);
        },
      );
    if (deployment?.demo_pipeline) {
      let current = deployment;
      const timer = setInterval(() => {
        if (token !== session.current) return;
        current = advancePipeline(current);
        setDeployment(current);
        const meta = current.demo_pipeline!;
        setEvent({
          status: current.status,
          progress: Math.round((meta.phase / 7) * 100),
          message: pipelineSteps[meta.phase - 1],
          step: "demo-pipeline",
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
  }, [streamId, mode]);
  useEffect(() => {
    if (deployment) onDeployment(deployment);
  }, [deployment, mode, onDeployment]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
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
      if (token !== session.current) return;
      onCreate(app);
      setCreating(false);
      setSelected(app);
      setAnalysis(null);
      setDeployment(null);
    } catch (e) {
      if (token === session.current)
        setError(e instanceof Error ? e.message : "앱 생성 실패");
    } finally {
      if (token === session.current) setBusy(false);
    }
  }
  async function open(app: AppSpace) {
    const token = ++session.current;
    setBusy(false);
    setSelected(app);
    setCreating(false);
    setAnalysis(null);
    setChosen("");
    setPlan(null);
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
          if (!["success", "failed"].includes(value.status))
            setStreamId(value.id);
        }
      } catch (e) {
        if (token === session.current)
          setError(e instanceof Error ? e.message : "상태 조회 실패");
      }
    }
  }
  async function analyze() {
    const token = session.current;
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      const result =
        mode === "demo" ? sampleAnalysis : await api.analyze(selected.id);
      if (token !== session.current) return;
      setAnalysis(result);
      setPlan(null);
      const initial = availableCandidates(
        result.candidates,
        infra?.computes ?? [],
      );
      setChosen(
        mode === "demo"
          ? ""
          : (initial.find((c) => c.state === "selected")?.compute ??
              initial[0]?.compute ??
              ""),
      );
    } catch (e) {
      if (token === session.current)
        setError(e instanceof Error ? e.message : "분석 실패");
    } finally {
      if (token === session.current) setBusy(false);
    }
  }
  async function deploy() {
    const token = session.current;
    if (!selected || !allowed.some((c) => c.compute === chosen)) {
      setError("선택한 실행 환경을 이 기반에서 사용할 수 없습니다.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result =
        mode === "demo"
          ? startDemoDeployment(
              selected.id,
              makeAppPlan(selected, chosen, allowed, demoRegistered),
              failCI,
            )
          : await api.deploy(selected.id, chosen);
      if (mode === "demo") onStartDeployment(result);
      if (token !== session.current) return;
      demoResumeStatus.current = result.status;
      setDeployment(result);
      setEvent(null);
      setStreamId(result.id);
    } catch (e) {
      if (token === session.current)
        setError(e instanceof Error ? e.message : "배포 요청 실패");
    } finally {
      if (token === session.current) setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">APPLICATION SPACE</div>
          <h1>
            {selected ? selected.name : creating ? "앱 연결" : "애플리케이션"}
          </h1>
          <p>
            {selected
              ? "기반·분석 근거·배포 상태를 확인하세요."
              : "통합에 등록한 Repository와 준비된 Infra Space를 선택하세요."}
          </p>
        </div>
        {selected || creating ? (
          <button
            onClick={() => {
              session.current++;
              setBusy(false);
              setSelected(null);
              setCreating(false);
              setStreamId("");
              setError("");
            }}
          >
            앱 목록으로
          </button>
        ) : (
          <button
            className="primary"
            disabled={mode === "api" && repositoryLoading}
            onClick={() => {
              session.current++;
              setBusy(false);
              setCreating(true);
              setAnalysis(null); setChosen(""); setPlan(null); setEvent(null); setDeployment(null); setTab("overview");
              setError("");
            }}
          >
            앱 연결
          </button>
        )}
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {mode === "api" && !selected && (
        <p className="notice">
          서버에 등록된 Repository와 Infra Space로 앱을 생성합니다. 현재 백엔드의 앱·분석·배포는 샘플 구현이며 실제 AI·클라우드 배포가 아닙니다.
        </p>
      )}
      {mode === "api" && repositoryError && <div className="error" role="alert">{repositoryError}<button onClick={onRefreshRepositories}>Repository 다시 조회</button></div>}
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
          <div className="form-actions">
            <button className="primary" disabled={busy}>
              {busy ? "연결 중…" : "앱 만들기"}
            </button>
            <button
              type="button"
              onClick={() => {
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
                      {mode === "demo" ? "데모 앱" : "백엔드 샘플 앱"}
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
                <section className="panel">
                  <div className="section-heading">
                    <h2>코드 분석과 배포 선택</h2>
                    <button
                      className="primary"
                      disabled={busy || !!streamId}
                      onClick={analyze}
                    >
                      {busy
                        ? "요청 중…"
                        : analysis
                          ? "분석 다시 보기"
                          : mode === "demo"
                            ? "배포"
                            : "기존 앱 샘플 분석"}
                    </button>
                  </div>
                  <div className="panel-body">
                    <p className="muted">
                      {mode === "demo"
                        ? "고정 샘플 분석입니다. 저장소 코드를 읽거나 AI를 호출하지 않습니다."
                        : "현재 백엔드 분석도 고정 샘플입니다. 실제 저장소 분석이 아닙니다."}
                    </p>
                    {analysis ? (
                      <>
                        <div
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
                        </div>
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
                                {e.certain ? "샘플 근거" : "불확실"}
                              </span>
                              <strong>{e.file}</strong>
                              <p>{e.finding}</p>
                            </div>
                          ))}
                        </div>
                        <p className="notice">
                          조건 질문 답변·저장 API는 아직 없습니다. 분석 결과의
                          불확실한 항목을 검토해 주세요.
                        </p>
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
                              <p>{c.reason}</p>
                              <ul>
                                {c.cons.map((reason) => (
                                  <li key={reason}>{reason}</li>
                                ))}
                              </ul>
                              <button
                                disabled={
                                  !allowed.some(
                                    (a) => a.compute === c.compute,
                                  ) || !!streamId
                                }
                                onClick={() => {
                                  setChosen(c.compute);
                                  setPlan(null);
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
                              추천 표시와 사용자 선택은 별개입니다. 실제
                              클라우드 변경 없이 샘플 상태만 진행합니다.
                            </p>
                          </div>
                          <button
                            className="primary"
                            disabled={
                              busy ||
                              !!streamId ||
                              !chosen ||
                              analysis.status !== "done"
                            }
                            onClick={() => {
                              if (mode === "api") {
                                void deploy();
                                return;
                              }
                              try {
                                if (selected)
                                  setPlan(
                                    makeAppPlan(
                                      selected,
                                      chosen,
                                      allowed,
                                      demoRegistered,
                                    ),
                                  );
                              } catch (e) {
                                setError(
                                  e instanceof Error
                                    ? e.message
                                    : "코드 준비 실패",
                                );
                              }
                            }}
                          >
                            {mode === "api"
                              ? "기존 API 샘플 배포"
                              : "선택한 환경으로 Terraform 준비"}
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
                {mode === "demo" && preview && (
                  <section className="panel detail" aria-label="배포 변경 확인">
                    <div className="section-heading">
                      <h2>Terraform · Repository 변경 확인</h2>
                      <span className="badge caution">코드 초안 · 미실행</span>
                    </div>
                    <dl>
                      <dt>실행 환경</dt>
                      <dd>{preview.compute}</dd>
                      <dt>대상 Repository</dt>
                      <dd className="break-word">{preview.repo_url}</dd>
                      <dt>브랜치</dt>
                      <dd>{preview.branch}</dd>
                      <dt>변경할 파일</dt>
                      <dd>{preview.path}</dd>
                    </dl>
                    <div className="file-tab">main.tf · DEMO</div>
                    <pre tabIndex={0} aria-label="앱 Terraform 미리보기">
                      <code>{preview.code}</code>
                    </pre>
                    <p className="notice">
                      고정 코드 조각입니다. IAM·아티팩트·서비스 연결 등이
                      생략되어 있고 검증·실행되지 않았습니다.
                      commit/push/Actions도 화면 시연이며 외부 저장소를 변경하지
                      않습니다.
                    </p>
                    <label className="failure-option">
                      <input
                        type="checkbox"
                        checked={failCI}
                        onChange={(e) => setFailCI(e.target.checked)}
                        disabled={!!streamId}
                      />{" "}
                      CI 실패 시뮬레이션 · DEMO
                    </label>
                    <button
                      className="primary"
                      disabled={!!streamId || busy}
                      onClick={deploy}
                    >
                      {deployment?.status === "failed"
                        ? "실패한 데모 파이프라인 재시도"
                        : "commit / push 및 CI/CD 시작 · 데모"}
                    </button>
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
                      {deployment.demo_pipeline && (
                        <>
                          <ol className="pipeline-steps">
                            {pipelineSteps.map((step, i) => (
                              <li
                                key={step}
                                className={
                                  deployment.demo_pipeline!.phase > i
                                    ? "complete"
                                    : ""
                                }
                              >
                                <span>
                                  {deployment.demo_pipeline!.phase > i
                                    ? deployment.status === "failed" && i === 4
                                      ? "실패"
                                      : "진행됨"
                                    : "대기"}
                                </span>
                                {step}
                              </li>
                            ))}
                          </ol>
                          <p className="break-word">
                            대상: {deployment.demo_pipeline.plan.repo_url} /{" "}
                            {deployment.demo_pipeline.plan.branch}
                          </p>
                          <p>
                            샘플 commit:{" "}
                            {deployment.demo_pipeline.commit ?? "아직 없음"}
                          </p>
                          <p>
                            GitHub Actions: 로컬 DEMO 실행 {deployment.id} ·
                            외부 run 없음
                          </p>
                          {deployment.status === "failed" && (
                            <button
                              onClick={() => {
                                setPlan(deployment.demo_pipeline!.plan);
                                setChosen(deployment.compute);
                                setFailCI(false);
                              }}
                            >
                              실패 내용 확인 · 재시도 준비
                            </button>
                          )}
                        </>
                      )}
                      <progress
                        max={100}
                        value={
                          event?.progress ??
                          (deployment.status === "success" ? 100 : 0)
                        }
                        aria-label="배포 진행률"
                      />
                      <p>
                        {event?.progress ??
                          (deployment.status === "success" ? 100 : 0)}
                        %
                      </p>
                      <p>실행 환경: {deployment.compute}</p>
                      {deployment.url && (
                        <p className="break-word">
                          샘플 URL: <code>{deployment.url}</code>
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
              </>
            ) : tab === "logs" ? (
              <section className="panel">
                <div className="section-heading">
                  <h2>애플리케이션 로그</h2>
                  <span className="badge">
                    {mode === "demo" ? "샘플" : "API 미지원"}
                  </span>
                </div>
                {mode === "demo" ? (
                  <pre className="log-output">{`[DEMO] 12:00:01 INFO HTTP server started on :3000\n[DEMO] 12:00:02 INFO GET / -> 200\n[DEMO] 12:00:03 INFO Sample log; no application connection`}</pre>
                ) : (
                  <div className="empty">
                    <h2>로그 조회 API가 아직 없습니다</h2>
                    <p>
                      실제 애플리케이션 로그를 수집하거나 조회하지 않습니다.
                    </p>
                  </div>
                )}
              </section>
            ) : (
              <section className="panel">
                <div className="section-heading">
                  <h2>모니터링</h2>
                  <span className="badge">
                    {mode === "demo" ? "샘플 수치" : "API 미지원"}
                  </span>
                </div>
                {mode === "demo" ? (
                  <div className="panel-body">
                    <p>실제 앱 관측 데이터가 아닌 고정 샘플입니다.</p>
                    <div className="metrics">
                      <div>
                        <span>CPU</span>
                        <strong>24%</strong>
                        <meter
                          min={0}
                          max={100}
                          value={24}
                          aria-label="샘플 CPU"
                        />
                      </div>
                      <div>
                        <span>메모리</span>
                        <strong>38%</strong>
                        <meter
                          min={0}
                          max={100}
                          value={38}
                          aria-label="샘플 메모리"
                        />
                      </div>
                      <div>
                        <span>응답 시간</span>
                        <strong>128 ms</strong>
                        <small>샘플</small>
                      </div>
                    </div>
                    <p className="notice">
                      알림: 고정 시연 화면입니다. 실제 정상 상태를 의미하지
                      않습니다.
                    </p>
                  </div>
                ) : (
                  <div className="empty">
                    <h2>메트릭·알림 API가 아직 없습니다</h2>
                    <p>연동 계약이 마련되면 앱별 실제 지표를 연결합니다.</p>
                  </div>
                )}
              </section>
            )}
          </div>
        </>
      ) : (
        <section className="panel">
          <div className="section-heading">
            <h2>앱 목록</h2>
            <span className="badge">{apps.length}개</span>
          </div>
          {apps.length ? (
            <div className="app-list">
              {apps.map((app) => (
                <button key={app.id} onClick={() => open(app)}>
                  <strong>{app.name}</strong>
                  <span>
                    {app.branch} ·{" "}
                    {infras.find((i) => i.id === app.infra_id)?.name ??
                      app.infra_id}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="empty">
              <div className="empty-icon">◫</div>
              <h2>아직 애플리케이션이 없습니다</h2>
              <p>준비된 기반을 선택하고 저장소를 연결하세요.</p>
            </div>
          )}
        </section>
      )}
    </>
  );
}
