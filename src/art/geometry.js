// ---------- geometrias compartilhadas ----------
import { hash2 } from './textures.js';

export const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  sph: new THREE.IcosahedronGeometry(0.5, 1),
  sphS: new THREE.SphereGeometry(0.5, 14, 10),
  sphH: new THREE.SphereGeometry(0.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
  cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  taper: new THREE.CylinderGeometry(0.38, 0.5, 1, 8),
  cone: new THREE.ConeGeometry(0.5, 1, 10),
  cone4: new THREE.ConeGeometry(0.5, 1, 4),
  cap: new THREE.CapsuleGeometry(0.5, 1, 4, 10),
  oct: new THREE.OctahedronGeometry(0.5, 0),
  dod: new THREE.DodecahedronGeometry(0.5, 0),
  ico0: new THREE.IcosahedronGeometry(0.5, 0),
  ring: new THREE.RingGeometry(0.86, 1, 48),
  disc: new THREE.CircleGeometry(1, 40),
  beam: new THREE.CylinderGeometry(0.1, 0.32, 1, 10, 1, true),
  torus: new THREE.TorusGeometry(0.5, 0.06, 6, 20, Math.PI),
  torusF: new THREE.TorusGeometry(0.5, 0.08, 6, 18),
  plane: new THREE.PlaneGeometry(1, 1),
  // versões baixas para miudezas instanciadas aos milhares
  sphLow: new THREE.SphereGeometry(0.5, 7, 5),
  blade3: new THREE.ConeGeometry(0.5, 1, 3, 1, true),
  sphHLow: new THREE.SphereGeometry(0.5, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2),
};
GEO.ring.rotateX(-Math.PI / 2);
GEO.disc.rotateX(-Math.PI / 2);
// lâmina: caixa afinada na ponta
GEO.blade = (() => {
  const g = new THREE.BoxGeometry(1, 1, 1, 1, 4, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) + 0.5; // 0..1
    const k = y > 0.82 ? 1 - (y - 0.82) / 0.18 : 1;
    p.setX(i, p.getX(i) * Math.max(0.05, k));
    p.setZ(i, p.getZ(i) * (0.35 + 0.65 * (1 - Math.abs(p.getX(i)) * 2)));
  }
  g.computeVertexNormals();
  return g;
})();
// manto/capa: plano com dobras
GEO.cape = (() => {
  const g = new THREE.PlaneGeometry(1, 1, 6, 6);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, Math.sin(x * 9) * 0.05 * (0.5 - y) - (0.5 - y) * 0.12);
    // barra rasgada
    if (y < -0.45) p.setY(i, y + (hash2(Math.round(x * 12), 3, 7) - 0.5) * 0.18);
  }
  g.translate(0, -0.5, 0);
  g.computeVertexNormals();
  return g;
})();
// manto de espectro: cone com barra esfarrapada
GEO.robe = (() => {
  const g = new THREE.ConeGeometry(0.5, 1, 16, 4, true);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < -0.45) { const a = Math.atan2(p.getZ(i), p.getX(i)); p.setY(i, y - Math.abs(Math.sin(a * 5)) * 0.28 - hash2(Math.round(a * 8), 1, 3) * 0.12); }
  }
  g.computeVertexNormals();
  return g;
})();
const wingShape = new THREE.Shape();
wingShape.moveTo(0, 0);
wingShape.bezierCurveTo(0.6, 0.5, 1.4, 1.2, 2.1, 1.5);
wingShape.bezierCurveTo(1.9, 1.1, 1.85, 0.8, 1.75, 0.5);
wingShape.quadraticCurveTo(1.45, 0.45, 1.35, 0.05);
wingShape.quadraticCurveTo(1.05, 0.0, 0.95, -0.45);
wingShape.quadraticCurveTo(0.65, -0.35, 0.55, -0.85);
wingShape.bezierCurveTo(0.3, -0.5, 0.15, -0.25, 0, 0);
GEO.wing = new THREE.ShapeGeometry(wingShape, 10);
// escudo em forma de pipa
GEO.shield = (() => {
  const s = new THREE.Shape();
  s.moveTo(-0.5, 0.5); s.lineTo(0.5, 0.5); s.lineTo(0.5, 0.05);
  s.quadraticCurveTo(0.45, -0.45, 0, -0.75); s.quadraticCurveTo(-0.45, -0.45, -0.5, 0.05); s.lineTo(-0.5, 0.5);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 1 });
  g.translate(0, 0, -0.06);
  return g;
})();
// geometrias de GEO são compartilhadas por todos os modelos: nunca liberar
for (const g of Object.values(GEO)) g.userData.shared = true;

export function part(geo, mat, sx, sy, sz, x, y, z, parent, shadow) {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = shadow !== false;
  parent.add(m);
  return m;
}
export function pivot(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}
