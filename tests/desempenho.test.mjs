import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './helpers.mjs';

test('gpuTier separa placas fracas, médias, fortes e desenho por software', async () => {
  const { gpuTier } = await load('core/config.js');
  assert.equal(gpuTier('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'low');
  assert.equal(gpuTier('ANGLE (Intel, Intel(R) HD Graphics 4000 Direct3D11)'), 'low');
  assert.equal(gpuTier('Mali-G52 MC2'), 'low');
  assert.equal(gpuTier('Adreno (TM) 618'), 'low');
  assert.equal(gpuTier('ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11)'), 'mid');
  assert.equal(gpuTier('Adreno (TM) 730'), 'mid');
  assert.equal(gpuTier('ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11)'), 'high');
  assert.equal(gpuTier('Google SwiftShader'), 'soft');
  assert.equal(gpuTier(''), 'mid');
});

test('frameTarget: limite escolhido e economia de bateria por situação', async () => {
  const { frameTarget, fpsLimit } = await load('core/config.js');
  assert.equal(fpsLimit({}), 60);
  assert.equal(fpsLimit({ fps: 0 }), 0);
  assert.equal(fpsLimit({ fps: 99 }), 60);
  const off = { battery: false };
  assert.equal(frameTarget(off, { mode: 'field' }), 60);
  assert.equal(frameTarget({ battery: false, fps: 0 }, { mode: 'field' }), 0);
  const on = { battery: true };
  assert.equal(frameTarget(on, { mode: 'field' }), 45);
  assert.equal(frameTarget(on, { mode: 'town' }), 30);
  assert.equal(frameTarget(on, { mode: 'title' }), 30);
  assert.equal(frameTarget(on, { mode: 'field', panel: true }), 30);
  assert.equal(frameTarget({ battery: true, fps: 30 }, { mode: 'field' }), 30);
  assert.equal(frameTarget({ battery: true, fps: 0 }, { mode: 'field' }), 45);
});

test('cappedDpr respeita o DPR da qualidade e o teto de pixels', async () => {
  const { cappedDpr } = await load('core/config.js');
  assert.equal(cappedDpr(3, 1.5, 412, 915, 1e6), 1.5);
  assert.equal(cappedDpr(1, 1.3, 1366, 768, 2.1e6), 1);
  const d = cappedDpr(1.25, 1.3, 1920, 1080, 2.1e6);
  assert.ok(d < 1.25 && Math.abs(1920 * 1080 * d * d - 2.1e6) < 1e3);
});

test('paceFrame: 60 numa tela de 120 Hz desenha 1 de 2; 45 numa de 60 Hz, 3 de 4', async () => {
  const { paceFrame } = await load('core/loop.js');
  const run = (hz, fps, n) => { const st = { due: 0 }; let k = 0; for (let i = 0; i < n; i++) if (paceFrame(st, 1000 + (i * 1000) / hz, fps)) k++; return k; };
  assert.equal(run(120, 60, 120), 60);
  assert.equal(run(60, 60, 60), 60);
  assert.equal(run(90, 60, 90), 60);
  assert.ok(Math.abs(run(60, 45, 120) - 90) <= 1);
  assert.equal(run(60, 30, 60), 30);
  assert.equal(run(144, 0, 144), 144);
});

test('prewarmJobs cobre todos os biomas', async () => {
  const { BIOMES } = await load('world/biomes.js');
  const src = await import('node:fs').then((fs) => fs.readFileSync(new URL('../src/world/texPrewarm.js', import.meta.url), 'utf8'));
  assert.match(src, /Object\.keys\(BIOMES\)/);
  assert.ok(Object.keys(BIOMES).length >= 10);
});
