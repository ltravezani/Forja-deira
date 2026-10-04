// Textos exibidos: termos em português, concordância de raridade e afixos, números pt-BR e risco do portal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { R, load } from './helpers.mjs';

const equip = (slot, cls, tier, rarity, extra) => Object.assign({ uid: 'x', slot, cls, tier, rarity, plus: 0, luck: false, skill: false, addOpt: 0, exc: [], anc: null, legend: null, seed: '0' }, extra);

test('joias com nome em português (ids internos iguais)', () => {
  assert.deepEqual(Object.keys(R.JEWELS), ['bless', 'soul', 'chaos', 'life']);
  assert.equal(R.itemName({ kind: 'jewel', id: 'bless' }), 'Joia da Bênção');
  assert.equal(R.itemName({ kind: 'jewel', id: 'soul' }), 'Joia da Alma');
  assert.equal(R.itemName({ kind: 'jewel', id: 'chaos' }), 'Joia do Caos');
  assert.equal(R.itemName({ kind: 'jewel', id: 'life' }), 'Joia da Vida');
  for (const j of Object.values(R.JEWELS)) assert.doesNotMatch(j.name + j.desc, /Jewel/);
  assert.doesNotMatch(R.TALISMANS.luck.desc, /Jewel/);
});

test('raridade depois do nome, no gênero e número certos', () => {
  assert.equal(R.itemName(equip('weapon', 'dk', 2, 'lendario')), 'Katana Lendária');
  assert.equal(R.itemName(equip('ring', null, 0, 'magico')), 'Anel de Ferro Mágico');
  assert.equal(R.itemName(equip('weapon', 'elf', 0, 'ancestral', { plus: 7 })), 'Arco Curto Ancestral +7');
  assert.equal(R.itemName(equip('weapon', 'elf', 2, 'magico')), 'Besta Leve Mágica');
  assert.equal(R.itemName(equip('weapon', 'dw', 0, 'lendario')), 'Cajado de Carvalho Lendário');
  assert.equal(R.itemName(equip('armor', 'dk', 0, 'magico')), 'Armadura de Couro Mágica');
  assert.equal(R.itemName(equip('boots', 'dk', 0, 'lendario')), 'Botas de Couro Lendárias');
  assert.equal(R.itemName(equip('helm', 'dk', 0, 'excelente')), 'Elmo de Couro Excelente');
  assert.equal(R.itemName(equip('gloves', 'dk', 0, 'ancestral')), 'Luvas de Couro Ancestrais');
  assert.equal(R.itemName(equip('weapon', 'dk', 0, 'comum')), 'Espada Curta');
  assert.equal(R.itemName(equip('wings', null, 0, 'magico', { stage: 1, plus: 12 })), 'Asas de Pena Mágicas Ascendidas +12');
});

test('afixo de elite concorda com o monstro', async () => {
  const { AFFIX, MON, monsterName } = await load('game/data.js');
  assert.equal(monsterName(MON.spider, AFFIX.vampirico), 'Aranha Tecelã Vampírica');
  assert.equal(monsterName(MON.wolf, AFFIX.vampirico), 'Lobo Sombrio Vampírico');
  assert.equal(monsterName(MON.queen, AFFIX.explosivo), 'Rainha Aracnídea Explosiva');
  assert.equal(monsterName(MON.spider, AFFIX.veloz), 'Aranha Tecelã Veloz');
  assert.equal(monsterName(MON.spider, null), 'Aranha Tecelã');
});

test('números com vírgula decimal', async () => {
  const { dec } = await load('core/util.js');
  assert.equal(dec(1.5), '1,5');
  assert.equal(dec(1, 3), '1,000');
  assert.equal(dec(0.12345, 5), '0,12345');
  assert.equal(dec(12.3456, 2), '12,35');
});

test('risco do portal pela diferença de nível', () => {
  assert.equal(R.levelRisk(3, 1), 'ok');
  assert.equal(R.levelRisk(30, 1), 'deadly');
  assert.equal(R.levelRisk(20, 1), 'hard');
  assert.equal(R.levelRisk(180, 1), 'deadly');
  assert.equal(R.levelRisk(3, 220), 'easy');
  assert.equal(R.levelRisk(225, 220), 'ok');
});

test('textos de regras em Ouro, sem Gold', () => {
  const ch = R.newCharacter('Teste', 'dk');
  ch.level = 400; ch.gold = 0;
  assert.ok(R.canReset(ch).reasons.some((r) => /de Ouro$/.test(r)));
  assert.doesNotMatch(R.EXC_ARMOR.gold30.t, /Gold/);
});
