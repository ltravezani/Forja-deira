import test from 'node:test';
import assert from 'node:assert/strict';
import { load, R } from './helpers.mjs';

function flood(L, sx, sz) {
  const seen = new Uint8Array(L.W * L.H), q = [sz * L.W + sx];
  seen[q[0]] = 1;
  while (q.length) {
    const i = q.pop(), x = i % L.W, z = (i - x) / L.W;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz, j = nz * L.W + nx;
      if (nx < 0 || nz < 0 || nx >= L.W || nz >= L.H || seen[j] || L.grid[j] !== 1) continue;
      seen[j] = 1; q.push(j);
    }
  }
  return seen;
}

test('masmorras: todo chão é alcançável a partir da entrada, com chefe e monstros', async () => {
  const { genDungeon } = await load('world/levelgen.js');
  const { DUNGEON_ORDER } = await load('world/biomes.js');
  for (const biome of DUNGEON_ORDER) {
    for (const floor of [1, 3, 7]) {
      const L = genDungeon(biome, floor, R.hash32(biome, floor, 'teste'));
      assert.equal(L.grid[L.start.z * L.W + L.start.x], 1, biome + ': entrada fora do chão');
      const seen = flood(L, L.start.x, L.start.z);
      for (let i = 0; i < L.grid.length; i++) if (L.grid[i] === 1) assert.ok(seen[i], biome + ' andar ' + floor + ': tile isolado ' + i);
      assert.ok(L.spawns.some((s) => s.boss), biome + ': sem chefe');
      for (const s of L.spawns) assert.ok(seen[s.z * L.W + s.x], biome + ': spawn inalcançável');
    }
  }
});

test('cidade tem NPCs e portal em chão livre', async () => {
  const { genTown } = await load('world/levelgen.js');
  const L = genTown();
  for (const n of L.npcs.concat([L.portal, L.start])) assert.equal(L.grid[n.z * L.W + n.x], 1);
});

test('torre infinita: plantas variadas, tudo alcançável, chefe no fundo e eventos em chão livre', async () => {
  const { genTower, TOWER_LAYOUTS } = await load('world/towergen.js');
  const { TOWER_ORDER, towerBiome } = await load('world/biomes.js');
  const seenLayouts = new Set(), seenEvents = new Set();
  let prev = null;
  for (let run = 0; run < 4; run++) for (let floor = 1; floor <= 24; floor++) {
    const biome = towerBiome(floor);
    assert.ok(TOWER_ORDER.includes(biome));
    const tag = 'andar ' + floor + ' (' + run + ')';
    const L = genTower(biome, floor, R.hash32('torre', run, floor), prev);
    assert.ok(TOWER_LAYOUTS[L.layout], tag + ': planta desconhecida');
    assert.notEqual(L.layout, prev, tag + ': planta repetida no andar seguinte');
    prev = L.layout;
    seenLayouts.add(L.layout);
    assert.equal(L.grid[L.start.z * L.W + L.start.x], 1, tag + ': entrada fora do chão');
    const seen = flood(L, L.start.x, L.start.z);
    for (let i = 0; i < L.grid.length; i++) if (L.grid[i] === 1) assert.ok(seen[i], tag + ': tile isolado ' + i);
    const boss = L.spawns.filter((s) => s.boss);
    assert.equal(boss.length, 1, tag + ': um chefe por andar');
    assert.ok(seen[boss[0].z * L.W + boss[0].x], tag + ': chefe inalcançável');
    // entrada na frente da câmera (+x/+z), chefe longe dela
    assert.ok(L.start.x + L.start.z > L.W, tag + ': entrada deveria ficar na frente');
    assert.ok(L.boss.x + L.boss.z < L.start.x + L.start.z - 20, tag + ': chefe deveria ficar atrás, longe da entrada');
    for (const s of L.spawns) assert.ok(seen[s.z * L.W + s.x], tag + ': spawn inalcançável');
    // o orçamento de bandos é o mesmo de antes: comuns + emboscadas + círculo + invasão
    const hostile = L.events.filter((e) => e.size).length;
    assert.equal(L.spawns.length - 1 + hostile, 7 + Math.min(6, Math.floor(floor / 2)), tag + ': orçamento de bandos mudou');
    for (const e of L.events) {
      seenEvents.add(e.type);
      if (e.x != null) assert.ok(seen[e.z * L.W + e.x], tag + ': evento ' + e.type + ' fora do chão');
    }
  }
  assert.equal(seenLayouts.size, Object.keys(TOWER_LAYOUTS).length, 'nem todas as plantas apareceram: ' + [...seenLayouts]);
  for (const t of ['ambush', 'sealed', 'invasion', 'shrine', 'thief']) assert.ok(seenEvents.has(t), 'evento nunca sorteado: ' + t);
  assert.equal(towerBiome(1), TOWER_ORDER[0]);
  assert.equal(towerBiome(6), TOWER_ORDER[1]);
  assert.equal(towerBiome(21), TOWER_ORDER[0]);
});

test('cidade: Torre Infinita na parte de baixo do mapa, com o Guardião em chão livre', async () => {
  const { genTown } = await load('world/levelgen.js');
  const L = genTown();
  const g = L.npcs.find((n) => n.id === 'tower');
  assert.ok(g, 'sem Guardião da Torre');
  assert.equal(L.grid[g.z * L.W + g.x], 1);
  // "baixo" na tela = +x/+z (a câmera olha do sudeste)
  assert.ok(L.tower.x + L.tower.z > L.W, 'torre deveria ficar na frente/baixo do mapa');
  assert.equal(L.grid[L.tower.z * L.W + L.tower.x], 2, 'torre deveria bloquear a passagem');
});

test('cidade viva: NPCs, portal e pontos dos moradores alcançáveis; cercado das galinhas com chão livre', async () => {
  const { genTown } = await load('world/levelgen.js');
  const L = genTown();
  const seen = flood(L, L.start.x, L.start.z);
  for (const n of L.npcs.concat([L.portal])) assert.ok(seen[n.z * L.W + n.x], 'NPC/portal isolado em ' + n.x + ',' + n.z);
  assert.ok(L.spots.length >= 15, 'poucos pontos de interesse (' + L.spots.length + ')');
  for (const s of L.spots) assert.ok(seen[s.z * L.W + s.x], 'ponto isolado em ' + s.x + ',' + s.z);
  let inside = 0;
  for (let z = L.pen.z0 + 1; z < L.pen.z1; z++) for (let x = L.pen.x0 + 1; x < L.pen.x1; x++) if (L.grid[z * L.W + x] === 1) inside++;
  assert.ok(inside >= 4, 'cercado sem espaço para as galinhas');
  for (const k of ['fountain', 'bench', 'well', 'garden', 'oak', 'notice']) assert.ok(L.props.some((p) => p.kind === k), 'faltou ' + k);
});
