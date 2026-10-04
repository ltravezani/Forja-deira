// ---------- missões: eventos do jogo → progresso, recompensas e avisos ----------
// As regras ficam em questLogic.js (puras, testadas no Node); aqui só o efeito no
// jogo: entregar Ouro, poções e joias, avisar e marcar a interface para redesenhar.
import { G, persist } from '../core/state.js';
import { fmt, R } from '../core/util.js';
import { Sfx } from '../engine/audio.js';
import { floatText } from '../engine/overlay.js';
import { addToBag } from './inventory.js';
import { inSafe } from './zones.js';
import { log, toast } from '../ui/log.js';
import { applyQuestEvent, claimDaily, dailyText, localDay } from './questLogic.js';

/** Texto curto de uma recompensa ("1.500 Ouro · 5 Poção de Vida"). */
export function rewardText(r) {
  const parts = [];
  if (r.gold) parts.push(fmt(r.gold) + ' Ouro');
  if (r.hp) parts.push(r.hp + '× ' + R.POTIONS.hp.name);
  if (r.mp) parts.push(r.mp + '× ' + R.POTIONS.mp.name);
  if (r.jewel) parts.push(R.JEWELS[r.jewel].name);
  return parts.join(' · ');
}
/** Entrega a recompensa. Poção ou joia que não cabe na mochila vira Ouro (preço de compra). */
function grant(r) {
  const ch = G.ch;
  let gold = r.gold || 0;
  for (const id of ['hp', 'mp']) {
    if (!r[id]) continue;
    if (!addToBag({ kind: 'potion', id, qty: r[id], uid: 'p' + id })) gold += R.POTIONS[id].price * r[id];
  }
  if (r.jewel && !addToBag({ kind: 'jewel', id: r.jewel, qty: 1, uid: 'j' + r.jewel })) gold += R.itemValue({ kind: 'jewel', id: r.jewel, qty: 1 }) * 2;
  ch.gold += gold;
  Sfx.coin();
  if (G.player) floatText(G.player.x, 3.1, G.player.z, '+' + fmt(gold) + ' Ouro', 'heal');
}

function announce(ev) {
  for (const e of ev) {
    if (e.t === 'ob') {
      grant(e.reward);
      toast(e.last ? 'Missões iniciais concluídas' : 'Missão concluída', e.step.text() + ' · ' + rewardText(e.reward));
      log('Missão concluída: ' + e.step.text() + '. Recompensa: ' + rewardText(e.reward) + '.', 'loot');
      if (e.last) log('As missões diárias ficam no Quadro de Missões, na praça de Aldrena.', 'sys');
      Sfx.level();
    } else {
      log('Missão diária concluída: ' + dailyText(e.q) + '. Resgate a recompensa no Quadro de Missões, em Aldrena.', 'loot');
      toast('Missão diária concluída', dailyText(e.q));
      Sfx.level();
    }
  }
  if (ev.length) persist();
}

/**
 * Evento do jogo para as missões (ver applyQuestEvent em questLogic.js).
 * Protegido: um erro aqui nunca interrompe o combate ou a coleta.
 */
export function questEvent(type, info) {
  const ch = G.ch;
  if (!ch || G.mode !== 'play') return;
  try {
    announce(applyQuestEvent(ch, type, info, localDay()));
  } catch (err) { console.error('[Forja-deira] missões:', err); }
}
/** Abate de monstro (chamado por killMonster). */
export function questKill(m) {
  questEvent('kill', { zone: G.zone, biome: G.biome, elite: !!m.elite, boss: !!m.boss });
}
/** Conferência periódica (atributos, equipamento e troca de dia). */
export function questPoll() {
  if (!G.ch || !G.ch.quests) return;
  questEvent('poll'); // também sorteia as diárias quando o dia vira
}
/** Resgata a diária `i` (só na cidade). Devolve true se entregou a recompensa. */
export function claimQuest(i) {
  const ch = G.ch;
  if (!ch || !inSafe()) { log('Resgate as recompensas no Quadro de Missões, em Aldrena.', 'warn'); return false; }
  const r = claimDaily(ch, i);
  if (!r) return false;
  grant(r);
  log('Recompensa resgatada: ' + rewardText(r) + '.', 'loot');
  if (r.bonus) toast('Diárias completas', 'Bônus do dia: ' + rewardText({ jewel: r.jewel }));
  persist();
  return true;
}
