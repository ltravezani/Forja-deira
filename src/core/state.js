// ---------- estado do jogo e do save ----------
// G: estado da sessão (zona, entidades, vitais). S: save persistido (personagens
// e opções). UI: estado da interface. São objetos mutados no lugar, nunca
// reatribuídos, para que todos os módulos vejam a mesma referência.

export const G = {
  mode: 'title', L: null, zone: 'town', floor: 0, ch: null, st: null,
  hp: 1, mp: 1, ag: 1, buffs: [], player: null, pet: null,
  monsters: [], projectiles: [], delayed: [], loot: [], allies: [], breakables: [], npcs: [],
  exitPortal: null, townPortal: null, townTower: null, time: 0, killCount: 0, lastHurt: -99, cast: null,
  explored: null, boss: null, selectedSlot: 0, dropLog: [], nextMonId: 1, showAllLabels: false,
  cds: {}, skillQueue: null, paused: false, autoEqT: 0, cp: 0,
};
/** Save global (mutado no lugar para que os módulos compartilhem a mesma referência). */
export const S = defaultSave();
export const SAVE_KEY = 'forjadeira.save.v1';
function defaultSave() {
  return { chars: [], active: -1, settings: { quality: 'media', sound: true, labels: true } };
}
function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) { const s = Object.assign(defaultSave(), JSON.parse(raw)); migrateOffline(s); migrateGold(s); return s; }
  } catch { /* armazenamento indisponível ou save corrompido: segue em memória */ }
  return defaultSave();
}
/** Carrega o save do navegador para dentro de `S`. */
export function loadSave() {
  const data = readSave();
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
export function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch { /* ignora */ }
}

/** Estado da interface (aba aberta, seleção no inventário, tela de título). */
export const UI = { tab: null, sel: null, paneDirty: false, pickedClass: 'dk', smithSel: null, confirmDel: -1, confirmWipe: false, titleMode: 'select', titleIdx: null, bagFilter: 'all', merchFilter: 'all', merchConfirm: null, ptr: false, lastCell: null };

const num = (v, d) => (Number.isFinite(v) ? v : d);
/**
 * Corrige um personagem vindo do save (versões antigas ou dados corrompidos):
 * completa campos ausentes a partir de um personagem novo da mesma classe e
 * troca números inválidos (NaN, Infinity, texto) por valores seguros.
 */
export function sanitizeCharacter(ch) {
  const R = ForjaRules;
  if (!R.CLASSES[ch.cls]) ch.cls = 'dk';
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
  return ch;
}
