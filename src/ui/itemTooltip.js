// ---------- detalhes do item: tooltip (desktop), painel inferior (celular) e menu de contexto ----------
// Os dois elementos (#itemTip e #ctxMenu) ficam fora do painel e são
// reaproveitados; os botões usam os mesmos data-act do painel (paneActions.js).
import { CONFIG } from '../core/config.js';
import { G, UI } from '../core/state.js';
import { $, esc, fmt, R } from '../core/util.js';
import { classOk, cpOf, cpWith, reqOk } from '../game/inventory.js';
import { hasTownServices } from '../game/zones.js';
import { glyph, iconHtml } from './icons.js';
import { statLabel } from './panes.js';

export function selectedItem() {
  const s = UI.sel;
  if (!s) return null;
  if (s.where === 'eq') return G.ch.equip[s.slot] || null;
  return G.ch.bag[s.idx] || null;
}
/** Celular: detalhes num painel inferior em vez de tooltip ao lado do item. */
const sheetMode = () => window.matchMedia('(max-width: 760px)').matches;
/** Poções que podem ser bebidas pelo inventário (a da Ressurreição só na tela de queda). */
export const drinkable = (it) => !!(it && it.kind === 'potion' && R.POTIONS[it.id] && !R.POTIONS[it.id].revive);

function itemColor(it) { return it.rarity ? R.RARITY[it.rarity].color : glyph(it).c; }
function itemSub(it) {
  if (it.kind === 'jewel') return 'Joia · material de refino';
  if (it.kind === 'talisman') return 'Talismã · material de refino';
  if (it.kind === 'potion') return 'Consumível';
  return R.RARITY[it.rarity].name + ' · ' + R.SLOT_LABEL[it.slot] + ' · Tier ' + (it.tier + 1) + (it.plus ? ' · <b class="lv">+' + it.plus + '</b>' : '');
}
function itemDesc(it) {
  if (it.kind === 'jewel') return esc(R.JEWELS[it.id].desc) + ' Use no Ferreiro Hanzo.';
  if (it.kind === 'talisman') return esc(R.TALISMANS[it.id].desc) + ' Use no Ferreiro Hanzo.';
  if (it.kind === 'potion') {
    const P = R.POTIONS[it.id];
    if (P.revive) return 'Ao cair, permite renascer no mesmo lugar do andar com HP e mana cheios, sem perder EXP nem Gold.';
    if (P.buff) return esc(P.desc) + ' Beber de novo renova o tempo.';
    return 'Recupera ' + Math.round(P.pct * 100) + '% + ' + P.flat + '. Atalho ' + (it.id === 'hp' ? 'Q' : 'E') + '.';
  }
  return (it.cls ? 'Usável por ' + R.itemUsers(it).join(', ') : 'Usável por todas as classes') + '.';
}
/** Conteúdo dos detalhes: ícone grande, nome, raridade, atributos, requisitos, bônus, descrição e ações. */
export function itemInfoHtml(it, where) {
  const g = glyph(it);
  let h = '<div class="tip-hd"><span class="tip-ic" style="border-color:' + g.c + '">' + iconHtml(g) + '</span><div class="tip-t">' +
    '<div class="nm" style="color:' + itemColor(it) + '">' + esc(R.itemName(it)) + '</div><div class="sub">' + itemSub(it) + (it.qty > 1 ? ' · Quantidade <b class="num">' + fmt(it.qty) + '</b>' : '') + '</div></div>' +
    '<button class="x" data-act="tipclose" aria-label="Fechar detalhes">×</button></div><div class="tip-bd">';
  if (it.slot) {
    const lines = R.itemLines(it);
    if (lines.length) h += '<div class="sec">' + lines.map(([k, v]) => '<div class="ln">' + k + ' <b class="num">' + v + '</b></div>').join('') + '</div>';
    let a = '';
    if (it.luck) a += '<div class="ln">Sorte (crítico +5%, +25% no Soul)</div>';
    if (it.skill) a += '<div class="ln">Habilidade (+10% dano de habilidades)</div>';
    if (it.addOpt) a += '<div class="ln">Opção adicional +' + it.addOpt + '</div>';
    const exSet = it.slot === 'weapon' || it.slot === 'pendant' ? R.EXC_WEAPON : R.EXC_ARMOR;
    R.excOpts(it).forEach((e) => (a += '<div class="ln exc">' + esc(exSet[e].t) + '</div>'));
    if (it.anc) a += '<div class="ln anc">Ancestral: ' + statLabel(it.anc.stat) + ' +' + it.anc.value + '</div>';
    if (it.legend) a += '<div class="ln leg">Lendário: ' + esc(R.LEGEND[it.legend].t) + '</div>';
    if (a) h += '<div class="sec">' + a + '</div>';
    const req = R.itemReq(it);
    let r = '';
    if (req) {
      const have = req.stat === 'level' ? G.ch.level : G.ch.stats[req.stat];
      r += '<div class="ln req' + (have < req.value ? ' bad' : '') + '">Requer ' + (req.stat === 'level' ? 'nível' : statLabel(req.stat)) + ' ' + req.value + (have < req.value ? ' (você tem ' + have + ')' : '') + '</div>';
    }
    if (it.cls && !classOk(it)) r += '<div class="ln req bad">Exclusivo de ' + R.itemUsers(it).join(', ') + ' — venda ou negocie no mercado.</div>';
    if (r) h += '<div class="sec">' + r + '</div>';
    h += '<div class="sec ln cpl">CP do item <b class="num">' + fmt(R.itemCP(it)) + '</b>';
    if (where === 'bag' && classOk(it)) {
      const cur = G.ch.equip[it.slot], d = cpWith(it) - cpOf(G.ch);
      if (!reqOk(it)) h += '<br><span class="dn">Requisito não atendido: ainda não soma CP</span>';
      else h += '<br><span class="' + (d > 0 ? 'up' : d < 0 ? 'dn' : '') + '">' + (d > 0 ? '▲ +' : d < 0 ? '▼ ' : '= ') + fmt(d) + ' CP no personagem</span> <span class="note">' + (cur ? '(vs ' + esc(R.itemName(cur)) + ')' : '(slot vazio)') + '</span>';
    }
    h += '</div>';
  }
  h += '<div class="sec desc">' + itemDesc(it) + '</div>';
  if (it.slot) h += '<div class="seed">Seed ' + esc(it.seed || '—') + (it.rolls && it.rolls[0] ? ' · rolagem ' + it.rolls[0].roll.toFixed(5) : '') + ' · valor ' + fmt(R.itemValue(it)) + ' Gold</div>';
  h += '</div><div class="tip-ft">' + actionButtons(it, where, false) + '</div>';
  return h;
}
/** Botões de ação do item (no painel de detalhes e no menu de contexto). */
function actionButtons(it, where, menu) {
  const b = (act, label, cls) => '<button class="btn sm' + (cls ? ' ' + cls : '') + '" data-act="' + act + '">' + label + '</button>';
  let h = '';
  if (it.slot) {
    if (where === 'eq') h += b('unequip', 'Desequipar');
    else if (classOk(it)) h += b('equip', 'Equipar', 'gold');
  }
  if (drinkable(it)) h += b('usepot', 'Usar', it.slot ? '' : 'gold');
  if (menu) h += b('tipopen', 'Detalhes');
  if (where === 'bag') {
    if (hasTownServices()) h += b('sell', 'Vender ' + fmt(R.sellValue(it)) + ' Gold');
    h += b('drop', 'Descartar');
  }
  return h;
}

/** Célula do item selecionado no painel (âncora do tooltip). */
function anchorEl() {
  const s = UI.sel;
  if (!s) return null;
  return s.where === 'eq' ? document.querySelector('#paper [data-act="seleq"][data-slot="' + s.slot + '"]') : document.querySelector('#bagGrid [data-act="selbag"][data-i="' + s.idx + '"]');
}

// ---------- ItemTooltip ----------
export const ItemTooltip = {
  html: '', timer: 0,
  /** Abre os detalhes do item selecionado (no celular espera o tempo do toque duplo, para não cobrir o segundo toque). */
  open(delayed) { UI.tipOpen = true; UI.tipAt = delayed && sheetMode() ? performance.now() + CONFIG.input.doubleClickMs : 0; },
  close() { UI.tipOpen = false; this.sync(); },
  isOpen() { return !$('#itemTip').hidden; },
  /** Mostra/atualiza/esconde conforme a seleção; só redesenha quando o conteúdo muda. */
  sync() {
    const tip = $('#itemTip'), bg = $('#itemTipBg');
    const it = UI.tab === 'inv' && !$('#drawer').hidden && UI.tipOpen ? selectedItem() : null;
    clearTimeout(this.timer);
    if (it && UI.tipAt && performance.now() < UI.tipAt) {
      this.timer = setTimeout(() => this.sync(), UI.tipAt - performance.now() + 5);
      return this.hide();
    }
    if (!it) return this.hide();
    const h = itemInfoHtml(it, UI.sel.where);
    if (h !== this.html) { tip.innerHTML = h; this.html = h; }
    const sheet = sheetMode();
    tip.classList.toggle('sheet', sheet);
    bg.hidden = !sheet;
    tip.hidden = false;
    if (!sheet) this.place(tip);
    else tip.style.left = tip.style.top = '';
  },
  hide() {
    const tip = $('#itemTip');
    if (!tip.hidden) { tip.hidden = true; $('#itemTipBg').hidden = true; }
  },
  /** Ao lado da célula (esquerda ou direita, onde couber), sem sair da tela. */
  place(tip) {
    const a = anchorEl();
    if (!a) return;
    const r = a.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
    const w = tip.offsetWidth, h = tip.offsetHeight, m = 8;
    let x = r.right + m;
    if (x + w > W - m) x = r.left - m - w;
    if (x < m) x = Math.max(m, Math.min(W - w - m, r.left));
    const y = Math.max(m, Math.min(H - h - m, r.top));
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  },
};

// ---------- menu de contexto (botão direito no desktop, toque longo no celular) ----------
export const ContextMenu = {
  /** src: {where:'bag', idx} ou {where:'eq', slot}; x/y: ponto do clique. */
  open(src, x, y) {
    const it = src.where === 'eq' ? G.ch.equip[src.slot] : G.ch.bag[src.idx];
    if (!it) return false;
    UI.sel = src.where === 'eq' ? { where: 'eq', slot: src.slot } : { where: 'bag', idx: src.idx };
    UI.tipOpen = false;
    ItemTooltip.hide();
    const m = $('#ctxMenu');
    m.innerHTML = '<div class="cm-t" style="color:' + itemColor(it) + '">' + esc(R.itemName(it)) + '</div>' + actionButtons(it, src.where, true);
    m.hidden = false;
    const W = window.innerWidth, H = window.innerHeight;
    m.style.left = Math.max(8, Math.min(W - m.offsetWidth - 8, x)) + 'px';
    m.style.top = Math.max(8, Math.min(H - m.offsetHeight - 8, y)) + 'px';
    return true;
  },
  close() { const m = $('#ctxMenu'); if (m.hidden) return false; m.hidden = true; return true; },
};
/** Fecha menu/detalhes abertos; devolve true se havia algo aberto (Esc fecha eles antes do painel). */
export function closeItemPopups() {
  const a = ContextMenu.close();
  const b = ItemTooltip.isOpen();
  if (b) ItemTooltip.close();
  return a || b;
}
