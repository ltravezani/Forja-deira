#!/usr/bin/env python3
"""
Converte modelos do KayKit Dungeon Pack (glTF + dungeon_texture.png) para
src/art/dungeonData.js: geometria compacta em base64 com a cor da textura
gravada por vértice (a textura é só uma paleta em degradê), para os adereços
do kit (instancing, um material só, sem carregar textura nem GLTFLoader).

Uso: python3 tools/prep_dungeon.py <pasta Assets/gltf> [nomes...]
Formato por modelo: [escala xyz, centro xyz, nVerts, nIdx, base64(pos int16 | nor int8 | cor uint8 | idx uint16)]
"""
import base64, json, math, os, struct, sys
from PIL import Image

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
SRC = sys.argv[1]
NAMES = sys.argv[2:] or sorted(f[:-5] for f in os.listdir(SRC) if f.endswith('.gltf'))
tex = Image.open(os.path.join(SRC, 'dungeon_texture.png')).convert('RGB')
TW, TH = tex.size
CT = {5126: ('f', 4), 5123: ('H', 2), 5125: ('I', 4), 5121: ('B', 1)}

def acc(j, buf, i):
    a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]
    fmt, sz = CT[a['componentType']]; n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0); stride = bv.get('byteStride', sz * n)
    return [struct.unpack_from('<%d%s' % (n, fmt), buf, off + k * stride) for k in range(a['count'])]

def qrot(q, v):
    x, y, z, w = q; vx, vy, vz = v
    tx, ty, tz = 2 * (y * vz - z * vy), 2 * (z * vx - x * vz), 2 * (x * vy - y * vx)
    return (vx + w * tx + y * tz - z * ty, vy + w * ty + z * tx - x * tz, vz + w * tz + x * ty - y * tx)

out = {}
for name in NAMES:
    j = json.load(open(os.path.join(SRC, name + '.gltf')))
    buf = open(os.path.join(SRC, j['buffers'][0]['uri']), 'rb').read()
    P, N, C, I = [], [], [], []
    def walk(ni, xf):
        nd = j['nodes'][ni]
        t, r, s = nd.get('translation', [0, 0, 0]), nd.get('rotation', [0, 0, 0, 1]), nd.get('scale', [1, 1, 1])
        f = lambda v: xf(tuple(a + b for a, b in zip(qrot(r, [v[k] * s[k] for k in range(3)]), t)))
        fn = lambda n: xf(qrot(r, n), True)
        if 'mesh' in nd:
            for p in j['meshes'][nd['mesh']]['primitives']:
                base = len(P)
                pos, nor, uv = acc(j, buf, p['attributes']['POSITION']), acc(j, buf, p['attributes']['NORMAL']), acc(j, buf, p['attributes']['TEXCOORD_0'])
                P.extend(f(v) for v in pos); N.extend(fn(n) for n in nor)
                for u, v in uv:
                    C.append(tex.getpixel((min(TW - 1, max(0, int(u * TW))), min(TH - 1, max(0, int(v * TH))))))
                I.extend(k[0] + base for k in acc(j, buf, p['indices']))
        for c in nd.get('children', []):
            walk(c, lambda v, isn=False, f=f, fn=fn: fn(v) if isn else f(v))
    for root in j['scenes'][0]['nodes']: walk(root, lambda v, isn=False: v)
    lo = [min(p[k] for p in P) for k in range(3)]; hi = [max(p[k] for p in P) for k in range(3)]
    ctr = [(a + b) / 2 for a, b in zip(lo, hi)]; sc = [max(1e-6, (b - a) / 2) for a, b in zip(lo, hi)]
    b = bytearray()
    for p in P: b += struct.pack('<3h', *[round((p[k] - ctr[k]) / sc[k] * 32767) for k in range(3)])
    for n in N:
        l = math.sqrt(sum(x * x for x in n)) or 1
        b += struct.pack('<3b', *[max(-127, min(127, round(n[k] / l * 127))) for k in range(3)])
    for c in C: b += bytes(c)
    if len(b) % 2: b += b'\0'
    for i in I: b += struct.pack('<H', i)
    out[name] = [[round(s, 5) for s in sc], [round(c, 5) for c in ctr], len(P), len(I), base64.b64encode(bytes(b)).decode()]
    print('%-34s %5d verts %5d tris %6d bytes' % (name, len(P), len(I) // 3, len(b)))

js = ('// GERADO por tools/prep_dungeon.py a partir do KayKit Dungeon Pack (CC0, Kay Lousberg). Não editar.\n'
      'export const DUNGEON = ' + json.dumps(out, separators=(',', ':')) + ';\n')
open(os.path.join(ROOT, 'src/art/dungeonData.js'), 'w').write(js)
print('src/art/dungeonData.js: %d modelos, %d bytes' % (len(out), len(js)))
