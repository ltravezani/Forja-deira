// ---------- diálogos dos NPCs (portais, ferreiro, mercadora, mestre) e tela de queda ----------
import { G, persist, UI } from '../core/state.js';
import { $, dec, esc, fmt, R } from '../core/util.js';
import { Sfx } from '../engine/audio.js';
import { emit } from '../engine/effects.js';
import { respawn, revive, unlockSkills } from '../game/combat.js';
import { NPCS } from '../game/data.js';
import { addToBag, potionCount } from '../game/inventory.js';
import { buildPlayerModel, recalc } from '../game/player.js';
import { enterDungeon, enterEden, enterTower } from '../game/zones.js';
import { questEvent } from '../game/quests.js';
import { openQuestBoard } from './questUi.js';
import { fmtWait } from '../game/npcs.js';
import { buildSlots, hudTick } from './hud.js';
import { glyph, iconHtml } from './icons.js';
import { log, toast } from './log.js';
import { BIOMES, DUNGEON_ORDER, floorLevel, towerBiome } from '../world/biomes.js';

function modal(html) { $('#dialog').innerHTML = html; $('#modal').classList.remove('acct-on'); $('#modal').hidden = false; }
export function closeModal() { $('#modal').hidden = true; }
const SELL_CATS = { all: 'Todos', jewel: 'Joias', potion: 'Poções' };
const sellCat = (it) => (it.slot ? 'equip' : it.kind === 'jewel' ? 'jewel' : it.kind === 'potion' ? 'potion' : 'other');
/** Equipamentos ficam de fora da lista: saem pelo pet ou pelo botão de Comuns/Mágicos. */
const sellListed = (it) => !it.slot;
/** Joias pedem confirmação antes de vender. */
const sellNeedsConfirm = (it) => it.kind === 'jewel' || it.kind === 'talisman';
/** Venda em lote ("Comuns/Mágicos"): nunca leva asas nem itens trancados. */
const junkSellable = (x) => x.slot && x.slot !== 'wings' && !x.locked && R.RARITY[x.rarity].order <= 1;
/** Itens listados na última renderização (os botões guardam a posição nesta lista, não na mochila). */
let merchItems = [], smithItems = [];
function sellSection(ch) {
  merchItems = ch.bag.slice();
  const f = SELL_CATS[UI.merchFilter] ? UI.merchFilter : 'all';
  const cnt = { all: 0, jewel: 0, potion: 0 };
  ch.bag.forEach((it) => { if (!sellListed(it)) return; cnt.all++; const c = sellCat(it); if (c in cnt) cnt[c]++; });
  let h = '<h4 style="margin:16px 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)">Vender item</h4>';
  h += '<div class="btabs">' + Object.keys(SELL_CATS).map((k) => '<button class="btab' + (f === k ? ' on' : '') + '" data-npc="sellf" data-k="' + k + '">' + SELL_CATS[k] + ' <span>' + cnt[k] + '</span></button>').join('') + '</div>';
  const idx = [];
  ch.bag.forEach((it, i) => { if (sellListed(it) && (f === 'all' || sellCat(it) === f)) idx.push(i); });
  idx.sort((a, b) => R.sellValue(ch.bag[b], 1) - R.sellValue(ch.bag[a], 1));
  if (!idx.length) return h + '<p class="note">Nada ' + (f === 'all' ? 'na mochila' : 'desta categoria na mochila') + ' para vender.</p>';
  const cf = UI.merchConfirm && ch.bag.includes(UI.merchConfirm.it) ? UI.merchConfirm : null;
  h += '<div class="list selllist">';
  idx.forEach((i) => {
    const it = ch.bag[i], g = glyph(it), q = it.qty || 1;
    const sub = (it.kind === 'jewel' ? 'Joia' : it.kind === 'talisman' ? 'Talismã' : 'Poção') + ' · você tem ' + q;
    let a;
    if (it.locked) a = '<button class="btn sm" disabled>Trancado</button>';
    else if (cf && cf.it === it) {
      a = '<button class="btn sm gold" data-npc="sell" data-i="' + i + '" data-n="' + cf.n + '" data-ok="1">Confirmar · ' + fmt(R.sellValue(it, cf.n)) + '</button><button class="btn sm" data-npc="sellno">Cancelar</button>';
    } else {
      a = q > 1
        ? '<button class="btn sm" data-npc="sell" data-i="' + i + '" data-n="1">×1 · ' + fmt(R.sellValue(it, 1)) + '</button><button class="btn sm" data-npc="sell" data-i="' + i + '" data-n="' + q + '">Tudo · ' + fmt(R.sellValue(it)) + '</button>'
        : '<button class="btn sm" data-npc="sell" data-i="' + i + '" data-n="1">Vender · ' + fmt(R.sellValue(it)) + '</button>';
    }
    h += '<div class="li"><span class="nm"><span class="ic">' + iconHtml(g) + '</span><span class="t" title="' + esc(R.itemName(it)) + '" style="color:' + g.c + '">' + esc(R.itemName(it)) + (q > 1 ? ' ×' + q : '') + '</span></span><span class="a row">' + a + '</span><span class="s">' + sub + (cf && cf.it === it ? ' · <b style="color:var(--gold)">Tem certeza?</b>' : '') + '</span></div>';
  });
  return h + '</div>';
}
function sellFromBag(ch, li, n, confirmed) {
  // confere o item da lista na mochila agora (o pet ou uma poção podem ter mudado as posições)
  const it = merchItems[li], i = it ? ch.bag.indexOf(it) : -1;
  if (i < 0 || !sellListed(it) || it.locked) { UI.merchConfirm = null; return; }
  const q = it.qty || 1;
  n = Math.max(1, Math.min(n || 1, q));
  if (sellNeedsConfirm(it) && !confirmed) { UI.merchConfirm = { it, n }; return; }
  UI.merchConfirm = null;
  const gold = R.sellValue(it, n);
  ch.gold += gold;
  if (n >= q) ch.bag.splice(i, 1); else it.qty = q - n;
  UI.sel = null;
  log('Vendeu ' + R.itemName(it) + (n > 1 ? ' ×' + n : '') + ' por ' + fmt(gold) + ' de Ouro.', 'loot');
  Sfx.coin();
}
function talismanCount() { const t = G.ch.bag.find((b) => b.kind === 'talisman' && b.id === 'luck'); return t ? t.qty : 0; }
/** Gasta um Talismã da Sorte da mochila; devolve false se não houver. */
function takeTalisman() {
  const bag = G.ch.bag, t = bag.find((b) => b.kind === 'talisman' && b.id === 'luck');
  if (!t) return false;
  t.qty--; if (t.qty <= 0) bag.splice(bag.indexOf(t), 1);
  return true;
}
/** Evolução de asa (asa normal +12 → Ascendida): custo, chance e o que acontece na falha. */
function wingUpSection(sel, cnt, useT, tal) {
  const W = R.WING_UP, pl = sel.plus || 0;
  let h = '<h4 style="margin:14px 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)">Evoluir asa</h4>';
  if (sel.stage) return h + '<p class="note">Esta asa já é Ascendida: maior, com mais penas e +10% de dano, +6% de absorção e +5% de HP. Continue refinando até +15.</p>';
  const c = R.wingUpgradeChance(sel);
  const need = Object.keys(W.jewels);
  const have = need.every((j) => cnt(j) >= W.jewels[j]);
  h += '<p class="note">Vira <b>' + esc(R.itemName(Object.assign({}, sel, { stage: 1, plus: 0 }))) + '</b>: asa maior e mais detalhada, +10% de dano, +6% de absorção e +5% de HP. Mantém o +nível no sucesso.</p>';
  h += '<p class="note">Custo: ' + need.map((j) => '<span style="color:' + R.JEWELS[j].color + '">' + W.jewels[j] + ' ' + R.JEWELS[j].name + '</span> (' + cnt(j) + ')').join(' · ') + '. As joias são gastas mesmo se falhar.</p>';
  h += '<p class="note">Chance: 10% com a asa +12 e +5% a cada nível acima (+13: 15%, +14: 20%, +15: 25%).</p>';
  const fail = useT ? '<b style="color:' + R.TALISMANS.luck.color + '">Falha: mantém +' + pl + ' (Talismã da Sorte).</b>' : 'Falha: a asa volta a +0.' + (tal ? ' Ligue o Talismã da Sorte acima para proteger.' : '');
  h += '<div class="list"><div class="li"><span style="color:var(--gold)">Evoluir para Ascendida</span><span class="a"><button class="btn sm gold" data-npc="wingup"' + (c > 0 && have ? '' : ' disabled') + '>' + (c > 0 ? Math.round(c * 100) + '%' : 'Precisa +' + W.minPlus) + '</button></span><span class="s">' + (c > 0 ? fail : 'A asa precisa estar +' + W.minPlus + ' ou mais (agora +' + pl + ').') + '</span></div></div>';
  return h;
}
/** Equipamentos que o Ferreiro aceita: os equipados e os da mochila. */
const smithList = (ch) => R.SLOTS.map((s) => ch.equip[s]).filter(Boolean).concat(ch.bag.filter((x) => x.slot));
/** O item escolhido no Ferreiro ainda é do herói (equipado ou na mochila)? */
const owned = (ch, it) => !!it && (ch.equip[it.slot] === it || ch.bag.includes(it));
function npcHead(id) { const D = NPCS[id]; return '<h3>' + esc(D.name) + '</h3><div class="role">' + esc(D.role) + '</div><p class="say">“' + esc(D.say) + '”</p>'; }
export function openNpc(id) {
  if (id === 'board') { openQuestBoard(); return; } // Quadro de Missões (ui/questUi.js)
  questEvent('talk', id);
  if (G.openNpcId !== id || $('#modal').hidden) { UI.merchConfirm = null; UI.npcConfirm = null; }
  G.openNpcId = id;
  const ch = G.ch;
  let h = npcHead(id);
  if (id === 'portal') {
    // cor pela diferença de nível (verde / amarelo / vermelho) e destaque da masmorra recomendada:
    // a de monstros mais fortes que ainda não passam de 5 níveis acima do herói
    const RISK = { easy: 'Fácil demais (pouca EXP)', ok: 'Adequado ao seu nível', hard: 'Desafiador', deadly: 'Perigoso para o seu nível' };
    let rec = null, recLv = -1;
    DUNGEON_ORDER.forEach((k) => {
      const maxF = ch.unlockedFloors[k] || 1;
      for (const f of [1, maxF]) { const lv = floorLevel(k, f); if (R.levelRisk(lv, ch.level) === 'ok' && lv > recLv) { recLv = lv; rec = k; } }
    });
    h += '<div class="dungeons">';
    DUNGEON_ORDER.forEach((k) => {
      const B = BIOMES[k];
      const maxF = ch.unlockedFloors[k] || 1;
      const lv1 = floorLevel(k, 1), lv = floorLevel(k, maxF);
      const r1 = R.levelRisk(lv1, ch.level), rMax = R.levelRisk(lv, ch.level);
      const btn = (f, risk, gold) => '<button class="btn sm risk-' + risk + (gold ? ' gold' : '') + '" data-npc="go" data-b="' + k + '" data-f="' + f + '" title="' + RISK[risk] + '">Andar ' + f + '</button>';
      h += '<div class="dg risk-' + r1 + (k === rec ? ' rec' : '') + '"><div><b>' + esc(B.name) + '</b>' + (k === rec ? ' <span class="tag-rec">Recomendada</span>' : '') +
        '<div class="s">Monstros nv ' + lv1 + '+ · mais fundo liberado: andar ' + maxF + ' (nv ' + lv + ')</div>' +
        '<div class="s risk-txt">' + RISK[r1] + (maxF > 1 && rMax !== r1 ? ' · andar ' + maxF + ': ' + RISK[rMax].toLowerCase() : '') + '</div></div><div class="row">' +
        btn(1, r1, false) + (maxF > 1 ? btn(maxF, rMax, true) : '') + '</div></div>';
    });
    h += '</div><p class="note" style="margin-top:10px">Seu nível: ' + ch.level + '. Verde: até 5 níveis acima do seu; amarelo: até 25; vermelho: perigoso. Cada andar soma +8 níveis.</p>';
  } else if (id === 'tower') {
    const best = ch.towerBest || 1, T = R.TOWER;
    const row = (f, gold) => {
      const B = BIOMES[towerBiome(f, T.biomeEvery)], m = R.towerMod(f);
      return '<div class="dg risk-' + R.levelRisk(R.towerLevel(f), ch.level) + '"><div><b>Andar ' + f + '</b> · ' + esc(B.name) + '<div class="s">Monstros nv ' + R.towerLevel(f) + '+ · HP ×' + dec(m.hp, 2) + ' · dano ×' + dec(m.dmg, 2) + '</div></div><div class="row"><button class="btn sm' + (gold ? ' gold' : '') + '" data-npc="tower" data-f="' + f + '">' + (f === 1 ? 'Entrar' : 'Continuar') + '</button></div></div>';
    };
    h += '<div class="dungeons">' + row(1, best === 1) + (best > 1 ? row(best, true) : '') + '</div>';
    h += '<p class="note" style="margin-top:10px">Recorde: andar ' + best + '. Cada andar soma +' + T.levelPerFloor + ' níveis e deixa os monstros mais fortes. O bioma muda a cada ' + T.biomeEvery + ' andares.</p>' +
      '<p class="note">Drops: só Ouro (o dobro de um andar de masmorra) e ' + Math.round(T.jewelChance * 100) + '% de chance de uma Joia aleatória por monstro. O chefe no fim de cada andar tem ' + Math.round(T.bossChance * 100) + '% de chance de deixar Ouro e Joias.</p>';
  } else if (id === 'eden') {
    const left = R.edenRemaining(ch, Date.now()), E = R.EDEN, lv = R.edenEntryLevel(ch.level);
    h += '<div class="dungeons"><div class="dg"><div><b>O Éden</b><div class="s">Monstros do nv ' + lv + ' (seu nível − 15%) até o Guardião do Éden, nv ' + R.edenLevel(lv, 'boss') + '</div></div><div class="row">' +
      (left ? '<button class="btn sm" disabled>Adormecido · ' + fmtWait(left) + '</button>' : '<button class="btn sm gold" data-npc="eden">Entrar</button>') + '</div></div></div>';
    h += '<p class="note" style="margin-top:10px">' + (left ? 'O portal volta a abrir em <b>' + fmtWait(left) + '</b>.' : 'Ao entrar, o portal adormece por 3 horas, mesmo que você saia antes ou caia lá dentro.') + '</p>' +
      '<p class="note">Três caminhos (Floresta, Raízes e Rio) levam ao Coração do Éden. A dificuldade se ajusta ao seu nível na entrada.</p>' +
      '<p class="note">Drops: ' + Math.round(E.rare.normal * 100) + '% de joia ou item Ancestral (mais nos mini chefes e no Guardião), ' + Math.round(E.legend.boss * 100) + '% de item Lendário nos mini chefes e no Guardião, ' + Math.round(E.talisman * 100) + '% de Talismã da Sorte (sempre no Guardião) e ' + Math.round(E.buffPotion.normal * 100) + '% de poções de reforço em qualquer monstro.</p>';
  } else if (id === 'smith') {
    const items = smithList(ch);
    smithItems = items;
    const sel = items.find((x) => x === UI.smithSel) || items[0];
    UI.smithSel = sel;
    const cnt = (j) => { const x = ch.bag.find((b) => b.kind === 'jewel' && b.id === j); return x ? x.qty : 0; };
    const nEq = R.SLOTS.filter((s) => ch.equip[s]).length;
    h += '<p class="note">' + items.length + ' equipamento' + (items.length === 1 ? '' : 's') + ' (' + nEq + ' equipado' + (nEq === 1 ? '' : 's') + ', ' + (items.length - nEq) + ' na mochila). Escolha um para aprimorar.</p>';
    h += '<div class="smithlist">' + items.map((x, i) => '<button class="btn sm' + (x === sel ? ' gold' : '') + '" data-npc="smithsel" data-i="' + i + '" style="color:' + R.RARITY[x.rarity].color + '" title="' + esc(R.itemName(x)) + '">' + (i < nEq ? '<small>Equipado</small>' : '') + esc(R.itemName(x)) + '</button>').join('') + '</div>';
    if (sel) {
      const tal = talismanCount();
      if (!tal) UI.smithTalisman = false;
      const useT = UI.smithTalisman && tal > 0, pl = sel.plus || 0;
      h += '<h4 style="margin:14px 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)">Aprimorar ' + esc(R.itemName(sel)) + '</h4>';
      h += '<p class="note">Agora: <b>+' + pl + '</b>' + (sel.luck ? ' · com Sorte' : '') + (sel.addOpt ? ' · opção adicional +' + sel.addOpt : '') + '</p>';
      // Talismã da Sorte: liga/desliga; protege a fusão do Caos (a única que volta o item a +0)
      const tg = { kind: 'talisman', id: 'luck' };
      h += '<div class="list"><div class="li"><span class="nm"><span class="ic">' + iconHtml(glyph(tg)) + '</span><span class="t" style="color:' + R.TALISMANS.luck.color + '">Talismã da Sorte ×' + tal + '</span></span><span class="a"><button class="btn sm' + (useT ? ' gold' : '') + '" data-npc="taltoggle"' + (tal ? '' : ' disabled') + '>' + (useT ? 'Em uso' : 'Usar') + '</button></span><span class="s">' + (tal ? (useT ? 'Ligado: se a fusão do Caos ou a evolução de asa falhar, o item fica em +' + pl + ' (gasta 1 talismã por tentativa).' : 'Desligado. Ligue para proteger a fusão do Caos e a evolução de asa.') : 'Cai no Éden (sempre do Guardião do Éden). Impede o item de voltar a +0.') + '</span></div></div>';
      h += '<div class="list" style="margin-top:6px">';
      ['bless', 'soul', 'chaos', 'life'].forEach((j) => {
        const c = R.upgradeChance(sel, j);
        const need = R.upgradeCost(sel, j), short = c > 0 && cnt(j) < need;
        const fee = (need > 1 ? ' · ' + need + ' joias' : '') + (j === 'chaos' ? ' + ' + fmt(R.RATES.chaosFeeGold) + ' de Ouro' : '');
        const fail = c <= 0 ? esc(R.JEWELS[j].desc) : j === 'bless' ? 'Sempre funciona até +6.' : j === 'soul' ? 'Falha: cai para +' + Math.max(6, pl - 1) + '.' : j === 'chaos' ? (useT ? '<b style="color:' + R.TALISMANS.luck.color + '">Falha: mantém +' + pl + ' (Talismã da Sorte).</b>' : 'Falha: volta a +0.') : 'Falha: nada muda.';
        h += '<div class="li"><span style="color:' + R.JEWELS[j].color + '">' + R.JEWELS[j].name + ' ×' + cnt(j) + '</span><span class="a"><button class="btn sm' + (j === 'chaos' && useT ? ' gold' : '') + '" data-npc="up" data-j="' + j + '"' + (c > 0 && cnt(j) >= need ? '' : ' disabled') + '>' + (c > 0 ? Math.round(c * 100) + '%' + fee : '—') + '</button></span><span class="s">' + (c > 0 && j === 'chaos' ? 'Para +' + (pl + 1) + ': ' + need + (need > 1 ? ' Joias do Caos' : ' Joia do Caos') + (short ? ' <b style="color:#ff6b6b">(faltam ' + (need - cnt(j)) + ')</b>' : '') + '. ' : '') + fail + '</span></div>';
      });
      h += '</div>';
      if (sel.slot === 'wings') h += wingUpSection(sel, cnt, useT, tal);
    } else h += '<p class="note">Você não tem equipamentos.</p>';
  } else if (id === 'merchant') {
    const junk = ch.bag.filter(junkSellable);
    const junkVal = junk.reduce((a, x) => a + Math.floor(R.itemValue(x) * 0.5), 0);
    h += '<div class="list">';
    ['hp', 'mp'].forEach((p) => { const D = R.POTIONS[p]; h += '<div class="li"><span>' + D.name + '</span><span class="a row"><button class="btn sm" data-npc="buy" data-p="' + p + '" data-n="10">×10 · ' + fmt(D.price * 10) + '</button><button class="btn sm" data-npc="buy" data-p="' + p + '" data-n="50">×50 · ' + fmt(D.price * 50) + '</button></span><span class="s">Você tem ' + potionCount(p) + '</span></div>'; });
    const RZ = R.POTIONS.rez;
    h += '<div class="li"><span style="color:#ffd24a">' + RZ.name + '</span><span class="a row"><button class="btn sm gold" data-npc="buy" data-p="rez" data-n="1"' + (ch.gold >= RZ.price ? '' : ' disabled') + '>×1 · ' + fmt(RZ.price) + '</button></span><span class="s">Renasce onde caiu, no mesmo andar, sem perder EXP nem Ouro · você tem ' + potionCount('rez') + '</span></div>';
    h += '</div><div class="row" style="margin-top:12px">' + (UI.npcConfirm === 'selljunk' && junk.length
      ? '<button class="btn gold" data-npc="selljunk" data-ok="1">Confirmar: vender ' + junk.length + ' · ' + fmt(junkVal) + ' de Ouro</button><button class="btn" data-npc="npcno">Cancelar</button>'
      : '<button class="btn gold" data-npc="selljunk"' + (junk.length ? '' : ' disabled') + '>Vender ' + junk.length + ' Comuns/Mágicos · ' + fmt(junkVal) + ' de Ouro</button>') + '</div>';
    h += sellSection(ch);
  } else if (id === 'master') {
    const ev = R.canEvolve(ch), rs = R.canReset(ch);
    h += '<h4 style="margin:6px 0;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)">Evolução</h4>';
    h += ev.next ? '<p>' + esc(R.className(ch)) + ' → <b style="color:var(--gold)">' + esc(ev.name) + '</b>: +' + ev.next.dmgPct + '% dano, +' + ev.next.hpPct + '% HP, nova habilidade e visual.</p><p class="note">' + (ev.ok ? 'Todos os requisitos cumpridos.' : 'Falta: ' + esc(ev.reasons.join(', '))) + '</p><button class="btn gold" data-npc="evolve"' + (ev.ok ? '' : ' disabled') + '>Evoluir</button>' : '<p class="note">Você já alcançou a forma final.</p>';
    h += '<h4 style="margin:16px 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)">Reset (' + ch.resets + ')</h4><p class="note">Nível 400+ e ' + fmt(rs.cost) + ' de Ouro. Volta ao nível 1 com ' + fmt((ch.resets + 1) * R.RATES.resetPoints + Math.max(0, ch.level - 400) * R.RATES.resetBonusPerLevel) + ' pontos livres, +2% de Encontrar Magia permanente e +10 pontos de árvore. A árvore de maestria é zerada e seus pontos voltam para redistribuir.</p>' +
      (!rs.ok ? '<p class="note">Falta: ' + esc(rs.reasons.join(', ')) + '</p>'
        : UI.npcConfirm === 'reset' ? '<div class="row"><button class="btn gold" data-npc="reset" data-ok="1">Confirmar reset · ' + fmt(rs.cost) + ' de Ouro</button><button class="btn" data-npc="npcno">Cancelar</button></div>'
        : '<button class="btn gold" data-npc="reset">Fazer reset</button>');
    const spent = R.treeSpent(ch);
    h += '<h4 style="margin:16px 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)">Árvore de maestria</h4>' + (UI.npcConfirm === 'treereset' && spent && ch.gold >= 100000
      ? '<div class="row"><button class="btn sm gold" data-npc="treereset" data-ok="1">Confirmar: redistribuir ' + spent + ' pontos · 100.000 de Ouro</button><button class="btn sm" data-npc="npcno">Cancelar</button></div>'
      : '<button class="btn sm" data-npc="treereset"' + (spent && ch.gold >= 100000 ? '' : ' disabled') + '>Redistribuir ' + spent + ' pontos · 100.000 de Ouro</button>');
  } else if (NPCS[id] && NPCS[id].soon) {
    h += '<p class="note"><b class="soon">Em breve</b> · Esta função ainda não está disponível.</p>';
  }
  // "Fechar" fica fixo no topo do diálogo (sempre visível em telas baixas) e repetido no fim
  h = '<button class="btn sm dlg-x" data-npc="close" aria-label="Fechar">Fechar</button>' + h;
  h += '<div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn" data-npc="close">Fechar</button></div>';
  modal(h);
}
function npcAction(e) {
  const b = e.target.closest('[data-npc]');
  if (!b || b.disabled) return;
  const a = b.dataset.npc, ch = G.ch;
  // confirmação em dois cliques (reset, redistribuir, vender em lote): só o clique seguinte confirma
  const confirmed = b.dataset.ok === '1' && UI.npcConfirm === a;
  UI.npcConfirm = null;
  switch (a) {
    case 'npcno': break;
    case 'close': closeModal(); return;
    case 'go': {
      // só andares já liberados (o botão pode estar velho)
      const k = b.dataset.b;
      if (!BIOMES[k] || DUNGEON_ORDER.indexOf(k) < 0) return;
      closeModal(); enterDungeon(k, Math.max(1, Math.min(Math.floor(+b.dataset.f) || 1, ch.unlockedFloors[k] || 1)));
      return;
    }
    case 'eden': closeModal(); if (!R.edenRemaining(ch, Date.now())) enterEden(); return;
    case 'tower': closeModal(); enterTower(Math.max(1, Math.min(+b.dataset.f || 1, ch.towerBest || 1))); return;
    case 'smithsel': { const x = smithItems[+b.dataset.i]; if (owned(ch, x)) UI.smithSel = x; break; }
    case 'up': {
      const it = UI.smithSel, j = b.dataset.j;
      const stack = ch.bag.find((x) => x.kind === 'jewel' && x.id === j);
      // valida tudo ANTES de cobrar: o item ainda é do herói (o pet pode tê-lo vendido) e a fusão tem chance
      if (!owned(ch, it)) { log('Este item não está mais com você.', 'warn'); UI.smithSel = null; break; }
      if (!R.JEWELS[j] || R.upgradeChance(it, j) <= 0) break;
      const need = R.upgradeCost(it, j);
      if (!stack) break;
      if (stack.qty < need) { log('São necessárias ' + need + ' unidades de ' + R.JEWELS[j].name + ' para esta fusão (você tem ' + stack.qty + ').', 'warn'); break; }
      if (j === 'chaos') { if (ch.gold < R.RATES.chaosFeeGold) { log('A fusão do Caos custa ' + fmt(R.RATES.chaosFeeGold) + ' de Ouro.', 'warn'); break; } ch.gold -= R.RATES.chaosFeeGold; }
      stack.qty -= need; if (!stack.qty) ch.bag.splice(ch.bag.indexOf(stack), 1);
      // Talismã da Sorte: gasto na tentativa de fusão do Caos com ele ligado
      const talisman = UI.smithTalisman && R.talismanUseful(j) && takeTalisman();
      const r = R.applyUpgrade(it, j, Math.random(), { talisman });
      if (r.ok) { log('Sucesso! ' + R.itemName(it) + (talisman ? ' (Talismã da Sorte gasto)' : ''), 'loot'); Sfx.level(); toast('Sucesso', R.itemName(it)); }
      else if (r.protected) { log('Falhou (' + Math.round(r.chance * 100) + '%), mas o Talismã da Sorte manteve ' + R.itemName(it) + '.', 'loot'); Sfx.hurt(); toast('Talismã da Sorte', 'O item continua em +' + (it.plus || 0)); }
      else { log('Falhou (' + Math.round(r.chance * 100) + '%). ' + R.itemName(it), 'warn'); Sfx.hurt(); }
      recalc(); buildPlayerModel();
      break;
    }
    case 'wingup': {
      const it = UI.smithSel, W = R.WING_UP;
      if (!owned(ch, it)) { log('Esta asa não está mais com você.', 'warn'); UI.smithSel = null; break; }
      if (it.slot !== 'wings' || it.stage || R.wingUpgradeChance(it) <= 0) break;
      const stacks = Object.keys(W.jewels).map((j) => ch.bag.find((x) => x.kind === 'jewel' && x.id === j));
      if (stacks.some((x, i) => !x || x.qty < W.jewels[Object.keys(W.jewels)[i]])) { log('Faltam Joias para evoluir a asa.', 'warn'); break; }
      Object.keys(W.jewels).forEach((j, i) => { const x = stacks[i]; x.qty -= W.jewels[j]; if (!x.qty) ch.bag.splice(ch.bag.indexOf(x), 1); });
      const talisman = UI.smithTalisman && R.talismanUseful('wing') && takeTalisman();
      const r = R.applyWingUpgrade(it, Math.random(), { talisman });
      if (r.ok) {
        log('A asa evoluiu! ' + R.itemName(it) + (talisman ? ' (Talismã da Sorte gasto)' : ''), 'loot'); Sfx.level(); toast('Asa Ascendida', R.itemName(it));
        if (G.player) emit(G.player.x, 1.4, G.player.z, { n: 90, color: 0xfff0b0, speed: 3, up: 3, life: 1.4, size: 1.1, grav: 1, spread: 1.6 });
      } else if (r.protected) { log('A evolução falhou (' + Math.round(r.chance * 100) + '%), mas o Talismã da Sorte manteve ' + R.itemName(it) + '.', 'loot'); Sfx.hurt(); toast('Talismã da Sorte', 'A asa continua em +' + (it.plus || 0)); }
      else { log('A evolução falhou (' + Math.round(r.chance * 100) + '%). ' + R.itemName(it) + ' voltou a +0.', 'warn'); Sfx.hurt(); }
      recalc(); buildPlayerModel();
      break;
    }
    case 'taltoggle': UI.smithTalisman = !UI.smithTalisman && talismanCount() > 0; break;
    case 'buy': {
      const D = R.POTIONS[b.dataset.p], n = +b.dataset.n;
      if (ch.gold < D.price * n) { log('Ouro insuficiente.', 'warn'); break; }
      if (!addToBag({ kind: 'potion', id: b.dataset.p, qty: n, uid: 'p' + b.dataset.p })) break;
      ch.gold -= D.price * n; Sfx.coin();
      log('Comprou ' + D.name + ' ×' + n + ' por ' + fmt(D.price * n) + ' de Ouro.', 'loot');
      break;
    }
    case 'sellf': UI.merchFilter = b.dataset.k; UI.merchConfirm = null; break;
    case 'sell': sellFromBag(ch, +b.dataset.i, +b.dataset.n, b.dataset.ok === '1'); break;
    case 'sellno': UI.merchConfirm = null; break;
    case 'selljunk': {
      const junk = ch.bag.filter(junkSellable);
      if (!junk.length) break;
      if (!confirmed) { UI.npcConfirm = a; break; }
      let total = 0;
      junk.forEach((x) => { total += Math.floor(R.itemValue(x) * 0.5); ch.bag.splice(ch.bag.indexOf(x), 1); });
      ch.gold += total;
      if (UI.sel && UI.sel.where === 'bag' && UI.sel.it && !ch.bag.includes(UI.sel.it)) UI.sel = null;
      log('Vendeu ' + junk.length + ' Comuns/Mágicos por ' + fmt(total) + ' de Ouro.', 'loot');
      Sfx.coin();
      break;
    }
    case 'evolve': {
      const ev = R.canEvolve(ch);
      if (!ev.ok) break;
      ch.tier++;
      recalc(); buildPlayerModel(); unlockSkills(); buildSlots();
      toast(R.className(ch), 'Evolução de classe');
      log('Você evoluiu para ' + R.className(ch) + '!', 'sys');
      emit(G.player.x, 0.2, G.player.z, { n: 120, color: 0xffd76a, speed: 4, up: 4, life: 1.5, size: 1.3, grav: 2, spread: 2 });
      break;
    }
    case 'reset': {
      if (!R.canReset(ch).ok) break;
      if (!confirmed) { UI.npcConfirm = a; break; }
      const r = R.applyReset(ch);
      if (!r.ok) break;
      for (const s of R.SLOTS) if (ch.equip[s]) { /* itens ficam equipados, inativos até cumprir requisito */ }
      recalc();
      G.hp = G.st.maxHp; G.mp = G.st.maxMp;
      buildSlots();
      toast('Reset ' + ch.resets, fmt(ch.points) + ' pontos livres');
      log('Reset ' + ch.resets + ' concluído. Distribua ' + fmt(ch.points) + ' pontos (C).', 'sys');
      break;
    }
    case 'treereset': {
      if (!R.treeSpent(ch)) break;
      if (ch.gold < 100000) { log('Ouro insuficiente.', 'warn'); break; }
      if (!confirmed) { UI.npcConfirm = a; break; }
      ch.gold -= 100000; ch.tree = {}; recalc();
      log('Árvore de maestria redistribuída: ' + R.treePoints(ch) + ' pontos livres.', 'sys');
      break;
    }
  }
  persist();
  const dlg = $('#dialog'), list = dlg.querySelector('.selllist'), sl = dlg.querySelector('.smithlist');
  const top = dlg.scrollTop, listTop = list ? list.scrollTop : 0, smithTop = sl ? sl.scrollTop : 0;
  openNpc(G.openNpcId);
  dlg.scrollTop = top;
  const list2 = dlg.querySelector('.selllist');
  if (list2) list2.scrollTop = listTop;
  const sl2 = dlg.querySelector('.smithlist');
  if (sl2) sl2.scrollTop = smithTop;
  hudTick();
}
export function showDeath(loss, zl, rez) {
  modal('<div class="deathscreen"><h2>Você caiu</h2><p style="text-align:center">Perdeu ' + fmt(loss) + ' de EXP e ' + fmt(zl) + ' de Ouro. Itens equipados nunca são perdidos para monstros.</p>' +
    (rez ? '<p class="note" style="text-align:center">A Poção da Ressurreição (' + rez + ') te levanta aqui mesmo, com HP cheio, e devolve a EXP e o Ouro perdidos.</p>' : '') +
    '<div class="row" style="justify-content:center;margin-top:12px">' + (rez ? '<button class="btn gold" id="btnRevive">Usar Poção da Ressurreição</button>' : '') + '<button class="btn' + (rez ? '' : ' gold') + '" id="btnRespawn">Renascer em Aldrena</button></div></div>');
  $('#btnRespawn').addEventListener('click', () => { closeModal(); respawn(); });
  if (rez) $('#btnRevive').addEventListener('click', () => { if (revive()) { closeModal(); hudTick(); } });
}

/** Pergunta antes de descer quando ainda há itens no chão (Não = continua no andar). */
export function confirmDescend(onYes) {
  const n = G.loot.length;
  modal('<h3>Próximo andar</h3><p>Ainda há ' + n + (n === 1 ? ' item' : ' itens') + ' no chão. Deseja ir para o próximo andar?</p><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" id="btnDescendNo">Não</button><button class="btn gold" id="btnDescendYes">Sim</button></div>');
  $('#btnDescendNo').addEventListener('click', closeModal);
  $('#btnDescendYes').addEventListener('click', () => { closeModal(); onYes(); });
}

/** Botões dos diálogos de NPC e clique fora do modal. */
export function initDialogs() {
  $('#dialog').addEventListener('click', npcAction);
  $('#modal').addEventListener('pointerdown', (e) => { if (e.target.id === 'modal' && G.player && G.player.alive) closeModal(); });
}
