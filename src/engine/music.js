// ---------- música ambiente procedural (WebAudio, sem arquivos) ----------
// Cada tipo de mapa tem um tema: escala, andamento, timbre e densidade próprios.
// As notas são agendadas no relógio do áudio com uma pequena antecedência a cada
// quadro (sem setTimeout); ao trocar de mapa o tema antigo sai em fade enquanto o
// novo entra. O volume é independente dos efeitos, mas "Som: desligado" cala tudo.
import { Sfx } from './audio.js';

/** Níveis de volume da música (Opções). */
export const MUSIC_LEVELS = [
  { v: 0, name: 'desligada' },
  { v: 0.35, name: 'baixa' },
  { v: 0.65, name: 'média' },
  { v: 1, name: 'alta' },
];
/** Índice do nível de música salvo nas Opções (padrão: média). */
export function musicLevel(settings) {
  const i = settings && settings.music;
  return Number.isInteger(i) && i >= 0 && i < MUSIC_LEVELS.length ? i : 2;
}
const MUSIC_BASE = 0.32;   // ganho máximo da música (os efeitos ficam por cima)
const FADE = 2.5;          // s de crossfade entre temas
const AHEAD = 0.4;         // s de antecedência do agendamento

/**
 * Temas por tipo de mapa. `root` é MIDI; `scale` são intervalos em semitons;
 * `chords` são graus da escala (0 = tônica) trocados a cada `barsPerChord` compassos
 * de 8 colcheias. `lead.density` é a chance de nota por colcheia.
 */
export const MUSIC_THEMES = {
  town: {
    bpm: 72, root: 50, scale: [0, 2, 4, 7, 9], chords: [0, 3, 1, 2], barsPerChord: 2,
    pad: { type: 'triangle', vol: 0.05, cutoff: 1400 },
    bass: { type: 'sine', vol: 0.09 },
    lead: { type: 'triangle', vol: 0.045, oct: 2, density: 0.32, dur: 0.9 },
    echo: { time: 0.42, fb: 0.3, mix: 0.3 },
  },
  forest: {
    bpm: 66, root: 52, scale: [0, 2, 3, 5, 7, 9, 10], chords: [0, 3, 6, 4], barsPerChord: 2,
    pad: { type: 'sine', vol: 0.06, cutoff: 1100 },
    bass: { type: 'sine', vol: 0.07 },
    lead: { type: 'sine', vol: 0.05, oct: 2, density: 0.22, dur: 1.2, vibrato: 5 },
    wind: { vol: 0.02, cutoff: 700 },
    echo: { time: 0.55, fb: 0.35, mix: 0.35 },
  },
  // O Éden: lídio luminoso, sinos e harpa suaves sobre o vento da mata
  eden: {
    bpm: 70, root: 53, scale: [0, 2, 4, 6, 7, 9, 11], chords: [0, 4, 5, 3], barsPerChord: 2,
    pad: { type: 'sine', vol: 0.06, cutoff: 1500 },
    bass: { type: 'sine', vol: 0.07 },
    lead: { type: 'triangle', vol: 0.045, oct: 2, density: 0.3, dur: 1.4, bell: true },
    wind: { vol: 0.018, cutoff: 900 },
    echo: { time: 0.5, fb: 0.4, mix: 0.4 },
  },
  caves: {
    bpm: 60, root: 45, scale: [0, 2, 3, 7, 8], chords: [0, 4, 2, 3], barsPerChord: 2,
    pad: { type: 'sine', vol: 0.05, cutoff: 900 },
    bass: { type: 'sine', vol: 0.08 },
    lead: { type: 'sine', vol: 0.04, oct: 3, density: 0.2, dur: 2.2, bell: true },
    wind: { vol: 0.012, cutoff: 400 },
    echo: { time: 0.7, fb: 0.5, mix: 0.45 },
  },
  ruins: {
    bpm: 56, root: 50, scale: [0, 1, 3, 5, 7, 8, 10], chords: [0, 1, 5, 0], barsPerChord: 2,
    pad: { type: 'triangle', vol: 0.045, cutoff: 800 },
    bass: { type: 'triangle', vol: 0.08 },
    lead: { type: 'triangle', vol: 0.04, oct: 1, density: 0.16, dur: 1.6 },
    wind: { vol: 0.022, cutoff: 500 },
    echo: { time: 0.6, fb: 0.4, mix: 0.35 },
  },
  castle: {
    bpm: 76, root: 48, scale: [0, 2, 3, 5, 7, 8, 11], chords: [0, 5, 3, 4], barsPerChord: 1,
    pad: { type: 'square', vol: 0.034, cutoff: 700 },
    bass: { type: 'sawtooth', vol: 0.05, cutoff: 300, pulse: true },
    lead: { type: 'sawtooth', vol: 0.026, oct: 1, density: 0.2, dur: 0.7, cutoff: 1500 },
    echo: { time: 0.39, fb: 0.3, mix: 0.25 },
  },
  abyss: {
    bpm: 50, root: 38, scale: [0, 1, 4, 6, 7, 10], chords: [0, 3, 0, 1], barsPerChord: 2,
    pad: { type: 'sawtooth', vol: 0.02, cutoff: 420 },
    bass: { type: 'sine', vol: 0.11 },
    lead: { type: 'triangle', vol: 0.03, oct: 1, density: 0.12, dur: 2, bend: 0.94 },
    wind: { vol: 0.035, cutoff: 260 },
    echo: { time: 0.8, fb: 0.45, mix: 0.4 },
  },
  // ---------- Torre Infinita: temas que "sobem" (escalas brilhantes e ecos longos) ----------
  tw_granite: {
    bpm: 70, root: 47, scale: [0, 2, 3, 5, 7, 9, 10], chords: [0, 5, 3, 4], barsPerChord: 2,
    pad: { type: 'triangle', vol: 0.045, cutoff: 1000 },
    bass: { type: 'triangle', vol: 0.08 },
    lead: { type: 'triangle', vol: 0.04, oct: 2, density: 0.2, dur: 1.1 },
    wind: { vol: 0.015, cutoff: 600 },
    echo: { time: 0.64, fb: 0.4, mix: 0.36 },
  },
  tw_arcane: {
    bpm: 62, root: 50, scale: [0, 2, 4, 6, 7, 9, 11], chords: [0, 4, 5, 1], barsPerChord: 2,
    pad: { type: 'sine', vol: 0.055, cutoff: 1300 },
    bass: { type: 'sine', vol: 0.07 },
    lead: { type: 'sine', vol: 0.045, oct: 2, density: 0.26, dur: 1.8, bell: true },
    echo: { time: 0.72, fb: 0.5, mix: 0.45 },
  },
  tw_storm: {
    bpm: 84, root: 45, scale: [0, 2, 3, 5, 7, 8, 10], chords: [0, 5, 6, 4], barsPerChord: 1,
    pad: { type: 'sawtooth', vol: 0.025, cutoff: 800 },
    bass: { type: 'sawtooth', vol: 0.05, cutoff: 320, pulse: true },
    lead: { type: 'triangle', vol: 0.035, oct: 2, density: 0.24, dur: 0.6, vibrato: 6 },
    wind: { vol: 0.03, cutoff: 900 },
    echo: { time: 0.36, fb: 0.35, mix: 0.3 },
  },
  tw_void: {
    bpm: 48, root: 41, scale: [0, 1, 3, 6, 7, 10], chords: [0, 4, 1, 0], barsPerChord: 2,
    pad: { type: 'sawtooth', vol: 0.022, cutoff: 480 },
    bass: { type: 'sine', vol: 0.1 },
    lead: { type: 'sine', vol: 0.035, oct: 2, density: 0.14, dur: 2.4, bend: 0.96, bell: true },
    wind: { vol: 0.03, cutoff: 300 },
    echo: { time: 0.9, fb: 0.5, mix: 0.45 },
  },
};

const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
/** Nota MIDI do grau `deg` (pode passar da oitava) na escala do tema. */
export function scaleNote(th, deg, oct) {
  const n = th.scale.length, o = Math.floor(deg / n), i = deg - o * n;
  return th.root + 12 * ((oct || 0) + o) + th.scale[i];
}

let noiseBuf = null;
function windNoise(c) {
  if (!noiseBuf) {
    const n = c.sampleRate * 2;
    noiseBuf = c.createBuffer(1, n, c.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

/** Monta os nós de um tema (barramento com eco) e começa em silêncio. */
function makeTrack(c, out, name) {
  const th = MUSIC_THEMES[name];
  const bus = c.createGain(), dry = c.createGain(), delay = c.createDelay(2), fb = c.createGain(), wet = c.createGain();
  bus.gain.value = 0.0001;
  delay.delayTime.value = th.echo.time; fb.gain.value = th.echo.fb; wet.gain.value = th.echo.mix;
  dry.connect(bus); dry.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(bus);
  bus.connect(out);
  const t = { name, th, bus, dry, nodes: [delay, fb, wet], step: 0, next: c.currentTime + 0.05, deg: 4, dying: false, wind: null };
  if (th.wind) {
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
    s.buffer = windNoise(c); s.loop = true;
    f.type = 'bandpass'; f.frequency.value = th.wind.cutoff; f.Q.value = 0.8;
    g.gain.value = th.wind.vol;
    lfo.frequency.value = 0.07 + Math.random() * 0.05; lg.gain.value = th.wind.cutoff * 0.4;
    lfo.connect(lg); lg.connect(f.frequency);
    s.connect(f); f.connect(g); g.connect(bus);
    s.start(); lfo.start();
    t.wind = [s, lfo];
    t.nodes.push(f, g, lg);
  }
  bus.gain.setValueAtTime(0.0001, c.currentTime);
  bus.gain.exponentialRampToValueAtTime(1, c.currentTime + FADE);
  return t;
}

/** Uma nota com envelope ataque/sustentação/soltura, opcionalmente filtrada. */
function note(c, dest, o) {
  const osc = c.createOscillator(), g = c.createGain(), t = o.t, end = t + o.dur;
  osc.type = o.type;
  osc.frequency.setValueAtTime(o.f, t);
  if (o.bend) osc.frequency.exponentialRampToValueAtTime(o.f * o.bend, end);
  let head = osc;
  if (o.cutoff) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.cutoff; osc.connect(f); head = f; }
  if (o.vibrato) {
    const l = c.createOscillator(), lg = c.createGain();
    l.frequency.value = o.vibrato; lg.gain.value = o.f * 0.008;
    l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(end);
  }
  head.connect(g); g.connect(dest);
  const atk = Math.min(o.atk, o.dur * 0.5);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.vol, t + atk);
  g.gain.setValueAtTime(o.vol, Math.max(t + atk, end - o.rel));
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  osc.start(t); osc.stop(end + 0.02);
}

/** Agenda a colcheia `step` do tema. */
function playStep(c, tr, t, spb) {
  const th = tr.th, s = tr.step, chordLen = 8 * th.barsPerChord;
  const chordDeg = th.chords[Math.floor(s / chordLen) % th.chords.length];
  if (s % chordLen === 0) {
    const dur = chordLen * spb + 0.6;
    for (const d of [0, 2, 4]) note(c, tr.dry, { t, f: midiHz(scaleNote(th, chordDeg + d, 0)), dur, type: th.pad.type, vol: th.pad.vol, cutoff: th.pad.cutoff, atk: 1.2, rel: 1.4 });
    if (!th.bass.pulse) note(c, tr.dry, { t, f: midiHz(scaleNote(th, chordDeg, -1)), dur, type: th.bass.type, vol: th.bass.vol, cutoff: th.bass.cutoff, atk: 0.6, rel: 1.2 });
  }
  if (th.bass.pulse && s % 2 === 0) note(c, tr.dry, { t, f: midiHz(scaleNote(th, chordDeg, -1)), dur: spb * 1.6, type: th.bass.type, vol: th.bass.vol, cutoff: th.bass.cutoff, atk: 0.02, rel: 0.2 });
  const L = th.lead;
  if (s % chordLen >= 2 && Math.random() < L.density) {
    // passeio aleatório perto da nota anterior, puxado para as notas do acorde
    tr.deg += Math.round((Math.random() - 0.5) * 4);
    if (Math.random() < 0.3) tr.deg = chordDeg + [0, 2, 4][Math.floor(Math.random() * 3)];
    const n = th.scale.length;
    tr.deg = Math.max(0, Math.min(2 * n, tr.deg));
    const f = midiHz(scaleNote(th, tr.deg, L.oct));
    const dur = L.dur * (0.8 + Math.random() * 0.5);
    if (L.bell) {
      note(c, tr.dry, { t, f, dur, type: 'sine', vol: L.vol, atk: 0.005, rel: dur * 0.9 });
      note(c, tr.dry, { t, f: f * 2.76, dur: dur * 0.4, type: 'sine', vol: L.vol * 0.3, atk: 0.005, rel: dur * 0.35 });
    } else {
      note(c, tr.dry, { t, f, dur, type: L.type, vol: L.vol, cutoff: L.cutoff, vibrato: L.vibrato, bend: L.bend, atk: Math.min(0.15, dur * 0.2), rel: dur * 0.6 });
    }
  }
  tr.step = (s + 1) % (chordLen * th.chords.length);
}

function killTrack(tr, c) {
  const t = c.currentTime;
  tr.dying = true;
  tr.bus.gain.cancelScheduledValues(t);
  tr.bus.gain.setValueAtTime(Math.max(0.0001, tr.bus.gain.value), t);
  tr.bus.gain.exponentialRampToValueAtTime(0.0001, t + FADE);
  tr.endAt = t + FADE + 0.2;
}

function disposeTrack(tr) {
  if (tr.wind) for (const n of tr.wind) { try { n.stop(); } catch { /* */ } }
  tr.bus.disconnect();
  tr.dry.disconnect();
  for (const n of tr.nodes) n.disconnect();
}

export const Music = {
  theme: null, volume: 0.65, master: null, gain: -1, tracks: [],
  /** Tema desejado; começa a tocar assim que houver contexto de áudio. */
  play(name) { this.theme = MUSIC_THEMES[name] ? name : null; },
  setVolume(v) { this.volume = v; },
  /** Chamado a cada quadro: aplica volume, faz o crossfade e agenda as próximas notas. */
  tick() {
    const c = Sfx.ctx;
    if (!c || c.state !== 'running') return;
    if (!this.master) { this.master = c.createGain(); this.master.gain.value = 0; this.master.connect(c.destination); }
    const target = Sfx.on ? this.volume * MUSIC_BASE : 0;
    if (this.gain !== target) { this.gain = target; this.master.gain.setTargetAtTime(target, c.currentTime, 0.3); }
    const live = this.tracks.find((t) => !t.dying);
    const want = target > 0 ? this.theme : null;
    if (live && live.name !== want) killTrack(live, c);
    if (want && (!live || live.name !== want)) this.tracks.push(makeTrack(c, this.master, want));
    const now = c.currentTime;
    for (let i = this.tracks.length - 1; i >= 0; i--) {
      const tr = this.tracks[i];
      if (tr.dying) { if (now > tr.endAt) { disposeTrack(tr); this.tracks.splice(i, 1); } continue; }
      const spb = 30 / tr.th.bpm; // colcheia
      if (tr.next < now) tr.next = now + 0.05; // aba em segundo plano: retoma sem rajada de notas
      while (tr.next < now + AHEAD) { playStep(c, tr, tr.next, spb); tr.next += spb; }
    }
  },
};
