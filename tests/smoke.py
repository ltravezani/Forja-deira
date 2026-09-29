#!/usr/bin/env python3
"""
Teste de fumaça de ponta a ponta (Playwright + Chromium headless).

Uso:  python3 tests/smoke.py [dist/forja-deira.html | dist/dev.html]

Percorre: tela de título → criar personagem → cidade → masmorra → combate →
coleta (Espaço) → inventário e equipar → pausa (Esc e perda de foco) → morte e
renascimento → voltar ao título pelo menu de pausa → entrar de novo → trocas de
zona repetidas (vazamento de objetos) → redimensionar. Falha se houver erro de
página/console, requisição externa, mais de um laço ativo ou objetos acumulando.
"""
import functools, http.server, json, os, sys, threading, time
from playwright.sync_api import sync_playwright

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
PAGE = sys.argv[1] if len(sys.argv) > 1 else 'dist/forja-deira.html'
ok = True


def check(cond, msg):
    global ok
    print(('  ok  ' if cond else '  FALHOU ') + msg)
    ok = ok and bool(cond)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass


srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
url = 'http://127.0.0.1:%d/%s' % (srv.server_address[1], PAGE)

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width': 1280, 'height': 800})
    errors, external = [], []
    pg.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' else None)
    pg.on('request', lambda r: external.append(r.url) if not r.url.startswith(('http://127.0.0.1', 'data:', 'blob:')) else None)
    D = '__FORJA_DEBUG'
    ev = lambda js: pg.evaluate('() => { const D = window.__FORJA_DEBUG, G = D && D.G; return (' + js + '); }')

    def wait_game(seconds, timeout=90000):
        t0 = ev('G.time')
        pg.wait_for_function('window.__FORJA_DEBUG.G.time > %f' % (t0 + seconds), timeout=timeout)

    print('Página:', PAGE)
    pg.goto(url)
    pg.wait_for_function('window.__FORJA_BOOTED === true', timeout=60000)
    check(ev('G.mode') == 'title', 'inicia na tela de título')
    check(pg.is_visible('#tCreate'), 'sem personagens: painel de criação aberto')

    # criar e entrar
    pg.click('[data-cls="dw"]')
    pg.fill('#nameInput', 'Fumaca')
    pg.click('#btnCreate')
    pg.wait_for_function('window.__FORJA_DEBUG.G.mode === "play"', timeout=60000)
    check(ev('G.zone') == 'town', 'entrou na cidade')
    check(pg.is_visible('#hud'), 'HUD visível')
    life = ev('D.townLifeCount()')
    check(life['folk'] >= 8 and life['critters'] >= 10, 'cidade com moradores e bichos %s' % json.dumps(life))
    wait_game(2.0)
    check(ev('G.L.props.some((p) => p.kind === "fountain") && D.levelMeshes().length > 40'), 'cidade montada com fonte e cenário')

    # masmorra e combate
    ev("D.enterDungeon('forest', 1), G.monsters.length")
    n0 = ev('G.monsters.length')
    check(ev('D.townLifeCount().folk') == 0, 'moradores somem ao sair da cidade')
    check(n0 > 5, 'masmorra com monstros (%d)' % n0)
    ev("(G.monsters.forEach((m) => { m.x = G.player.x + 2 + Math.random(); m.z = G.player.z + 2 + Math.random(); m.aggro = true; m.dmg = 0; }), 0)")
    ev("(G.ch.level = 60, D.recalc(), G.hp = G.st.maxHp, G.mp = G.st.maxMp, 0)")
    cast = ev("D.castSkill('ball', G.monsters[0].x, G.monsters[0].z)")
    check(cast is True, 'habilidade lançada')
    wait_game(1.0)
    ev("(G.monsters.slice().forEach((m) => D.killMonster(m)), G.hp = G.st.maxHp, 0)")
    wait_game(1.0)
    check(ev('G.loot.length') > 0 or ev('G.ch.bag.length') > 2, 'monstros derrubaram loot')
    pg.keyboard.press('Space')
    wait_game(0.5)
    check(ev('G.projectiles.every((p) => Number.isFinite(p.x))'), 'projéteis válidos')
    check(ev('Number.isFinite(G.hp) && Number.isFinite(G.mp) && Number.isFinite(G.player.x)'), 'HP/MP/posição finitos')

    if pg.is_visible('#modal'): print('  (modal aberto: %s)' % pg.inner_text('#dialog')[:120].replace('\n', ' '))
    # inventário: equipar com clique duplo
    ev("(G.ch.bag.push(D.R.makeEquip(99, 5, 'excelente', 'dw', 0, 'elite')), 0)")
    pg.keyboard.press('i')
    pg.wait_for_selector('#bagGrid')
    before = ev('JSON.stringify(G.ch.equip)')
    cells = pg.query_selector_all('#bagGrid button.cell')
    target = None
    for c in cells:
        i = int(c.get_attribute('data-i'))
        if ev('!!(G.ch.bag[%d] && G.ch.bag[%d].slot)' % (i, i)):
            target = c
    if target:
        target.dblclick()
        time.sleep(0.3)
    check(ev('JSON.stringify(G.ch.equip)') != before, 'clique duplo equipa item')
    # pet: vende todo equipamento, menos Lendários; joias e poções ficam
    check(not pg.query_selector('[data-act="petpick"]'), 'sem a opção de vender itens selecionados')
    ev("(G.ch.bag.push(D.R.makeEquip(7, 5, 'excelente', 'dw', 0, 'elite'), D.R.makeEquip(8, 5, 'comum', 'dw', 0, 'normal'), D.R.makeEquip(9, 5, 'lendario', 'dw', 0, 'boss'), { kind: 'potion', id: 'rez', qty: 1, uid: 'prez' }, { kind: 'jewel', id: Object.keys(D.R.JEWELS)[0], qty: 1, uid: 'jx' }), 0)")
    gold0 = ev('G.ch.gold')
    pg.click('[data-act="petsell"]')
    check(ev('G.pet.away > G.time') and ev("!G.ch.bag.some((x) => x.slot && x.rarity !== 'lendario')"), 'pet leva comuns, mágicos, excelentes e ancestrais')
    check(ev("G.ch.bag.some((x) => x.rarity === 'lendario') && G.ch.bag.some((x) => x.id === 'rez') && G.ch.bag.some((x) => x.kind === 'jewel')"), 'lendário, poção e joia ficam na mochila')
    ev("(G.ch.bag = G.ch.bag.filter((x) => x.uid !== 'prez' && x.uid !== 'jx'), 0)")
    ev("(G.pet.away = G.time, 0)")
    wait_game(0.3)
    check(ev('G.ch.gold') > gold0, 'pet volta com o Gold')
    pg.keyboard.press('Escape')
    check(pg.is_hidden('#drawer'), 'Esc fecha o painel')

    # pausa
    pg.keyboard.press('Escape')
    check(ev('G.paused') and pg.is_visible('#pause'), 'Esc pausa o jogo')
    t0 = ev('G.time')
    time.sleep(1.2)
    check(abs(ev('G.time') - t0) < 1e-6, 'tempo de jogo parado durante a pausa')
    pg.keyboard.press('Escape')
    check(not ev('G.paused'), 'Esc retoma')
    pg.evaluate("() => window.dispatchEvent(new Event('blur'))")
    check(ev('G.paused'), 'perder o foco pausa automaticamente')
    pg.click('[data-pause="resume"]')
    check(not ev('G.paused'), 'botão Continuar retoma')

    # Poção da Ressurreição: renasce no mesmo lugar do andar
    ev("(G.ch.bag.push({ kind: 'potion', id: 'rez', qty: 1, uid: 'prez' }), 0)")
    where = ev('[G.zone, G.floor, Math.round(G.player.x * 100), Math.round(G.player.z * 100)]')
    exp0 = ev('[G.ch.exp, G.ch.gold]')
    pg.evaluate("() => { const D = window.__FORJA_DEBUG; for (let i = 0; i < 50 && D.G.player.alive; i++) D.hurtPlayer(1e9, null); }")
    check(pg.is_visible('#btnRevive'), 'tela de queda oferece a Poção da Ressurreição')
    pg.click('#btnRevive')
    check(ev('G.player.alive && G.hp === G.st.maxHp'), 'poção revive com HP cheio')
    check(ev('[G.zone, G.floor, Math.round(G.player.x * 100), Math.round(G.player.z * 100)]') == where, 'revive no mesmo lugar e andar (%s)' % where)
    check(ev('[G.ch.exp, G.ch.gold]') == exp0, 'poção devolve EXP e Gold perdidos')
    check(ev("!G.ch.bag.some((x) => x.id === 'rez')"), 'poção consumida')
    ev("(G.player.invulnUntil = 0, 0)")

    # morte e renascimento
    ev("(G.hp = 1, 0)")
    ev("(D.G.player.alive && (function(){ const m = G.monsters.find((x) => !x.dead); })(), 0)")
    pg.evaluate("() => { const D = window.__FORJA_DEBUG; for (let i = 0; i < 50 && D.G.player.alive; i++) D.hurtPlayer(1e9, null); }")
    check(ev('!G.player.alive') and pg.is_visible('#modal'), 'morte mostra a tela de queda')
    check(not pg.is_visible('#btnRevive'), 'sem poção: só renascer na cidade')
    pg.click('#btnRespawn')
    check(ev('G.player.alive && G.zone === "town" && G.hp > 0'), 'renasce na cidade')

    # Torre Infinita: Guardião na cidade, só Gold/Jewels, chefe abre o portal para subir e o recorde fica salvo
    check(ev("G.npcs.some((n) => n.id === 'tower') && !!G.townTower"), 'Guardião da Torre e a torre na cidade')
    ev("D.enterTower(1)")
    check(ev("G.zone === 'tower' && G.floor === 1 && G.monsters.some((m) => m.boss)"), 'entra no andar 1 da torre com chefe')
    lv1 = ev("Math.min(...G.monsters.map((m) => m.level))")
    ev("(G.monsters.slice().forEach((m) => D.killMonster(m)), 0)")
    check(ev("G.loot.every((l) => l.type === 'gold' || l.type === 'jewel')"), 'torre só derruba Gold e Jewels (%s)' % ev("[...new Set(G.loot.map((l) => l.type))].join(',')"))
    check(ev("!!G.exitPortal && G.ch.towerBest >= 2"), 'chefe abre o portal e registra o recorde')
    ev("(D.G.loot.length = 0, G.exitPortal.onUse(), 0)")
    check(ev("G.zone === 'tower' && G.floor === 2") and ev("Math.min(...G.monsters.map((m) => m.level))") > lv1, 'sobe para o andar 2, mais difícil')
    ev("D.enterTown()")

    # trocas de zona repetidas: nada deve acumular
    counts = []
    for k in range(3):
        ev("D.enterDungeon('caves', 1)")
        ev("D.enterTower(%d)" % (1 + k * 5))
        ev("D.enterTown()")
        counts.append(ev('({ world: D.worldChildren(), overlay: document.getElementById("overlay").children.length, loot: G.loot.length, proj: G.projectiles.length })'))
    check(counts[0]['world'] == counts[-1]['world'] and counts[0]['overlay'] == counts[-1]['overlay'], 'trocas de zona não acumulam objetos %s' % json.dumps(counts))

    # voltar ao título pelo menu de pausa (com o portal T canalizando) e entrar de novo
    ev("D.enterDungeon('forest', 1)")
    pg.keyboard.press('t')
    check(ev('!!G.cast'), 'T inicia a canalização do portal')
    pg.keyboard.press('Escape')
    pg.click('[data-pause="title"]')
    check(ev('G.mode') == 'title' and pg.is_visible('#tSel'), 'volta ao título sem recarregar')
    check(pg.is_hidden('#hud'), 'HUD escondido no título')
    frames1 = ev('D.loopStats().frames')
    pg.click('[data-t="play"]')
    pg.wait_for_function('window.__FORJA_DEBUG.G.mode === "play"', timeout=60000)
    check(ev('G.ch.name') == 'Fumaca' and ev('G.allies.filter((a) => a.kind === "pet").length') == 1, 'entra de novo com um único pet')
    check(ev('G.cast === null') and pg.is_hidden('#castbar'), 'canalização não sobrevive à volta ao título')
    check(ev('G.dropLog.length') == 0, 'histórico de drops zerado na nova sessão')

    # laço único: em uma janela de tempo, o laço do jogo roda uma vez por requestAnimationFrame
    # (um segundo laço dobraria a contagem). Mede os dois em paralelo, no mesmo intervalo.
    ratio = pg.evaluate("""() => new Promise((res) => {
      const D = window.__FORJA_DEBUG, f0 = D.loopStats().frames; let n = 0; const t = performance.now();
      (function f() { n++; if (performance.now() - t < 4000) requestAnimationFrame(f); else res((D.loopStats().frames - f0) / n); })();
    })""")
    check(0.2 < ratio < 1.5, 'um único laço (quadros do jogo / rAF = %.2f)' % ratio)
    check(not ev('D.loopStats().errors.length'), 'nenhum erro capturado pelo laço')

    # redimensionar
    pg.set_viewport_size({'width': 420, 'height': 760})
    try: pg.wait_for_function('Math.abs(window.__FORJA_DEBUG.camera.aspect - 420 / 760) < 0.02', timeout=15000)
    except Exception: pass
    asp = ev('D.camera.aspect'); dist = ev('D.CAM.dist')
    check(abs(asp - 420 / 760) < 0.02 and dist == ev('D.CONFIG.camera.distNarrow'), 'redimensiona para tela estreita (aspecto %.3f, distância %s)' % (asp, dist))

    check(not external, 'nenhuma requisição externa %s' % external[:3])
    check(not errors, 'sem erros de página/console %s' % errors[:3])
    b.close()
srv.shutdown()
print('RESULTADO:', 'OK' if ok else 'FALHOU')
sys.exit(0 if ok else 1)
