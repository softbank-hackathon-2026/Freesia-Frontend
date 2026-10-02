import { useEffect, useRef, useState } from "react";
import { ApiError, createApi } from "../lib/api.ts";
import type { AppLogs, DataMode } from "../lib/types.ts";

const api = createApi(import.meta.env.VITE_API_BASE_URL || "/api");
const labels = { ok: "로그 수신", waiting: "수집 대기", not_deployed: "미배포", unsupported: "지원 안 됨", error: "수집 오류" };
const messages = {
  ok: "최근 1시간에 수집된 로그가 없습니다.",
  waiting: "아직 로그를 수집하지 못했습니다. 잠시 후 다시 확인합니다.",
  not_deployed: "배포된 애플리케이션이 없습니다.",
  unsupported: "이 실행 환경은 로그 조회를 지원하지 않습니다.",
  error: "로그를 수집하지 못했습니다. 잠시 후 다시 확인하세요.",
};

export default function ApplicationLogs({ id, mode }: { id: string; mode: DataMode }) {
  const [logs, setLogs] = useState<AppLogs | null>(null);
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
        const data = await api.logs(id, controller.signal);
        if (!controller.signal.aborted) setLogs(data);
      } catch (e) {
        if (!controller.signal.aborted) {
          setLogs(null);
          setError(e instanceof ApiError && e.status ? `로그 조회 실패 (HTTP ${e.status}) · ${e.message}` : e instanceof Error ? e.message : "로그 조회 실패");
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

  const status = error ? "조회 실패" : logs ? labels[logs.status] : "조회 중";
  return <section className="panel" aria-label="애플리케이션 로그">
    <div className="section-heading">
      <h2>애플리케이션 로그</h2>
      <span className="badge">{mode === "demo" ? "샘플" : status}</span>
    </div>
    {mode === "demo" ? <pre className="log-output">{`[DEMO] 12:00:01 INFO HTTP server started on :3000
[DEMO] 12:00:02 INFO GET / -> 200
[DEMO] 12:00:03 INFO Sample log; no application connection`}</pre> : <>
      <div className="panel-body">
        <p className="muted">최근 1시간 · 최대 100줄 · 15초마다 새로고침 · 시간은 브라우저 현지 시간 기준입니다.</p>
        <button disabled={loading} onClick={() => refresh.current?.()}>로그 새로고침</button>
        {loading && <p role="status">{logs ? "로그 갱신 중…" : "로그 조회 중…"}</p>}
        {error && <p role="alert">{error}</p>}
        {!error && logs && (logs.status !== "ok" || logs.lines.length === 0) &&
          <p className="notice" role={logs.status === "error" ? "alert" : "status"}>{logs.message || messages[logs.status]}</p>}
        {!error && logs?.status === "ok" && logs.lines.length > 0 && logs.message && <p>{logs.message}</p>}
      </div>
      {!error && logs?.status === "ok" && logs.lines.length > 0 &&
        <pre className="log-output" tabIndex={0} aria-label="수집된 로그">{logs.lines.map(line =>
          `[${new Date(line.at).toLocaleString("ko-KR", { hour12: false })}] ${line.message}`).join("\n")}</pre>}
    </>}
  </section>;
}
