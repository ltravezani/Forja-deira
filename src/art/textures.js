// =============================================================================
// ARTE: texturas procedurais, materiais e modelos (personagens e monstros)
// Tudo é gerado em código: nenhuma imagem ou modelo externo.
// Estilo: cartoon de fantasia sombria, texturas "pintadas" (formas grandes, juntas escuras, bisel claro).
// =============================================================================
import { R } from '../core/util.js';

// ---------- ruído tileável ----------
export function hash2(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Ruído de valor tileável com período `per` (células). */
export function vnoise(x, y, per, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const w = (a) => ((a % per) + per) % per;
  const a = hash2(w(xi), w(yi), s), b = hash2(w(xi + 1), w(yi), s), c = hash2(w(xi), w(yi + 1), s), d = hash2(w(xi + 1), w(yi + 1), s);
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
/** fbm tileável: u,v em [0,1). */
export function fbm(u, v, base, oct, s) {
  let f = 0, amp = 0.5, per = base;
  for (let o = 0; o < oct; o++) { f += vnoise(u * per, v * per, per, s + o * 17) * amp; per *= 2; amp *= 0.5; }
  return f / (1 - Math.pow(0.5, oct));
}
/** Voronoi tileável: devolve [d1, d2, id] do ponto mais próximo. */
function voronoiSet(n, s, jitter) {
  const pts = [];
  const g = Math.ceil(Math.sqrt(n));
  for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) {
    if (pts.length >= n) break;
    pts.push([(i + 0.5 + (hash2(i, j, s) - 0.5) * jitter) / g, (j + 0.5 + (hash2(i, j, s + 9) - 0.5) * jitter) / g, hash2(i, j, s + 31)]);
  }
  return pts;
}
/** Voronoi tileável: [d1, d2, id, dx, dy] — (dx, dy) vai do centro da célula ao ponto. */
function voronoi(pts, u, v, sx, sy) {
  let d1 = 9, d2 = 9, id = 0, bx = 0, by = 0;
  for (const p of pts) {
    let dx = u - p[0], dy = v - p[1];
    if (dx > 0.5) dx -= 1; else if (dx < -0.5) dx += 1;
    if (dy > 0.5) dy -= 1; else if (dy < -0.5) dy += 1;
    const d = Math.sqrt(dx * dx * (sx || 1) + dy * dy * (sy || 1));
    if (d < d1) { d2 = d1; d1 = d; id = p[2]; bx = dx; by = dy; } else if (d < d2) d2 = d;
  }
  return [d1, d2, id, bx, by];
}

// ---------- geração de texturas (cor + normal + opcional emissivo) ----------
const TEXS = {};
const hexRGB = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
/**
 * gen(u, v) → { h: altura 0..1, c: [r,g,b] 0..255, e: emissivo 0..1 (opcional), r: rugosidade }
 * Gera mapa de cor (sRGB), normal (a partir da altura) e emissivo.
 */
export function makeTexSet(key, size, gen, opt) {
  if (TEXS[key]) return TEXS[key];
  opt = opt || {};
  const N = size, H = new Float32Array(N * N);
  const col = new Uint8ClampedArray(N * N * 4), em = opt.emissive ? new Uint8ClampedArray(N * N * 4) : null;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const r = gen(x / N, y / N);
    const i = y * N + x;
    H[i] = r.h;
    col[i * 4] = r.c[0]; col[i * 4 + 1] = r.c[1]; col[i * 4 + 2] = r.c[2]; col[i * 4 + 3] = r.a != null ? r.a : 255;
    if (em) { const e = Math.max(0, Math.min(1, r.e || 0)); em[i * 4] = e * 255; em[i * 4 + 1] = e * 120; em[i * 4 + 2] = e * 40; em[i * 4 + 3] = 255; }
  }
  const nrm = new Uint8ClampedArray(N * N * 4), k = opt.bump != null ? opt.bump : 3;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const hx = H[y * N + ((x + 1) % N)] - H[y * N + ((x - 1 + N) % N)];
    const hy = H[((y + 1) % N) * N + x] - H[((y - 1 + N) % N) * N + x];
    let nx = -hx * k, ny = hy * k, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * N + x) * 4;
    nrm[i] = (nx * 0.5 + 0.5) * 255; nrm[i + 1] = (ny * 0.5 + 0.5) * 255; nrm[i + 2] = (nz * 0.5 + 0.5) * 255; nrm[i + 3] = 255;
  }
  const tex = (data, srgb) => {
    const c = document.createElement('canvas'); c.width = c.height = N;
    c.getContext('2d').putImageData(new ImageData(data, N, N), 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const set = { key, map: tex(col, true), normalMap: tex(nrm, false), emissiveMap: em ? tex(em, true) : null, alpha: !!opt.alpha };
  TEXS[key] = set;
  return set;
}
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const sat = (x) => Math.max(0, Math.min(1, x));

// ---------- texturas "pintadas" (estilo cartoon) ----------
// Formas grandes e legíveis, cor quase chapada por peça, juntas escuras e
// grossas, bisel claro no lado da luz (topo/esquerda da textura) e sombra no
// lado oposto. Pouco ruído fino: o detalhe vem das formas, não do grão.
/** Varia matiz/brilho de uma cor base por peça (id 0..1). */
const vary = (c, id, amt) => { const k = 1 + (id - 0.5) * amt; const w = (id * 7.31) % 1; return [c[0] * k * (0.96 + w * 0.08), c[1] * k, c[2] * k * (1.04 - w * 0.08)]; };
/** Bisel pintado: dir = direção do centro da peça ao pixel (normalizada), b = 0 na borda .. 1 no miolo. */
function bevelShade(dx, dy, b) {
  const l = Math.hypot(dx, dy) || 1;
  const facing = (-dx / l) * 0.55 + (-dy / l) * 0.85; // luz vinda de cima/esquerda na textura
  const rim = 1 - sat(b);
  return 1 + facing * rim * 0.42;
}

/**
 * Pedras (calçamento) ou lajes (pal.slabs). pal: {stone, stone2, mortar, moss, mossAmt, n, slabs, rows, gap}
 */
export function texStones(key, pal) {
  const pts = voronoiSet(pal.n || 36, R.hash32(key), 0.85);
  const S = hexRGB(pal.stone), S2 = hexRGB(pal.stone2 || pal.stone), M = hexRGB(pal.mortar), MO = hexRGB(pal.moss || 0x5a7a2a);
  const sd = R.hash32(key + 'n');
  const rows = pal.rows || 4;
  const rowH = [], rowY = [0];
  for (let r = 0; r < rows; r++) rowH.push(0.75 + hash2(r, 1, sd) * 0.5);
  const tot = rowH.reduce((a, b) => a + b, 0);
  for (let r = 0; r < rows; r++) rowY.push(rowY[r] + rowH[r] / tot);
  const gap = pal.gap || (pal.slabs ? 0.012 : 0.016);
  return makeTexSet(key, 256, (u, v) => {
    const n = fbm(u, v, 5, 3, sd);
    let edge, id, dx, dy, bw;
    if (pal.slabs) {
      let r = 0; while (r < rows - 1 && v >= rowY[r + 1]) r++;
      const o = hash2(r, 2, sd);
      const cuts = [0, 0.3 + hash2(r, 3, sd) * 0.1, 0.62 + hash2(r, 4, sd) * 0.12, 1];
      const uu = ((u + o) % 1 + 1) % 1;
      let c = 0; while (c < 2 && uu >= cuts[c + 1]) c++;
      const w = cuts[c + 1] - cuts[c], hgt = rowY[r + 1] - rowY[r];
      const fx = (uu - cuts[c]) / w, fy = (v - rowY[r]) / hgt;
      edge = Math.min(Math.min(fx, 1 - fx) * w, Math.min(fy, 1 - fy) * hgt) + (n - 0.5) * 0.008;
      id = hash2(r, c, sd + 1); dx = (fx - 0.5) * w; dy = (fy - 0.5) * hgt; bw = 0.03;
    } else {
      const vr = voronoi(pts, u, v);
      edge = (vr[1] - vr[0]) * 0.5 + (n - 0.5) * 0.01; id = vr[2]; dx = vr[3]; dy = vr[4]; bw = 0.028;
    }
    if (edge < gap) {
      const m = mul3(M, 0.8 + n * 0.3);
      const mo = pal.mossAmt && fbm(u, v, 3, 3, sd + 3) > 1 - pal.mossAmt;
      return { h: 0.02, c: mo ? mul3(MO, 0.75 + n * 0.3) : m };
    }
    const b = sat((edge - gap) / bw);
    const round = 1 - (1 - b) * (1 - b);
    let c = vary(mix3(S, S2, id), id, 0.25);
    c = mul3(c, (0.9 + n * 0.16) * bevelShade(dx, dy, b));
    // lascas e manchas grandes (poucas)
    const sp = fbm(u, v, 3, 2, sd + 11);
    if (sp > 0.72) c = mul3(c, 0.88);
    const cr = Math.abs(fbm(u, v, 4, 2, sd + 7) - 0.5);
    let h = 0.45 + round * 0.55;
    if (cr < 0.01 && b > 0.5 && id > 0.55) { c = mul3(c, 0.55); h -= 0.25; }
    if (pal.mossAmt && b < 0.35 && fbm(u, v, 3, 3, sd + 3) > 1 - pal.mossAmt * 0.7) c = mix3(c, MO, 0.55);
    return { h, c };
  }, { bump: pal.bump || 3 });
}
/** Tijolos/blocos de pedra para paredes (grandes, com bisel). */
export function texBricks(key, pal) {
  const B = hexRGB(pal.brick), B2 = hexRGB(pal.brick2 || pal.brick), M = hexRGB(pal.mortar), MO = hexRGB(pal.moss || 0x4a6a24);
  const sd = R.hash32(key);
  const rows = pal.rows || 5, cols = pal.cols || 3;
  return makeTexSet(key, 256, (u, v) => {
    const ry = Math.floor(v * rows), fy = v * rows - ry;
    const off = (ry % 2) * 0.5 + hash2(ry, 0, sd) * 0.15;
    const ux = u * cols + off, rx = Math.floor(ux), fx = ux - rx;
    const bid = hash2(((rx % cols) + cols) % cols, ry, sd);
    const n = fbm(u, v, 6, 3, sd + 1);
    const ex = Math.min(fx, 1 - fx) / cols, ey = Math.min(fy, 1 - fy) / rows + (n - 0.5) * 0.006;
    const e = Math.min(ex, ey);
    const mg = 0.012;
    if (e < mg) return { h: 0.05, c: mul3(M, 0.85 + n * 0.3) };
    const b = sat((e - mg) / 0.03);
    let c = vary(mix3(B, B2, bid), bid, 0.3);
    c = mul3(c, (0.9 + n * 0.16) * bevelShade((fx - 0.5) / cols, (fy - 0.5) / rows, b));
    const chip = fbm(u, v, 5, 2, sd + 5);
    let h = 0.5 + (1 - (1 - b) * (1 - b)) * 0.5;
    if (chip > 0.74) { c = mul3(c, 0.8); h -= 0.2; }
    const mo = fbm(u, v, 2, 3, sd + 9) * (1 - v * 0.5);
    if (pal.mossAmt && mo > 1 - pal.mossAmt) c = mix3(c, MO, sat((mo - (1 - pal.mossAmt)) * 5) * 0.8);
    return { h, c };
  }, { bump: 3.5 });
}
/** Terra/grama pintada: manchas grandes, tufos em pinceladas e pedrinhas com brilho. */
export function texGround(key, pal) {
  const A = hexRGB(pal.a), Bc = hexRGB(pal.b), Cc = hexRGB(pal.c || pal.b);
  const sd = R.hash32(key);
  const pts = voronoiSet(pal.pebN || 10, sd + 4, 1);
  const tuft = voronoiSet(24, sd + 8, 1);
  return makeTexSet(key, 256, (u, v) => {
    const n = fbm(u, v, 3, 3, sd), n2 = fbm(u, v, 8, 2, sd + 2);
    const t = sat((n - 0.45) * 5);
    let c = mix3(A, Bc, t);
    c = mul3(c, 0.9 + n2 * 0.18);
    let h = 0.35 + n2 * 0.2;
    if (pal.blades) {
      // tufos: pinceladas curtas em leque, mais claras em cima
      const [d, , id, dx, dy] = voronoi(tuft, u, v);
      const ang = Math.atan2(dy, dx), blade = Math.abs(Math.sin(ang * 3 + id * 6));
      const r = 0.04 * (0.6 + id * 0.6);
      if (d < r * (0.55 + blade * 0.45) && dy < 0.004) {
        const k = 1 - d / r;
        c = mix3(c, mul3(pal.bladeCol ? hexRGB(pal.bladeCol) : mul3(A, 1.6), 0.85 + k * 0.35), 0.85); h = 0.6 + k * 0.3;
      }
    }
    if (pal.pebbles !== false) {
      const [d1, , id, dx, dy] = voronoi(pts, u, v);
      const r = 0.012 + id * 0.016;
      if (d1 < r) { const b = 1 - d1 / r; c = mul3(vary(Cc, id, 0.3), 0.9 * bevelShade(dx, dy, b * 1.4)); h = 0.6 + b * 0.4; }
      else if (d1 < r + 0.006 && dy > 0) c = mul3(c, 0.7); // sombra projetada da pedrinha
    }
    return { h, c };
  }, { bump: 2 });
}
/** Tábuas de madeira pintadas. */
export function texPlanks(key, pal) {
  const W = hexRGB(pal.wood), W2 = hexRGB(pal.wood2 || pal.wood);
  const sd = R.hash32(key), n = pal.n || 4;
  return makeTexSet(key, 256, (u, v) => {
    const pi = Math.floor(u * n), fx = u * n - pi;
    const pid = hash2(pi, 0, sd);
    const edge = Math.min(fx, 1 - fx);
    if (edge < 0.035) return { h: 0, c: mul3(W2, 0.35) };
    // veios longos e poucos, desenhados como linhas
    const g = vnoise(fx * 3 + pid * 7, v * 6 + pid * 13, 6, sd + 1);
    const line = Math.abs(Math.sin((fx * 5 + g * 2.2) * Math.PI));
    let c = vary(mix3(W, W2, pid), pid, 0.25);
    c = mul3(c, (line < 0.12 ? 0.8 : 1) * (1 + (0.5 - fx) * 0.18));
    const endY = ((v + pid) % 1);
    if (endY < 0.015) return { h: 0.1, c: mul3(W2, 0.35) };
    const nail = Math.hypot((fx - 0.5) * 3, ((v * 3 + pid) % 1) - 0.06);
    if (nail < 0.06) return { h: 0.9, c: [90, 86, 80] };
    return { h: 0.6 + (line < 0.12 ? -0.15 : 0), c };
  }, { bump: 2.5 });
}
/** Telhas (telhado) arredondadas, em fileiras. */
export function texShingles(key, pal) {
  const A = hexRGB(pal.a), Bc = hexRGB(pal.b);
  const sd = R.hash32(key);
  return makeTexSet(key, 256, (u, v) => {
    const rows = 7, ry = Math.floor(v * rows), fy = v * rows - ry;
    const off = (ry % 2) * 0.5, ux = u * 5 + off, rx = Math.floor(ux), fx = ux - rx;
    const id = hash2(((rx % 5) + 5) % 5, ry, sd);
    const arc = Math.sqrt(sat(1 - Math.pow((fx - 0.5) * 2, 2)));
    const inside = fy < 0.25 + arc * 0.75;
    if (!inside || Math.min(fx, 1 - fx) < 0.03) return { h: 0.05, c: mul3(Bc, 0.35) };
    const shade = 0.75 + fy * 0.35 + (0.5 - Math.abs(fx - 0.5)) * 0.2;
    return { h: 0.4 + fy * 0.6, c: mul3(vary(mix3(A, Bc, id), id, 0.25), shade) };
  }, { bump: 3 });
}
/** Rocha facetada (cavernas, penhascos, obsidiana): facetas chapadas com fendas (opcionalmente incandescentes). */
export function texRock(key, pal) {
  const A = hexRGB(pal.a), Bc = hexRGB(pal.b);
  const sd = R.hash32(key);
  const pts = voronoiSet(pal.n || 22, sd + 1, 1);
  return makeTexSet(key, 256, (u, v) => {
    const n = fbm(u, v, 4, 3, sd);
    const [d1, d2, id, dx, dy] = voronoi(pts, u, v);
    const edge = (d2 - d1) * 0.5 + (n - 0.5) * 0.01;
    const crackW = pal.glow ? 0.006 : 0.007;
    if (edge < crackW) {
      const k = 1 - edge / crackW;
      return { h: 0, c: pal.glow ? [60, 18, 8] : mul3(A, pal.soft ? 0.65 : 0.5), e: pal.glow ? (0.5 + k * 0.5) * (fbm(u, v, 3, 2, sd + 5) > 0.55 ? 1 : 0) : 0 };
    }
    const b = sat((edge - crackW) / 0.05);
    // faceta: plano inclinado por célula (cor chapada com leve degradê)
    const tilt = (hash2(Math.floor(id * 999), 1, sd) - 0.5) * 2;
    let c = vary(mix3(A, Bc, id), id, pal.soft ? 0.2 : 0.35);
    const bev = pal.soft ? 0.45 : 1;
    c = mul3(c, (0.92 + n * 0.14) * (1 + (bevelShade(dx, dy, b) - 1) * bev) * (1 + tilt * (dx + dy) * 3 * bev));
    return { h: 0.4 + b * 0.6, c, e: 0 };
  }, { bump: 4, emissive: !!pal.glow });
}
/** Sujeira/desgaste genérico para adereços (multiplicado pela cor do vértice). */
// ---------- texturas de detalhe para criaturas ----------
// Tons de cinza claros (multiplicados pela cor do material) + mapa normal: dão
// poros, pelos, placas, tramas e arranhões sem mudar a paleta de cada monstro.
const g3 = (g) => { g = Math.max(0, Math.min(255, g)); return [g, g, g]; };
const DETAIL = {
  /** pele: poros finos e rugas suaves */
  skin: (sd) => (u, v) => {
    const n = fbm(u, v, 8, 4, sd), pore = vnoise(u * 96, v * 96, 96, sd + 1);
    const wr = 1 - Math.abs(fbm(u, v, 3, 3, sd + 2) * 2 - 1);
    const w = sat((wr - 0.86) * 8);
    return { h: n * 0.5 - (pore > 0.78 ? 0.25 : 0) - w * 0.3, c: g3(200 + n * 50 - (pore > 0.78 ? 28 : 0) - w * 40) };
  },
  /** pelagem: fios alongados em camadas */
  fur: (sd) => (u, v) => {
    const s1 = vnoise(u * 64, v * 6, 64, sd), s2 = vnoise(u * 128, v * 10, 128, sd + 3), n = fbm(u, v, 4, 3, sd + 5);
    const k = s1 * 0.6 + s2 * 0.4;
    return { h: k, c: g3(135 + k * 110 + (n - 0.5) * 40) };
  },
  /** quitina / escamas: placas com bordas escuras e brilho no centro */
  scale: (sd) => {
    const pts = voronoiSet(64, sd, 0.85);
    return (u, v) => {
      const vr = voronoi(pts, u, v), edge = sat((vr[1] - vr[0]) * 28), n = fbm(u, v, 12, 3, sd + 1);
      return { h: edge * 0.8 + n * 0.2, c: g3(120 + edge * 110 + vr[2] * 20 + (n - 0.5) * 30) };
    };
  },
  /** metal: escovado, com arranhões e amassados */
  metal: (sd) => (u, v) => {
    const br = vnoise(u * 3, v * 128, 128, sd), dent = fbm(u, v, 6, 3, sd + 1);
    const sc = vnoise(u * 40 + v * 12, v * 3, 40, sd + 2), scratch = sc > 0.93 ? (sc - 0.93) * 12 : 0;
    return { h: dent * 0.5 - scratch * 0.4, c: g3(215 + br * 12 + (dent - 0.5) * 30 + scratch * 40) };
  },
  /** tecido: trama cruzada + manchas de desgaste */
  cloth: (sd) => (u, v) => {
    const wu = Math.sin(u * Math.PI * 2 * 48), wv = Math.sin(v * Math.PI * 2 * 48);
    const weave = (wu > 0) !== (wv > 0) ? Math.abs(wu) : Math.abs(wv);
    const n = fbm(u, v, 5, 4, sd);
    return { h: weave * 0.4 + n * 0.3, c: g3(150 + weave * 45 + n * 60) };
  },
  /** couro: grão e vincos */
  leather: (sd) => (u, v) => {
    const n = fbm(u, v, 16, 4, sd), cr = 1 - Math.abs(fbm(u, v, 4, 3, sd + 1) * 2 - 1), c = sat((cr - 0.9) * 10);
    return { h: n * 0.6 - c * 0.5, c: g3(160 + n * 70 - c * 50) };
  },
  /** osso: fissuras e pequenos furos */
  bone: (sd) => (u, v) => {
    const n = fbm(u, v, 6, 4, sd), r = 1 - Math.abs(fbm(u, v, 5, 4, sd + 1) * 2 - 1);
    const crack = sat((r - 0.93) * 14), pit = vnoise(u * 72, v * 72, 72, sd + 2) > 0.84 ? 1 : 0;
    return { h: n * 0.5 - crack * 0.6 - pit * 0.25, c: g3(205 + n * 45 - crack * 90 - pit * 25) };
  },
  /** pedra: grão, lascas e fissuras (gárgulas) */
  stone: (sd) => (u, v) => {
    const n = fbm(u, v, 6, 5, sd), r = 1 - Math.abs(fbm(u, v, 4, 4, sd + 1) * 2 - 1), crack = sat((r - 0.9) * 10);
    return { h: n * 0.7 - crack * 0.5, c: g3(150 + n * 90 - crack * 70) };
  },
  /** membrana (asas): veias ramificadas */
  membrane: (sd) => (u, v) => {
    const r = 1 - Math.abs(fbm(u, v, 3, 4, sd) * 2 - 1), vein = sat((r - 0.88) * 9), n = fbm(u, v, 10, 3, sd + 1);
    return { h: vein * 0.7, c: g3(170 + n * 50 - vein * 70) };
  },
};
/** Conjunto de textura de detalhe (cor cinza + normal), gerado uma vez por tipo. */
export function texDetail(kind) {
  const base = (DETAIL[kind] || DETAIL.skin)(R.hash32('detail', kind));
  // estilo pintado: contraste comprimido (o material mantém a cor chapada, o detalhe só sugere a superfície)
  const gen = (u, v) => { const r = base(u, v); r.c = r.c.map((x) => 255 - (255 - x) * 0.55); return r; };
  const set = makeTexSet('detail_' + kind, 256, gen, { bump: kind === 'cloth' ? 2 : kind === 'metal' ? 1.5 : 3.5 });
  const rep = DETAIL_REPEAT[kind] || 1;
  set.map.repeat.set(rep, rep); set.normalMap.repeat.set(rep, rep);
  return set;
}
/** Repetições do detalhe sobre as UVs 0–1 das primitivas (mais = grão mais fino). */
const DETAIL_REPEAT = { skin: 2, fur: 2, scale: 2, metal: 1, cloth: 3, leather: 2, bone: 1, membrane: 1, stone: 1 };
export function texGrime() {
  const sd = 991;
  return makeTexSet('grime', 128, (u, v) => {
    const n = fbm(u, v, 8, 4, sd), sc = vnoise(u * 64, v * 6, 64, sd + 1);
    const g = 205 + n * 50 - (sc > 0.8 ? 18 : 0); // desgaste leve: a cor do adereço continua chapada
    return { h: n * 0.7 + (sc > 0.8 ? -0.2 : 0), c: [g, g, g] };
  }, { bump: 2 });
}
/** Decalques com alfa (sangue, rachadura, musgo, teia). */
export function texDecal(kind) {
  const key = 'decal_' + kind, sd = R.hash32(key);
  return makeTexSet(key, 128, (u, v) => {
    const dx = u - 0.5, dy = v - 0.5, d = Math.hypot(dx, dy) * 2, a0 = Math.atan2(dy, dx);
    const n = fbm(u, v, 6, 4, sd);
    if (kind === 'blood') { const r = 0.55 + n * 0.45 + Math.sin(a0 * 7 + sd) * 0.08; const a = sat((r - d) * 5); const drops = hash2(Math.floor(u * 24), Math.floor(v * 24), sd) > 0.965 && d < 1 ? 0.9 : 0; return { h: 0.5, c: [70 + n * 30, 6, 6], a: Math.max(a, drops) * 215 }; }
    if (kind === 'moss') { const a = sat((0.7 + n * 0.5 - d) * 3) * sat(n * 2 - 0.4); return { h: n, c: [40 + n * 40, 62 + n * 50, 22], a: a * 230 }; }
    if (kind === 'crack') { const r = Math.abs(fbm(u, v, 4, 3, sd + 1) - 0.5); const a = sat((0.03 - r) * 40) * sat(1 - d); return { h: 0, c: [10, 8, 8], a: a * 230 }; }
    if (kind === 'web') { const ring = Math.abs(Math.sin(d * 24)) < 0.08; const spoke = Math.abs(Math.sin(a0 * 5)) < 0.03; const a = (ring || spoke) && d < 0.95 ? (1 - d) * 0.9 + 0.2 : 0; return { h: 0.5, c: [210, 210, 215], a: a * 200 }; }
    if (kind === 'rune') { // círculo rúnico: dois anéis, glifos entre eles e uma estrela no meio
      const ring = sat(1 - Math.abs(d - 0.92) * 40) + sat(1 - Math.abs(d - 0.7) * 50);
      const seg = Math.floor(((a0 + Math.PI) / (Math.PI * 2)) * 16), f = ((a0 + Math.PI) / (Math.PI * 2)) * 16 - seg;
      const glyph = d > 0.74 && d < 0.88 && f > 0.25 && f < 0.75 && hash2(seg, Math.floor(d * 20), sd) > 0.35 ? 0.9 : 0;
      const star = d < 0.68 && Math.abs(Math.sin(a0 * 2.5 + 0.3)) * d < 0.03 ? 0.8 : 0;
      return { h: 0.5, c: [255, 255, 255], a: Math.min(1, ring + glyph + star) * sat((1 - d) * 20) * 230 };
    }
    if (kind === 'ash') { const a = sat((0.8 - d) * 2) * n; return { h: 0, c: [25, 22, 20], a: a * 200 }; }
    return { h: 0, c: [0, 0, 0], a: 0 };
  }, { bump: 1, alpha: true });
}
