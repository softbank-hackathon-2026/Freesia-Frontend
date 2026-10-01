import { useEffect, useState } from "react";
import { makeInfraSpace } from "../lib/meeting.ts";
import type {
  MeetingInfraSpace,
} from "../lib/meeting.ts";
export type InfraSpaceDraft = {
  name: string;
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
    { name: draft?.name ?? "" },
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
            이름으로 Space를 만든 뒤, 같은 Space에서 AI와 대화하며 네트워크 요구사항을 정하고 Terraform 검토·Apply를 진행합니다.
          </p>
        </div>
        <button onClick={onCancel}>목록으로</button>
      </div>
      <form
        className="panel app-form"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            onCreate(makeInfraSpace({ name: form.name }));
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
