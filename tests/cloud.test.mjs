import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './helpers.mjs';

const ch = (name, level) => ({ name, cls: 'dk', level, tier: 0 });
const save = (...chars) => ({ chars, active: chars.length ? 0 : -1, settings: { quality: 'media' } });

test('decideSync: primeira vez numa conta vazia envia o save local', async () => {
  const { decideSync } = await load('core/cloudSync.js');
  assert.equal(decideSync({ local: save(ch('A', 5)), cloud: null, sync: null, userId: 'u1' }), 'upload');
  assert.equal(decideSync({ local: save(), cloud: null, sync: null, userId: 'u1' }), 'none');
});

test('decideSync: aparelho novo (sem personagens) baixa da nuvem', async () => {
  const { decideSync } = await load('core/cloudSync.js');
  assert.equal(decideSync({ local: save(), cloud: { data: save(ch('A', 9)), rev: 3 }, sync: null, userId: 'u1' }), 'download');
});

test('decideSync: personagens locais nunca vinculados + nuvem com personagens = jogador escolhe', async () => {
  const { decideSync } = await load('core/cloudSync.js');
  const r = decideSync({ local: save(ch('Local', 20)), cloud: { data: save(ch('Nuvem', 30)), rev: 2 }, sync: null, userId: 'u1' });
  assert.equal(r, 'conflict');
  // save local vinculado a OUTRA conta também pede escolha
  assert.equal(decideSync({ local: save(ch('Local', 20)), cloud: { data: save(ch('Nuvem', 30)), rev: 2 }, sync: { userId: 'u2', rev: 2, dirty: false }, userId: 'u1' }), 'conflict');
});

test('decideSync: fluxo normal de um aparelho e de dois aparelhos', async () => {
  const { decideSync } = await load('core/cloudSync.js');
  const cloud = { data: save(ch('A', 10)), rev: 4 };
  // nuvem na mesma revisão que conhecemos: o que mudou aqui sobe
  assert.equal(decideSync({ local: save(ch('A', 11)), cloud, sync: { userId: 'u1', rev: 4, dirty: true }, userId: 'u1' }), 'upload');
  // nuvem avançou em outro aparelho e aqui nada mudou: baixa
  assert.equal(decideSync({ local: save(ch('A', 8)), cloud, sync: { userId: 'u1', rev: 3, dirty: false }, userId: 'u1' }), 'download');
  // os dois mudaram: escolha
  assert.equal(decideSync({ local: save(ch('A', 12)), cloud, sync: { userId: 'u1', rev: 3, dirty: true }, userId: 'u1' }), 'conflict');
});

test('decideSync: saves iguais (mesmo com chaves em outra ordem, como no jsonb) não fazem nada', async () => {
  const { decideSync } = await load('core/cloudSync.js');
  const local = { chars: [{ name: 'A', level: 3, cls: 'dk' }], active: 0, settings: { sound: true, quality: 'alta' } };
  const cloudData = { settings: { quality: 'alta', sound: true }, active: 0, chars: [{ cls: 'dk', level: 3, name: 'A' }] };
  assert.equal(decideSync({ local, cloud: { data: cloudData, rev: 1 }, sync: null, userId: 'u1' }), 'same');
});

test('decideSync: nuvem sem personagens recebe os locais', async () => {
  const { decideSync } = await load('core/cloudSync.js');
  assert.equal(decideSync({ local: save(ch('A', 2)), cloud: { data: save(), rev: 5 }, sync: null, userId: 'u1' }), 'upload');
});

test('saveSummary lista nome, classe e nível', async () => {
  const { saveSummary } = await load('core/cloudSync.js');
  assert.deepEqual(saveSummary(save(ch('A', 7))), [{ name: 'A', cls: 'dk', tier: 0, level: 7, resets: 0 }]);
  assert.deepEqual(saveSummary(null), []);
});

test('loadSave aceita um save vindo da nuvem e persist avisa a nuvem', async () => {
  const { loadSave, persist, S, SaveHooks } = await load('core/state.js');
  const m = new Map();
  globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  loadSave({ chars: [{ name: 'Nuvem', cls: 'dk', zen: 50 }], active: 0 });
  assert.equal(S.chars[0].name, 'Nuvem');
  assert.equal(S.chars[0].gold, 50); // migração de saves antigos vale também para a nuvem
  let n = 0;
  SaveHooks.afterPersist = () => n++;
  persist();
  SaveHooks.afterPersist = null;
  assert.equal(n, 1);
});

test('decideSync: personagens apagados de propósito aqui não voltam sozinhos da nuvem', async () => {
  const { decideSync } = await load('core/cloudSync.js');
  const cloud = { data: save(ch('A', 10)), rev: 5 };
  assert.equal(decideSync({ local: save(), cloud, sync: { userId: 'u1', rev: 4, dirty: true }, userId: 'u1' }), 'conflict');
  // sem mudança local (aparelho que só ficou para trás) continua baixando
  assert.equal(decideSync({ local: save(), cloud, sync: { userId: 'u1', rev: 4, dirty: false }, userId: 'u1' }), 'download');
});
