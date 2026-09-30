// ---------- conta e save na nuvem (tela de título) ----------
// Botão "Nuvem" no canto da tela de título: entrar, criar conta, trocar senha,
// escolher qual save manter quando este aparelho e a nuvem divergem, e
// restaurar cópias de segurança. Usa o mesmo modal dos NPCs (#modal/#dialog).
import {
  Cloud, cloudEnabled, listBackups, postponeConflict, resolveConflict, restoreBackup,
  sendPasswordReset, setNewPassword, signIn, signOut, signUp, syncByUser,
} from '../core/cloud.js';
import { saveSummary } from '../core/cloudSync.js';
import { G, S } from '../core/state.js';
import { $, esc, R } from '../core/util.js';
import { closeModal } from './npcDialogs.js';

// mode: login | signup | reset | newpass | account | conflict
const A = { mode: 'login', email: '', err: '', info: '', busy: false, local: null, cloud: null };

const isOpen = () => !$('#modal').hidden && !!$('#dialog .acct');
function when(t) {
  const d = new Date(t);
  return Number.isFinite(d.getTime()) ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
}
function statusLine() {
  switch (Cloud.status) {
    case 'busy': return 'Sincronizando…';
    case 'synced': return Cloud.msg || ('Salvo na nuvem' + (Cloud.lastSync ? ' às ' + new Date(Cloud.lastSync).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '') + '.');
    default: return Cloud.msg || '';
  }
}
function charList(save) {
  const list = saveSummary(save);
  if (!list.length) return '<p class="note">Nenhum personagem.</p>';
  return '<ul class="acct-chars">' + list.map((c) => {
    const C = R.CLASSES[c.cls];
    const cls = C ? (C.tiers[c.tier] || C.tiers[0]) : c.cls;
    return '<li><b>' + esc(c.name) + '</b> <span>' + esc(cls) + ' · Nv ' + c.level + (c.resets ? ' · ' + c.resets + ' reset' + (c.resets > 1 ? 's' : '') : '') + '</span></li>';
  }).join('') + '</ul>';
}
const field = (id, type, label, auto, value) => '<label class="acct-f"><span>' + label + '</span><input class="fld" id="' + id + '" type="' + type + '" autocomplete="' + auto + '"' + (value ? ' value="' + esc(value) + '"' : '') + ' required></label>';
const msgs = () => (A.err ? '<p class="acct-err" role="alert">' + esc(A.err) + '</p>' : '') + (A.info ? '<p class="acct-info">' + esc(A.info) + '</p>' : '');
const closeBtn = '<button class="btn sm acct-x" data-acct="close" aria-label="Fechar">×</button>';

function view() {
  if (!cloudEnabled()) {
    return '<h3>Salvar na nuvem</h3><p>O salvamento na nuvem ainda não foi configurado nesta versão do jogo. Seu progresso continua salvo neste navegador.</p>' +
      '<div class="row" style="justify-content:flex-end"><button class="btn" data-acct="close">Fechar</button></div>';
  }
  const dis = A.busy ? ' disabled' : '';
  switch (A.mode) {
    case 'conflict': {
      const c = A.cloud || {};
      return '<h3>Qual save manter?</h3><p>Este aparelho e sua conta têm personagens diferentes. O save que você não escolher fica guardado como cópia de segurança neste aparelho, e dá para voltar a ele depois.</p>' +
        '<div class="acct-cmp"><div class="card"><h4>Neste aparelho</h4>' + charList(A.local) + '</div>' +
        '<div class="card"><h4>Na nuvem</h4>' + charList(c.data) + (c.updated_at ? '<p class="note">Enviado em ' + when(c.updated_at) + '</p>' : '') + '</div></div>' + msgs() +
        '<div class="row acct-actions"><button class="btn" data-acct="later"' + dis + '>Decidir depois</button><button class="btn" data-acct="keepCloud"' + dis + '>Usar os da nuvem</button><button class="btn gold" data-acct="keepLocal"' + dis + '>Manter os deste aparelho</button></div>';
    }
    case 'account': {
      const bk = listBackups();
      let h = closeBtn + '<h3>Sua conta</h3><p class="role">' + esc(Cloud.user ? Cloud.user.email : '') + '</p>' +
        '<p class="acct-st acct-' + Cloud.status + '">' + esc(statusLine()) + '</p>' + msgs() +
        '<div class="row"><button class="btn gold" data-acct="sync"' + dis + '>Sincronizar agora</button><button class="btn" data-acct="logout"' + dis + '>Sair da conta</button></div>' +
        '<p class="note">O jogo salva neste aparelho a cada 15 s e envia para a nuvem a cada minuto de partida e ao voltar à tela inicial. Sem internet, tudo continua salvo aqui e sobe depois.</p>';
      if (bk.length && !Cloud.conflict) {
        h += '<h4 class="acct-h">Cópias de segurança neste aparelho</h4><div class="acct-bk">' + bk.map((b, i) =>
          '<div class="dg"><div><b>' + esc(when(b.at)) + '</b><div class="s">' + esc(b.why) + ': ' + esc(saveSummary(b.data).map((c) => c.name + ' Nv ' + c.level).join(', ') || 'sem personagens') + '</div></div>' +
          '<button class="btn sm" data-acct="restore" data-i="' + i + '"' + dis + '>Restaurar</button></div>').join('') + '</div>' +
          '<p class="note">Restaurar troca o save atual pela cópia; o atual vira uma nova cópia.</p>';
      }
      return h;
    }
    case 'reset':
      return closeBtn + '<h3>Trocar senha</h3><form class="acct-form" data-form="reset">' + field('acctEmail', 'email', 'E-mail da conta', 'email', A.email) + msgs() +
        '<div class="row acct-actions"><button type="button" class="btn" data-acct="mode" data-m="login">Voltar</button><button class="btn gold"' + dis + '>Enviar link</button></div></form>';
    case 'newpass':
      return closeBtn + '<h3>Nova senha</h3><p class="role">' + esc(Cloud.user ? Cloud.user.email : '') + '</p><form class="acct-form" data-form="newpass">' +
        field('acctPass', 'password', 'Nova senha (mín. 6)', 'new-password') + field('acctPass2', 'password', 'Repita a senha', 'new-password') + msgs() +
        '<div class="row acct-actions"><button class="btn gold"' + dis + '>Salvar nova senha</button></div></form>';
    default: {
      const up = A.mode === 'signup';
      return closeBtn + '<h3>Salvar na nuvem</h3><p>Guarde seus personagens numa conta e jogue em qualquer aparelho. Os personagens deste navegador são vinculados à conta; nada é apagado.</p>' +
        '<div class="acct-tabs" role="tablist"><button type="button" role="tab" class="' + (up ? '' : 'on') + '" data-acct="mode" data-m="login">Entrar</button><button type="button" role="tab" class="' + (up ? 'on' : '') + '" data-acct="mode" data-m="signup">Criar conta</button></div>' +
        '<form class="acct-form" data-form="' + A.mode + '">' + field('acctEmail', 'email', 'E-mail', 'email', A.email) +
        field('acctPass', 'password', up ? 'Senha (mín. 6)' : 'Senha', up ? 'new-password' : 'current-password') +
        (up ? field('acctPass2', 'password', 'Repita a senha', 'new-password') : '') + msgs() +
        '<div class="row acct-actions">' + (up ? '' : '<button type="button" class="t-link" data-acct="mode" data-m="reset">Esqueci minha senha</button>') +
        '<button class="btn gold"' + dis + '>' + (up ? 'Criar conta' : 'Entrar') + '</button></div></form>';
    }
  }
}
function render(focus) {
  $('#dialog').innerHTML = '<div class="acct">' + view() + '</div>';
  $('#modal').classList.add('acct-on');
  $('#modal').hidden = false;
  if (focus) { const f = $('#dialog input'); if (f) f.focus(); }
}
/** Abre a janela da conta (no modo certo para o estado atual). */
export function openAccount(mode) {
  A.err = ''; A.info = '';
  A.mode = mode || (Cloud.conflict ? 'conflict' : Cloud.user ? 'account' : 'login');
  if (A.mode === 'conflict') { A.local = JSON.parse(JSON.stringify(S)); A.cloud = Cloud.conflict; }
  render(true);
}

async function run(fn, after) {
  A.busy = true; A.err = ''; A.info = ''; render();
  try { await fn(); A.busy = false; after(); }
  catch (e) { A.busy = false; A.err = (e && e.message) || 'Falhou.'; render(true); }
}
function afterLogin() {
  refreshAccountUi();
  if (Cloud.conflict) { openAccount('conflict'); return; } // os dois lados têm personagens: o jogador escolhe
  A.mode = 'account'; A.info = 'Pronto! Seus personagens estão vinculados a esta conta.';
  render();
}
function onSubmit(e) {
  const f = e.target.closest('[data-form]');
  if (!f) return;
  e.preventDefault();
  if (A.busy) return;
  const email = ($('#acctEmail') || {}).value, pass = ($('#acctPass') || {}).value, pass2 = ($('#acctPass2') || {}).value;
  if (email != null) A.email = email.trim();
  const bad = (m) => { A.err = m; A.info = ''; render(true); };
  if (email != null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(A.email)) return bad('Digite um e-mail válido.');
  if ((f.dataset.form === 'signup' || f.dataset.form === 'newpass') && (pass || '').length < 6) return bad('A senha precisa ter ao menos 6 caracteres.');
  if (pass2 != null && pass !== pass2) return bad('As senhas não são iguais.');
  switch (f.dataset.form) {
    case 'login': run(() => signIn(A.email, pass), afterLogin); break;
    case 'signup': {
      let r;
      run(async () => { r = await signUp(A.email, pass); }, () => {
        if (r === 'in') { afterLogin(); return; }
        A.mode = 'login'; A.info = 'Enviamos um link de confirmação para ' + A.email + '. Abra o link neste aparelho e depois entre com sua senha.'; render();
      });
      break;
    }
    case 'reset': run(() => sendPasswordReset(A.email), () => { A.mode = 'login'; A.info = 'Se houver uma conta com esse e-mail, enviamos um link para criar uma nova senha.'; render(); }); break;
    case 'newpass': run(() => setNewPassword(pass), () => { A.mode = 'account'; A.info = 'Senha alterada.'; render(); }); break;
  }
}
function onClick(e) {
  const b = e.target.closest('[data-acct]');
  if (!b || b.disabled) return;
  switch (b.dataset.acct) {
    case 'close': closeModal(); break;
    case 'mode': { const em = $('#acctEmail'); if (em) A.email = em.value.trim(); A.mode = b.dataset.m; A.err = ''; A.info = ''; render(true); break; }
    case 'sync': A.err = ''; A.info = ''; syncByUser(); render(); break;
    case 'logout': run(() => signOut(), () => { refreshAccountUi(); A.mode = 'login'; A.info = 'Você saiu da conta. Os personagens continuam salvos neste aparelho.'; render(); }); break;
    case 'restore': if (restoreBackup(+b.dataset.i)) { A.info = 'Cópia restaurada.'; render(); } break;
    case 'later': postponeConflict(); closeModal(); refreshAccountUi(); break;
    case 'keepLocal': run(() => resolveConflict('local'), () => { refreshAccountUi(); if (Cloud.conflict) { openAccount('conflict'); return; } A.mode = 'account'; A.info = 'Os personagens deste aparelho foram enviados para a nuvem.'; render(); }); break;
    case 'keepCloud': run(() => resolveConflict('cloud'), () => { refreshAccountUi(); A.mode = 'account'; A.info = 'Os personagens da nuvem foram carregados.'; render(); }); break;
  }
}

/** Atualiza o botão da nuvem e o rodapé da tela de título (e a janela, se aberta na conta). */
export function refreshAccountUi() {
  const btn = $('#tAcct'), foot = $('#tFootSave');
  if (btn) {
    const on = cloudEnabled() && Cloud.user;
    const label = !on ? 'Salvar na nuvem' : ({ busy: 'Sincronizando…', synced: 'Salvo na nuvem', offline: 'Nuvem: offline', conflict: 'Escolha qual save manter', relogin: 'Entrar de novo', error: 'Erro na nuvem' }[Cloud.status] || 'Conta');
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 9.1 4.5 4.5 0 0 0 7 18z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg><span>' + esc(label) + '</span>';
    btn.className = 't-acct' + (on ? ' on st-' + Cloud.status : '');
  }
  if (foot) foot.textContent = cloudEnabled() && Cloud.user ? 'Progresso salvo neste navegador e na nuvem (' + Cloud.user.email + ')' : 'Jogo offline · progresso salvo neste navegador';
  if (isOpen() && A.mode === 'account' && !A.busy) render();
}
/** Chamado pela nuvem quando os dois saves divergem (só na tela de título). */
export function showConflictDialog() {
  if (G.mode !== 'title') return;
  openAccount('conflict');
}

export function initAccount() {
  $('#tAcct').addEventListener('click', () => openAccount());
  $('#dialog').addEventListener('click', onClick);
  $('#dialog').addEventListener('submit', onSubmit);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen() && G.mode === 'title') { if (A.mode === 'conflict') postponeConflict(); closeModal(); } });
  refreshAccountUi();
}
