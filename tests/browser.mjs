import { chromium, webkit } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const url = process.env.TEST_URL || 'http://127.0.0.1:4173';
await mkdir('test-results', { recursive: true });
const browser = await chromium.launch({ channel: 'chromium', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-webgl', '--enable-unsafe-swiftshader'] });
const errors = [], checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push(name); console.log(`✓ ${name}`); };
const desktop = await browser.newContext({ viewport: { width: 1440, height: 1040 } });
const page = await desktop.newPage();
page.on('pageerror', error => errors.push(error.message));
page.on('console', msg => { if (msg.type() === 'error') errors.push(`${msg.text()} ${msg.location().url}`); });
async function start(p) {
  await p.click('#start-button');
  await p.waitForFunction(() => window.__verdant.mode === 'playing');
}
async function state(p) { return p.evaluate(() => ({ mode: window.__verdant.mode, position: window.__verdant.game?.position.toArray(), quaternion: window.__verdant.game?.orientation.toArray(), score: window.__verdant.game?.score, collected: window.__verdant.game?.collected })); }
try {
  await page.goto(`${url}/?test`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__verdant));
  check('WebGL renders the arena', await page.locator('#webgl-error').isHidden());
  await page.screenshot({ path: 'test-results/desktop-home.png', fullPage: true });
  check('Four difficulty presets', await page.locator('[data-difficulty]').count() === 4);
  await page.click('[data-difficulty="drift"]');
  await page.click('#settings-button');
  await page.click('[data-theme="tidal"]');
  await page.selectOption('#pace', '0.8');
  await page.locator('#sound').uncheck();
  await page.locator('#sensitivity').fill('1.2');
  await page.locator('#sensitivity').dispatchEvent('input');
  await page.click('[aria-label="Close settings"]');
  await page.reload({ waitUntil: 'networkidle' });
  const persisted = await page.evaluate(() => window.__verdant.settings);
  check('Settings and difficulty survive reload', persisted.theme === 'tidal' && persisted.pace === 0.8 && persisted.difficulty === 'drift' && persisted.sound === false && persisted.sensitivity === 1.2);
  await page.click('#settings-button'); await page.click('[data-theme="verdant"]'); await page.selectOption('#pace', '1');
  await page.locator('#sensitivity').fill('1'); await page.locator('#sensitivity').dispatchEvent('input'); await page.click('[aria-label="Close settings"]');
  await start(page);
  const before = await state(page); await page.keyboard.down('ArrowUp'); await page.waitForTimeout(250); await page.keyboard.up('ArrowUp');
  const up = await state(page); check('Arrow up climbs in first person', up.position[1] > before.position[1]);
  await page.waitForTimeout(100); const released = await state(page);
  check('Released steering holds heading', up.quaternion.every((v, i) => Math.abs(v - released.quaternion[i]) < 0.00001));
  await page.keyboard.down('d'); await page.waitForTimeout(220); await page.keyboard.up('d');
  const right = await state(page); check('WASD steers right', right.position[0] > released.position[0]);
  await page.evaluate(() => window.__verdant.placeBerryAhead(3));
  await page.waitForFunction(() => window.__verdant.game.collected >= 1);
  check('Berry collection updates score and length', await page.evaluate(() => window.__verdant.game.score >= 100 && window.__verdant.game.length > 8));
  await page.keyboard.press('Escape');
  check('Escape pauses', await page.locator('#pause-dialog').isVisible());
  const paused = await state(page); await page.waitForTimeout(350); const still = await state(page);
  check('Paused flight stays frozen', paused.position.every((v, i) => v === still.position[i]));
  await page.click('#pause-settings'); await page.click('[data-theme="dusk"]'); await page.click('[aria-label="Close settings"]');
  check('In-game settings return to pause', await page.locator('#pause-dialog').isVisible());
  await page.click('#resume-button');
  await page.screenshot({ path: 'test-results/desktop-flight.png' });
  await page.evaluate(() => window.__verdant.nearWall());
  await page.waitForSelector('#gameover-dialog[open]');
  check('Wall collision ends the run', (await page.locator('#crash-reason').textContent()).includes('edge'));
  check('Difficulty and pace get a saved record', await page.evaluate(() => JSON.parse(localStorage.getItem('verdant-records'))['drift:1'].score >= 100));
  await page.click('#retry-button'); await page.waitForFunction(() => window.__verdant.mode === 'playing');
  check('Retry starts a fresh game', (await state(page)).score === 0);
  await page.keyboard.press('p'); await page.click('#quit-button'); await page.click('#scores-button');
  check('Records panel displays personal best', (await page.locator('#records-list').textContent()).includes('100'));
  await page.click('[aria-label="Close records"]');
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  check('Service worker takes control', await page.evaluate(() => Boolean(navigator.serviceWorker.controller)));
  const assets = await page.evaluate(async () => { const keys = await caches.keys(); return (await (await caches.open(keys.find(k => k.startsWith('verdant-')))).keys()).map(r => r.url); });
  check('Offline cache contains JS, CSS and installation icons', assets.some(a => a.endsWith('.js')) && assets.some(a => a.endsWith('.css')) && assets.some(a => a.endsWith('icon-512.png')));
  await desktop.setOffline(true); await page.reload({ waitUntil: 'networkidle' });
  await page.screenshot({ path: 'test-results/offline-reload.png' });
  check('App reloads fully offline', await page.locator('#start-button').isVisible() && (await page.locator('#offline-status').textContent()).includes('offline'));
  await start(page); check('A fresh game starts offline', (await state(page)).mode === 'playing');
  await desktop.setOffline(false);

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const phone = await mobile.newPage(); phone.on('pageerror', error => errors.push(error.message));
  await phone.goto(`${url}/?test`, { waitUntil: 'networkidle' });
  await phone.screenshot({ path: 'test-results/mobile-home.png', fullPage: true });
  check('Mobile home has no horizontal overflow', await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await phone.click('[data-difficulty="drift"]'); await start(phone);
  check('Mobile thumbstick is visible', await phone.locator('#joystick').isVisible());
  await phone.screenshot({ path: 'test-results/mobile-flight.png' });
  const rect = await phone.locator('#joystick').boundingBox();
  const cdp = await mobile.newCDPSession(phone); const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
  const touch = async (type, px, py) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x: px, y: py }] });
  const mBefore = await state(phone);
  await touch('touchStart', x, y); await touch('touchMove', x, y - 40); await phone.waitForTimeout(250);
  check('Thumbstick upward drag climbs', (await state(phone)).position[1] > mBefore.position[1]);
  await touch('touchEnd');
  check('Thumbstick springs to neutral', await phone.evaluate(() => window.__verdant.stick.x === 0 && window.__verdant.stick.y === 0));
  await touch('touchStart', x, y); await touch('touchMove', x + 40, y); await phone.waitForTimeout(180); await touch('touchCancel');
  check('Touch cancellation clears steering', await phone.evaluate(() => window.__verdant.stick.x === 0 && window.__verdant.stick.y === 0));
  await phone.click('#pause-button'); await phone.setViewportSize({ width: 844, height: 390 });
  await phone.click('#resume-button');
  await phone.screenshot({ path: 'test-results/mobile-landscape.png' });
  const landscape = await phone.locator('#joystick').boundingBox();
  check('Landscape thumbstick fits the viewport', landscape.x >= 0 && landscape.y >= 0 && landscape.y + landscape.height <= 390);
  await phone.evaluate(() => window.dispatchEvent(new Event('blur')));
  check('Leaving the app pauses automatically', (await state(phone)).mode === 'paused');
  await mobile.close();
  check('No browser runtime or console errors', errors.length === 0);
  console.log(`\n${checks.length} browser checks passed.`);
} finally {
  if (errors.length) console.error(errors);
  await browser.close();
}

// Safari engine smoke check, useful for installed iPhone PWAs.
let safari;
try {
  // Editor Snap paths can inject incompatible GTK/GIO libraries into WebKit.
  const browserEnv = { ...process.env };
  for (const key of ['LD_LIBRARY_PATH', 'LD_PRELOAD', 'GTK_PATH', 'GIO_MODULE_DIR', 'GIO_EXTRA_MODULES']) delete browserEnv[key];
  safari = await webkit.launch({ headless: true, env: browserEnv });
  const context = await safari.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto(`${url}/?test`, { waitUntil: 'networkidle' });
  assert.ok(await page.locator('#start-button').isVisible());
  assert.ok(await page.locator('#webgl-error').isHidden());
  await start(page);
  assert.equal((await state(page)).mode, 'playing');
  assert.ok(await page.locator('#joystick').isVisible());
  await page.screenshot({ path: 'test-results/webkit-mobile.png' });
  await page.click('#pause-button');
  assert.equal((await state(page)).mode, 'paused');
  console.log('✓ WebKit / Safari engine renders, starts and pauses the mobile game');
} finally { await safari?.close(); }
