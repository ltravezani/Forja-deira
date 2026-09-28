// ---------- minimapa ----------
import { G } from '../core/state.js';
import { $, R, TILE } from '../core/util.js';

const MM = 10;
let mmBase = document.createElement('canvas');
export function resetMinimap(L) {
  mmBase.width = L.W * MM; mmBase.height = L.H * MM;
  const c = mmBase.getContext('2d');
  c.clearRect(0, 0, mmBase.width, mmBase.height);
}
export function paintMinimapTile(L, x, z) {
  const c = mmBase.getContext('2d');
  const v = L.grid[z * L.W + x];
  if (v === 1) c.fillStyle = L.biome === 'town' ? '#7d8a62' : '#6a6478';
  else if (v === 2) c.fillStyle = '#48425a';
  else {
    let near = false;
    for (let dz = -1; dz <= 1 && !near; dz++) for (let dx = -1; dx <= 1; dx++) if (L.grid[(z + dz) * L.W + x + dx]) { near = true; break; }
    if (!near) return;
    c.fillStyle = '#b8924a';
    c.fillRect(x * MM + 2, z * MM + 2, MM - 4, MM - 4);
    return;
  }
  c.fillRect(x * MM, z * MM, MM, MM);
}
export function drawMinimap() {
  const cv = $('#minimap'), c = cv.getContext('2d');
  const W = cv.width, p = G.player;
  c.clearRect(0, 0, W, W);
  c.save();
  c.beginPath(); c.arc(W / 2, W / 2, W / 2 - 2, 0, Math.PI * 2); c.clip();
  c.fillStyle = 'rgba(8,6,12,.55)'; c.fillRect(0, 0, W, W);
  // gira 45° para casar com a câmera isométrica
  c.translate(W / 2, W / 2);
  c.rotate(Math.PI / 4);
  c.translate(-(p.x / TILE) * MM - MM / 2, -(p.z / TILE) * MM - MM / 2);
  c.globalAlpha = 0.9;
  c.drawImage(mmBase, 0, 0);
  c.globalAlpha = 1;
  const dot = (x, z, r, col) => { c.fillStyle = col; c.beginPath(); c.arc((x / TILE) * MM + MM / 2, (z / TILE) * MM + MM / 2, r, 0, Math.PI * 2); c.fill(); };
  const seen = (x, z) => G.explored[Math.round(z / TILE) * G.L.W + Math.round(x / TILE)];
  G.loot.forEach((l) => { if (l.ord >= 2) dot(l.x, l.z, 4, R.RARITY[l.item ? l.item.rarity : 'ancestral'].color); });
  G.monsters.forEach((m) => { if (!m.dead && seen(m.x, m.z)) dot(m.x, m.z, m.boss ? 9 : m.elite ? 6 : 4, m.boss ? '#ff8a3a' : m.elite ? '#6aa0ff' : '#e0453a'); });
  G.npcs.forEach((n) => dot(n.x, n.z, 6, '#f2cf7a'));
  [G.exitPortal, G.townPortal].forEach((pt) => { if (pt) dot(pt.x, pt.z, 8, '#b9a4ff'); });
  G.allies.forEach((a) => { if (!a.away) dot(a.x, a.z, 4, '#8affb0'); });
  if (G.L.boss && G.zone === 'dungeon' && G.boss) { const b = G.L.boss; if (seen(b.x * TILE, b.z * TILE)) dot(b.x * TILE, b.z * TILE, 3, '#fff'); }
  c.restore();
  // jogador no centro
  c.fillStyle = '#fff';
  c.beginPath(); c.arc(W / 2, W / 2, 6, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(184,146,74,.9)'; c.lineWidth = 3;
  c.beginPath(); c.arc(W / 2, W / 2, W / 2 - 2, 0, Math.PI * 2); c.stroke();
}
