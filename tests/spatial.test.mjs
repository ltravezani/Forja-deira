import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './helpers.mjs';

test('grade espacial encontra exatamente os mesmos vizinhos que a busca por força bruta', async () => {
  const { SpatialHash } = await load('world/spatial.js');
  const grid = new SpatialHash(3);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const ents = Array.from({ length: 400 }, (_, id) => ({ id, x: rnd() * 200 - 100, z: rnd() * 200 - 100 }));
  for (let round = 0; round < 3; round++) {
    grid.clear();
    ents.forEach((e) => grid.insert(e));
    const out = [];
    for (let q = 0; q < 200; q++) {
      const x = rnd() * 200 - 100, z = rnd() * 200 - 100, r = rnd() * 8;
      const got = grid.query(x, z, r, out).filter((e) => (e.x - x) ** 2 + (e.z - z) ** 2 <= r * r).map((e) => e.id).sort((a, b) => a - b);
      const want = ents.filter((e) => (e.x - x) ** 2 + (e.z - z) ** 2 <= r * r).map((e) => e.id).sort((a, b) => a - b);
      assert.deepEqual(got, want);
    }
    ents.forEach((e) => { e.x += rnd() - 0.5; e.z += rnd() - 0.5; });
  }
});
