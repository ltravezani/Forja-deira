#!/usr/bin/env python3
"""
Capturas de tela por zona (Playwright + Chromium headless) para comparar a arte
antes/depois de uma mudança, com números de desempenho opcionais.

Uso:
  python3 tools/shots.py --tag antes [--perf] [--zones title,town,forest,...]
                         [--perto] [--sem-hud] [--zoom 0.55] [--classe dk] [--out shots]
  python3 tools/shots.py --comparar antes atual [--out shots]

Zonas: title, town, forest, caves, ruins, castle, abyss, tower. As masmorras usam
uma seed fixa (mesma planta a cada execução), então as imagens de duas tags são
comparáveis. --perf mede chamadas de desenho e triângulos por quadro (todos os
passes, sombras incluídas) e grava <out>/<tag>/perf.json. --comparar monta, para
cada zona presente nas duas tags, uma imagem lado a lado (precisa do Pillow).
"""
import argparse, functools, http.server, json, os, sys, threading, time

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

ZONES = ['title', 'town', 'forest', 'caves', 'ruins', 'castle', 'abyss']
CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

ap = argparse.ArgumentParser()
ap.add_argument('--tag')
ap.add_argument('--perf', action='store_true')
ap.add_argument('--zones', default=','.join(ZONES))
ap.add_argument('--perto', action='store_true', help='câmera próxima do herói')
ap.add_argument('--sem-hud', action='store_true')
ap.add_argument('--zoom', type=float, default=None)
ap.add_argument('--classe', default='dk')
ap.add_argument('--out', default=os.path.join(ROOT, 'shots'))
ap.add_argument('--page', default='dist/forja-deira.html')
ap.add_argument('--size', default='1280x800')
ap.add_argument('--comparar', nargs=2, metavar=('A', 'B'))
a = ap.parse_args()


def compare(ta, tb):
    from PIL import Image, ImageDraw
    da, db = os.path.join(a.out, ta), os.path.join(a.out, tb)
    dst = os.path.join(a.out, 'comparar-%s-%s' % (ta, tb))
    os.makedirs(dst, exist_ok=True)
    pa = json.load(open(os.path.join(da, 'perf.json'))) if os.path.exists(os.path.join(da, 'perf.json')) else {}
    pb = json.load(open(os.path.join(db, 'perf.json'))) if os.path.exists(os.path.join(db, 'perf.json')) else {}
    for f in sorted(os.listdir(da)):
        if not f.endswith('.png') or not os.path.exists(os.path.join(db, f)): continue
        A, B = Image.open(os.path.join(da, f)).convert('RGB'), Image.open(os.path.join(db, f)).convert('RGB')
        w, h = A.size
        out = Image.new('RGB', (w * 2 + 8, h + 30), (16, 16, 20))
        out.paste(A, (0, 30)); out.paste(B.resize((w, h)), (w + 8, 30))
        d = ImageDraw.Draw(out)
        z = f[:-4]
        for i, (t, p) in enumerate(((ta, pa), (tb, pb))):
            s = t
            if z in p: s += '   %d chamadas · %dk triângulos' % (p[z]['calls'], p[z]['tris'] // 1000)
            d.text((10 + i * (w + 8), 8), s, fill=(235, 225, 200))
        out.save(os.path.join(dst, z + '.png'))
        print('  ' + os.path.join(dst, z + '.png'))
    if pa and pb:
        print('%-8s %22s %22s' % ('zona', ta, tb))
        for z in pb:
            if z in pa:
                print('%-8s %10d / %6dk %10d / %6dk' % (z, pa[z]['calls'], pa[z]['tris'] // 1000, pb[z]['calls'], pb[z]['tris'] // 1000))


if a.comparar:
    compare(*a.comparar)
    sys.exit(0)
if not a.tag:
    ap.error('--tag ou --comparar')

from playwright.sync_api import sync_playwright


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *x): pass


srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
url = 'http://127.0.0.1:%d/%s' % (srv.server_address[1], a.page)
outdir = os.path.join(a.out, a.tag)
os.makedirs(outdir, exist_ok=True)
W, H = (int(v) for v in a.size.split('x'))
perf = {}

with sync_playwright() as p:
    kw = {'args': ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']}
    if os.path.exists(CHROME): kw['executable_path'] = CHROME
    b = p.chromium.launch(**kw)
    pg = b.new_page(viewport={'width': W, 'height': H})
    errors = []
    pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: errors.append(m.text[:300]) if m.type == 'error' and '404' not in m.text else None)
    ev = lambda js: pg.evaluate('() => { const D = window.__FORJA_DEBUG, G = D && D.G; return (' + js + '); }')

    def wait_game(s):
        t0 = ev('G.time')
        pg.wait_for_function('window.__FORJA_DEBUG.G.time > %f' % (t0 + s), timeout=120000)

    def measure():
        # soma todos os render() de alguns quadros (cena, sombras, brilho, passe final) e divide pelos quadros
        return pg.evaluate("""() => new Promise((res) => {
          const D = window.__FORJA_DEBUG, info = D.renderer.info; info.autoReset = false; info.reset();
          const f0 = D.loopStats().frames, t0 = performance.now();
          const wait = () => { const n = D.loopStats().frames - f0;
            if (n < 6) return requestAnimationFrame(wait);
            const r = { calls: Math.round(info.render.calls / n), tris: Math.round(info.render.triangles / n), ms: Math.round((performance.now() - t0) / n) };
            info.autoReset = true; res(r); };
          requestAnimationFrame(wait);
        })""")

    def frame_camera():
        if a.zoom is not None or a.perto: ev('(D.CAM.zoom = %f, 0)' % (a.zoom if a.zoom is not None else 0.55))
        if a.sem_hud:
            pg.add_style_tag(content='#hud,#minimap,#log,#zoneText,#overlay,.hud,#slots,#topbar{visibility:hidden!important}')

    def shot(name):
        wait_game(1.5)
        if a.perf: perf[name] = measure()
        pg.screenshot(path=os.path.join(outdir, name + '.png'))
        print('  %s%s' % (name, ('  ' + json.dumps(perf[name])) if name in perf else ''))

    pg.goto(url)
    pg.wait_for_function('window.__FORJA_BOOTED === true', timeout=60000)
    zones = [z for z in a.zones.split(',') if z]
    if 'title' in zones:
        wait_game(1.5)
        if a.perf: perf['title'] = measure()
        pg.screenshot(path=os.path.join(outdir, 'title.png'))
        print('  title%s' % (('  ' + json.dumps(perf['title'])) if 'title' in perf else ''))
    pg.click('[data-cls="%s"]' % a.classe)
    pg.fill('#nameInput', 'Retrato')
    pg.click('#btnCreate')
    pg.wait_for_function('window.__FORJA_DEBUG.G.mode === "play"', timeout=60000)
    # herói com equipamento visível e sem morrer durante as capturas
    ev("(G.ch.level = 120, D.recalc(), G.player.invulnUntil = 1e12, 0)")
    for z in zones:
        if z == 'title': continue
        fixed = 'const dn = Date.now; Date.now = () => 1700000000000; try { %s } finally { Date.now = dn; }'
        if z == 'town': ev('(D.enterTown(), 0)')
        elif z == 'tower': pg.evaluate('() => { const D = window.__FORJA_DEBUG; ' + fixed % 'D.enterTower(1);' + ' }')
        else: pg.evaluate('() => { const D = window.__FORJA_DEBUG; ' + fixed % ("D.enterDungeon('%s', 1);" % z) + ' }')
        ev('(G.player.invulnUntil = 1e12, G.monsters.forEach((m) => { m.dmg = 0; }), 0)')
        frame_camera()
        shot(z)
    b.close()
srv.shutdown()
if a.perf:
    json.dump(perf, open(os.path.join(outdir, 'perf.json'), 'w'), indent=1)
if errors: print('erros de página:', errors[:3])
print('capturas em', outdir)
