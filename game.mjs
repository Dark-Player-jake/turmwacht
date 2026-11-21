// Spiellogik ohne DOM. Zeit in Sekunden, Positionen in Zellen (Zellmitte = x + 0.5).

export const COLS = 20, ROWS = 12;

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const TOWERS = {
  arrow: { name: 'Bogen', cost: 50, range: 2.6, dmg: 9, rate: 0.5, air: true, color: '#7a8f3a',
    desc: 'Schnell, ein Ziel. Schwach gegen Panzer.' },
  cannon: { name: 'Kanone', cost: 90, range: 2.3, dmg: 22, rate: 1.4, splash: 0.95, air: false, color: '#5b5f66',
    desc: 'Flächenschaden. Trifft keine Flieger.' },
  frost: { name: 'Frost', cost: 70, range: 2.2, dmg: 3, rate: 0.8, slow: 0.4, slowTime: 1.6, air: true, color: '#4f9cc4',
    desc: 'Verlangsamt Gegner im Umkreis.' },
  tesla: { name: 'Blitz', cost: 120, range: 2.4, dmg: 15, rate: 1.1, chain: 3, air: true, pierce: true, color: '#c9a227',
    desc: 'Springt auf mehrere Ziele, ignoriert Panzerung.' },
};
export const UPGRADE_COST = [0.8, 1.6, 3]; // Faktor auf den Grundpreis je Stufe
export const MAX_LEVEL = 3;

export const ENEMIES = {
  runner: { name: 'Läufer', hp: 28, speed: 2.2, gold: 4, cost: 2, from: 1, r: 0.22, color: '#d9822b' },
  grunt: { name: 'Fußvolk', hp: 60, speed: 1.3, gold: 5, cost: 3, from: 1, r: 0.27, color: '#a0522d' },
  swarm: { name: 'Schwarm', hp: 14, speed: 1.8, gold: 1, cost: 1, from: 3, r: 0.16, color: '#b5651d' },
  flyer: { name: 'Flieger', hp: 45, speed: 1.5, gold: 7, cost: 4, from: 6, r: 0.24, fly: true, color: '#8e6bbf' },
  tank: { name: 'Panzer', hp: 160, speed: 0.8, armor: 4, gold: 14, cost: 9, from: 6, r: 0.34, color: '#555b4e' },
  healer: { name: 'Heiler', hp: 80, speed: 1.1, heal: 5, gold: 11, cost: 7, from: 8, r: 0.27, color: '#3f9a6b' },
  splitter: { name: 'Teiler', hp: 100, speed: 1.0, split: 3, gold: 7, cost: 7, from: 10, r: 0.3, color: '#b3446c' },
  boss: { name: 'Koloss', hp: 650, speed: 0.55, armor: 6, gold: 120, cost: 0, from: 10, r: 0.46, color: '#3a2f3f' },
};

export const PERKS = [
  { id: 'sharp', name: 'Scharfe Spitzen', desc: 'Bögen +35 % Schaden' },
  { id: 'powder', name: 'Schweres Pulver', desc: 'Kanonen +40 % Explosionsradius' },
  { id: 'permafrost', name: 'Permafrost', desc: 'Frost verlangsamt 15 % stärker und länger' },
  { id: 'overload', name: 'Überladung', desc: 'Blitze springen auf 2 Ziele mehr' },
  { id: 'interest', name: 'Zinsen', desc: 'Nach jeder Welle 6 % Zinsen auf dein Gold (max. 60)' },
  { id: 'bounty', name: 'Kopfgeld', desc: '+30 % Gold pro Abschuss' },
  { id: 'walls', name: 'Mauerwerk', desc: '+6 Leben' },
  { id: 'sight', name: 'Weitblick', desc: 'Alle Türme +12 % Reichweite' },
  { id: 'discount', name: 'Handwerk', desc: 'Türme und Ausbauten 15 % billiger' },
];

// Pfad: Wegpunkte mit steigender Spalte, verbunden durch L-Stücke. Spaltenabstand ≥ 3,
// damit sich Pfadteile nie berühren und dazwischen Bauplatz bleibt.
export function makePath(r) {
  const cells = [];
  let x = 0, y = 2 + Math.floor(r() * (ROWS - 4));
  const push = (cx, cy) => cells.push([cx, cy]);
  push(x, y);
  while (x < COLS - 1) {
    const nx = Math.min(COLS - 1, x + 3 + Math.floor(r() * 3));
    while (x < nx) push(++x, y);
    if (x >= COLS - 1) break;
    let ny;
    do ny = 1 + Math.floor(r() * (ROWS - 2)); while (Math.abs(ny - y) < 3);
    const dir = Math.sign(ny - y);
    while (y !== ny) push(x, (y += dir));
  }
  return cells;
}

const pathLen = (p) => p.length - 1;

export function pointAt(path, d) {
  const i = Math.max(0, Math.min(path.length - 2, Math.floor(d)));
  const f = Math.max(0, Math.min(1, d - i));
  const [ax, ay] = path[i], [bx, by] = path[i + 1];
  return [ax + (bx - ax) * f + 0.5, ay + (by - ay) * f + 0.5];
}

export function createGame(seed = Date.now()) {
  const r = rng(seed);
  const path = makePath(r);
  const onPath = new Set(path.map(([x, y]) => y * COLS + x));
  return {
    seed, r, path, onPath, gold: 160, lives: 20, wave: 0, time: 0,
    towers: [], enemies: [], effects: [], spawnQueue: [], nextId: 1,
    perks: {}, perkChoice: null, waveActive: false, over: false, kills: 0,
  };
}

const perk = (g, id) => g.perks[id] ?? 0;
export const towerCost = (g, type) => Math.round(TOWERS[type].cost * (perk(g, 'discount') ? 0.85 : 1));
export const upgradeCost = (g, t) => t.level >= MAX_LEVEL ? Infinity
  : Math.round(TOWERS[t.type].cost * UPGRADE_COST[t.level - 1] * (perk(g, 'discount') ? 0.85 : 1));

export function stats(g, t) {
  const b = TOWERS[t.type], L = t.level - 1;
  const s = {
    range: b.range * (1 + 0.12 * L) * (perk(g, 'sight') ? 1.12 : 1),
    dmg: b.dmg * Math.pow(1.65, L) * (t.type === 'arrow' && perk(g, 'sharp') ? 1.35 : 1),
    rate: b.rate * Math.pow(0.88, L),
    air: b.air,
  };
  if (b.splash) s.splash = b.splash * (1 + 0.1 * L) * (perk(g, 'powder') ? 1.4 : 1);
  if (b.slow) { s.slow = Math.min(0.75, b.slow + 0.07 * L + (perk(g, 'permafrost') ? 0.15 : 0)); s.slowTime = b.slowTime * (perk(g, 'permafrost') ? 1.4 : 1); }
  if (b.chain) s.chain = b.chain + L + (perk(g, 'overload') ? 2 : 0);
  return s;
}

export function canBuild(g, cx, cy) {
  if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return false;
  if (g.onPath.has(cy * COLS + cx)) return false;
  return !g.towers.some((t) => t.x === cx && t.y === cy);
}

export function placeTower(g, type, cx, cy) {
  if (!TOWERS[type]) return { ok: false, why: 'Unbekannter Turm' };
  if (!canBuild(g, cx, cy)) return { ok: false, why: 'Hier kann nicht gebaut werden' };
  const cost = towerCost(g, type);
  if (g.gold < cost) return { ok: false, why: 'Zu wenig Gold' };
  g.gold -= cost;
  const t = { id: g.nextId++, type, x: cx, y: cy, level: 1, cd: 0, spent: cost, target: 'first', angle: 0 };
  g.towers.push(t);
  return { ok: true, tower: t };
}

export function upgradeTower(g, id) {
  const t = g.towers.find((x) => x.id === id);
  if (!t) return { ok: false, why: 'Kein Turm' };
  const cost = upgradeCost(g, t);
  if (cost === Infinity) return { ok: false, why: 'Maximal ausgebaut' };
  if (g.gold < cost) return { ok: false, why: 'Zu wenig Gold' };
  g.gold -= cost; t.spent += cost; t.level++;
  return { ok: true };
}

export function sellTower(g, id) {
  const i = g.towers.findIndex((x) => x.id === id);
  if (i < 0) return { ok: false };
  const refund = Math.floor(g.towers[i].spent * 0.7);
  g.gold += refund;
  g.towers.splice(i, 1);
  return { ok: true, refund };
}

export const TARGETS = { first: 'Vorderster', strong: 'Stärkster', near: 'Nächster' };

export function hpScale(wave) { return 1 + 0.14 * wave + 0.011 * wave * wave; }

// Zusammensetzung einer Welle: deterministisch aus Wellennummer und Seed.
export function planWave(n, r) {
  const list = [];
  if (n % 10 === 0) list.push('boss');
  let budget = 8 + n * 6 + Math.floor(Math.pow(n, 1.45));
  const pool = Object.entries(ENEMIES).filter(([k, e]) => e.cost && n >= e.from).map(([k]) => k);
  while (budget > 0) {
    const k = pool[Math.floor(r() * pool.length)];
    const group = k === 'swarm' ? 5 : 1;
    for (let i = 0; i < group; i++) list.push(k);
    budget -= ENEMIES[k].cost * group;
  }
  return list;
}

// Eigener Zufallsstrom je Welle, damit die Vorschau genau das zeigt, was kommt.
export const nextWave = (g, n = g.wave + 1) => planWave(n, rng(g.seed * 31 + n * 7919));

export function startWave(g) {
  if (g.waveActive || g.over || g.perkChoice) return false;
  g.wave++;
  const list = nextWave(g, g.wave);
  const gap = Math.max(0.28, 0.9 - g.wave * 0.02);
  g.spawnQueue = list.map((k, i) => ({ k, at: g.time + i * (k === 'swarm' ? gap * 0.4 : gap) }));
  g.waveActive = true;
  return true;
}

function spawn(g, k, d = 0, from = null) {
  const e = ENEMIES[k];
  const hp = Math.round(e.hp * hpScale(g.wave));
  const en = { id: g.nextId++, k, hp, max: hp, d, slowUntil: 0, slow: 0, x: 0, y: 0, fly: !!e.fly, alive: true };
  if (en.fly) {
    // Flieger nehmen die Luftlinie vom Start zum Ziel
    const [sx, sy] = from ?? pointAt(g.path, 0), [tx, ty] = pointAt(g.path, pathLen(g.path));
    Object.assign(en, { sx, sy, tx, ty, flyLen: Math.hypot(tx - sx, ty - sy), x: sx, y: sy });
  } else [en.x, en.y] = pointAt(g.path, d);
  g.enemies.push(en);
  return en;
}

function damage(g, en, amount, pierce, events) {
  if (!en.alive) return;
  const armor = pierce ? 0 : (ENEMIES[en.k].armor ?? 0);
  en.hp -= Math.max(1, amount - armor);
  if (en.hp <= 0) {
    en.alive = false;
    g.kills++;
    const gold = Math.round(ENEMIES[en.k].gold * (perk(g, 'bounty') ? 1.3 : 1));
    g.gold += gold;
    events.push({ type: 'kill', x: en.x, y: en.y, gold, k: en.k });
    const split = ENEMIES[en.k].split;
    if (split) for (let i = 0; i < split; i++) {
      const c = spawn(g, 'swarm', Math.max(0, en.d - i * 0.25), en.fly ? [en.x, en.y] : null);
      c.hp = c.max = Math.round(c.hp * 1.5);
    }
  }
}

function pickTarget(g, t, s) {
  const cx = t.x + 0.5, cy = t.y + 0.5;
  let best = null, score = -Infinity;
  for (const en of g.enemies) {
    if (!en.alive || (en.fly && !s.air)) continue;
    const dist = Math.hypot(en.x - cx, en.y - cy);
    if (dist > s.range) continue;
    const progress = en.fly ? (Math.hypot(en.x - en.sx, en.y - en.sy) / en.flyLen) * pathLen(g.path) : en.d;
    const sc = t.target === 'strong' ? en.hp : t.target === 'near' ? -dist : progress;
    if (sc > score) { score = sc; best = en; }
  }
  return best;
}

function fire(g, t, events) {
  const s = stats(g, t), b = TOWERS[t.type];
  const cx = t.x + 0.5, cy = t.y + 0.5;
  if (t.type === 'frost') {
    let hit = false;
    for (const en of g.enemies) {
      if (!en.alive || Math.hypot(en.x - cx, en.y - cy) > s.range) continue;
      hit = true;
      en.slow = Math.max(en.slow * (en.slowUntil > g.time ? 1 : 0), s.slow);
      en.slowUntil = g.time + s.slowTime;
      damage(g, en, s.dmg, false, events);
    }
    if (hit) { g.effects.push({ type: 'ring', x: cx, y: cy, r: s.range, t: 0, life: 0.35, color: b.color }); events.push({ type: 'frost' }); }
    return hit;
  }
  const target = pickTarget(g, t, s);
  if (!target) return false;
  t.angle = Math.atan2(target.y - cy, target.x - cx);
  if (t.type === 'arrow') {
    damage(g, target, s.dmg, false, events);
    g.effects.push({ type: 'line', x: cx, y: cy, x2: target.x, y2: target.y, t: 0, life: 0.12, color: '#3d4a1c' });
    events.push({ type: 'arrow' });
  } else if (t.type === 'cannon') {
    const { x, y } = target;
    for (const en of g.enemies) if (en.alive && !en.fly && Math.hypot(en.x - x, en.y - y) <= s.splash) damage(g, en, s.dmg, false, events);
    g.effects.push({ type: 'boom', x, y, r: s.splash, t: 0, life: 0.35 });
    events.push({ type: 'cannon' });
  } else if (t.type === 'tesla') {
    const hitIds = new Set();
    let from = [cx, cy], cur = target;
    for (let j = 0; j < s.chain && cur; j++) {
      hitIds.add(cur.id);
      g.effects.push({ type: 'zap', x: from[0], y: from[1], x2: cur.x, y2: cur.y, t: 0, life: 0.18 });
      damage(g, cur, s.dmg * Math.pow(0.85, j), true, events);
      from = [cur.x, cur.y];
      let next = null, nd = 1.8;
      for (const en of g.enemies) {
        if (!en.alive || hitIds.has(en.id)) continue;
        const d = Math.hypot(en.x - from[0], en.y - from[1]);
        if (d < nd) { nd = d; next = en; }
      }
      cur = next;
    }
    events.push({ type: 'tesla' });
  }
  return true;
}

export function update(g, dt) {
  const events = [];
  if (g.over) return events;
  g.time += dt;
  // Spawnen
  while (g.spawnQueue.length && g.spawnQueue[0].at <= g.time) {
    spawn(g, g.spawnQueue.shift().k);
    if (g.spawnQueue.length === 0) events.push({ type: 'lastSpawn' });
  }
  const end = pathLen(g.path);
  // Bewegen und Heilen
  for (const en of g.enemies) {
    if (!en.alive) continue;
    const e = ENEMIES[en.k];
    const slow = en.slowUntil > g.time ? en.slow : 0;
    const step = e.speed * (1 - slow) * dt;
    if (en.fly) {
      const prog = Math.min(1, Math.hypot(en.x - en.sx, en.y - en.sy) / en.flyLen + step / en.flyLen);
      en.x = en.sx + (en.tx - en.sx) * prog; en.y = en.sy + (en.ty - en.sy) * prog;
      if (prog >= 1) en.d = end;
    } else {
      en.d += step;
      [en.x, en.y] = pointAt(g.path, en.d);
    }
    if (e.heal) for (const o of g.enemies) {
      if (o !== en && o.alive && o.hp < o.max && Math.hypot(o.x - en.x, o.y - en.y) < 1.5) o.hp = Math.min(o.max, o.hp + e.heal * hpScale(g.wave) * dt);
    }
    if (en.d >= end) {
      en.alive = false;
      const loss = en.k === 'boss' ? 5 : 1;
      g.lives -= loss;
      events.push({ type: 'leak', loss });
    }
  }
  // Türme
  for (const t of g.towers) {
    t.cd -= dt;
    if (t.cd <= 0 && fire(g, t, events)) t.cd = stats(g, t).rate;
    else if (t.cd < 0) t.cd = 0;
  }
  g.enemies = g.enemies.filter((e) => e.alive);
  for (const fx of g.effects) fx.t += dt;
  g.effects = g.effects.filter((fx) => fx.t < fx.life);

  if (g.lives <= 0) { g.lives = 0; g.over = true; events.push({ type: 'over' }); return events; }
  if (g.waveActive && !g.spawnQueue.length && !g.enemies.length) {
    g.waveActive = false;
    const bonus = 20 + g.wave * 3;
    const interest = perk(g, 'interest') ? Math.min(60, Math.floor(g.gold * 0.06)) : 0;
    g.gold += bonus + interest;
    events.push({ type: 'waveDone', bonus, interest });
    if (g.wave % 5 === 0) {
      g.perkChoice = pickPerks(g);
      events.push({ type: 'perk' });
    }
  }
  return events;
}

function pickPerks(g) {
  const pool = PERKS.filter((p) => !(p.id === 'walls' ? false : g.perks[p.id]));
  const out = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(g.r() * pool.length), 1)[0]);
  return out;
}

export function choosePerk(g, id) {
  if (!g.perkChoice?.some((p) => p.id === id)) return false;
  g.perks[id] = (g.perks[id] ?? 0) + 1;
  if (id === 'walls') g.lives += 6;
  g.perkChoice = null;
  return true;
}
