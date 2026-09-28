import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './helpers.mjs';

// mapa 10×7: 1 = chão, 0 = parede. Uma parede vertical com passagem só embaixo.
const MAP = [
  '0000000000',
  '0111101110',
  '0111101110',
  '0111101110',
  '0111101110',
  '0111111110',
  '0000000000',
];
function level() {
  const H = MAP.length, W = MAP[0].length, grid = new Uint8Array(W * H);
  MAP.forEach((row, z) => [...row].forEach((c, x) => (grid[z * W + x] = +c)));
  return { W, H, grid };
}

test('walkable e lineClear respeitam paredes', async () => {
  const { walkable, lineClear } = await load('world/grid.js');
  const L = level(), T = 2;
  assert.equal(walkable(L, 1 * T, 1 * T), true);
  assert.equal(walkable(L, 5 * T, 1 * T), false);
  assert.equal(walkable(L, -5, 3), false);
  assert.equal(lineClear(L, 1 * T, 1 * T, 3 * T, 4 * T, 0), true);
  assert.equal(lineClear(L, 1 * T, 2 * T, 7 * T, 2 * T, 0), false);
});

test('findPath contorna a parede e chega ao destino', async () => {
  const { findPath, walkable } = await load('world/grid.js');
  const L = level(), T = 2;
  const path = findPath(L, 1 * T, 1 * T, 7 * T, 1 * T);
  assert.ok(path && path.length > 0, 'deveria haver caminho');
  const end = path[path.length - 1];
  assert.equal(end.x, 7 * T); assert.equal(end.z, 1 * T);
  for (const p of path) assert.ok(walkable(L, p.x, p.z), 'ponto fora do chão: ' + JSON.stringify(p));
  assert.ok(path.some((p) => p.z >= 5 * T - 0.01), 'deveria descer até a passagem');
});

test('findPath com destino dentro da parede vai ao ponto livre mais próximo', async () => {
  const { findPath } = await load('world/grid.js');
  const L = level(), T = 2;
  const path = findPath(L, 1 * T, 1 * T, 5 * T, 2 * T);
  assert.ok(path && path.length);
});
