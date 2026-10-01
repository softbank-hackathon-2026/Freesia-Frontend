import { useCallback, useEffect, useState } from "react";
import { createApi } from "./lib/api.ts";
import { foundations, initialDemo, parseDemo, STORE_KEY } from "./lib/demo.ts";
import type { DemoState, InfraDesign } from "./lib/demo.ts";
import type {
  AppSpace,
  AppSpaceCreate,
  DataMode,
  Deployment,
  InfraSpace,
} from "./lib/types.ts";
import InfraBuilder from "./components/InfraBuilder.tsx";
import Applications from "./components/Applications.tsx";
import InfraSpaceForm from "./components/InfraSpaceForm.tsx";
import type { InfraSpaceDraft } from "./components/InfraSpaceForm.tsx";
import GitHubIntegration from "./components/GitHubIntegration.tsx";
import {
  connectGitHubDemo,
  foundationTarget,
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
  const [mode, setMode] = useState<DataMode>("demo");
  const [page, setPage] = useState<"infra" | "apps" | "integration">("infra");
  const [menuOpen, setMenuOpen] = useState(false);
  const [appDraft, setAppDraft] = useState<AppSpaceCreate | null>(null);
  const [newInfra, setNewInfra] = useState(false);
  const [infraDraft, setInfraDraft] = useState<InfraSpaceDraft | null>(null);
  const [activeSpaceId, setActiveSpaceId] = useState("");
  const [infras, setInfras] = useState<InfraSpace[]>(foundations);
  const [apps, setApps] = useState<AppSpace[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<InfraSpace | null>(null);
  const [design, setDesign] = useState<InfraDesign | null>(null);
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
    setNewInfra(false);
    setActiveSpaceId("");
    setMode(next);
    setSelected(null);
    setDesign(null);
    setError("");
    setLoading(false);
    setInfras(next === "demo" ? foundations : []);
    setApps([]);
  }
  function nav(next: "infra" | "apps" | "integration") {
    setMenuOpen(false);
    setNewInfra(false);
    setActiveSpaceId("");
    setPage(next);
    setSelected(null);
    setDesign(null);
  }
  function reset() {
    try {
      localStorage.removeItem(STORE_KEY);
      setDemo(initialDemo());
      setStoreError("");
      setSelected(null);
      setDesign(null);
    } catch {
      setStoreError("브라우저 저장소를 초기화할 수 없습니다.");
    }
  }
  const shownApps = mode === "demo" ? demo.apps : apps;
  const meeting = demo.meeting ?? newMeetingState();
  const availableInfras =
    mode === "demo" ? [...foundations, ...readyMeetingSpaces(meeting)] : infras;
  const activeSpace = meeting.spaces.find((s) => s.id === activeSpaceId);
  function createSpace(space: MeetingInfraSpace) {
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
            aria-label="인프라"
            aria-current={page === "infra" ? "page" : undefined}
            onClick={() => nav("infra")}
          >
            <span className="sidebar-number" aria-hidden="true">
              01
            </span>
            <span className="sidebar-label">인프라</span>
          </button>
          <button
            className={"sidebar-link" + (page === "apps" ? " active" : "")}
            aria-label="애플리케이션"
            aria-current={page === "apps" ? "page" : undefined}
            onClick={() => nav("apps")}
          >
            <span className="sidebar-number" aria-hidden="true">
              02
            </span>
            <span className="sidebar-label">애플리케이션</span>
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
            : "백엔드 API 모드 · 현재 서버도 고정 분석·배포 샘플을 반환합니다. 실제 AWS 배포가 아닙니다."}
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
              mode={mode}
              connection={meeting.github}
              onConnect={() =>
                persist({
                  ...demo,
                  meeting: { ...meeting, github: connectGitHubDemo() },
                })
              }
              onRegister={(ids) => {
                if (meeting.github)
                  persist({
                    ...demo,
                    meeting: {
                      ...meeting,
                      github: { ...meeting.github, registeredIds: ids },
                    },
                  });
              }}
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
                setAppDraft(null);
              }}
              onDeployment={updateDeployment}
              initialForm={appDraft}
              onDraftChange={setAppDraft}
              meeting={meeting}
              onIntegration={() => nav("integration")}
              onStartDeployment={(entry) =>
                persist({
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
          ) : newInfra && mode === "demo" ? (
            <InfraSpaceForm
              draft={infraDraft}
              onDraft={setInfraDraft}
              onCreate={createSpace}
              onCancel={() => setNewInfra(false)}
            />
          ) : activeSpace?.flow && mode === "demo" ? (
            <InfraBuilder key={activeSpace.id} space={activeSpace}
              onCancel={() => setActiveSpaceId("")}
              onSave={(entry) => persist({...demo, meeting: {...meeting, spaces: meeting.spaces.map(s => s.id === entry.id ? entry : s)}})}
            />
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">INFRA SPACE</div>
                  <h1>인프라</h1>
                  <p>
                    공통 기반을 설계하고 앱 배포에 사용할 기반을 확인하세요.
                  </p>
                </div>
                <div className="heading-actions">
                  <button
                    className="secondary"
                    onClick={() => setReload((n) => n + 1)}
                    disabled={loading}
                  >
                    새로고침
                  </button>
                  {mode === "demo" && (
                    <>
                      <button
                        className="primary"
                        onClick={() => {
                          setNewInfra(true);
                          setSelected(null);
                          setDesign(null);
                          setActiveSpaceId("");
                        }}
                      >
                        Infra Space 만들기
                      </button>

                    </>
                  )}
                </div>
              </div>
              {mode === "api" && (
                <p className="notice">
                  Infra Space 생성·인프라 배포 API는 아직 없습니다. 서버 기반만
                  읽기 전용으로 표시합니다.
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
                              setDesign(null);
                            }}
                          >
                            <strong>{s.name}</strong>
                            <span>
                              {s.target} · {s.flow ? "AI 설계 진행 중" : "이전 템플릿 샘플"} · 미구축
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
              {loading ? (
                <div className="empty" aria-live="polite">
                  불러오는 중…
                </div>
              ) : (
                <section className="panel">
                  <div className="section-heading">
                    <h2>준비된 기반</h2>
                    <span className="badge">{availableInfras.length}개</span>
                  </div>
                  <p className="scroll-hint">
                    작은 화면에서는 표를 좌우로 스크롤하세요.
                  </p>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>기반 이름</th>
                          <th>네트워크 유형</th>
                          <th>배포 대상</th>
                          <th>앱</th>
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
                                    meeting.spaces.some(
                                      (s) => s.id === infra.id,
                                    )
                                  ) {
                                    setActiveSpaceId(infra.id);
                                    setSelected(null);
                                  } else {
                                    setSelected(infra);
                                    setActiveSpaceId("");
                                  }
                                  setDesign(null);
                                }}
                              >
                                {infra.name}
                              </button>
                              <small>
                                {infra.id}
                                {mode === "demo"
                                  ? " · " + foundationTarget(infra.id, meeting)
                                  : ""}
                              </small>
                            </td>
                            <td>
                              <span className="badge">{infra.network}</span>
                            </td>
                            <td>{infra.computes.join(", ")}</td>
                            <td>
                              {mode === "demo"
                                ? demo.apps.filter(
                                    (a) => a.infra_id === infra.id,
                                  ).length
                                : infra.app_count}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!availableInfras.length && !error && (
                    <div className="empty">등록된 기반이 없습니다.</div>
                  )}
                </section>
              )}
              {mode === "demo" && (
                <section className="panel">
                  <div className="section-heading">
                    <h2>이전 별도 설계 · 읽기 전용</h2>
                    <span className="badge caution">
                      미구축 · {demo.designs.length}개
                    </span>
                  </div>
                  {demo.designs.length ? (
                    <div className="app-list">
                      {demo.designs.map((d) => (
                        <button
                          key={d.id}
                          onClick={() => {
                            setDesign(d);
                            setSelected(null);
                          }}
                        >
                          <strong>{d.name}</strong>
                          <span>설계 저장 · 미구축 · 앱 배포에 사용 불가</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="empty">
                      <p>
                        이전 버전에서 별도로 저장한 설계가 없습니다. 새 설계는 Infra Space 만들기에서 시작하세요.
                      </p>
                    </div>
                  )}
                </section>
              )}
              {selected && (
                <section className="panel detail" aria-label="인프라 상세">
                  <div className="section-heading">
                    <h2>{selected.name}</h2>
                    <button onClick={() => setSelected(null)}>닫기</button>
                  </div>
                  <p>{selected.description}</p>
                  <dl>
                    <dt>유형</dt>
                    <dd>{selected.network}</dd>
                    <dt>지원 배포 대상</dt>
                    <dd>{selected.computes.join(", ")}</dd>
                    <dt>상태</dt>
                    <dd>
                      {mode === "demo"
                        ? "준비된 기반 샘플"
                        : "백엔드 샘플 기반"}
                    </dd>
                  </dl>
                  <p className="muted">
                    리전·VPC·Subnet·가용 영역 정보는 현재 API에서 제공하지
                    않습니다.
                  </p>
                </section>
              )}
              {design && mode === "demo" && (
                <section className="panel detail" aria-label="저장한 설계 상세">
                  <div className="section-heading">
                    <h2>{design.name}</h2>
                    <button onClick={() => setDesign(null)}>닫기</button>
                  </div>
                  <p className="notice">
                    설계 저장 · 미구축. 실제 AWS 리소스는 생성되지 않았고 앱
                    배포에 사용할 수 없습니다.
                  </p>
                  <dl>
                    <dt>요구사항</dt>
                    <dd className="break-word">{design.requirement}</dd>
                    <dt>선택 조건</dt>
                    <dd>
                      {design.choices.region} · {design.choices.visibility} ·{" "}
                      {design.choices.availability}
                    </dd>
                  </dl>
                  <pre tabIndex={0} aria-label="저장한 Terraform 코드">
                    <code>{design.code}</code>
                  </pre>
                </section>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
