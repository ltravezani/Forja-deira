import test from 'node:test';
import assert from 'node:assert/strict';
import { load, R } from './helpers.mjs';

test('genEden: todo chão alcançável, três caminhos até o Coração, um Guardião e três mini chefes', async () => {
  const { genEden, REGION } = await load('world/edengen.js');
  for (const seed of [1, 777, 123456]) {
    const L = genEden(seed);
    const { W, H, grid } = L;
    const seen = new Uint8Array(W * H), q = [L.start.z * W + L.start.x];
    seen[q[0]] = 1;
    while (q.length) {
      const i = q.pop(), x = i % W, z = (i / W) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz, j = nz * W + nx;
        if (nx < 0 || nz < 0 || nx >= W || nz >= H || seen[j] || grid[j] !== 1) continue;
        seen[j] = 1; q.push(j);
      }
    }
    let lost = 0;
    for (let i = 0; i < grid.length; i++) if (grid[i] === 1 && !seen[i]) lost++;
    assert.equal(lost, 0, 'seed ' + seed + ': chão inalcançável');
    assert.equal(grid[L.boss.z * W + L.boss.x], 1);
    assert.equal(L.spawns.filter((s) => s.boss).length, 1);
    const minis = L.spawns.filter((s) => s.mini);
    assert.equal(minis.length, 3);
    assert.deepEqual(new Set(minis.map((s) => s.reg)), new Set([REGION.forest, REGION.roots, REGION.river]));
    for (const r of [REGION.hub, REGION.forest, REGION.roots, REGION.river, REGION.heart]) assert.ok(L.region.some((v, i) => v === r && grid[i]), 'região ' + r);
    assert.ok(L.chests.length >= 6 && L.secrets.length >= 3 && L.falls.length >= 1 && L.bridges.length >= 1);
    // água sempre bloqueia a passagem (grid 2) e nunca fica em cima de parede
    for (let i = 0; i < grid.length; i++) if (L.water[i]) assert.equal(grid[i], 2);
  }
});

test('genEden: determinístico pela seed', async () => {
  const { genEden } = await load('world/edengen.js');
  const a = genEden(42), b = genEden(42);
  assert.deepEqual(Array.from(a.grid), Array.from(b.grid));
  assert.deepEqual(a.spawns, b.spawns);
});

test('Éden: uma entrada a cada 3 horas', () => {
  const now = 1_800_000_000_000, H = 3600 * 1000;
  assert.equal(R.edenRemaining({ edenLast: 0 }, now), 0);
  assert.equal(R.edenRemaining({}, now), 0);
  assert.equal(R.edenRemaining({ edenLast: now }, now), 3 * H);
  assert.equal(R.edenRemaining({ edenLast: now - 2 * H }, now), H);
  assert.equal(R.edenRemaining({ edenLast: now - 3 * H }, now), 0);
  // relógio adiantado no save não trava o portal por mais de 3 horas
  assert.equal(R.edenRemaining({ edenLast: now + 50 * H }, now), 3 * H);
});

test('Éden: dificuldade acompanha o nível de entrada', () => {
  assert.equal(R.edenLevel(50, 'path', 0), 50);
  assert.ok(R.edenLevel(50, 'path', 1) > R.edenLevel(50, 'path', 0));
  assert.ok(R.edenLevel(50, 'boss') > R.edenLevel(50, 'mini'));
  assert.ok(R.edenLevel(200, 'boss') > 200);
});

test('rollEdenDrop: Guardião sempre dá Talismã; Lendário só em mini chefe e chefe', () => {
  let legNormal = 0, talNormal = 0, buff = 0, rare = 0;
  const N = 4000;
  for (let s = 1; s <= 200; s++) {
    const d = R.rollEdenDrop({ seed: s, mLevel: 60, src: 'boss', mf: 0, favorCls: 'dk' });
    assert.equal(d.talismans, 1);
    assert.ok(d.gold > 0);
  }
  for (let s = 1; s <= N; s++) {
    const d = R.rollEdenDrop({ seed: s * 7919, mLevel: 60, src: 'normal', mf: 0, favorCls: 'dk' });
    legNormal += d.items.filter((it) => it.rarity === 'lendario').length;
    talNormal += d.talismans;
    buff += d.potions.filter((p) => R.BUFF_POTIONS.includes(p)).length;
    rare += d.jewels.length + d.items.filter((it) => it.rarity === 'ancestral').length;
  }
  assert.equal(legNormal, 0);
  assert.ok(Math.abs(talNormal / N - 0.07) < 0.02, 'talismã ~7%: ' + talNormal / N);
  assert.ok(Math.abs(buff / N - 0.15) < 0.025, 'poção de reforço ~15%: ' + buff / N);
  assert.ok(Math.abs(rare / N - 0.10) < 0.02, 'joia/ancestral ~10%: ' + rare / N);
  let legMini = 0;
  for (let s = 1; s <= N; s++) legMini += R.rollEdenDrop({ seed: s * 31, mLevel: 60, src: 'mini', mf: 0, favorCls: 'dk' }).items.filter((it) => it.rarity === 'lendario').length;
  assert.ok(legMini > 0 && Math.abs(legMini / N - 0.05) < 0.02, 'lendário em mini ~5%: ' + legMini / N);
});

test('Talismã da Sorte: falha da Chaos mantém o +nível; sem talismã volta a +0', () => {
  const it = () => ({ plus: 11, addOpt: 0, slot: 'weapon' });
  const a = it(), ra = R.applyUpgrade(a, 'chaos', 0.999, { talisman: true });
  assert.equal(ra.ok, false); assert.equal(ra.protected, true); assert.equal(a.plus, 11);
  const b = it(), rb = R.applyUpgrade(b, 'chaos', 0.999);
  assert.equal(rb.ok, false); assert.equal(b.plus, 0);
  const c = it(); R.applyUpgrade(c, 'chaos', 0, { talisman: true });
  assert.equal(c.plus, 12);
  assert.equal(R.talismanUseful('chaos'), true);
  assert.equal(R.talismanUseful('soul'), false);
});

test('poções de reforço: Velocidade acelera o ataque, Força soma 50', () => {
  const ch = R.newCharacter('T', 'dk');
  const base = R.deriveStats(ch, []);
  const fast = R.deriveStats(ch, [R.POTIONS.spd.buff]);
  assert.ok(fast.attackInterval < base.attackInterval);
  assert.ok(Math.abs(base.attackInterval / fast.attackInterval - 1.1) < 0.01);
  const str = R.deriveStats(ch, [R.POTIONS.str.buff]);
  assert.equal(str.total.str, base.total.str + 50);
  assert.ok(str.maxDmg > base.maxDmg);
  for (const id of R.BUFF_POTIONS) { assert.equal(R.POTIONS[id].dur, 600); assert.ok(R.POTIONS[id].buff); }
  assert.equal(R.itemName({ kind: 'talisman', id: 'luck' }), 'Talismã da Sorte');
});

test('cidade: Portal do Éden no fundo, entre a Kora e o Varek, em chão livre', async () => {
  const { genTown } = await load('world/levelgen.js');
  const L = genTown();
  assert.ok(L.eden);
  // chão livre em volta (o jogador alcança e clica no portal)
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) assert.equal(L.grid[(L.eden.z + dz) * L.W + L.eden.x + dx], 1);
  // no fundo da cidade (frente da tela, +z), mais ao sul que a praça
  assert.ok(L.eden.z > L.H / 2);
});

test('save antigo sem edenLast: portal liberado, talismã e poções preservados', async () => {
  const { sanitizeCharacter } = await load('core/state.js');
  const ch = R.newCharacter('Velho', 'dk');
  delete ch.edenLast;
  ch.bag.push({ kind: 'talisman', id: 'luck', uid: 991 }, { kind: 'potion', id: 'spd', uid: 992 });
  sanitizeCharacter(ch);
  assert.equal(ch.edenLast, 0);
  assert.equal(R.edenRemaining(ch, Date.now()), 0);
  assert.ok(ch.bag.some((b) => b.kind === 'talisman' && b.id === 'luck'));
  assert.ok(ch.bag.some((b) => b.kind === 'potion' && b.id === 'spd'));
  ch.edenLast = 'lixo';
  sanitizeCharacter(ch);
  assert.equal(ch.edenLast, 0);
});
