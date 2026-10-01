import test from 'node:test';
import assert from 'node:assert/strict';
import { R } from './helpers.mjs';

const wing = (plus, stage) => ({ uid: 'w', slot: 'wings', cls: null, tier: 2, rarity: 'excelente', plus, stage, luck: false, skill: false, addOpt: 0, exc: [], anc: null, legend: null, seed: '0' });

test('evolução de asa: precisa +12; chance 10% no +12 e +5% por nível acima', () => {
  assert.equal(R.wingUpgradeChance(wing(11)), 0);
  assert.equal(R.wingUpgradeChance(wing(12)), 0.1);
  assert.equal(R.wingUpgradeChance(wing(13)), 0.15);
  assert.equal(R.wingUpgradeChance(wing(14)), 0.2);
  assert.equal(R.wingUpgradeChance(wing(15)), 0.25);
  assert.equal(R.wingUpgradeChance(wing(15, 1)), 0, 'asa já Ascendida não evolui de novo');
  assert.equal(R.wingUpgradeChance({ slot: 'armor', plus: 15 }), 0);
  assert.deepEqual(R.WING_UP.jewels, { bless: 10, soul: 10, chaos: 10, life: 10 });
});

test('evolução de asa: sucesso mantém o +nível; falha volta a +0; talismã protege', () => {
  const a = wing(13), ra = R.applyWingUpgrade(a, 0.1);
  assert.ok(ra.ok); assert.equal(a.stage, 1); assert.equal(a.plus, 13);
  const b = wing(13), rb = R.applyWingUpgrade(b, 0.9);
  assert.ok(!rb.ok); assert.equal(b.plus, 0); assert.ok(!b.stage);
  const c = wing(14), rc = R.applyWingUpgrade(c, 0.9, { talisman: true });
  assert.ok(rc.protected); assert.equal(c.plus, 14); assert.ok(!c.stage);
  assert.ok(R.applyWingUpgrade(wing(10), 0).invalid);
  assert.equal(R.talismanUseful('wing'), true);
});

test('asa Ascendida: nome, bônus maiores e refino continua até +15', () => {
  const n = wing(12), u = wing(12, 1);
  assert.match(R.itemName(u), /Ascendidas \+12$/);
  const sn = R.itemStats(n), su = R.itemStats(u);
  assert.equal(su.dmgPct - sn.dmgPct, 10);
  assert.equal(su.dmgRed - sn.dmgRed, 6);
  assert.equal(su.hpPct, 5);
  assert.ok(R.itemValue(u) > R.itemValue(n));
  assert.ok(R.itemLines(u).some(([k]) => k === 'HP máximo'));
  assert.ok(R.upgradeChance(u, 'chaos') > 0, 'refino Chaos segue liberado na Ascendida');
  assert.equal(R.upgradeChance(wing(15, 1), 'chaos'), 0, 'teto continua +15');
});
