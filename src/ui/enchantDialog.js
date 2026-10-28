// ---------- diálogo da Encantadora Morgana: Encantar e Combinar Joias ----------
import { G, UI } from '../core/state.js';
import { esc, fmt, R } from '../core/util.js';
import { Sfx } from '../engine/audio.js';
import { emit } from '../engine/effects.js';
import { bagCap } from '../game/inventory.js';
import { combineJewels, combineTimes, enchantItem, jewelCount, ownsItem, removeEnchant } from '../game/enchant.js';
import { recalc } from '../game/player.js';
import { glyph, iconHtml } from './icons.js';
import { log, toast } from './log.js';

const TABS = { ench: 'Encantar', combine: 'Combinar joias' };
const h4 = (t) => '<h4 style="margin:14px 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)">' + t + '</h4>';
const pct = (v) => String(Math.round(v * 1000) / 10).replace('.', ',') + '%';
const DARK = () => R.JEWELS.dark;
/** Nome curto da joia ("Bênção", "Caos") para a forja e listas apertadas no celular. */
const short = (j) => R.JEWELS[j].name.replace(/^Joia d[ao] /, '');
/** Equipamentos listados na última renderização (os botões guardam a posição nesta lista). */
let enchItems = [];

/** Linha da joia com ícone e cor. */
const jewelTag = (j, extra, name) => '<span class="nm"><span class="ic">' + iconHtml(glyph({ kind: 'jewel', id: j })) + '</span><span class="t" style="color:' + R.JEWELS[j].color + '">' + esc(name || R.JEWELS[j].name) + (extra || '') + '</span></span>';

/**
 * Conteúdo do diálogo. `kit` traz do diálogo do Ferreiro a lista de equipamentos,
 * o cartão de item e o cabeçalho do item escolhido (mesmo visual nos dois NPCs).
 */
export function enchantSection(ch, kit) {
  const tab = TABS[UI.enchTab] ? UI.enchTab : 'ench';
  let h = '<div class="btabs">' + Object.keys(TABS).map((k) => '<button class="btab' + (tab === k ? ' on' : '') + '" data-npc="enchtab" data-k="' + k + '">' + TABS[k] + (k === 'ench' ? ' <span>' + jewelCount(ch, 'dark') + '</span>' : '') + '</button>').join('') + '</div>';
  return h + (tab === 'ench' ? enchantTab(ch, kit) : combineTab(ch));
}

function enchantTab(ch, kit) {
  const items = kit.list(ch);
  enchItems = items;
  const sel = items.find((x) => x === UI.enchSel) || items[0];
  UI.enchSel = sel;
  const dk = jewelCount(ch, 'dark');
  let h = '<div class="list"><div class="li">' + jewelTag('dark', ' ×' + dk) + '<span class="s">' + (dk ? 'Cada joia adiciona 1 encantamento aleatório (até ' + R.ENCH.max + ' por item).' : 'Cai no Éden (' + pct(R.DARK_DROP.eden) + ' por monstro) e, mais rara, nos outros mapas (' + pct(R.DARK_DROP.other) + '). Também sai ao combinar joias (' + pct(R.COMBINE.darkChance) + ').') + '</span></div></div>';
  if (!sel) return h + '<p class="note">Você não tem equipamentos.</p>';
  h += '<div class="smithlist">' + items.map((x, i) => kit.card(ch, x, i, sel).replace('data-npc="smithsel"', 'data-npc="enchsel"')).join('') + '</div>';
  h += h4('Encantamentos do item') + kit.selHtml(ch, sel);
  const ench = sel.ench || [];
  h += '<div class="list" style="margin-top:6px">';
  for (let i = 0; i < R.ENCH.max; i++) {
    const e = ench[i];
    if (!e) { h += '<div class="li"><span class="t" style="color:var(--muted)">✧ Espaço livre ' + (i + 1) + ' de ' + R.ENCH.max + '</span><span class="s">Use uma ' + esc(DARK().name) + ' para sortear uma linha.</span></div>'; continue; }
    const G2 = R.ENCH_GRADES[e.g], cost = R.enchantRemoveCost(sel, e), cf = UI.npcConfirm === 'enchrm' && UI.enchRm === i;
    const a = cf
      ? '<button class="btn sm gold" data-npc="enchrm" data-i="' + i + '" data-ok="1">Confirmar · ' + fmt(cost) + '</button><button class="btn sm" data-npc="npcno">Cancelar</button>'
      : '<button class="btn sm" data-npc="enchrm" data-i="' + i + '"' + (ch.gold >= cost ? '' : ' disabled') + '>Retirar · ' + fmt(cost) + '</button>';
    h += '<div class="li"><span class="t" style="color:' + G2.color + '">✦ ' + esc(R.enchantText(e)) + '</span><span class="a row">' + a + '</span><span class="s">Grau ' + G2.name + (cf ? ' · <b style="color:var(--gold)">Tem certeza? A linha some e o Ouro não volta.</b>' : ' · retirar custa Ouro e libera o espaço') + '</span></div>';
  }
  h += '</div>';
  const can = R.canEnchant(sel), cf = UI.npcConfirm === 'ench';
  const why = !can ? (ench.length >= R.ENCH.max ? 'Os ' + R.ENCH.max + ' espaços estão ocupados: retire uma linha para encantar de novo.' : 'Não há mais encantamentos possíveis para este item.') : !dk ? 'Você não tem ' + esc(DARK().name) + '.' : '';
  h += '<div class="row" style="margin-top:10px">' + (cf && can && dk
    ? '<button class="btn gold" data-npc="ench" data-ok="1">Confirmar · gastar 1 ' + esc(DARK().name) + '</button><button class="btn" data-npc="npcno">Cancelar</button>'
    : '<button class="btn gold" data-npc="ench"' + (can && dk ? '' : ' disabled') + '>Encantar · 1 ' + esc(DARK().name) + '</button>') + '</div>';
  if (why) h += '<p class="note">' + why + '</p>';
  // tabela pública: linhas possíveis no slot e chance de cada grau
  const opts = R.enchantOptions(sel), have = ench.map((e) => e.id);
  h += h4('Possíveis encantamentos · ' + esc(R.SLOT_LABEL[sel.slot])) + '<p class="note">Sorteio entre as linhas que o item ainda não tem (' + opts.length + '), todas com a mesma chance. Grau: ' + R.ENCH_GRADES.map((g) => '<b style="font:inherit;color:' + g.color + '">' + g.name + ' ' + pct(g.chance) + '</b>').join(' · ') + '.</p>';
  h += '<div class="ench-pool">' + R.enchantPool(sel).map((k) => {
    const E = R.ENCHANTS[k];
    return '<div class="ep' + (have.includes(k) ? ' have' : '') + '"><span>' + esc(E.t.replace('{v}', '…')) + '</span><span>' + E.v.map((v, g) => '<b style="color:' + R.ENCH_GRADES[g].color + '">' + Math.abs(v) + '</b>').join(' / ') + '</span></div>';
  }).join('') + '</div>';
  return h + '<p class="note">O encantamento fica no item: vai junto para o baú e para outro personagem, e soma no CP.</p>';
}

function combineTab(ch) {
  const C = R.COMBINE;
  const picks = (UI.combo || []).filter((j) => C.inputs.includes(j)).slice(0, C.n);
  // o que já está na forja conta como reservado
  const used = (j) => picks.filter((x) => x === j).length;
  UI.combo = picks;
  let h = '<p class="note">Coloque ' + C.n + ' joias (iguais ou misturadas) e receba 1 joia aleatória. Taxa: ' + fmt(C.fee) + ' de Ouro por combinação. A ' + esc(DARK().name) + ' não entra na receita.</p>';
  h += '<div class="combo">' + Array.from({ length: C.n }, (_, i) => {
    const j = picks[i];
    return j ? '<button class="cslot on" data-npc="combout" data-i="' + i + '" title="Tirar ' + esc(R.JEWELS[j].name) + '">' + iconHtml(glyph({ kind: 'jewel', id: j })) + '<small style="color:' + R.JEWELS[j].color + '">' + esc(short(j)) + '</small></button>' : '<div class="cslot">?</div>';
  }).join('<span class="cplus">+</span>') + '<span class="cplus">→</span><div class="cslot res">' + iconHtml(glyph({ kind: 'jewel', id: 'dark' })) + '<small>Aleatória</small></div></div>';
  h += '<div class="list">';
  C.inputs.forEach((j) => {
    const n = jewelCount(ch, j), left = n - used(j);
    h += '<div class="li">' + jewelTag(j, ' ×' + n, short(j)) + '<span class="a row"><button class="btn sm" data-npc="combin" data-j="' + j + '"' + (left > 0 && picks.length < C.n ? '' : ' disabled') + '>Colocar</button><button class="btn sm" data-npc="combsame" data-j="' + j + '"' + (n >= C.n ? '' : ' disabled') + '>' + C.n + ' iguais</button></span></div>';
  });
  h += '</div>';
  const full = picks.length === C.n, t = full ? combineTimes(ch, picks) : 0, cf = UI.npcConfirm === 'combine' && UI.comboN === 10;
  const btn = (n, gold) => '<button class="btn' + (gold ? ' gold' : '') + '" data-npc="combine" data-n="' + n + '"' + (t >= n ? '' : ' disabled') + '>Combinar' + (n > 1 ? ' ×' + n : '') + ' · ' + fmt(C.fee * n) + '</button>';
  h += '<div class="row" style="margin-top:10px">' + (cf && t >= 10
    ? '<button class="btn gold" data-npc="combine" data-n="10" data-ok="1">Confirmar ×10 · ' + fmt(C.fee * 10) + ' de Ouro</button><button class="btn" data-npc="npcno">Cancelar</button>'
    : btn(1, true) + btn(10, false)) + '</div>';
  if (full && !t) h += '<p class="note">Faltam joias ou Ouro para esta receita.</p>';
  const other = (1 - C.darkChance) / C.inputs.length;
  h += '<p class="note">Resultado: <b style="font:inherit;color:' + DARK().color + '">' + esc(DARK().name) + ' ' + pct(C.darkChance) + '</b> · ' + C.inputs.map((j) => '<span style="color:' + R.JEWELS[j].color + '">' + esc(short(j)) + ' ' + pct(other) + '</span>').join(' · ') + '.</p>';
  if (UI.comboLast && UI.comboLast.length) {
    const cnt = {};
    UI.comboLast.forEach((j) => (cnt[j] = (cnt[j] || 0) + 1));
    h += '<p class="note">Última combinação: ' + Object.keys(cnt).map((j) => '<b style="font:inherit;color:' + R.JEWELS[j].color + '">' + esc(R.JEWELS[j].name) + (cnt[j] > 1 ? ' ×' + cnt[j] : '') + '</b>').join(', ') + '.</p>';
  }
  return h;
}

/** Botões do diálogo da Morgana; devolve false se a ação não é daqui. */
export function enchantAction(a, b, ch, confirmed) {
  switch (a) {
    case 'enchtab': UI.enchTab = b.dataset.k; UI.comboLast = null; return true;
    case 'enchsel': { const x = enchItems[+b.dataset.i]; if (ownsItem(ch, x)) UI.enchSel = x; return true; }
    case 'ench': {
      const it = UI.enchSel;
      if (!ownsItem(ch, it)) { log('Este item não está mais com você.', 'warn'); UI.enchSel = null; return true; }
      if (!R.canEnchant(it) || jewelCount(ch, 'dark') < 1) return true;
      if (!confirmed) { UI.npcConfirm = a; return true; }
      const r = enchantItem(ch, it, Math.random);
      if (!r.ok) return true;
      const g = R.ENCH_GRADES[r.ench.g], txt = R.enchantText(r.ench);
      log('Encantamento ' + g.name + ': ' + txt + ' em ' + R.itemName(it) + '.', 'loot');
      toast('Encantamento ' + g.name, txt);
      r.ench.g >= 2 ? Sfx.level() : Sfx.loot(4);
      if (G.player) emit(G.player.x, 1.2, G.player.z, { n: 40 + r.ench.g * 40, color: parseInt(g.color.slice(1), 16), speed: 2.6, up: 2.6, life: 1.1, size: 0.9, grav: 0.6, spread: 1.2 });
      recalc();
      return true;
    }
    case 'enchrm': {
      const it = UI.enchSel, i = +b.dataset.i;
      if (!ownsItem(ch, it) || !it.ench || !it.ench[i]) return true;
      if (!confirmed || UI.enchRm !== i) { UI.npcConfirm = a; UI.enchRm = i; return true; }
      const r = removeEnchant(ch, it, i);
      if (!r.ok) { if (r.why === 'gold') log('Ouro insuficiente: retirar custa ' + fmt(r.cost) + '.', 'warn'); return true; }
      log('Retirou ' + R.enchantText(r.ench) + ' de ' + R.itemName(it) + ' por ' + fmt(r.cost) + ' de Ouro.', 'sys');
      Sfx.coin();
      recalc();
      return true;
    }
    case 'combin': {
      const j = b.dataset.j, picks = UI.combo || [];
      if (!R.COMBINE.inputs.includes(j) || picks.length >= R.COMBINE.n) return true;
      if (jewelCount(ch, j) - picks.filter((x) => x === j).length > 0) UI.combo = picks.concat(j);
      UI.comboLast = null;
      return true;
    }
    case 'combsame': if (R.COMBINE.inputs.includes(b.dataset.j)) UI.combo = Array(R.COMBINE.n).fill(b.dataset.j); UI.comboLast = null; return true;
    case 'combout': { const p = (UI.combo || []).slice(); p.splice(+b.dataset.i, 1); UI.combo = p; UI.comboLast = null; return true; }
    case 'combine': {
      const n = +b.dataset.n === 10 ? 10 : 1, picks = UI.combo || [];
      if (n > 1 && (!confirmed || UI.comboN !== n)) { UI.npcConfirm = a; UI.comboN = n; return true; }
      const r = combineJewels(ch, picks, Math.random, bagCap(ch), n);
      if (!r.ok) { log(r.why === 'full' ? 'Mochila cheia: libere um espaço para a joia nova.' : 'Faltam joias ou Ouro para combinar.', 'warn'); return true; }
      UI.comboLast = r.got;
      // a receita continua na forja se ainda houver joias para repetir
      if (!combineTimes(ch, picks)) UI.combo = picks.filter((j, i) => jewelCount(ch, j) > picks.slice(0, i).filter((x) => x === j).length);
      const dk = r.got.filter((j) => j === 'dark').length;
      if (dk) { log('A combinação revelou ' + (dk > 1 ? dk + ' Joias da Escuridão!' : 'uma Joia da Escuridão!'), 'loot'); toast(DARK().name, 'Saiu na combinação!'); Sfx.level(); }
      else { log('Combinou joias: ' + r.got.map((j) => R.JEWELS[j].name).join(', ') + '.', 'loot'); Sfx.loot(3); }
      return true;
    }
  }
  return false;
}
