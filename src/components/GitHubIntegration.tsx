import { useState } from "react";
import { registerRepository, registeredRepositories } from "../lib/meeting.ts";
import type { GitHubConnection } from "../lib/meeting.ts";
import type { DataMode } from "../lib/types.ts";
export default function GitHubIntegration({
  mode, connection, onSave,
}: {
  mode: DataMode;
  connection: GitHubConnection | null;
  onSave: (connection: GitHubConnection) => void;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const repositories = registeredRepositories(connection);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">INTEGRATIONS / REPOSITORIES</div>
          <h1>통합</h1>
          <p>기존 public GitHub Repository의 URL을 등록한 뒤, 앱 생성 화면에서 선택하세요.</p>
        </div>
      </div>
      {error && <div className="error" role="alert">{error}</div>}
      {mode === "api" ? (
        <div className="notice">
          Repository 등록·조회 API가 아직 없습니다. API 모드에서는 등록할 수 없습니다.
        </div>
      ) : (
        <>
          <form className="panel app-form" onSubmit={(e) => {
            e.preventDefault();
            try {
              onSave(registerRepository(connection, url));
              setUrl("");
              setError("");
            } catch (e) { setError(e instanceof Error ? e.message : "저장 실패"); }
          }}>
            <h2>Repository 등록</h2>
            <label htmlFor="repository-url">Repository URL</label>
            <input id="repository-url" type="text" inputMode="url" maxLength={2048}
              placeholder="https://github.com/owner/repository" value={url}
              onChange={(e) => setUrl(e.target.value)} />
            <p>새 등록은 main 브랜치를 사용합니다. GitHub에 새 저장소를 만드는 기능은 아닙니다.</p>
            <div className="notice">브라우저 데모 등록입니다. 실제 Repository의 존재·공개 여부·main 브랜치와 접근 권한은 확인하지 않습니다.</div>
            <button className="primary">Repository 등록 · 데모</button>
          </form>
          <section className="panel">
            <div className="section-heading">
              <h2>등록한 Repository</h2><span className="badge">{repositories.length}개 등록</span>
            </div>
            {repositories.length ? <div className="repository-list">
              {repositories.map((repo) => (
                <div key={repo.id} className="repository-row">
                  <div>
                    <strong>{repo.name}</strong><span className="badge">{repo.branch}</span>
                    <p className="break-word">{repo.repo_url}</p>
                    <small>실제 접근·공개 여부·브랜치 존재 미확인</small>
                  </div>
                  <button aria-label={"등록 해제: " + repo.name + " (" + repo.branch + ")"} onClick={() => {
                    if (!connection) return;
                    try {
                      onSave({ ...connection, registeredIds: (connection.registeredIds ?? []).filter((id) => id !== repo.id) });
                      setError("");
                    } catch (e) { setError(e instanceof Error ? e.message : "저장 실패"); }
                  }}>등록 해제</button>
                </div>
              ))}
            </div> : <div className="empty">등록한 Repository가 없습니다.</div>}
          </section>
        </>
      )}
    </>
  );
}
