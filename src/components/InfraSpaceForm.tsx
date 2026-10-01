import { useEffect, useState } from "react";
import { makeInfraSpace, targets } from "../lib/meeting.ts";
import type {
  MeetingInfraSpace,
  Target,
} from "../lib/meeting.ts";
export type InfraSpaceDraft = {
  name: string;
  target: Target;
  region: string;
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
            대상과 리전을 정한 뒤, 같은 Space에서 AI 질의응답·Terraform 검토·Apply를 진행합니다.
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
        <div className="notice">Space 생성은 인프라 배포가 아닙니다. 생성 후 요구사항을 답하고 Terraform을 생성하세요. 현재 전체 흐름은 데모입니다.</div>
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
