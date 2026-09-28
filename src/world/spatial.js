// ---------- grade espacial uniforme ----------
// Consultas de vizinhança em O(k) em vez de O(n): usada para separação entre
// monstros, acertos de área e colisão de projéteis. Reconstruída uma vez por
// quadro; os baldes são reaproveitados para não gerar lixo.

export class SpatialHash {
  constructor(cellSize) {
    this.cell = cellSize;
    this.inv = 1 / cellSize;
    this.buckets = new Map();
    this.used = [];
    this.spare = [];
  }
  clear() {
    for (const b of this.used) { b.length = 0; this.spare.push(b); }
    this.used.length = 0;
    this.buckets.clear();
  }
  /** Chave numérica única para células em ±32768 (mapas têm poucas centenas de metros). */
  static key(ix, iz) { return (ix + 32768) * 65536 + (iz + 32768); }
  insert(e) {
    const k = SpatialHash.key(Math.floor(e.x * this.inv), Math.floor(e.z * this.inv));
    let b = this.buckets.get(k);
    if (!b) { b = this.spare.pop() || []; this.buckets.set(k, b); this.used.push(b); }
    b.push(e);
  }
  /**
   * Preenche `out` com as entidades das células que tocam o quadrado de lado 2r em
   * volta de (x, z). É um pré-filtro: quem chama confere a distância exata.
   */
  query(x, z, r, out) {
    out.length = 0;
    const x0 = Math.floor((x - r) * this.inv), x1 = Math.floor((x + r) * this.inv);
    const z0 = Math.floor((z - r) * this.inv), z1 = Math.floor((z + r) * this.inv);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const b = this.buckets.get(SpatialHash.key(ix, iz));
        if (b) for (let i = 0; i < b.length; i++) out.push(b[i]);
      }
    }
    return out;
  }
}
