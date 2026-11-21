import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLS, ROWS, rng, makePath, createGame, placeTower, upgradeTower, sellTower, startWave, update,
  choosePerk, planWave, towerCost, canBuild, stats, ENEMIES,
} from './game.mjs';

const tick = (g, secs, dt = 1 / 30) => { const ev = []; for (let t = 0; t < secs; t += dt) ev.push(...update(g, dt)); return ev; };

test('Pfad ist zusammenhängend, läuft von links nach rechts und berührt sich nicht', () => {
  for (let s = 1; s <= 300; s++) {
    const p = makePath(rng(s));
    assert.equal(p[0][0], 0);
    assert.equal(p.at(-1)[0], COLS - 1);
    const seen = new Set();
    p.forEach(([x, y], i) => {
      assert.ok(y >= 0 && y < ROWS, `Seed ${s}: Zeile im Feld`);
      const key = y * COLS + x;
      assert.ok(!seen.has(key), `Seed ${s}: keine Schleife`);
      seen.add(key);
      if (i) assert.equal(Math.abs(x - p[i - 1][0]) + Math.abs(y - p[i - 1][1]), 1, `Seed ${s}: Nachbarzelle`);
    });
    // Keine Berührung: Jede Pfadzelle hat höchstens 2 Pfadnachbarn
    for (const [x, y] of p) {
      const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => seen.has((y + dy) * COLS + x + dx) && x + dx >= 0 && x + dx < COLS).length;
      assert.ok(n <= 2, `Seed ${s}: Pfad berührt sich bei ${x},${y}`);
    }
  }
});

test('Bauen kostet Gold, nicht auf dem Pfad, nicht doppelt', () => {
  const g = createGame(5);
  const [px, py] = g.path[3];
  assert.equal(placeTower(g, 'arrow', px, py).ok, false);
  const spot = findSpot(g);
  const gold = g.gold;
  assert.equal(placeTower(g, 'arrow', ...spot).ok, true);
  assert.equal(g.gold, gold - towerCost(g, 'arrow'));
  assert.equal(placeTower(g, 'arrow', ...spot).ok, false);
  assert.equal(canBuild(g, -1, 0), false);
});

test('Ausbau verstärkt, Verkauf erstattet 70 %', () => {
  const g = createGame(5);
  g.gold = 1000;
  const { tower } = placeTower(g, 'cannon', ...findSpot(g));
  const before = stats(g, tower);
  assert.equal(upgradeTower(g, tower.id).ok, true);
  assert.ok(stats(g, tower).dmg > before.dmg);
  upgradeTower(g, tower.id);
  assert.equal(upgradeTower(g, tower.id).ok, false, 'Stufe 3 ist das Maximum');
  const spent = tower.spent, gold = g.gold;
  sellTower(g, tower.id);
  assert.equal(g.gold, gold + Math.floor(spent * 0.7));
  assert.equal(g.towers.length, 0);
});

test('Ohne Türme kosten Gegner Leben, Spiel endet bei 0', () => {
  const g = createGame(9);
  g.lives = 3;
  startWave(g);
  const ev = tick(g, 60);
  assert.ok(ev.some((e) => e.type === 'leak'));
  assert.equal(g.over, true);
  assert.equal(g.lives, 0);
});

test('Gut verteidigte Welle bringt Gold und endet', () => {
  const g = createGame(3);
  g.gold = 2000;
  const spots = spotsNearPath(g).slice(0, 8);
  spots.forEach((s, i) => placeTower(g, i % 2 ? 'arrow' : 'cannon', ...s));
  const gold = g.gold;
  startWave(g);
  const ev = tick(g, 90);
  assert.equal(g.waveActive, false);
  assert.equal(g.lives, 20);
  assert.ok(g.gold > gold);
  assert.ok(ev.some((e) => e.type === 'waveDone'));
});

test('Panzerung reduziert Bogenschaden, Blitz ignoriert sie', () => {
  for (const type of ['arrow', 'tesla']) {
    const g = createGame(1);
    g.gold = 1000; g.wave = 5;
    const speed = ENEMIES.tank.speed; ENEMIES.tank.speed = 0; // Ziel steht still
    g.spawnQueue = [{ k: 'tank', at: 0 }]; g.waveActive = true;
    update(g, 0.001);
    const tank = g.enemies[0];
    const [x, y] = [Math.floor(tank.x), Math.floor(tank.y)];
    const spot = [[x, y - 1], [x, y + 1], [x + 1, y - 1], [x + 1, y + 1]].find(([a, b]) => canBuild(g, a, b));
    const { tower } = placeTower(g, type, ...spot);
    const hp = tank.hp;
    update(g, 0.001);
    ENEMIES.tank.speed = speed;
    const expected = type === 'arrow' ? Math.max(1, stats(g, tower).dmg - ENEMIES.tank.armor) : stats(g, tower).dmg;
    assert.ok(Math.abs(hp - tank.hp - expected) < 1e-9, `${type}: ${hp - tank.hp} statt ${expected}`);
  }
});

test('Frost verlangsamt', () => {
  const g = createGame(2);
  g.gold = 1000;
  const runner = { k: 'runner', at: 0 };
  g.spawnQueue = [runner]; g.waveActive = true;
  update(g, 0.001);
  const en = g.enemies[0];
  const [x, y] = [Math.floor(en.x), Math.floor(en.y)];
  // Frostturm direkt neben den Start
  const spot = [[x, y - 1], [x, y + 1], [x + 1, y - 1], [x + 1, y + 1]].find(([a, b]) => canBuild(g, a, b));
  placeTower(g, 'frost', ...spot);
  const d0 = en.d;
  update(g, 0.1);
  update(g, 0.5);
  const moved = en.d - d0;
  assert.ok(moved < ENEMIES.runner.speed * 0.6 * 0.9, `langsamer (${moved.toFixed(2)})`);
});

test('Teiler zerfällt in Schwarm-Gegner', () => {
  const g = createGame(4);
  g.wave = 10;
  g.spawnQueue = [{ k: 'splitter', at: 0 }]; g.waveActive = true;
  update(g, 0.001);
  const sp = g.enemies[0];
  sp.hp = 1;
  g.gold = 500;
  const [x, y] = [Math.floor(sp.x), Math.floor(sp.y)];
  const spot = [[x, y - 1], [x, y + 1], [x + 1, y - 1], [x + 1, y + 1]].find(([a, b]) => canBuild(g, a, b));
  placeTower(g, 'arrow', ...spot);
  update(g, 0.05);
  assert.equal(g.enemies.filter((e) => e.k === 'swarm').length, 3);
});

test('Alle 5 Wellen gibt es eine Perk-Wahl, die wirkt', () => {
  const g = createGame(11);
  g.gold = 5000;
  spotsNearPath(g).slice(0, 14).forEach((s, i) => placeTower(g, ['arrow', 'cannon', 'tesla', 'frost'][i % 4], ...s));
  for (let w = 0; w < 5; w++) { startWave(g); tick(g, 120); }
  assert.equal(g.wave, 5);
  assert.ok(g.perkChoice && g.perkChoice.length === 3);
  assert.equal(startWave(g), false, 'erst wählen');
  const id = g.perkChoice[0].id;
  assert.equal(choosePerk(g, id), true);
  assert.equal(g.perks[id], 1);
  assert.equal(startWave(g), true);
});

test('Wellen werden größer, Welle 10 hat einen Boss', () => {
  const r = rng(1);
  assert.ok(planWave(8, r).length > planWave(1, r).length);
  assert.ok(planWave(10, r).includes('boss'));
  assert.ok(!planWave(9, r).includes('boss'));
});

test('Lange Partie bleibt numerisch stabil', () => {
  const g = createGame(77);
  g.gold = 20000;
  spotsNearPath(g).slice(0, 24).forEach((s, i) => placeTower(g, ['arrow', 'cannon', 'tesla', 'frost'][i % 4], ...s));
  for (const t of g.towers) { upgradeTower(g, t.id); upgradeTower(g, t.id); }
  for (let w = 0; w < 20 && !g.over; w++) {
    if (g.perkChoice) choosePerk(g, g.perkChoice[0].id);
    startWave(g); tick(g, 200, 1 / 20);
  }
  assert.ok(Number.isFinite(g.gold) && Number.isFinite(g.lives));
  assert.ok(g.wave >= 10, `erreicht Welle ${g.wave}`);
});

function findSpot(g) {
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (canBuild(g, x, y)) return [x, y];
}
function spotsNearPath(g) {
  const out = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (!canBuild(g, x, y)) continue;
    const near = g.path.filter(([px, py]) => Math.abs(px - x) <= 1 && Math.abs(py - y) <= 1).length;
    if (near) out.push([x, y, near]);
  }
  return out.sort((a, b) => b[2] - a[2]).map(([x, y]) => [x, y]);
}

test('Flächenschaden trifft die frisch entstandenen Schwarm-Gegner nicht im selben Schuss', () => {
  const g = createGame(4);
  g.wave = 10; g.gold = 1000;
  const speed = ENEMIES.splitter.speed; ENEMIES.splitter.speed = 0;
  g.spawnQueue = [{ k: 'splitter', at: 0 }]; g.waveActive = true;
  update(g, 0.001);
  const sp = g.enemies[0]; sp.hp = 1;
  const [x, y] = [Math.floor(sp.x), Math.floor(sp.y)];
  const spot = [[x, y - 1], [x, y + 1], [x + 1, y - 1], [x + 1, y + 1]].find(([a, b]) => canBuild(g, a, b));
  placeTower(g, 'cannon', ...spot);
  update(g, 0.001);
  ENEMIES.splitter.speed = speed;
  const kids = g.enemies.filter((e) => e.k === 'swarm');
  assert.equal(kids.length, 3);
  for (const k of kids) assert.equal(k.hp, k.max, 'Kinder unverletzt');
});
