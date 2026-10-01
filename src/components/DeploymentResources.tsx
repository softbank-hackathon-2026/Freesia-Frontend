import { useEffect, useState } from 'react';
import { ApiError, createApi } from '../lib/api.ts';
import type { DeploymentResource } from '../lib/types.ts';
const api=createApi(import.meta.env.VITE_API_BASE_URL || '/api');
export default function DeploymentResources({id,refresh}:{id:string;refresh:string}) {
 const [resources,setResources]=useState<DeploymentResource[]|null>(null);
 const [error,setError]=useState(''); const [loading,setLoading]=useState(true); const [retry,setRetry]=useState(0);
 useEffect(()=>{
  const controller=new AbortController();
  // A new deployment event invalidates the previous server resource snapshot.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  setLoading(true); setError('');
  api.resources(id,controller.signal).then(data=>{if(!controller.signal.aborted)setResources(data);}).catch(e=>{
   if(!controller.signal.aborted)setError(e instanceof ApiError && e.status===404?'자원 상태 API 연동 대기':e instanceof Error?e.message:'자원 상태 조회 실패');
  }).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return ()=>controller.abort();
 },[id,refresh,retry]);
 const groups: Record<string, DeploymentResource[]> = {};
 for (const resource of resources ?? []) (groups[resource.type] ??= []).push(resource);
 const labels={pending:'대기',in_progress:'진행 중',done:'완료',failed:'실패'};
 return <section className="panel" aria-label="배포 자원 상태"><div className="section-heading"><h2>자원별 상태</h2><button disabled={loading} onClick={()=>setRetry(n=>n+1)}>자원 상태 다시 조회</button></div><div className="panel-body">
 {loading&&<p role="status">자원 상태 조회 중…</p>}
 {error&&<p role="alert">{error}</p>}
 {!error&&resources?.length===0&&<p>아직 보고된 자원이 없습니다. 실제 배포 자원 유무는 확인되지 않았습니다.</p>}
 {!error&&!!resources?.length&&<><p>{resources.filter(r=>r.state==='done').length}/{resources.length}개 완료 · 보고된 자원 기준</p>{Object.entries(groups).map(([type,items])=><div key={type}><h3>{type}</h3><ul>{items!.map(r=><li key={r.address} className="break-word"><strong>{r.address}</strong> · {labels[r.state]} · {r.action}<br/><small>최근 갱신: {r.updated_at}</small>{r.reason&&<p>{r.reason}</p>}</li>)}</ul></div>)}</>}
 <p className="muted">자원 유형별 목록입니다. 자원 간 연결 관계는 제공되지 않습니다.</p>
 </div></section>;
}
