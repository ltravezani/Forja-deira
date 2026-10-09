// ---------- estado do jogo e do save ----------
// G: estado da sessão (zona, entidades, vitais). S: save persistido (personagens
// e opções). UI: estado da interface. São objetos mutados no lugar, nunca
// reatribuídos, para que todos os módulos vejam a mesma referência.
import { sanitizeQuests } from '../game/questLogic.js';

export const G = {
  mode: 'title', L: null, zone: 'town', floor: 0, ch: null, st: null,
  hp: 1, mp: 1, ag: 1, buffs: [], player: null, pet: null,
  monsters: [], projectiles: [], delayed: [], loot: [], allies: [], breakables: [], npcs: [],
  exitPortal: null, townPortal: null, edenPortal: null, hubPortal: null, townTower: null, time: 0, killCount: 0, lastHurt: -99, cast: null,
  explored: null, boss: null, selectedSlot: 0, dropLog: [], nextMonId: 1, showAllLabels: false,
  cds: {}, skillQueue: null, paused: false, autoEqT: 0, cp: 0, towerLayout: null,
};
/** Portais ativos (descida/subida, masmorras, Éden e o de volta para a cidade). */
export function allPortals() { return [G.exitPortal, G.townPortal, G.edenPortal, G.hubPortal].filter(Boolean); }
/** Save global (mutado no lugar para que os módulos compartilhem a mesma referência). */
export const S = defaultSave();
export const SAVE_KEY = 'forjadeira.save.v1';
function defaultSave() {
  // quality null = ainda não escolhida: o main.js escolhe pelo aparelho (autoQuality) no primeiro acesso
  return { chars: [], active: -1, settings: { quality: null, sound: true, labels: true } };
}
function readSave(obj) {
  try {
    if (obj === undefined) { const raw = localStorage.getItem(SAVE_KEY); obj = raw ? JSON.parse(raw) : null; }
    if (obj && typeof obj === 'object') { const s = Object.assign(defaultSave(), JSON.parse(JSON.stringify(obj))); migrateOffline(s); migrateGold(s); return s; }
  } catch { /* armazenamento indisponível ou save corrompido: segue em memória */ }
  return defaultSave();
}
/** Carrega o save do navegador para dentro de `S` (ou, se `obj` vier, esse save; ex.: o baixado da nuvem). */
export function loadSave(obj) {
  const data = readSave(obj);
  if (!Array.isArray(data.chars)) data.chars = [];
  data.chars = data.chars.filter((c) => c && typeof c === 'object' && typeof c.name === 'string');
  if (!data.settings || typeof data.settings !== 'object') data.settings = defaultSave().settings;
  if (!Number.isInteger(data.active) || data.active >= data.chars.length) data.active = data.chars.length ? 0 : -1;
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, data);
  return S;
}
/** Saves antigos: remove carteira, mercado, staking e marcas de NFT (o jogo agora é 100% offline). */
function migrateOffline(s) {
  ['wallet', 'nfts', 'market', 'stake', 'trzPending', 'nextToken', 'txs', 'treasury', 'chat'].forEach((k) => delete s[k]);
  const clean = (it) => { if (it) { delete it.nft; delete it.minting; } };
  (s.chars || []).forEach((ch) => { (ch.bag || []).forEach(clean); Object.values(ch.equip || {}).forEach(clean); delete ch.trzToday; delete ch.trzDay; });
}
/** Saves antigos: a moeda se chamava Zen. Passa o saldo (e a opção excelente de bônus) para Gold. */
function migrateGold(s) {
  const opt = (it) => { if (it && Array.isArray(it.exc)) it.exc = it.exc.map((e) => (e === 'zen30' ? 'gold30' : e)); };
  (s.chars || []).forEach((ch) => {
    if (!ch || typeof ch !== 'object') return;
    if ('zen' in ch) {
      const zen = Number.isFinite(ch.zen) ? ch.zen : 0;
      ch.gold = (Number.isFinite(ch.gold) ? ch.gold : 0) + zen;
      delete ch.zen;
    }
    (ch.bag || []).forEach(opt); Object.values(ch.equip || {}).forEach(opt);
  });
}
/** Ganchos do save: a nuvem se registra aqui para saber quando algo foi salvo. */
export const SaveHooks = { afterPersist: null };
/**
 * Trava de gravação. wiping: "Apagar dados locais" em andamento (a página vai
 * recarregar; nada pode regravar o save). readOnly: outra aba do jogo está
 * aberta e é ela quem grava (ui/tabLock.js).
 */
export const SaveGuard = { wiping: false, readOnly: false };
export const saveBlocked = () => SaveGuard.wiping || SaveGuard.readOnly;
export function persist() {
  if (saveBlocked()) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch { /* ignora */ }
  if (SaveHooks.afterPersist) SaveHooks.afterPersist();
}

/** Estado da interface (aba aberta, seleção no inventário, tela de título). */
export const UI = { tab: null, sel: null, paneDirty: false, pickedClass: 'dk', smithSel: null, smithView: 'all', smithSlot: 'all', confirmDel: -1, confirmWipe: false, titleMode: 'select', titleIdx: null, bagFilter: 'all', merchFilter: 'all', merchConfirm: null, itemConfirm: null, npcConfirm: null, ptr: false, lastCell: null, smithTalisman: false, tipOpen: false, tipAt: 0 };

const num = (v, d) => (Number.isFinite(v) ? v : d);
/**
 * Corrige um personagem vindo do save (versões antigas ou dados corrompidos):
 * completa campos ausentes a partir de um personagem novo da mesma classe e
 * troca números inválidos (NaN, Infinity, texto) por valores seguros.
 */
export function sanitizeCharacter(ch) {
  const R = ForjaRules;
  if (!R.CLASSES[ch.cls]) ch.cls = 'dk';
  // Árvore de maestria v2 (1 ponto/20 níveis, +1/reset, +2/evolução): saves
  // antigos recebem de volta todos os pontos gastos para redistribuir.
  if (ch.treeV !== 2) { ch.tree = {}; ch.treeV = 2; }
  const base = R.newCharacter(ch.name || 'Herói', ch.cls);
  for (const k of Object.keys(base)) if (ch[k] == null) ch[k] = base[k];
  ch.stats = ch.stats && typeof ch.stats === 'object' ? ch.stats : {};
  for (const k of Object.keys(base.stats)) ch.stats[k] = Math.max(0, num(ch.stats[k], base.stats[k]));
  for (const k of ['level', 'exp', 'gold', 'points', 'resets', 'tier', 'bossKills']) ch[k] = Math.max(0, num(ch[k], base[k] || 0));
  ch.level = Math.max(1, Math.floor(ch.level));
  if (!Array.isArray(ch.bag)) ch.bag = [];
  ch.bag = ch.bag.filter((it) => it && typeof it === 'object' && (it.slot || it.kind));
  if (!ch.equip || typeof ch.equip !== 'object') ch.equip = {};
  for (const k of Object.keys(ch.equip)) if (!ch.equip[k] || !ch.equip[k].slot) delete ch.equip[k];
  if (!Array.isArray(ch.skillBar)) ch.skillBar = [];
  ch.skillBar = ch.skillBar.filter((id) => R.SKILLS[id] && R.SKILLS[id].cls === ch.cls).slice(0, 6);
  if (!ch.tree || typeof ch.tree !== 'object') ch.tree = {};
  if (!ch.unlockedFloors || typeof ch.unlockedFloors !== 'object') ch.unlockedFloors = {};
  ch.towerBest = Math.max(1, Math.floor(num(ch.towerBest, 1)));
  ch.edenLast = Math.max(0, num(ch.edenLast, 0));
  // automação (Habilidades e Drops); saves antigos começam tudo desligado
  if (!Array.isArray(ch.autoSkills)) ch.autoSkills = [];
  ch.autoSkills = ch.autoSkills.filter((id, i, a) => R.SKILLS[id] && R.SKILLS[id].cls === ch.cls && a.indexOf(id) === i);
  ch.autoLoot = ch.autoLoot === true;
  ch.autoPetSell = ch.autoPetSell === true;
  ch.edenClears = Math.max(0, Math.floor(num(ch.edenClears, 0))); // última entrada no Éden (ms); limite de uma a cada 3h
  // só itens conhecidos: jewels, poções e talismãs de versões futuras/antigas não quebram a mochila
  ch.bag = ch.bag.filter((it) => it.slot || (it.kind === 'jewel' && R.JEWELS[it.id]) || (it.kind === 'potion' && R.POTIONS[it.id]) || (it.kind === 'talisman' && R.TALISMANS[it.id]));
  // evolução: inteiro dentro das formas da classe
  ch.tier = Math.min(R.CLASSES[ch.cls].tiers.length - 1, Math.floor(ch.tier));
  sanitizeTree(ch, R);
  ch.bag = ch.bag.filter((it) => !it.slot || R.SLOTS.includes(it.slot));
  ch.bag.forEach((it) => sanitizeItem(it, R));
  for (const k of Object.keys(ch.equip)) { if (k !== ch.equip[k].slot || !R.SLOTS.includes(k)) { ch.bag.push(ch.equip[k]); delete ch.equip[k]; } else sanitizeItem(ch.equip[k], R); }
  sanitizeQuests(ch); // missões (iniciais e diárias); saves antigos ganham o campo aqui
  return ch;
}
const int = (v, lo, hi, d) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : d);
/** Árvore: só nós da classe, ranks inteiros 0..5 e soma dentro dos pontos disponíveis. */
function sanitizeTree(ch, R) {
  const ids = [];
  R.TREES[ch.cls].forEach((br, bi) => br.nodes.forEach((n, ni) => ids.push(R.treeNodeId(ch.cls, bi, ni))));
  const tree = {};
  let left = R.treePoints(Object.assign({}, ch, { tree: {} }));
  for (const id of ids) {
    const r = Math.min(int(ch.tree[id], 0, 5, 0), left);
    if (r > 0) { tree[id] = r; left -= r; }
  }
  ch.tree = tree;
}
/** Item: refino, quantidade, raridade e tier válidos (NaN, texto ou fora da faixa voltam ao padrão). */
function sanitizeItem(it, R) {
  if (it.slot) {
    if (!R.RARITY[it.rarity]) it.rarity = 'comum';
    it.tier = int(it.tier, 0, R.DROP_LEVEL.length - 1, 0);
    it.plus = int(it.plus, 0, 15, 0);
    it.addOpt = int(it.addOpt, 0, 28, 0);
  } else it.qty = int(it.qty, 1, 1e9, 1);
  if (it.locked !== true) delete it.locked;
}
