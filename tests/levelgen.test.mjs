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

test('torre infinita: andar circular todo alcançável, chefe no salão central e bandos no anel', async () => {
  const { genTower } = await load('world/levelgen.js');
  const { TOWER_ORDER, towerBiome } = await load('world/biomes.js');
  for (let floor = 1; floor <= 24; floor++) {
    const biome = towerBiome(floor);
    assert.ok(TOWER_ORDER.includes(biome));
    const L = genTower(biome, floor, R.hash32('torre', floor));
    assert.equal(L.grid[L.start.z * L.W + L.start.x], 1, 'andar ' + floor + ': entrada fora do chão');
    const seen = flood(L, L.start.x, L.start.z);
    for (let i = 0; i < L.grid.length; i++) if (L.grid[i] === 1) assert.ok(seen[i], 'andar ' + floor + ': tile isolado ' + i);
    const boss = L.spawns.filter((s) => s.boss);
    assert.equal(boss.length, 1, 'andar ' + floor + ': um chefe por andar');
    assert.ok(seen[boss[0].z * L.W + boss[0].x], 'andar ' + floor + ': chefe inalcançável');
    assert.ok(L.spawns.length >= 6, 'andar ' + floor + ': poucos bandos');
    for (const s of L.spawns) assert.ok(seen[s.z * L.W + s.x], 'andar ' + floor + ': spawn inalcançável');
  }
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
