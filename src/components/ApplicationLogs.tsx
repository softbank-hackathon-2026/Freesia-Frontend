import { Fragment, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ApiError, createApi } from "../lib/api.ts";
import type { AppLogs, DataMode } from "../lib/types.ts";
import { buildLogExport } from "../lib/logExport.ts";
import ContextHelp from "./ContextHelp.tsx";

const api = createApi(import.meta.env.VITE_API_BASE_URL || "/api");
const labels = { ok: "로그 수신", waiting: "수집 대기", not_deployed: "미배포", unsupported: "지원 안 됨", error: "수집 오류" };
const messages = {
  ok: "수집된 애플리케이션 로그가 없습니다.",
  waiting: "아직 로그를 수집하지 못했습니다.",
  not_deployed: "배포된 애플리케이션이 없습니다.",
  unsupported: "이 실행 환경은 로그 조회를 지원하지 않습니다.",
  error: "로그를 수집하지 못했습니다. 잠시 후 다시 확인하세요.",
};
const demoLines = [
  { at: "12:00:01", message: "INFO HTTP server started on :3000" },
  { at: "12:00:02", message: "INFO GET / -> 200" },
  { at: "12:00:03", message: "INFO Sample log; no application connection" },
];
type LogProps = { id: string; mode: DataMode; appName?: string; previewLines?: number };

function highlight(message: string, matcher: RegExp | null): ReactNode {
  if (!matcher) return message;
  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const match of message.matchAll(matcher)) {
    const index = match.index;
    parts.push(message.slice(cursor, index), <mark key={index}>{match[0]}</mark>);
    cursor = index + match[0].length;
  }
  parts.push(message.slice(cursor));
  return parts;
}

export default function ApplicationLogs(props: LogProps) {
  return <LogPanel key={`${props.mode}:${props.id}`} {...props}/>;
}

function LogPanel({ id, mode, appName, previewLines }: LogProps) {
  const [logs, setLogs] = useState<AppLogs | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(mode === "api");
  const [query, setQuery] = useState("");
  const [paused, setPaused] = useState(false);
  const refresh = useRef<(() => void) | null>(null);
  const cancel = useRef<(() => void) | null>(null);
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
          if (!paused) timer = setTimeout(load, 15000);
        }
      }
    }
    const stop = () => { controller.abort(); clearTimeout(timer); };
    refresh.current = load;
    cancel.current = stop;
    if (!paused) void load();
    return () => { stop(); refresh.current = null; cancel.current = null; };
  }, [id, mode, paused]);

  function togglePaused() {
    cancel.current?.();
    setLoading(paused);
    setPaused(!paused);
  }

  const canDownload = mode === "api" && !loading && !error && logs?.status === "ok" && logs.lines.length > 0;
  const sourceLines = mode === "demo" ? demoLines : logs?.status === "ok" ? logs.lines : [];
  const matcher = query ? new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi") : null;
  const matchingLines = sourceLines.filter(line => !matcher || line.message.search(matcher) !== -1);
  const visibleLines = previewLines === undefined ? matchingLines : [...matchingLines]
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).slice(-previewLines);
  function download() {
    if (!canDownload || !logs) return;
    const { blob, filename } = buildLogExport(appName ?? id, logs.lines);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    try { link.click(); }
    finally {
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
  const status = error ? "조회 실패" : logs ? labels[logs.status] : paused ? "일시정지" : "조회 중";
  return <section className="panel application-logs" aria-label="애플리케이션 로그">
    <div className="section-heading">
      <div className="title-with-help">
        <h2>애플리케이션 로그</h2>
        {mode === "api" && <ContextHelp id="app-logs-context-help" label="애플리케이션 로그 안내">
          <p>최근 애플리케이션 로그 · 최대 100줄 · {paused ? "자동 갱신 일시정지" : "약 15초마다 새로고침"} · 시간은 브라우저 현지 시간 기준입니다.</p>
          <p>TXT에는 검색 결과와 관계없이 수신된 모든 로그를 저장하며, 시간은 UTC 기준입니다.</p>
        </ContextHelp>}
      </div>
      <span className="badge">{mode === "demo" ? "샘플" : status}</span>
    </div>
    <div className="panel-body">
      {mode === "demo" && <p className="muted">샘플 로그 · 실제 앱에 연결되지 않은 고정 데이터입니다.</p>}
      <div className="log-toolbar">
        <label className="log-search">로그 메시지 검색
          <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="메시지에서 찾을 문자열"/>
        </label>
        {mode === "api" && <div className="log-actions">
          <button disabled={loading} onClick={() => refresh.current?.()}>로그 새로고침</button>
          <button aria-pressed={paused} onClick={togglePaused}>{paused ? "자동 갱신 재개" : "자동 갱신 일시정지"}</button>
          <button disabled={!canDownload} onClick={download}>전체 로그 .txt 다운로드</button>
        </div>}
      </div>
      {!error && sourceLines.length > 0 && query && <p className="muted log-summary" aria-live="polite">
        검색 결과 {matchingLines.length}줄
      </p>}
      {loading && <p role="status">{logs ? "로그 갱신 중…" : "로그 조회 중…"}</p>}
      {error && <p role="alert">{error}</p>}
      {mode === "api" && !error && logs && (logs.status !== "ok" || logs.lines.length === 0) &&
        <p className="notice" role={logs.status === "error" ? "alert" : "status"}>{logs.message || messages[logs.status]}</p>}
      {!error && logs?.status === "ok" && logs.lines.length > 0 && logs.message && <p>{logs.message}</p>}
      {!error && sourceLines.length > 0 && matchingLines.length === 0 && <p className="notice" role="status">검색 결과가 없습니다.</p>}
    </div>
    {!error && visibleLines.length > 0 && <pre className="log-output" tabIndex={0} aria-label={mode === "demo" ? "샘플 로그" : "수집된 로그"}>
      {visibleLines.map((line, index) => <Fragment key={index}>
        {index > 0 && "\n"}{mode === "demo" ? `[DEMO] ${line.at} ` : `[${new Date(line.at).toLocaleString("ko-KR", { hour12: false })}] `}{highlight(line.message, matcher)}
      </Fragment>)}
    </pre>}
  </section>;
}