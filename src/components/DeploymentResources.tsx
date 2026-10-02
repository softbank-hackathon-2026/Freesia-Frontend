import { useEffect, useState } from 'react';
import { ApiError, createApi } from '../lib/api.ts';
import type { DeploymentResource } from '../lib/types.ts';

const api = createApi(import.meta.env.VITE_API_BASE_URL || '/api');
const labels = { pending: '대기', in_progress: '진행 중', done: '완료', failed: '실패', deleted: '삭제됨' };
const icons = { pending: '＋', in_progress: '…', done: '✓', failed: '!', deleted: '−' };
const categories = [
  { name: '서버', types: /^aws_(ecs_|instance$|launch_template$|autoscaling_|lambda_)/ },
  { name: '저장소', types: /^aws_(s3_|db_|rds_|dynamodb_|efs_|ebs_|elasticache_)/ },
  { name: '연결', types: /^aws_(lb(?:_|$)|alb(?:_|$)|elb$|route53_|vpc(?:_|$)|subnet(?:_|$)|security_group(?:_|$)|internet_gateway$|nat_gateway$|route(?:_|$)|eip(?:_|$)|network_acl(?:_|$)|acm_|cloudfront_)/ },
  { name: '기타', types: /.*/ },
];
const typeNames: Record<string, string> = {
  aws_ecs_service: 'ECS 서비스', aws_ecs_task_definition: 'ECS 작업 정의', aws_ecs_cluster: 'ECS 클러스터',
  aws_instance: 'EC2', aws_lambda_function: 'Lambda', aws_db_instance: 'DB', aws_rds_cluster: 'DB 클러스터',
  aws_s3_bucket: 'S3', aws_dynamodb_table: 'DynamoDB', aws_efs_file_system: 'EFS',
  aws_lb: 'Load Balancer', aws_alb: 'ALB', aws_lb_target_group: '대상 그룹', aws_lb_listener: '리스너',
  aws_route53_record: 'DNS 레코드', aws_route53_zone: 'DNS 영역', aws_vpc: 'VPC', aws_subnet: 'Subnet',
  aws_security_group: '보안 그룹', aws_nat_gateway: 'NAT Gateway', aws_internet_gateway: 'Internet Gateway',
  aws_cloudfront_distribution: 'CloudFront',
};

export default function DeploymentResources({ id, refresh, appName }: { id: string; refresh: string; appName: string }) {
  const [resources, setResources] = useState<DeploymentResource[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    // A new deployment event invalidates the previous server resource snapshot.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true); setError('');
    api.resources(id, controller.signal).then(data => {
      if (!controller.signal.aborted) setResources(data);
    }).catch(e => {
      if (!controller.signal.aborted) setError(e instanceof ApiError && e.status === 404 ? '자원 상태 API 연동 대기' : e instanceof Error ? e.message : '자원 상태 조회 실패');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, refresh, retry]);

  const groups = categories.map(category => ({
    name: category.name,
    items: (resources ?? []).filter(resource => categories.find(candidate => candidate.types.test(resource.type)) === category),
  })).filter(group => group.items.length > 0);
  const completed = resources?.filter(resource => resource.state === 'done').length ?? 0;
  const deleted = resources?.filter(resource => resource.state === 'deleted').length ?? 0;
  const remaining = (resources?.length ?? 0) - deleted;

  return <section className="panel resource-tree" aria-label="배포 자원 상태">
    <div className="section-heading"><h2>전체 구성</h2><button disabled={loading} onClick={() => setRetry(n => n + 1)}>자원 상태 다시 조회</button></div>
    <div className="panel-body">
      {loading && <p role="status">{resources?.length ? "상태 갱신 중… 이전 조회 결과를 표시합니다." : "자원 상태 조회 중…"}</p>}
      {error && <p role="alert">{error}</p>}
      {!loading && !error && resources?.length === 0 && <p>아직 보고된 자원이 없습니다. 실제 배포 자원 유무는 확인되지 않았습니다.</p>}
      {!error && !!resources?.length && <>
        <p className="resource-tree-count">{appName} / {remaining > 0 && <>{deleted > 0 && '남은 '}{remaining}개 중 {completed}개 완료</>}{deleted > 0 && <>{remaining > 0 && ' / '}{deleted}개 삭제됨</>} <span className="muted">(보고된 자원 기준)</span></p>
        {remaining > 0 && <progress max={remaining} value={completed} aria-label="자원 완료율" />}
        <div className="resource-tree-scroll" tabIndex={0} role="region" aria-label="배포 자원 구성도">
          <ul className="resource-tree-root"><li>
            <strong className="resource-tree-app">{appName}</strong>
            <ul className="resource-tree-groups">
              {groups.map(group => {
                const active = group.items.some(resource => resource.state === 'in_progress');
                return <li key={group.name} className={'resource-tree-group' + (active ? ' is-active' : '')}>
                  <div className="resource-tree-group-title"><strong>{group.name}</strong>{active && <span className="resource-tree-current">지금 여기</span>}</div>
                  <ul className="resource-tree-nodes">
                    {group.items.map(resource => <li key={resource.address}>
                      <details className={'resource-tree-node state-' + resource.state}>
                        <summary>
                          <strong>{typeNames[resource.type] ?? resource.type}</strong>
                          <small>{resource.address.split('.').at(-1)}</small>
                          <span className="resource-tree-state"><span aria-hidden="true">{icons[resource.state]}</span> {labels[resource.state]}</span>
                        </summary>
                        <dl>
                          <dt>자원 주소</dt><dd>{resource.address}</dd>
                          <dt>유형</dt><dd>{resource.type}</dd>
                          <dt>작업</dt><dd>{resource.action}</dd>
                          <dt>상태</dt><dd>{labels[resource.state]}</dd>
                          <dt>최근 갱신</dt><dd>{resource.updated_at}</dd>
                          {resource.reason && <><dt>사유</dt><dd>{resource.reason}</dd></>}
                        </dl>
                      </details>
                    </li>)}
                  </ul>
                </li>;
              })}
            </ul>
          </li></ul>
        </div>
        <p className="resource-tree-scroll-hint muted">좌우로 이동해 전체 구성을 확인하세요.</p>
        <p className="resource-tree-legend">✓ 완료 / … 진행 중 / ＋ 대기 / ! 실패 / <span className="resource-tree-deleted">− 삭제됨</span> <span className="muted">/ 자원을 누르면 상세 정보</span></p>
        <ul className="resource-tree-totals" aria-label="그룹별 자원 현황">
          {groups.map(group => {
            const deleted = group.items.filter(resource => resource.state === 'deleted').length;
            const remaining = group.items.length - deleted;
            return <li key={group.name}>
              <span>{group.name}{group.items.some(resource => resource.state === 'in_progress') && <em> ← 진행 중</em>}</span>
              <span>{remaining > 0 && <>{group.items.filter(resource => resource.state === 'done').length}/{remaining} 완료</>}{deleted > 0 && <>{remaining > 0 && ' / '}{deleted}개 삭제됨</>}{group.items.some(resource => resource.state === 'failed') && <em className="resource-tree-failed"> / 실패 있음</em>}</span>
            </li>;
          })}
        </ul>
      </>}
      <p className="muted resource-tree-note">연결선은 자원 분류를 나타냅니다. 실제 네트워크 연결/의존관계는 제공되지 않습니다.</p>
    </div>
  </section>;
}
