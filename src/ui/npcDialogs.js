// ---------- diálogos dos NPCs (portais, ferreiro, mercadora, mestre) e tela de queda ----------
import { G, persist, UI } from '../core/state.js';
import { $, esc, fmt, R } from '../core/util.js';
import { Sfx } from '../engine/audio.js';
import { emit } from '../engine/effects.js';
import { respawn, revive, unlockSkills } from '../game/combat.js';
import { NPCS } from '../game/data.js';
import { addToBag, potionCount } from '../game/inventory.js';
import { buildPlayerModel, recalc } from '../game/player.js';
import { enterDungeon } from '../game/zones.js';
import { buildSlots, hudTick } from './hud.js';
import { log, toast } from './log.js';
import { BIOMES, DUNGEON_ORDER, floorLevel } from '../world/biomes.js';

function modal(html) { $('#dialog').innerHTML = html; $('#modal').hidden = false; }
export function closeModal() { $('#modal').hidden = true; }
function npcHead(id) { const D = NPCS[id]; return '<h3>' + esc(D.name) + '</h3><div class="role">' + esc(D.role) + '</div><p class="say">“' + esc(D.say) + '”</p>'; }
export function openNpc(id) {
  G.openNpcId = id;
  const ch = G.ch;
  let h = npcHead(id);
  if (id === 'portal') {
    h += '<div class="dungeons">';
    DUNGEON_ORDER.forEach((k) => {
      const B = BIOMES[k];
      const maxF = ch.unlockedFloors[k] || 1;
      const lv = floorLevel(k, maxF);
      h += '<div class="dg"><div><b>' + esc(B.name) + '</b><div class="s">Monstros nv ' + B.base + '+ · mais fundo liberado: andar ' + maxF + ' (nv ' + lv + ')</div></div><div class="row">' +
        '<button class="btn sm" data-npc="go" data-b="' + k + '" data-f="1">Andar 1</button>' + (maxF > 1 ? '<button class="btn sm gold" data-npc="go" data-b="' + k + '" data-f="' + maxF + '">Andar ' + maxF + '</button>' : '') + '</div></div>';
    });
    h += '</div><p class="note" style="margin-top:10px">Nível recomendado ≈ nível dos monstros. Cada andar soma +8 níveis.</p>';
  } else if (id === 'smith') {
    const items = R.SLOTS.map((s) => ch.equip[s]).filter(Boolean).concat(ch.bag.filter((x) => x.slot));
    const sel = items.find((x) => x === UI.smithSel) || items[0];
    UI.smithSel = sel;
    const cnt = (j) => { const x = ch.bag.find((b) => b.kind === 'jewel' && b.id === j); return x ? x.qty : 0; };
    h += '<div class="row">' + items.slice(0, 24).map((x, i) => '<button class="btn sm' + (x === sel ? ' gold' : '') + '" data-npc="smithsel" data-i="' + i + '" style="color:' + R.RARITY[x.rarity].color + '">' + esc(R.itemName(x)) + '</button>').join('') + '</div>';
    if (sel) {
      h += '<h4 style="margin:14px 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)">Aprimorar ' + esc(R.itemName(sel)) + '</h4><div class="list">';
      ['bless', 'soul', 'chaos', 'life'].forEach((j) => {
        const c = R.upgradeChance(sel, j);
        const fee = j === 'chaos' ? ' + ' + fmt(R.RATES.chaosFeeGold) + ' Gold' : '';
        h += '<div class="li"><span style="color:' + R.JEWELS[j].color + '">' + R.JEWELS[j].name + ' ×' + cnt(j) + '</span><span class="a"><button class="btn sm" data-npc="up" data-j="' + j + '"' + (c > 0 && cnt(j) ? '' : ' disabled') + '>' + (c > 0 ? Math.round(c * 100) + '%' + fee : '—') + '</button></span><span class="s">' + esc(R.JEWELS[j].desc) + '</span></div>';
      });
      h += '</div>';
    } else h += '<p class="note">Você não tem equipamentos.</p>';
  } else if (id === 'merchant') {
    const junk = ch.bag.filter((x) => x.slot && R.RARITY[x.rarity].order <= 1);
    const junkVal = junk.reduce((a, x) => a + Math.floor(R.itemValue(x) * 0.5), 0);
    h += '<div class="list">';
    ['hp', 'mp'].forEach((p) => { const D = R.POTIONS[p]; h += '<div class="li"><span>' + D.name + '</span><span class="a row"><button class="btn sm" data-npc="buy" data-p="' + p + '" data-n="10">×10 · ' + fmt(D.price * 10) + '</button><button class="btn sm" data-npc="buy" data-p="' + p + '" data-n="50">×50 · ' + fmt(D.price * 50) + '</button></span><span class="s">Você tem ' + potionCount(p) + '</span></div>'; });
    const RZ = R.POTIONS.rez;
    h += '<div class="li"><span style="color:#ffd24a">' + RZ.name + '</span><span class="a row"><button class="btn sm gold" data-npc="buy" data-p="rez" data-n="1"' + (ch.gold >= RZ.price ? '' : ' disabled') + '>×1 · ' + fmt(RZ.price) + '</button></span><span class="s">Renasce onde caiu, no mesmo andar, sem perder EXP nem Gold · você tem ' + potionCount('rez') + '</span></div>';
    h += '</div><div class="row" style="margin-top:12px"><button class="btn gold" data-npc="selljunk"' + (junk.length ? '' : ' disabled') + '>Vender ' + junk.length + ' Comuns/Mágicos · ' + fmt(junkVal) + ' Gold</button></div>';
  } else if (id === 'master') {
    const ev = R.canEvolve(ch), rs = R.canReset(ch);
    h += '<h4 style="margin:6px 0;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)">Evolução</h4>';
    h += ev.next ? '<p>' + esc(R.className(ch)) + ' → <b style="color:var(--gold)">' + esc(ev.name) + '</b>: +' + ev.next.dmgPct + '% dano, +' + ev.next.hpPct + '% HP, nova habilidade e visual.</p><p class="note">' + (ev.ok ? 'Todos os requisitos cumpridos.' : 'Falta: ' + esc(ev.reasons.join(', '))) + '</p><button class="btn gold" data-npc="evolve"' + (ev.ok ? '' : ' disabled') + '>Evoluir</button>' : '<p class="note">Você já alcançou a forma final.</p>';
    h += '<h4 style="margin:16px 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)">Reset (' + ch.resets + ')</h4><p class="note">Nível 400+ e ' + fmt(rs.cost) + ' Gold. Volta ao nível 1 com ' + fmt((ch.resets + 1) * R.RATES.resetPoints + Math.max(0, ch.level - 400) * R.RATES.resetBonusPerLevel) + ' pontos livres, +2% MF permanente e +10 pontos de árvore.</p>' +
      (rs.ok ? '<button class="btn gold" data-npc="reset">Fazer reset</button>' : '<p class="note">Falta: ' + esc(rs.reasons.join(', ')) + '</p>');
    const spent = R.treeSpent(ch);
    h += '<h4 style="margin:16px 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)">Árvore de maestria</h4><button class="btn sm" data-npc="treereset"' + (spent && ch.gold >= 100000 ? '' : ' disabled') + '>Redistribuir ' + spent + ' pontos · 100.000 Gold</button>';
  }
  h += '<div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn" data-npc="close">Fechar</button></div>';
  modal(h);
}
function npcAction(e) {
  const b = e.target.closest('[data-npc]');
  if (!b || b.disabled) return;
  const a = b.dataset.npc, ch = G.ch;
  switch (a) {
    case 'close': closeModal(); return;
    case 'go': closeModal(); enterDungeon(b.dataset.b, +b.dataset.f); return;
    case 'smithsel': { const items = R.SLOTS.map((s) => ch.equip[s]).filter(Boolean).concat(ch.bag.filter((x) => x.slot)); UI.smithSel = items[+b.dataset.i]; break; }
    case 'up': {
      const it = UI.smithSel, j = b.dataset.j;
      const stack = ch.bag.find((x) => x.kind === 'jewel' && x.id === j);
      if (!it || !stack) break;
      if (j === 'chaos') { if (ch.gold < R.RATES.chaosFeeGold) { log('Fusão Chaos exige ' + fmt(R.RATES.chaosFeeGold) + ' Gold.', 'warn'); break; } ch.gold -= R.RATES.chaosFeeGold; }
      stack.qty--; if (!stack.qty) ch.bag.splice(ch.bag.indexOf(stack), 1);
      const r = R.applyUpgrade(it, j, Math.random());
      if (r.ok) { log('Sucesso! ' + R.itemName(it), 'loot'); Sfx.level(); toast('Sucesso', R.itemName(it)); }
      else { log('Falhou (' + Math.round(r.chance * 100) + '%). ' + R.itemName(it), 'warn'); Sfx.hurt(); }
      recalc(); buildPlayerModel();
      break;
    }
    case 'buy': { const D = R.POTIONS[b.dataset.p], n = +b.dataset.n; if (ch.gold < D.price * n) { log('Gold insuficiente.', 'warn'); break; } if (!addToBag({ kind: 'potion', id: b.dataset.p, qty: n, uid: 'p' + b.dataset.p })) break; ch.gold -= D.price * n; Sfx.coin(); break; }
    case 'selljunk': { const junk = ch.bag.filter((x) => x.slot && R.RARITY[x.rarity].order <= 1); junk.forEach((x) => { ch.gold += Math.floor(R.itemValue(x) * 0.5); ch.bag.splice(ch.bag.indexOf(x), 1); }); Sfx.coin(); break; }
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
    case 'treereset': if (ch.gold < 100000) { log('Gold insuficiente.', 'warn'); break; } ch.gold -= 100000; ch.tree = {}; recalc(); break;
  }
  persist();
  openNpc(G.openNpcId);
  hudTick();
}
export function showDeath(loss, zl, rez) {
  modal('<div class="deathscreen"><h2>Você caiu</h2><p style="text-align:center">Perdeu ' + fmt(loss) + ' de EXP e ' + fmt(zl) + ' Gold. Itens equipados nunca são perdidos para monstros.</p>' +
    (rez ? '<p class="note" style="text-align:center">A Poção da Ressurreição (' + rez + ') te levanta aqui mesmo, com HP cheio, e devolve a EXP e o Gold perdidos.</p>' : '') +
    '<div class="row" style="justify-content:center;margin-top:12px">' + (rez ? '<button class="btn gold" id="btnRevive">Usar Poção da Ressurreição</button>' : '') + '<button class="btn' + (rez ? '' : ' gold') + '" id="btnRespawn">Renascer em Aldrena</button></div></div>');
  $('#btnRespawn').addEventListener('click', () => { closeModal(); respawn(); });
  if (rez) $('#btnRevive').addEventListener('click', () => { if (revive()) { closeModal(); hudTick(); } });
}

/** Botões dos diálogos de NPC e clique fora do modal. */
export function initDialogs() {
  $('#dialog').addEventListener('click', npcAction);
  $('#modal').addEventListener('pointerdown', (e) => { if (e.target.id === 'modal' && G.player && G.player.alive) closeModal(); });
}
