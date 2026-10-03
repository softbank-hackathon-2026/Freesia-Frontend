import { useEffect, useRef, useState } from "react";
import { ApiError, createApi } from "../lib/api.ts";
import type { AppMetrics, DataMode } from "../lib/types.ts";

const api = createApi(import.meta.env.VITE_API_BASE_URL || "/api");
const labels = { ok: "지표 수신", waiting: "수집 대기", not_deployed: "미배포", unsupported: "지원 안 됨", error: "수집 오류" };
const messages = {
  ok: "",
  waiting: "아직 지표를 수집하지 못했습니다. 잠시 후 다시 확인합니다.",
  not_deployed: "배포된 애플리케이션이 없습니다.",
  unsupported: "이 실행 환경은 지표 조회를 지원하지 않습니다.",
  error: "지표를 수집하지 못했습니다. 잠시 후 다시 확인하세요.",
};
const computeLabels = { "ecs-fargate": "ECS Fargate", lambda: "Lambda", ec2: "EC2" };

export default function ApplicationMetrics({ id, mode }: { id: string; mode: DataMode }) {
  const [metrics, setMetrics] = useState<AppMetrics | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(mode === "api");
  const refresh = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (mode !== "api") return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let pending = false;
    async function load() {
      if (pending || controller.signal.aborted) return;
      clearTimeout(timer);
      pending = true;
      setLoading(true);
      setError("");
      try {
        const data = await api.metrics(id, controller.signal);
        if (!controller.signal.aborted) setMetrics(data);
      } catch (e) {
        if (!controller.signal.aborted) {
          setMetrics(null);
          setError(e instanceof ApiError && e.status ? `지표 조회 실패 (HTTP ${e.status}) · ${e.message}` : e instanceof Error ? e.message : "지표 조회 실패");
        }
      } finally {
        pending = false;
        if (!controller.signal.aborted) {
          setLoading(false);
          timer = setTimeout(load, 15000);
        }
      }
    }
    refresh.current = load;
    void load();
    return () => { controller.abort(); clearTimeout(timer); refresh.current = null; };
  }, [id, mode]);

  const cards: [string, number | null, string, string][] = metrics?.compute === "ecs-fargate" ? [
    ["CPU", metrics.cpu_percent, "%", "ECS 서비스 평균"],
    ["메모리", metrics.memory_percent, "%", "ECS 서비스 평균"],
    ["평균 응답 시간", metrics.response_time_ms, " ms", "ALB에서 애플리케이션까지"],
    ["요청 수", metrics.request_count, "건", "ALB 요청"],
    ["앱 5xx 오류 수", metrics.error_count, "건", "ALB가 받은 앱의 5xx 응답"],
  ] : metrics?.compute === "lambda" ? [
    ["처리 시간", metrics.response_time_ms, " ms", "함수 평균 실행 시간"],
    ["호출 수", metrics.request_count, "건", "함수 호출"],
    ["함수 오류 수", metrics.error_count, "건", "함수 실행 오류"],
  ] : metrics?.compute === "ec2" ? [["CPU", metrics.cpu_percent, "%", "EC2 평균"]] : [];
  const status = error ? "조회 실패" : metrics ? labels[metrics.status] : "조회 중";
  return <section className="panel monitoring-panel" aria-label="모니터링">
    <div className="section-heading">
      <h2>모니터링</h2>
      <div className="metrics-actions">
        <span className="badge">{mode === "demo" ? "샘플 수치" : status}</span>
        {mode === "api" && <button disabled={loading} onClick={() => refresh.current?.()}>지표 새로고침</button>}
      </div>
    </div>
    <div className="panel-body">
      {mode === "demo" ? <>
        <div className="metrics">
          <div><span>CPU</span><strong>24%</strong><meter min={0} max={100} value={24} aria-label="샘플 CPU" /></div>
          <div><span>메모리</span><strong>38%</strong><meter min={0} max={100} value={38} aria-label="샘플 메모리" /></div>
          <div><span>응답 시간</span><strong>128 ms</strong><small>샘플</small></div>
        </div>
        <div className="metrics-meta">
          <p>실제 앱 관측 데이터가 아닌 고정 샘플입니다.</p>
          <p className="notice">고정 시연 화면입니다. 실제 정상 상태를 의미하지 않습니다.</p>
        </div>
      </> : <>
        {!error && metrics?.status === "ok" && cards.length > 0 && <div className="metrics">{cards.map(([label, value, unit, description]) =>
          <div key={label}><span>{label}</span><strong>{value === null ? "—" : `${value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}${unit}`}</strong><small>{value === null ? "측정값 없음" : description}</small></div>
        )}</div>}
        {loading && <p role="status">{metrics ? "지표 갱신 중…" : "지표 조회 중…"}</p>}
        {error && <p role="alert">{error}</p>}
        {!error && metrics && metrics.status !== "ok" &&
          <p className="notice" role={metrics.status === "error" ? "alert" : "status"}>{metrics.message || messages[metrics.status]}</p>}
        <div className="metrics-meta">
          <p className="muted">{metrics?.status === "ok" && metrics.compute && <>{computeLabels[metrics.compute]} · </>}60초 단위 집계 · 약 15초마다 새로고침</p>
          {!error && metrics?.status === "ok" && <>
            {!metrics.compute && <p className="notice">실행 환경을 확인할 수 없어 지원 지표를 표시할 수 없습니다.</p>}
            <p className="muted">{metrics.measured_at ? <>측정 시각 · <time dateTime={metrics.measured_at}>{new Date(metrics.measured_at).toLocaleString("ko-KR", { hour12: false })}</time> (브라우저 현지 시간)</> : "측정 시각 없음"}</p>
            {metrics.message && <p>{metrics.message}</p>}
            {metrics.compute === "lambda" && <p className="notice">Lambda는 CPU·메모리 지표를 제공하지 않습니다.</p>}
            {metrics.compute === "ec2" && <p className="notice">EC2는 CPU만 제공합니다. 메모리·응답 시간·요청 수·오류 수는 지원하지 않습니다.</p>}
            <p className="muted">‘—’는 측정값이 없다는 뜻이며, 0이나 정상 상태를 의미하지 않습니다.</p>
            <details>
              <summary>측정값 안내</summary>
              <p className="muted">마지막 측정값이며 화면 새로고침 시각과 다를 수 있습니다. 지표별 측정 시각은 다를 수 있습니다.</p>
            </details>
          </>}
        </div>
      </>}
    </div>
  </section>;
}
