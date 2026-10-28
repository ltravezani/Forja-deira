import test from 'node:test';
import assert from 'node:assert/strict';
import { load, R } from './helpers.mjs';

const sword = (uid) => ({ slot: 'weapon', uid, rarity: 'raro', tier: 2, plus: 3 });

test('Baú: guarda e retira equipamentos entre dois personagens da mesma conta', async () => {
  const { deposit, withdraw } = await load('game/chest.js');
  const a = { bag: [sword('s1'), { kind: 'jewel', id: 'bless', qty: 5 }] }, b = { bag: [] }, chest = [];
  assert.ok(deposit(a, chest, a.bag[0], 1).ok);
  assert.equal(a.bag.length, 1);
  assert.equal(chest.length, 1);
  const r = withdraw(b, chest, chest[0], 1, 48);
  assert.ok(r.ok);
  assert.equal(b.bag[0].uid, 's1');
  assert.equal(chest.length, 0);
});

test('Baú: pilhas dividem, juntam e só ocupam um espaço', async () => {
  const { deposit, withdraw } = await load('game/chest.js');
  const ch = { bag: [{ kind: 'jewel', id: 'chaos', qty: 10 }] }, chest = [{ kind: 'jewel', id: 'chaos', qty: 2 }];
  assert.equal(deposit(ch, chest, ch.bag[0], 4).n, 4);
  assert.equal(ch.bag[0].qty, 6);
  assert.equal(chest.length, 1);
  assert.equal(chest[0].qty, 6);
  deposit(ch, chest, ch.bag[0], 99);
  assert.equal(ch.bag.length, 0);
  assert.equal(chest[0].qty, 12);
  withdraw(ch, chest, chest[0], 5, 48);
  assert.equal(ch.bag[0].qty, 5);
  assert.equal(chest[0].qty, 7);
  assert.notEqual(ch.bag[0], chest[0], 'parte retirada é outro objeto');
});

test('Baú: respeita o limite de espaços do baú e da mochila', async () => {
  const { deposit, withdraw, CHEST_SIZE } = await load('game/chest.js');
  const chest = Array.from({ length: CHEST_SIZE }, (_, i) => sword('c' + i));
  const ch = { bag: [sword('x'), { kind: 'potion', id: 'hp', qty: 3 }] };
  assert.deepEqual(deposit(ch, chest, ch.bag[0], 1), { ok: false, why: 'full' });
  assert.equal(deposit(ch, chest, ch.bag[1], 3).why, 'full');
  assert.equal(ch.bag.length, 2);
  const full = { bag: Array.from({ length: 48 }, (_, i) => sword('b' + i)) };
  assert.equal(withdraw(full, chest, chest[0], 1, 48).why, 'full');
  assert.equal(chest.length, CHEST_SIZE);
  assert.equal(deposit(ch, chest, sword('fora'), 1).why, 'gone');
});

test('Baú: retirar usa a mochila expandida (página 2 do Mestre Orvan)', async () => {
  const { withdraw } = await load('game/chest.js');
  const ch = R.newCharacter('T', 'dk');
  ch.bag = Array.from({ length: R.RATES.bagPage }, (_, i) => sword('b' + i));
  const chest = [sword('c1'), sword('c2')];
  assert.equal(withdraw(ch, chest, chest[0], 1, R.bagSize(ch)).why, 'full');
  ch.gold = R.RATES.bagExpandGold;
  assert.ok(R.applyExpandBag(ch).ok);
  assert.ok(withdraw(ch, chest, chest[0], 1, R.bagSize(ch)).ok);
  assert.equal(ch.bag.length, R.RATES.bagPage + 1);
  ch.bag.length = R.bagSize(ch);
  ch.bag.fill(sword('z'), R.RATES.bagPage + 1);
  assert.equal(withdraw(ch, chest, chest[0], 1, R.bagSize(ch)).why, 'full');
});

test('loadSave: baú vem vazio em saves antigos e descarta itens desconhecidos', async () => {
  const { loadSave, S } = await load('core/state.js');
  loadSave({ chars: [{ name: 'A', cls: 'dk', bag: [], equip: {} }], active: 0 });
  assert.deepEqual(S.chest, []);
  loadSave({ chars: [], chest: [sword('ok'), null, { kind: 'jewel', id: 'nada', qty: 1 }, { kind: 'potion', id: 'hp', qty: 'x' }, { slot: 'cauda' }] });
  assert.equal(S.chest.length, 2);
  assert.equal(S.chest[0].uid, 'ok');
  assert.equal(S.chest[1].qty, 1);
  loadSave({ chars: [], chest: 'lixo' });
  assert.deepEqual(S.chest, []);
  assert.ok(R.SLOTS.includes('weapon'));
});
