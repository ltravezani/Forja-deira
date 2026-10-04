import test from 'node:test';
import assert from 'node:assert/strict';
import { load, R } from './helpers.mjs';

const Q = await load('game/questLogic.js');

function freshChar(level) {
  const ch = R.newCharacter('Teste', 'dk');
  ch.level = level || 1;
  return ch;
}

test('missões: saves antigos sem o campo ganham estado válido; veteranos pulam as iniciais', () => {
  const novo = freshChar(1);
  Q.sanitizeQuests(novo);
  assert.equal(novo.quests.ob, 0);
  assert.deepEqual(novo.quests.daily, []);
  const veterano = freshChar(Q.ONBOARD_SKIP_LEVEL + 1);
  Q.sanitizeQuests(veterano);
  assert.equal(veterano.quests.ob, Q.ONBOARD.length);
  const comReset = freshChar(1);
  comReset.resets = 1;
  Q.sanitizeQuests(comReset);
  assert.equal(comReset.quests.ob, Q.ONBOARD.length);
});

test('missões: sanitize limpa dados corrompidos e preserva os válidos', () => {
  const ch = freshChar(30);
  ch.quests = { ob: 99, obProg: NaN, day: 'ontem', bonus: 'sim', daily: [{ k: 'nada', n: 3 }, null] };
  Q.sanitizeQuests(ch);
  assert.equal(ch.quests.ob, Q.ONBOARD.length);
  assert.equal(ch.quests.obProg, 0);
  assert.equal(ch.quests.day, '');
  assert.equal(ch.quests.bonus, false);
  assert.deepEqual(ch.quests.daily, []);
  // ida e volta em JSON mantém as diárias
  Q.ensureDaily(ch, '2026-10-03');
  ch.quests.daily[0].p = 2;
  const back = JSON.parse(JSON.stringify(ch));
  Q.sanitizeQuests(back);
  assert.deepEqual(back.quests, ch.quests);
});

test('sanitizeCharacter cria o campo de missões', async () => {
  const { sanitizeCharacter } = await load('core/state.js');
  const ch = sanitizeCharacter({ name: 'Velho', cls: 'dw', level: 360 });
  assert.equal(ch.quests.ob, Q.ONBOARD.length);
  const n = sanitizeCharacter({ name: 'Novo', cls: 'dw', level: 1 });
  assert.equal(n.quests.ob, 0);
});

test('missões iniciais avançam em sequência com os eventos certos', () => {
  const ch = freshChar(1);
  Q.sanitizeQuests(ch);
  const day = '2026-10-03';
  assert.deepEqual(Q.applyQuestEvent(ch, 'talk', 'smith', day), []); // NPC errado
  let ev = Q.applyQuestEvent(ch, 'talk', 'portal', day);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].t, 'ob');
  assert.equal(ev[0].step.id, 'talk');
  for (let i = 0; i < 4; i++) assert.equal(Q.applyQuestEvent(ch, 'kill', { zone: 'dungeon', biome: 'forest' }, day).filter((e) => e.t === 'ob').length, 0);
  ev = Q.applyQuestEvent(ch, 'kill', { zone: 'dungeon', biome: 'forest' }, day);
  assert.equal(ev.find((e) => e.t === 'ob').step.id, 'kill');
  // distribuir pontos: conferido por poll (soma de atributos acima da base)
  assert.equal(Q.applyQuestEvent(ch, 'poll', null, day).length, 0);
  ch.stats.str += 3;
  assert.equal(Q.applyQuestEvent(ch, 'poll', null, day)[0].step.id, 'stats');
  // equipar: troca no equipamento
  assert.equal(Q.applyQuestEvent(ch, 'poll', null, day).length, 0);
  ch.equip.weapon = { slot: 'weapon', uid: 'abc' };
  assert.equal(Q.applyQuestEvent(ch, 'poll', null, day)[0].step.id, 'equip');
  assert.equal(Q.applyQuestEvent(ch, 'potion', 'hp', day)[0].step.id, 'potion');
  ev = Q.applyQuestEvent(ch, 'tower', 1, day);
  assert.equal(ev[0].step.id, 'tower');
  assert.equal(ev[0].last, true);
  assert.equal(Q.currentOnboard(ch), null);
  for (const s of Q.ONBOARD) assert.ok(s.reward.gold > 0 && s.reward.gold <= 5000, 'recompensa modesta');
});

test('diárias: sorteio determinístico pela data, 3 tipos distintos e recompensa pelo nível', () => {
  const a = freshChar(50), b = freshChar(50);
  const d1 = Q.rollDailies('2026-10-03', a), d2 = Q.rollDailies('2026-10-03', b);
  assert.deepEqual(d1, d2);
  assert.equal(d1.length, Q.DAILY_COUNT);
  assert.equal(new Set(d1.map((d) => d.k)).size, Q.DAILY_COUNT);
  // em alguns dias o sorteio muda
  const days = ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'];
  assert.ok(days.some((d) => JSON.stringify(Q.rollDailies(d, a)) !== JSON.stringify(d1)));
  // nível baixo: sem Torre (nível mínimo 20) e masmorra ao alcance
  for (const d of days.concat('2026-10-03')) {
    for (const q of Q.rollDailies(d, freshChar(5))) {
      assert.notEqual(q.k, 'tower');
      if (q.k === 'zone') assert.equal(q.b, 'forest');
    }
  }
  assert.ok(Q.dailyReward('any', 300).gold > Q.dailyReward('any', 10).gold);
  assert.ok(Q.localDay(new Date(2026, 0, 5)) === '2026-01-05');
});

test('diárias: troca à meia-noite, progresso por evento e resgate com bônus', () => {
  const ch = freshChar(200);
  Q.sanitizeQuests(ch);
  Q.ensureDaily(ch, '2026-10-03');
  // força uma lista conhecida para conferir cada tipo
  ch.quests.daily = [
    { k: 'zone', b: 'castle', n: 2, p: 0, c: false, r: { gold: 100 } },
    { k: 'jewel', n: 1, p: 0, c: false, r: { gold: 100, mp: 10 } },
    { k: 'tower', n: 1, p: 0, c: false, r: { gold: 100 } },
  ];
  Q.applyQuestEvent(ch, 'kill', { zone: 'dungeon', biome: 'forest' }, '2026-10-03');
  assert.equal(ch.quests.daily[0].p, 0);
  Q.applyQuestEvent(ch, 'kill', { zone: 'dungeon', biome: 'castle' }, '2026-10-03');
  const ev = Q.applyQuestEvent(ch, 'kill', { zone: 'dungeon', biome: 'castle' }, '2026-10-03');
  assert.equal(ev[0].t, 'daily');
  Q.applyQuestEvent(ch, 'kill', { zone: 'dungeon', biome: 'castle' }, '2026-10-03');
  assert.equal(ch.quests.daily[0].p, 2, 'não passa do total');
  assert.equal(Q.claimDaily(ch, 1), null, 'não resgata incompleta');
  Q.applyQuestEvent(ch, 'jewel', 'bless', '2026-10-03');
  Q.applyQuestEvent(ch, 'floor', null, '2026-10-03');
  assert.equal(Q.dailyClaimable(ch), 3);
  assert.deepEqual(Q.claimDaily(ch, 0), { gold: 100 });
  assert.equal(Q.claimDaily(ch, 0), null, 'não resgata duas vezes');
  Q.claimDaily(ch, 1);
  const last = Q.claimDaily(ch, 2);
  assert.equal(last.bonus, true);
  assert.equal(last.jewel, Q.DAILY_BONUS.jewel);
  assert.ok(R.JEWELS[last.jewel]);
  // dia seguinte: novas diárias
  assert.equal(Q.ensureDaily(ch, '2026-10-04'), true);
  assert.equal(ch.quests.bonus, false);
  assert.ok(ch.quests.daily.every((d) => d.p === 0 && !d.c));
});

test('Necromancer: limite por tipo de invocação substitui o mais antigo', async () => {
  const { SUMMON_CAP, summonOverflow } = await load('game/summonCap.js');
  const allies = [{ kind: 'pet' }];
  for (let i = 0; i < SUMMON_CAP.skeleton; i++) allies.push({ kind: 'skeleton', n: i });
  allies.push({ kind: 'deathknight', n: 0 }, { kind: 'deathknight', n: 1 });
  const out = summonOverflow(allies, 'skeleton');
  assert.equal(out.length, 1);
  assert.equal(out[0].n, 0, 'sai o mais antigo');
  assert.deepEqual(summonOverflow(allies, 'deathknight').map((a) => a.n), [0]);
  assert.deepEqual(summonOverflow(allies, 'pet'), []);
  assert.deepEqual(summonOverflow(allies, 'spirit'), []);
  assert.deepEqual(summonOverflow([{ kind: 'skeleton' }], 'skeleton'), []);
});
