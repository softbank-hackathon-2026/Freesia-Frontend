import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout, clearTimeout } from 'node:timers';
import { mkdir, mkdtemp, readFile, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { initialDemo } from '../src/lib/demo.ts';

const base = process.env.MONITORING_CHECK_URL || 'http://localhost:15173';
const server = process.env.MONITORING_CHECK_URL ? null : spawn(process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', 'localhost', '--port', '15173', '--strictPort'], { stdio: 'pipe' });
let browser, exportDirectory, exportPath;
const results = [];
try {
  if (server) await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Monitoring Vite startup timed out')), 15000);
    server.once('exit', code => { clearTimeout(timer); reject(new Error('Monitoring Vite exited: ' + code)); });
    server.stderr.on('data', data => process.stderr.write(data));
    server.stdout.on('data', data => { if (String(data).includes('Local:')) { clearTimeout(timer); resolve(); } });
  });
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const at = '2026-10-02T09:00:00Z';
  const app = { id: 'monitor-a', name: 'Monitoring A', repo_url: 'https://github.com/example/a', branch: 'main', infra_id: 'infra', created_at: at, latest_deployment_id: 'ec2-logs-deployment' };
  const second = { ...app, id: 'monitor-b', name: 'Monitoring B', latest_deployment_id: null };
  const demo = { ...initialDemo(), apps: [{ ...app, id: 'demo-monitor', name: 'Demo monitoring', latest_deployment_id: 'demo-monitor-success' }], deployments: [{ id: 'demo-monitor-success', app_space_id: 'demo-monitor', compute: 'ecs-fargate', status: 'success', url: null, reason: null, created_at: at }] };
  await page.addInitScript(value => {
    localStorage.setItem('freesia.demo.v1', JSON.stringify(value));
    window.logAborts = 0; window.metricAborts = 0;
    const original = window.fetch.bind(window);
    window.fetch = (url, options) => {
      const aborted = () => String(url).includes('/metrics') ? window.metricAborts++ : window.logAborts++;
      const signal = /\/(logs|metrics)(\?|$)/.test(String(url)) ? options?.signal : undefined;
      signal?.addEventListener('abort', aborted);
      return original(url, options).finally(() => signal?.removeEventListener('abort', aborted));
    };
  }, demo);
  let payload = { status: 'ok', message: null, lines: [{ at, message: 'sample-shop listening on 3000' }, { at, message: '<img src=x onerror="window.logExecuted=true"> first log' }] };
  let status = 200, count = 0, held = false, release, started;
  const metricFixture = { status: 'ok', message: null, compute: 'ecs-fargate', cpu_percent: 0, memory_percent: null, response_time_ms: 120.67890123, request_count: 15, error_count: 0, measured_at: at };
  let metricPayload = { ...metricFixture }, metricStatus = 200, metricCount = 0, metricHeld = false, metricRelease, metricStarted;
  let titleDeployment = { id: 'ec2-logs-deployment', app_space_id: app.id, compute: 'ec2', status: 'success', url: null, reason: null, created_at: at };
  const unexpected = [];
  await page.route('**/api/**', async route => {
    assert.equal(route.request().method(), 'GET', 'Monitoring checks must not start deployment or change server data');
    const path = new URL(route.request().url()).pathname;
    const json = (value, code = 200) => route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(value) });
    if (path.endsWith('/metrics')) {
      metricCount++;
      const response = path.includes(second.id) ? { ...metricFixture, cpu_percent: 77 } : JSON.parse(JSON.stringify(metricPayload));
      const code = metricStatus;
      if (metricHeld) { metricStarted?.(); await new Promise(resolve => metricRelease = resolve); }
      await json(response, code).catch(() => {});
      return;
    }
    if (path.endsWith('/logs')) {
      count++;
      assert.equal(new URL(route.request().url()).searchParams.get('limit'), '100');
      const response = path.includes(second.id) ? { status: 'ok', message: null, lines: [{ at, message: 'second app log' }] } : JSON.parse(JSON.stringify(payload));
      const code = status;
      if (held) { started?.(); await new Promise(resolve => release = resolve); }
      await json(response, code).catch(() => {});
      return;
    }
    if (titleDeployment && path.endsWith('/deployments/' + titleDeployment.id + '/events')) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: `event: progress\ndata: ${JSON.stringify({ status: titleDeployment.status, progress: titleDeployment.status === 'success' ? 100 : 0, message: 'title fixture', step: 'complete', at, url: null })}\n\n` });
    if (titleDeployment && path.endsWith('/deployments/' + titleDeployment.id + '/resources')) return json([]);
    if (titleDeployment && path.endsWith('/deployments/' + titleDeployment.id)) return json(titleDeployment);
    if ([app.id, second.id].some(id => path.endsWith('/app-spaces/' + id + '/redeploy-context'))) return json({ error: 'redeploy_unsupported', message: 'Monitoring fixture has no redeployment context' }, 404);
    if ([app.id, second.id].some(id => path.endsWith('/app-spaces/' + id + '/analysis'))) return json({ error: 'analysis_not_found', message: 'Fixture has no saved analysis' }, 404);
    if (path.endsWith('/repositories')) return json([]);
    if (path.endsWith('/infra-spaces')) return json([{ id: 'infra', name: 'Fixture', description: '', network: 'public', computes: ['ecs-fargate'], app_count: 2 }]);
    if (path.endsWith('/infra-spaces/infra')) return json({ id: 'infra', name: 'Fixture', description: '', network: 'public', computes: ['ecs-fargate'], app_count: 2 });
    if (path.endsWith('/app-spaces')) return json([app, second]);
    if (path.endsWith('/' + app.id)) return json(app);
    if (path.endsWith('/' + second.id)) return json(second);
    unexpected.push(path); return json({ message: 'unexpected test route' }, 404);
  });
  const open = async (tab = '로그') => {
    await page.goto(base + '/?source=api&app=' + app.id);
    await page.locator('.page-heading h1').filter({ hasText: app.name }).waitFor();
    await page.getByRole('tab', { name: tab, exact: true }).click();
  };
  const logs = page.getByRole('region', { name: '애플리케이션 로그', exact: true });
  const refresh = () => logs.getByRole('button', { name: '로그 새로고침', exact: true });
  const observation = page.getByRole('region', { name: '배포 후 운영 확인', exact: true });
  const inlineLogs = observation.getByRole('region', { name: '애플리케이션 로그', exact: true });
  const inlineMetrics = observation.getByRole('region', { name: '모니터링', exact: true });
  const inlineRefresh = () => inlineLogs.getByRole('button', { name: '로그 새로고침', exact: true });
  const inlineMetricRefresh = () => inlineMetrics.getByRole('button', { name: '지표 새로고침', exact: true });
  const downloadButton = scope => scope.getByRole('button', { name: '로그 .txt 다운로드', exact: true });
  const exportUnavailable = async scope => {
    if (await downloadButton(scope).count()) assert.ok(await downloadButton(scope).isDisabled());
  };
  const inlineReady = async () => {
    await page.waitForFunction(() => {
      const scope = document.querySelector('[aria-label="배포 후 운영 확인"]');
      return scope && [...scope.querySelectorAll('button')].filter(button => /새로고침/.test(button.textContent)).every(button => !button.disabled);
    });
  };
  const overview = async () => {
    await page.goto(base + '/?source=api&app=' + app.id);
    await page.locator('.page-heading h1').filter({ hasText: app.name }).waitFor();
  };
  const originalName = app.name;
  const originalPayload = JSON.parse(JSON.stringify(payload));
  const fetchedLines = Array.from({ length: 100 }, (_, index) => ({
    at: new Date(Date.parse(at) + index * 1000).toISOString(),
    message: `한글 로그 ${String(index + 1).padStart(3, '0')} · ${index === 99 ? '<img src=x onerror="window.logExecuted=true"> 마지막 내용' : '애플리케이션 본문'}`,
  }));
  app.name = '한글 서비스: 테스트 / 샘플?';
  payload = { status: 'ok', message: null, lines: fetchedLines };
  await mkdir('artifacts', { recursive: true });
  await page.clock.install({ time: new Date('2026-10-03T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-03T00:00:01Z'));
  metricHeld = true;
  const initialMetricPending = new Promise(resolve => metricStarted = resolve);
  const initialReads = { logs: count, metrics: metricCount };
  await overview();
  await observation.waitFor();
  await initialMetricPending;
  await inlineLogs.locator('pre').filter({ hasText: '한글 로그 100' }).waitFor();
  assert.equal(count, initialReads.logs + 1);
  assert.equal(metricCount, initialReads.metrics + 1);
  assert.ok(await inlineMetricRefresh().isDisabled());
  await inlineMetrics.getByText('지표 조회 중…', { exact: true }).waitFor();
  const preview = await inlineLogs.locator('pre').innerText();
  assert.equal(preview.split('\n').length, 15);
  assert.match(preview, /한글 로그 086/);
  assert.doesNotMatch(preview, /한글 로그 001/);
  assert.equal(await inlineLogs.locator('img').count(), 0);
  assert.equal(await page.evaluate(() => window.logExecuted), undefined);
  assert.ok(await downloadButton(inlineLogs).isEnabled());
  metricHeld = false; metricRelease();
  await inlineMetrics.getByText('120.68 ms', { exact: true }).waitFor();
  await inlineReady();
  results.push('successful result immediately reads logs and metrics independently; held metrics do not block latest15 escaped logs');

  const beforeDownload = { logs: count, metrics: metricCount };
  payload = { status: 'ok', message: null, lines: [{ at, message: 'unfetched replacement must not enter export' }] };
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    downloadButton(inlineLogs).click(),
  ]);
  assert.match(download.suggestedFilename(), /^한글.*\d{8}-\d{6}\.txt$/);
  assert.doesNotMatch(download.suggestedFilename(), /[<>:"/\\|?*]|\p{Cc}/u);
  // Playwright holds its target file exclusively while saving on Windows.
  // Keep that target outside Vite's watched project to avoid watcher EBUSY.
  exportDirectory = await mkdtemp(join(tmpdir(), 'freesia-post-deploy-'));
  exportPath = join(exportDirectory, 'logs.txt');
  await download.saveAs(exportPath);
  const bytes = await readFile(exportPath);
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  const exported = bytes.subarray(3).toString('utf8');
  assert.doesNotMatch(exported.replaceAll('\r\n', ''), /[\r\n]/);
  const exportedLines = exported.split('\r\n').filter(Boolean);
  assert.equal(exportedLines.length, 100);
  fetchedLines.forEach((line, index) => {
    assert.ok(exportedLines[index].includes(line.at));
    assert.ok(exportedLines[index].endsWith(line.message));
  });
  assert.doesNotMatch(exported, /unfetched replacement/);
  assert.deepEqual({ logs: count, metrics: metricCount }, beforeDownload);
  payload = { status: 'ok', message: null, lines: fetchedLines };
  results.push('TXT export preserves fetched100 snapshot, UTC timestamps, Korean UTF8 BOM/CRLF and safe timestamped filename without another GET');
  await page.screenshot({ path: 'artifacts/post-deploy-observation-desktop.png', fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/post-deploy-observation-mobile.png', fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({ width: 1440, height: 1000 });
  results.push('inline successful result captures desktop1440/mobile390 with no page overflow');
  const beforeTabs = { logs: count, metrics: metricCount };
  await page.getByRole('tab', { name: '로그', exact: true }).click();
  await logs.locator('pre').filter({ hasText: '한글 로그 001' }).waitFor();
  assert.equal((await logs.locator('pre').innerText()).split('\n').length, 100);
  assert.equal(count, beforeTabs.logs + 1);
  assert.equal(metricCount, beforeTabs.metrics);
  assert.ok(await downloadButton(logs).isEnabled());
  await page.getByRole('tab', { name: '개요', exact: true }).click();
  await inlineReady();
  assert.equal((await inlineLogs.locator('pre').innerText()).split('\n').length, 15);
  assert.equal(count, beforeTabs.logs + 2);
  assert.equal(metricCount, beforeTabs.metrics + 1);
  results.push('existing logs tab retains all100 and download; overview remounts15-line preview with both independent reads');

  const beforeInlinePoll = { logs: count, metrics: metricCount };
  await page.clock.runFor(14999);
  assert.deepEqual({ logs: count, metrics: metricCount }, beforeInlinePoll);
  metricHeld = true;
  const inlineMetricPending = new Promise(resolve => metricStarted = resolve);
  await page.clock.runFor(1); await inlineMetricPending;
  await page.waitForFunction(() => !document.querySelector('[aria-label="배포 후 운영 확인"] [aria-label="애플리케이션 로그"] button')?.disabled);
  assert.equal(count, beforeInlinePoll.logs + 1);
  assert.equal(metricCount, beforeInlinePoll.metrics + 1);
  await page.clock.runFor(45000);
  assert.equal(metricCount, beforeInlinePoll.metrics + 1);
  assert.ok(await inlineMetricRefresh().isDisabled());
  metricHeld = false; metricRelease(); await inlineReady();
  const metricsAfterCompletion = metricCount;
  await page.clock.runFor(14999); assert.equal(metricCount, metricsAfterCompletion);
  await page.clock.runFor(1); await inlineReady();
  assert.equal(metricCount, metricsAfterCompletion + 1);
  results.push('inline views keep independent completion-based15s polling with no overlapping metrics request');

  status = 500; payload = { message: 'inline log HTTP failure' };
  await inlineRefresh().click();
  await inlineLogs.getByRole('alert').filter({ hasText: 'inline log HTTP failure' }).waitFor();
  await inlineMetrics.getByText('120.68 ms', { exact: true }).waitFor();
  await exportUnavailable(inlineLogs);
  assert.equal(await inlineLogs.locator('pre').count(), 0);
  status = 200; payload = { status: 'ok', message: null, lines: [{ at, message: 'independent recovered Korean 로그' }] };
  await inlineRefresh().click();
  await inlineLogs.locator('pre').filter({ hasText: 'independent recovered Korean 로그' }).waitFor();
  metricStatus = 500; metricPayload = { message: 'inline metric HTTP failure' };
  await inlineMetricRefresh().click();
  await inlineMetrics.getByRole('alert').filter({ hasText: 'inline metric HTTP failure' }).waitFor();
  assert.equal(await inlineMetrics.locator('.metrics > div').count(), 0);
  assert.ok(await downloadButton(inlineLogs).isEnabled());
  metricStatus = 200; metricPayload = { ...metricFixture, status: 'waiting', message: 'inline metrics collecting' };
  await inlineMetricRefresh().click(); await inlineMetrics.getByText('수집 대기', { exact: true }).waitFor();
  await inlineLogs.locator('pre').filter({ hasText: 'independent recovered Korean 로그' }).waitFor();
  assert.equal(await inlineMetrics.locator('.metrics > div').count(), 0);
  assert.ok(await downloadButton(inlineLogs).isEnabled());
  payload = { status: 'waiting', message: 'inline logs collecting', lines: [] };
  await inlineRefresh().click(); await inlineLogs.getByText('수집 대기', { exact: true }).waitFor();
  await exportUnavailable(inlineLogs);
  metricStatus = 200; metricPayload = { ...metricFixture, cpu_percent: null };
  await inlineMetricRefresh().click(); await inlineMetrics.getByText('측정값 없음', { exact: true }).first().waitFor();
  assert.equal(await inlineMetrics.locator('.metrics > div').first().locator('strong').innerText(), '—');
  assert.equal(await inlineMetrics.getByRole('alert').count(), 0);
  payload = { status: 'ok', message: null, lines: fetchedLines };
  metricPayload = { ...metricFixture };
  await inlineRefresh().click(); await inlineMetricRefresh().click(); await inlineReady();
  results.push('inline log/metric HTTP failures, waiting and recovery are independent; missing readings stay unknown and export unavailable without actual logs');

  held = true; metricHeld = true;
  const previousLogPending = new Promise(resolve => started = resolve);
  const previousMetricPending = new Promise(resolve => metricStarted = resolve);
  await inlineRefresh().click(); await inlineMetricRefresh().click();
  await previousLogPending; await previousMetricPending;
  await exportUnavailable(inlineLogs);
  const previousReleases = { logs: release, metrics: metricRelease };
  const generationAborts = await page.evaluate(() => ({ logs: window.logAborts, metrics: window.metricAborts }));
  await page.getByRole('button', { name: '앱 목록으로', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => ({ logs: window.logAborts, metrics: window.metricAborts })), { logs: generationAborts.logs + 1, metrics: generationAborts.metrics + 1 });
  assert.equal(await observation.count(), 0);
  app.latest_deployment_id = 'inline-new-success';
  titleDeployment = { ...titleDeployment, id: app.latest_deployment_id, created_at: '2026-10-02T09:05:00Z' };
  payload = { status: 'ok', message: null, lines: [{ at, message: 'new deployment fresh 로그' }] };
  metricPayload = { ...metricFixture, cpu_percent: 33 };
  held = false; metricHeld = false;
  await page.getByRole('button', { name: app.name + ' 상세 보기', exact: true }).click();
  await inlineLogs.locator('pre').filter({ hasText: 'new deployment fresh 로그' }).waitFor();
  await inlineMetrics.getByText('33%', { exact: true }).waitFor();
  previousReleases.logs(); previousReleases.metrics(); await page.clock.runFor(1);
  assert.doesNotMatch(await inlineLogs.locator('pre').innerText(), /한글 로그 100/);
  assert.equal(await inlineMetrics.getByText('0%', { exact: true }).count(), 0);
  results.push('inline app navigation aborts both requests; new deployment remount ignores late logs and metrics from previous success');
  await page.getByRole('button', { name: '앱 목록으로', exact: true }).click();
  const undeployedAppReads = { logs: count, metrics: metricCount };
  await page.getByRole('button', { name: second.name + ' 상세 보기', exact: true }).click();
  await page.locator('.page-heading h1').filter({ hasText: second.name }).waitFor();
  assert.equal(await observation.count(), 0);
  assert.deepEqual({ logs: count, metrics: metricCount }, undeployedAppReads);

  for (const deploymentStatus of ['failed', 'building', 'deploying']) {
    titleDeployment.status = deploymentStatus;
    const reads = { logs: count, metrics: metricCount };
    await overview();
    await page.getByText('배포 상태 · ' + deploymentStatus, { exact: true }).waitFor();
    assert.equal(await observation.count(), 0);
    assert.deepEqual({ logs: count, metrics: metricCount }, reads);
  }
  titleDeployment.status = 'success'; titleDeployment.app_space_id = second.id;
  await overview(); assert.equal(await observation.count(), 0);
  titleDeployment.app_space_id = app.id;
  for (const teardownStatus of ['requested', 'success']) {
    app.teardown_status = teardownStatus; app.teardown_requested_at = '2026-10-02T09:10:00Z';
    if (teardownStatus === 'success') app.teardown_finished_at = '2026-10-02T09:11:00Z';
    const reads = { logs: count, metrics: metricCount };
    await overview();
    await page.getByText(teardownStatus === 'requested' ? /앱을 내리는 중입니다/ : /내림 완료/).waitFor();
    assert.equal(await observation.count(), 0);
    assert.deepEqual({ logs: count, metrics: metricCount }, reads);
  }
  delete app.teardown_status; delete app.teardown_requested_at; delete app.teardown_finished_at;
  results.push('failed/running/latest-new-attempt/mismatched-app/requested-or-completed-teardown states never expose old successful inline monitoring');

  await overview(); await inlineReady();
  held = true; metricHeld = true;
  const sourceLogPending = new Promise(resolve => started = resolve);
  const sourceMetricPending = new Promise(resolve => metricStarted = resolve);
  await inlineRefresh().click(); await inlineMetricRefresh().click();
  await sourceLogPending; await sourceMetricPending;
  const sourceReleases = { logs: release, metrics: metricRelease };
  await page.goto(base + '/?source=demo&page=apps');
  held = false; metricHeld = false; sourceReleases.logs(); sourceReleases.metrics();
  const sourceReads = { logs: count, metrics: metricCount };
  await page.clock.runFor(45000);
  assert.deepEqual({ logs: count, metrics: metricCount }, sourceReads);
  await page.getByRole('button', { name: 'Demo monitoring 상세 보기', exact: true }).click();
  await observation.waitFor();
  await inlineLogs.getByText('샘플', { exact: true }).waitFor();
  await inlineMetrics.getByText('샘플 수치', { exact: true }).waitFor();
  assert.equal(await downloadButton(inlineLogs).count(), 0);
  await page.clock.runFor(45000);
  assert.deepEqual({ logs: count, metrics: metricCount }, sourceReads);
  results.push('source change stops both inline reads; demo successful result labels sample logs/metrics and makes zero monitoring HTTP calls');

  // Existing tab-focused lifecycle checks use an undeployed result so switching to
  // overview unmounts monitoring rather than deliberately starting inline reads.
  app.name = originalName; app.latest_deployment_id = null; titleDeployment = null;
  payload = originalPayload; metricPayload = { ...metricFixture };
  await open();
  await logs.locator('pre').filter({ hasText: 'first log' }).waitFor();
  await logs.getByText('최근 애플리케이션 로그 · 최대 100줄 · 약 15초마다 새로고침 · 시간은 브라우저 현지 시간 기준입니다.', { exact: true }).waitFor();
  assert.equal(await logs.locator('img').count(), 0);
  assert.equal(await page.evaluate(() => window.logExecuted), undefined);
  assert.match(await logs.locator('pre').innerText(), /2026/);
  assert.equal(await logs.getByText('샘플', { exact: true }).count(), 0);
  assert.equal(await page.locator('.page-heading h1').innerText(), app.name);
  await logs.locator('pre').filter({ hasText: 'sample-shop listening on 3000' }).waitFor();
  results.push('successful EC2 deployment reads app stdout, local timestamp, escaped log content and neutral query-window copy');
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/monitoring-logs-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/monitoring-logs-mobile.png', fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const [state, label] of [['waiting', '수집 대기'], ['not_deployed', '미배포'], ['unsupported', '지원 안 됨'], ['error', '수집 오류']]) {
    payload = { status: state, message: state + ' fixture', lines: [] };
    await refresh().click();
    await logs.getByText(label, { exact: true }).waitFor();
    await logs.getByText(state + ' fixture', { exact: true }).waitFor();
    await exportUnavailable(logs);
    assert.equal(await logs.locator('pre').count(), 0);
    assert.doesNotMatch(await logs.innerText(), /\[DEMO\]|샘플|no application connection/);
    if (state === 'waiting') {
      payload = { status: 'ok', message: null, lines: [{ at, message: 'sample-shop listening on 3000' }] };
      await refresh().click();
      await logs.locator('pre').filter({ hasText: 'sample-shop listening on 3000' }).waitFor();
      await logs.getByText('로그 수신', { exact: true }).waitFor();
    }
  }
  payload = { status: 'ok', message: null, lines: [] };
  await refresh().click(); await logs.getByText('수집된 애플리케이션 로그가 없습니다.', { exact: true }).waitFor();
  await exportUnavailable(logs);
  status = 500; payload = { message: 'fixture HTTP failure' };
  await refresh().click(); await logs.getByRole('alert').filter({ hasText: 'fixture HTTP failure' }).waitFor();
  await exportUnavailable(logs);
  assert.equal(await logs.locator('pre').count(), 0);
  assert.doesNotMatch(await logs.innerText(), /\[DEMO\]|샘플|no application connection/);
  status = 200; payload = { status: 'unknown', message: null, lines: [] };
  await refresh().click(); await logs.getByRole('alert').filter({ hasText: '응답 형식' }).waitFor();
  await exportUnavailable(logs);
  payload = { status: 'ok', message: null, lines: [{ at, message: 'recovered log' }] };
  await refresh().click(); await logs.locator('pre').filter({ hasText: 'recovered log' }).waitFor();
  results.push('EC2 waiting-to-ok, business error, empty, HTTP 500, invalid payload and manual recovery never use demo fallback');

  await refresh().click(); await logs.locator('pre').filter({ hasText: 'recovered log' }).waitFor();
  await refresh().waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector('[aria-label="애플리케이션 로그"] button')?.disabled);
  const beforePoll = count;
  await page.clock.runFor(14999); assert.equal(count, beforePoll);
  held = true;
  const pollStarted = new Promise(resolve => started = resolve);
  await page.clock.runFor(1); await pollStarted;
  assert.equal(count, beforePoll + 1); assert.ok(await refresh().isDisabled());
  await page.clock.runFor(45000); assert.equal(count, beforePoll + 1);
  held = false; release();
  await page.waitForFunction(() => !document.querySelector('[aria-label="애플리케이션 로그"] button')?.disabled);
  await page.clock.runFor(15000);
  await page.waitForFunction(() => !document.querySelector('[aria-label="애플리케이션 로그"] button')?.disabled);
  assert.equal(count, beforePoll + 2);
  results.push('15 second completion-based polling, no overlap, refresh disabled while pending');

  // Restore a new deployment generation for the same app through read-only GET fixtures.
  // Returning to the app list and reopening is explicit; no external deployment is started.
  payload = { status: 'ok', message: null, lines: [{ at, message: 'previous EC2 deployment late log' }] };
  held = true;
  const oldGenerationPending = new Promise(resolve => started = resolve);
  await refresh().click(); await oldGenerationPending;
  const oldGenerationRelease = release;
  const oldGenerationAborts = await page.evaluate(() => window.logAborts);
  app.latest_deployment_id = 'ec2-logs-redeployment';
  titleDeployment = { id: app.latest_deployment_id, app_space_id: app.id, compute: 'ec2', status: 'failed', url: null, reason: null, created_at: '2026-10-02T09:05:00Z' };
  payload = { status: 'ok', message: null, lines: [{ at, message: 'sample-shop listening on 3000 · new deployment' }] };
  held = false;
  await page.getByRole('button', { name: '앱 목록으로', exact: true }).click();
  assert.equal(await page.evaluate(() => window.logAborts), oldGenerationAborts + 1);
  await page.getByRole('button', { name: app.name + ' 상세 보기', exact: true }).click();
  await page.getByRole('tab', { name: '로그', exact: true }).click();
  await logs.locator('pre').filter({ hasText: 'sample-shop listening on 3000 · new deployment' }).waitFor();
  oldGenerationRelease();
  await page.clock.runFor(15000);
  await page.waitForFunction(() => !document.querySelector('[aria-label="애플리케이션 로그"] button')?.disabled);
  assert.match(await logs.locator('pre').innerText(), /new deployment/);
  assert.doesNotMatch(await logs.locator('pre').innerText(), /previous EC2 deployment late log|recovered log|\[DEMO\]/);
  results.push('same EC2 app reread with new deployment ID aborts old fetch, clears old logs and ignores late previous-generation response');
  payload = { status: 'ok', message: null, lines: [{ at, message: 'recovered log' }] };
  await refresh().click(); await logs.locator('pre').filter({ hasText: 'recovered log' }).waitFor();

  for (const destination of ['tab', 'app', 'source']) {
    held = true;
    const pending = new Promise(resolve => started = resolve);
    await refresh().click(); await pending;
    const beforeAbort = await page.evaluate(() => window.logAborts);
    if (destination === 'tab') await page.getByRole('tab', { name: '개요', exact: true }).click();
    if (destination === 'app') {
      await page.getByRole('button', { name: '앱 목록으로', exact: true }).click();
      await page.getByRole('button', { name: second.name + ' 상세 보기', exact: true }).click();
    }
    if (destination === 'source') await page.goto(base + '/?source=demo&page=apps');
    if (destination === 'source') assert.equal(new URL(page.url()).searchParams.get('source'), 'demo');
    else assert.equal(await page.evaluate(() => window.logAborts), beforeAbort + 1);
    held = false; release();
    const afterUnmount = count;
    await page.clock.runFor(45000); assert.equal(count, afterUnmount);
    if (destination === 'app') {
      await page.getByRole('tab', { name: '로그', exact: true }).click();
      await logs.locator('pre').filter({ hasText: 'second app log' }).waitFor();
      assert.equal(await logs.getByText('recovered log', { exact: true }).count(), 0);
    }
    if (destination !== 'source') await open();
    if (destination !== 'source') await logs.locator('pre').filter({ hasText: 'recovered log' }).waitFor();
  }
  results.push('tab/app abort pending fetch; source URL navigation stops polling; late responses isolated');
  const demoCount = count;
  await page.getByRole('button', { name: 'Demo monitoring 상세 보기', exact: true }).click();
  await page.getByRole('tab', { name: '로그', exact: true }).click();
  await logs.getByText('샘플', { exact: true }).waitFor();
  assert.match(await logs.locator('pre').innerText(), /DEMO/);
  assert.equal(await downloadButton(logs).count(), 0);
  await page.clock.runFor(45000); assert.equal(count, demoCount);
  results.push('demo keeps sample label and sends zero monitoring requests');
  app.latest_deployment_id = null; titleDeployment = null;
  const metrics = page.getByRole('region', { name: '모니터링', exact: true });
  const metricRefresh = () => metrics.getByRole('button', { name: '지표 새로고침', exact: true });
  const card = label => metrics.locator('.metrics > div').filter({ has: page.getByText(label, { exact: true }) });
  const ready = () => page.waitForFunction(() => !document.querySelector('[aria-label="모니터링"] button')?.disabled);
  await open('모니터링');
  await card('CPU').getByText('0%', { exact: true }).waitFor();
  assert.equal(await metrics.locator('.metrics > div').count(), 5);
  assert.equal(await card('메모리').locator('strong').innerText(), '—');
  await card('메모리').getByText('측정값 없음', { exact: true }).waitFor();
  await card('평균 응답 시간').getByText('120.68 ms', { exact: true }).waitFor();
  assert.equal(await metrics.locator('time').getAttribute('datetime'), at);
  const measuredText = await metrics.locator('time').innerText();
  await metrics.locator('.metrics-meta').getByText('ECS Fargate · 60초 단위 집계 · 약 15초마다 새로고침', { exact: true }).waitFor();
  const notes = metrics.locator('.metrics-meta details');
  assert.equal(await notes.getAttribute('open'), null);
  assert.doesNotMatch(await metrics.innerText(), /지표별 측정 시각은 다를 수 있습니다/);
  await notes.locator('summary').click();
  assert.match(await metrics.innerText(), /지표별 측정 시각은 다를 수 있습니다/);
  await notes.locator('summary').click();
  const cardBox = await metrics.locator('.metrics').boundingBox();
  const metadataBox = await metrics.locator('.metrics-meta').boundingBox();
  assert.ok(cardBox.y + cardBox.height <= metadataBox.y, 'Metric cards precede monitoring metadata');
  await page.screenshot({ path: 'artifacts/monitoring-metrics-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/monitoring-metrics-mobile.png', fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await metricRefresh().click(); await ready();
  assert.equal(await metrics.locator('time').innerText(), measuredText);
  metricPayload = { ...metricFixture, compute: 'lambda', cpu_percent: null, request_count: 0, error_count: 0 };
  await metricRefresh().click(); await card('처리 시간').getByText('120.68 ms', { exact: true }).waitFor();
  assert.equal(await metrics.locator('.metrics > div').count(), 3);
  await card('호출 수').getByText('0건', { exact: true }).waitFor();
  await card('함수 오류 수').getByText('0건', { exact: true }).waitFor();
  await metrics.getByText('Lambda는 CPU·메모리 지표를 제공하지 않습니다.', { exact: true }).waitFor();
  metricPayload = { ...metricFixture, compute: 'ec2', cpu_percent: 19, measured_at: null };
  await metricRefresh().click(); await card('CPU').getByText('19%', { exact: true }).waitFor();
  assert.equal(await metrics.locator('.metrics > div').count(), 1);
  await metrics.getByText('측정 시각 없음', { exact: true }).waitFor();
  assert.equal(await metrics.locator('time').count(), 0);
  metricPayload = { ...metricFixture, compute: null };
  await metricRefresh().click(); await metrics.getByText('실행 환경을 확인할 수 없어 지원 지표를 표시할 수 없습니다.', { exact: true }).waitFor();
  assert.equal(await metrics.locator('.metrics > div').count(), 0);
  for (const [state, label] of [['waiting', '수집 대기'], ['not_deployed', '미배포'], ['unsupported', '지원 안 됨'], ['error', '수집 오류']]) {
    metricPayload = { ...metricFixture, status: state, message: state + ' metrics fixture' };
    await metricRefresh().click(); await metrics.getByText(label, { exact: true }).waitFor();
    await metrics.getByText(state + ' metrics fixture', { exact: true }).waitFor();
    assert.equal(await metrics.locator('.metrics > div').count(), 0);
  }
  metricStatus = 500; metricPayload = { message: 'metric HTTP failure' };
  await metricRefresh().click(); await metrics.getByRole('alert').filter({ hasText: 'metric HTTP failure' }).waitFor();
  metricStatus = 200; metricPayload = { ...metricFixture, cpu_percent: 'zero' };
  await metricRefresh().click(); await metrics.getByRole('alert').filter({ hasText: '응답 형식' }).waitFor();
  metricPayload = { ...metricFixture };
  await metricRefresh().click(); await card('CPU').getByText('0%', { exact: true }).waitFor(); await ready();
  results.push('metrics Fargate5/Lambda3/EC2one, null versus zero, measured timestamp, all states and HTTP/shape recovery');
  const beforeMetricPoll = metricCount;
  metricHeld = true;
  const metricPending = new Promise(resolve => metricStarted = resolve);
  await page.clock.runFor(15000); await metricPending;
  assert.equal(metricCount, beforeMetricPoll + 1); assert.ok(await metricRefresh().isDisabled());
  await page.clock.runFor(45000); assert.equal(metricCount, beforeMetricPoll + 1);
  metricHeld = false; metricRelease(); await ready();
  for (const destination of ['tab', 'app', 'source']) {
    metricHeld = true;
    const pending = new Promise(resolve => metricStarted = resolve);
    await metricRefresh().click(); await pending;
    const aborts = await page.evaluate(() => window.metricAborts);
    if (destination === 'tab') await page.getByRole('tab', { name: '개요', exact: true }).click();
    if (destination === 'app') {
      await page.getByRole('button', { name: '앱 목록으로', exact: true }).click();
      await page.getByRole('button', { name: second.name + ' 상세 보기', exact: true }).click();
    }
    if (destination === 'source') await page.goto(base + '/?source=demo&page=apps');
    if (destination === 'source') assert.equal(new URL(page.url()).searchParams.get('source'), 'demo');
    else assert.equal(await page.evaluate(() => window.metricAborts), aborts + 1);
    metricHeld = false; metricRelease();
    const stopped = metricCount; await page.clock.runFor(45000); assert.equal(metricCount, stopped);
    if (destination === 'app') {
      await page.getByRole('tab', { name: '모니터링', exact: true }).click();
      await card('CPU').getByText('77%', { exact: true }).waitFor();
    }
    if (destination !== 'source') { await open('모니터링'); await card('CPU').getByText('0%', { exact: true }).waitFor(); }
  }
  const demoMetricsCount = metricCount;
  await page.getByRole('button', { name: 'Demo monitoring 상세 보기', exact: true }).click();
  await page.getByRole('tab', { name: '모니터링', exact: true }).click();
  await metrics.getByText('샘플 수치', { exact: true }).waitFor();
  assert.deepEqual(await metrics.locator('.metrics strong').allTextContents(), ['24%', '38%', '128 ms']);
  await page.clock.runFor(45000); assert.equal(metricCount, demoMetricsCount);
  results.push('metrics sequential polling, tab/app/source cancellation and isolation, original demo zero HTTP');
  app.teardown_status = 'requested'; app.teardown_requested_at = at;
  await open('모니터링'); await card('CPU').getByText('0%', { exact: true }).waitFor(); await ready();
  metricHeld = true;
  const lifecyclePending = new Promise(resolve => metricStarted = resolve);
  await metricRefresh().click(); await lifecyclePending;
  const lifecycleAborts = await page.evaluate(() => window.metricAborts);
  metricHeld = false; app.teardown_status = 'success'; app.teardown_finished_at = at;
  metricPayload = { ...metricFixture, status: 'not_deployed', message: 'teardown complete metrics fixture' };
  await page.clock.runFor(3000);
  await metrics.getByText('미배포', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.metricAborts), lifecycleAborts + 1);
  metricRelease(); await page.clock.runFor(15000);
  assert.equal(await metrics.locator('.metrics > div').count(), 0);
  results.push('teardown lifecycle remount aborts old snapshot and rejects late pre-teardown readings');
  delete app.teardown_status; delete app.teardown_requested_at; delete app.teardown_finished_at;
  app.name = 'test-ec2'; app.latest_deployment_id = 'title-deployment';
  titleDeployment = { id: 'title-deployment', app_space_id: app.id, compute: 'lambda', status: 'success', url: null, reason: null, created_at: at };
  for (const [compute, label] of [['lambda', 'Lambda'], ['ecs-fargate', 'ECS Fargate'], ['ec2', 'EC2']]) {
    titleDeployment.compute = compute; metricPayload = { ...metricFixture, compute };
    await open('모니터링'); await ready();
    assert.equal(await page.locator('.page-heading h1').innerText(), app.name + ' (' + label + ')');
    if (compute === 'lambda') {
      await page.screenshot({ path: 'artifacts/monitoring-title-desktop.png', fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: 'artifacts/monitoring-title-mobile.png', fullPage: true });
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
  }
  const openDeployedTitle = async () => {
    await open('개요');
    if (titleDeployment.app_space_id === app.id) {
      await page.getByText('실행 환경: ' + titleDeployment.compute, { exact: true }).waitFor();
    } else {
      // A deployment belonging to another app must not render this app's result body.
      await page.getByRole('button', { name: '새 버전 재배포', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '새 버전 재배포', exact: true });
      await dialog.getByText(titleDeployment.id + ' · ' + titleDeployment.status, { exact: true }).waitFor();
      await dialog.getByRole('button', { name: '취소', exact: true }).click();
      assert.equal(await page.getByText('실행 환경: ' + titleDeployment.compute, { exact: true }).count(), 0);
    }
  };
  titleDeployment.compute = 'constructor'; await openDeployedTitle();
  assert.equal(await page.locator('.page-heading h1').innerText(), app.name);
  titleDeployment.compute = 'lambda';
  titleDeployment.status = 'failed'; await openDeployedTitle();
  assert.equal(await page.locator('.page-heading h1').innerText(), app.name);
  titleDeployment.status = 'success'; titleDeployment.app_space_id = second.id; await openDeployedTitle();
  assert.equal(await page.locator('.page-heading h1').innerText(), app.name);
  titleDeployment.app_space_id = app.id; app.teardown_status = 'success'; app.teardown_requested_at = at;
  await openDeployedTitle(); assert.equal(await page.locator('.page-heading h1').innerText(), app.name);
  delete app.teardown_status; delete app.teardown_requested_at;
  app.latest_deployment_id = null; await open();
  assert.equal(await page.locator('.page-heading h1').innerText(), app.name);
  results.push('titles use this app successful deployment compute, omit failed/mismatched/teardown/undeployed labels; time copy and mobile clarity');
  assert.deepEqual(unexpected, []);
  assert.deepEqual(errors, []);
  await writeFile('artifacts/monitoring-results.json', JSON.stringify({ results }, null, 2));
  console.log('PASS monitoring: ' + results.join('; '));
} finally {
  await browser?.close();
  server?.kill();
  if (exportPath) await unlink(exportPath);
  if (exportDirectory) await rmdir(exportDirectory);
}
