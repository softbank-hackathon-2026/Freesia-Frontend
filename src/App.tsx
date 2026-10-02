import { useCallback, useEffect, useState } from "react";
import { createApi } from "./lib/api.ts";
import { foundations, preparedInfraSpaces, initialDemo, parseDemo, STORE_KEY } from "./lib/demo.ts";
import type { DemoState } from "./lib/demo.ts";
import type {
  AppSpace,
  AppSpaceCreate,
  DataMode,
  Deployment,
  InfraSpace,
  Repository,
} from "./lib/types.ts";
import InfraBuilder, { ApiInfraBuilder } from "./components/InfraBuilder.tsx";
import { canDiscardInfra } from "./lib/infraFlow.ts";
import Applications from "./components/Applications.tsx";
import InfraSpaceForm from "./components/InfraSpaceForm.tsx";
import type { InfraSpaceDraft } from "./components/InfraSpaceForm.tsx";
import GitHubIntegration from "./components/GitHubIntegration.tsx";
import {
  newMeetingState,
  readyMeetingSpaces,
  templates,
} from "./lib/meeting.ts";
import type { MeetingInfraSpace } from "./lib/meeting.ts";
const api = createApi(import.meta.env.VITE_API_BASE_URL || "/api");
function load() {
  try {
    return { data: parseDemo(localStorage.getItem(STORE_KEY)), error: "" };
  } catch (e) {
    return {
      data: initialDemo(),
      error:
        e instanceof Error ? e.message : "브라우저 저장소를 읽을 수 없습니다.",
    };
  }
}
export default function App() {
  const [loaded] = useState(load);
  const [demo, setDemo] = useState<DemoState>(loaded.data);
  const [storeError, setStoreError] = useState(loaded.error);
  const [mode, setMode] = useState<DataMode>(() => new URLSearchParams(location.search).get("source") === "api" ? "api" : "demo");
  const [page, setPage] = useState<"infra" | "apps" | "integration">(() => new URLSearchParams(location.search).has("app") ? "apps" : "infra");
  const [menuOpen, setMenuOpen] = useState(false);
  const [appDraft, setAppDraft] = useState<AppSpaceCreate | null>(null);
  const [apiAppDraft, setApiAppDraft] = useState<AppSpaceCreate | null>(null);
  const [newInfra, setNewInfra] = useState(false);
  const [infraDraft, setInfraDraft] = useState<InfraSpaceDraft | null>(null);
  const [activeSpaceId, setActiveSpaceId] = useState("");
  const [infras, setInfras] = useState<InfraSpace[]>(foundations);
  const [apps, setApps] = useState<AppSpace[]>([]);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [repositoryLoading, setRepositoryLoading] = useState(false);
  const [repositoryError, setRepositoryError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<InfraSpace | null>(null);
  useEffect(() => {
    let active = true;
    if (mode === "api") {
      Promise.resolve().then(() => {
        if (active) {
          setLoading(true);
          setError("");
          setInfras([]);
          setApps([]);
        }
      });
      Promise.all([api.infras(), api.apps()])
        .then(([foundations, applications]) => {
          if (active) {
            setInfras(foundations);
            setApps(applications);
          }
        })
        .catch((e) => {
          if (active) setError(e instanceof Error ? e.message : "요청 실패");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }
    return () => {
      active = false;
    };
  }, [mode, reload]);
  useEffect(() => {
    if (mode !== "api") return;
    let active = true;
    Promise.resolve().then(() => {
      if (active) { setRepositoryLoading(true); setRepositoryError(""); setRepositories([]); }
    });
    api.repositories().then((items) => {
      if (active) setRepositories(items);
    }).catch((e) => {
      if (active) setRepositoryError(e instanceof Error ? e.message : "Repository 조회 실패");
    }).finally(() => { if (active) setRepositoryLoading(false); });
    return () => { active = false; };
  }, [mode, page, reload]);
  function persist(next: DemoState) {
    if (storeError) throw new Error("손상된 저장소를 먼저 확인·초기화하세요.");
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(next));
      setDemo(next);
    } catch {
      throw new Error(
        "브라우저에 저장하지 못했습니다. 저장 공간·권한을 확인하세요.",
      );
    }
  }
  const updateDeployment = useCallback(
    (deployment: Deployment) => {
      if (mode === "api") {
        setApps((current) =>
          current.some(
            (a) =>
              a.id === deployment.app_space_id &&
              a.latest_deployment_id !== deployment.id,
          )
            ? current.map((a) =>
                a.id === deployment.app_space_id
                  ? { ...a, latest_deployment_id: deployment.id }
                  : a,
              )
            : current,
        );
        return;
      }
      setDemo((current) => {
        const previous = current.deployments.find(
          (d) => d.id === deployment.id,
        );
        if (previous && JSON.stringify(previous) === JSON.stringify(deployment))
          return current;
        const next = {
          ...current,
          deployments: [
            deployment,
            ...current.deployments.filter((d) => d.id !== deployment.id),
          ],
          apps: current.apps.map((a) =>
            a.id === deployment.app_space_id
              ? { ...a, latest_deployment_id: deployment.id }
              : a,
          ),
        };
        try {
          localStorage.setItem(STORE_KEY, JSON.stringify(next));
          return next;
        } catch {
          queueMicrotask(() =>
            setStoreError("배포 샘플 상태를 브라우저에 저장하지 못했습니다."),
          );
          return current;
        }
      });
    },
    [mode],
  );
  function changeMode(next: DataMode) {
    if (next === mode) return;
    const url = new URL(location.href);
    url.searchParams.set("source", next);
    url.searchParams.delete("app");
    history.replaceState(null, "", url);
    setNewInfra(false);
    setActiveSpaceId("");
    setMode(next);
    setRepositories([]);
    setRepositoryError("");
    setRepositoryLoading(next === "api");
    setSelected(null);
    setError("");
    setLoading(false);
    setInfras(next === "demo" ? foundations : []);
    setApps([]);
  }
  function nav(next: "infra" | "apps" | "integration") {
    const url = new URL(location.href);
    url.searchParams.delete("app");
    history.replaceState(null, "", url);
    setMenuOpen(false);
    setNewInfra(false);
    setActiveSpaceId("");
    setPage(next);
    setSelected(null);
  }
  function reset() {
    try {
      localStorage.removeItem(STORE_KEY);
      setDemo(initialDemo());
      setStoreError("");
      setSelected(null);
    } catch {
      setStoreError("브라우저 저장소를 초기화할 수 없습니다.");
    }
  }
  const shownApps = mode === "demo" ? demo.apps : apps;
  const meeting = demo.meeting ?? newMeetingState();
  const availableInfras =
    mode === "demo" ? [...foundations, ...readyMeetingSpaces(meeting)] : infras;
  const savedSpace = meeting.spaces.find((s) => s.id === activeSpaceId);
  const activeSpace = savedSpace ?? (mode === "demo" ? preparedInfraSpaces.find((s) => s.id === activeSpaceId) : undefined);
  const preparedSpace = !!activeSpace && !savedSpace;
  function networkSummary(infra: InfraSpace) {
    const choices = mode === "demo"
      ? (meeting.spaces.find((space) => space.id === infra.id) ?? preparedInfraSpaces.find((space) => space.id === infra.id))?.flow?.choices
      : undefined;
    if (choices) return [
      choices.visibility === "public" ? "인터넷 경로 포함" : "외부 직접 경로 없음",
      choices.availability === "multi" ? "다중 AZ" : "단일 AZ",
    ].join(", ");
    return {
      public: "인터넷 경로 포함",
      private: "외부 직접 경로 없음",
      ha: "고가용성, 접근 방식/AZ 상세 미제공",
      "multi-az": "다중 AZ, 접근 방식 상세 미제공",
      "db-isolated": "DB 격리, 접근 방식 상세 미제공",
    }[infra.network];
  }
  function createSpace(space: MeetingInfraSpace) {
    if (mode !== "demo") return;
    persist({
      ...demo,
      meeting: { ...meeting, spaces: [space, ...meeting.spaces] },
    });
    setInfraDraft(null);
    setNewInfra(false);
    setActiveSpaceId(space.id);
  }
  return (
    <div className="console">
      <a className="skip-link" href="#content">
        본문으로 이동
      </a>
      <aside
        className={"sidebar" + (menuOpen ? " is-open" : "")}
        id="primary-navigation"
      >
        <a className="brand" href="#" onClick={() => nav("infra")}>
          <img className="brand-icon" src="/freesia-mascot.jpg" alt="" />
          <span className="brand-name">
            Freesia<small>아이디어가 자라는 공간</small>
          </span>
        </a>
        <nav className="sidebar-nav" aria-label="주요 메뉴">
          <button
            className={"sidebar-link" + (page === "infra" ? " active" : "")}
            aria-label="인프라 스페이스"
            aria-current={page === "infra" ? "page" : undefined}
            onClick={() => nav("infra")}
          >
            <span className="sidebar-number" aria-hidden="true">
              01
            </span>
            <span className="sidebar-label">인프라 스페이스</span>
          </button>
          <button
            className={"sidebar-link" + (page === "apps" ? " active" : "")}
            aria-label="애플리케이션 스페이스"
            aria-current={page === "apps" ? "page" : undefined}
            onClick={() => nav("apps")}
          >
            <span className="sidebar-number" aria-hidden="true">
              02
            </span>
            <span className="sidebar-label">애플리케이션 스페이스</span>
          </button>
          <button
            className={"sidebar-link" + (page === "integration" ? " active" : "")}
            aria-label="통합"
            aria-current={page === "integration" ? "page" : undefined}
            onClick={() => nav("integration")}
          >
            <span className="sidebar-number" aria-hidden="true">
              03
            </span>
            <span className="sidebar-label">통합</span>
          </button>
        </nav>
      </aside>
      <header className="masthead">
        <button
          className="sidebar-toggle"
          aria-label="주요 메뉴 열기"
          aria-controls="primary-navigation"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <svg
            className="sidebar-toggle-icon"
            viewBox="0 0 20 20"
            aria-hidden="true"
          >
            <path
              d="M3 5h14M3 10h14M3 15h14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          메뉴
        </button>
        <div className="masthead-controls">
          <div className="workspace-label">
            <span className="workspace-dot" aria-hidden="true" />
            <span>
              softbank-hackathon<small>공통 기반에서 애플리케이션까지</small>
            </span>
          </div>
          <label className="mode-label">
            데이터 소스
            <select
              aria-label="데이터 소스"
              value={mode}
              onChange={(e) => changeMode(e.target.value as DataMode)}
            >
              <option value="demo">데모</option>
              <option value="api">백엔드 API</option>
            </select>
          </label>
        </div>
      </header>
      <div className="workspace">
        <div className={"source-banner " + mode} role="status">
          {mode === "demo"
            ? "데모 모드 · 브라우저 샘플 데이터입니다. 실제 AI·클라우드 작업을 실행하지 않습니다."
            : "백엔드 API 모드 · 서버가 제공하는 데이터를 표시합니다. 실제 AI·클라우드 실행 여부는 서버 설정에 따라 달라집니다."}
        </div>
        <main id="content">
          {mode === "demo" && storeError && (
            <div className="error" role="alert">
              <strong>브라우저 저장소 확인이 필요합니다.</strong>
              <p>{storeError}</p>
              <p>
                초기화하면 이 브라우저의 설계·앱·배포 샘플 데이터가 삭제됩니다.
              </p>
              <button onClick={reset}>손상된 데모 데이터 초기화</button>
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              <strong>데이터를 불러오지 못했습니다.</strong>
              <p>{error}</p>
              <button onClick={() => setReload((n) => n + 1)}>다시 시도</button>
            </div>
          )}
          {page === "integration" ? (
            <GitHubIntegration
              key={mode}
              mode={mode}
              apiRepositories={repositories}
              loading={mode === "api" && repositoryLoading}
              loadError={mode === "api" ? repositoryError : ""}
              onRefresh={() => setReload((n) => n + 1)}
              onApiChange={setRepositories}
              connection={meeting.github}
              onSave={(github) => persist({ ...demo, meeting: { ...meeting, github } })}
            />
          ) : page === "apps" ? (
            <Applications
              key={mode}
              mode={mode}
              apps={shownApps}
              infras={availableInfras}
              designs={mode === "demo" ? demo.designs : []}
              deployments={mode === "demo" ? demo.deployments : []}
              onCreate={(app) => {
                if (mode === "demo")
                  persist({ ...demo, apps: [app, ...demo.apps] });
                else setApps((current) => [app, ...current]);
                if (mode === "demo") setAppDraft(null);
                else setApiAppDraft(null);
              }}
              onDeployment={updateDeployment}
              initialForm={mode === "demo" ? appDraft : apiAppDraft}
              onDraftChange={mode === "demo" ? setAppDraft : setApiAppDraft}
              meeting={meeting}
              apiRepositories={repositories}
              repositoryLoading={repositoryLoading}
              repositoryError={repositoryError}
              onRefreshRepositories={() => setReload((n) => n + 1)}
              onIntegration={() => nav("integration")}
              onStartDeployment={(entry) =>
                mode === "api" ? updateDeployment(entry) : persist({
                  ...demo,
                  deployments: [entry, ...demo.deployments],
                  apps: demo.apps.map((a) =>
                    a.id === entry.app_space_id
                      ? { ...a, latest_deployment_id: entry.id }
                      : a,
                  ),
                })
              }
            />
          ) : newInfra ? (
            <InfraSpaceForm
              key={mode}
              unavailable={mode === "api"}
              draft={mode === "demo" ? infraDraft : null}
              onDraft={setInfraDraft}
              onCreate={createSpace}
              onCancel={() => setNewInfra(false)}
            />
          ) : activeSpace?.flow && mode === "demo" ? (
            <InfraBuilder key={activeSpace.id} space={activeSpace}
              onCancel={() => setActiveSpaceId("")}
              readOnly={preparedSpace}
              canDiscard={!preparedSpace && canDiscardInfra(activeSpace, demo.apps)}
              onDiscard={() => {
                if (preparedSpace || !canDiscardInfra(activeSpace, demo.apps)) throw new Error("배포 중이거나 연결된 앱이 있는 Space는 삭제할 수 없습니다.");
                persist({ ...demo, meeting: { ...meeting, spaces: meeting.spaces.filter((space) => space.id !== activeSpace.id) } });
                setActiveSpaceId("");
              }}
              onSave={(entry) => {
                if (preparedSpace) throw new Error("미리 준비한 데모 예시는 읽기 전용입니다.");
                persist({...demo, meeting: {...meeting, spaces: meeting.spaces.map(s => s.id === entry.id ? entry : s)}});
              }}
            />
          ) : mode === "api" && selected ? (
            <ApiInfraBuilder space={selected} onCancel={() => setSelected(null)} />
          ) : (
            <>
              <div className="page-heading infra-page-heading">
                <div>
                  <div className="eyebrow">INFRA SPACE</div>
                  <h1>인프라 스페이스</h1>
                  <p>
                    VPC, Subnet 등 공통 네트워크 기반을 설계하고, 연결된 애플리케이션을 확인하세요.
                  </p>
                </div>
              </div>
              {mode === "api" && (
                <p className="notice">
                  연동 대기 · Infra Space 생성·인프라 배포 API는 아직 없습니다. 서버 기반은 읽기 전용이며, 대화·코드·Apply 영역은 API 연결 후 사용할 수 있습니다.
                </p>
              )}
              {mode === "demo" &&
                meeting.spaces.some((s) => s.status !== "demo_deployed") && (
                  <section className="panel" aria-label="작성 중인 Infra Space">
                    <h2>작성 중인 Space</h2>
                    <div className="app-list">
                      {meeting.spaces
                        .filter((s) => s.status !== "demo_deployed")
                        .map((s) => (
                          <button
                            key={s.id}
                            aria-label={"Space 상세: " + s.name}
                            onClick={() => {
                              setActiveSpaceId(s.id);
                              setSelected(null);
                            }}
                          >
                            <strong>{s.name}</strong>
                            <span>
                              {s.flow ? "AI 설계 진행 중" : "이전 템플릿 샘플"} · 미구축
                            </span>
                          </button>
                        ))}
                    </div>
                  </section>
                )}
              {mode === "demo" && activeSpace && (
                <section className="panel detail" aria-label="Space 상세">
                  <div className="section-heading">
                    <h2>{activeSpace.name}</h2>
                    <button onClick={() => setActiveSpaceId("")}>닫기</button>
                  </div>
                  <p className="notice">
                    {activeSpace.status === "demo_deployed"
                      ? "DEMO 배포 완료 · 실제 AWS 리소스가 아닙니다."
                      : "코드 초안 · 미구축. 앱 배포 기반으로 아직 선택할 수 없습니다."}
                  </p>
                  <dl>
                    <dt>기업 / 대상</dt>
                    <dd>{activeSpace.target}</dd>
                    <dt>리전</dt>
                    <dd>{activeSpace.region}</dd>
                    <dt>템플릿</dt>
                    <dd>{activeSpace.template ? templates[activeSpace.template].name : "미선택"}</dd>
                    <dt>샘플 구성 설명</dt>
                    <dd>
                      {activeSpace.template ? templates[activeSpace.template].contents.join(" · ") : ""}
                    </dd>
                  </dl>
                  <ul>
                    {activeSpace.limitations.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <p className="notice">이전 템플릿 샘플 · 새 AI 질의응답 흐름과 연결되지 않은 읽기 전용 기록입니다. 새 설계는 Infra Space 만들기에서 시작하세요.</p>
                  <details>
                    <summary>Terraform 초안 · 미검증</summary>
                    <pre tabIndex={0}>
                      <code>{activeSpace.code}</code>
                    </pre>
                  </details>
                </section>
              )}
              <section className="panel infra-list" aria-labelledby="infra-list-heading">
                <div className="section-heading">
                  <h2 id="infra-list-heading">인프라 스페이스{!loading && !error && ` (${availableInfras.length})`}</h2>
                  <div className="heading-actions">
                    <button
                      className="secondary"
                      onClick={() => setReload((n) => n + 1)}
                      disabled={loading}
                    >
                      새로고침
                    </button>
                    <button
                      className="primary"
                      onClick={() => {
                        setNewInfra(true);
                        setSelected(null);
                        setActiveSpaceId("");
                      }}
                    >
                      인프라 스페이스 만들기
                    </button>
                  </div>
                </div>
                {loading ? (
                  <div className="empty" aria-live="polite">불러오는 중…</div>
                ) : (
                  <>
                    <p className="scroll-hint">
                      작은 화면에서는 표를 좌우로 스크롤하세요.
                    </p>
                    <div className="table-scroll" tabIndex={0}>
                      <table>
                        <thead>
                          <tr>
                            <th scope="col">이름</th>
                            <th scope="col">네트워크 구성</th>
                            <th scope="col">연결된 애플리케이션</th>
                            <th scope="col">생성된 시간</th>
                          </tr>
                        </thead>
                        <tbody>
                          {availableInfras.map((infra) => (
                            <tr key={infra.id}>
                              <td>
                                <button
                                  className="text-button"
                                  onClick={() => {
                                    if (
                                      mode === "demo" && (meeting.spaces.some(
                                        (s) => s.id === infra.id,
                                      ) || preparedInfraSpaces.some((s) => s.id === infra.id))
                                    ) {
                                      setActiveSpaceId(infra.id);
                                      setSelected(null);
                                    } else {
                                      setSelected(infra);
                                      setActiveSpaceId("");
                                    }
                                  }}
                                >
                                  {infra.name}
                                </button>
                                <small>{infra.id}</small>
                              </td>
                              <td>
                                <span>{networkSummary(infra)}</span>
                              </td>
                              <td>
                                {mode === "demo"
                                  ? demo.apps.filter(
                                      (a) => a.infra_id === infra.id,
                                    ).length
                                  : infra.app_count}
                              </td>
                              <td className="muted">미제공</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!availableInfras.length && !error && (
                      <div className="empty">등록된 기반이 없습니다.</div>
                    )}
                  </>
                )}
              </section>
              {selected && (
                <section className="panel detail" aria-label="인프라 상세">
                  <div className="section-heading">
                    <h2>{selected.name}</h2>
                    <button onClick={() => setSelected(null)}>닫기</button>
                  </div>
                  <p>{selected.description}</p>
                  <dl>
                    <dt>네트워크 구성</dt>
                    <dd>{networkSummary(selected)}</dd>
                    <dt>앱 배포 시 선택 가능한 실행 환경</dt>
                    <dd>{selected.computes.join(", ")}</dd>
                    <dt>상태</dt>
                    <dd>
                      {mode === "demo"
                        ? "준비된 기반 샘플"
                        : "서버에 등록된 기반"}
                    </dd>
                  </dl>
                  <p className="muted">
                    실행 환경은 앱 배포 단계에서 선택하는 컴퓨팅 후보입니다.
                    리전·VPC·Subnet·가용 영역의 상세 정보는 현재 API에서 제공하지
                    않습니다.
                  </p>
                </section>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
