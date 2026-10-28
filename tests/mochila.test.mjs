import test from 'node:test';
import assert from 'node:assert/strict';
import { load, R } from './helpers.mjs';

test('mochila começa com 1 página e o Mestre Orvan libera a página 2 por Ouro', () => {
  const ch = R.newCharacter('T', 'dk');
  assert.equal(R.bagPages(ch), 1);
  assert.equal(R.bagSize(ch), R.RATES.bagPage);
  ch.gold = R.RATES.bagExpandGold - 1;
  const no = R.canExpandBag(ch);
  assert.equal(no.ok, false);
  assert.ok(no.reasons.some((r) => /de Ouro$/.test(r)));
  assert.equal(R.applyExpandBag(ch).ok, false);
  assert.equal(ch.gold, R.RATES.bagExpandGold - 1);
  ch.gold = R.RATES.bagExpandGold + 5;
  assert.equal(R.applyExpandBag(ch).ok, true);
  assert.equal(ch.gold, 5);
  assert.equal(R.bagPages(ch), 2);
  assert.equal(R.bagSize(ch), R.RATES.bagPage * 2);
  // só uma expansão: não cobra de novo
  ch.gold = R.RATES.bagExpandGold * 3;
  assert.equal(R.applyExpandBag(ch).ok, false);
  assert.equal(ch.gold, R.RATES.bagExpandGold * 3);
});

test('save sem expansão fica com 1 página; expansão sobrevive ao sanitize', async () => {
  const { sanitizeCharacter } = await load('core/state.js');
  const old = { name: 'A', cls: 'dw', bag: [] };
  sanitizeCharacter(old);
  assert.equal(old.bagExp, 0);
  assert.equal(R.bagSize(old), R.RATES.bagPage);
  const exp = { name: 'B', cls: 'dw', bag: [], bagExp: 1 };
  sanitizeCharacter(exp);
  assert.equal(R.bagSize(exp), R.RATES.bagPage * 2);
});
