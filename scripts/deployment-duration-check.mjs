import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

// Controlled browser fixtures only: no backend writes or cloud resources.
const base = process.env.DURATION_CHECK_URL || 'http://localhost:5185';
const started = '2026-10-04T00:00:00Z';
const now = '2026-10-04T00:01:23Z';
const infra = { id: 'duration-infra', name: 'Duration fixture', description: 'Controlled fixture', network: 'public', computes: ['lambda'], deployable_computes: ['lambda'], app_count: 2 };
const app = { id: 'duration-app', name: 'Duration fixture app', repo_url: 'https://github.com/fixture/duration', branch: 'main', infra_id: infra.id, created_at: started, latest_deployment_id: 'duration-deployment' };
const otherApp = { ...app, id: 'duration-other-app', name: 'Other duration fixture', latest_deployment_id: 'duration-other-deployment' };
const deployment = { id: app.latest_deployment_id, app_space_id: app.id, compute: 'lambda', status: 'deploying', url: null, reason: null, created_at: started };
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const results = [];
const record = message => { results.push(message); console.log('PASS ' + message); };
const nav = page => page.getByRole('navigation', { name: '배포 단계', exact: true });
const duration = page => page.locator('.deployment-duration');
const event = (status = 'success', at = '2026-10-04T00:04:12Z') => ({ status, step: status === 'success' ? 'done' : 'deploy', message: 'Controlled ' + status, progress: status === 'success' ? 100 : 63, url: null, at });
const streamSnapshot = page => page.evaluate(() => window.durationStreams.map(stream => ({ url: stream.url, closed: stream.closed })));
async function showProgress(page) {
  await nav(page).getByRole('button', { name: '배포 진행', exact: true }).click();
  await page.getByRole('heading', { name: /^배포 상태/ }).waitFor();
}
async function expectDuration(page, text) {
  await duration(page).getByText(text, { exact: true }).waitFor();
  assert.equal(await duration(page).innerText(), text);
}
async function publish(page, value, index = -1) {
  // Deliberately permits delivery to a closed stream to exercise stale callback guards.
  await page.evaluate(({ value, index }) => {
    const stream = window.durationStreams.at(index);
    if (!stream) throw new Error('No mock EventSource available');
    stream.dispatchEvent(new window.MessageEvent('progress', { data: JSON.stringify(value) }));
  }, { value, index });
}
async function scenario(overrides = {}) {
  const state = { deployment: { ...deployment, ...overrides }, calls: [], unexpected: [], errors: [] };
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(6000);
  await page.clock.install({ time: new Date(now) });
  await page.clock.pauseAt(new Date(now));
  await page.addInitScript(() => {
    window.durationStreams = [];
    window.EventSource = class extends window.EventTarget {
      constructor(url) { super(); this.url = url; this.closed = false; window.durationStreams.push(this); }
      close() { this.closed = true; }
    };
  });
  page.on('pageerror', error => state.errors.push(error.message));
  await page.route('**/api/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    state.calls.push({ method: request.method(), path });
    const json = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
    if (request.method() !== 'GET') { state.unexpected.push(request.method() + ' ' + path); return json({ message: 'Mutations forbidden' }, 405); }
    if (path === '/api/infra-spaces') return json([infra]);
    if (path === '/api/infra-spaces/' + infra.id) return json(infra);
    if (path === '/api/repositories') return json([]);
    if (path === '/api/app-spaces') return json([app, otherApp]);
    if (path === '/api/app-spaces/' + app.id) return json(app);
    if (path === '/api/app-spaces/' + otherApp.id) return json(otherApp);
    if (path === '/api/deployments/' + deployment.id) return json(state.deployment);
    if (path === '/api/deployments/' + otherApp.latest_deployment_id) return json({ ...deployment, id: otherApp.latest_deployment_id, app_space_id: otherApp.id, status: 'failed', created_at: '2026-10-04T00:01:00Z' });
    if (path.endsWith('/analysis')) return json({ message: 'Analysis not started' }, 404);
    if (path.endsWith('/resources')) return json([]);
    state.unexpected.push(path); return json({ message: 'Unexpected fixture request' }, 404);
  });
  await page.goto(base + '/?source=api&app=' + app.id);
  await page.getByRole('heading', { name: /^Duration fixture app/ }).waitFor();
  await showProgress(page);
  return { page, state };
}
async function clean(page, state) {
  assert.deepEqual(state.unexpected, [], 'all API requests must use explicit mock fixtures');
  assert.deepEqual(state.calls.filter(call => call.method !== 'GET'), [], 'duration checks must never deploy or mutate');
  assert.deepEqual(state.errors, [], 'no uncaught browser errors');
  for (const stream of await streamSnapshot(page)) assert.match(stream.url, /^\/api\/deployments\/duration-(?:other-)?deployment\/events$/);
  await page.close();
}
try {
  await mkdir('artifacts', { recursive: true });
  {
    const { page, state } = await scenario();
    await expectDuration(page, '경과 시간 1분 23초');
    assert.equal(await duration(page).getAttribute('aria-label'), '배포 소요 시간');
    assert.equal(await duration(page).getAttribute('role'), 'timer');
    assert.equal(await duration(page).getAttribute('aria-live'), 'off', 'seconds must not announce continuously');
    await publish(page, event('deploying', now));
    await page.getByText('63%', { exact: true }).waitFor();
    const reads = state.calls.length, streams = await streamSnapshot(page);
    await page.clock.runFor(1000);
    await expectDuration(page, '경과 시간 1분 24초');
    await page.clock.runFor(2000);
    await expectDuration(page, '경과 시간 1분 26초');
    assert.equal(state.calls.length, reads, 'ticker is local and makes no API reads');
    assert.deepEqual(await streamSnapshot(page), streams, 'ticker does not reconnect SSE');
    for (const [size, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
      await page.setViewportSize({ width, height });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'duration must not overflow at ' + size);
      const box = await duration(page).boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= width, 'duration is contained in viewport');
      await page.screenshot({ path: 'artifacts/deployment-duration-' + size + '.png', fullPage: true });
    }
    state.deployment.status = 'success';
    await publish(page, event());
    await showProgress(page);
    await expectDuration(page, '배포 소요 시간 4분 12초');
    const terminalReads = state.calls.length, terminalStreams = await streamSnapshot(page);
    await page.clock.runFor(65000);
    await expectDuration(page, '배포 소요 시간 4분 12초');
    assert.equal(state.calls.length, terminalReads);
    assert.deepEqual(await streamSnapshot(page), terminalStreams, 'live terminal event needs no replay stream');
    await clean(page, state); record('running ticker updates locally each second; live recorded terminal time freezes; desktop/mobile and accessible timer');
  }
  for (const [status, at, text] of [['success', '2026-10-04T00:04:12Z', '배포 소요 시간 4분 12초'], ['failed', '2026-10-04T00:02:08Z', '실패까지 2분 08초']]) {
    const { page, state } = await scenario({ status });
    await expectDuration(page, '소요 시간 확인 중…');
    await page.clock.runFor(5000);
    await publish(page, event(status, at));
    await expectDuration(page, text);
    assert.equal(await nav(page).getByRole('button', { name: '배포 진행', exact: true }).getAttribute('aria-current'), 'step', 'terminal replay must not jump to stage5');
    await page.getByRole('heading', { name: '배포 상태 · ' + status, exact: true }).waitFor();
    if (status === 'failed') assert.equal(await page.getByRole('button', { name: '구성 다시 확인 · 재시도 준비', exact: true }).isEnabled(), true);
    assert.ok((await streamSnapshot(page)).every(stream => stream.closed), 'recorded terminal stream closes: ' + JSON.stringify(await streamSnapshot(page)));
    await page.clock.runFor(60000); await expectDuration(page, text);
    await page.reload(); await showProgress(page);
    await expectDuration(page, '소요 시간 확인 중…');
    await publish(page, event(status, at)); await expectDuration(page, text);
    assert.equal(await nav(page).getByRole('button', { name: '배포 진행', exact: true }).getAttribute('aria-current'), 'step');
    await page.screenshot({ path: 'artifacts/deployment-duration-' + status + '.png', fullPage: true });
    await clean(page, state); record('reopened/reloaded ' + status + ' uses recorded event time and preserves stage/actions');
  }
  for (const [name, overrides, terminal] of [
    ['missing terminal event', { status: 'success' }, null],
    ['invalid start', { status: 'success', created_at: 'not-a-date' }, event()],
    ['invalid terminal date', { status: 'success' }, event('success', 'not-a-date')],
    ['nonterminal replay', { status: 'success' }, event('deploying')],
    ['mismatched terminal status', { status: 'success' }, event('failed')],
    ['negative duration', { status: 'success' }, event('success', '2026-10-03T23:59:59Z')],
    ['missing start', { status: 'deploying', created_at: '' }, null],
    ['future start', { status: 'deploying', created_at: '2026-10-05T00:00:00Z' }, null],
  ]) {
    const { page, state } = await scenario(overrides);
    if (terminal && (await streamSnapshot(page)).some(stream => !stream.closed)) await publish(page, terminal);
    await page.clock.runFor(11000);
    await expectDuration(page, '소요 시간 확인 불가');
    if (overrides.status === 'success') assert.ok((await streamSnapshot(page)).every(stream => stream.closed), name + ' must close replay');
    await page.clock.runFor(3000); await expectDuration(page, '소요 시간 확인 불가');
    await clean(page, state); record(name + ' remains unavailable instead of inventing a duration');
  }
  {
    const { page, state } = await scenario({ status: 'failed' });
    await expectDuration(page, '소요 시간 확인 중…');
    const oldIndex = (await streamSnapshot(page)).length - 1;
    await nav(page).getByRole('button', { name: '코드 분석', exact: true }).click();
    assert.equal(await duration(page).count(), 0);
    assert.equal((await streamSnapshot(page))[oldIndex].closed, true, 'leaving stage4 closes replay');
    await publish(page, event('failed', '2026-10-04T00:02:08Z'), oldIndex);
    await showProgress(page); await expectDuration(page, '소요 시간 확인 중…');
    const leavingAppIndex = (await streamSnapshot(page)).length - 1;
    await page.getByRole('button', { name: '앱 목록으로', exact: true }).click();
    await page.getByRole('button', { name: otherApp.name + ' 상세 보기', exact: true }).click();
    await page.getByRole('heading', { name: otherApp.name, exact: true }).waitFor();
    await showProgress(page); await expectDuration(page, '소요 시간 확인 중…');
    assert.equal((await streamSnapshot(page))[leavingAppIndex].closed, true, 'switching apps closes old deployment replay');
    await publish(page, event('failed', '2026-10-04T00:02:08Z'), leavingAppIndex);
    await expectDuration(page, '소요 시간 확인 중…');
    await publish(page, event('failed', '2026-10-04T00:01:45Z'));
    await expectDuration(page, '실패까지 45초');
    await clean(page, state); record('leaving stage/app closes replay; late callbacks cannot leak duration into a different deployment');
  }
  await writeFile('artifacts/deployment-duration-results.json', JSON.stringify({ status: 'passed', results }, null, 2));
  console.log('PASS duration: ' + results.length + ' focused scenarios');
} catch (error) {
  await writeFile('artifacts/deployment-duration-results.json', JSON.stringify({ status: 'failed', results, error: String(error) }, null, 2));
  throw error;
} finally { await browser.close(); }
