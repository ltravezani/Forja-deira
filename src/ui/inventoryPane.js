// ---------- painel Inventário: equipamento, mochila por categoria, detalhe do item ----------
import { G, UI } from '../core/state.js';
import { esc, fmt, R } from '../core/util.js';
import { autoEquipOn, BAG_SIZE, bagCat, classOk, cpOf, cpWith, fmtCP, reqOk } from '../game/inventory.js';
import { petSellable } from '../game/allies.js';
import { hasTownServices } from '../game/zones.js';
import { glyph, iconHtml, iconURI } from './icons.js';
import { statLabel } from './panes.js';

function cellHtml(it, attrs, sel, ctx) {
  if (!it) return '<div class="cell"' + attrs + '></div>';
  const g = glyph(it);
  let bad = false, cp = '', up = '';
  if (it.slot) {
    bad = !classOk(it) || !reqOk(it);
    cp = '<span class="c">' + fmtCP(R.itemCP(it)) + '</span>';
    if (ctx && ctx.base != null && classOk(it)) {
      if (!reqOk(it)) up = '<span class="u r" title="Requisito não atendido">!</span>';
      else {
        const d = cpWith(it) - ctx.base;
        if (d > 0) up = '<span class="u up" title="+' + fmt(d) + ' CP">▲</span>';
        else if (d < 0) up = '<span class="u dn" title="' + fmt(d) + ' CP">▼</span>';
      }
    }
  }
  return '<button class="cell' + (sel ? ' sel' : '') + (bad ? ' bad' : '') + '"' + attrs + ' style="border-color:' + g.c + '66;--rc:' + g.c + '" title="' + esc(R.itemName(it)) + (it.slot ? ' · ' + fmt(R.itemCP(it)) + ' CP' : '') + '">' +
    iconHtml(g) +
    (it.plus ? '<span class="p">+' + it.plus + '</span>' : '') + (it.qty > 1 ? '<span class="q">' + it.qty + '</span>' : '') + cp + up + '</button>';
}
function itemDetail(it, where) {
  if (!it) return '<div class="detail note">Selecione um item para ver detalhes.</div>';
  const col = it.rarity ? R.RARITY[it.rarity].color : it.kind === 'jewel' ? R.JEWELS[it.id].color : '#fff';
  let h = '<div class="detail"><div class="nm" style="color:' + col + '">' + esc(R.itemName(it)) + (it.qty > 1 ? ' ×' + it.qty : '') + '</div>';
  if (it.kind === 'jewel') h += '<div class="ln">' + esc(R.JEWELS[it.id].desc) + '</div><div class="ln note">Use no Ferreiro Hanzo.</div>';
  else if (it.kind === 'potion' && R.POTIONS[it.id].revive) h += '<div class="ln">Ao cair, permite renascer no mesmo lugar do andar com HP e mana cheios, sem perder EXP nem Gold.</div>';
  else if (it.kind === 'potion') h += '<div class="ln">Recupera ' + Math.round(R.POTIONS[it.id].pct * 100) + '% + ' + R.POTIONS[it.id].flat + '. Atalho ' + (it.id === 'hp' ? 'Q' : 'E') + '.</div>';
  else {
    h += '<div class="ln note">' + R.SLOT_LABEL[it.slot] + (it.cls ? ' · ' + R.CLASSES[it.cls].tiers[0] : ' · todas as classes') + ' · tier ' + (it.tier + 1) + '</div>';
    h += '<div class="ln cpl">CP do item: <b class="num">' + fmt(R.itemCP(it)) + '</b>';
    if (where === 'bag' && classOk(it)) {
      const cur = G.ch.equip[it.slot], d = cpWith(it) - cpOf(G.ch);
      if (!reqOk(it)) h += ' · <span class="dn">requisito não atendido — não soma CP ainda</span>';
      else h += ' · <span class="' + (d > 0 ? 'up' : d < 0 ? 'dn' : '') + '">' + (d > 0 ? '▲ +' : d < 0 ? '▼ ' : '= ') + fmt(d) + ' CP no personagem</span>' + (cur ? ' <span class="note">(vs ' + esc(R.itemName(cur)) + ' · ' + fmt(R.itemCP(cur)) + ')</span>' : ' <span class="note">(slot vazio)</span>');
    }
    h += '</div>';
    R.itemLines(it).forEach(([k, v]) => (h += '<div class="ln">' + k + ': <b class="num">' + v + '</b></div>'));
    if (it.luck) h += '<div class="ln">Sorte (crítico +5%, +25% no Soul)</div>';
    if (it.skill) h += '<div class="ln">Habilidade (+10% dano de habilidades)</div>';
    if (it.addOpt) h += '<div class="ln">Opção adicional +' + it.addOpt + '</div>';
    const exSet = it.slot === 'weapon' || it.slot === 'pendant' ? R.EXC_WEAPON : R.EXC_ARMOR;
    (it.exc || []).forEach((e) => (h += '<div class="ln exc">' + esc(exSet[e].t) + '</div>'));
    if (it.anc) h += '<div class="ln anc">Ancestral: ' + statLabel(it.anc.stat) + ' +' + it.anc.value + '</div>';
    if (it.legend) h += '<div class="ln leg">Lendário: ' + esc(R.LEGEND[it.legend].t) + '</div>';
    const req = R.itemReq(it);
    if (req) {
      const have = req.stat === 'level' ? G.ch.level : G.ch.stats[req.stat];
      h += '<div class="ln req' + (have < req.value ? ' bad' : '') + '">Requer ' + (req.stat === 'level' ? 'nível' : statLabel(req.stat)) + ' ' + req.value + (have < req.value ? ' (você tem ' + have + ')' : '') + '</div>';
    }
    if (it.cls && it.cls !== G.ch.cls) h += '<div class="ln req bad">Exclusivo de ' + R.CLASSES[it.cls].tiers[0] + ' — venda ou negocie no mercado.</div>';
    h += '<div class="ln seed">Seed ' + esc(it.seed || '—') + (it.rolls && it.rolls[0] ? ' · rolagem ' + it.rolls[0].roll.toFixed(5) : '') + ' · valor ' + fmt(R.itemValue(it)) + ' Gold</div>';
  }
  h += '<div class="row" style="margin-top:8px">';
  if (it.slot) {
    if (where === 'eq') h += '<button class="btn sm" data-act="unequip">Desequipar</button>';
    else if (classOk(it)) h += '<button class="btn sm gold" data-act="equip">Equipar</button>';
  }
  if (it.kind === 'potion' && !R.POTIONS[it.id].revive) h += '<button class="btn sm" data-act="usepot">Usar</button>';
  if (where === 'bag') {
    if (hasTownServices()) h += '<button class="btn sm" data-act="sell">Vender ' + fmt(Math.floor(R.itemValue(it) * 0.5)) + ' Gold</button>';
    h += '<button class="btn sm" data-act="drop">Descartar</button>';
  }
  h += '</div></div>';
  return h;
}
export function selectedItem() {
  const s = UI.sel;
  if (!s) return null;
  if (s.where === 'eq') return G.ch.equip[s.slot] || null;
  return G.ch.bag[s.idx] || null;
}
export function paneInv() {
  const ch = G.ch;
  const base = cpOf(ch);
  let h = '<h3>Inventário <span class="cpbadge" title="Combat Points: poder total do personagem">CP ' + fmt(base) + '</span></h3>';
  h += '<div class="row aeq"><button class="btn sm' + (autoEquipOn() ? ' gold' : '') + '" data-act="aeqtoggle" title="Equipa automaticamente a melhor peça ao coletar ou subir de nível">Auto-equipar: ' + (autoEquipOn() ? 'ligado' : 'desligado') + '</button><button class="btn sm" data-act="aeqnow">Equipar melhores agora</button></div>';
  h += '<p class="note tip">Clique duplo ou botão direito equipa/desequipa · arraste da mochila para o equipamento (ou de volta).</p>';
  h += '<h4>Equipado</h4><div class="paper" id="paper">';
  R.SLOTS.forEach((s) => {
    const it = ch.equip[s];
    const sel = UI.sel && UI.sel.where === 'eq' && UI.sel.slot === s;
    if (it) h += cellHtml(it, ' data-act="seleq" data-slot="' + s + '"', sel).replace('class="cell', 'class="cell eq');
    else h += '<div class="eq" data-slot="' + s + '"><em>' + R.SLOT_LABEL[s] + '</em><img class="sil" src="' + iconURI(s === 'weapon' ? (ch.cls === 'dw' ? 'staff' : ch.cls === 'elf' ? 'bow' : 'sword') : s, '#6a6078') + '" alt=""></div>';
  });
  const cats = { all: 'Todos', mine: 'Minha classe', other: 'Outras', mat: 'Materiais' };
  const cnt = { all: ch.bag.length, mine: 0, other: 0, mat: 0 };
  ch.bag.forEach((it) => cnt[bagCat(it)]++);
  const f = UI.bagFilter || 'all';
  const ups = ch.bag.filter((it) => classOk(it) && reqOk(it) && cpWith(it) > base).length;
  h += '</div><h4>Mochila · ' + ch.bag.length + '/' + BAG_SIZE + ' · ' + fmt(ch.gold) + ' Gold' + (ups ? ' · <span class="up">' + ups + ' melhoria' + (ups > 1 ? 's' : '') + ' ▲</span>' : '') + '</h4>';
  h += '<div class="btabs">' + Object.keys(cats).map((k) => '<button class="btab' + (f === k ? ' on' : '') + '" data-act="bagf" data-k="' + k + '">' + cats[k] + ' <span>' + cnt[k] + '</span></button>').join('') + '</div>';
  h += '<div class="bag" id="bagGrid">';
  const ctx = { base };
  if (f === 'all') {
    for (let i = 0; i < BAG_SIZE; i++) h += cellHtml(ch.bag[i], ' data-act="selbag" data-i="' + i + '"', UI.sel && UI.sel.where === 'bag' && UI.sel.idx === i, ctx);
  } else {
    const idx = [];
    ch.bag.forEach((it, i) => { if (bagCat(it) === f) idx.push(i); });
    idx.sort((x, y) => (R.itemCP(ch.bag[y]) - R.itemCP(ch.bag[x])));
    idx.forEach((i) => (h += cellHtml(ch.bag[i], ' data-act="selbag" data-i="' + i + '"', UI.sel && UI.sel.where === 'bag' && UI.sel.idx === i, ctx)));
    for (let k = idx.length; k < Math.max(8, Math.ceil(idx.length / 8) * 8); k++) h += '<div class="cell"></div>';
  }
  h += '</div>';
  h += itemDetail(selectedItem(), UI.sel && UI.sel.where);
  const petN = ch.bag.filter(petSellable).length;
  h += '<div class="row" style="margin-top:10px"><button class="btn sm" data-act="petsell" title="Leva todo equipamento, exceto Lendários; joias e poções ficam na mochila">Enviar pet para vender (P) · ' + petN + ' ite' + (petN === 1 ? 'm' : 'ns') + '</button><button class="btn sm" data-act="sortbag" title="Agrupa por categoria e ordena por CP">Organizar por CP</button></div>';
  return h;
}
