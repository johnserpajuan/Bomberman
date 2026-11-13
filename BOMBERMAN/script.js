(() => {
'use strict';

/* ==============================================================
   BOMBER MAN - game logic
   Requirements covered:
   - Start screen / Instructions .... #startScreen (HTML above)
   - Gameplay ....................... grid, bombs, blasts, monsters, power-ups
   - Player controls ................ keyboard, mouse + touch on-screen pad
   - Score system ................... addScore() + HUD
   - Game conditions ................ levelCleared() / hurtPlayer() / endGame()
   - Game over + Restart ............ #over overlay, startGame()
   - High score ..................... loadHighScore() / saveHighScore() with localStorage
   - Responsive design .............. CSS + canvas scales to any screen
   ============================================================== */

/* ---------- Settings ---------- */
const COLS = 13, ROWS = 11, T = 48;           // board size in tiles, tile size in px
const W = COLS * T, H = ROWS * T;
const EMPTY = 0, WALL = 1, BLOCK = 2;
const MAX_LEVEL = 3, START_LIVES = 3;
const FUSE = 2.2, FLAME_TIME = 0.5;           // seconds
const HS_KEY = 'bomberman_high_score';
const INK = '#22103d';
const DIRS = { up:{x:0,y:-1}, down:{x:0,y:1}, left:{x:-1,y:0}, right:{x:1,y:0} };
const DIR_LIST = Object.values(DIRS);
const KEYDIR = { ArrowUp:'up', KeyW:'up', ArrowDown:'down', KeyS:'down',
                 ArrowLeft:'left', KeyA:'left', ArrowRight:'right', KeyD:'right' };
const ENEMY_COLORS = ['#e8366d', '#8a5cff', '#ff9a1f'];
const POWER_COLORS = { B:'#3de0ff', R:'#ff6a4d', S:'#ffd21f' };
const POWER_LABELS = { B:'+Bomb', R:'+Blast', S:'+Speed' };

/* ---------- Elements ---------- */
const $ = s => document.querySelector(s);
const startScreen = $('#startScreen'), gameScreen = $('#gameScreen');
const overBox = $('#over'), overCard = $('#overCard'), toastEl = $('#toast');
const canvas = $('#game'), ctx = canvas.getContext('2d');
const dpr = Math.min(window.devicePixelRatio || 1, 2);   // keeps the canvas sharp on phones
canvas.width = W * dpr; canvas.height = H * dpr;

/* ---------- High score (localStorage, with a safe fallback) ---------- */
let memoryHS = 0;
function loadHighScore() {
  try {
    const v = parseInt(localStorage.getItem(HS_KEY), 10);
    return isNaN(v) ? 0 : v;
  } catch (e) { return memoryHS; }       // storage blocked: use memory only
}
function saveHighScore(v) {
  memoryHS = v;
  try { localStorage.setItem(HS_KEY, String(v)); } catch (e) { /* ignore */ }
}

/* ---------- Game state ---------- */
let state = 'menu';      // menu | playing | levelclear | over
let grid = [], bombs = [], flames = [], enemies = [], powerups = [], floaters = [];
let player = null;
let score = 0, lives = START_LIVES, level = 1, highScore = loadHighScore();
let shake = 0, clearTimer = 0, overAt = 0, time = 0, toastTimer = 0;
const held = [];         // directions currently held (last one pressed wins)

/* ---------- Sound (tiny WebAudio beeps, no files needed) ---------- */
let audio = null, soundOn = true;
function ensureAudio() {
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch (e) { audio = null; }
}
function beep(freq, dur, type = 'square', vol = 0.05, slide = 0) {
  if (!soundOn || !audio) return;
  const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(audio.destination);
  o.start(t); o.stop(t + dur);
}
function sfx(name) {
  switch (name) {
    case 'place': beep(220, .08, 'square', .05); break;
    case 'boom':  beep(140, .35, 'sawtooth', .08, -100); break;
    case 'kill':  beep(520, .15, 'square', .05, 300); break;
    case 'power': beep(660, .12, 'triangle', .07, 400); break;
    case 'hurt':  beep(220, .4, 'sawtooth', .07, -160); break;
    case 'win':   [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, .15, 'square', .05), i * 120)); break;
    case 'lose':  [392, 330, 262, 196].forEach((f, i) => setTimeout(() => beep(f, .2, 'square', .05), i * 170)); break;
  }
}

/* ---------- HUD + messages ---------- */
function updateHud() {
  $('#hudScore').textContent = score;
  $('#hudBest').textContent = Math.max(score, highScore);
  $('#hudLives').textContent = lives > 0 ? '\u2665'.repeat(lives) : '0';
  $('#hudLevel').textContent = level + '/' + MAX_LEVEL;
}
function toast(msg, ms = 1500) {
  clearTimeout(toastTimer);
  toastEl.textContent = msg;
  toastEl.classList.remove('show');
  void toastEl.offsetWidth;                     // restart the pop animation
  toastEl.classList.add('show');
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}
function addScore(n, x, y, text) {
  score += n;
  if (x !== undefined) floaters.push({ x, y, text: text || '+' + n, t: 0.9 });
  updateHud();
}

/* ---------- Screens ---------- */
function showMenu() {
  state = 'menu';
  held.length = 0;
  overBox.hidden = true;
  gameScreen.hidden = true;
  startScreen.hidden = false;
  $('#startBest').textContent = highScore;
  window.scrollTo(0, 0);
}
function startGame() {                           // used by Start AND Play again
  ensureAudio();
  score = 0; lives = START_LIVES; level = 1;
  player = { x:1, y:1, tx:1, ty:1, moving:false, dir:DIRS.down, invuln:0,
             speed:4, maxBombs:1, range:2 };
  startScreen.hidden = true;
  overBox.hidden = true;
  gameScreen.hidden = false;
  window.scrollTo(0, 0);
  buildLevel();
}

/* ---------- Level setup ---------- */
function buildLevel() {
  grid = [];
  for (let y = 0; y < ROWS; y++) {
    const row = [];
    for (let x = 0; x < COLS; x++) {
      if (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1) row.push(WALL);   // border
      else if (x % 2 === 0 && y % 2 === 0) row.push(WALL);                           // pillars
      else if (x + y <= 3) row.push(EMPTY);                                          // safe start corner
      else row.push(Math.random() < 0.6 ? BLOCK : EMPTY);                            // bricks
    }
    grid.push(row);
  }
  bombs = []; flames = []; powerups = []; floaters = []; enemies = [];

  player.x = player.tx = 1; player.y = player.ty = 1;
  player.moving = false; player.invuln = 1.5;

  const count = 2 + level;                       // 3, 4, 5 monsters
  let tries = 0;
  while (enemies.length < count && tries++ < 800) {
    const x = 1 + Math.floor(Math.random() * (COLS - 2));
    const y = 1 + Math.floor(Math.random() * (ROWS - 2));
    if (grid[y][x] === WALL || x + y < 10) continue;           // keep them away from the player
    if (enemies.some(e => e.x === x && e.y === y)) continue;
    grid[y][x] = EMPTY;
    enemies.push({ x, y, tx:x, ty:y, moving:false, dir:null, speed:1.6 + 0.35 * level });
  }
  state = 'playing';
  toast('Level ' + level);
  updateHud();
}

/* ---------- Movement helpers ---------- */
function canWalk(x, y, isPlayer) {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return false;
  if (grid[y][x] !== EMPTY) return false;
  for (const b of bombs) {
    if (b.x === x && b.y === y && (!isPlayer || b.solid)) return false;
  }
  return true;
}

// Moves an entity smoothly from tile to tile. chooseDir() is asked for the next direction.
function stepMover(e, dt, chooseDir) {
  let remaining = e.speed * dt;
  while (remaining > 0) {
    if (!e.moving) {
      const d = chooseDir(e);
      if (!d) break;
      e.tx = e.x + d.x; e.ty = e.y + d.y; e.dir = d; e.moving = true;
    }
    const len = Math.abs(e.tx - e.x) + Math.abs(e.ty - e.y);
    if (remaining >= len) {
      remaining -= len; e.x = e.tx; e.y = e.ty; e.moving = false;
    } else {
      e.x += Math.sign(e.tx - e.x) * remaining;
      e.y += Math.sign(e.ty - e.y) * remaining;
      remaining = 0;
    }
  }
}

function playerDir(p) {
  for (let i = held.length - 1; i >= 0; i--) {
    const d = DIRS[held[i]];
    if (canWalk(p.x + d.x, p.y + d.y, true)) return d;
  }
  return null;
}

function enemyDir(e) {
  const opts = DIR_LIST.filter(d => canWalk(e.x + d.x, e.y + d.y, false));
  if (!opts.length) return null;
  // Higher levels: sometimes head toward the player
  if (Math.random() < 0.12 * level) {
    const dist = d => Math.abs(e.x + d.x - player.x) + Math.abs(e.y + d.y - player.y);
    return opts.slice().sort((a, b) => dist(a) - dist(b))[0];
  }
  if (e.dir) {
    const straight = opts.find(d => d.x === e.dir.x && d.y === e.dir.y);
    if (straight && Math.random() < 0.75) return straight;
    const noBack = opts.filter(d => !(d.x === -e.dir.x && d.y === -e.dir.y));
    if (noBack.length) return noBack[Math.floor(Math.random() * noBack.length)];
  }
  return opts[Math.floor(Math.random() * opts.length)];
}

/* ---------- Bombs, blasts, power-ups ---------- */
function placeBomb() {
  if (state !== 'playing') return;
  const cx = Math.round(player.x), cy = Math.round(player.y);
  if (bombs.length >= player.maxBombs) return;
  if (bombs.some(b => b.x === cx && b.y === cy)) return;
  bombs.push({ x:cx, y:cy, timer:FUSE, range:player.range, solid:false, done:false });
  sfx('place');
}

function addFlame(x, y) { flames.push({ x, y, t:FLAME_TIME }); }

function explode(b) {
  b.done = true;
  sfx('boom');
  shake = Math.max(shake, 0.12);
  addFlame(b.x, b.y);
  for (const d of DIR_LIST) {
    for (let i = 1; i <= b.range; i++) {
      const x = b.x + d.x * i, y = b.y + d.y * i;
      const c = grid[y][x];
      if (c === WALL) break;                                   // pillars stop the blast
      if (c === BLOCK) {                                       // bricks break and stop the blast
        grid[y][x] = EMPTY;
        addScore(10);
        if (Math.random() < 0.28) {
          powerups.push({ x, y, type:['B', 'R', 'S'][Math.floor(Math.random() * 3)] });
        }
        addFlame(x, y);
        break;
      }
      addFlame(x, y);
      for (const o of bombs) if (!o.done && o.x === x && o.y === y) o.timer = 0;   // chain reaction
      powerups = powerups.filter(p => !(p.x === x && p.y === y));
    }
  }
}

function applyPower(type, x, y) {
  if (type === 'B') player.maxBombs = Math.min(5, player.maxBombs + 1);
  if (type === 'R') player.range = Math.min(7, player.range + 1);
  if (type === 'S') player.speed = Math.min(6.5, player.speed + 0.5);
  sfx('power');
  addScore(25, x, y, POWER_LABELS[type]);
}

/* ---------- Game conditions ---------- */
function hurtPlayer() {
  if (player.invuln > 0 || state !== 'playing') return;
  lives--;
  shake = 0.35;
  sfx('hurt');
  updateHud();
  if (lives <= 0) { endGame(false); return; }                  // LOSE
  player.x = player.tx = 1; player.y = player.ty = 1;
  player.moving = false; player.invuln = 2.2;
}

function levelCleared() {
  state = 'levelclear';
  clearTimer = 1.8;
  addScore(200);
  sfx('win');
  toast(level >= MAX_LEVEL ? 'All clear!' : 'Level ' + level + ' clear!', 1700);
}

function endGame(win) {                                        // WIN (finished all levels) or LOSE
  state = 'over';
  overAt = performance.now();
  held.length = 0;
  let bonus = 0;
  if (win && lives > 0) { bonus = lives * 100; addScore(bonus); }
  const record = score > highScore;
  if (record) { highScore = score; saveHighScore(score); }
  updateHud();

  overCard.className = 'over-card ' + (win ? 'win' : 'lose');
  $('#overTitle').textContent = win ? 'You win!' : 'Game over';
  $('#overMsg').textContent = win
    ? 'All ' + MAX_LEVEL + ' levels cleared' + (bonus ? ' (+' + bonus + ' for lives left).' : '.')
    : 'A monster got you on level ' + level + '.';
  $('#overScore').textContent = score;
  $('#overBest').textContent = highScore;
  $('#newRecord').hidden = !record;
  clearTimeout(toastTimer);
  toastEl.classList.remove('show');
  overBox.hidden = false;
  sfx(win ? 'win' : 'lose');
}

/* ---------- Update (runs every frame) ---------- */
function update(dt) {
  if (state === 'menu') return;
  time += dt;

  // visual effects keep running
  flames.forEach(f => f.t -= dt);
  flames = flames.filter(f => f.t > 0);
  floaters.forEach(f => f.t -= dt);
  floaters = floaters.filter(f => f.t > 0);
  shake = Math.max(0, shake - dt);
  if (state === 'over') return;

  // bombs tick down and explode (chain reactions repeat the loop)
  bombs.forEach(b => b.timer -= dt);
  let again = true;
  while (again) {
    again = false;
    for (const b of bombs) {
      if (!b.done && b.timer <= 0) { explode(b); again = true; }
    }
  }
  bombs = bombs.filter(b => !b.done);

  if (state === 'levelclear') {
    clearTimer -= dt;
    if (clearTimer <= 0) {
      if (level >= MAX_LEVEL) endGame(true);
      else { level++; buildLevel(); }
    }
    return;
  }

  // player
  player.invuln = Math.max(0, player.invuln - dt);
  stepMover(player, dt, playerDir);
  for (const b of bombs) {                       // a bomb becomes solid once the player has stepped off it
    if (!b.solid && (Math.abs(player.x - b.x) > 0.95 || Math.abs(player.y - b.y) > 0.95)) b.solid = true;
  }
  powerups = powerups.filter(p => {
    if (Math.abs(p.x - player.x) < 0.55 && Math.abs(p.y - player.y) < 0.55) {
      applyPower(p.type, p.x, p.y);
      return false;
    }
    return true;
  });

  // monsters
  for (const e of enemies) stepMover(e, dt, enemyDir);

  // blast damage
  for (const f of flames) {
    enemies = enemies.filter(e => {
      if (Math.round(e.x) === f.x && Math.round(e.y) === f.y) {
        addScore(100, e.x, e.y);
        sfx('kill');
        return false;
      }
      return true;
    });
    if (Math.round(player.x) === f.x && Math.round(player.y) === f.y) hurtPlayer();
  }
  if (state !== 'playing') return;

  // monster touches player
  if (player.invuln <= 0) {
    for (const e of enemies) {
      if (Math.hypot(e.x - player.x, e.y - player.y) < 0.6) { hurtPlayer(); break; }
    }
  }
  if (state === 'playing' && enemies.length === 0) levelCleared();   // WIN the level
}

/* ---------- Drawing ---------- */
function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function box(x, y, w, h, r, fill, stroke) {
  rr(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke(); }
}
function circ(x, y, r, fill, stroke) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke(); }
}
function shadow(cx, cy, rx) {
  ctx.fillStyle = 'rgba(34,16,61,.28)';
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, rx * 0.38, 0, 0, Math.PI * 2); ctx.fill();
}

function drawWall(px, py) {
  ctx.fillStyle = '#4a3d78'; ctx.fillRect(px, py, T, T);
  ctx.fillStyle = '#a594dc'; ctx.fillRect(px, py, T, 5); ctx.fillRect(px, py, 5, T);
  ctx.fillStyle = '#35295a'; ctx.fillRect(px, py + T - 5, T, 5); ctx.fillRect(px + T - 5, py, 5, T);
  ctx.fillStyle = '#6f5fae'; ctx.fillRect(px + 9, py + 9, T - 18, T - 18);
  ctx.fillStyle = '#8b7bc6'; ctx.fillRect(px + 9, py + 9, T - 18, 4);
}
function drawBlock(px, py) {
  ctx.fillStyle = '#e08a3c'; ctx.fillRect(px + 1, py + 1, T - 2, T - 2);
  ctx.fillStyle = '#f2ab5c'; ctx.fillRect(px + 1, py + 1, T - 2, 5);
  ctx.fillStyle = '#a85d22'; ctx.fillRect(px + 1, py + T - 6, T - 2, 5);
  ctx.strokeStyle = '#8a4a1a'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px + 1, py + T / 2); ctx.lineTo(px + T - 1, py + T / 2);
  ctx.moveTo(px + T / 2, py + 6); ctx.lineTo(px + T / 2, py + T / 2);
  ctx.moveTo(px + T / 4, py + T / 2); ctx.lineTo(px + T / 4, py + T - 6);
  ctx.moveTo(px + 3 * T / 4, py + T / 2); ctx.lineTo(px + 3 * T / 4, py + T - 6);
  ctx.stroke();
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(px + 1, py + 1, T - 2, T - 2);
}

function drawBomb(b) {
  const cx = b.x * T + T / 2, cy = b.y * T + T / 2 + 3;
  const pulse = 1 + 0.08 * Math.sin(time * (b.timer < 1 ? 24 : 10));
  const r = T * 0.34 * pulse;
  shadow(cx, cy + r * 0.85, r);
  const g = ctx.createRadialGradient(cx - r * .35, cy - r * .35, r * .1, cx, cy, r);
  g.addColorStop(0, '#8b7bc6'); g.addColorStop(.4, '#2b1a55'); g.addColorStop(1, '#120a2a');
  circ(cx, cy, r, g, true);
  if (b.timer < 0.7 && Math.floor(time * 12) % 2 === 0) circ(cx, cy, r, 'rgba(255,70,70,.5)');
  ctx.strokeStyle = '#f0d9a0'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(cx + r * .4, cy - r * .8);
  ctx.quadraticCurveTo(cx + r * .9, cy - r * 1.3, cx + r * .6, cy - r * 1.5); ctx.stroke();
  circ(cx + r * .6, cy - r * 1.5, 3 + Math.sin(time * 30) * 1.5, '#ffd21f');
}

function drawFlame(f) {
  const px = f.x * T, py = f.y * T;
  ctx.globalAlpha = Math.min(1, f.t / 0.25);
  box(px + 3, py + 3, T - 6, T - 6, 10, '#ff5a2c');
  box(px + 9, py + 9, T - 18, T - 18, 8, '#ffa21f');
  box(px + 16, py + 16, T - 32, T - 32, 5, '#fff3a8');
  ctx.globalAlpha = 1;
}

function drawPowerup(p) {
  const cx = p.x * T + T / 2, cy = p.y * T + T / 2 + Math.sin(time * 4 + p.x) * 2;
  box(cx - 15, cy - 15, 30, 30, 8, POWER_COLORS[p.type], true);
  ctx.fillStyle = INK; ctx.font = '900 18px "Arial Black",system-ui,sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(p.type, cx, cy + 1);
}

function drawEnemy(e) {
  const cx = e.x * T + T / 2, cy = e.y * T + T / 2 + Math.sin(time * 8 + e.tx * 3) * 1.5;
  const col = ENEMY_COLORS[(level - 1) % ENEMY_COLORS.length];
  shadow(cx, cy + 17, 15);
  box(cx - 16, cy - 15, 32, 32, 13, col, true);
  box(cx - 12, cy - 12, 13, 7, 4, 'rgba(255,255,255,.3)');
  const dx = e.dir ? e.dir.x * 2 : 0, dy = e.dir ? e.dir.y * 2 : 0;
  for (const s of [-1, 1]) {
    circ(cx + s * 7, cy - 2, 6, '#fff', true);
    circ(cx + s * 7 + dx, cy - 2 + dy, 2.8, INK);
  }
  ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 13, cy - 12); ctx.lineTo(cx - 3, cy - 8);
  ctx.moveTo(cx + 13, cy - 12); ctx.lineTo(cx + 3, cy - 8);
  ctx.stroke();
}

function drawPlayer() {
  if (player.invuln > 0 && Math.floor(time * 12) % 2 === 0) return;     // blink while protected
  const cx = player.x * T + T / 2, cy = player.y * T + T / 2 + 2;
  const dx = player.dir.x * 2, dy = player.dir.y * 2;
  shadow(cx, cy + 17, 14);
  box(cx - 12, cy + 2, 24, 16, 6, '#2f6bff', true);                    // suit
  ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx, cy - 18); ctx.lineTo(cx, cy - 23); ctx.stroke();   // antenna
  circ(cx, cy - 24, 3.5, '#e8366d', true);
  circ(cx, cy - 3, 15, '#fff', true);                                  // helmet
  box(cx - 10, cy - 9, 20, 14, 6, '#ffd7b8', true);                    // face
  circ(cx - 4 + dx, cy - 2 + dy, 2.2, INK);
  circ(cx + 4 + dx, cy - 2 + dy, 2.2, INK);
}

function drawFloaters() {
  ctx.font = '900 16px "Arial Black",system-ui,sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.strokeStyle = INK; ctx.fillStyle = '#fff';
  for (const f of floaters) {
    const x = f.x * T + T / 2, y = f.y * T + T / 2 - (0.9 - f.t) * 34;
    ctx.globalAlpha = Math.min(1, f.t * 2.5);
    ctx.strokeText(f.text, x, y); ctx.fillText(f.text, x, y);
  }
  ctx.globalAlpha = 1;
}

function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (state === 'menu' || !grid.length) return;
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - .5) * 14 * shake, (Math.random() - .5) * 14 * shake);

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const px = x * T, py = y * T, c = grid[y][x];
      ctx.fillStyle = (x + y) % 2 ? '#58c26a' : '#4fb862';
      ctx.fillRect(px, py, T, T);
      if (c === WALL) drawWall(px, py);
      else if (c === BLOCK) drawBlock(px, py);
      else if (y > 0 && grid[y - 1][x] !== EMPTY) {          // soft shadow under walls and bricks
        ctx.fillStyle = 'rgba(34,16,61,.16)'; ctx.fillRect(px, py, T, 9);
      }
    }
  }
  powerups.forEach(drawPowerup);
  bombs.forEach(drawBomb);
  flames.forEach(drawFlame);
  enemies.forEach(drawEnemy);
  drawPlayer();
  drawFloaters();
  ctx.restore();
}

/* ---------- Main loop ---------- */
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

/* ---------- Input: keyboard ---------- */
function pressDir(d) { if (!held.includes(d)) held.push(d); }
function releaseDir(d) { const i = held.indexOf(d); if (i > -1) held.splice(i, 1); }

window.addEventListener('keydown', e => {
  const d = KEYDIR[e.code];
  if (d && state !== 'menu') { e.preventDefault(); pressDir(d); return; }
  if (e.code === 'Space' && (state === 'playing' || state === 'levelclear')) {
    e.preventDefault();
    if (!e.repeat) placeBomb();
    return;
  }
  if (e.code === 'Enter' && e.target.tagName !== 'BUTTON') {
    if (state === 'menu') startGame();
    else if (state === 'over' && performance.now() - overAt > 700) startGame();
  }
});
window.addEventListener('keyup', e => { const d = KEYDIR[e.code]; if (d) releaseDir(d); });
window.addEventListener('blur', () => { held.length = 0; });

/* ---------- Input: on-screen pad (touch + mouse) ---------- */
document.querySelectorAll('[data-dir]').forEach(btn => {
  const d = btn.dataset.dir;
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    try { btn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    pressDir(d); btn.classList.add('active');
  });
  const release = () => { releaseDir(d); btn.classList.remove('active'); };
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => btn.addEventListener(ev, release));
  btn.addEventListener('contextmenu', e => e.preventDefault());
});
const bombBtn = $('#bombBtn');
bombBtn.addEventListener('pointerdown', e => { e.preventDefault(); bombBtn.classList.add('active'); placeBomb(); });
['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => bombBtn.addEventListener(ev, () => bombBtn.classList.remove('active')));
bombBtn.addEventListener('contextmenu', e => e.preventDefault());

/* ---------- Buttons ---------- */
$('#startBtn').addEventListener('click', startGame);
$('#restartBtn').addEventListener('click', startGame);
$('#menuBtn').addEventListener('click', showMenu);
$('#muteBtn').addEventListener('click', e => {
  soundOn = !soundOn;
  e.currentTarget.textContent = soundOn ? '\uD83D\uDD0A' : '\uD83D\uDD07';
  e.currentTarget.setAttribute('aria-label', soundOn ? 'Turn sound off' : 'Turn sound on');
});

/* ---------- Go ---------- */
showMenu();
requestAnimationFrame(frame);
})();

