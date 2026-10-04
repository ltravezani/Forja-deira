// ---------- áudio sintetizado (WebAudio, sem arquivos) ----------
// Os buffers de ruído são gerados uma vez por duração e reaproveitados; um limite
// de vozes por quadro evita que uma habilidade em área dispare dezenas de sons.
import { CONFIG } from '../core/config.js';

const noiseCache = new Map();
let voices = 0, voiceFrame = -1;

function allowVoice() {
  const f = Math.floor(performance.now() / 16);
  if (f !== voiceFrame) { voiceFrame = f; voices = 0; }
  return voices++ < CONFIG.audio.maxVoicesPerFrame;
}

export const Sfx = {
  ctx: null, on: true,
  /** Cria o contexto de áudio (precisa de um gesto do usuário nos navegadores). */
  init() {
    try {
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch { this.ctx = null; }
  },
  tone(f, d, type, vol, slide) {
    if (!this.on || !this.ctx || !allowVoice()) return;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + d);
    g.gain.setValueAtTime(vol || 0.08, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + d);
  },
  noise(d, vol, f) {
    if (!this.on || !this.ctx || !allowVoice()) return;
    const c = this.ctx;
    let b = noiseCache.get(d);
    if (!b) {
      const n = Math.floor(c.sampleRate * d), ch = (b = c.createBuffer(1, n, c.sampleRate)).getChannelData(0);
      for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
      noiseCache.set(d, b);
    }
    const s = c.createBufferSource(), g = c.createGain(), fl = c.createBiquadFilter();
    fl.type = 'lowpass'; fl.frequency.value = f || 1200;
    s.buffer = b; g.gain.value = vol || 0.1;
    s.connect(fl); fl.connect(g); g.connect(c.destination); s.start();
  },
  /** Sequência curta de notas agendada no relógio do áudio (sem setTimeout). */
  seq(freqs, step, d, type, vol) {
    if (!this.on || !this.ctx) return;
    const c = this.ctx, t0 = c.currentTime;
    freqs.forEach((f, i) => {
      const o = c.createOscillator(), g = c.createGain(), t = t0 + i * step;
      o.type = type; o.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.0001, t0); g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + d);
    });
  },
  hit() { this.noise(0.08, 0.07, 1800); },
  swing() { this.noise(0.12, 0.04, 3000); },
  boom() { this.noise(0.5, 0.18, 400); this.tone(80, 0.4, 'sine', 0.15, 0.5); },
  zap() { this.tone(900, 0.15, 'sawtooth', 0.03, 0.4); },
  loot(r) { const base = [520, 620, 780, 880, 1040][r] || 520; if (r >= 2) this.seq([base, base * 1.5], 0.09, 0.3, 'triangle', 0.06); else this.tone(base, 0.2, 'triangle', 0.06); },
  level() { this.seq([523, 659, 784, 1046], 0.09, 0.3, 'triangle', 0.07); },
  hurt() { this.tone(160, 0.12, 'square', 0.04, 0.6); },
  coin() { this.seq([1300, 1750], 0.05, 0.1, 'square', 0.022); },
};

// aba em segundo plano: suspende o contexto de áudio (música e efeitos param e o
// processamento sai da CPU); ao voltar, retoma só se ele estava rodando antes.
let resumeOnShow = false;
if (typeof document === 'object') document.addEventListener('visibilitychange', () => {
  const c = Sfx.ctx;
  if (!c) return;
  if (document.hidden) {
    resumeOnShow = c.state === 'running';
    if (resumeOnShow) c.suspend().catch(() => {});
  } else if (resumeOnShow) {
    resumeOnShow = false;
    c.resume().catch(() => {});
  }
});
