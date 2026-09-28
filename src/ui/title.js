// ---------- tela de título ----------
// Prévia 3D do personagem no centro da tela de título.
import { disposeModel } from '../art/models.js';
import { G, persist, S, UI } from '../core/state.js';
import { $, esc, fmt, R, TILE } from '../core/util.js';
import { world } from '../engine/renderer.js';
import { cpOf } from '../game/inventory.js';
import { buildCharacterModel } from '../game/player.js';
import { startGame } from '../game/session.js';

export const TP = { model: null, x: 0, z: 0, rot: 0, key: '' };
/** Mostra (ou troca) o personagem em 3D no centro da tela; null remove a prévia. */
export function titlePreview(ch) {
  const key = ch ? ch.name + '|' + ch.cls + '|' + ch.tier + '|' + JSON.stringify(Object.keys(ch.equip).map((k) => ch.equip[k] && ch.equip[k].uid)) : '';
  if (key === TP.key) return;
  TP.key = key;
  if (TP.model) { world.remove(TP.model.root); disposeModel(TP.model); TP.model = null; }
  if (!ch || !G.L) return;
  TP.x = G.L.start.x * TILE; TP.z = G.L.start.z * TILE;
  TP.model = buildCharacterModel(ch);
  TP.model.root.position.set(TP.x, 0, TP.z);
  world.add(TP.model.root);
}
function previewChar(cls) {
  const ch = R.newCharacter('Prévia', cls);
  const w = R.makeEquip(R.hash32('preview', cls), 0, 'comum', cls, 0, 'normal');
  w.slot = 'weapon'; w.cls = cls; w.tier = 0; ch.equip.weapon = w;
  return ch;
}
export function renderTitle() {
  const n = S.chars.length;
  if (!n) UI.titleMode = 'create';
  if (UI.titleIdx == null) UI.titleIdx = S.active >= 0 && S.active < n ? S.active : 0;
  UI.titleIdx = n ? ((UI.titleIdx % n) + n) % n : 0;
  const creating = UI.titleMode === 'create';
  $('#tSel').hidden = creating;
  $('#tCreate').hidden = !creating;
  $('#tBack').hidden = !n;
  $('#tCrTitle').textContent = n ? 'Novo personagem' : 'Crie seu primeiro personagem';
  $('#tPrev').hidden = $('#tNext').hidden = n < 2;
  if (creating) {
    $('#roster').innerHTML = R.ROSTER.filter((c) => R.CLASSES[c.id]).map((c) => {
      const C = R.CLASSES[c.id];
      return '<button class="cls' + (c.id === UI.pickedClass ? ' on' : '') + '" data-cls="' + c.id + '"><b style="color:' + C.color + '">' + esc(c.name) + '</b><span>' + esc(C.role) + '</span></button>';
    }).join('');
    const C = R.CLASSES[UI.pickedClass];
    $('#evoLine').innerHTML = '<b>' + C.tiers.join('</b> → <b>') + '</b> · evolui no nível 150 e no 400. ' + esc(C.blurb);
    titlePreview(previewChar(UI.pickedClass));
    return;
  }
  const ch = S.chars[UI.titleIdx];
  const conf = UI.confirmDel === UI.titleIdx;
  $('#tCard').innerHTML = '<div class="t-name">' + esc(ch.name) + '</div>' +
    '<div class="t-cls"><b style="color:' + R.CLASSES[ch.cls].color + '">' + esc(R.className(ch)) + '</b> · Nível <b>' + ch.level + '</b>' + (ch.resets ? ' · ' + ch.resets + ' reset' + (ch.resets > 1 ? 's' : '') : '') + ' · ' + fmt(ch.gold) + ' Gold</div>' +
    '<div class="t-cp">CP ' + fmt(cpOf(ch)) + '</div>' +
    '<button class="btn gold t-play" data-t="play">Entrar no jogo</button>' +
    (n > 1 ? '<div class="t-dots">' + S.chars.map((_, i) => '<i class="' + (i === UI.titleIdx ? 'on' : '') + '"></i>').join('') + '</div>' : '') +
    '<div class="t-sec"><button class="t-link" data-t="new"' + (n >= 5 ? ' disabled title="Limite de 5 personagens"' : '') + '>+ Criar novo personagem</button><button class="t-link danger" data-t="del">' + (conf ? 'Confirmar exclusão' : 'Excluir') + '</button></div>';
  titlePreview(ch);
}
function titleStep(d) { UI.titleIdx += d; UI.confirmDel = -1; renderTitle(); }
function createChar() {
  const name = $('#nameInput').value.trim();
  const err = $('#createErr');
  if (!/^[A-Za-zÀ-ÿ0-9_]{3,12}$/.test(name)) { err.textContent = 'Use 3 a 12 letras, números ou _.'; return; }
  if (S.chars.some((c) => c.name.toLowerCase() === name.toLowerCase())) { err.textContent = 'Já existe um personagem com esse nome.'; return; }
  if (S.chars.length >= 5) { err.textContent = 'Limite de 5 personagens neste navegador.'; return; }
  const ch = R.newCharacter(name, UI.pickedClass);
  const starter = R.makeEquip(R.hash32('starter', name), 0, 'comum', ch.cls, 0, 'normal');
  starter.slot = 'weapon'; starter.tier = 0; starter.plus = 0; starter.cls = ch.cls; starter.luck = false; starter.addOpt = 0; starter.exc = [];
  ch.equip.weapon = starter;
  ch.bag.push({ kind: 'potion', id: 'hp', qty: 10, uid: 'php' }, { kind: 'potion', id: 'mp', qty: 6, uid: 'pmp' });
  S.chars.push(ch);
  persist();
  startGame(S.chars.length - 1);
}

/** Tela de título: seleção, criação e teclado. */
export function initTitle() {
  $('#roster').addEventListener('click', (e) => { const b = e.target.closest('[data-cls]'); if (b && !b.disabled) { UI.pickedClass = b.dataset.cls; renderTitle(); } });
  $('#tCard').addEventListener('click', (e) => {
    const b = e.target.closest('[data-t]');
    if (!b || b.disabled) return;
    const t = b.dataset.t;
    if (t === 'play') startGame(UI.titleIdx);
    else if (t === 'new') { UI.titleMode = 'create'; UI.confirmDel = -1; renderTitle(); setTimeout(() => $('#nameInput').focus(), 0); }
    else if (t === 'del') {
      if (UI.confirmDel === UI.titleIdx) { S.chars.splice(UI.titleIdx, 1); UI.confirmDel = -1; if (S.active >= S.chars.length) S.active = S.chars.length - 1; persist(); }
      else UI.confirmDel = UI.titleIdx;
      renderTitle();
    }
  });
  $('#tPrev').addEventListener('click', () => titleStep(-1));
  $('#tNext').addEventListener('click', () => titleStep(1));
  $('#tBack').addEventListener('click', () => { UI.titleMode = 'select'; $('#createErr').textContent = ''; renderTitle(); });
  window.addEventListener('keydown', (e) => {
    if (G.mode !== 'title' || $('#title').hidden) return;
    if (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (UI.titleMode === 'create') { if (e.key === 'Escape' && S.chars.length) { UI.titleMode = 'select'; renderTitle(); } return; }
    if (e.key === 'ArrowLeft') titleStep(-1);
    else if (e.key === 'ArrowRight') titleStep(1);
    else if (e.key === 'Enter' && S.chars.length) startGame(UI.titleIdx);
  });
  $('#btnCreate').addEventListener('click', createChar);
  $('#nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') createChar(); });
}
