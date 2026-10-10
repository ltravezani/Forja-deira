// ---------- minimapa ----------
import { allPortals, G } from '../core/state.js';
import { $, R, TILE } from '../core/util.js';
import { questTargetPos } from './questUi.js';

const MM = 10;
let mmBase = document.createElement('canvas');
/** Paleta por região: chão, borda clara do chão (parede) e pedra da parede. */
const PAL = {
  town: ['#5f6e4c', '#d8c48a', '#2c2a24'],
  forest: ['#3f5a36', '#b8d88a', '#1c2418'],
  caves: ['#3e4a6a', '#a8c8ff', '#1a1c2c'],
  ruins: ['#6a6050', '#e8d4a0', '#2a2620'],
  castle: ['#5a3a42', '#f0a8a0', '#2a1418'],
  abyss: ['#5a3428', '#ffb070', '#2a120c'],
  eden: ['#4a6a48', '#d8ff9a', '#1c2a1a'],
};
const pal = (L) => PAL[L.biome] || PAL.ruins;
export function resetMinimap(L) {
  mmBase.width = L.W * MM; mmBase.height = L.H * MM;
  const c = mmBase.getContext('2d');
  c.clearRect(0, 0, mmBase.width, mmBase.height);
  big.L = null; // nova região: o mapa ampliado refaz a planta completa
  if (isBigMapOpen()) drawBigMap();
}
export function paintMinimapTile(L, x, z) {
  paintTile(mmBase.getContext('2d'), L, x, z);
  big.fogDirty = true;
}
function paintTile(c, L, x, z) {
  const at = (xx, zz) => (xx < 0 || zz < 0 || xx >= L.W || zz >= L.H ? 0 : L.grid[zz * L.W + xx]);
  const v = at(x, z), P = pal(L), X = x * MM, Z = z * MM;
  if (!v) {
    // parede: só a pedra que encosta no chão aparece (o resto é escuridão)
    if (!nearFloor(L, x, z)) return;
    c.fillStyle = P[2];
    c.fillRect(X, Z, MM, MM);
    return;
  }
  // chão com leve xadrez para dar textura; rio em azul; obstáculos (2) mais escuros
  const odd = (x + z) & 1, water = L.water && L.water[z * L.W + x];
  c.fillStyle = water ? (odd ? '#2e6a94' : '#2a6088') : P[0];
  c.fillRect(X, Z, MM, MM);
  if (!water && v === 2) { c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(X + 1, Z + 1, MM - 2, MM - 2); }
  else if (!water && odd) { c.fillStyle = 'rgba(255,255,255,.05)'; c.fillRect(X, Z, MM, MM); }
  // contorno claro onde o chão encontra a parede
  c.fillStyle = P[1];
  if (!at(x, z - 1)) c.fillRect(X, Z, MM, 2);
  if (!at(x, z + 1)) c.fillRect(X, Z + MM - 2, MM, 2);
  if (!at(x - 1, z)) c.fillRect(X, Z, 2, MM);
  if (!at(x + 1, z)) c.fillRect(X + MM - 2, Z, 2, MM);
}
function nearFloor(L, x, z) {
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const xx = x + dx, zz = z + dz;
    if (xx >= 0 && zz >= 0 && xx < L.W && zz < L.H && L.grid[zz * L.W + xx]) return true;
  }
  return false;
}
/**
 * Alvo da missão atual: "!" dourado sobre o NPC; se estiver fora do círculo,
 * uma seta na borda apontando para ele. Mesma rotação de 45° do mapa.
 */
function drawQuestMarker(c, W, p) {
  const t = questTargetPos();
  if (!t) return;
  const dx = ((t.x - p.x) / TILE) * MM, dz = ((t.z - p.z) / TILE) * MM;
  const k = Math.SQRT1_2, sx = (dx - dz) * k, sy = (dx + dz) * k;
  const d = Math.hypot(sx, sy), lim = W / 2 - 26;
  const pulse = 1 + Math.sin(performance.now() / 180) * 0.12;
  c.save();
  c.translate(W / 2, W / 2);
  if (d > lim) {
    const a = Math.atan2(sy, sx);
    c.rotate(a);
    c.translate(lim + 6, 0);
    c.fillStyle = '#f2cf7a'; c.strokeStyle = 'rgba(20,12,4,.9)'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(14 * pulse, 0); c.lineTo(-8, -11); c.lineTo(-8, 11); c.closePath(); c.stroke(); c.fill();
  } else {
    c.translate(sx, sy);
    c.fillStyle = 'rgba(20,12,4,.85)';
    c.beginPath(); c.arc(0, 0, 15 * pulse, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#f2cf7a'; c.lineWidth = 3; c.stroke();
    c.fillStyle = '#f2cf7a'; c.font = 'bold 22px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('!', 0, 1);
  }
  c.restore();
}
/** Moldura: anel dourado com bisel, sombra interna e quatro tachas. */
let frame = null;
function frameCanvas(W) {
  if (frame && frame.width === W) return frame;
  frame = document.createElement('canvas');
  frame.width = frame.height = W;
  const c = frame.getContext('2d'), r = W / 2;
  // sombra interna: o mapa escurece perto da borda
  const sh = c.createRadialGradient(r, r, r * 0.62, r, r, r - 8);
  sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.6)');
  c.fillStyle = sh; c.beginPath(); c.arc(r, r, r - 8, 0, Math.PI * 2); c.fill();
  // anel externo escuro + anel dourado com gradiente
  c.lineWidth = 12; c.strokeStyle = '#140e08'; c.beginPath(); c.arc(r, r, r - 7, 0, Math.PI * 2); c.stroke();
  const g = c.createLinearGradient(0, 0, W, W);
  g.addColorStop(0, '#f6e3a6'); g.addColorStop(0.35, '#b8924a'); g.addColorStop(0.6, '#6a4a1c'); g.addColorStop(1, '#d8b66a');
  c.lineWidth = 6; c.strokeStyle = g; c.beginPath(); c.arc(r, r, r - 7, 0, Math.PI * 2); c.stroke();
  c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,240,200,.35)'; c.beginPath(); c.arc(r, r, r - 12, 0, Math.PI * 2); c.stroke();
  // tachas em cima, embaixo e nos lados, como uma bússola
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2, x = r + Math.cos(a) * (r - 10), y = r + Math.sin(a) * (r - 10);
    c.save(); c.translate(x, y); c.rotate(a + Math.PI / 4);
    c.fillStyle = '#140e08'; c.fillRect(-7, -7, 14, 14);
    c.fillStyle = g; c.fillRect(-5, -5, 10, 10);
    c.fillStyle = '#7a5aff'; c.beginPath(); c.arc(0, 0, 3, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  return frame;
}
/** Marcadores (loot, portais, NPCs, aliados, monstros vistos); u escala o tamanho. */
function drawMarkers(c, u, now) {
  const pos = (x, z) => [(x / TILE) * MM + MM / 2, (z / TILE) * MM + MM / 2];
  const dot = (x, z, r, col, ring) => {
    const [px, pz] = pos(x, z);
    c.fillStyle = col; c.beginPath(); c.arc(px, pz, r, 0, Math.PI * 2); c.fill();
    c.lineWidth = 1.6 * u; c.strokeStyle = ring || 'rgba(0,0,0,.75)'; c.stroke();
  };
  const diamond = (x, z, r, col) => {
    const [px, pz] = pos(x, z);
    c.save(); c.translate(px, pz); c.rotate(-Math.PI / 4);
    c.fillStyle = col; c.strokeStyle = 'rgba(20,12,4,.9)'; c.lineWidth = 2 * u;
    c.beginPath(); c.moveTo(0, -r); c.lineTo(r, 0); c.lineTo(0, r); c.lineTo(-r, 0); c.closePath(); c.fill(); c.stroke();
    c.restore();
  };
  const seen = (x, z) => G.explored[Math.round(z / TILE) * G.L.W + Math.round(x / TILE)];
  G.loot.forEach((l) => { if (l.ord >= 2) diamond(l.x, l.z, 4.5 * u, R.RARITY[l.item ? l.item.rarity : 'ancestral'].color); });
  // portais: anel pulsante
  allPortals().forEach((pt) => {
    const [px, pz] = pos(pt.x, pt.z), col = pt === G.edenPortal || pt === G.hubPortal ? '#8affb0' : '#b9a4ff';
    const k = (now * 0.9) % 1;
    c.strokeStyle = col; c.globalAlpha = 1 - k; c.lineWidth = 2 * u; c.beginPath(); c.arc(px, pz, (7 + k * 9) * u, 0, Math.PI * 2); c.stroke();
    c.globalAlpha = 1; dot(pt.x, pt.z, 7 * u, col, '#fff');
  });
  G.npcs.forEach((n) => diamond(n.x, n.z, 6.5 * u, '#f2cf7a'));
  G.allies.forEach((a) => { if (!a.away) dot(a.x, a.z, 4 * u, '#8affb0'); });
  G.monsters.forEach((m) => {
    if (m.dead || !seen(m.x, m.z)) return;
    if (m.boss) {
      const [px, pz] = pos(m.x, m.z);
      c.strokeStyle = 'rgba(255,138,58,.6)'; c.lineWidth = 2 * u; c.beginPath(); c.arc(px, pz, (13 + Math.sin(now * 5) * 2) * u, 0, Math.PI * 2); c.stroke();
      dot(m.x, m.z, 9 * u, '#ff8a3a', '#ffe0b0');
    } else dot(m.x, m.z, (m.mini ? 7 : m.elite ? 6 : 4) * u, m.mini ? '#8aff6a' : m.elite ? '#6aa0ff' : '#e0453a');
  });
  if (G.L.boss && G.zone !== 'town' && G.boss) { const b = G.L.boss; if (seen(b.x * TILE, b.z * TILE)) dot(b.x * TILE, b.z * TILE, 3 * u, '#fff'); }
}
export function drawMinimap() {
  const cv = $('#minimap'), c = cv.getContext('2d');
  const W = cv.width, p = G.player, now = performance.now() / 1000;
  c.clearRect(0, 0, W, W);
  c.save();
  c.beginPath(); c.arc(W / 2, W / 2, W / 2 - 8, 0, Math.PI * 2); c.clip();
  const bg = c.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2);
  bg.addColorStop(0, 'rgba(22,18,32,.82)'); bg.addColorStop(1, 'rgba(6,4,10,.9)');
  c.fillStyle = bg; c.fillRect(0, 0, W, W);
  // gira 45° para casar com a câmera isométrica
  c.translate(W / 2, W / 2);
  c.rotate(Math.PI / 4);
  c.translate(-(p.x / TILE) * MM - MM / 2, -(p.z / TILE) * MM - MM / 2);
  c.drawImage(mmBase, 0, 0);
  drawMarkers(c, 1, now);
  c.restore();
  drawQuestMarker(c, W, p);
  // jogador no centro: seta para onde o herói olha, com brilho
  drawHero(c, W / 2, W / 2, 1, p);
  c.drawImage(frameCanvas(W), 0, 0);
  if (isBigMapOpen()) drawBigMap();
}
/** Seta do herói (em coordenadas de tela, já girada para a câmera isométrica). */
function drawHero(c, x, y, u, p) {
  const fx = Math.sin(p.rot || 0), fz = Math.cos(p.rot || 0), k = Math.SQRT1_2;
  const ang = Math.atan2((fx + fz) * k, (fx - fz) * k);
  c.save();
  c.translate(x, y);
  c.scale(u, u);
  const glow = c.createRadialGradient(0, 0, 0, 0, 0, 22);
  glow.addColorStop(0, 'rgba(255,240,190,.55)'); glow.addColorStop(1, 'rgba(255,240,190,0)');
  c.fillStyle = glow; c.beginPath(); c.arc(0, 0, 22, 0, Math.PI * 2); c.fill();
  c.rotate(ang);
  c.fillStyle = '#fff'; c.strokeStyle = '#1a1208'; c.lineWidth = 3; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(13, 0); c.lineTo(-8, -9); c.lineTo(-4, 0); c.lineTo(-8, 9); c.closePath(); c.stroke(); c.fill();
  c.restore();
}

// ---------- mapa ampliado (clique/toque no minimapa ou tecla M) ----------
/**
 * Planta completa da região: o que já foi explorado aparece nítido; o resto
 * fica sob névoa hachurada, mostrando o que ainda falta percorrer.
 */
const big = { L: null, full: null, fog: null, fogDirty: true, box: null, floor: 0, seen: 0 };
let hatch = null;
function hatchPattern(c) {
  if (!hatch) {
    hatch = document.createElement('canvas');
    hatch.width = hatch.height = 8;
    const h = hatch.getContext('2d');
    h.strokeStyle = 'rgba(170,150,220,.22)'; h.lineWidth = 1.2;
    h.beginPath(); h.moveTo(0, 8); h.lineTo(8, 0); h.moveTo(-2, 2); h.lineTo(2, -2); h.moveTo(6, 10); h.lineTo(10, 6); h.stroke();
  }
  return c.createPattern(hatch, 'repeat');
}
function buildFull(L) {
  big.L = L;
  big.full = big.full || document.createElement('canvas');
  big.full.width = L.W * MM; big.full.height = L.H * MM;
  const c = big.full.getContext('2d');
  c.clearRect(0, 0, big.full.width, big.full.height);
  let x0 = L.W, z0 = L.H, x1 = 0, z1 = 0, floor = 0;
  for (let z = 0; z < L.H; z++) for (let x = 0; x < L.W; x++) {
    paintTile(c, L, x, z);
    if (!L.grid[z * L.W + x]) continue;
    floor++;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z;
  }
  big.floor = floor;
  big.box = floor ? { x0: x0 - 1, z0: z0 - 1, x1: x1 + 2, z1: z1 + 2 } : { x0: 0, z0: 0, x1: L.W, z1: L.H };
  big.fogDirty = true;
}
function buildFog(L) {
  big.fog = big.fog || document.createElement('canvas');
  big.fog.width = L.W * MM; big.fog.height = L.H * MM;
  const c = big.fog.getContext('2d');
  c.clearRect(0, 0, big.fog.width, big.fog.height);
  c.fillStyle = 'rgba(12,8,22,.8)';
  let seen = 0;
  for (let z = 0; z < L.H; z++) for (let x = 0; x < L.W; x++) {
    const i = z * L.W + x, v = L.grid[i];
    if (G.explored[i]) { if (v) seen++; continue; }
    if (v || nearFloor(L, x, z)) c.fillRect(x * MM, z * MM, MM, MM);
  }
  c.globalCompositeOperation = 'source-atop';
  c.fillStyle = hatchPattern(c);
  c.fillRect(0, 0, big.fog.width, big.fog.height);
  c.globalCompositeOperation = 'source-over';
  big.seen = seen;
  big.fogDirty = false;
}
export function isBigMapOpen() { const el = document.getElementById('bigmap'); return !!el && !el.hidden; }
export function exploredPct() {
  if (!G.L || !G.explored) return 0;
  if (big.L !== G.L) buildFull(G.L);
  if (big.fogDirty) buildFog(G.L);
  return big.floor ? Math.min(100, Math.round((big.seen / big.floor) * 100)) : 100;
}
export function openBigMap() {
  if (G.mode !== 'play' || !G.L) return;
  $('#bigmap').hidden = false;
  drawBigMap();
}
export function closeBigMap() {
  const el = document.getElementById('bigmap');
  if (!el || el.hidden) return false;
  el.hidden = true;
  return true;
}
export function toggleBigMap() { if (!closeBigMap()) openBigMap(); }
export function drawBigMap() {
  const L = G.L, p = G.player;
  if (!L || !G.explored || !p) return;
  const pct = exploredPct();
  const cv = $('#bigmapCv'), d = Math.min(2, window.devicePixelRatio || 1);
  const cw = Math.max(1, Math.round(cv.clientWidth * d)), chh = Math.max(1, Math.round(cv.clientHeight * d));
  if (cv.width !== cw || cv.height !== chh) { cv.width = cw; cv.height = chh; }
  const c = cv.getContext('2d'), now = performance.now() / 1000;
  c.clearRect(0, 0, cw, chh);
  // encaixa a planta girada 45° (mesma orientação do minimapa e da câmera)
  const b = big.box, w = (b.x1 - b.x0) * MM, h = (b.z1 - b.z0) * MM;
  const ext = (w + h) * Math.SQRT1_2, s = (Math.min(cw, chh) * 0.96) / ext;
  c.save();
  c.translate(cw / 2, chh / 2);
  c.scale(s, s);
  c.rotate(Math.PI / 4);
  c.translate(-(b.x0 * MM + w / 2), -(b.z0 * MM + h / 2));
  c.drawImage(big.full, 0, 0);
  c.drawImage(big.fog, 0, 0);
  const u = (0.75 * d) / s;
  drawMarkers(c, u, now);
  const t = questTargetPos();
  if (t) {
    const qx = (t.x / TILE) * MM + MM / 2, qz = (t.z / TILE) * MM + MM / 2, r = 13 * u;
    c.save(); c.translate(qx, qz); c.rotate(-Math.PI / 4);
    c.fillStyle = 'rgba(20,12,4,.85)'; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#f2cf7a'; c.lineWidth = 2.5 * u; c.stroke();
    c.fillStyle = '#f2cf7a'; c.font = 'bold ' + Math.round(19 * u) + 'px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('!', 0, u);
    c.restore();
  }
  // posição do herói na tela (mesma transformação, sem rotação da seta)
  const hp = c.getTransform().transformPoint(new DOMPoint((p.x / TILE) * MM + MM / 2, (p.z / TILE) * MM + MM / 2));
  c.restore();
  drawHero(c, hp.x, hp.y, 0.75 * d * 1.2, p);
  const zn = $('#bigmapZone'), zs = $('#bigmapSub'), pe = $('#bigmapPct');
  const name = $('#zoneName').textContent, sub = $('#zoneSub').textContent, pt = pct + '% explorado';
  if (zn.textContent !== name) zn.textContent = name;
  if (zs.textContent !== sub) zs.textContent = sub;
  if (pe.textContent !== pt) pe.textContent = pt;
  $('#bigmapBar').style.width = pct + '%';
}
export function initBigMap() {
  $('#minimap').addEventListener('click', openBigMap);
  $('#bigmap').addEventListener('click', closeBigMap);
  window.addEventListener('resize', () => { if (isBigMapOpen()) drawBigMap(); });
}
