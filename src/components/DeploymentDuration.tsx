import { useEffect, useState } from "react";
import { watchDeployment } from "../lib/api.ts";
import type { DataMode, Deployment, DeploymentEvent } from "../lib/types.ts";

function formatDuration(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes === 0) return `${seconds}초`;
  const remainder = String(seconds % 60).padStart(2, "0");
  if (minutes < 60) return `${minutes}분 ${remainder}초`;
  return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분 ${remainder}초`;
}

export default function DeploymentDuration({ deployment, event, mode, apiBase, onSnapshot }: {
  deployment: Deployment;
  event: DeploymentEvent | null;
  mode: DataMode;
  apiBase: string;
  onSnapshot: (event: DeploymentEvent) => void;
}) {
  const { id, status, created_at: createdAt } = deployment;
  const terminal = status === "success" || status === "failed";
  const providedAt = terminal && event?.status === status ? event.at : undefined;
  const [clock, setClock] = useState(() => Date.now());
  const [snapshot, setSnapshot] = useState<{ id: string; status: Deployment["status"]; at: string | null } | null>(null);
  const restored = snapshot?.id === id && snapshot.status === status ? snapshot : null;

  useEffect(() => {
    if (terminal) return;
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [terminal]);

  useEffect(() => {
    if (!terminal || mode !== "api" || providedAt !== undefined) return;
    // A completed deployment needs only its stored final event, never a new status transition.
    let stopped = false;
    let close = () => {};
    function finish(at: string | null) {
      if (stopped) return;
      stopped = true;
      window.clearTimeout(timeout);
      close();
      setSnapshot({ id, status, at });
    }
    const timeout = window.setTimeout(() => finish(null), 10000);
    try {
      close = watchDeployment(apiBase, id, value => {
        if (stopped) return;
        if (value.status === status) {
          finish(value.at);
          onSnapshot(value);
        } else finish(null);
      }, () => finish(null));
      if (stopped) close();
    } catch {
      finish(null);
    }
    return () => {
      stopped = true;
      window.clearTimeout(timeout);
      close();
    };
  }, [apiBase, id, mode, onSnapshot, providedAt, status, terminal]);

  const start = Date.parse(createdAt);
  const endedAt = providedAt ?? restored?.at;
  const end = terminal ? typeof endedAt === "string" ? Date.parse(endedAt) : NaN : clock;
  const loading = terminal && mode === "api" && providedAt === undefined && !restored;
  let text = "소요 시간 확인 불가";
  if (Number.isFinite(start)) {
    if (loading) text = "소요 시간 확인 중…";
    else if (Number.isFinite(end) && end >= start) {
      const label = status === "success" ? "배포 소요 시간" : status === "failed" ? "실패까지" : "경과 시간";
      text = `${label} ${formatDuration(end - start)}`;
    }
  }
  return <span className="deployment-duration" role="timer" aria-label="배포 소요 시간" aria-live="off"
    title={mode === "demo" ? "로컬 샘플 배포의 시간입니다." : "배포 요청부터 대기·빌드·배포·완료 상태 기록까지의 시간입니다."}>{text}</span>;
}
