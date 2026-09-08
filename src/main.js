import './style.css';
import { Vector3 } from 'three';
import { SnakeGame, DIFFICULTIES } from './game.js';
import { World, THEMES } from './scene.js';

const $ = selector => document.querySelector(selector);
document.body.classList.toggle('touch-device', navigator.maxTouchPoints > 0);
const icons = {
  arrow: '<svg viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="16" cy="17" r="3"/></svg>',
  trophy: '<svg viewBox="0 0 24 24"><path d="M8 3h8v6a4 4 0 0 1-8 0V3Zm0 2H4v3a4 4 0 0 0 5 4m7-7h4v3a4 4 0 0 1-5 4m-3 1v6m-4 2h8"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
  leaf: '<svg viewBox="0 0 24 24"><path d="M19 4C6 2 2 9 7 16c7 5 14 1 12-12ZM5 20 15 10"/></svg>',
};
const defaults = { theme: 'verdant', snakeColor: '', pace: 1, sensitivity: 1, fov: 85, sound: true, vibration: true, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, difficulty: 'classic' };
let storageOK = true;
function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { storageOK = false; return fallback; } }
function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { storageOK = false; toast('Storage unavailable. Records will last for this session.'); } }
const stored = read('verdant-settings', {});
const settings = { ...defaults };
if (stored && typeof stored === 'object') {
  if (THEMES[stored.theme]) settings.theme = stored.theme;
  if (DIFFICULTIES[stored.difficulty]) settings.difficulty = stored.difficulty;
  if (/^#[0-9a-f]{6}$/i.test(stored.snakeColor)) settings.snakeColor = stored.snakeColor;
  if ([0.8, 1, 1.2].includes(stored.pace)) settings.pace = stored.pace;
  for (const [key, min, max] of [['sensitivity', 0.6, 1.6], ['fov', 65, 105]]) {
    if (Number.isFinite(stored[key])) settings[key] = Math.max(min, Math.min(max, stored[key]));
  }
  for (const key of ['sound', 'vibration', 'reducedMotion']) if (typeof stored[key] === 'boolean') settings[key] = stored[key];
}
const savedRecords = read('verdant-records', {});
let records = savedRecords && typeof savedRecords === 'object' && !Array.isArray(savedRecords) ? savedRecords : {};
let mode = 'menu', game = null, world, installPrompt, audioContext, lastTime = 0, accumulator = 0, hudTimer = 0, toastTimer, countdownTimer;
let runSaved = false, previousFocus;
const keys = new Set(), stick = { x: 0, y: 0 }, input = { x: 0, y: 0 };
const recordKey = (difficulty = settings.difficulty, pace = settings.pace) => `${difficulty}:${pace}`;
const best = (difficulty, pace) => records[recordKey(difficulty, pace)]?.score || 0;
const number = n => Math.floor(n).toLocaleString();
const timeString = n => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`;

$('#app').innerHTML = `
  <header class="site-header">
    <a class="brand" href="./" aria-label="Verdant home"><img src="./icon.svg" alt=""/><span>verdant<span class="brand-dot">.</span></span></a>
    <div class="header-center"><span class="small-line"></span> SNAKE, IN A NEW DIMENSION</div>
    <nav aria-label="Main navigation">
      <span id="offline-status" class="connection"><i></i><span>Ready to explore</span></span>
      <button id="install" class="quiet-button" hidden>Install app ${icons.arrow}</button>
      <button class="icon-button" id="scores-button" aria-label="Your records">${icons.trophy}</button>
      <button class="icon-button" id="settings-button" aria-label="Settings">${icons.settings}</button>
    </nav>
  </header>
  <main>
    <section class="arena" id="arena" aria-label="3D snake arena">
      <canvas id="world" aria-label="First-person 3D snake game"></canvas>
      <div class="arena-vignette"></div>
      <div class="menu-layer" id="menu-layer">
        <div class="hero-copy">
          <div class="eyebrow"><span class="live-dot"></span> LESS GRID. MORE FREEDOM.</div>
          <h1>A new dimension<br>of <em>snake.</em></h1>
          <p>Follow your instinct. Find your flow.<br>A familiar game with a whole new perspective.</p>
          <button id="hero-play" class="text-button">Enter the arena ${icons.arrow}</button>
        </div>
        <div class="arena-label"><span class="cross-icon">+</span> ZERO GRAVITY <span class="label-divider">/</span> INFINITE POSSIBILITIES</div>
        <div class="scene-caption"><span class="live-dot"></span> A WORLD WORTH GETTING LOST IN <span>01 — 04</span></div>
        <div class="axis-indicator"><span>Y</span><svg viewBox="0 0 60 60"><path d="M30 30V5m0 25L8 44m22-14 23 14"/></svg><span>X &nbsp;&nbsp; Z</span></div>
      </div>
      <div class="game-hud" id="game-hud" hidden>
        <div class="hud-top"><div class="hud-score"><span class="micro">SCORE</span><strong id="score">0</strong><span id="score-best">BEST 0</span></div><div class="hud-stage"><span id="run-difficulty">CLASSIC</span><strong id="stage">STAGE 01</strong><div class="progress-track"><i id="stage-progress"></i></div></div><button class="icon-button" id="pause-button" aria-label="Pause game">${icons.pause}</button></div>
        <div class="crosshair"><i></i></div>
        <div id="target-indicator" class="target-indicator"><span>◇</span><small id="target-distance"></small></div>
        <div id="wall-warning" class="wall-warning" hidden>BOUNDARY AHEAD · TURN NOW</div>
        <div class="hud-bottom"><div class="flight-data"><div><span class="micro">BERRIES</span><strong id="berries">00</strong></div><div><span class="micro">LENGTH</span><strong id="length">8 m</strong></div><div><span class="micro">SPEED</span><strong id="speed">13 m/s</strong></div><div><span class="micro">TIME</span><strong id="timer">0:00</strong></div></div><div class="radar-wrap"><span class="micro">ARENA · TOP VIEW</span><canvas id="radar" width="240" height="240" aria-label="Top-down radar of the arena"></canvas><span class="radar-legend">● YOU <span>● BERRIES</span></span></div></div>
        <div class="touch-controls" id="touch-controls"><div class="joystick" id="joystick" role="group" aria-label="Flight thumbstick. Drag up, down, left or right to steer. Release to fly straight."><span class="joy-up">⌃</span><span class="joy-left">‹</span><span class="joy-right">›</span><span class="joy-down">⌄</span><div id="joystick-knob"></div></div><span>DRAG TO STEER · RELEASE TO GLIDE</span></div>
        <div class="desktop-flight-hint">ARROWS / WASD <span>STEER</span> &nbsp; ESC <span>PAUSE</span></div>
      </div>
      <div id="countdown" class="countdown" hidden><span class="eyebrow">FIND YOUR FLOW</span><strong>3</strong><p>Collect the berries. Keep clear of your trail.</p></div>
      <div id="webgl-error" class="webgl-error" hidden><h2>A little more graphics power needed.</h2><p>Enable WebGL or hardware acceleration in your browser, then reload to enter the arena.</p></div>
    </section>
    <section class="launch-panel" id="launch-panel">
      <div class="section-heading"><div><span class="section-number">01 /</span><h2>Choose your flow</h2></div><p>Four ways to find your edge.</p></div>
      <div class="difficulty-grid" role="group" aria-label="Difficulty">${Object.entries(DIFFICULTIES).map(([id, d]) => `
        <button class="difficulty-card ${settings.difficulty === id ? 'selected' : ''}" data-difficulty="${id}" aria-pressed="${settings.difficulty === id}">
          <div class="card-top"><span class="difficulty-bars">${Array.from({ length: 4 }, (_, i) => `<i class="${i < d.index ? 'filled' : ''}"></i>`).join('')}</span><span class="difficulty-tag">${d.tag}</span><span class="selection-dot"></span></div>
          <h3>${d.name}</h3><p>${d.subtitle}</p><div class="card-footer"><span>${d.speed} m/s <b>·</b> +${d.growth} m / berry</span><span class="card-best" data-best="${id}">${icons.trophy}<span>${number(best(id))}</span></span></div>
        </button>`).join('')}</div>
      <div class="launch-row"><div class="control-summary"><div class="key-group"><kbd>↑</kbd><div><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd></div></div><div><strong>Go wherever you want.</strong><p><span class="desktop-copy">Arrow keys or WASD to steer.</span><span class="mobile-copy">Drag the thumbstick to steer.</span> Release to fly straight.</p></div></div><button id="start-button" class="primary-button">Let’s play <span class="button-hint">${settings.difficulty === 'classic' ? 'CLASSIC' : settings.difficulty.toUpperCase()}</span>${icons.arrow}</button></div>
    </section>
    <footer id="site-footer"><span>${icons.leaf} No grid. No gravity. Just you and the chase.</span><button id="how-button" class="footer-link">How to play <span>↗</span></button><span class="footer-note">MADE FOR A LITTLE ESCAPE</span></footer>
  </main>
  <dialog id="settings-dialog" class="modal"><div class="modal-heading"><div><span class="eyebrow">MAKE IT YOURS</span><h2>Set the mood.</h2></div><button class="icon-button" data-close aria-label="Close settings">${icons.close}</button></div>
    <div class="setting-section"><label>World theme</label><div class="theme-options">${Object.entries(THEMES).map(([id, t]) => `<button data-theme="${id}" class="theme-option ${settings.theme === id ? 'active' : ''}" aria-pressed="${settings.theme === id}"><i style="--swatch:${t.accent};background:${t.fog}"><span></span></i>${t.name}</button>`).join('')}</div></div>
    <div class="setting-row"><div><label for="snake-color">Snake color</label><p>A trail with your signature.</p></div><div class="color-controls"><button id="reset-color" class="footer-link">Reset</button><input type="color" id="snake-color" value="${settings.snakeColor || THEMES[settings.theme].snake}"></div></div>
    <div class="setting-row"><div><label for="pace">Flight pace</label><p>Each pace has its own records. Applies next run.</p></div><select id="pace"><option value="0.8">Easy · 80%</option><option value="1">Standard · 100%</option><option value="1.2">Fast · 120%</option></select></div>
    <div class="setting-row"><div><label for="sensitivity">Steering sensitivity</label><p>How quickly you turn.</p></div><div class="range-control"><output id="sensitivity-value">${settings.sensitivity.toFixed(1)}×</output><input type="range" id="sensitivity" min="0.6" max="1.6" step="0.1" value="${settings.sensitivity}"></div></div>
    <div class="setting-row"><div><label for="fov">Field of view</label><p>A wider view of your world.</p></div><div class="range-control"><output id="fov-value">${settings.fov}°</output><input type="range" id="fov" min="65" max="105" step="5" value="${settings.fov}"></div></div>
    ${[['sound', 'Sound effects', 'Soft, synthesized sounds.'], ['vibration', 'Haptics', 'A little feedback on supported phones.'], ['reducedMotion', 'Reduce ambient motion', 'Calmer menus and transitions.']].map(([id, title, desc]) => `<div class="setting-row"><div><label for="${id}">${title}</label><p>${desc}</p></div><input class="toggle" type="checkbox" id="${id}" ${settings[id] ? 'checked' : ''}></div>`).join('')}
    <div class="modal-note">Settings save automatically on this device.</div>
  </dialog>
  <dialog id="scores-dialog" class="modal"><div class="modal-heading"><div><span class="eyebrow">YOUR PERSONAL BEST</span><h2>A trail of records.</h2></div><button class="icon-button" data-close aria-label="Close records">${icons.close}</button></div><p class="modal-intro">Every difficulty and flight pace gets its own leaderboard. All records stay on this device.</p><div id="records-list"></div><p class="modal-note">Points per berry × current stage. A new stage every 5 berries.</p></dialog>
  <dialog id="help-dialog" class="modal"><div class="modal-heading"><div><span class="eyebrow">WELCOME TO VERDANT</span><h2>Follow your instinct.</h2></div><button class="icon-button" data-close aria-label="Close instructions">${icons.close}</button></div><div class="help-list"><div><span>01</span><section><h3>You are the snake.</h3><p>See through its eyes as you fly through a 120 × 120 × 120 meter arena. There’s no gravity and no grid. Keep moving in any direction, even through a full loop.</p></section></div><div><span>02</span><section><h3>Find your flow.</h3><p>Hold ↑ / W to turn up, ↓ / S down, and ← / A or → / D to turn left or right. On mobile, drag the thumbstick. Release any control to keep flying straight.</p></section></div><div><span>03</span><section><h3>Follow the berries.</h3><p>Fly into the glowing berries to grow and score. The diamond guides you toward the nearest one; the radar shows the arena from above. Berries can be above or below you.</p></section></div><div><span>04</span><section><h3>Give yourself room.</h3><p>Your own tail and the arena walls end your run. Every 5 berries advances a stage: points increase and flight gets faster, up to +54%. Press Escape or P to pause.</p></section></div></div><button class="primary-button full-width" data-close>Got it. Let’s fly. ${icons.arrow}</button></dialog>
  <dialog id="pause-dialog" class="modal compact"><span class="eyebrow">TAKE A BREATHER</span><h2>Just floating.</h2><p class="modal-intro">Your world will be right here.</p><button id="resume-button" class="primary-button full-width">Keep going ${icons.arrow}</button><button id="pause-settings" class="secondary-button full-width">Settings</button><button id="quit-button" class="footer-link">End run & return home</button></dialog>
  <dialog id="gameover-dialog" class="modal compact"><span class="eyebrow" id="result-eyebrow">A GOOD PLACE TO BEGIN AGAIN</span><h2>What a ride.</h2><p id="crash-reason" class="modal-intro"></p><div class="result-score"><span class="micro">FINAL SCORE</span><strong id="final-score">0</strong><span id="final-mode"></span></div><div class="result-stats"><div><strong id="final-berries"></strong><span>BERRIES</span></div><div><strong id="final-stage"></strong><span>STAGE</span></div><div><strong id="final-time"></strong><span>FLIGHT TIME</span></div></div><button id="retry-button" class="primary-button full-width">One more flight ${icons.arrow}</button><button id="home-button" class="footer-link">Back to the garden</button></dialog>
  <div id="toast" class="toast" role="status" hidden></div>
`;

function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3200); }
function persist() { save('verdant-settings', settings); }
function applyTheme() {
  const t = THEMES[settings.theme]; document.documentElement.style.setProperty('--accent', t.accent);
  document.documentElement.style.setProperty('--scene-color', t.fog);
  document.documentElement.dataset.reducedMotion = settings.reducedMotion;
  world?.setTheme(settings);
}
try { world = new World($('#world'), settings); } catch (error) {
  console.error('Unable to initialize graphics:', error); $('#webgl-error').hidden = false;
  $('#menu-layer').hidden = true; $('#start-button').disabled = true;
}
applyTheme(); $('#pace').value = settings.pace;

function updateRecords() {
  document.querySelectorAll('[data-best]').forEach(el => { el.querySelector('span').textContent = number(best(el.dataset.best)); });
  $('#records-list').innerHTML = Object.entries(DIFFICULTIES).map(([id, d]) => `<div class="record-group"><div class="record-title"><h3>${d.name}</h3><span>${d.points} PTS / BERRY</span></div>${[0.8, 1, 1.2].map(pace => {
    const r = records[recordKey(id, pace)];
    return `<div class="record-row"><span>${pace === 0.8 ? 'Easy' : pace === 1 ? 'Standard' : 'Fast'}</span><span>${r?.score ? `${number(Number(r.berries) || 0)} berries · ${timeString(Number(r.time) || 0)}` : 'An open invitation'}</span><strong>${number(Number(r?.score) || 0)}</strong></div>`;
  }).join('')}</div>`).join('');
}
updateRecords();

function clearInput() { keys.clear(); stick.x = stick.y = input.x = input.y = 0; $('#joystick-knob').style.transform = 'translate(0px, 0px)'; }
function showDialog(id) { clearInput(); previousFocus = document.activeElement; $(id).showModal(); }
function closeDialog(dialog) { dialog.close(); if (dialog.id === 'settings-dialog' && mode === 'paused') $('#pause-dialog').showModal(); else previousFocus?.focus?.(); }
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => closeDialog(button.closest('dialog'))));
document.querySelectorAll('dialog').forEach(dialog => {
  dialog.setAttribute('aria-label', dialog.querySelector('h2')?.textContent || 'Game dialog');
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    if (dialog.id === 'pause-dialog') resume();
    else if (dialog.id === 'gameover-dialog') goHome();
    else closeDialog(dialog);
  });
  dialog.addEventListener('click', event => { if (event.target === dialog && ['settings-dialog', 'scores-dialog', 'help-dialog'].includes(dialog.id)) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeDialog(dialog); } });
});

document.querySelectorAll('[data-difficulty]').forEach(button => button.addEventListener('click', () => {
  settings.difficulty = button.dataset.difficulty;
  document.querySelectorAll('[data-difficulty]').forEach(el => { const selected = el === button; el.classList.toggle('selected', selected); el.setAttribute('aria-pressed', selected); });
  $('.button-hint').textContent = settings.difficulty.toUpperCase(); persist();
}));
$('#settings-button').onclick = () => { if (mode === 'playing' || mode === 'countdown') pause(); $('#pause-dialog').close(); showDialog('#settings-dialog'); };
$('#scores-button').onclick = () => { updateRecords(); showDialog('#scores-dialog'); };
$('#how-button').onclick = () => showDialog('#help-dialog');
document.querySelectorAll('[data-theme]').forEach(button => button.onclick = () => {
  settings.theme = button.dataset.theme; settings.snakeColor = ''; $('#snake-color').value = THEMES[settings.theme].snake;
  document.querySelectorAll('[data-theme]').forEach(el => { el.classList.toggle('active', el === button); el.setAttribute('aria-pressed', el === button); }); applyTheme(); persist();
});
$('#snake-color').oninput = event => { settings.snakeColor = event.target.value; applyTheme(); persist(); };
$('#reset-color').onclick = () => { settings.snakeColor = ''; $('#snake-color').value = THEMES[settings.theme].snake; applyTheme(); persist(); };
$('#pace').onchange = event => { settings.pace = Number(event.target.value); persist(); updateRecords(); };
for (const id of ['sensitivity', 'fov']) $(`#${id}`).oninput = event => {
  settings[id] = Number(event.target.value); $(`#${id}-value`).textContent = id === 'fov' ? `${settings[id]}°` : `${settings[id].toFixed(1)}×`; applyTheme(); persist();
};
for (const id of ['sound', 'vibration', 'reducedMotion']) $(`#${id}`).onchange = event => { settings[id] = event.target.checked; applyTheme(); persist(); };

function initAudio() { if (!settings.sound) return; try { audioContext ||= new (window.AudioContext || window.webkitAudioContext)(); audioContext.resume().catch(() => {}); } catch { /* Audio is optional. */ } }
function sound(kind) {
  if (!settings.sound || !audioContext) return;
  const t = audioContext.currentTime, osc = audioContext.createOscillator(), gain = audioContext.createGain();
  osc.type = kind === 'crash' ? 'triangle' : 'sine';
  osc.frequency.setValueAtTime(kind === 'crash' ? 140 : kind === 'level' ? 660 : 520, t);
  osc.frequency.exponentialRampToValueAtTime(kind === 'crash' ? 40 : kind === 'level' ? 1320 : 920, t + 0.16);
  gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(0.09, t + 0.015); gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  osc.connect(gain); gain.connect(audioContext.destination); osc.start(t); osc.stop(t + 0.31);
}

function startRun() {
  if (!world) return;
  document.querySelectorAll('dialog[open]').forEach(d => d.close());
  clearInput(); clearTimeout(countdownTimer); initAudio();
  game = new SnakeGame(settings.difficulty, settings.pace); runSaved = false; mode = 'countdown'; accumulator = 0;
  document.body.classList.add('in-game'); $('#menu-layer').hidden = true; $('#game-hud').hidden = false;
  $('#countdown').hidden = false; $('#countdown strong').textContent = '3';
  $('#launch-panel').hidden = true; $('#site-footer').hidden = true;
  updateHud(); window.scrollTo(0, 0);
  let count = 3;
  const tick = () => {
    if (mode !== 'countdown') return;
    count--;
    if (count === 0) { mode = 'playing'; $('#countdown').hidden = true; lastTime = performance.now(); return; }
    $('#countdown strong').textContent = count; sound('tick'); countdownTimer = setTimeout(tick, 700);
  };
  countdownTimer = setTimeout(tick, 700);
}
$('#start-button').onclick = $('#hero-play').onclick = $('#retry-button').onclick = startRun;
function pause() {
  if (!['playing', 'countdown'].includes(mode)) return;
  clearTimeout(countdownTimer); $('#countdown').hidden = true; mode = 'paused'; clearInput(); showDialog('#pause-dialog');
}
function resume() { if (mode !== 'paused') return; $('#pause-dialog').close(); clearInput(); mode = 'playing'; lastTime = performance.now(); accumulator = 0; initAudio(); }
function saveRun() {
  if (!game || runSaved) return false;
  runSaved = true;
  const key = recordKey(game.difficulty, game.pace), isBest = game.score > (Number(records[key]?.score) || 0);
  if (isBest) { records[key] = { score: game.score, berries: game.collected, time: game.elapsed, level: game.level }; save('verdant-records', records); }
  updateRecords(); return isBest;
}
function endRun() {
  mode = 'over'; clearInput(); sound('crash');
  if (settings.vibration && navigator.vibrate) navigator.vibrate([60, 40, 90]);
  const newBest = saveRun(); $('#result-eyebrow').textContent = newBest ? 'A NEW PERSONAL BEST' : 'A GOOD PLACE TO BEGIN AGAIN';
  $('#crash-reason').textContent = game.reason; $('#final-score').textContent = number(game.score);
  $('#final-mode').textContent = `${game.config.name} · ${game.pace === 1 ? 'Standard' : game.pace === 0.8 ? 'Easy' : 'Fast'} pace`;
  $('#final-berries').textContent = game.collected; $('#final-stage').textContent = game.level; $('#final-time').textContent = timeString(game.elapsed);
  showDialog('#gameover-dialog');
}
function goHome() {
  saveRun(); clearTimeout(countdownTimer); document.querySelectorAll('dialog[open]').forEach(d => d.close());
  mode = 'menu'; game = null; clearInput(); document.body.classList.remove('in-game');
  $('#menu-layer').hidden = false; $('#game-hud').hidden = true; $('#countdown').hidden = true; $('#launch-panel').hidden = false; $('#site-footer').hidden = false; $('#start-button').focus();
}
$('#pause-button').onclick = pause; $('#resume-button').onclick = resume; $('#home-button').onclick = $('#quit-button').onclick = goHome;
$('#pause-settings').onclick = () => { $('#pause-dialog').close(); showDialog('#settings-dialog'); };
$('.brand').onclick = event => { event.preventDefault(); if (mode === 'menu') window.scrollTo(0, 0); else pause(); };

const controlKeys = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'];
window.addEventListener('keydown', event => {
  if (event.target.matches('input, select, textarea')) return;
  const key = event.key.toLowerCase();
  if (controlKeys.includes(key) && ['playing', 'countdown'].includes(mode)) { event.preventDefault(); keys.add(key); }
  if ((key === 'escape' || key === 'p') && !event.repeat) {
    if (mode === 'playing' || mode === 'countdown') { event.preventDefault(); pause(); }
    else if (mode === 'paused' && $('#pause-dialog').open) { event.preventDefault(); resume(); }
  }
});
window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => { clearInput(); pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); pause(); } });
let pointerId = null;
function moveStick(event) {
  const rect = $('#joystick').getBoundingClientRect();
  const radius = rect.width * 0.32; let x = (event.clientX - rect.left - rect.width / 2) / radius, y = (event.clientY - rect.top - rect.height / 2) / radius;
  const len = Math.hypot(x, y); if (len > 1) { x /= len; y /= len; }
  stick.x = Math.abs(x) < 0.06 ? 0 : x; stick.y = Math.abs(y) < 0.06 ? 0 : y;
  $('#joystick-knob').style.transform = `translate(${x * radius}px, ${y * radius}px)`;
}
$('#joystick').addEventListener('pointerdown', event => { if (pointerId !== null) return; event.preventDefault(); pointerId = event.pointerId; $('#joystick').setPointerCapture(pointerId); moveStick(event); });
$('#joystick').addEventListener('pointermove', event => { if (event.pointerId === pointerId) moveStick(event); });
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('#joystick').addEventListener(type, event => { if (pointerId === event.pointerId) { pointerId = null; clearInput(); } });

const radar = $('#radar').getContext('2d');
function updateHud() {
  if (!game) return;
  $('#score').textContent = number(game.score); $('#score-best').textContent = `BEST ${number(Math.max(best(game.difficulty, game.pace), game.score))}`;
  $('#run-difficulty').textContent = `${game.config.name.toUpperCase()}${game.pace !== 1 ? ` · ${game.pace * 100}%` : ''}`;
  $('#stage').textContent = `STAGE ${String(game.level).padStart(2, '0')}`; $('#stage-progress').style.width = `${game.collected % 5 / 5 * 100}%`;
  $('#berries').textContent = String(game.collected).padStart(2, '0'); $('#length').textContent = `${game.length} m`;
  $('#speed').textContent = `${game.speed.toFixed(1)} m/s`; $('#timer').textContent = timeString(game.elapsed);
  const forward = new Vector3(0, 0, -1).applyQuaternion(game.orientation);
  let wallDistance = Infinity;
  for (const axis of ['x', 'y', 'z']) if (Math.abs(forward[axis]) > 0.001) wallDistance = Math.min(wallDistance, ((forward[axis] > 0 ? 59.4 : -59.4) - game.position[axis]) / forward[axis]);
  $('#wall-warning').hidden = wallDistance / game.speed > 2.1;
  const nearest = game.berries.reduce((a, b) => a.distanceToSquared(game.position) < b.distanceToSquared(game.position) ? a : b);
  const local = nearest.clone().sub(game.position).applyQuaternion(game.orientation.clone().invert());
  const width = $('#arena').clientWidth, height = $('#arena').clientHeight;
  const projected = nearest.clone().project(world.camera);
  let tx, ty;
  if (local.z < 0 && Math.abs(projected.x) < 0.83 && Math.abs(projected.y) < 0.72) { tx = projected.x * width / 2; ty = -projected.y * height / 2; }
  else {
    const direction = Math.atan2(-local.y || 0.001, local.x || 0.001);
    tx = Math.cos(direction) * width * 0.39; ty = Math.sin(direction) * height * 0.32;
  }
  $('#target-indicator').style.transform = `translate(${tx}px, ${ty}px)`;
  const heightDiff = nearest.y - game.position.y;
  $('#target-distance').textContent = `${Math.round(nearest.distanceTo(game.position))} m${local.z > 0 ? ' · behind' : ''}${Math.abs(heightDiff) > 5 ? heightDiff > 0 ? ' · higher' : ' · lower' : ''}`;
  radar.clearRect(0, 0, 240, 240); radar.fillStyle = '#102019aa'; radar.fillRect(0, 0, 240, 240);
  radar.strokeStyle = '#ffffff15'; radar.lineWidth = 1;
  for (let p = 0; p <= 240; p += 40) { radar.beginPath(); radar.moveTo(p, 0); radar.lineTo(p, 240); radar.moveTo(0, p); radar.lineTo(240, p); radar.stroke(); }
  const point = v => [(v.x + 60) * 2, (v.z + 60) * 2];
  radar.strokeStyle = settings.snakeColor || THEMES[settings.theme].snake; radar.lineWidth = 2; radar.beginPath();
  game.path.forEach((v, i) => { const [x, y] = point(v); if (i === 0) radar.moveTo(x, y); else radar.lineTo(x, y); }); radar.stroke();
  radar.fillStyle = THEMES[settings.theme].berry;
  game.berries.forEach(v => { radar.beginPath(); radar.arc(...point(v), 3.5, 0, Math.PI * 2); radar.fill(); });
  radar.save(); radar.translate(...point(game.position)); radar.rotate(Math.atan2(forward.x, -forward.z));
  radar.fillStyle = '#ffffff'; radar.beginPath(); radar.moveTo(0, -7); radar.lineTo(5, 5); radar.lineTo(0, 3); radar.lineTo(-5, 5); radar.closePath(); radar.fill(); radar.restore();
}

function frame(time) {
  requestAnimationFrame(frame);
  const dt = Math.min((time - (lastTime || time)) / 1000, 0.1); lastTime = time;
  if (!world || document.hidden) return;
  if (mode === 'playing') {
    input.x = (keys.has('arrowright') || keys.has('d') ? 1 : 0) - (keys.has('arrowleft') || keys.has('a') ? 1 : 0) + stick.x;
    input.y = (keys.has('arrowdown') || keys.has('s') ? 1 : 0) - (keys.has('arrowup') || keys.has('w') ? 1 : 0) + stick.y;
    accumulator += dt;
    while (accumulator >= 1 / 60 && mode === 'playing') {
      const events = game.step(1 / 60, input, settings.sensitivity); accumulator -= 1 / 60;
      for (const event of events) {
        if (event === 'crash') endRun();
        else if (event === 'level') { toast(`Stage ${game.level} · Higher stakes. Find your flow.`); sound('level'); }
        else if (event === 'berry') { sound('berry'); if (settings.vibration && navigator.vibrate) navigator.vibrate(15); }
      }
    }
  }
  world.render(game, time / 1000, mode === 'menu', settings.reducedMotion);
  hudTimer += dt; if (game && hudTimer > 0.08) { updateHud(); hudTimer = 0; }
}
requestAnimationFrame(frame);

window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; $('#install').hidden = false; });
$('#install').onclick = async () => { if (installPrompt) { await installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; $('#install').hidden = true; } };
window.addEventListener('appinstalled', () => { $('#install').hidden = true; toast('Verdant is ready on your home screen.'); });
function offlineReady() { $('#offline-status span').textContent = navigator.onLine ? 'Offline ready' : 'Playing offline'; $('#offline-status').classList.add('ready'); }
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  if (navigator.serviceWorker.controller) offlineReady();
  if (navigator.onLine || !navigator.serviceWorker.controller) navigator.serviceWorker.register('./sw.js').then(() => navigator.serviceWorker.ready).then(offlineReady).catch(() => {
    if (navigator.serviceWorker.controller) offlineReady();
    else $('#offline-status span').textContent = 'Offline setup unavailable';
  });
  navigator.serviceWorker.addEventListener('controllerchange', offlineReady);
}
window.addEventListener('online', () => { if (navigator.serviceWorker?.controller) offlineReady(); });
window.addEventListener('offline', () => { $('#offline-status span').textContent = navigator.serviceWorker?.controller ? 'Playing offline' : 'Offline'; });
if (!storageOK) toast('Storage unavailable. Settings and records may not persist.');

// Explicitly opt-in test diagnostics; normal installations expose no game state.
if (new URLSearchParams(location.search).has('test')) {
  window.__verdant = {
    get game() { return game; }, get mode() { return mode; }, get settings() { return { ...settings }; },
    get input() { return { ...input }; }, get stick() { return { ...stick }; },
    start: startRun, resume, pause,
    placeBerryAhead(distance = 4) { game.berries[0].copy(game.position).add(new Vector3(0, 0, -distance).applyQuaternion(game.orientation)); },
    nearWall() { game.position.set(0, 0, -58); game.orientation.identity(); game.path = [new Vector3(0, 0, -57), new Vector3(0, 0, -56)]; },
  };
}
