import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Controlled browser fixtures; this check never contacts a live backend.
const port = process.env.BROWSER_CHECK_PORT || '15184';
const origin = `http://localhost:${port}`;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', 'localhost', '--port', port, '--strictPort'], { stdio: 'pipe' });
let serverLog = '';
server.stdout.on('data', data => { serverLog += data; });
server.stderr.on('data', data => { serverLog += data; });
const baseMascot = '/pieckpick-mascot.png';
const armoredMascot = '/pieckpick-mascot-armored.png';
const stamp = '2026-10-04T00:00:00Z';
const app = { id: 'brand-app', name: 'Brand fixture', repo_url: 'https://github.com/example/branding', branch: 'main', infra_id: 'brand-infra', created_at: stamp, latest_deployment_id: null, teardown_requested_at: null };
const infra = { id: app.infra_id, name: 'Brand fixture infra', description: 'Controlled fixture', network: 'public', computes: ['ecs-fargate', 'lambda'], deployable_computes: ['ecs-fargate', 'lambda'], app_count: 1 };
const repository = { id: 'brand-repository', name: 'example/branding', repo_url: app.repo_url, branch: 'main', created_at: stamp };
const analysis = { status: 'done', requirements: ['Node.js'], evidence: [{ file: 'package.json', finding: 'Fixture server', certain: true }], candidates: [{ compute: 'ecs-fargate', state: 'selected', reason: 'Fixture recommendation', cons: [] }, { compute: 'lambda', state: 'alternative', reason: 'Fixture alternative', cons: [] }], mascot_message: 'A controlled server explanation, retained without reanalysis.' };
let browser;
const counts = { app: 0, analysis: 0, mutations: [] };
const errors = [];
async function loaded(locator, expected) {
  await locator.waitFor({ state: 'attached' });
  for (let attempt = 0; attempt < 50 && await locator.getAttribute('src') !== expected; attempt++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(await locator.getAttribute('src'), expected);
  await locator.evaluate(image => image.decode());
  assert.ok(await locator.evaluate(image => image.naturalWidth > 0 && image.naturalHeight > 0));
}
async function guide(page, expected) {
  await page.getByRole('button', { name: '실행 환경 선택', exact: true }).click();
  await loaded(page.locator('.mascot img'), expected);
  assert.equal((await page.locator('.mascot p').textContent()).trim(), analysis.mascot_message);
  await loaded(page.locator('.brand-icon'), baseMascot);
}
async function fit(page) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal page overflow');
  assert.ok(await page.locator('.brand').evaluate(el => {
    const rect = el.getBoundingClientRect();
    return rect.left >= 0 && rect.right <= innerWidth + 1;
  }), 'Brand stays inside viewport');
}
try {
  await mkdir('artifacts', { recursive: true });
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Isolated Vite failed: ${serverLog}`);
    try { if ((await fetch(origin)).ok) break; } catch { /* Server is starting. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
    if (attempt === 99) throw new Error(`Vite startup timeout: ${serverLog}`);
  }
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', async route => {
    const req = route.request(), path = new URL(req.url()).pathname;
    const json = value => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value) });
    if (req.method() !== 'GET') { counts.mutations.push(`${req.method()} ${path}`); return route.fulfill({ status: 405, body: 'Writes forbidden in branding fixtures' }); }
    if (path.endsWith('/repositories')) return json([repository]);
    if (path.endsWith('/infra-spaces')) return json([infra]);
    if (path.endsWith('/app-spaces')) return json([app]);
    if (path.endsWith('/' + app.id)) { counts.app++; return json(app); }
    if (path.endsWith('/analysis')) { counts.analysis++; return json(analysis); }
    if (path.endsWith('/logs')) return json({ deployment_id: '', supported: false, reason: 'Fixture has no deployment', entries: [], next_cursor: null });
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ message: 'Outside branding fixture' }) });
  });
  await page.goto(`${origin}/?source=api&app=${app.id}`);
  await page.getByRole('heading', { name: app.name, exact: true }).waitFor();
  const name = await page.locator('.brand-name').textContent();
  assert.ok(name.trim().startsWith('PieckPick'), `Brand must be PieckPick, observed ${JSON.stringify(name)}`);
  const korean = page.locator('.brand-name').getByText('"인프라를 구축하겠어!"', { exact: true });
  const japanese = page.locator('.brand-name').getByText('"インフラを構築してやる！"', { exact: true });
  assert.equal(await korean.count(), 1);
  assert.equal(await japanese.count(), 1);
  assert.equal(await japanese.getAttribute('lang'), 'ja');
  const kr = await korean.boundingBox(), ja = await japanese.boundingBox();
  assert.ok(ja.y >= kr.y + kr.height - 1, 'Japanese slogan is a separate line below Korean');
  assert.ok((await page.title()).includes('PieckPick'));
  assert.equal(await page.locator('link[rel="icon"]').getAttribute('href'), baseMascot);
  await loaded(page.locator('.brand-icon'), baseMascot);
  for (const path of [baseMascot, armoredMascot]) {
    const response = await page.request.get(origin + path), data = await response.body();
    assert.equal(response.status(), 200);
    assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.ok([4, 6].includes(data[25]), 'PNG has an alpha channel');
  }
  await fit(page);
  await page.locator('.brand').screenshot({ path: 'artifacts/branding-header-desktop.png' });
  await guide(page, baseMascot);
  await page.screenshot({ path: 'artifacts/branding-guide-base-desktop.png' });
  const stableCounts = { app: counts.app, analysis: counts.analysis };
  await page.getByRole('tab', { name: '로그', exact: true }).click();
  await page.getByRole('tab', { name: '개요', exact: true }).click();
  await guide(page, baseMascot);
  await page.getByRole('button', { name: '코드 분석', exact: true }).click();
  await guide(page, baseMascot);
  await page.setViewportSize({ width: 390, height: 844 });
  await guide(page, baseMascot);
  assert.deepEqual({ app: counts.app, analysis: counts.analysis }, stableCounts, 'Tab/stage/viewport changes do not reload app or rerun analysis');
  await page.locator('.mascot').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/branding-guide-base-mobile.png' });
  await page.locator('.mascot').screenshot({ path: 'artifacts/branding-mascot-base-mobile.png' });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole('button', { name: '주요 메뉴 열기', exact: true }).click();
    await fit(page);
    await loaded(page.locator('.brand-icon'), baseMascot);
    const krBox = await korean.boundingBox(), jaBox = await japanese.boundingBox();
    assert.ok(jaBox.y >= krBox.y + krBox.height - 1);
    assert.ok(await japanese.evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'Japanese text fits its line');
    await page.screenshot({ path: `artifacts/branding-menu-${width}.png` });
    await page.getByRole('button', { name: '주요 메뉴 닫기', exact: true }).click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.getByRole('button', { name: '앱 목록으로' }).click();
  await page.getByRole('button').filter({ hasText: app.name }).click();
  await guide(page, armoredMascot);
  await page.screenshot({ path: 'artifacts/branding-guide-armored-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await guide(page, armoredMascot);
  await page.locator('.mascot').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/branding-guide-armored-mobile.png' });
  await page.locator('.mascot').screenshot({ path: 'artifacts/branding-mascot-armored-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.getByRole('button', { name: '앱 목록으로' }).click();
  await page.getByRole('button').filter({ hasText: app.name }).click();
  await guide(page, baseMascot);
  assert.deepEqual(counts.mutations, [], 'No mutation or analysis POST is caused by mascot selection');
  assert.deepEqual(errors, []);
  await writeFile('artifacts/branding-results.json', JSON.stringify({ status: 'PASS', visits: [baseMascot, armoredMascot, baseMascot], counts, errors, screenshots: 'artifacts/branding-*.png' }, null, 2));
  console.log('PASS branding: exact bilingual quotes, language and line break, title/favicon, alpha PNGs, desktop/390/320 menu, base-armored-base visits, stable tab/stage rerenders, no unexpected app/analysis calls or JS errors');
} finally {
  if (browser) await browser.close();
  server.kill();
  await writeFile('artifacts/branding-server.log', serverLog);
}
