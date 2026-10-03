import test from 'node:test';
import assert from 'node:assert/strict';
import { R } from './helpers.mjs';

const CLASSES = ['dk', 'dw', 'elf', 'de', 'nc'];

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

test('torre: Gold em dobro em relação à masmorra (mesma fórmula x2)', () => {
  assert.equal(R.TOWER.goldMult, 2);
  assert.equal(R.TOWER.monsterMult, 2);
  for (let i = 0; i < 500; i++) for (const src of ['normal', 'elite', 'boss']) {
    const seed = R.hash32('twg', src, i), d = R.rollTowerDrop({ seed, mLevel: 90, src });
    if (!d.gold) continue;
    const rnd = R.mulberry32(seed);
    rnd(); // consome o sorteio de chance (gold ou tesouro do chefe)
    assert.equal(d.gold, R.goldAmount(90, src, rnd()) * 2);
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

test('Dark Elf e Necromancer usam os itens das classes indicadas', () => {
  const it = (slot, cls) => ({ slot, cls });
  assert.ok(R.canUse('de', it('weapon', 'dk')));
  assert.ok(!R.canUse('de', it('weapon', 'elf')));
  assert.ok(R.canUse('de', it('armor', 'elf')) && R.canUse('de', it('boots', 'elf')));
  assert.ok(!R.canUse('de', it('armor', 'dk')));
  assert.ok(R.canUse('nc', it('weapon', 'dw')) && R.canUse('nc', it('helm', 'dw')));
  assert.ok(!R.canUse('nc', it('weapon', 'dk')));
  assert.ok(R.canUse('nc', it('ring', null)));
  // as classes antigas continuam só com os próprios itens
  assert.ok(R.canUse('dk', it('weapon', 'dk')) && !R.canUse('dk', it('armor', 'elf')));
  assert.deepEqual(R.itemUsers(it('weapon', 'dk')), ['Dark Knight', 'Dark Elf']);
  // drops favorecidos pela classe nova saem com a classe do item (nunca 'de'/'nc')
  for (let i = 0; i < 400; i++) {
    for (const c of ['de', 'nc']) {
      const e = R.makeEquip(R.hash32('nova', c, i), 60, null, c, 0, 'normal');
      assert.ok(e.cls == null || ['dk', 'dw', 'elf'].includes(e.cls), c + ': ' + e.cls);
      assert.ok(R.itemName(e));
    }
  }
});

test('classes novas: 3 evoluções, habilidades e árvore completas', () => {
  for (const c of ['de', 'nc']) {
    assert.equal(R.CLASSES[c].tiers.length, 3);
    const sk = R.skillsFor(c);
    assert.ok(sk.length >= 6, c);
    assert.ok(sk.some((id) => R.SKILLS[id].lvl === 1));
    assert.ok(sk.some((id) => R.SKILLS[id].tier === 1) && sk.some((id) => R.SKILLS[id].tier === 2));
    for (const br of R.TREES[c]) for (const n of br.nodes) if (n[0].indexOf('skill:') === 0) assert.equal(R.SKILLS[n[0].slice(6)].cls, c);
  }
  // Necromancer tem dano mágico e roubo de vida próprio
  const ch = R.newCharacter('N', 'nc');
  const st = R.deriveStats(ch, []);
  assert.ok(st.lifeSteal > 0 && st.maxDmg > 0);
});


test('Lendário (+0, sem Sorte) nunca dá menos CP que Excelente da mesma base e mesma opção adicional', () => {
  const pieces = ['weapon', 'armor', 'helm', 'gloves', 'boots', 'ring', 'pendant'];
  for (const cls of CLASSES) {
    for (const level of [50, 400, 1000]) {
      const ch = R.newCharacter('T', cls);
      ch.level = level;
      ch.points = level * 5;
      R.autoDistribute(ch, level * 5);
      const cp = (it) => { ch.equip[it.slot] = it; return R.combatPower(R.deriveStats(ch, [])); };
      for (const slot of pieces) {
        const gcls = slot === 'ring' || slot === 'pendant' ? null : R.gearCls(cls, slot);
        const pool = Object.keys(slot === 'weapon' || slot === 'pendant' ? R.EXC_WEAPON : R.EXC_ARMOR);
        for (const tier of [0, 4, 9]) for (const addOpt of [0, 16]) {
          const base = { slot, cls: gcls, tier, plus: 0, skill: slot === 'weapon', anc: null, addOpt };
          // melhor Excelente possível: com Sorte e o melhor par de opções excelentes
          let best = 0;
          for (let a = 0; a < pool.length; a++) for (let b = a + 1; b < pool.length; b++) {
            best = Math.max(best, cp({ ...base, rarity: 'excelente', luck: true, exc: [pool[a], pool[b]], legend: null }));
          }
          for (const legend of Object.keys(R.LEGEND)) {
            const leg = { ...base, rarity: 'lendario', luck: false, exc: [], legend };
            const c0 = cp(leg);
            assert.ok(c0 >= best, cls + ' nv' + level + ' ' + slot + ' t' + tier + ' opt' + addOpt + ' ' + legend + ': ' + c0 + ' < ' + best);
            if (level === 1000) assert.ok(cp({ ...leg, plus: 10 }) > c0, slot + ': +10 precisa aumentar CP');
          }
        }
      }
    }
  }
});

test('+nível do colar aumenta o dano', () => {
  const p = { slot: 'pendant', cls: null, tier: 5, rarity: 'excelente', plus: 0, exc: [] };
  const d0 = R.itemStats(p).dmgPct, d10 = R.itemStats({ ...p, plus: 10 }).dmgPct, d15 = R.itemStats({ ...p, plus: 15 }).dmgPct;
  assert.ok(d10 > d0 && d15 > d10, d0 + ' ' + d10 + ' ' + d15);
});

test('custo da fusão Chaos: +10 = 1 joia … +15 = 6 joias', () => {
  const it = (plus) => ({ slot: 'weapon', plus, addOpt: 0 });
  [[9, 1], [10, 2], [11, 3], [12, 4], [13, 5], [14, 6]].forEach(([p, n]) => assert.equal(R.upgradeCost(it(p), 'chaos'), n, '+' + (p + 1)));
  assert.equal(R.upgradeCost(it(3), 'bless'), 1);
  assert.equal(R.upgradeCost(it(7), 'soul'), 1);
  assert.equal(R.upgradeCost(it(12), 'life'), 1);
});

test('reset dá 300 pontos por reset e zera a árvore de maestria', () => {
  const ch = R.newCharacter('Teste', 'dk');
  ch.level = 400; ch.gold = 1e9;
  ch.tree = { [R.treeNodeId('dk', 0, 0)]: 3 };
  assert.equal(R.applyReset(ch).ok, true);
  assert.equal(ch.points, 300);
  assert.deepEqual(ch.tree, {});
  assert.equal(R.treeSpent(ch), 0);
  ch.level = 410; ch.gold = 1e9;
  R.applyReset(ch);
  assert.equal(ch.points, 2 * 300 + 10 * R.RATES.resetBonusPerLevel);
});
