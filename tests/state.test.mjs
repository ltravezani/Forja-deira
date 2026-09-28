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

test('loadSave lê o save do nome antigo (MU TRZ) quando não há save novo', async () => {
  const { loadSave, S, SAVE_KEY, LEGACY_SAVE_KEYS } = await load('core/state.js');
  const old = { chars: [{ name: 'Antigo', cls: 'dw', bag: [], equip: {} }], active: 0 };
  globalThis.localStorage = fakeStorage({ [LEGACY_SAVE_KEYS[0]]: JSON.stringify(old) });
  loadSave();
  assert.equal(S.chars[0].name, 'Antigo');
  assert.notEqual(SAVE_KEY, LEGACY_SAVE_KEYS[0]);
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
