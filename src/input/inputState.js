// ---------- estado bruto da entrada (compartilhado entre entrada e simulação) ----------

export const mouse = { x: 0, y: 0, down: false, moved: false, lastRepath: 0, hover: null, orbit: null };
export const KEYS = { w: false, a: false, s: false, d: false, any() { return this.w || this.a || this.s || this.d; } };
