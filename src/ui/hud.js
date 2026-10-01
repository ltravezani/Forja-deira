// ---------- barra de habilidades e HUD (orbes, EXP, chefe, buffs) ----------
import { G } from '../core/state.js';
import { $, esc, fmt, R } from '../core/util.js';
import { Sfx } from '../engine/audio.js';
import { potionCount, usePotion } from '../game/inventory.js';
import { cdLeft, requestCast } from '../game/skills.js';
import { updateLowHp } from './feedback.js';
import { iconURI, skillIconURI } from './icons.js';

const slotRefs = [];
/** Recria a barra de habilidades (troca de habilidades, evolução, novo personagem). */
export function buildSlots() {
  const box = $('#slots');
  box.innerHTML = '';
  slotRefs.length = 0;
  const ch = G.ch;
  for (let i = 0; i < 6; i++) {
    const id = ch.skillBar[i];
    const sk = id && R.SKILLS[id];
    const el = document.createElement('button');
    el.className = 'slot' + (i === G.selectedSlot ? ' sel' : '');
    el.dataset.slot = i;
    if (sk) { el.classList.add('has'); el.style.backgroundImage = 'url("' + skillIconURI(id) + '")'; }
    el.innerHTML = '<kbd>' + (i + 1) + '</kbd>' + (sk ? '<span class="sn">' + esc(sk.name) + '</span>' : '<span style="color:#5a506a">—</span>') + '<i class="cd"></i>';
    el.title = sk ? sk.name + ' · MP ' + sk.mp + ' · AG ' + sk.ag + (i === G.selectedSlot ? ' · botão direito' : '') : 'Vazio';
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      Sfx.init();
      if (e.pointerType === 'touch' || e.pointerType === 'pen') requestCast(i);
      else { G.selectedSlot = i; buildSlots(); }
    });
    box.appendChild(el);
    slotRefs.push({ i, el, cd: el.querySelector('.cd'), h: null, no: null });
  }
  for (const id of ['hp', 'mp']) {
    const el = document.createElement('button');
    el.className = 'slot pot-' + id;
    el.style.backgroundImage = 'url("' + iconURI('potion', id === 'hp' ? '#e8483a' : '#3a78e8') + '"), radial-gradient(circle at 50% 45%, ' + (id === 'hp' ? '#4a1414' : '#14204a') + ', #0c0910 80%)';
    el.classList.add('has', 'pot');
    el.innerHTML = '<kbd>' + (id === 'hp' ? 'Q' : 'E') + '</kbd><span class="sn">' + (id === 'hp' ? 'Vida' : 'Mana') + '</span><span class="q num" data-pot="' + id + '"></span>';
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); usePotion(id); });
    box.appendChild(el);
    slotRefs.push({ pot: id, el, q: el.querySelector('.q'), qty: null });
  }
}

// ---------- HUD ----------
// Referências de DOM em cache e escrita só quando o valor exibido muda (o HUD
// roda 10×/s; a maioria dos campos fica igual entre atualizações).
const H = {};
const last = new Map();
function ref(id) { return H[id] || (H[id] = $('#' + id)); }
function setText(id, v) { if (last.get(id) !== v) { last.set(id, v); ref(id).textContent = v; } }
function setHtml(id, v) { if (last.get(id) !== v) { last.set(id, v); ref(id).innerHTML = v; } }
function setStyle(id, prop, v) { const k = id + '.' + prop; if (last.get(k) !== v) { last.set(k, v); ref(id).style[prop] = v; } }
function setVar(id, name, v) { const k = id + '--' + name; if (last.get(k) !== v) { last.set(k, v); ref(id).style.setProperty(name, v); } }
/** Força a próxima atualização a reescrever tudo (troca de personagem). */
export function resetHudCache() { last.clear(); }

/** Tempo de buff: "42s" ou "9:58" (poções de reforço duram 10 minutos). */
const buffLeft = (s) => (s >= 60 ? Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') : Math.ceil(s) + 's');
export function hudTick() {
  const ch = G.ch, st = G.st;
  if (!ch || !st) return;
  const hpFrac = Math.max(0, G.hp / st.maxHp);
  setVar('orbHp', '--fill', hpFrac.toFixed(3));
  setVar('orbMp', '--fill', Math.max(0, G.mp / st.maxMp).toFixed(3));
  setText('hpTxt', fmt(Math.max(0, G.hp)));
  setText('mpTxt', fmt(G.mp));
  setStyle('agFill', 'width', ((G.ag / st.maxAg) * 100).toFixed(1) + '%');
  setText('agTxt', 'AG ' + fmt(G.ag) + ' / ' + fmt(st.maxAg));
  const pct = ch.level >= R.RATES.maxLevel ? 100 : (ch.exp / R.expToNext(ch.level)) * 100;
  setStyle('expFill', 'width', pct.toFixed(2) + '%');
  setText('expTxt', 'EXP ' + pct.toFixed(2) + '%' + (ch.points ? ' · ' + ch.points + ' pontos livres' : ''));
  setHtml('lvlTxt', '<b>' + esc(ch.name) + '</b> · ' + esc(R.className(ch)) + ' · Nv <b>' + ch.level + '</b>' + (ch.resets ? ' · Reset <b>' + ch.resets + '</b>' : '') + ' · CP <b class="cpv">' + fmt(G.cp || 0) + '</b>');
  setText('goldTxt', fmt(ch.gold));
  const ig = document.getElementById('invGold'), gt = fmt(ch.gold);
  if (ig && ig.textContent !== gt) ig.textContent = gt;
  setText('mfTxt', st.mf + '%');
  updateSlotStates(ch, st);
  updateBossBar();
  setHtml('buffs', G.buffs.map((x) => '<span class="buff' + (x.potion ? ' pot' : '') + '">' + esc(x.name) + ' ' + buffLeft(x.until - G.time) + '</span>').join('') +
    (G.pet && G.pet.away > G.time ? '<span class="buff">Pet vendendo ' + Math.ceil(G.pet.away - G.time) + 's</span>' : ''));
  updateLowHp(hpFrac, G.player.alive);
}
function updateSlotStates(ch, st) {
  for (const s of slotRefs) {
    if (s.pot) { const n = String(potionCount(s.pot)); if (s.qty !== n) { s.qty = n; s.q.textContent = n; } continue; }
    const id = ch.skillBar[s.i];
    if (!id) continue;
    const sk = R.SKILLS[id];
    const left = cdLeft(id);
    const h = left > 0 ? Math.min(100, (left / (sk.cd * (1 + st.cdPct / 100))) * 100).toFixed(1) + '%' : '0';
    if (s.h !== h) { s.h = h; s.cd.style.height = h; }
    const c = R.skillCost(st, sk);
    const no = G.mp < c.mp || G.ag < c.ag;
    if (s.no !== no) { s.no = no; s.el.classList.toggle('nomana', no); }
  }
}
function updateBossBar() {
  const b = G.boss;
  const show = !!(b && !b.dead && b.aggro);
  if (last.get('boss') !== show) { last.set('boss', show); ref('bossbar').hidden = !show; }
  if (!show) return;
  setText('bossName', b.name + ' · nv ' + b.level);
  setStyle('bossFill', 'width', ((b.hp / b.maxHp) * 100).toFixed(1) + '%');
}
