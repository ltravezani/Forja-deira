// ---------- painel Inventário: personagem com equipamento, mochila com filtros ----------
// O esqueleto do painel é montado uma vez; cada atualização só troca as células
// (slots e itens) cujo HTML mudou, e a prévia 3D só refaz o modelo quando o
// equipamento muda. Seleção, tooltip e menu de contexto ficam em itemTooltip.js.
import { refineColor } from '../art/items.js';
import { G, UI } from '../core/state.js';
import { esc, fmt, R, touchUI } from '../core/util.js';
import { autoEquipOn, BAG_SIZE, classOk, cpOf, cpWith, fmtCP, reqOk } from '../game/inventory.js';
import { petSellable } from '../game/allies.js';
import { CharPreview } from './charPreview.js';
import { glyph, iconHtml, iconURI } from './icons.js';
import { ItemTooltip } from './itemTooltip.js';

/** Slots em volta do herói: coluna esquerda e direita (de cima para baixo). */
const EQ_LEFT = ['helm', 'armor', 'gloves', 'boots'];
const EQ_RIGHT = ['weapon', 'wings', 'pendant', 'ring'];

// ---------- InventoryFilter ----------
export const InventoryFilter = {
  LABELS: { all: 'Todos', equip: 'Equipamentos', mat: 'Materiais', cons: 'Consumíveis', other: 'Outros' },
  /** Equipamentos: peças da sua classe · Materiais: joias e talismãs · Consumíveis: poções · Outros: o resto (peças de outras classes). */
  cat(it) {
    if (it.slot) return classOk(it) ? 'equip' : 'other';
    if (it.kind === 'jewel' || it.kind === 'talisman') return 'mat';
    if (it.kind === 'potion') return 'cons';
    return 'other';
  },
  current() { return this.LABELS[UI.bagFilter] ? UI.bagFilter : 'all'; },
  html(cnt, f) {
    return Object.keys(this.LABELS).map((k) => '<button class="btab' + (f === k ? ' on' : '') + '" data-act="bagf" data-k="' + k + '" aria-pressed="' + (f === k) + '">' + this.LABELS[k] + ' <span>' + cnt[k] + '</span></button>').join('');
  },
};

// ---------- InventoryItem / EquipmentSlot ----------
/** Brilho discreto para Excelente ou melhor, joias e talismãs. */
const isRare = (it) => (it.rarity ? R.RARITY[it.rarity].order >= 2 : it.kind === 'jewel' || it.kind === 'talisman');
/** Célula de item (mochila ou slot equipado). A seleção é uma classe aplicada à parte, fora deste HTML. */
export function InventoryItem(it, attrs, ctx) {
  if (!it) return '<div class="cell empty"' + attrs + '></div>';
  const g = glyph(it);
  let bad = false, cp = '', up = '';
  if (it.slot) {
    bad = !classOk(it) || !reqOk(it);
    cp = '<span class="c">' + fmtCP(R.itemCP(it)) + '</span>';
    if (ctx && ctx.base != null && classOk(it)) {
      if (!reqOk(it)) up = '<span class="u r" title="Requisito não atendido">!</span>';
      else {
        const d = (ctx.cp ? ctx.cp.get(it) : cpWith(it)) - ctx.base;
        if (d > 0) up = '<span class="u up" title="+' + fmt(d) + ' CP">▲</span>';
        else if (d < 0) up = '<span class="u dn" title="' + fmt(d) + ' CP">▼</span>';
      }
    }
  }
  // refino +10 a +15: moldura brilhante na cor da faixa (a mesma do brilho 3D)
  const pl = it.plus || 0, rf = pl >= 10 ? '#' + refineColor(pl).toString(16).padStart(6, '0') : '';
  return '<button class="cell' + (isRare(it) ? ' rare' : '') + (bad ? ' bad' : '') + (rf ? ' rf' + (pl >= 15 ? ' rf15' : '') : '') + '"' + attrs + ' style="border-color:' + g.c + 'aa;--rc:' + g.c + (rf ? ';--rf:' + rf : '') + '" title="' + esc(R.itemName(it)) + (it.slot ? ' · ' + fmt(R.itemCP(it)) + ' CP' : '') + '">' +
    iconHtml(g) +
    (it.plus ? '<span class="p">+' + it.plus + '</span>' : '') + (it.qty > 1 ? '<span class="q">' + fmt(it.qty) + '</span>' : '') + cp + up + '</button>';
}
export function EquipmentSlot(s, it, cls) {
  if (it) return InventoryItem(it, ' data-act="seleq" data-slot="' + s + '"').replace('class="cell', 'class="cell eq');
  return '<div class="cell eq none" data-slot="' + s + '"><img class="sil" src="' + iconURI(s === 'weapon' ? R.CLASSES[cls].weapon : s, '#6a6078') + '" alt=""><em>' + R.SLOT_LABEL[s] + '</em></div>';
}

/** Troca o conteúdo de um nó só quando o HTML mudou; devolve o nó atual. */
function patch(el, html, prev) {
  if (prev === html) return el;
  const t = document.createElement('template');
  t.innerHTML = html;
  const n = t.content.firstChild;
  el.replaceWith(n);
  return n;
}

// ---------- EquipmentPanel ----------
const EquipmentPanel = {
  els: {}, html: {},
  skeleton() {
    const col = (list, side) => '<div class="eqcol ' + side + '">' + list.map((s) => '<div class="cell eq none" data-slot="' + s + '"></div>').join('') + '</div>';
    return '<div class="paper" id="paper">' + col(EQ_LEFT, 'l') + CharPreview.html() + col(EQ_RIGHT, 'r') + '</div>' +
      '<div class="invstats" id="invStats"></div>';
  },
  mount(root) {
    this.els = {}; this.html = {};
    root.querySelectorAll('#paper .eqcol > [data-slot]').forEach((el) => { this.els[el.dataset.slot] = el; });
    this.stats = root.querySelector('#invStats');
    this.statsHtml = '';
  },
  update(ch) {
    for (const s of R.SLOTS) {
      const h = EquipmentSlot(s, ch.equip[s], ch.cls);
      this.els[s] = patch(this.els[s], h, this.html[s]);
      this.html[s] = h;
    }
    const st = G.st;
    const sh = '<span><small>CP</small><b class="cpv">' + fmt(cpOf(ch)) + '</b></span>' +
      '<span><small>' + (ch.cls === 'dw' || R.CLASSES[ch.cls].magic ? 'Dano mágico' : 'Dano') + '</small><b>' + fmt(st.minDmg) + '~' + fmt(st.maxDmg) + '</b></span>' +
      '<span><small>Defesa</small><b>' + fmt(st.def) + '</b></span>' +
      '<span><small>HP</small><b>' + fmt(st.maxHp) + '</b></span>';
    if (sh !== this.statsHtml) { this.stats.innerHTML = sh; this.statsHtml = sh; }
  },
};

// ---------- InventoryGrid ----------
const InventoryGrid = {
  el: null, cells: [], html: [],
  mount(root) { this.el = root.querySelector('#bagGrid'); this.cells = []; this.html = []; },
  update(list) {
    const { el, cells, html } = this;
    for (let k = 0; k < list.length; k++) {
      if (!cells[k]) {
        el.insertAdjacentHTML('beforeend', list[k]);
        cells[k] = el.lastElementChild; html[k] = list[k];
      } else {
        cells[k] = patch(cells[k], list[k], html[k]);
        html[k] = list[k];
      }
    }
    while (cells.length > list.length) { cells.pop().remove(); html.pop(); }
  },
};

// ---------- InventoryUI ----------
export const InventoryUI = {
  root: null,
  skeleton() {
    return '<div class="inv" id="invRoot">' +
      '<h3 class="inv-h">Inventário <span class="cpbadge" id="invCP" title="Pontos de Combate (CP): poder total do personagem"></span></h3>' +
      '<div class="inv-cols"><section class="inv-char" aria-label="Personagem e equipamento">' + EquipmentPanel.skeleton() + '</section>' +
      '<section class="inv-bag" aria-label="Mochila">' +
      '<div class="baghead"><b>Mochila</b><span class="num" id="bagCount"></span><span class="gold"><span class="num" id="invGold"></span> de Ouro</span><span class="ups" id="bagUps"></span></div>' +
      '<div class="btabs" id="bagFilters" role="group" aria-label="Filtrar mochila"></div>' +
      '<div class="bag" id="bagGrid"></div>' +
      '<div class="row invtools" id="invTools"></div>' +
      '<p class="note tip">' + (touchUI() ? 'Toque seleciona · toque duplo equipa ou usa · toque longo abre o menu · arraste para equipar ou guardar.' : 'Clique seleciona · duplo clique equipa ou usa · botão direito abre o menu · arraste para equipar ou guardar.') + '</p>' +
      '</section></div></div>';
  },
  mount(pane) {
    if (!this.root) {
      const t = document.createElement('template');
      t.innerHTML = this.skeleton();
      this.root = t.content.firstChild;
      EquipmentPanel.mount(this.root);
      InventoryGrid.mount(this.root);
      CharPreview.mount(this.root.querySelector('#charPv'));
      this.$ = (id) => this.root.querySelector('#' + id);
      this.prev = {};
    }
    if (this.root.parentNode !== pane) { pane.textContent = ''; pane.appendChild(this.root); }
  },
  set(id, html) { if (this.prev[id] !== html) { this.prev[id] = html; this.$(id).innerHTML = html; } },
  render(pane) {
    this.mount(pane);
    const ch = G.ch, base = cpOf(ch);
    this.set('invCP', 'CP ' + fmt(base));
    EquipmentPanel.update(ch);
    const f = InventoryFilter.current();
    const cnt = { all: ch.bag.length, equip: 0, mat: 0, cons: 0, other: 0 };
    ch.bag.forEach((it) => cnt[InventoryFilter.cat(it)]++);
    // CP com cada peça da mochila, calculado uma vez por atualização (setas ▲▼ e contagem de melhorias)
    const cpMap = new Map();
    ch.bag.forEach((it) => { if (it.slot && classOk(it) && reqOk(it)) cpMap.set(it, cpWith(it)); });
    let ups = 0;
    cpMap.forEach((v) => { if (v > base) ups++; });
    this.set('bagCount', ch.bag.length + ' / ' + BAG_SIZE);
    this.set('invGold', fmt(ch.gold));
    this.set('bagUps', ups ? ups + ' melhoria' + (ups > 1 ? 's' : '') + ' ▲' : '');
    this.set('bagFilters', InventoryFilter.html(cnt, f));
    const ctx = { base, cp: cpMap }, list = [];
    const cell = (i) => InventoryItem(ch.bag[i], ' data-act="selbag" data-i="' + i + '"', ctx);
    if (f === 'all') for (let i = 0; i < BAG_SIZE; i++) list.push(cell(i));
    else {
      const idx = [];
      ch.bag.forEach((it, i) => { if (InventoryFilter.cat(it) === f) idx.push(i); });
      idx.sort((x, y) => R.itemCP(ch.bag[y]) - R.itemCP(ch.bag[x]));
      idx.forEach((i) => list.push(cell(i)));
      for (let k = idx.length; k < Math.max(8, Math.ceil(idx.length / 8) * 8); k++) list.push('<div class="cell empty"></div>');
    }
    InventoryGrid.update(list);
    const petN = ch.bag.filter(petSellable).length;
    this.set('invTools', '<button class="btn sm' + (autoEquipOn() ? ' gold' : '') + '" data-act="aeqtoggle" title="Equipa automaticamente a melhor peça ao coletar ou subir de nível">Auto-equipar: ' + (autoEquipOn() ? 'ligado' : 'desligado') + '</button>' +
      '<button class="btn sm" data-act="aeqnow">Equipar melhores</button>' +
      '<button class="btn sm" data-act="sortbag" title="Agrupa por categoria e ordena por CP">Organizar</button>' +
      '<button class="btn sm" data-act="petsell" title="Leva todo equipamento, exceto Lendários; joias e poções ficam na mochila">Pet vender (P) · ' + petN + '</button>');
    this.markSelection();
    CharPreview.sync(ch);
    ItemTooltip.sync();
  },
  /** Destaque do item selecionado (classe aplicada sem redesenhar a célula). */
  markSelection() {
    const s = UI.sel;
    const want = !s ? null : s.where === 'eq' ? this.root.querySelector('#paper [data-act="seleq"][data-slot="' + s.slot + '"]') : this.root.querySelector('#bagGrid [data-i="' + s.idx + '"]');
    this.root.querySelectorAll('.cell.sel').forEach((n) => { if (n !== want) n.classList.remove('sel'); });
    if (want) want.classList.add('sel');
  },
};

