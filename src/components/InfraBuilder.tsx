import { useEffect, useRef, useState } from "react";
import { generateTerraform, makeDesign } from "../lib/demo.ts";
import type { Choices, InfraDesign } from "../lib/demo.ts";
import type { DataMode } from "../lib/types.ts";
export type BuilderDraft = {
  request: string;
  step: number;
  choices: Choices;
  name: string;
};
const questions = [
  {
    key: "region",
    title: "어느 리전에 기반을 준비할까요?",
    options: [
      ["ap-northeast-2", "서울"],
      ["ap-northeast-1", "도쿄"],
    ],
  },
  {
    key: "visibility",
    title: "워크로드가 인터넷에 직접 접근해야 하나요?",
    options: [
      ["public", "Public · 인터넷 경로 포함"],
      ["private", "Private · 외부 경로 제외"],
    ],
  },
  {
    key: "availability",
    title: "몇 개의 가용 영역에 Subnet을 배치할까요?",
    options: [
      ["single", "Single AZ · 1개"],
      ["multi", "Multi AZ · 2개"],
    ],
  },
] as const;
export default function InfraBuilder({
  mode,
  onSave,
  onCancel,
  initialDraft,
  onDraftChange,
}: {
  mode: DataMode;
  onSave: (design: InfraDesign) => void;
  onCancel: () => void;
  initialDraft: BuilderDraft | null;
  onDraftChange: (draft: BuilderDraft) => void;
}) {
  const [request, setRequest] = useState(initialDraft?.request ?? "");
  const [step, setStep] = useState(initialDraft?.step ?? -1);
  const [choices, setChoices] = useState<Choices>(
    initialDraft?.choices ?? {
      region: "",
      visibility: "",
      availability: "",
    },
  );
  const [name, setName] = useState(initialDraft?.name ?? "");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [exitConfirm, setExitConfirm] = useState(false);
  const exitDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (exitConfirm) exitDialog.current?.showModal();
  }, [exitConfirm]);
  useEffect(() => {
    onDraftChange({ request, step, choices, name });
  }, [request, step, choices, name, onDraftChange]);
  const complete = step === 3;
  const code = complete ? generateTerraform(choices) : "";
  const summary = `${choices.region || "미선택"} · ${choices.visibility || "미선택"} · ${choices.availability === "multi" ? "Multi AZ" : choices.availability === "single" ? "Single AZ" : "미선택"}`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setNotice("Terraform 코드를 복사했습니다.");
    } catch {
      setError("클립보드를 사용할 수 없습니다. 코드 다운로드를 이용하세요.");
    }
  }
  function download() {
    const a = document.createElement("a");
    const url = URL.createObjectURL(
      new Blob([code], { type: "text/plain;charset=utf-8" }),
    );
    a.href = url;
    a.download = "main.tf";
    a.click();
    URL.revokeObjectURL(url);
    setNotice("main.tf 파일을 다운로드했습니다.");
  }
  function save() {
    try {
      onSave(makeDesign(name, request, choices));
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">INFRA SPACE / NEW DESIGN</div>
          <h1>AI와 인프라 설계</h1>
          <p>요구사항을 설명하고 질문에 답해 Terraform 초안을 확인하세요.</p>
        </div>
        <button
          className="secondary"
          onClick={() => {
            if (request.trim() || name.trim()) setExitConfirm(true);
            else onCancel();
          }}
        >
          목록으로
        </button>
      </div>
      {mode === "api" ? (
        <section className="panel empty">
          <h2>AI 인프라 설계 API가 아직 없습니다</h2>
          <p>
            대화·코드 생성·설계 저장 계약이 필요합니다. 데모 모드에서 화면
            흐름을 확인할 수 있습니다.
          </p>
        </section>
      ) : (
        <>
          <div className="notice">
            가이드 대화 데모 · 실제 AI가 아닙니다. 선택한 옵션만 고정 VPC/Subnet
            템플릿에 반영됩니다. 자유 입력을 분석하거나 코드를 실행하지
            않습니다.
          </div>
          <div className="builder-grid">
            <section className="panel conversation">
              <div className="section-heading">
                <h2>요구사항 대화</h2>
                <span className="badge">
                  {step < 0 ? "시작 전" : `${Math.min(step + 1, 3)} / 3`}
                </span>
              </div>
              <div className="chat-body">
                <div className="chat assistant">
                  어떤 공통 기반이 필요한가요? 앱 실행 리소스는 이후
                  애플리케이션 배포에서 선택합니다.
                </div>
                {step < 0 ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!request.trim()) {
                        setError("요구사항을 입력하세요.");
                        return;
                      }
                      setError("");
                      setStep(0);
                    }}
                  >
                    <label htmlFor="requirement">인프라 요구사항</label>
                    <textarea
                      id="requirement"
                      value={request}
                      maxLength={4000}
                      onChange={(e) => setRequest(e.target.value)}
                      placeholder="예: 서울 리전에서 개발용 웹 서비스를 위한 기반이 필요합니다."
                      rows={5}
                    />
                    <button className="primary" type="submit">
                      질문 시작
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="chat user">{request}</div>
                    {questions.slice(0, Math.min(step + 1, 3)).map((q, i) => (
                      <div key={q.key}>
                        <div className="chat assistant">{q.title}</div>
                        {i < step ? (
                          <div className="chat user">
                            {
                              q.options.find(
                                (o) => o[0] === choices[q.key],
                              )?.[1]
                            }
                          </div>
                        ) : (
                          <div className="choice-buttons">
                            {q.options.map(([value, label]) => (
                              <button
                                key={value}
                                onClick={() => {
                                  setChoices((c) => ({ ...c, [q.key]: value }));
                                  setStep(i + 1);
                                  setError("");
                                }}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    {complete && (
                      <div className="chat assistant">
                        초안을 만들었습니다. 리소스는 아직 생성되지 않았습니다.
                        코드와 적용되지 않은 요구사항을 검토하고 설계로
                        저장하세요.
                      </div>
                    )}
                    <button
                      className="text-button"
                      onClick={() => {
                        setStep(-1);
                        setChoices({
                          region: "",
                          visibility: "",
                          availability: "",
                        });
                        setNotice("");
                      }}
                    >
                      처음부터 다시 답변
                    </button>
                  </>
                )}
              </div>
            </section>
            <section className="panel code-panel">
              <div className="section-heading">
                <h2>Terraform 초안</h2>
                <span className="badge caution">미구축</span>
              </div>
              <div className="code-summary">
                <p>{summary}</p>
                <p className="muted">
                  ALB·ECS Cluster·NAT·IAM·보안 규칙은 이 샘플에 포함되지
                  않습니다. 코드 저장은 AWS 리소스 생성을 의미하지 않습니다.
                </p>
              </div>
              {complete ? (
                <>
                  <div className="code-actions">
                    <button onClick={copy}>코드 복사</button>
                    <button onClick={download}>.tf 다운로드</button>
                  </div>
                  <pre tabIndex={0} aria-label="Terraform 코드">
                    <code>{code}</code>
                  </pre>
                  <div className="save-form">
                    <label htmlFor="design-name">설계 이름</label>
                    <input
                      id="design-name"
                      value={name}
                      maxLength={80}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="예: development-foundation"
                    />
                    <button
                      className="primary"
                      disabled={!name.trim()}
                      onClick={save}
                    >
                      설계 저장
                    </button>
                    <small>
                      이 브라우저에만 저장됩니다. 미구축 설계는 앱 배포에 사용할
                      수 없습니다.
                    </small>
                  </div>
                </>
              ) : (
                <div className="empty">
                  <p>필수 질문 3개에 답하면 코드가 표시됩니다.</p>
                  <button disabled>설계 저장</button>
                </div>
              )}
            </section>
          </div>
        </>
      )}
      {exitConfirm && (
        <dialog
          ref={exitDialog}
          aria-label="설계 대화 닫기"
          className="discard-dialog"
          onCancel={() => setExitConfirm(false)}
        >
          <h2>작성 중인 대화를 닫을까요?</h2>
          <p>저장하지 않은 요구사항·답변·코드는 사라집니다.</p>
          <div className="form-actions">
            <button autoFocus onClick={() => setExitConfirm(false)}>
              계속 작성
            </button>
            <button onClick={onCancel}>저장하지 않고 나가기</button>
          </div>
        </dialog>
      )}
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="notice">
          {notice}
        </div>
      )}
    </>
  );
}
