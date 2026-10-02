import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

// Tests real callbacks, DB, SSE, and React with disposable data; never invokes a deployment.
const backendRoot = process.env.LOCAL_BACKEND_ROOT;
const python = process.env.LOCAL_BACKEND_PYTHON;
assert.ok(backendRoot && python, 'Set LOCAL_BACKEND_ROOT and LOCAL_BACKEND_PYTHON to the local backend checkout/runtime.');
const frontend = new URL(process.env.LOCAL_FRONTEND_URL || 'http://localhost:5173');
assert.ok(['localhost', '127.0.0.1'].includes(frontend.hostname), 'Frontend must be loopback.');
const temp = await mkdtemp(join(tmpdir(), 'freesia-callback-check-'));
const secret = randomBytes(32).toString('hex');
const appId = 'callback-test-app';
const deploymentId = 'callback-test-deploy';
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const reservation = createServer();
const backendPort = await listen(reservation);
await new Promise(resolve => reservation.close(resolve));
const backendURL = `http://127.0.0.1:${backendPort}`;
const bootstrap = `
import socket
_original_connect = socket.socket.connect
def local_connect(self, address):
    if isinstance(address, tuple) and address[0] not in ('127.0.0.1', '::1', 'localhost'):
        raise RuntimeError('Integration test blocks all outbound network connections')
    return _original_connect(self, address)
socket.socket.connect = local_connect
from app import db, models, deploy
from app.ids import now
from app.main import app
# Refuse all browser mutations except the callback under test, even on newer backends.
from fastapi.responses import JSONResponse
@app.middleware('http')
async def callback_only_mutations(request, call_next):
    if request.method not in ('GET', 'HEAD', 'OPTIONS') and not request.url.path.endswith('/callback'):
        return JSONResponse(status_code=403, content={'error': 'test_mutation_blocked'})
    return await call_next(request)
db.Base.metadata.create_all(db.engine)
with db.SessionLocal() as session:
    session.add(models.InfraSpace(id='callback-test-infra', name='Isolated callback fixture', description='Temporary test only', network='public', computes=['ecs-fargate'], status='ready', created_at=now()))
    session.flush()
    session.add(models.AppSpace(id='${appId}', name='Callback integration fixture', repo_url='https://github.com/example/callback-fixture', branch='main', infra_id='callback-test-infra', latest_deployment_id='${deploymentId}', created_at=now()))
    session.flush()
    dep = models.Deployment(id='${deploymentId}', app_space_id='${appId}', compute='ecs-fargate', status='pending', step='queued', created_at=now())
    session.add(dep)
    session.flush()
    deploy.record_event(session, dep, 'pending', 'queued')
    session.commit()
import uvicorn
uvicorn.run(app, host='127.0.0.1', port=${backendPort}, log_level='warning', timeout_graceful_shutdown=1)
`;
const backend = spawn(python, ['-c', bootstrap], {
  cwd: backendRoot, windowsHide: true,
  env: { ...process.env, DATABASE_URL: 'sqlite:///' + join(temp, 'test.db').replaceAll('\\', '/'), APP_ENV: 'local', APP_VERSION: 'local-callback-test', DEPLOY_SIMULATE: 'false', AI_MODEL_ID: '', DEPLOY_CALLBACK_SECRET: secret, AWS_EC2_METADATA_DISABLED: 'true' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let backendLog = '';
backend.stdout.on('data', chunk => { backendLog += chunk; });
backend.stderr.on('data', chunk => { backendLog += chunk; });
// Stream rather than buffer: EventSource exercises the real backend SSE connection.
const proxy = createServer((incoming, outgoing) => {
  const target = new URL(incoming.url, incoming.url.startsWith('/api/') ? backendURL : frontend);
  const upstream = request(target, { method: incoming.method, headers: { ...incoming.headers, host: target.host } }, response => {
    outgoing.writeHead(response.statusCode, response.headers);
    response.pipe(outgoing);
  });
  upstream.on('error', () => { if (!outgoing.headersSent) outgoing.writeHead(502); outgoing.end(); });
  outgoing.on('close', () => upstream.destroy());
  incoming.pipe(upstream);
});
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const api = context.request;
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    try { ready = (await api.get(backendURL + '/api/health/db', { timeout: 500 })).ok(); } catch { /* Wait for startup. */ }
    if (ready) break;
    assert.equal(backend.exitCode, null, backendLog);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, backendLog || 'Backend did not start');
  const port = await listen(proxy);
  const page = await context.newPage();
  const errors = [];
  const resourceReads = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.url().endsWith('/resources')) resourceReads.push(response.status()); });
  await page.goto(`http://127.0.0.1:${port}/?source=api&app=${appId}`);
  const panel = page.getByRole('region', { name: '배포 자원 상태', exact: true });
  await panel.getByText('아직 보고된 자원이 없습니다.', { exact: false }).waitFor();
  const resource = (type, state, reason) => ({ address: type + '.app', type, action: 'create', state, ...(reason ? { reason } : {}) });
  const callback = async (body, valid = true) => {
    const data = JSON.stringify(body);
    return api.post(`${backendURL}/api/deployments/${deploymentId}/callback`, { data, headers: { 'Content-Type': 'application/json', 'X-Hub-Signature-256': 'sha256=' + (valid ? createHmac('sha256', secret).update(data).digest('hex') : '0'.repeat(64)) } });
  };
  const prepare = { status: 'pending', step: 'prepare', resources: [resource('aws_vpc', 'pending'), resource('aws_ecs_service', 'pending'), resource('aws_lb', 'pending')] };
  assert.equal((await callback(prepare, false)).status(), 401);
  assert.deepEqual(await (await api.get(`${backendURL}/api/deployments/${deploymentId}/resources`)).json(), []);
  assert.equal((await callback(prepare)).status(), 204);
  const progress = panel.getByRole('progressbar', { name: '자원 완료율' });
  await progress.waitFor();
  assert.equal(await progress.getAttribute('value'), '0');
  assert.equal(await progress.getAttribute('max'), '3');
  const beforeUpdate = resourceReads.length;
  assert.equal((await callback({ status: 'deploying', step: 'deploy', resources: [resource('aws_vpc', 'done'), resource('aws_ecs_service', 'in_progress')] })).status(), 204);
  await page.waitForFunction(() => document.querySelector('progress[aria-label="자원 완료율"]')?.getAttribute('value') === '1');
  await panel.getByText('지금 여기', { exact: true }).waitFor();
  assert.ok(resourceReads.length > beforeUpdate, 'SSE must invalidate and refetch the resource snapshot without manual refresh');
  const reason = 'Isolated test: load balancer quota';
  assert.equal((await callback({ status: 'failed', step: 'deploy', reason, resources: [resource('aws_ecs_service', 'done'), resource('aws_lb', 'failed', reason)] })).status(), 204);
  await page.waitForFunction(() => document.querySelector('progress[aria-label="자원 완료율"]')?.getAttribute('value') === '2');
  const failed = panel.locator('details.state-failed');
  await failed.locator('summary').click();
  await failed.getByText(reason, { exact: true }).waitFor();
  const rows = await (await api.get(`${backendURL}/api/deployments/${deploymentId}/resources`)).json();
  assert.deepEqual(rows.map(row => row.state), ['done', 'done', 'failed']);
  assert.equal(rows[2].reason, reason);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('progress[aria-label="자원 완료율"]')?.getAttribute('value') === '2');
  await panel.locator('details.state-failed summary').click();
  await panel.getByText(reason, { exact: true }).waitFor();
  assert.equal((await callback(prepare)).status(), 409, 'Finished deployment must reject stale callbacks');
  assert.deepEqual(errors, []);
  await mkdir('artifacts', { recursive: true });
  await panel.screenshot({ path: 'artifacts/local-callback-tree.png' });
  const result = { status: 'passed', testedAt: new Date().toISOString(), checks: ['invalid HMAC rejected without data changes', 'signed callback persists resources', 'real SSE refreshes React tree automatically', 'pending/in_progress/done/failed states and counts', 'failure reason and reload persistence', 'terminal callback rejected'], limits: 'Disposable SQLite fixtures and locally generated workflow callbacks. No actual AI, AWS, GitHub workflow, or teardown execution.' };
  await writeFile('artifacts/local-callback-results.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(backendLog.slice(-2000));
  throw error;
} finally {
  await browser?.close();
  proxy.closeAllConnections();
  await new Promise(resolve => proxy.close(resolve));
  if (backend.exitCode === null) {
    const exited = new Promise(resolve => backend.once('exit', resolve));
    backend.kill();
    await exited;
  }
  assert.equal(dirname(resolve(temp)), resolve(tmpdir()));
  assert.ok(basename(temp).startsWith('freesia-callback-check-'));
  await rm(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
