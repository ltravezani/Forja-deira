#!/usr/bin/env python3
"""
Converte modelos do KayKit Forest Nature Pack (glTF + forest_texture.png) para
src/art/natureData.js: geometria compacta em base64 com a cor da textura
gravada por vértice (a textura é só uma paleta em degradê), para os adereços
do kit (instancing, um material só, sem carregar textura nem GLTFLoader).

Uso: python3 tools/prep_nature.py <pasta Assets/gltf> [nomes...]
Formato por modelo: [escala xyz, centro xyz, nVerts, nIdx, base64(pos int16 | nor int8 | cor uint8 | idx uint16)]
"""
import base64, json, os, struct, sys
from PIL import Image

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
SRC = sys.argv[1]
NAMES = sys.argv[2:] or sorted(f[:-len('_Color1.gltf')] for f in os.listdir(SRC) if f.endswith('_Color1.gltf'))
tex = Image.open(os.path.join(SRC, 'forest_texture.png')).convert('RGB')
TW, TH = tex.size
CT = {5126: ('f', 4), 5123: ('H', 2), 5125: ('I', 4), 5121: ('B', 1)}

def acc(j, buf, i):
    a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]
    fmt, sz = CT[a['componentType']]; n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0); stride = bv.get('byteStride', sz * n)
    return [struct.unpack_from('<%d%s' % (n, fmt), buf, off + k * stride) for k in range(a['count'])]

out = {}
for name in NAMES:
    j = json.load(open(os.path.join(SRC, name + '_Color1.gltf')))
    buf = open(os.path.join(SRC, j['buffers'][0]['uri']), 'rb').read()
    P, N, C, I = [], [], [], []
    for m in j['meshes']:
        for p in m['primitives']:
            base = len(P)
            pos, nor, uv = acc(j, buf, p['attributes']['POSITION']), acc(j, buf, p['attributes']['NORMAL']), acc(j, buf, p['attributes']['TEXCOORD_0'])
            P += pos; N += nor
            for u, v in uv:
                C.append(tex.getpixel((min(TW - 1, max(0, int(u * TW))), min(TH - 1, max(0, int(v * TH))))))
            I += [k[0] + base for k in acc(j, buf, p['indices'])]
    lo = [min(p[k] for p in P) for k in range(3)]; hi = [max(p[k] for p in P) for k in range(3)]
    ctr = [(a + b) / 2 for a, b in zip(lo, hi)]; sc = [max(1e-6, (b - a) / 2) for a, b in zip(lo, hi)]
    b = bytearray()
    for p in P: b += struct.pack('<3h', *[round((p[k] - ctr[k]) / sc[k] * 32767) for k in range(3)])
    for n in N: b += struct.pack('<3b', *[max(-127, min(127, round(n[k] * 127))) for k in range(3)])
    for c in C: b += bytes(c)
    if len(b) % 2: b += b'\0'
    for i in I: b += struct.pack('<H', i)
    out[name] = [[round(s, 5) for s in sc], [round(c, 5) for c in ctr], len(P), len(I), base64.b64encode(bytes(b)).decode()]
    print('%-26s %5d verts %5d tris %6d bytes' % (name, len(P), len(I) // 3, len(b)))

js = ('// GERADO por tools/prep_nature.py a partir do KayKit Forest Nature Pack (CC0, Kay Lousberg). Não editar.\n'
      'export const NATURE = ' + json.dumps(out, separators=(',', ':')) + ';\n')
open(os.path.join(ROOT, 'src/art/natureData.js'), 'w').write(js)
print('src/art/natureData.js: %d modelos, %d bytes' % (len(out), len(js)))
