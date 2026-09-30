#!/usr/bin/env python3
"""
Teste de ponta a ponta do save na nuvem, com um Supabase FALSO (nenhuma rede real).

Uso:  python3 tests/cloud_smoke.py [dist/forja-deira.html]

O servidor falso imita a API REST do Supabase Auth e da tabela `saves`, inclusive
o Row Level Security (cada token só enxerga a própria linha) e a revisão `rev`.
Percorre:
  1. aparelho A: joga offline, cria conta e o personagem existente sobe para a nuvem;
  2. aparelho B (vazio): entra na conta e recebe o personagem;
  3. aparelho C (com outro personagem): entra, escolhe qual save manter, restaura a
     cópia de segurança do descartado;
  4. RLS: outra conta não vê o save da primeira.
"""
import functools, http.server, json, os, sys, threading, time
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
PAGE = sys.argv[1] if len(sys.argv) > 1 else 'dist/forja-deira.html'
FAKE = 'https://fake.supabase.test'
SHOTS = os.environ.get('SHOTS')  # pasta opcional para capturas de tela
ok = True


def shot(pg, name):
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        pg.screenshot(path=os.path.join(SHOTS, name + '.png'))


def check(cond, msg):
    global ok
    print(('  ok  ' if cond else '  FALHOU ') + msg)
    ok = ok and bool(cond)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
url = 'http://127.0.0.1:%d/%s' % (srv.server_address[1], PAGE)

# ---------- Supabase falso ----------
users = {}   # email -> {id, password}
tokens = {}  # token -> user id
rows = {}    # user id -> {data, rev, updated_at}
log = []


def session_for(email):
    u = users[email]
    tok = 'tok-%s-%d' % (u['id'], len(tokens))
    tokens[tok] = u['id']
    return {'access_token': tok, 'refresh_token': 'r-' + tok, 'expires_in': 3600, 'token_type': 'bearer', 'user': {'id': u['id'], 'email': email}}


def fake(route, request):
    u = urlparse(request.url)
    q = parse_qs(u.query)
    body = json.loads(request.post_data) if request.post_data else None
    hdr = request.headers
    log.append((request.method, u.path))
    if hdr.get('apikey') != 'anon-test':
        return route.fulfill(status=401, json={'message': 'no apikey'})
    auth = hdr.get('authorization', '')
    me = tokens.get(auth[7:]) if auth.startswith('Bearer ') else None

    def eq(k):
        v = q.get(k, [None])[0]
        return v[3:] if v and v.startswith('eq.') else None

    if u.path == '/auth/v1/signup':
        if body['email'] in users:
            return route.fulfill(status=422, json={'error_code': 'user_already_exists', 'msg': 'User already registered'})
        users[body['email']] = {'id': 'u%d' % (len(users) + 1), 'password': body['password']}
        return route.fulfill(json=session_for(body['email']))
    if u.path == '/auth/v1/token':
        x = users.get(body.get('email'))
        if not x or x['password'] != body.get('password'):
            return route.fulfill(status=400, json={'error_code': 'invalid_credentials', 'msg': 'Invalid login credentials'})
        return route.fulfill(json=session_for(body['email']))
    if u.path == '/auth/v1/logout':
        return route.fulfill(status=204, body='')
    if u.path == '/rest/v1/saves':
        # RLS: só a própria linha
        if request.method == 'GET':
            r = rows.get(me) if me and eq('user_id') == me else None
            return route.fulfill(json=[dict(r, user_id=me)] if r else [])
        if request.method == 'POST':
            if not me or body.get('user_id') != me:
                return route.fulfill(status=403, json={'code': '42501', 'message': 'new row violates row-level security policy'})
            if me in rows:
                return route.fulfill(status=409, json={'code': '23505', 'message': 'duplicate key'})
            rows[me] = {'data': body['data'], 'rev': body['rev'], 'updated_at': '2026-09-30T12:00:00Z'}
            return route.fulfill(status=201, json=[{'rev': body['rev'], 'updated_at': rows[me]['updated_at']}])
        if request.method == 'PATCH':
            r = rows.get(me) if me and eq('user_id') == me else None
            if not r or str(r['rev']) != eq('rev'):
                return route.fulfill(json=[])
            r.update(data=body['data'], rev=body['rev'], updated_at='2026-09-30T13:00:00Z')
            return route.fulfill(json=[{'rev': r['rev'], 'updated_at': r['updated_at']}])
    return route.fulfill(status=404, json={'message': 'not found'})


INIT = "window.FORJA_CLOUD_OVERRIDE = { url: '%s', anonKey: 'anon-test', pushIntervalTitle: 0.5 };" % FAKE


def open_device(b, seed=None):
    ctx = b.new_context(viewport={'width': 1280, 'height': 800})
    ctx.add_init_script(INIT)
    if seed is not None:
        ctx.add_init_script("if (!localStorage.getItem('forjadeira.save.v1')) localStorage.setItem('forjadeira.save.v1', %s);" % json.dumps(json.dumps(seed)))
    ctx.route(FAKE + '/**', fake)
    pg = ctx.new_page()
    errs, external = [], []
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    # 400 = senha errada de propósito no aparelho B
    pg.on('console', lambda m: errs.append('console: ' + m.text) if m.type == 'error' and 'status of 400' not in m.text else None)
    pg.on('request', lambda r: external.append(r.url) if not r.url.startswith(('http://127.0.0.1', 'data:', 'blob:', FAKE)) else None)
    pg.goto(url)
    pg.wait_for_function('window.__FORJA_BOOTED === true', timeout=60000)
    return ctx, pg, errs, external


def save_of(pg):
    return pg.evaluate("() => JSON.parse(localStorage.getItem('forjadeira.save.v1') || 'null')")


def names(save):
    return [c['name'] for c in (save or {}).get('chars', [])]


def login(pg, email, pw, signup=False):
    pg.click('#tAcct')
    pg.wait_for_selector('#dialog .acct')
    if signup:
        pg.click('[data-acct="mode"][data-m="signup"]')
    pg.fill('#acctEmail', email)
    pg.fill('#acctPass', pw)
    if signup:
        pg.fill('#acctPass2', pw)
    pg.click('#dialog .acct-form .btn.gold')


with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or None, args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    print('Página:', PAGE)

    # 1. aparelho A: joga sem conta, depois cria a conta
    ctx, pg, errs, ext = open_device(b)
    check(pg.is_visible('#tAcct'), 'botão "Salvar na nuvem" na tela de título')
    shot(pg, '1-titulo-sem-conta')
    pg.click('[data-cls="dk"]')
    pg.fill('#nameInput', 'Antigo')
    pg.click('#btnCreate')
    pg.wait_for_function('window.__FORJA_DEBUG.G.mode === "play"', timeout=60000)
    pg.evaluate('() => { const D = window.__FORJA_DEBUG; D.G.ch.level = 42; }')
    pg.keyboard.press('Escape')
    pg.click('[data-pause="title"]')
    pg.wait_for_function('window.__FORJA_DEBUG.G.mode === "title"')
    check(not any(m == 'GET' for m, _ in log), 'sem conta: nenhuma chamada à nuvem')
    pg.click('#tAcct')
    pg.click('[data-acct="mode"][data-m="signup"]')
    shot(pg, '2-criar-conta')
    pg.click('[data-acct="close"]')
    login(pg, 'a@teste.com', 'senha123', signup=True)
    pg.wait_for_function("() => document.querySelector('#dialog .acct-info')", timeout=15000)
    shot(pg, '3-conta-vinculada')
    check('vinculados' in pg.inner_text('#dialog'), 'conta criada e personagens vinculados')
    check(names(rows.get('u1', {}).get('data')) == ['Antigo'], 'personagem existente subiu para a nuvem')
    check(rows['u1']['data']['chars'][0]['level'] == 42, 'nível preservado na nuvem')
    check('Salvo na nuvem' in pg.inner_text('#tAcct'), 'botão mostra "Salvo na nuvem"')
    seed_other = save_of(pg)
    # progresso novo sobe sozinho
    pg.click('[data-acct="close"]')
    pg.click('[data-t="play"]')
    pg.wait_for_function('window.__FORJA_DEBUG.G.mode === "play"', timeout=60000)
    pg.evaluate('() => { window.__FORJA_DEBUG.G.ch.level = 43; }')
    pg.keyboard.press('Escape')
    pg.click('[data-pause="title"]')
    pg.wait_for_function('window.__FORJA_DEBUG.G.mode === "title"')
    t0 = time.time()
    while time.time() - t0 < 30 and rows['u1']['rev'] < 2:
        pg.wait_for_timeout(200)
    check(rows['u1']['rev'] == 2 and rows['u1']['data']['chars'][0]['level'] == 43, 'progresso novo enviado ao voltar à tela inicial (rev %d)' % rows['u1']['rev'])
    check(not errs and not ext, 'aparelho A sem erros nem rede externa %s' % (errs + ext)[:3])
    ctx.close()

    # 2. aparelho B vazio: entra e recebe o personagem
    ctx, pg, errs, ext = open_device(b)
    check(pg.is_visible('#tCreate'), 'aparelho B começa sem personagens')
    login(pg, 'a@teste.com', 'errada1')
    pg.wait_for_selector('#dialog .acct-err', timeout=15000)
    check('incorretos' in pg.inner_text('#dialog .acct-err'), 'senha errada mostra mensagem em português')
    pg.fill('#acctPass', 'senha123')
    pg.click('#dialog .acct-form .btn.gold')
    pg.wait_for_function("() => document.querySelector('#dialog .acct-info')", timeout=15000)
    check(names(save_of(pg)) == ['Antigo'] and pg.is_visible('#tSel'), 'aparelho B recebeu o personagem da nuvem')
    check('Antigo' in pg.inner_text('#tCard'), 'tela de título mostra o personagem baixado')
    check(not errs and not ext, 'aparelho B sem erros %s' % (errs + ext)[:3])
    ctx.close()

    # 3. aparelho C com outro personagem: escolhe, e o descartado vira cópia de segurança
    seed_other['chars'][0]['name'] = 'Outro'
    ctx, pg, errs, ext = open_device(b, seed_other)
    check('Outro' in pg.inner_text('#tCard'), 'aparelho C tem o personagem local "Outro"')
    login(pg, 'a@teste.com', 'senha123')
    pg.wait_for_selector('[data-acct="keepCloud"]', timeout=15000)
    txt = pg.inner_text('#dialog')
    shot(pg, '4-escolher-save')
    check('Qual save manter' in txt and 'Outro' in txt and 'Antigo' in txt, 'conflito: janela mostra os dois saves')
    check(names(rows['u1']['data']) == ['Antigo'] and names(save_of(pg)) == ['Outro'], 'nada sobrescrito antes da escolha')
    pg.click('[data-acct="keepCloud"]')
    pg.wait_for_selector('[data-acct="restore"]', timeout=15000)
    check(names(save_of(pg)) == ['Antigo'], 'escolheu a nuvem: save local agora é "Antigo"')
    bk = pg.evaluate("() => JSON.parse(localStorage.getItem('forjadeira.save.backups') || '[]')")
    check(len(bk) == 1 and names(bk[0]['data']) == ['Outro'], 'save descartado guardado como cópia de segurança')
    shot(pg, '5-copias-de-seguranca')
    pg.click('[data-acct="restore"]')
    check(names(save_of(pg)) == ['Outro'] and 'Outro' in pg.inner_text('#tCard'), 'cópia restaurada')
    t0 = time.time()
    while time.time() - t0 < 30 and names(rows['u1']['data']) != ['Outro']:
        pg.wait_for_timeout(200)
    check(names(rows['u1']['data']) == ['Outro'], 'save restaurado segue para a nuvem')
    bk = pg.evaluate("() => JSON.parse(localStorage.getItem('forjadeira.save.backups') || '[]')")
    check(any(names(x['data']) == ['Antigo'] for x in bk), 'o save trocado pela restauração também virou cópia')
    pg.click('[data-acct="logout"]')
    pg.wait_for_function("() => document.querySelector('#dialog .acct-info')", timeout=15000)
    check(names(save_of(pg)) == ['Outro'] and 'Salvar na nuvem' in pg.inner_text('#tAcct'), 'sair da conta mantém o save local')
    check(not errs and not ext, 'aparelho C sem erros %s' % (errs + ext)[:3])
    ctx.close()

    # 4. RLS: outra conta não enxerga o save da primeira
    ctx, pg, errs, ext = open_device(b)
    login(pg, 'b@teste.com', 'outra123', signup=True)
    pg.wait_for_function("() => document.querySelector('#dialog .acct-info')", timeout=15000)
    check(names(save_of(pg)) == [] and 'u2' not in rows, 'outra conta não recebe o save de ninguém')
    ctx.close()
    b.close()

srv.shutdown()
print('\nRESULTADO:', 'OK' if ok else 'FALHOU')
sys.exit(0 if ok else 1)
