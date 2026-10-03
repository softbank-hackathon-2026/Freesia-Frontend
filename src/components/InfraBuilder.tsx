import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { InfraSpace } from "../lib/types.ts";
import { getInfraProvider } from "../lib/providers.ts";
import { advanceInfraApply, generateInfra, reviseInfra, startInfraApply } from "../lib/infraFlow.ts";
import type { MeetingInfraSpace } from "../lib/meeting.ts";

function InfraDesignLayout({ name, description, actions, notice, children }: {
  name: string;
  description: ReactNode;
  actions: ReactNode;
  notice: ReactNode;
  children: ReactNode;
}) {
  return <>
    <div className="page-heading">
      <div>
        <div className="eyebrow">INFRA SPACE / AI DESIGN</div>
        <h1>{name}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{actions}</div>
    </div>
    {notice}
    <ol className="infra-steps" aria-label="인프라 설계 순서">
      <li>질의응답</li><li>Terraform 생성·검토</li><li>Apply 결과</li>
    </ol>
    {children}
  </>;
}

export function ApiInfraBuilder({ space, onCancel }: { space: InfraSpace; onCancel: () => void }) {
  return <InfraDesignLayout
    name={space.name}
    description={<>{space.description}<span className="infra-provider-label">{getInfraProvider(space.provider).label}</span></>}
    actions={<button onClick={onCancel}>목록으로</button>}
    notice={<div className="notice">연동 대기 · 서버에서 받은 Infra Space 정보입니다. 요구사항 대화·Terraform·Apply 이력은 현재 API에서 제공하지 않습니다.</div>}
  >
    <section className="panel conversation infra-flow-panel" aria-label="인프라 질의응답">
      <h2>1. 요구사항 대화</h2>
      <label htmlFor="requirement">인프라 요구사항</label>
      <textarea id="requirement" rows={3} disabled placeholder="연동 대기 · AI 대화 API가 연결되면 요구사항을 입력할 수 있습니다." />
      <button className="primary" disabled>질문 시작</button>
    </section>
    <section className="panel code-panel infra-flow-panel" aria-label="인프라 코드 검토">
      <h2>2. Terraform 생성·검토</h2>
      <p className="empty">연동 대기 · 서버가 제공한 Terraform 코드가 없습니다.</p>
      <button disabled>.tf 다운로드</button>
      <label><input type="checkbox" checked={false} disabled />선택한 코드와 실행 내용을 검토했습니다</label>
      <button className="primary" disabled>Apply 시작</button>
    </section>
    <section className="panel infra-flow-panel" aria-label="인프라 Apply 결과">
      <h2>3. Apply 결과</h2>
      <p className="empty">연동 대기 · Apply 결과를 조회할 수 없습니다. 배포 여부는 확인되지 않았습니다.</p>
    </section>
  </InfraDesignLayout>;
}

export default function InfraBuilder({ space, onSave, onCancel, canDiscard, onDiscard, readOnly = false }: {
  space: MeetingInfraSpace;
  onSave: (space: MeetingInfraSpace) => void;
  onCancel: () => void;
  canDiscard: boolean;
  readOnly?: boolean;
  onDiscard: () => void;
}) {
  const flow = space.flow!;
  const [request, setRequest] = useState(flow.request);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [fail, setFail] = useState(false);
  const operation = flow.apply;
  const busy = operation?.status === "pending" || operation?.status === "applying";
  function save(next: MeetingInfraSpace) {
    if (readOnly) return false;
    try {
      onSave(next);
      setError("");
      return true;
    }
    catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
      setRunning(false);
      return false;
    }
  }
  useEffect(() => {
    if (readOnly || !running || !busy)
      return;
    const timer = setTimeout(() => {
      try {
        onSave(advanceInfraApply(space));
      }
      catch (e) {
        setError(e instanceof Error ? e.message : "진행 상태 저장 실패");
        setRunning(false);
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [running, busy, space, onSave, readOnly]);
  function download() {
    const url = URL.createObjectURL(new Blob([space.code], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "main.tf";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <InfraDesignLayout
        name={space.name}
        description={[space.target, space.region || "리전 미정 · 대화에서 설정"].filter(Boolean).join(" · ")}
        actions={<><button onClick={onCancel}>목록으로</button>
          {space.status !== "demo_deployed" && <button disabled={!canDiscard} onClick={() => {
            if (!canDiscard || !window.confirm(`“${space.name}” 작성을 취소하고 이 Space를 삭제할까요? 저장한 요구사항과 코드가 삭제되며 되돌릴 수 없습니다.`)) return;
            try { onDiscard(); }
            catch (e) { setError(e instanceof Error ? e.message : "작성 취소 실패"); }
          }}>작성 취소</button>}</>}
        notice={<>
          {readOnly && <div className="notice">미리 준비한 데모 예시 · 읽기 전용입니다. 아래 대화·코드·완료 상태는 실제 사용자의 AI 대화나 AWS 배포 이력이 아닙니다.</div>}
          <div className="notice">AI 질의응답·Apply 데모 · 실제 AI와 클라우드를 호출하지 않습니다. 자유 입력은 기록만 하며 분석하지 않습니다. 구조화된 답변으로 고정 VPC/Subnet 코드 초안을 만듭니다.</div>
        </>}
      >
      {error && <div className="error" role="alert">{error}</div>}
      <section className="panel conversation infra-flow-panel" aria-label="인프라 질의응답">
        <h2>1. 요구사항 대화</h2>
        {flow.step === -1 ? (
          <form onSubmit={(e) => {
            e.preventDefault();
            if (!request.trim()) { setError("요구사항을 입력하세요."); return; }
            save(reviseInfra(space, request, flow.choices, 0));
          }}>
            <label htmlFor="requirement">인프라 요구사항</label>
            <textarea id="requirement" value={request} maxLength={4000} rows={3}
              onChange={(e) => {
                setRequest(e.target.value);
                save(reviseInfra(space, e.target.value, flow.choices, -1));
              }} placeholder="어떤 인프라가 필요한지 설명하세요." />
            <button className="primary">질문 시작</button>
          </form>
        ) : (
          <>
            <div className="chat user">{flow.request}</div>
            <div className="chat assistant">AWS 네트워크 샘플을 어느 리전에 구성할까요?</div>
            {!flow.choices.region ? (
              <div className="choice-buttons">
                {[["ap-northeast-2", "서울 · ap-northeast-2"], ["ap-northeast-1", "도쿄 · ap-northeast-1"]].map(([region, label]) => (
                  <button key={region} onClick={() => save(reviseInfra(space, flow.request, { ...flow.choices, region }, 0))}>{label}</button>
                ))}
              </div>
            ) : <div className="chat user">{flow.choices.region}</div>}
            {flow.choices.region && <>
            <div className="chat assistant">인터넷 경로가 필요한가요?</div>
            {flow.step === 0 ? (
              <div className="choice-buttons">
                {[["public", "Public · 인터넷 경로 포함"], ["private", "Private · 외부 경로 제외"]].map(([value, label]) => (
                  <button key={value} onClick={() => save(reviseInfra(space, flow.request, { ...flow.choices, visibility: value }, 1))}>
                    {label}
                  </button>
                ))}
              </div>
            ) : <div className="chat user">{flow.choices.visibility}</div>}
            {flow.step >= 1 && (
              <>
                <div className="chat assistant">Subnet을 몇 개의 가용 영역에 배치할까요?</div>
                {flow.step === 1 ? (
                  <div className="choice-buttons">
                    {[["single", "Single AZ · 1개"], ["multi", "Multi AZ · 2개"]].map(([value, label]) => (
                      <button key={value} onClick={() => save(reviseInfra(space, flow.request, { ...flow.choices, availability: value }, 2))}>
                        {label}
                      </button>
                    ))}
                  </div>
                ) : <div className="chat user">{flow.choices.availability === "multi" ? "Multi AZ · 2개" : "Single AZ · 1개"}</div>}
              </>
            )}
            </>}
            {!readOnly && <button disabled={busy} className="text-button" onClick={() => {
              setRunning(false);
              save(reviseInfra(space, flow.request, { region: "", visibility: "", availability: "" }, -1));
            }}>답변 수정 · 이후 결과 초기화</button>}
          </>
        )}
      </section>
      {flow.step === 2 && !space.code && (
        <section className="panel infra-flow-panel" aria-label="인프라 코드 생성">
          <h2>2. Terraform 생성·검토</h2>
          <p>답변한 리전·인터넷 경로·가용 영역을 코드에 반영합니다. NAT·ALB·ECS Cluster·DB·IAM 전체 구성은 포함하지 않습니다.</p>
          <button className="primary" onClick={() => save(generateInfra(space))}>답변으로 Terraform 생성</button>
        </section>
      )}
      {space.code && (
        <section className="panel code-panel infra-flow-panel" aria-label="인프라 코드 검토">
          <h2>2. Terraform 생성·검토</h2>
          <p>{flow.choices.region} · {flow.choices.visibility} · {flow.choices.availability === "multi" ? "2 AZ" : "1 AZ"} · main.tf · 미검증 샘플</p>
          {flow.legacySelection && <p className="notice">이전 추천안에서 선택한 실제 구성을 복원했습니다. 기존 코드와 Apply 상태는 유지됩니다.</p>}
          <button onClick={download}>.tf 다운로드</button>
          <pre tabIndex={0} aria-label="Terraform 코드"><code>{space.code}</code></pre>
          <label>
            <input type="checkbox" checked={flow.reviewed} disabled={readOnly || busy || operation?.status === "success"}
              onChange={(e) => save({ ...space, flow: { ...flow, reviewed: e.target.checked, apply: null } })} />
            {readOnly ? "미리 준비한 코드 검토 완료 상태 예시" : "선택한 코드와 데모 제한을 검토했습니다"}
          </label>
          {!readOnly && <label>
            <input type="checkbox" checked={fail} disabled={busy} onChange={(e) => setFail(e.target.checked)} />
            Apply 실패 시연
          </label>}
          {!readOnly && !busy && operation?.status !== "success" && (
            <button className="primary" disabled={!flow.reviewed} onClick={() => {
              if (save(startInfraApply(space, fail))) setRunning(true);
            }}>{operation?.status === "failed" ? "Apply 다시 시도 · 데모" : "Apply 시작 · 데모"}</button>
          )}
        </section>
      )}
      {operation && (
        <section className="panel infra-flow-panel" aria-label="인프라 Apply 결과">
          <h2>3. Apply 결과</h2>
          <progress aria-label="인프라 Apply 진행률" max={3} value={operation.phase} />
          <p role="status">
            {operation.status === "success"
              ? (readOnly ? "미리 준비한 DEMO Apply 완료 예시 · 실제 AWS 리소스와 적용 이력은 없습니다." : "DEMO Apply 완료 · 앱에서 선택 가능한 기반 샘플입니다. 실제 AWS 리소스는 없습니다.")
              : operation.status === "failed"
                ? "Apply 실패 시연 · 준비된 기반으로 등록되지 않았습니다."
                : `${operation.phase === 0 ? "대기" : "적용 진행"} · ${operation.phase} / 3 · 실제 Terraform 실행 없음`}
          </p>
          {busy && <button onClick={() => setRunning((r) => !r)}>{running ? "진행 일시정지" : "Apply 데모 이어하기"}</button>}
          {busy && !running && <p>진행이 멈춰 있습니다. 이어하기를 눌러야 데모가 계속됩니다.</p>}
        </section>
      )}
      </InfraDesignLayout>
    </>
  );
}
