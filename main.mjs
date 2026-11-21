import {
  COLS, ROWS, TOWERS, ENEMIES, TARGETS, MAX_LEVEL, createGame, placeTower, upgradeTower, sellTower,
  startWave, update, choosePerk, canBuild, stats, towerCost, upgradeCost, nextWave, PERKS, rng,
} from './game.mjs';
import { unlock, play, setMuted, isMuted } from './audio.mjs';

const CELL = 48, BW = COLS * CELL, BH = ROWS * CELL;
const $ = (id) => document.getElementById(id);
const canvas = $('board'), ctx = canvas.getContext('2d');
const dpr = Math.min(2, devicePixelRatio || 1);
canvas.width = BW * dpr; canvas.height = BH * dpr;
ctx.scale(dpr, dpr);

let g, deco, tool = null, selected = null, hover = null, fast = false, floats = [], started = false;
const BEST_KEY = 'turmwacht.best.v1';
const readBest = () => { try { return +localStorage.getItem(BEST_KEY) || 0; } catch { return 0; } };
const writeBest = (v) => { try { localStorage.setItem(BEST_KEY, String(v)); } catch { /* Rekord nur für diese Sitzung */ } };

function newGame(seed = (Math.random() * 1e9) | 0) {
  g = createGame(seed);
  tool = null; selected = null; floats = [];
  // Deko: Grasflecken und Steine, rein optisch
  const r = rng(seed ^ 0x5eed);
  deco = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (g.onPath.has(y * COLS + x)) continue;
    deco.push({ x, y, tone: r(), tuft: r() < 0.35 ? [r(), r()] : null, stone: r() < 0.06 ? [r(), r(), r()] : null });
  }
  syncUI();
}

// ---------- UI ----------
const shop = $('shop');
const order = ['arrow', 'cannon', 'frost', 'tesla'];
order.forEach((type, i) => {
  const t = TOWERS[type];
  const b = document.createElement('button');
  b.type = 'button'; b.dataset.type = type; b.setAttribute('aria-pressed', 'false');
  b.innerHTML = `<canvas class="ico" width="52" height="52" aria-hidden="true"></canvas><span><b>${t.name}</b> <kbd>${i + 1}</kbd><small>${t.desc}</small></span><span class="price"></span>`;
  b.addEventListener('click', () => { unlock(); setTool(tool === type ? null : type); });
  shop.append(b);
  const ic = b.querySelector('canvas').getContext('2d');
  ic.scale(52 / CELL, 52 / CELL);
  drawTower(ic, { type, level: 1, angle: -Math.PI / 4, x: 0, y: 0 }, 0, 0);
});

for (const [k, label] of Object.entries(TARGETS)) {
  const b = document.createElement('button');
  b.type = 'button'; b.dataset.target = k; b.textContent = label;
  b.addEventListener('click', () => { if (selected) { selected.target = k; syncUI(); } });
  $('targets').append(b);
}

function setTool(t) { tool = t; if (t) selected = null; syncUI(); }

function syncUI() {
  $('hWave').textContent = g.wave;
  $('hGold').textContent = g.gold;
  $('hLives').textContent = g.lives;
  const best = readBest();
  $('hBest').textContent = best || '–';
  for (const b of shop.children) {
    const type = b.dataset.type, cost = towerCost(g, type);
    b.querySelector('.price').textContent = cost;
    b.classList.toggle('poor', g.gold < cost);
    b.setAttribute('aria-pressed', String(tool === type));
  }
  const next = $('next');
  next.disabled = g.waveActive || g.over || !!g.perkChoice;
  next.firstChild.textContent = g.over ? 'Spiel vorbei ' : g.waveActive ? `Welle ${g.wave} läuft ` : `Welle ${g.wave + 1} starten `;
  if (selected && !g.towers.includes(selected)) selected = null;
  $('selPanel').hidden = !selected;
  if (selected) {
    const s = stats(g, selected), T = TOWERS[selected.type];
    $('selTitle').textContent = `${T.name} · Stufe ${selected.level}`;
    const rows = [['Schaden', s.dmg.toFixed(0)], ['Reichweite', s.range.toFixed(1)], ['Takt', `${s.rate.toFixed(2)} s`]];
    if (s.splash) rows.push(['Radius', s.splash.toFixed(2)]);
    if (s.slow) rows.push(['Bremse', `${Math.round(s.slow * 100)} %`]);
    if (s.chain) rows.push(['Sprünge', s.chain]);
    $('selStats').innerHTML = rows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
    const uc = upgradeCost(g, selected);
    const up = $('upgrade');
    up.textContent = selected.level >= MAX_LEVEL ? 'Maximal' : `Ausbauen (${uc})`;
    up.disabled = selected.level >= MAX_LEVEL || g.gold < uc;
    $('sell').textContent = `Verkaufen (+${Math.floor(selected.spent * 0.7)})`;
    $('targets').hidden = selected.type === 'frost';
    for (const b of $('targets').children) b.setAttribute('aria-pressed', String(b.dataset.target === selected.target));
  }
  const counts = {};
  for (const k of nextWave(g)) counts[k] = (counts[k] ?? 0) + 1;
  $('preview').textContent = g.over ? '–' : Object.entries(counts).map(([k, n]) => `${n}× ${ENEMIES[k].name}`).join(', ');
  const owned = Object.entries(g.perks);
  $('perkList').hidden = !owned.length;
  $('perks').innerHTML = owned.map(([id, n]) => `<li>${PERKS.find((p) => p.id === id).name}${n > 1 ? ` ×${n}` : ''}</li>`).join('');
}

let msgTimer;
function say(t, ok = false) { $('msg').textContent = t; $('msg').classList.toggle('ok', ok); clearTimeout(msgTimer); msgTimer = setTimeout(() => ($('msg').textContent = ''), 2500); }

$('next').addEventListener('click', () => { unlock(); if (startWave(g)) { play('wave'); syncUI(); } });
$('upgrade').addEventListener('click', doUpgrade);
$('sell').addEventListener('click', doSell);
$('speed').addEventListener('click', toggleSpeed);
$('mute').addEventListener('click', toggleMute);

function doUpgrade() {
  if (!selected) return;
  const r = upgradeTower(g, selected.id);
  if (r.ok) play('upgrade'); else { play('error'); say(r.why); }
  syncUI();
}
function doSell() {
  if (!selected) return;
  const r = sellTower(g, selected.id);
  if (r.ok) { play('sell'); floats.push({ x: selected.x + 0.5, y: selected.y + 0.3, text: `+${r.refund}`, t: 0 }); selected = null; }
  syncUI();
}
function toggleSpeed() { fast = !fast; $('speed').setAttribute('aria-pressed', String(fast)); }
function toggleMute() { setMuted(!isMuted()); $('mute').setAttribute('aria-pressed', String(isMuted())); $('mute').textContent = isMuted() ? 'Ton an' : 'Ton aus'; }

function cellFromEvent(e) {
  const r = canvas.getBoundingClientRect();
  return [Math.floor(((e.clientX - r.left) / r.width) * COLS), Math.floor(((e.clientY - r.top) / r.height) * ROWS)];
}
canvas.addEventListener('pointermove', (e) => { hover = cellFromEvent(e); });
canvas.addEventListener('pointerleave', () => { hover = null; });
canvas.addEventListener('click', (e) => {
  unlock();
  const [x, y] = cellFromEvent(e);
  const tower = g.towers.find((t) => t.x === x && t.y === y);
  if (tower) { selected = tower; tool = null; syncUI(); return; }
  if (tool) {
    const r = placeTower(g, tool, x, y);
    if (r.ok) { play('build'); if (g.gold < towerCost(g, tool)) tool = null; }
    else { play('error'); say(r.why); }
  } else selected = null;
  syncUI();
});

addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (!$('overlay').hidden) {
    if ((e.key === 'Enter' || e.key === ' ') && overlayAction) { e.preventDefault(); overlayAction(); }
    return;
  }
  const n = '1234'.indexOf(e.key);
  if (n >= 0) { unlock(); setTool(tool === order[n] ? null : order[n]); }
  else if (e.key === ' ') { e.preventDefault(); $('next').click(); }
  else if (e.key === 'Escape') { tool = null; selected = null; syncUI(); }
  else if (e.key.toLowerCase() === 'u') doUpgrade();
  else if (e.key.toLowerCase() === 's') doSell();
  else if (e.key.toLowerCase() === 'f') toggleSpeed();
  else if (e.key.toLowerCase() === 'm') toggleMute();
});

// ---------- Overlays ----------
let overlayAction = null;
function showOverlay(html, action) {
  const o = $('overlay');
  o.innerHTML = `<div class="card">${html}</div>`;
  o.hidden = false;
  overlayAction = action;
  o.querySelector('button')?.focus();
}
function hideOverlay() { $('overlay').hidden = true; overlayAction = null; canvas.focus?.(); }

function showStart() {
  showOverlay(`<h3>Turmwacht</h3><p>Jede Karte ist neu. Bau Türme neben den Weg, starte die Wellen und such dir alle fünf Wellen einen Segen aus. Wie weit kommst du?</p>
    <button class="primary" id="go" type="button">Los geht's</button>`, begin);
  $('go').addEventListener('click', begin);
}
function begin() { unlock(); started = true; hideOverlay(); }

function showPerks() {
  showOverlay(`<h3>Welle ${g.wave} geschafft</h3><p>Wähle einen Segen für den Rest der Partie.</p>
    <div class="perk-pick">${g.perkChoice.map((p) => `<button type="button" data-id="${p.id}"><b>${p.name}</b><span>${p.desc}</span></button>`).join('')}</div>`, null);
  for (const b of $('overlay').querySelectorAll('[data-id]')) b.addEventListener('click', () => {
    choosePerk(g, b.dataset.id); play('upgrade'); hideOverlay(); syncUI();
  });
}

function showOver() {
  const best = readBest(), reached = g.wave - 1;
  const record = reached > best;
  if (record) writeBest(reached);
  showOverlay(`<h3>${record ? 'Neuer Rekord!' : 'Die Wacht ist gefallen'}</h3>
    <p>Du hast ${reached} ${reached === 1 ? 'Welle' : 'Wellen'} gehalten und ${g.kills} Gegner besiegt.</p>
    <div class="row2"><button class="primary" id="again" type="button">Neue Karte</button><button id="same" type="button">Gleiche Karte</button></div>`, () => { newGame(); hideOverlay(); });
  $('again').addEventListener('click', () => { newGame(); hideOverlay(); });
  $('same').addEventListener('click', () => { newGame(g.seed); hideOverlay(); });
  syncUI();
}

// ---------- Zeichnen ----------
function drawBoard() {
  ctx.fillStyle = 'hsl(78 28% 64%)';
  ctx.fillRect(0, 0, BW, BH);
  for (const d of deco) {
    const l = 62 + d.tone * 5;
    ctx.fillStyle = `hsl(78 28% ${l}%)`;
    ctx.fillRect(d.x * CELL, d.y * CELL, CELL, CELL);
    if (d.tuft) {
      ctx.strokeStyle = 'hsl(80 30% 48%)'; ctx.lineWidth = 1.5;
      const tx = d.x * CELL + 10 + d.tuft[0] * 28, ty = d.y * CELL + 14 + d.tuft[1] * 24;
      ctx.beginPath(); ctx.moveTo(tx - 3, ty + 4); ctx.lineTo(tx - 1, ty - 2); ctx.moveTo(tx, ty + 4); ctx.lineTo(tx + 1, ty - 4); ctx.moveTo(tx + 3, ty + 4); ctx.lineTo(tx + 4, ty - 1); ctx.stroke();
    }
    if (d.stone) {
      ctx.fillStyle = 'hsl(40 8% 62%)';
      ctx.beginPath(); ctx.ellipse(d.x * CELL + 8 + d.stone[0] * 30, d.y * CELL + 10 + d.stone[1] * 28, 3 + d.stone[2] * 3, 2 + d.stone[2] * 2, 0, 0, 7); ctx.fill();
    }
  }
  // Weg als durchgehende Linie mit runden Kanten
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const tracePath = () => { ctx.beginPath(); g.path.forEach(([x, y], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, (x + 0.5) * CELL, (y + 0.5) * CELL)); };
  tracePath(); ctx.strokeStyle = 'hsl(38 30% 58%)'; ctx.lineWidth = CELL * 0.86; ctx.stroke();
  tracePath(); ctx.strokeStyle = 'hsl(40 45% 76%)'; ctx.lineWidth = CELL * 0.74; ctx.stroke();
  // Start und Ziel
  const [sx, sy] = g.path[0], [ex, ey] = g.path.at(-1);
  ctx.fillStyle = 'hsl(0 0% 100% / 0.6)';
  ctx.beginPath(); ctx.arc((sx + 0.5) * CELL, (sy + 0.5) * CELL, 9, 0, 7); ctx.fill();
  drawKeep((ex + 0.5) * CELL, (ey + 0.5) * CELL);
}

function drawKeep(x, y) {
  ctx.fillStyle = '#6b6152';
  ctx.fillRect(x - 15, y - 14, 30, 28);
  ctx.fillStyle = '#4e463b';
  for (let i = 0; i < 4; i++) ctx.fillRect(x - 15 + i * 8.5, y - 20, 5, 7);
  ctx.fillStyle = '#2f2a24';
  ctx.beginPath(); ctx.arc(x, y + 14, 6, Math.PI, 0); ctx.fill();
  ctx.fillStyle = g.lives > 6 ? '#c9a227' : '#b4442f';
  ctx.fillRect(x - 1, y - 32, 2, 13);
  ctx.beginPath(); ctx.moveTo(x + 1, y - 32); ctx.lineTo(x + 11, y - 28); ctx.lineTo(x + 1, y - 24); ctx.fill();
}

function drawTower(c, t, px, py) {
  const cx = px + CELL / 2, cy = py + CELL / 2;
  c.fillStyle = 'rgb(0 0 0 / 0.18)';
  c.beginPath(); c.ellipse(cx + 2, cy + 4, 18, 14, 0, 0, 7); c.fill();
  c.fillStyle = '#e7e2d3';
  roundRect(c, cx - 17, cy - 17, 34, 34, 7); c.fill();
  c.strokeStyle = '#a69f8c'; c.lineWidth = 1.5; c.stroke();
  const col = TOWERS[t.type].color;
  c.save(); c.translate(cx, cy);
  if (t.type === 'arrow') {
    c.rotate(t.angle);
    c.fillStyle = col; c.beginPath(); c.arc(0, 0, 10, 0, 7); c.fill();
    c.strokeStyle = '#3d4a1c'; c.lineWidth = 3; c.beginPath(); c.arc(-2, 0, 11, -1.1, 1.1); c.stroke();
    c.lineWidth = 2; c.beginPath(); c.moveTo(-4, 0); c.lineTo(15, 0); c.stroke();
  } else if (t.type === 'cannon') {
    c.rotate(t.angle);
    c.fillStyle = '#3c3f44'; roundRect(c, 0, -5, 19, 10, 3); c.fill();
    c.fillStyle = col; c.beginPath(); c.arc(0, 0, 11, 0, 7); c.fill();
  } else if (t.type === 'frost') {
    c.fillStyle = col;
    c.beginPath(); c.moveTo(0, -14); c.lineTo(9, 0); c.lineTo(0, 14); c.lineTo(-9, 0); c.closePath(); c.fill();
    c.fillStyle = '#d6eef8'; c.beginPath(); c.moveTo(0, -8); c.lineTo(4, 0); c.lineTo(0, 8); c.lineTo(-4, 0); c.closePath(); c.fill();
  } else if (t.type === 'tesla') {
    c.fillStyle = '#5b5040'; c.fillRect(-5, -6, 10, 16);
    c.strokeStyle = col; c.lineWidth = 2;
    for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(0, 6 - i * 5, 8, 2.5, 0, 0, 7); c.stroke(); }
    c.fillStyle = col; c.beginPath(); c.arc(0, -10, 5, 0, 7); c.fill();
  }
  c.restore();
  // Stufenpunkte
  for (let i = 0; i < t.level; i++) {
    c.fillStyle = '#5d7a2e';
    c.beginPath(); c.arc(cx - 8 + i * 8, cy + 21, 2.6, 0, 7); c.fill();
  }
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

function drawEnemy(en) {
  const E = ENEMIES[en.k], x = en.x * CELL, y = en.y * CELL, r = E.r * CELL;
  const slowed = en.slowUntil > g.time;
  if (en.fly) {
    ctx.fillStyle = 'rgb(0 0 0 / 0.15)';
    ctx.beginPath(); ctx.ellipse(x + 6, y + 14, r, r * 0.5, 0, 0, 7); ctx.fill();
    const flap = Math.sin(g.time * 18 + en.id) * 0.5;
    ctx.fillStyle = '#c9b8e0';
    ctx.beginPath(); ctx.ellipse(x - r * 0.9, y - 2, r * 0.9, r * (0.35 + flap * 0.2), -0.4, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + r * 0.9, y - 2, r * 0.9, r * (0.35 + flap * 0.2), 0.4, 0, 7); ctx.fill();
  } else {
    ctx.fillStyle = 'rgb(0 0 0 / 0.18)';
    ctx.beginPath(); ctx.ellipse(x + 2, y + r * 0.7, r, r * 0.45, 0, 0, 7); ctx.fill();
  }
  ctx.fillStyle = E.color;
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  if (E.armor) { ctx.strokeStyle = '#2a2d26'; ctx.lineWidth = 3; ctx.stroke(); }
  if (E.heal) { ctx.fillStyle = '#fff'; ctx.fillRect(x - 2, y - 6, 4, 12); ctx.fillRect(x - 6, y - 2, 12, 4); }
  if (E.split) { ctx.strokeStyle = 'rgb(255 255 255 / 0.7)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - r * 0.6, y); ctx.lineTo(x + r * 0.6, y); ctx.moveTo(x, y - r * 0.6); ctx.lineTo(x, y + r * 0.6); ctx.stroke(); }
  if (en.k === 'boss') { ctx.fillStyle = '#c9a227'; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(x + i * 8 - 4, y - r + 3); ctx.lineTo(x + i * 8, y - r - 8); ctx.lineTo(x + i * 8 + 4, y - r + 3); ctx.fill(); } }
  // Augen in Laufrichtung
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(x + r * 0.3, y - r * 0.25, Math.max(1.6, r * 0.18), 0, 7); ctx.arc(x - r * 0.15, y - r * 0.25, Math.max(1.6, r * 0.18), 0, 7); ctx.fill();
  if (slowed) { ctx.strokeStyle = '#7cc3e6'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + 3, 0, 7); ctx.stroke(); }
  if (en.hp < en.max) {
    const w = Math.max(18, r * 2);
    ctx.fillStyle = 'rgb(0 0 0 / 0.45)'; ctx.fillRect(x - w / 2, y - r - 9, w, 4);
    ctx.fillStyle = en.hp / en.max > 0.4 ? '#7dbb3c' : '#d9622b';
    ctx.fillRect(x - w / 2, y - r - 9, (w * Math.max(0, en.hp)) / en.max, 4);
  }
}

function drawEffects() {
  for (const fx of g.effects) {
    const p = fx.t / fx.life, a = 1 - p;
    if (fx.type === 'line') {
      ctx.strokeStyle = `rgb(61 74 28 / ${a})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(fx.x * CELL, fx.y * CELL); ctx.lineTo(fx.x2 * CELL, fx.y2 * CELL); ctx.stroke();
    } else if (fx.type === 'boom') {
      ctx.fillStyle = `rgb(240 160 60 / ${a * 0.55})`;
      ctx.beginPath(); ctx.arc(fx.x * CELL, fx.y * CELL, fx.r * CELL * (0.4 + p * 0.6), 0, 7); ctx.fill();
      ctx.strokeStyle = `rgb(90 70 50 / ${a})`; ctx.lineWidth = 2; ctx.stroke();
    } else if (fx.type === 'ring') {
      ctx.strokeStyle = `rgb(124 195 230 / ${a})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(fx.x * CELL, fx.y * CELL, fx.r * CELL * (0.3 + p * 0.7), 0, 7); ctx.stroke();
    } else if (fx.type === 'zap') {
      ctx.strokeStyle = `rgb(250 230 120 / ${a})`; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(fx.x * CELL, fx.y * CELL);
      const segs = 5;
      for (let i = 1; i < segs; i++) {
        const k = i / segs;
        ctx.lineTo((fx.x + (fx.x2 - fx.x) * k) * CELL + (Math.random() - 0.5) * 10, (fx.y + (fx.y2 - fx.y) * k) * CELL + (Math.random() - 0.5) * 10);
      }
      ctx.lineTo(fx.x2 * CELL, fx.y2 * CELL); ctx.stroke();
    }
  }
}

function drawRange(cx, cy, range, ok) {
  ctx.fillStyle = ok ? 'rgb(255 255 255 / 0.18)' : 'rgb(180 68 47 / 0.15)';
  ctx.strokeStyle = ok ? 'rgb(255 255 255 / 0.7)' : 'rgb(180 68 47 / 0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc((cx + 0.5) * CELL, (cy + 0.5) * CELL, range * CELL, 0, 7); ctx.fill(); ctx.stroke();
}

function render() {
  drawBoard();
  if (selected) drawRange(selected.x, selected.y, stats(g, selected).range, true);
  for (const t of g.towers) drawTower(ctx, t, t.x * CELL, t.y * CELL);
  if (selected) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; roundRect(ctx, selected.x * CELL + 3, selected.y * CELL + 3, CELL - 6, CELL - 6, 8); ctx.stroke(); }
  for (const en of g.enemies) if (!en.fly) drawEnemy(en);
  for (const en of g.enemies) if (en.fly) drawEnemy(en);
  drawEffects();
  if (tool && hover) {
    const [x, y] = hover, ok = canBuild(g, x, y) && g.gold >= towerCost(g, tool);
    drawRange(x, y, stats(g, { type: tool, level: 1 }).range, ok);
    ctx.globalAlpha = 0.6; drawTower(ctx, { type: tool, level: 1, angle: 0 }, x * CELL, y * CELL); ctx.globalAlpha = 1;
  }
  ctx.font = '600 14px ui-sans-serif, system-ui, sans-serif'; ctx.textAlign = 'center';
  for (const f of floats) {
    ctx.fillStyle = `rgb(120 90 10 / ${1 - f.t})`;
    ctx.fillText(f.text, f.x * CELL, f.y * CELL - f.t * 24);
  }
}

// ---------- Schleife ----------
const DT = 1 / 60;
let acc = 0, last = performance.now(), uiTimer = 0;
function frame(now) {
  const elapsed = Math.min(0.1, (now - last) / 1000);
  last = now;
  const paused = !started || !$('overlay').hidden || document.hidden;
  if (!paused) {
    acc += elapsed * (fast ? 2 : 1);
    while (acc >= DT) {
      acc -= DT;
      for (const ev of update(g, DT)) handle(ev);
    }
  } else acc = 0;
  for (const f of floats) f.t += elapsed;
  floats = floats.filter((f) => f.t < 1);
  render();
  if ((uiTimer += elapsed) > 0.15) { uiTimer = 0; syncUI(); }
  requestAnimationFrame(frame);
}

function handle(ev) {
  switch (ev.type) {
    case 'arrow': case 'cannon': case 'frost': case 'tesla': play(ev.type); break;
    case 'kill': play('kill'); floats.push({ x: ev.x, y: ev.y - 0.3, text: `+${ev.gold}`, t: 0 }); break;
    case 'leak': play('leak'); break;
    case 'waveDone': play('waveDone'); say(`Welle geschafft: +${ev.bonus} Gold${ev.interest ? `, +${ev.interest} Zinsen` : ''}`, true); syncUI(); break;
    case 'perk': play('perk'); showPerks(); break;
    case 'over': play('over'); showOver(); break;
  }
}

// ?seed=123 spielt eine bestimmte Karte (zum Teilen und für Tests)
const urlSeed = Number.parseInt(new URLSearchParams(location.search).get('seed'), 10);
newGame(Number.isFinite(urlSeed) ? urlSeed : undefined);
showStart();
requestAnimationFrame(frame);
