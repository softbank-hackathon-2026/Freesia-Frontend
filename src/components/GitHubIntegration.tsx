import { useState } from "react";
import { connectGitHubDemo } from "../lib/meeting.ts";
import type { GitHubConnection } from "../lib/meeting.ts";
import type { DataMode } from "../lib/types.ts";
export default function GitHubIntegration({
  mode,
  connection,
  onConnect,
  onRegister,
}: {
  mode: DataMode;
  connection: GitHubConnection | null;
  onConnect: (connection: GitHubConnection) => void;
  onRegister: (ids: string[]) => void;
}) {
  const [error, setError] = useState("");
  function save(action: () => void) {
    try {
      action();
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">INTEGRATIONS / GITHUB</div>
          <h1>통합</h1>
          <p>
            GitHub를 연결한 후, 앱 배포에 사용할 Repository를 미리 등록합니다.
          </p>
        </div>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <section className="panel">
        <div className="section-heading">
          <h2>GitHub 계정</h2>
          <span className="badge">
            {mode === "api"
              ? "API 미지원"
              : connection
                ? "데모 연결됨"
                : "연결 전"}
          </span>
        </div>
        <div className="panel-body">
          {mode === "api" ? (
            <div className="notice">
              OAuth·Repository 조회·등록 API가 아직 없습니다. 서버 요청·실제
              GitHub 로그인은 실행하지 않습니다.
            </div>
          ) : connection ? (
            <>
              <strong>{connection.account}</strong>
              <p>
                샘플 연결입니다. GitHub 로그인·권한 요청·저장소 조회를 실행하지
                않았습니다.
              </p>
            </>
          ) : (
            <>
              <p>
                데모 계정을 연결하면 등록 가능한 원격 저장소 샘플이 나타납니다.
              </p>
              <button
                className="primary"
                onClick={() => save(() => onConnect(connectGitHubDemo()))}
              >
                GitHub 연결 · 데모
              </button>
            </>
          )}
        </div>
      </section>
      {mode === "demo" && connection && (
        <section className="panel">
          <div className="section-heading">
            <h2>Repository 등록</h2>
            <span className="badge">
              {connection.registeredIds?.length ?? 0}개 등록 · 샘플
            </span>
          </div>
          <p className="muted">
            연결된 목록에서 명시적으로 등록한 Repository만 Application Space에서
            선택할 수 있습니다.
          </p>
          <div className="repository-list">
            {connection.repositories.map((repo) => {
              const registered = connection.registeredIds?.includes(repo.id);
              return (
                <div key={repo.id} className="repository-row">
                  <div>
                    <strong>{repo.name}</strong>
                    <span className="badge">{repo.branch}</span>
                    <p className="break-word">{repo.repo_url}</p>
                    <small>실제 접근·공개 여부·브랜치 존재 미확인</small>
                  </div>
                  <button
                    aria-label={
                      (registered ? "등록 해제: " : "Repository 등록: ") +
                      repo.name
                    }
                    onClick={() =>
                      save(() =>
                        onRegister(
                          registered
                            ? (connection.registeredIds ?? []).filter(
                                (id) => id !== repo.id,
                              )
                            : [...(connection.registeredIds ?? []), repo.id],
                        ),
                      )
                    }
                  >
                    {registered ? "등록 해제" : "등록 · 데모"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
