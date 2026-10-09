// ---------- barra de habilidades e HUD (orbes, EXP, chefe, buffs) ----------
import { G } from '../core/state.js';
import { $, dec, esc, fmt, R } from '../core/util.js';
import { Sfx } from '../engine/audio.js';
import { potionCount, usePotion } from '../game/inventory.js';
import { CONFIG } from '../core/config.js';
import { dodgeLeft, tryDodge } from '../game/dodge.js';
import { cdLeft, requestCast } from '../game/skills.js';
import { updateLowHp } from './feedback.js';
import { iconURI, skillIconURI } from './icons.js';

const slotRefs = [];
const DODGE_ICON = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><radialGradient id="g" cx="50%" cy="38%" r="70%"><stop offset="0" stop-color="#3a2e52"/><stop offset="1" stop-color="#14101c"/></radialGradient></defs>' +
  '<rect width="64" height="64" fill="url(#g)"/><g fill="none" stroke="#e8d08a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 44c9-3 15-11 22-22"/><path d="M24 20h11v11"/></g>' +
  '<g fill="none" stroke="#e8d08a" stroke-opacity=".5" stroke-width="3" stroke-linecap="round"><path d="M10 54h16"/><path d="M38 46c6 0 11-3 16-8"/></g>' +
  '<rect x="3" y="3" width="58" height="58" fill="none" stroke="#e8c878" stroke-opacity=".35" stroke-width="1"/></svg>');
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
    el.className = 'slot sk' + (i === G.selectedSlot ? ' sel' : '');
    el.dataset.slot = i;
    if (sk) { el.classList.add('has'); el.style.backgroundImage = 'url("' + skillIconURI(id) + '")'; }
    el.innerHTML = '<kbd>' + (i + 1) + '</kbd>' + (sk ? '<span class="sn">' + esc(sk.name) + '</span>' : '<span style="color:#5a506a">—</span>') + '<i class="cd"></i>';
    el.title = sk ? sk.name + ' · MP ' + sk.mp + ' · AG ' + sk.ag + (i === G.selectedSlot ? ' · botão direito' : '') : 'Vazio';
    el.setAttribute('aria-label', sk ? sk.name : 'Habilidade ' + (i + 1) + ': vazio');
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      Sfx.init();
      if (e.pointerType === 'touch' || e.pointerType === 'pen') requestCast(i);
      else { G.selectedSlot = i; buildSlots(); }
    });
    box.appendChild(el);
    slotRefs.push({ i, el, cd: el.querySelector('.cd'), h: null, no: null });
  }
  // esquiva: casa fixa entre as habilidades e as poções (Shift no PC, toque no celular)
  {
    const el = document.createElement('button');
    el.className = 'slot dodge has';
    el.style.backgroundImage = 'url("' + DODGE_ICON + '")';
    el.title = 'Esquiva · Shift · passo rápido sem receber dano';
    el.setAttribute('aria-label', 'Esquiva');
    el.innerHTML = '<kbd>Shift</kbd><span class="sn">Esquiva</span><i class="cd"></i>';
    el.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); e.preventDefault();
      Sfx.init();
      tryDodge(false);
    });
    box.appendChild(el);
    slotRefs.push({ dodge: true, el, cd: el.querySelector('.cd'), h: null });
  }
  for (const id of ['hp', 'mp']) {
    const el = document.createElement('button');
    el.className = 'slot pot-' + id;
    el.setAttribute('aria-label', id === 'hp' ? 'Poção de Vida' : 'Poção de Mana');
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
const SHRINE_ICON = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><radialGradient id="g" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#4a3a18"/><stop offset="1" stop-color="#140e06"/></radialGradient></defs>' +
  '<rect width="64" height="64" fill="url(#g)"/><path d="M32 8l6 16 17 1-13 11 5 17-15-10-15 10 5-17L9 25l17-1z" fill="#f2cf7a" stroke="#6a4a14" stroke-width="2" stroke-linejoin="round"/></svg>');
const PET_ICON = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="#e8d08a"><ellipse cx="12" cy="15.5" rx="4.2" ry="3.6"/><circle cx="6.5" cy="10" r="1.9"/><circle cx="9.8" cy="6.8" r="1.9"/><circle cx="14.2" cy="6.8" r="1.9"/><circle cx="17.5" cy="10" r="1.9"/></g></svg>');
/** Ícone do buff: habilidade, poção de reforço, santuário (Éden/Torre) ou pet. */
function buffIcon(b) {
  if (b.id === 'pet') return ['pet', PET_ICON];
  if (R.SKILLS[b.id]) return ['', skillIconURI(b.id)];
  const pot = b.id && b.id.indexOf('pot:') === 0 && R.POTIONS[b.id.slice(4)];
  if (pot) return ['pot', iconURI('potion', pot.color)];
  return ['shrine', SHRINE_ICON];
}
function buffHtml(b, left) {
  const [cls, uri] = buffIcon(b), t = buffLeft(left);
  return '<span class="buff ' + cls + (left < 10 ? ' end' : '') + '" style="background-image:url(&quot;' + uri + '&quot;)" title="' + esc(b.name) + '" role="img" aria-label="' + esc(b.name) + ' ' + t + '"><b>' + t + '</b></span>';
}
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
  setText('expTxt', 'EXP ' + dec(pct, 2) + '%' + (ch.points ? ' · ' + fmt(ch.points) + ' pontos livres' : ''));
  // nome e classe somem no celular (CSS .lv-long); nível e CP ficam
  setHtml('lvlTxt', '<span class="lv-long"><b>' + esc(ch.name) + '</b> · ' + esc(R.className(ch)) + ' · </span>Nv <b>' + ch.level + '</b>' + (ch.resets ? ' · Reset <b>' + ch.resets + '</b>' : '') + ' · CP <b class="cpv">' + fmt(G.cp || 0) + '</b>');
  const ig = document.getElementById('invGold'), gt = fmt(ch.gold);
  if (ig && ig.textContent !== gt) ig.textContent = gt;
  const tb = ref('tbItems'), on = !!G.showAllLabels;
  if (tb && last.get('tbItems') !== on) { last.set('tbItems', on); tb.classList.toggle('on', on); tb.setAttribute('aria-pressed', String(on)); }
  updateSlotStates(ch, st);
  updateBossBar();
  setHtml('buffs', G.buffs.map((x) => buffHtml(x, x.until - G.time)).join('') +
    (G.pet && G.pet.away > G.time ? buffHtml({ id: 'pet', name: 'Pet vendendo' }, G.pet.away - G.time) : ''));
  updateLowHp(hpFrac, G.player.alive);
}
function updateSlotStates(ch, st) {
  for (const s of slotRefs) {
    if (s.dodge) {
      const left = dodgeLeft();
      const h = left > 0 ? Math.min(100, (left / CONFIG.dodge.cd) * 100).toFixed(1) + '%' : '0';
      if (s.h !== h) { s.h = h; s.cd.style.height = h; s.el.classList.toggle('cooling', left > 0); }
      continue;
    }
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
