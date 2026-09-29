import test from 'node:test';
import assert from 'node:assert/strict';
import { R } from './helpers.mjs';

const CLASSES = ['dk', 'dw', 'elf'];

test('atributos derivados são finitos para todas as classes e níveis', () => {
  for (const cls of CLASSES) {
    for (const level of [1, 50, 150, 400, 1000]) {
      const ch = R.newCharacter('T', cls);
      ch.level = level;
      R.autoDistribute(ch, level * 5);
      const st = R.deriveStats(ch, []);
      for (const k of ['maxHp', 'maxMp', 'maxAg', 'def', 'minDmg', 'maxDmg', 'attackInterval', 'critPct', 'moveSpeed']) {
        assert.ok(Number.isFinite(st[k]), cls + ' nv ' + level + ': ' + k + ' = ' + st[k]);
      }
      assert.ok(st.maxDmg >= st.minDmg);
      assert.ok(st.attackInterval >= 0.2 && st.attackInterval <= 1.2);
      assert.ok(R.combatPower(st) > 0);
    }
  }
});

test('drop é determinístico pela seed', () => {
  const a = R.rollDrop({ seed: 12345, mLevel: 40, src: 'elite', mf: 30, favorCls: 'dk' });
  const b = R.rollDrop({ seed: 12345, mLevel: 40, src: 'elite', mf: 30, favorCls: 'dk' });
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
});

test('frequência de raridade observada segue a tabela publicada', () => {
  const N = 20000, count = {};
  for (let i = 0; i < N; i++) {
    const it = R.makeEquip(R.hash32('freq', i), 40, null, 'dk', 0, 'normal');
    count[it.rarity] = (count[it.rarity] || 0) + 1;
  }
  const table = R.rarityTable(0, 'normal');
  for (const r of Object.keys(table)) {
    const obs = (count[r] || 0) / N;
    assert.ok(Math.abs(obs - table[r]) < 0.015, r + ': observado ' + obs.toFixed(4) + ' vs ' + table[r].toFixed(4));
  }
});

test('CP de item cresce com o tier', () => {
  const lo = R.makeEquip(R.hash32('cp', 1), 5, 'comum', 'dk', 0, 'normal');
  const hi = R.makeEquip(R.hash32('cp', 1), 300, 'comum', 'dk', 0, 'normal');
  if (lo.slot === hi.slot) assert.ok(R.itemCP(hi) > R.itemCP(lo));
  assert.ok(R.itemCP(lo) >= 0);
});

test('Dark Wizard nível 1 tem dano mágico e HP extras de início', () => {
  const st = R.deriveStats(R.newCharacter('W', 'dw'), []);
  assert.equal(st.minDmg, 6);
  assert.equal(st.maxDmg, 12);
  assert.equal(st.maxHp, 81);
});

test('Poção da Ressurreição custa 50.000 Gold e não é bebível', () => {
  const D = R.POTIONS.rez;
  assert.equal(D.price, 50000);
  assert.equal(D.revive, true);
  assert.equal(R.itemName({ kind: 'potion', id: 'rez' }), 'Poção da Ressurreição');
});

test('torre: dificuldade cresce a cada andar', () => {
  for (let f = 1; f < 30; f++) {
    assert.ok(R.towerLevel(f + 1) > R.towerLevel(f));
    const a = R.towerMod(f), b = R.towerMod(f + 1);
    assert.ok(b.hp > a.hp && b.dmg > a.dmg);
  }
  assert.deepEqual(R.towerMod(1), { hp: 1, dmg: 1 });
});

test('torre: só Gold e Jewels; monstros ~10% de Jewel, chefe ~20% de tesouro', () => {
  const N = 20000;
  let jewels = 0, gold = 0, bossHit = 0;
  for (let i = 0; i < N; i++) {
    const d = R.rollTowerDrop({ seed: R.hash32('tw', i), mLevel: 60, src: 'normal' });
    assert.deepEqual(Object.keys(d).sort(), ['bossRoll', 'gold', 'jewels']);
    assert.ok(d.jewels.length <= 1);
    for (const j of d.jewels) assert.ok(R.JEWELS[j]);
    jewels += d.jewels.length; if (d.gold) gold++;
    const b = R.rollTowerDrop({ seed: R.hash32('twb', i), mLevel: 60, src: 'boss' });
    if (b.gold || b.jewels.length) { bossHit++; assert.ok(b.gold > 0 && b.jewels.length >= 1 && b.jewels.length <= 3); }
  }
  assert.ok(Math.abs(jewels / N - 0.1) < 0.015, 'jewel ' + jewels / N);
  assert.ok(Math.abs(bossHit / N - 0.2) < 0.015, 'chefe ' + bossHit / N);
  assert.ok(Math.abs(gold / N - R.DROP_CHANCE.gold) < 0.02, 'gold ' + gold / N);
});

test('torre: Gold igual ao de um andar normal de masmorra (mesma fórmula)', () => {
  for (const src of ['normal', 'elite']) for (const lv of [20, 90, 300]) {
    assert.equal(R.goldAmount(lv, src, 0), Math.floor(lv * 18 * (src === 'elite' ? 3 : 1) + 15));
  }
});

test('sellValue: metade do valor, por unidade em pilhas', () => {
  const j = { kind: 'jewel', id: 'bless', qty: 5 };
  assert.equal(R.sellValue(j, 1), 45000);
  assert.equal(R.sellValue(j), 45000 * 5);
  assert.equal(R.sellValue(j, 99), 45000 * 5);
  const p = { kind: 'potion', id: 'hp', qty: 10 };
  assert.equal(R.sellValue(p), R.sellValue(p, 1) * 10);
});
