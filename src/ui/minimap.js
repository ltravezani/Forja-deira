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
}
export function paintMinimapTile(L, x, z) {
  const c = mmBase.getContext('2d');
  const at = (xx, zz) => (xx < 0 || zz < 0 || xx >= L.W || zz >= L.H ? 0 : L.grid[zz * L.W + xx]);
  const v = at(x, z), P = pal(L), X = x * MM, Z = z * MM;
  if (!v) {
    // parede: só a pedra que encosta no chão aparece (o resto é escuridão)
    let near = false;
    for (let dz = -1; dz <= 1 && !near; dz++) for (let dx = -1; dx <= 1; dx++) if (at(x + dx, z + dz)) { near = true; break; }
    if (!near) return;
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
  const pos = (x, z) => [(x / TILE) * MM + MM / 2, (z / TILE) * MM + MM / 2];
  const dot = (x, z, r, col, ring) => {
    const [px, pz] = pos(x, z);
    c.fillStyle = col; c.beginPath(); c.arc(px, pz, r, 0, Math.PI * 2); c.fill();
    c.lineWidth = 1.6; c.strokeStyle = ring || 'rgba(0,0,0,.75)'; c.stroke();
  };
  const diamond = (x, z, r, col) => {
    const [px, pz] = pos(x, z);
    c.save(); c.translate(px, pz); c.rotate(-Math.PI / 4);
    c.fillStyle = col; c.strokeStyle = 'rgba(20,12,4,.9)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -r); c.lineTo(r, 0); c.lineTo(0, r); c.lineTo(-r, 0); c.closePath(); c.fill(); c.stroke();
    c.restore();
  };
  const seen = (x, z) => G.explored[Math.round(z / TILE) * G.L.W + Math.round(x / TILE)];
  G.loot.forEach((l) => { if (l.ord >= 2) diamond(l.x, l.z, 4.5, R.RARITY[l.item ? l.item.rarity : 'ancestral'].color); });
  // portais: anel pulsante
  allPortals().forEach((pt) => {
    const [px, pz] = pos(pt.x, pt.z), col = pt === G.edenPortal || pt === G.hubPortal ? '#8affb0' : '#b9a4ff';
    const k = (now * 0.9) % 1;
    c.strokeStyle = col; c.globalAlpha = 1 - k; c.lineWidth = 2; c.beginPath(); c.arc(px, pz, 7 + k * 9, 0, Math.PI * 2); c.stroke();
    c.globalAlpha = 1; dot(pt.x, pt.z, 7, col, '#fff');
  });
  G.npcs.forEach((n) => diamond(n.x, n.z, 6.5, '#f2cf7a'));
  G.allies.forEach((a) => { if (!a.away) dot(a.x, a.z, 4, '#8affb0'); });
  G.monsters.forEach((m) => {
    if (m.dead || !seen(m.x, m.z)) return;
    if (m.boss) {
      const [px, pz] = pos(m.x, m.z);
      c.strokeStyle = 'rgba(255,138,58,.6)'; c.lineWidth = 2; c.beginPath(); c.arc(px, pz, 13 + Math.sin(now * 5) * 2, 0, Math.PI * 2); c.stroke();
      dot(m.x, m.z, 9, '#ff8a3a', '#ffe0b0');
    } else dot(m.x, m.z, m.mini ? 7 : m.elite ? 6 : 4, m.mini ? '#8aff6a' : m.elite ? '#6aa0ff' : '#e0453a');
  });
  if (G.L.boss && G.zone !== 'town' && G.boss) { const b = G.L.boss; if (seen(b.x * TILE, b.z * TILE)) dot(b.x * TILE, b.z * TILE, 3, '#fff'); }
  c.restore();
  drawQuestMarker(c, W, p);
  // jogador no centro: seta para onde o herói olha, com brilho
  const fx = Math.sin(p.rot || 0), fz = Math.cos(p.rot || 0), k = Math.SQRT1_2;
  const ang = Math.atan2((fx + fz) * k, (fx - fz) * k);
  c.save();
  c.translate(W / 2, W / 2);
  const glow = c.createRadialGradient(0, 0, 0, 0, 0, 22);
  glow.addColorStop(0, 'rgba(255,240,190,.55)'); glow.addColorStop(1, 'rgba(255,240,190,0)');
  c.fillStyle = glow; c.beginPath(); c.arc(0, 0, 22, 0, Math.PI * 2); c.fill();
  c.rotate(ang);
  c.fillStyle = '#fff'; c.strokeStyle = '#1a1208'; c.lineWidth = 3; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(13, 0); c.lineTo(-8, -9); c.lineTo(-4, 0); c.lineTo(-8, 9); c.closePath(); c.stroke(); c.fill();
  c.restore();
  c.drawImage(frameCanvas(W), 0, 0);
}
