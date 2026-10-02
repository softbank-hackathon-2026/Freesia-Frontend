import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout, clearTimeout } from 'node:timers';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { initialDemo } from '../src/lib/demo.ts';

const base = process.env.MONITORING_CHECK_URL || 'http://localhost:15173';
const server = process.env.MONITORING_CHECK_URL ? null : spawn(process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', 'localhost', '--port', '15173', '--strictPort'], { stdio: 'pipe' });
let browser;
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
  const app = { id: 'monitor-a', name: 'Monitoring A', repo_url: 'https://github.com/example/a', branch: 'main', infra_id: 'infra', created_at: at, latest_deployment_id: null };
  const second = { ...app, id: 'monitor-b', name: 'Monitoring B' };
  const demo = { ...initialDemo(), apps: [{ ...app, id: 'demo-monitor', name: 'Demo monitoring' }] };
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
  let payload = { status: 'ok', message: null, lines: [{ at, message: '<img src=x onerror="window.logExecuted=true"> first log' }] };
  let status = 200, count = 0, held = false, release, started;
  const metricFixture = { status: 'ok', message: null, compute: 'ecs-fargate', cpu_percent: 0, memory_percent: null, response_time_ms: 120.67890123, request_count: 15, error_count: 0, measured_at: at };
  let metricPayload = { ...metricFixture }, metricStatus = 200, metricCount = 0, metricHeld = false, metricRelease, metricStarted;
  const unexpected = [];
  await page.route('**/api/**', async route => {
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
    if (path.endsWith('/repositories')) return json([]);
    if (path.endsWith('/infra-spaces')) return json([{ id: 'infra', name: 'Fixture', description: '', network: 'public', computes: ['ecs-fargate'], app_count: 2 }]);
    if (path.endsWith('/app-spaces')) return json([app, second]);
    if (path.endsWith('/' + app.id)) return json(app);
    if (path.endsWith('/' + second.id)) return json(second);
    unexpected.push(path); return json({ message: 'unexpected test route' }, 404);
  });
  const open = async (tab = '로그') => {
    await page.goto(base + '/?source=api&app=' + app.id);
    await page.getByRole('heading', { name: app.name, exact: true }).waitFor();
    await page.getByRole('tab', { name: tab, exact: true }).click();
  };
  const logs = page.getByRole('region', { name: '애플리케이션 로그', exact: true });
  const refresh = () => logs.getByRole('button', { name: '로그 새로고침', exact: true });
  await open();
  await logs.locator('pre').filter({ hasText: 'first log' }).waitFor();
  assert.equal(await logs.locator('img').count(), 0);
  assert.equal(await page.evaluate(() => window.logExecuted), undefined);
  assert.match(await logs.locator('pre').innerText(), /2026/);
  assert.equal(await logs.getByText('샘플', { exact: true }).count(), 0);
  results.push('initial API GET, local timestamp, escaped log content');
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
    assert.equal(await logs.locator('pre').count(), 0);
  }
  payload = { status: 'ok', message: null, lines: [] };
  await refresh().click(); await logs.getByText('최근 1시간에 수집된 로그가 없습니다.', { exact: true }).waitFor();
  status = 500; payload = { message: 'fixture HTTP failure' };
  await refresh().click(); await logs.getByRole('alert').filter({ hasText: 'fixture HTTP failure' }).waitFor();
  status = 200; payload = { status: 'unknown', message: null, lines: [] };
  await refresh().click(); await logs.getByRole('alert').filter({ hasText: '응답 형식' }).waitFor();
  payload = { status: 'ok', message: null, lines: [{ at, message: 'recovered log' }] };
  await refresh().click(); await logs.locator('pre').filter({ hasText: 'recovered log' }).waitFor();
  results.push('all business states, empty, HTTP 500, invalid payload and manual recovery');

  await page.clock.install();
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
    if (destination === 'source') await page.getByLabel('데이터 소스').selectOption('demo');
    assert.equal(await page.evaluate(() => window.logAborts), beforeAbort + 1);
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
  results.push('tab/app/source unmount cancels pending fetch and timers, late responses isolated');
  const demoCount = count;
  await page.getByRole('button', { name: 'Demo monitoring 상세 보기', exact: true }).click();
  await page.getByRole('tab', { name: '로그', exact: true }).click();
  await logs.getByText('샘플', { exact: true }).waitFor();
  assert.match(await logs.locator('pre').innerText(), /DEMO/);
  await page.clock.runFor(45000); assert.equal(count, demoCount);
  results.push('demo keeps sample label and sends zero monitoring requests');
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
    if (destination === 'source') await page.getByLabel('데이터 소스').selectOption('demo');
    assert.equal(await page.evaluate(() => window.metricAborts), aborts + 1);
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
  assert.deepEqual(unexpected, []);
  assert.deepEqual(errors, []);
  await writeFile('artifacts/monitoring-results.json', JSON.stringify({ results }, null, 2));
  console.log('PASS monitoring: ' + results.join('; '));
} finally {
  await browser?.close();
  server?.kill();
}
