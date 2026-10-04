// =============================================================================
// Missões: regras puras (sem DOM nem Three.js), usadas pelo jogo e pelos testes.
// Duas trilhas no save de cada personagem (ch.quests):
//   - iniciais: sequência fixa que apresenta o jogo ao novato (uma por vez);
//   - diárias: 3 sorteadas por dia (data local), iguais o dia todo para o mesmo
//     personagem, com recompensa ajustada ao nível no momento do sorteio.
// Os eventos do jogo (abate, conversa, poção, andar da torre, joia) chegam por
// applyQuestEvent; distribuir pontos e equipar item são conferidos por "poll".
// =============================================================================
import { R } from '../core/util.js';
import { NPCS } from './data.js';
import { BIOMES, DUNGEON_ORDER } from '../world/biomes.js';

/** Missões iniciais, na ordem. `npc` = alvo marcado no minimapa. Recompensas modestas (Ouro e poções). */
export const ONBOARD = [
  { id: 'talk', need: 1, npc: 'portal', text: () => 'Fale com a ' + NPCS.portal.name, hint: 'Ela abre os portais das masmorras, ao norte da praça.', reward: { gold: 500 } },
  { id: 'kill', need: 5, text: () => 'Derrote 5 monstros', hint: 'Escolha a Floresta no portal da Guardiã.', reward: { gold: 1000, hp: 5 } },
  { id: 'stats', need: 1, text: () => 'Distribua pontos de atributo', hint: 'Abra Personagem (C) e use os botões +1.', reward: { gold: 1500 } },
  { id: 'equip', need: 1, text: () => 'Equipe um item', hint: 'Abra o Inventário (I) e toque duas vezes num equipamento.', reward: { gold: 1500, mp: 5 } },
  { id: 'potion', need: 1, text: () => 'Beba uma poção', hint: 'Tecla Q (vida) ou E (mana), ou o botão de poção na barra.', reward: { gold: 2000 } },
  { id: 'tower', need: 1, npc: 'tower', text: () => 'Entre na Torre Infinita', hint: 'Fale com o ' + NPCS.tower.name + ', ao sul da praça.', reward: { gold: 5000, hp: 10 } },
];
/** Personagens que já passaram disso pulam as missões iniciais. */
export const ONBOARD_SKIP_LEVEL = 10;

/**
 * Tipos de missão diária. n = quantidade, w = peso da recompensa,
 * min = nível mínimo do personagem para o tipo entrar no sorteio.
 */
export const DAILY = {
  zone: { n: 50, w: 1, min: 1, text: (q) => 'Derrote ' + q.n + ' monstros em ' + BIOMES[q.b].name },
  any: { n: 120, w: 1.2, min: 1, text: (q) => 'Derrote ' + q.n + ' monstros' },
  elite: { n: 6, w: 1.2, min: 1, text: (q) => 'Derrote ' + q.n + ' monstros de elite' },
  boss: { n: 2, w: 1.5, min: 1, text: (q) => 'Derrote ' + q.n + ' guardiões' },
  tower: { n: 3, w: 1.5, min: 20, text: (q) => 'Conquiste ' + q.n + ' andares da Torre Infinita' },
  jewel: { n: 2, w: 1, min: 1, text: (q) => 'Colete ' + q.n + ' joias' },
};
export const DAILY_COUNT = 3;
/** Bônus por resgatar as três diárias do dia: uma joia (id de R.JEWELS) e Ouro. */
export const DAILY_BONUS = { jewel: 'bless', goldPerLevel: 300 };

/** Data local no formato AAAA-MM-DD (o dia vira à meia-noite do relógio do jogador). */
export function localDay(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/** Recompensa de uma diária: Ouro proporcional ao nível (≈ 20 a 30 abates do nível) e 10 poções. */
export function dailyReward(kind, level) {
  const w = DAILY[kind].w;
  const gold = Math.round(((Math.max(1, level) * 600 + 2000) * w) / 100) * 100;
  return kind === 'jewel' || kind === 'tower' ? { gold, mp: 10 } : { gold, hp: 10 };
}
/** Masmorra da missão "derrote N em X": a mais funda (ou a anterior) que o nível alcança. */
function dailyBiome(level, rnd) {
  const ok = DUNGEON_ORDER.filter((k) => BIOMES[k].base <= level + 5);
  const top = ok.slice(-2);
  return top[Math.floor(rnd() * top.length)] || DUNGEON_ORDER[0];
}
/** Sorteio das diárias: determinístico pela data e pelo nome do personagem. */
export function rollDailies(day, ch) {
  const rnd = R.mulberry32(R.hash32('missoes', day, ch.name));
  const kinds = Object.keys(DAILY).filter((k) => ch.level >= DAILY[k].min);
  for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
  return kinds.slice(0, DAILY_COUNT).map((k) => {
    const q = { k, n: DAILY[k].n, p: 0, c: false, r: dailyReward(k, ch.level) };
    if (k === 'zone') q.b = dailyBiome(ch.level, rnd);
    return q;
  });
}
/** Troca as diárias quando o dia muda. Devolve true se sorteou de novo. */
export function ensureDaily(ch, day) {
  const q = ch.quests;
  if (q.day === day && q.daily.length) return false;
  q.day = day;
  q.daily = rollDailies(day, ch);
  q.bonus = false;
  return true;
}

// ---------- estado no save ----------
const int = (v, d) => (Number.isFinite(v) ? Math.max(0, Math.floor(v)) : d);
function cleanReward(r) {
  const o = {};
  if (r && typeof r === 'object') for (const k of ['gold', 'hp', 'mp']) if (Number.isFinite(r[k]) && r[k] > 0) o[k] = Math.floor(r[k]);
  return o;
}
/**
 * Corrige (ou cria) ch.quests vindo do save. Saves antigos sem o campo: quem já
 * passou do nível 10 (ou tem reset) começa com as missões iniciais concluídas.
 */
export function sanitizeQuests(ch) {
  const old = ch.quests && typeof ch.quests === 'object' ? ch.quests : null;
  const veteran = (ch.level || 1) > ONBOARD_SKIP_LEVEL || (ch.resets || 0) > 0;
  const q = { ob: veteran ? ONBOARD.length : 0, obProg: 0, obBase: null, day: '', daily: [], bonus: false };
  if (old) {
    q.ob = Math.min(ONBOARD.length, int(old.ob, q.ob));
    q.obProg = int(old.obProg, 0);
    q.obBase = typeof old.obBase === 'number' || typeof old.obBase === 'string' ? old.obBase : null;
    q.day = typeof old.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(old.day) ? old.day : '';
    q.bonus = old.bonus === true;
    if (Array.isArray(old.daily)) {
      q.daily = old.daily.filter((d) => d && DAILY[d.k] && (d.k !== 'zone' || BIOMES[d.b])).slice(0, DAILY_COUNT).map((d) => {
        const o = { k: d.k, n: Math.max(1, int(d.n, DAILY[d.k].n)), p: int(d.p, 0), c: d.c === true, r: cleanReward(d.r) };
        if (d.k === 'zone') o.b = d.b;
        return o;
      });
    }
    if (q.daily.length !== DAILY_COUNT) { q.day = ''; q.daily = []; }
  }
  ch.quests = q;
  return q;
}

/** Soma dos atributos distribuídos e "assinatura" do equipamento: base das missões conferidas por poll. */
export function statSum(ch) { return ['str', 'agi', 'vit', 'ene'].reduce((a, k) => a + (ch.stats[k] || 0), 0); }
export function equipKey(ch) { return R.SLOTS.map((s) => (ch.equip[s] ? s + ':' + (ch.equip[s].uid || ch.equip[s].seed || '?') : '')).join('|'); }
function obSnapshot(ch, step) {
  if (!step) return null;
  return step.id === 'stats' ? statSum(ch) : step.id === 'equip' ? equipKey(ch) : null;
}
/** Missão inicial atual (ou null se todas foram concluídas). */
export function currentOnboard(ch) { return ch.quests && ONBOARD[ch.quests.ob] || null; }

/** Avança a missão inicial; devolve o evento de conclusão. */
function advanceOnboard(ch, step) {
  const q = ch.quests;
  q.ob++;
  q.obProg = 0;
  q.obBase = obSnapshot(ch, ONBOARD[q.ob]);
  return { t: 'ob', id: step.id, step, reward: step.reward, last: q.ob >= ONBOARD.length };
}

/** O evento conta para a diária `d`? info: { zone, biome, elite, boss } para abates. */
function dailyMatches(d, type, info) {
  if (type === 'kill') {
    if (d.k === 'any') return true;
    if (d.k === 'zone') return info.zone === 'dungeon' && info.biome === d.b;
    if (d.k === 'elite') return !!info.elite;
    if (d.k === 'boss') return !!info.boss;
    return false;
  }
  if (type === 'floor') return d.k === 'tower';
  if (type === 'jewel') return d.k === 'jewel';
  return false;
}

/**
 * Aplica um evento do jogo às missões do personagem. Tipos: 'talk' (info = id do NPC),
 * 'kill' (info = {zone, biome, elite, boss}), 'potion', 'tower' (entrou na torre),
 * 'floor' (andar da torre conquistado), 'jewel' (joia coletada) e 'poll'
 * (confere atributos e equipamento). Devolve a lista de conclusões:
 * { t: 'ob', step, reward, last } ou { t: 'daily', i, q }.
 */
export function applyQuestEvent(ch, type, info, day) {
  if (!ch.quests) sanitizeQuests(ch);
  const q = ch.quests, out = [];
  if (day) ensureDaily(ch, day);
  // missão inicial
  const step = ONBOARD[q.ob];
  if (step) {
    if (step.id !== 'talk' && step.id !== 'kill' && q.obBase == null) q.obBase = obSnapshot(ch, step);
    let hit = 0;
    if (step.id === 'talk' && type === 'talk' && info === step.npc) hit = 1;
    else if (step.id === 'kill' && type === 'kill') hit = 1;
    else if (step.id === 'potion' && type === 'potion') hit = 1;
    else if (step.id === 'tower' && type === 'tower') hit = 1;
    else if (step.id === 'stats' && statSum(ch) > q.obBase) hit = step.need;
    else if (step.id === 'equip' && equipKey(ch) !== q.obBase && R.SLOTS.some((s) => ch.equip[s])) hit = step.need;
    if (hit) {
      q.obProg = Math.min(step.need, q.obProg + hit);
      if (q.obProg >= step.need) out.push(advanceOnboard(ch, step));
    }
  }
  // diárias
  if (type !== 'poll') {
    q.daily.forEach((d, i) => {
      if (d.p >= d.n || !dailyMatches(d, type, info || {})) return;
      d.p++;
      if (d.p >= d.n) out.push({ t: 'daily', i, q: d });
    });
  }
  return out;
}

/** Texto da diária para a interface. */
export function dailyText(d) { return DAILY[d.k].text(d); }
/** Diárias concluídas e ainda não resgatadas. */
export function dailyClaimable(ch) { return ch.quests ? ch.quests.daily.filter((d) => d.p >= d.n && !d.c).length : 0; }
/**
 * Marca a diária `i` como resgatada e devolve a recompensa (null se não puder).
 * Ao resgatar a terceira, a recompensa inclui o bônus do dia.
 */
export function claimDaily(ch, i) {
  const q = ch.quests, d = q && q.daily[i];
  if (!d || d.c || d.p < d.n) return null;
  d.c = true;
  const r = Object.assign({}, d.r);
  if (!q.bonus && q.daily.every((x) => x.c)) {
    q.bonus = true;
    r.gold = (r.gold || 0) + Math.max(1, ch.level) * DAILY_BONUS.goldPerLevel;
    r.jewel = DAILY_BONUS.jewel;
    r.bonus = true;
  }
  return r;
}
