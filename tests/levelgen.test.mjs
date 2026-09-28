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
