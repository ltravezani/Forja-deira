#!/usr/bin/env python3
"""
Monta o jogo a partir de src/ (módulos ES) em dois formatos:

  dist/forja-deira.html  arquivo único e offline (Three.js, regras e módulos embutidos)
  (os modelos glTF de assets/models/ vão embutidos em base64; em dev ficam em dist/models.js)
  dist/dev.html     carrega src/main.js como módulo ES nativo (desenvolvimento;
                    servir a pasta do projeto por HTTP, ex.: python3 -m http.server)

Empacotador próprio (sem dependências): resolve `import { a, b } from './x.js'`,
ordena os módulos por dependência (mesma ordem de avaliação do navegador),
remove import/export e põe cada módulo numa função com escopo próprio
(só os nomes exportados ficam visíveis aos outros), tudo dentro de um escopo estrito. Falha o build se:
  - um import aponta para arquivo inexistente ou nome não exportado;
  - dois módulos exportam o mesmo nome, ou um módulo exporta `let`;
  - o resultado tem erro de sintaxe (checado com Node, se disponível).
"""
import base64, os, re, sys, json, subprocess

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
SRC = os.path.join(ROOT, 'src')
ENTRY = os.path.join(SRC, 'main.js')

IMPORT_RE = re.compile(r"^import\s*\{([^}]*)\}\s*from\s*'([^']+)';[ \t]*\n", re.M)
EXPORT_DECL_RE = re.compile(r'^export\s+(?=(?:async\s+)?function\b|const\b|let\b|class\b)', re.M)
TOP_DECL_RE = re.compile(r'^(?:export\s+)?(?:(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|class\s+([A-Za-z_$][\w$]*)|(?:const|let)\s+([A-Za-z_$][\w$]*))', re.M)


def rd(p):
    with open(p, encoding='utf-8') as f:
        return f.read()


def fail(msg):
    print('ERRO: ' + msg)
    sys.exit(1)


def top_names(code):
    """Nomes declarados na coluna 0 (convenção do projeto) + declarações múltiplas `const a = 1, b = 2`."""
    names = set()
    for m in TOP_DECL_RE.finditer(code):
        names.add(m.group(1) or m.group(2) or m.group(3))
    for m in re.finditer(r'^(?:export\s+)?(?:const|let)\s+[^\n;]*', code, re.M):
        # nomes extras após vírgulas no nível zero da mesma linha
        depth, buf = 0, ''
        for ch in m.group(0):
            if ch in '([{': depth += 1
            elif ch in ')]}': depth -= 1
            buf += ch if depth == 0 else ' '
        for part in buf.split(',')[1:]:
            mm = re.match(r'\s*([A-Za-z_$][\w$]*)\s*=', part)
            if mm: names.add(mm.group(1))
    return names


def load_graph():
    mods, order, state = {}, [], {}

    def visit(path, stack):
        path = os.path.normpath(path)
        if state.get(path) == 'done': return
        if state.get(path) == 'visiting': return  # ciclo: o navegador segue a mesma regra
        if not os.path.exists(path): fail('módulo inexistente: ' + os.path.relpath(path, ROOT) + ' (importado por ' + stack[-1] + ')')
        state[path] = 'visiting'
        code = rd(path)
        imps = []
        for m in IMPORT_RE.finditer(code):
            names = [n.strip() for n in m.group(1).split(',') if n.strip()]
            if any(' as ' in n for n in names): fail('`as` não suportado: ' + path)
            dep = os.path.normpath(os.path.join(os.path.dirname(path), m.group(2)))
            imps.append((dep, names))
        if re.search(r'^\s*import\s', IMPORT_RE.sub('', code), re.M) or re.search(r'^export\s+(default|\{|\*)', code, re.M):
            fail('forma de import/export não suportada em ' + os.path.relpath(path, ROOT))
        mods[path] = {'code': code, 'imports': imps}
        for dep, _ in imps:
            visit(dep, stack + [os.path.relpath(path, ROOT)])
        state[path] = 'done'
        order.append(path)

    visit(ENTRY, ['(entrada)'])
    return mods, order


def bundle():
    """Cada módulo vira uma função com escopo próprio; só os exports sobem para o escopo comum."""
    mods, order = load_graph()
    exports, owner = {}, {}
    for p in order:
        code = mods[p]['code']
        exports[p] = set()
        for m in re.finditer(r'^export\s+(.*)$', code, re.M):
            line = m.group(1)
            if re.match(r'let\b', line):
                fail('export let em %s: exporte uma função de acesso (o valor copiado não acompanharia reatribuições)' % os.path.relpath(p, ROOT))
            exports[p] |= top_names('export ' + line)
        for n in exports[p]:
            if n in owner: fail('export "%s" duplicado em %s e %s' % (n, os.path.relpath(owner[n], ROOT), os.path.relpath(p, ROOT)))
            owner[n] = p
    for p in order:
        for dep, names in mods[p]['imports']:
            for n in names:
                if n not in exports[dep]:
                    fail('%s importa "%s" de %s, que não o exporta' % (os.path.relpath(p, ROOT), n, os.path.relpath(dep, ROOT)))
    parts = []
    for p in order:
        code = IMPORT_RE.sub('', mods[p]['code'])
        code = EXPORT_DECL_RE.sub('', code).strip('\n')
        names = sorted(exports[p])
        rel = os.path.relpath(p, SRC)
        if names:
            parts.append('// ---- %s ----\nconst { %s } = (() => {\n%s\nreturn { %s };\n})();\n' % (rel, ', '.join(names), code, ', '.join(names)))
        else:
            parts.append('// ---- %s ----\n(() => {\n%s\n})();\n' % (rel, code))
    js = "(function () {\n'use strict';\n" + '\n'.join(parts) + '})();\n'
    return js, order


def models_js():
    """Modelos glTF (assets/models/*.glb, preparados por tools/prep_models.mjs) em base64: o jogo continua um arquivo só."""
    d = os.path.join(ROOT, 'assets', 'models')
    names = sorted(f for f in os.listdir(d) if f.endswith('.glb')) if os.path.isdir(d) else []
    parts = []
    for f in names:
        with open(os.path.join(d, f), 'rb') as fh: parts.append('%s:"%s"' % (json.dumps(f[:-4]), base64.b64encode(fh.read()).decode()))
    # o elemento sai do DOM depois de lido (o texto base64 é grande)
    return 'window.__FORJA_GLB = {' + ',\n'.join(parts) + '};\nif (document.currentScript) document.currentScript.remove();'


def main():
    shell = rd(os.path.join(SRC, 'shell.html'))
    if '<!--@@SCRIPTS@@-->' not in shell: fail('src/shell.html sem o marcador <!--@@SCRIPTS@@-->')
    js, order = bundle()
    three, rules = rd(os.path.join(ROOT, 'vendor/three.js')), rd(os.path.join(SRC, 'rules.js'))
    gltf, models = rd(os.path.join(ROOT, 'vendor/gltf.js')), models_js()
    for name, s in (('three.js', three), ('gltf.js', gltf), ('rules.js', rules), ('jogo', js)):
        if '</script' in s: fail(name + ' contém "</script" e quebraria o HTML embutido')
    scripts = ('<script>\n' + three + '\n</script>\n<script>\n' + gltf + '\n</script>\n<script>\n' + models + '\n</script>\n'
               '<script>\n' + rules + '\n</script>\n<script>\n' + js + '</script>\n')
    os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
    out = shell.replace('<!--@@SCRIPTS@@-->', scripts)
    with open(os.path.join(ROOT, 'dist/forja-deira.html'), 'w', encoding='utf-8') as f: f.write(out)
    with open(os.path.join(ROOT, 'dist/models.js'), 'w', encoding='utf-8') as f: f.write(models)
    dev = shell.replace('<!--@@SCRIPTS@@-->', '<script src="../vendor/three.js"></script>\n<script src="../vendor/gltf.js"></script>\n<script src="models.js"></script>\n'
                        '<script src="../src/rules.js"></script>\n<script type="module" src="../src/main.js"></script>\n')
    with open(os.path.join(ROOT, 'dist/dev.html'), 'w', encoding='utf-8') as f: f.write(dev)
    print('dist/forja-deira.html %d KB · %d módulos' % (len(out.encode()) // 1024, len(order)))
    # checagem de sintaxe com o Node (opcional: o build não depende dele)
    try:
        chk = subprocess.run(['node', '-e', 'try{new Function(require("fs").readFileSync(0,"utf8"))}catch(e){console.log(e.message);process.exit(1)}'], input=js, capture_output=True, text=True)
        if chk.returncode: fail('sintaxe: ' + chk.stdout.strip())
        print('sintaxe ok')
    except FileNotFoundError:
        print('node ausente: checagem de sintaxe pulada')


if __name__ == '__main__':
    main()
