// ---------- save na nuvem (Supabase) ----------
// Conta por e-mail e senha (Supabase Auth) e uma linha por jogador na tabela
// `saves`, protegida por Row Level Security (supabase/migrations/): cada conta só
// lê e grava a própria linha. Fala direto com a API REST (sem biblioteca extra).
//
// O jogo continua 100% local: o save do navegador é sempre o que vale durante a
// partida e a nuvem recebe cópias. Cada cópia tem um número de revisão (`rev`);
// um envio só grava se a nuvem ainda estiver na revisão que este aparelho conhece,
// então dois aparelhos nunca se sobrescrevem em silêncio. Quando os dois lados
// mudaram, o jogador escolhe, e o lado descartado vira uma cópia de segurança.
import { CONFIG } from './config.js';
import { decideSync, hasChars } from './cloudSync.js';
import { G, loadSave, S, SAVE_KEY, SaveHooks } from './state.js';

export const CLOUD_KEY = 'forjadeira.cloud.v1';
export const BACKUP_KEY = 'forjadeira.save.backups';
const MAX_BACKUPS = 3;
const KEEPALIVE_MAX = 60000; // bytes: limite do navegador para envio ao fechar a página

/**
 * Estado visível da nuvem. status: off (sem conta) | busy | synced | offline |
 * conflict (esperando escolha) | relogin (sessão expirou) | error.
 */
export const Cloud = { user: null, status: 'off', msg: '', lastSync: 0, conflict: null };

let session = null; // { access_token, refresh_token, expires_at, user: { id, email } }
let sync = null;    // { userId, rev, dirty }: última revisão combinada com a nuvem neste aparelho
let gen = 0;        // conta os saves locais (detecta mudança durante um envio)
let busy = false, pending = false, conflictShown = false, lastPush = 0, retryAt = 0, refreshing = null;
const hooks = { onChange: null, onConflict: null, onApplied: null };

function cfg() {
  const o = typeof window !== 'undefined' && window.FORJA_CLOUD_OVERRIDE; // usado pelos testes automatizados
  return o ? Object.assign({}, CONFIG.cloud, o) : CONFIG.cloud;
}
/** A nuvem está configurada (URL e chave pública)? Sem isso o jogo segue só local. */
export function cloudEnabled() { const c = cfg(); return !!(c.url && c.anonKey); }
const uid = () => (session && session.user ? session.user.id : null);

function readMeta() {
  try {
    const m = JSON.parse(localStorage.getItem(CLOUD_KEY) || 'null');
    if (m && typeof m === 'object') { session = m.session && m.session.user ? m.session : null; sync = m.sync || null; }
  } catch { /* sem armazenamento: nuvem só nesta aba */ }
  Cloud.user = session ? session.user : null;
}
function writeMeta() { try { localStorage.setItem(CLOUD_KEY, JSON.stringify({ session, sync })); } catch { /* ignora */ } }
function setStatus(status, msg) { Cloud.status = status; Cloud.msg = msg || ''; if (hooks.onChange) hooks.onChange(); }

// ---------- HTTP ----------
class CloudError extends Error {
  constructor(msg, code, status) { super(msg); this.code = code; this.status = status || 0; }
}
const MSG = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  invalid_grant: 'E-mail ou senha incorretos.',
  email_not_confirmed: 'Confirme seu e-mail pelo link que enviamos antes de entrar.',
  user_already_exists: 'Já existe uma conta com esse e-mail. Use "Entrar".',
  email_exists: 'Já existe uma conta com esse e-mail. Use "Entrar".',
  weak_password: 'Senha fraca: use ao menos 6 caracteres.',
  same_password: 'A nova senha precisa ser diferente da anterior.',
  email_address_invalid: 'E-mail inválido.',
  validation_failed: 'Confira o e-mail e a senha.',
  over_email_send_rate_limit: 'Muitos e-mails enviados. Espere alguns minutos.',
  over_request_rate_limit: 'Muitas tentativas. Espere um pouco e tente de novo.',
  signup_disabled: 'A criação de contas está desligada no servidor.',
};
function errorMessage(code, status, json) {
  if (MSG[code]) return MSG[code];
  if (status === 401 || status === 403) return 'Acesso negado pelo servidor (' + status + ').';
  const d = json && (json.msg || json.error_description || json.message);
  return 'Erro do servidor (' + status + ')' + (d ? ': ' + d : '.');
}
async function call(path, opt) {
  const { method = 'GET', body, auth = false, prefer, keepalive = false } = opt || {};
  const c = cfg();
  const headers = { apikey: c.anonKey, 'Content-Type': 'application/json' };
  if (auth) {
    await ensureFresh();
    if (!session) throw new CloudError('Entre de novo na sua conta.', 'relogin');
    headers.Authorization = 'Bearer ' + session.access_token;
  }
  if (prefer) headers.Prefer = prefer;
  let res;
  try { res = await fetch(c.url + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), keepalive }); }
  catch { throw new CloudError('Sem conexão com o servidor.', 'offline'); }
  const txt = await res.text();
  let json = null;
  try { json = txt ? JSON.parse(txt) : null; } catch { /* resposta sem JSON */ }
  if (!res.ok) {
    const code = (json && (json.error_code || json.code || json.error)) || String(res.status);
    throw new CloudError(errorMessage(code, res.status, json), code, res.status);
  }
  return json;
}

// ---------- sessão ----------
function setSession(j, user) {
  const u = user || j.user;
  session = {
    access_token: j.access_token, refresh_token: j.refresh_token,
    expires_at: +j.expires_at || Math.floor(Date.now() / 1000) + (+j.expires_in || 3600),
    user: { id: u.id, email: u.email || '' },
  };
  Cloud.user = session.user;
  writeMeta();
}
function dropSession(status, msg) {
  session = null; Cloud.user = null; Cloud.conflict = null; pending = false;
  writeMeta();
  setStatus(status || 'off', msg);
}
function ensureFresh() {
  if (!session || !session.expires_at || session.expires_at * 1000 - 60000 > Date.now()) return Promise.resolve();
  if (!refreshing) {
    refreshing = call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token } })
      .then((j) => setSession(j))
      .catch((e) => {
        if (e.status >= 400 && e.status < 500) dropSession('relogin', 'Sua sessão expirou. Entre de novo; o save deste aparelho continua aqui.');
        throw e;
      })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}
function redirectParam() {
  return /^https?:$/.test(location.protocol) ? '?redirect_to=' + encodeURIComponent(location.origin + location.pathname) : '';
}

/** Entra na conta e vincula o save deste aparelho a ela. */
export async function signIn(email, password) {
  const j = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
  setSession(j);
  await linkNow();
}
/** Cria a conta. 'in' = já entrou; 'confirm' = precisa clicar no link do e-mail. */
export async function signUp(email, password) {
  const j = await call('/auth/v1/signup' + redirectParam(), { method: 'POST', body: { email, password } });
  if (j && j.access_token) { setSession(j); await linkNow(); return 'in'; }
  return 'confirm';
}
/** Envia o e-mail de troca de senha. */
export async function sendPasswordReset(email) {
  await call('/auth/v1/recover' + redirectParam(), { method: 'POST', body: { email } });
}
/** Define a nova senha (depois de abrir o link de recuperação). */
export async function setNewPassword(password) {
  await call('/auth/v1/user', { method: 'PUT', auth: true, body: { password } });
}
/** Sai da conta. O save deste aparelho fica como está; antes, tenta enviar o que falta. */
export async function signOut() {
  if (session && sync && sync.userId === uid() && sync.dirty && Cloud.status !== 'conflict') {
    try { await syncNow(); } catch { /* sai mesmo assim */ }
  }
  const t = session && session.access_token;
  dropSession('off');
  if (t) fetch(cfg().url + '/auth/v1/logout', { method: 'POST', headers: { apikey: cfg().anonKey, Authorization: 'Bearer ' + t } }).catch(() => {});
}
/** "Apagar dados locais": esquece a conta neste aparelho (o save da nuvem não é apagado). */
export function forgetCloudLocal() {
  try { localStorage.removeItem(CLOUD_KEY); localStorage.removeItem(BACKUP_KEY); } catch { /* ignora */ }
}

/** Links de confirmação e de nova senha voltam com a sessão no endereço (#access_token=…). */
async function consumeAuthHash() {
  const h = typeof location !== 'undefined' ? location.hash : '';
  if (!/access_token=|error_description=/.test(h)) return null;
  const p = new URLSearchParams(h.slice(1));
  try { history.replaceState(null, '', location.pathname + location.search); } catch { /* ignora */ }
  if (p.get('error_description')) { setStatus('error', 'O link do e-mail é inválido ou expirou. Peça outro.'); return 'error'; }
  const tmp = { access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), expires_at: p.get('expires_at'), expires_in: p.get('expires_in') };
  session = { access_token: tmp.access_token, refresh_token: tmp.refresh_token, expires_at: 0, user: null };
  try {
    session.expires_at = Math.floor(Date.now() / 1000) + 3000; // provisório, só para a chamada abaixo
    const u = await call('/auth/v1/user', { auth: true });
    setSession(tmp, u);
  } catch (e) { dropSession('error', e.message); return 'error'; }
  return p.get('type') || 'signup';
}

// ---------- sincronização ----------
function fetchCloud() {
  return call('/rest/v1/saves?select=data,rev,updated_at&user_id=eq.' + uid(), { auth: true }).then((rows) => (rows && rows[0]) || null);
}
/** Grava o save local na nuvem sobre a revisão `baseRev` (0 = a conta ainda não tem save). false = alguém gravou antes. */
async function upload(baseRev, keepalive) {
  const g = gen, id = uid();
  const data = JSON.parse(JSON.stringify(S));
  let rows;
  if (!baseRev) {
    try { rows = await call('/rest/v1/saves?select=rev,updated_at', { method: 'POST', auth: true, prefer: 'return=representation', body: { user_id: id, data, rev: 1 }, keepalive }); }
    catch (e) { if (e.status === 409) return false; throw e; }
  } else {
    rows = await call('/rest/v1/saves?select=rev,updated_at&user_id=eq.' + id + '&rev=eq.' + baseRev, { method: 'PATCH', auth: true, prefer: 'return=representation', body: { data, rev: baseRev + 1 }, keepalive });
  }
  if (!rows || !rows.length) return false;
  sync = { userId: id, rev: rows[0].rev, dirty: gen !== g };
  writeMeta();
  Cloud.lastSync = Date.now();
  return true;
}
function applyCloud(cloud) {
  loadSave(cloud.data);
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch { /* ignora */ }
  sync = { userId: uid(), rev: cloud.rev, dirty: false };
  writeMeta();
  Cloud.lastSync = Date.now();
  if (hooks.onApplied) hooks.onApplied();
}
function handleError(e) {
  if (e && e.code === 'offline') { retryAt = Date.now() + cfg().retryInterval * 1000; setStatus('offline', 'Sem internet: o progresso fica salvo aqui e sobe quando a conexão voltar.'); }
  else if (session) { retryAt = Date.now() + cfg().retryInterval * 1000; setStatus('error', e && e.message ? e.message : 'Falha ao sincronizar.'); }
}

/** Compara com a nuvem e envia, baixa ou pede escolha. Baixar só acontece na tela de título. */
export async function syncNow() {
  if (!cloudEnabled() || !session || busy) return;
  busy = true;
  setStatus('busy', 'Sincronizando…');
  try {
    for (let tries = 0; tries < 3; tries++) {
      const cloud = await fetchCloud();
      const d = decideSync({ local: S, cloud, sync, userId: uid() });
      if (d === 'same' || d === 'none') {
        sync = { userId: uid(), rev: cloud ? cloud.rev : 0, dirty: false };
        writeMeta(); Cloud.lastSync = Date.now(); pending = false;
        break;
      }
      if (d === 'upload') { if (await upload(cloud ? cloud.rev : 0)) break; continue; }
      if (d === 'download') {
        if (G.mode !== 'title') { pending = true; setStatus('synced', 'Há um save mais novo na nuvem: ele entra quando você voltar à tela inicial.'); return; }
        pending = false; applyCloud(cloud); break;
      }
      Cloud.conflict = cloud;
      setStatus('conflict', 'Este aparelho e a nuvem têm saves diferentes. Escolha qual manter.');
      showConflict();
      return;
    }
    retryAt = 0;
    setStatus('synced', '');
  } catch (e) { handleError(e); }
  finally { busy = false; }
}
function linkNow() { conflictShown = false; Cloud.conflict = null; return syncNow(); }
function showConflict() {
  if (conflictShown || !Cloud.conflict || G.mode !== 'title' || !hooks.onConflict) return;
  conflictShown = true;
  hooks.onConflict(S, Cloud.conflict);
}
/** Escolha do jogador no conflito: 'local' (este aparelho vai para a nuvem) ou 'cloud'. */
export async function resolveConflict(choice) {
  const cloud = Cloud.conflict;
  if (!cloud || busy) return;
  if (choice === 'cloud') {
    if (hasChars(S)) addBackup('Save deste aparelho, trocado pelo da nuvem', S);
    Cloud.conflict = null; conflictShown = false;
    applyCloud(cloud);
    setStatus('synced', '');
    return;
  }
  if (hasChars(cloud.data)) addBackup('Save da nuvem, trocado pelo deste aparelho', cloud.data);
  busy = true;
  setStatus('busy', 'Enviando…');
  try {
    const ok = await upload(cloud.rev);
    Cloud.conflict = null; conflictShown = false;
    busy = false;
    if (!ok) { await syncNow(); return; } // a nuvem mudou de novo nesse meio tempo: compara outra vez
    setStatus('synced', '');
  } catch (e) { busy = false; handleError(e); }
}
/** "Decidir depois": nada é enviado até a escolha (reaparece em "Sincronizar agora"). */
export function postponeConflict() { conflictShown = true; }
/** Botão "Sincronizar agora". */
export function syncByUser() { conflictShown = false; retryAt = 0; if (Cloud.conflict) { showConflict(); return; } syncNow(); }

// ---------- cópias de segurança locais ----------
export function listBackups() {
  try { const a = JSON.parse(localStorage.getItem(BACKUP_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
}
function addBackup(why, data) {
  const list = listBackups();
  list.unshift({ at: Date.now(), why, data: JSON.parse(JSON.stringify(data)) });
  try { localStorage.setItem(BACKUP_KEY, JSON.stringify(list.slice(0, MAX_BACKUPS))); } catch { /* ignora */ }
}
/** Troca o save atual por uma cópia de segurança (o atual vira cópia, nada se perde). */
export function restoreBackup(i) {
  const list = listBackups(), b = list[i];
  if (!b || G.mode !== 'title' || Cloud.conflict) return false;
  list.splice(i, 1);
  if (hasChars(S)) list.unshift({ at: Date.now(), why: 'Save trocado por uma cópia de segurança', data: JSON.parse(JSON.stringify(S)) });
  try { localStorage.setItem(BACKUP_KEY, JSON.stringify(list.slice(0, MAX_BACKUPS))); } catch { /* ignora */ }
  loadSave(b.data);
  persistLocal(); // um save restaurado é escolha do jogador: segue para a nuvem como qualquer mudança
  if (hooks.onApplied) hooks.onApplied();
  return true;
}
function persistLocal() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch { /* ignora */ }
  markDirty();
}

// ---------- ciclo ----------
function markDirty() {
  gen++;
  if (sync && !sync.dirty) { sync.dirty = true; writeMeta(); }
}
/** Chamado a cada quadro: envia de tempos em tempos e, na tela de título, aplica o que ficou pendente. */
export function cloudTick() {
  if (!session || !cloudEnabled() || busy) return;
  if (Cloud.conflict) { showConflict(); return; }
  if (Cloud.status === 'relogin') return;
  const need = pending || !sync || sync.userId !== uid() || sync.dirty;
  if (!need || Date.now() < retryAt) return;
  const c = cfg();
  // relógio de parede (não o da simulação): em aparelhos lentos o passo do quadro é limitado
  const now = Date.now();
  if (now - lastPush >= (G.mode === 'title' ? c.pushIntervalTitle : c.pushInterval) * 1000) { lastPush = now; syncNow(); }
}
/** Ao esconder/fechar a página: salva localmente e tenta um último envio. */
function flushOnHide() {
  if (!session || busy || Cloud.conflict || !sync || sync.userId !== uid()) return;
  if (G.mode === 'play') { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch { /* ignora */ } gen++; sync.dirty = true; writeMeta(); }
  if (!sync.dirty || !session.expires_at || session.expires_at * 1000 - 60000 < Date.now()) return;
  const keepalive = JSON.stringify(S).length < KEEPALIVE_MAX;
  busy = true;
  upload(sync.rev, keepalive).catch(() => {}).finally(() => { busy = false; });
}

/**
 * Liga a nuvem: lê a sessão guardada, trata links de e-mail e faz a primeira
 * sincronização. hooks: onChange (status mudou), onConflict(local, cloud),
 * onApplied (o save foi trocado). Devolve o tipo de link aberto ('recovery', …) ou null.
 */
export async function initCloud(h) {
  Object.assign(hooks, h || {});
  SaveHooks.afterPersist = markDirty;
  if (!cloudEnabled()) return null;
  readMeta();
  if (session) setStatus('busy', 'Sincronizando…');
  window.addEventListener('pagehide', flushOnHide);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushOnHide(); });
  let link = null;
  try { link = await consumeAuthHash(); } catch { link = 'error'; }
  if (session) await linkNow();
  return link;
}

/** Estado interno para os testes automatizados (gancho de depuração). */
export function cloudDebug() { return { status: Cloud.status, busy, pending, lastPush, retryAt, sync, conflict: !!Cloud.conflict, user: Cloud.user }; }
