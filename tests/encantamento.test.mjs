import test from 'node:test';
import assert from 'node:assert/strict';
import { load, R } from './helpers.mjs';

const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };
const sword = () => ({ slot: 'weapon', cls: 'dk', uid: 'w1', rarity: 'excelente', tier: 4, plus: 7, exc: [] });
const armor = () => ({ slot: 'armor', cls: 'dk', uid: 'a1', rarity: 'comum', tier: 2, plus: 0, exc: [] });
const hero = (bag, gold = 0) => ({ bag, equip: {}, gold });

test('Joia da Escuridão: 0,5% no Éden e 0,1% nos outros mapas', () => {
  const N = 200000;
  let eden = 0, dun = 0, tower = 0;
  for (let i = 0; i < N; i++) {
    const seed = R.hash32(12345, i);
    if (R.rollEdenDrop({ seed, mLevel: 300, src: 'normal', mf: 0 }).jewels.includes('dark')) eden++;
    if (R.rollDrop({ seed, mLevel: 300, src: 'normal', mf: 0 }).jewels.includes('dark')) dun++;
    if (R.rollTowerDrop({ seed, mLevel: 300, src: 'normal' }).jewels.includes('dark')) tower++;
  }
  assert.ok(Math.abs(eden / N - 0.005) < 0.001, 'Éden ' + eden / N);
  assert.ok(Math.abs(dun / N - 0.001) < 0.0004, 'masmorra ' + dun / N);
  assert.ok(Math.abs(tower / N - 0.001) < 0.0004, 'torre ' + tower / N);
});

test('Encantar: gasta 1 joia, linha do slot, até 3 sem repetir', async () => {
  const { enchantItem } = await load('game/enchant.js');
  const it = sword(), ch = hero([it, { kind: 'jewel', id: 'dark', qty: 5 }]);
  for (let i = 0; i < 3; i++) assert.ok(enchantItem(ch, it, Math.random).ok);
  assert.equal(it.ench.length, 3);
  assert.equal(new Set(it.ench.map((e) => e.id)).size, 3);
  assert.ok(it.ench.every((e) => R.ENCHANTS[e.id].pool !== 'def'), 'arma só recebe linhas ofensivas ou gerais');
  assert.equal(ch.bag.find((b) => b.id === 'dark').qty, 2);
  assert.deepEqual(enchantItem(ch, it, Math.random), { ok: false, why: 'full' });
  assert.equal(ch.bag.find((b) => b.id === 'dark').qty, 2, 'não gasta joia sem espaço');
});

test('Encantar: grau Menor 70%, Maior 25%, Supremo 5%; soma nos atributos e no CP', () => {
  assert.deepEqual(R.rollEnchant(armor(), seq(0, 0.99)), { id: R.enchantPool(armor())[0], g: 0 });
  assert.equal(R.rollEnchant(armor(), seq(0, 0.06)).g, 1);
  assert.equal(R.rollEnchant(armor(), seq(0, 0.04)).g, 2);
  const a = armor(), cp = R.itemCP(a);
  a.ench = [{ id: 'hp', g: 2 }];
  assert.equal(R.itemStats(a).hpPct, 7);
  assert.ok(R.itemCP(a) > cp);
  assert.equal(R.enchantText({ id: 'cd', g: 1 }), 'Recarga de habilidades -4%');
});

test('Retirar encantamento custa Ouro (tier e grau) e libera o espaço', async () => {
  const { removeEnchant } = await load('game/enchant.js');
  const it = sword(); it.ench = [{ id: 'dmg', g: 1 }, { id: 'crit', g: 0 }];
  const cost = R.enchantRemoveCost(it, it.ench[0]);
  assert.equal(cost, 4000000); // 1M × (1 + 4 × 25%) × 2
  const ch = hero([it], cost - 1);
  assert.equal(removeEnchant(ch, it, 0).why, 'gold');
  ch.gold = cost + 10;
  assert.ok(removeEnchant(ch, it, 0).ok);
  assert.equal(ch.gold, 10);
  assert.deepEqual(it.ench, [{ id: 'crit', g: 0 }]);
  ch.gold = 1e9; removeEnchant(ch, it, 0);
  assert.equal(it.ench, undefined);
});

test('Combinar joias: 3 viram 1, cobra a taxa e a Escuridão sai com 5%', async () => {
  const { combineJewels, combineTimes } = await load('game/enchant.js');
  const ch = hero([{ kind: 'jewel', id: 'bless', qty: 4 }, { kind: 'jewel', id: 'chaos', qty: 2 }], R.COMBINE.fee * 5);
  assert.equal(combineTimes(ch, ['bless', 'bless', 'chaos']), 2);
  assert.equal(combineJewels(ch, ['bless', 'dark', 'chaos'], Math.random, 48).why, 'picks');
  const r = combineJewels(ch, ['bless', 'bless', 'chaos'], seq(0.01), 48);
  assert.deepEqual(r.got, ['dark']);
  assert.equal(ch.bag.find((b) => b.id === 'bless').qty, 2);
  assert.equal(ch.bag.find((b) => b.id === 'chaos').qty, 1);
  assert.equal(ch.bag.find((b) => b.id === 'dark').qty, 1);
  assert.equal(ch.gold, R.COMBINE.fee * 4);
  assert.equal(combineJewels(ch, ['bless', 'bless', 'chaos'], seq(0.5, 0.3), 48, 2).why, 'short');
  let dark = 0; const N = 100000, rnd = Math.random;
  for (let i = 0; i < N; i++) if (R.rollCombine(rnd) === 'dark') dark++;
  assert.ok(Math.abs(dark / N - 0.05) < 0.005, 'Escuridão ' + dark / N);
});

test('Combinar joias: mochila cheia sem pilha para a joia nova não combina', async () => {
  const { combineJewels } = await load('game/enchant.js');
  const bag = [{ kind: 'jewel', id: 'soul', qty: 9 }];
  while (bag.length < 48) bag.push(armor());
  const ch = hero(bag, 1e9);
  assert.equal(combineJewels(ch, ['soul', 'soul', 'soul'], Math.random, 48).why, 'full');
  assert.equal(bag[0].qty, 9);
});

test('Save: encantamentos inválidos são limpos', async () => {
  const { sanitizeChest } = await load('core/state.js');
  const a = armor(); a.ench = [{ id: 'hp', g: 9 }, { id: 'hp', g: 0 }, { id: 'dmg', g: 1 }, { id: 'xx', g: 0 }, null];
  const [b] = sanitizeChest([a]);
  assert.deepEqual(b.ench, [{ id: 'hp', g: 2 }]);
  const c = armor(); c.ench = 'lixo';
  assert.equal(sanitizeChest([c])[0].ench, undefined);
  assert.ok(sanitizeChest([{ kind: 'jewel', id: 'dark', qty: 2 }]).length === 1);
});

test('Cidade: a Encantadora Morgana fica no lugar da antiga arena', async () => {
  const { NPCS } = await load('game/data.js');
  assert.ok(NPCS.enchant && !NPCS.duel);
  assert.equal(NPCS.enchant.look.gltf, 'rogueFem');
});
