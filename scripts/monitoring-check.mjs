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
    window.logAborts = 0;
    const original = window.fetch.bind(window);
    window.fetch = (url, options) => {
      const aborted = () => window.logAborts++;
      const signal = String(url).includes('/logs') ? options?.signal : undefined;
      signal?.addEventListener('abort', aborted);
      return original(url, options).finally(() => signal?.removeEventListener('abort', aborted));
    };
  }, demo);
  let payload = { status: 'ok', message: null, lines: [{ at, message: '<img src=x onerror="window.logExecuted=true"> first log' }] };
  let status = 200, count = 0, held = false, release, started;
  const unexpected = [];
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    const json = (value, code = 200) => route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(value) });
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
  const open = async () => {
    await page.goto(base + '/?source=api&app=' + app.id);
    await page.getByRole('heading', { name: app.name, exact: true }).waitFor();
    await page.getByRole('tab', { name: '로그', exact: true }).click();
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
  assert.deepEqual(unexpected, []);
  assert.deepEqual(errors, []);
  await writeFile('artifacts/monitoring-results.json', JSON.stringify({ results }, null, 2));
  console.log('PASS monitoring logs: ' + results.join('; '));
} finally {
  await browser?.close();
  server?.kill();
}
