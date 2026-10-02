import { useEffect, useRef, useState } from "react";
import { createApi } from "../lib/api.ts";
import { normalizeRepositoryUrl, registerRepository, registeredRepositories } from "../lib/meeting.ts";
import type { GitHubConnection } from "../lib/meeting.ts";
import type { DataMode, Repository } from "../lib/types.ts";
const api = createApi(import.meta.env.VITE_API_BASE_URL || "/api");
export default function GitHubIntegration({
  mode, connection, onSave, apiRepositories, onApiChange, loading, loadError, onRefresh,
}: {
  mode: DataMode;
  connection: GitHubConnection | null;
  onSave: (connection: GitHubConnection) => void;
  apiRepositories: Repository[];
  onApiChange: (repositories: Repository[]) => void;
  loading: boolean;
  loadError: string;
  onRefresh: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const session = useRef(0);
  useEffect(() => () => { session.current++; }, []);
  const repositories = mode === "demo" ? registeredRepositories(connection) : apiRepositories;
  const disabled = busy || loading || !!loadError;
  async function register() {
    const token = session.current;
    setBusy(true);
    try {
      if (mode === "demo") onSave(registerRepository(connection, url));
      else {
        const repo_url = normalizeRepositoryUrl(url);
        if (apiRepositories.some((repo) => repo.repo_url.toLowerCase() === repo_url.toLowerCase() && repo.branch === "main"))
          throw new Error("이미 등록한 Repository입니다.");
        const result = await api.registerRepository({ repo_url, branch: "main" });
        if (token !== session.current) return;
        onApiChange([result, ...apiRepositories]);
      }
      setUrl("");
      setError("");
      setCreating(false);
    } catch (e) { if (token === session.current) setError(e instanceof Error ? e.message : "저장 실패"); }
    finally { if (token === session.current) setBusy(false); }
  }
  async function unregister(id: string) {
    const token = session.current;
    setBusy(true);
    try {
      if (mode === "demo") {
        if (!connection) return;
        onSave({ ...connection, registeredIds: (connection.registeredIds ?? []).filter((value) => value !== id) });
      } else {
        await api.deleteRepository(id);
        if (token !== session.current) return;
        onApiChange(apiRepositories.filter((repo) => repo.id !== id));
      }
      setError("");
    } catch (e) { if (token === session.current) setError(e instanceof Error ? e.message : "등록 해제 실패"); }
    finally { if (token === session.current) setBusy(false); }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">INTEGRATIONS / REPOSITORIES</div>
          <h1>{creating ? "등록" : "통합"}</h1>
          <p>기존 public GitHub Repository의 URL을 등록한 뒤, 앱 생성 화면에서 선택하세요.</p>
        </div>
        {creating && (
          <button disabled={busy} onClick={() => { setCreating(false); setError(""); }}>목록으로</button>
        )}
      </div>
      {error && <div className="error" role="alert">{error}</div>}
      {loadError && <div className="error" role="alert">{loadError}<button disabled={busy || loading} onClick={onRefresh}>Repository 다시 조회</button></div>}
      {creating ? (
      <form className="panel app-form" onSubmit={(e) => { e.preventDefault(); if (!disabled) void register(); }}>
        <h2>Repository 등록</h2>
        <label htmlFor="repository-url">Repository URL</label>
        <input id="repository-url" type="text" inputMode="url" maxLength={2048} disabled={busy} autoFocus
          placeholder="https://github.com/owner/repository" value={url}
          onChange={(e) => setUrl(e.target.value)} />
        <p>새 등록은 main 브랜치를 사용합니다. GitHub에 새 저장소를 만드는 기능은 아닙니다.</p>
        <div className="notice">
          {mode === "demo" ? "브라우저 데모 등록입니다." : "서버에 Repository 주소를 등록합니다."}
          {" "}실제 Repository의 존재, 공개 여부, main 브랜치와 접근 권한은 확인하지 않습니다.
        </div>
        <div className="form-actions">
          <button className="primary" disabled={disabled}>{busy ? "처리 중…" : "Repository 등록"}</button>
          <button type="button" className="secondary" disabled={busy} onClick={() => { setCreating(false); setError(""); }}>취소</button>
        </div>
      </form>
      ) : (
      <section className="panel repository-space-list">
        <div className="section-heading">
          <h2>등록한 Repository</h2>
          <div className="heading-actions">
            <span className="badge">{repositories.length}개 등록</span>
            {mode === "api" && <button disabled={busy || loading} onClick={onRefresh}>Repository 새로고침</button>}
            <button className="primary" autoFocus disabled={busy} onClick={() => { setCreating(true); setError(""); }}>등록</button>
          </div>
        </div>
        {loading ? <p role="status">Repository 불러오는 중…</p> : repositories.length ? <div className="repository-list">
          {repositories.map((repo) => (
            <div key={repo.id} className="repository-row">
              <div>
                <strong>{repo.name}</strong><span className="badge">{repo.branch}</span>
                <p className="break-word">{repo.repo_url}</p>
                <small>실제 접근·공개 여부·브랜치 존재 미확인</small>
              </div>
              <button disabled={disabled} aria-label={"등록 해제: " + repo.name + " (" + repo.branch + ")"} onClick={() => void unregister(repo.id)}>등록 해제</button>
            </div>
          ))}
        </div> : !loadError && <div className="empty">등록한 Repository가 없습니다.</div>}
      </section>
      )}
    </>
  );
}
