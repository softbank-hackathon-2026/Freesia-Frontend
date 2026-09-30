import { useEffect, useState } from "react";
import { makeInfraSpace, targets, templates } from "../lib/meeting.ts";
import type {
  InfraTemplate,
  MeetingInfraSpace,
  Target,
} from "../lib/meeting.ts";
export type InfraSpaceDraft = {
  name: string;
  target: Target;
  region: string;
  template: InfraTemplate;
};
export default function InfraSpaceForm({
  draft,
  onDraft,
  onCreate,
  onCancel,
}: {
  draft: InfraSpaceDraft | null;
  onDraft: (draft: InfraSpaceDraft) => void;
  onCreate: (space: MeetingInfraSpace) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<InfraSpaceDraft>(
    draft ?? {
      name: "",
      target: "AWS 샘플 대상",
      region: "ap-northeast-2",
      template: "public",
    },
  );
  const [error, setError] = useState("");
  useEffect(() => onDraft(form), [form, onDraft]);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">INFRA ADMIN / NEW SPACE</div>
          <h1>Infra Space 만들기</h1>
          <p>
            공통 기반의 대상과 템플릿을 정하고, 생성 후 인프라 배포를
            진행합니다.
          </p>
        </div>
        <button onClick={onCancel}>목록으로</button>
      </div>
      <form
        className="panel app-form"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            onCreate(makeInfraSpace(form));
          } catch (e) {
            setError(e instanceof Error ? e.message : "Space 생성 실패");
          }
        }}
      >
        <label htmlFor="infra-space-name">Space 이름</label>
        <input
          id="infra-space-name"
          maxLength={80}
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        />
        <label htmlFor="infra-target">기업 / 대상</label>
        <select
          id="infra-target"
          value={form.target}
          onChange={(e) =>
            setForm((f) => ({ ...f, target: e.target.value as Target }))
          }
        >
          {targets.map((target) => (
            <option key={target}>{target}</option>
          ))}
        </select>
        <p className="muted">
          기업·대상은 샘플 구분입니다. LINE 조직과 AWS 공급자의 실제 연결 관계는
          확정되지 않았습니다.
        </p>
        <label htmlFor="infra-region">리전</label>
        <select
          id="infra-region"
          value={form.region}
          onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
        >
          <option value="ap-northeast-2">서울 · ap-northeast-2</option>
          <option value="ap-northeast-1">도쿄 · ap-northeast-1</option>
        </select>
        <fieldset className="template-options">
          <legend>공통 기반 템플릿</legend>
          {Object.entries(templates).map(([key, value]) => (
            <label
              key={key}
              className={
                "template-option " + (form.template === key ? "chosen" : "")
              }
            >
              <input
                type="radio"
                name="infra-template"
                value={key}
                checked={form.template === key}
                onChange={() =>
                  setForm((f) => ({ ...f, template: key as InfraTemplate }))
                }
              />
              <span>
                <strong>{value.name}</strong>
                <small>{value.summary}</small>
                <small>{value.contents.join(" · ")}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="notice">
          화면 시연용 템플릿입니다. 생성한 Space는 미구축 상태이며,
          DB·Bastion·Endpoint 등 전체 Terraform이 생성되었다고 의미하지
          않습니다.
        </div>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <button className="primary">Space 생성 · 데모</button>
      </form>
    </>
  );
}
