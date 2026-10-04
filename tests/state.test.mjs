import test from 'node:test';
import assert from 'node:assert/strict';
import { load, R } from './helpers.mjs';

function fakeStorage(data) {
  const m = new Map(Object.entries(data || {}));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

test('sanitizeCharacter corrige números inválidos e campos ausentes', async () => {
  const { sanitizeCharacter } = await load('core/state.js');
  const ch = { name: 'X', cls: 'dw', level: NaN, gold: 'muito', stats: { str: Infinity }, bag: [null, { kind: 'potion', id: 'hp', qty: 2 }], equip: { weapon: null }, skillBar: ['ball', 'twist', 'nada'] };
  sanitizeCharacter(ch);
  assert.equal(ch.level, 1);
  assert.equal(ch.gold, R.newCharacter('X', 'dw').gold);
  for (const k of ['str', 'agi', 'vit', 'ene']) assert.ok(Number.isFinite(ch.stats[k]));
  assert.equal(ch.bag.length, 1);
  assert.deepEqual(Object.keys(ch.equip), []);
  assert.deepEqual(ch.skillBar, ['ball']);
  const st = R.deriveStats(ch, []);
  assert.ok(Number.isFinite(st.maxHp));
});

test('loadSave migra saves antigos (remove Web3) e tolera save corrompido', async () => {
  const { loadSave, S, SAVE_KEY } = await load('core/state.js');
  const old = { chars: [{ name: 'Velho', cls: 'dk', bag: [{ kind: 'jewel', id: 'bless', qty: 1, nft: { tokenId: 1 } }], equip: {} }], wallet: { trz: 1 }, market: {}, active: 0 };
  globalThis.localStorage = fakeStorage({ [SAVE_KEY]: JSON.stringify(old) });
  loadSave();
  assert.equal(S.wallet, undefined);
  assert.equal(S.market, undefined);
  assert.equal(S.chars[0].bag[0].nft, undefined);
  globalThis.localStorage = fakeStorage({ [SAVE_KEY]: '{isto não é json' });
  loadSave();
  assert.deepEqual(S.chars, []);
  assert.equal(S.active, -1);
});

test('loadSave converte o Zen de saves antigos em Gold sem perder saldo', async () => {
  const { loadSave, S, SAVE_KEY } = await load('core/state.js');
  const armor = { slot: 'armor', exc: ['zen30', 'hp4'] };
  const old = { chars: [{ name: 'Rico', cls: 'dk', zen: 123456, bag: [armor], equip: { gloves: { slot: 'gloves', exc: ['zen30'] } } }], active: 0 };
  globalThis.localStorage = fakeStorage({ [SAVE_KEY]: JSON.stringify(old) });
  loadSave();
  const ch = S.chars[0];
  assert.equal(ch.gold, 123456);
  assert.equal('zen' in ch, false);
  assert.deepEqual(ch.bag[0].exc, ['gold30', 'hp4']);
  assert.deepEqual(ch.equip.gloves.exc, ['gold30']);
});

test('personagens das classes novas sobrevivem ao save (sanitize e ida e volta em JSON)', async () => {
  const { sanitizeCharacter } = await load('core/state.js');
  for (const cls of ['de', 'nc']) {
    const ch = R.newCharacter('Nova', cls);
    ch.equip.weapon = R.makeEquip(R.hash32('t', cls), 0, 'comum', cls, 0, 'normal');
    ch.equip.weapon.slot = 'weapon'; ch.equip.weapon.cls = R.gearCls(cls, 'weapon');
    ch.skillBar.push('twist'); // habilidade de outra classe sai da barra
    const back = sanitizeCharacter(JSON.parse(JSON.stringify(ch)));
    assert.equal(back.cls, cls);
    assert.deepEqual(back.skillBar, R.skillsFor(cls).filter((k) => R.SKILLS[k].lvl <= 1));
    assert.ok(R.canUse(cls, back.equip.weapon));
    assert.ok(Number.isFinite(R.deriveStats(back, []).maxDmg));
  }
});

test('automação: saves antigos começam desligados e opções inválidas são limpas', async () => {
  const { sanitizeCharacter } = await load('core/state.js');
  const old = sanitizeCharacter({ name: 'Velho', cls: 'dw', level: 360 });
  assert.deepEqual(old.autoSkills, []);
  assert.equal(old.autoLoot, false);
  assert.equal(old.autoPetSell, false);
  const ch = sanitizeCharacter({ name: 'Y', cls: 'dw', autoSkills: ['ball', 'twist', 'ball', 'nada'], autoLoot: true, autoPetSell: 'sim' });
  assert.deepEqual(ch.autoSkills, ['ball']);
  assert.equal(ch.autoLoot, true);
  assert.equal(ch.autoPetSell, false);
  const back = sanitizeCharacter(JSON.parse(JSON.stringify(ch)));
  assert.deepEqual(back.autoSkills, ['ball']);
  assert.equal(back.autoLoot, true);
});

test('sanitizeCharacter limita tier, árvore e campos dos itens de saves corrompidos', async () => {
  const { sanitizeCharacter } = await load('core/state.js');
  const n0 = R.treeNodeId('dk', 0, 0), n1 = R.treeNodeId('dk', 1, 0);
  const ch = sanitizeCharacter({
    name: 'Z', cls: 'dk', level: 100, tier: 3.7, treeV: 2,
    tree: { [n0]: 9, [n1]: 'x', 'nc.0.0': 2 },
    bag: [{ slot: 'armor', cls: 'dk', tier: 'a', plus: NaN, rarity: 'mítico' }, { kind: 'jewel', id: 'bless', qty: NaN }],
    equip: { weapon: { slot: 'weapon', cls: 'dk', tier: 1, plus: 99, rarity: 'magico', locked: 'sim' } },
  });
  assert.equal(ch.tier, 2);
  assert.deepEqual(Object.keys(ch.tree), [n0]);
  assert.equal(ch.tree[n0], 5);
  assert.ok(R.treeSpent(ch) <= R.treePoints(ch));
  assert.equal(ch.bag[0].tier, 0);
  assert.equal(ch.bag[0].plus, 0);
  assert.equal(ch.bag[0].rarity, 'comum');
  assert.equal(ch.bag[1].qty, 1);
  assert.equal(ch.equip.weapon.plus, 15);
  assert.equal(ch.equip.weapon.locked, undefined);
  const st = R.deriveStats(ch, []);
  for (const k of ['maxHp', 'minDmg', 'maxDmg', 'attackInterval']) assert.ok(Number.isFinite(st[k]), k);
  // árvore acima dos pontos disponíveis é cortada
  const poor = sanitizeCharacter({ name: 'P', cls: 'dk', level: 20, treeV: 2, tree: { [n0]: 5, [n1]: 5 } });
  assert.equal(R.treeSpent(poor), R.treePoints(poor));
});

test('sanitizeCharacter devolve os pontos de maestria de saves da árvore antiga', async () => {
  const { sanitizeCharacter } = await load('core/state.js');
  const ch = sanitizeCharacter({ name: 'V', cls: 'dk', level: 400, resets: 2, tier: 1, tree: { [R.treeNodeId('dk', 0, 0)]: 5, [R.treeNodeId('dk', 1, 0)]: 5 } });
  assert.deepEqual(ch.tree, {});
  assert.equal(ch.treeV, 2);
  assert.equal(R.treePoints(ch), 24);
  ch.tree[R.treeNodeId('dk', 0, 0)] = 3;
  assert.equal(sanitizeCharacter(ch).tree[R.treeNodeId('dk', 0, 0)], 3);
});
