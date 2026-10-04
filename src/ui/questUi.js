// ---------- interface das missões e auxílios do HUD ----------
// Rastreador de missão (canto, recolhível), Quadro de Missões (janela), alvo da
// missão no minimapa e no rótulo do NPC, selo "!" nos botões com pontos livres,
// legenda dos ícones do menu no primeiro acesso e o botão de esquiva do toque.
import { G, persist, S } from '../core/state.js';
import { $, esc, R } from '../core/util.js';
import { dodgeLeft, tryDodge } from '../game/dodge.js';
import { claimQuest, questPoll, rewardText } from '../game/quests.js';
import { currentOnboard, DAILY_BONUS, dailyText, ONBOARD } from '../game/questLogic.js';
import { inSafe } from '../game/zones.js';
import { CONFIG } from '../core/config.js';

const UIQ = { track: null, head: null, body: null, last: '', ch: null, target: null, legend: null, dodge: null, dodgeCd: '' };

// ---------- alvo da missão (minimapa e rótulo) ----------
/** Ponto do mundo que a missão atual aponta ({x, z}) ou null. Só na cidade. */
export function questTargetPos() {
  const ch = G.ch;
  if (!ch || !ch.quests || G.zone !== 'town') return null;
  const step = currentOnboard(ch);
  // missão de abate na cidade: a Guardiã dos portais é o caminho
  const npcId = step ? step.npc || (step.id === 'kill' ? 'portal' : null) : null;
  if (npcId) return G.npcs.find((n) => n.id === npcId) || null;
  if (ch.quests.daily.some((d) => d.p >= d.n && !d.c)) return G.npcs.find((n) => n.id === 'board') || null;
  return null;
}
/** Destaca o rótulo do NPC alvo com um "!". */
function markTarget() {
  const t = questTargetPos();
  if (t === UIQ.target) return;
  if (UIQ.target && UIQ.target.label) UIQ.target.label.classList.remove('qmark');
  UIQ.target = t;
  if (t && t.label) t.label.classList.add('qmark');
}

// ---------- rastreador ----------
function trackerHtml(ch) {
  const q = ch.quests, step = currentOnboard(ch);
  const fold = S.settings.questFold === true;
  const ready = q.daily.filter((d) => d.p >= d.n && !d.c).length;
  const done = q.daily.filter((d) => d.p >= d.n).length;
  let title, line = '', hint = '';
  if (step) {
    title = 'Primeiros passos ' + (q.ob + 1) + '/' + ONBOARD.length;
    line = esc(step.text()) + (step.need > 1 ? ' <b class="num">' + q.obProg + '/' + step.need + '</b>' : '');
    hint = step.id === 'stats' && !ch.points ? 'Suba de nível para ganhar pontos.' : step.hint;
  } else {
    title = 'Missões diárias ' + done + '/' + q.daily.length;
    const next = q.daily.find((d) => d.p < d.n);
    line = next ? esc(dailyText(next)) + ' <b class="num">' + next.p + '/' + next.n + '</b>' : 'Todas concluídas hoje.';
    if (!ready) hint = 'Toque para ver o Quadro de Missões.';
  }
  if (ready) hint = '<b class="qt-ready">' + ready + (ready > 1 ? ' recompensas prontas' : ' recompensa pronta') + '</b> · resgate no Quadro de Missões' + (inSafe() ? '' : ', em Aldrena');
  return { fold, ready, html: '<span class="qt-title">' + esc(title) + '</span>' + (fold ? '' : '<span class="qt-line">' + line + '</span>' + (hint ? '<span class="qt-hint">' + hint + '</span>' : '')) };
}
function renderTracker() {
  const ch = G.ch;
  if (!ch || !ch.quests || !UIQ.track) return;
  const t = trackerHtml(ch);
  const key = t.html + (t.fold ? 1 : 0) + t.ready;
  if (key === UIQ.last) return;
  UIQ.last = key;
  UIQ.body.innerHTML = t.html;
  UIQ.track.classList.toggle('fold', t.fold);
  UIQ.track.classList.toggle('ready', t.ready > 0);
  UIQ.head.setAttribute('aria-expanded', String(!t.fold));
  UIQ.head.textContent = t.fold ? '▸' : '▾';
}

// ---------- Quadro de Missões ----------
function boardHtml() {
  const ch = G.ch, q = ch.quests, town = inSafe();
  let h = '<h3>Quadro de Missões</h3><div class="role">Missões iniciais e diárias de Aldrena</div>';
  if (q.ob < ONBOARD.length) {
    h += '<h4 class="qb-h">Primeiros passos</h4><div class="list">';
    ONBOARD.forEach((s, i) => {
      const st = i < q.ob ? 'done' : i === q.ob ? 'cur' : 'next';
      const prog = st === 'cur' && s.need > 1 ? ' · ' + q.obProg + '/' + s.need : '';
      h += '<div class="li qb-' + st + '"><span>' + (st === 'done' ? '✓ ' : '') + esc(s.text()) + prog + '</span><span class="a note">' + esc(rewardText(s.reward)) + '</span>' + (st === 'cur' ? '<span class="s">' + esc(s.hint) + '</span>' : '') + '</div>';
    });
    h += '</div><p class="note">A recompensa das missões iniciais chega na hora, onde você estiver.</p>';
  }
  h += '<h4 class="qb-h">Diárias de hoje</h4><div class="list">';
  q.daily.forEach((d, i) => {
    const ok = d.p >= d.n, pct = Math.min(100, (d.p / d.n) * 100).toFixed(0);
    const btn = d.c ? '<button class="btn sm" disabled>Resgatada</button>'
      : '<button class="btn sm' + (ok && town ? ' gold' : '') + '" data-q="claim" data-i="' + i + '"' + (ok && town ? '' : ' disabled') + '>Resgatar</button>';
    h += '<div class="li qb-daily' + (d.c ? ' qb-done' : '') + '"><span>' + esc(dailyText(d)) + ' <b class="num">' + Math.min(d.p, d.n) + '/' + d.n + '</b></span><span class="a">' + btn + '</span>' +
      '<span class="s"><span class="qb-bar"><i style="width:' + pct + '%"></i></span>' + esc(rewardText(d.r)) + '</span></div>';
  });
  h += '</div>';
  h += '<p class="note">Resgate as três para ganhar também ' + esc(R.JEWELS[DAILY_BONUS.jewel].name) + ' e Ouro extra' + (q.bonus ? ' (já recebido hoje)' : '') + '. Novas missões à meia-noite (horário local).' +
    (town ? '' : ' <b>Fora da cidade dá para acompanhar, mas o resgate é no quadro, em Aldrena.</b>') + '</p>';
  h += '<div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn" data-npc="close">Fechar</button></div>';
  return h;
}
/** Abre o Quadro de Missões (no quadro da praça ou pelo rastreador). */
export function openQuestBoard() {
  if (!G.ch || !G.ch.quests) return;
  questPoll();
  G.openNpcId = 'board';
  $('#dialog').innerHTML = boardHtml();
  $('#modal').classList.remove('acct-on');
  $('#modal').hidden = false;
}
function boardAction(e) {
  const b = e.target.closest('[data-q]');
  if (!b || b.disabled) return;
  if (b.dataset.q === 'claim' && claimQuest(+b.dataset.i)) {
    const dlg = $('#dialog'), top = dlg.scrollTop;
    dlg.innerHTML = boardHtml();
    dlg.scrollTop = top;
  }
}

// ---------- selos "!" e legenda do menu ----------
function updateBadges(ch) {
  const pts = ch.points > 0, tree = R.treePoints(ch) - R.treeSpent(ch) > 0;
  for (const [sel, on, tip] of [['char', pts, 'Pontos de atributo livres'], ['skills', tree, 'Pontos de maestria livres']]) {
    for (const el of document.querySelectorAll('.menu [data-tab="' + sel + '"], #tabs [data-t="' + sel + '"]')) {
      if (el.classList.contains('alert') === on) continue;
      el.classList.toggle('alert', on);
      if (on) el.dataset.alert = tip; else delete el.dataset.alert;
    }
  }
}
/** Legenda dos ícones do menu: aparece no primeiro acesso e some com "Entendi" ou ao abrir um painel. */
function showLegend() {
  if (UIQ.legend || S.settings.menuHelpSeen) return;
  const menu = $('.menu');
  if (!menu) return;
  const box = document.createElement('div');
  box.className = 'menu-legend';
  box.setAttribute('role', 'note');
  let h = '<b>Menu</b>';
  for (const btn of menu.querySelectorAll('button')) {
    const svg = btn.querySelector('svg');
    h += '<span class="ml-row">' + (svg ? svg.outerHTML : '') + esc(btn.dataset.tip || btn.getAttribute('aria-label') || '') + '</span>';
  }
  h += '<button class="btn sm" type="button">Entendi</button>';
  box.innerHTML = h;
  box.querySelector('button').addEventListener('click', hideLegend);
  menu.parentNode.insertBefore(box, menu.nextSibling);
  UIQ.legend = box;
}
function hideLegend() {
  if (!UIQ.legend) return;
  UIQ.legend.remove();
  UIQ.legend = null;
  S.settings.menuHelpSeen = true;
  persist();
}
/** No toque não há "passar o mouse": o primeiro toque em cada ícone mostra o nome por 1,6 s. */
function touchTips() {
  for (const btn of document.querySelectorAll('.menu button[data-tip]')) {
    btn.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      btn.classList.add('tip-on');
      clearTimeout(btn._tipT);
      btn._tipT = setTimeout(() => btn.classList.remove('tip-on'), 1600);
    });
    btn.addEventListener('click', () => { if (UIQ.legend) hideLegend(); });
  }
}

// ---------- botão de esquiva (toque) ----------
function buildDodgeButton(hud) {
  const b = document.createElement('button');
  b.id = 'btnDodge';
  b.className = 'dodge-btn';
  b.type = 'button';
  b.setAttribute('aria-label', 'Esquiva');
  b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16c3-1 5-4 8-8"/><path d="M9 7h4v4"/><path d="M4 20h6" opacity=".6"/><path d="M14 17c2 0 4-1 6-3" opacity=".6"/></g></svg><span>Esquiva</span><i class="dodge-cd"></i>';
  b.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); tryDodge(false); });
  hud.appendChild(b);
  UIQ.dodge = b;
}
function updateDodgeButton() {
  if (!UIQ.dodge) return;
  const left = dodgeLeft();
  const v = left > 0 ? (left / CONFIG.dodge.cd).toFixed(2) : '0';
  if (v === UIQ.dodgeCd) return;
  UIQ.dodgeCd = v;
  UIQ.dodge.style.setProperty('--cd', v);
  UIQ.dodge.classList.toggle('cooling', left > 0);
}

/** Atualização no ritmo do HUD (10×/s): progresso das missões, rastreador, selos e alvo. */
export function questUiTick() {
  const ch = G.ch;
  if (!ch) return;
  if (UIQ.ch !== ch) { UIQ.ch = ch; UIQ.last = ''; UIQ.target = null; }
  questPoll();
  renderTracker();
  markTarget();
  updateBadges(ch);
  updateDodgeButton();
  if (!S.settings.menuHelpSeen && !UIQ.legend) showLegend();
}

/** Cria o rastreador e o botão de esquiva dentro do HUD e liga os cliques do quadro. */
export function initQuestUi() {
  const hud = $('#hud'), col = $('.topright');
  const box = document.createElement('div');
  box.className = 'qtrack';
  box.id = 'qtrack';
  box.innerHTML = '<button class="qt-fold" type="button" aria-label="Recolher ou abrir o rastreador de missão" aria-expanded="true">▾</button><div class="qt-body" role="button" tabindex="0" title="Abrir o Quadro de Missões"></div>';
  col.appendChild(box);
  UIQ.track = box;
  UIQ.head = box.querySelector('.qt-fold');
  UIQ.body = box.querySelector('.qt-body');
  UIQ.head.addEventListener('click', (e) => { e.stopPropagation(); S.settings.questFold = S.settings.questFold !== true; persist(); renderTracker(); });
  UIQ.body.addEventListener('click', openQuestBoard);
  UIQ.body.addEventListener('keydown', (e) => { if (e.key === 'Enter') openQuestBoard(); });
  buildDodgeButton(hud);
  touchTips();
  $('#dialog').addEventListener('click', boardAction);
}
