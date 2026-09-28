// ---------- ícones procedurais (SVG): habilidades e itens ----------
import { R } from '../core/util.js';

// ícones de habilidade: fundo temático da classe + emblema

const SKILL_ART = {
  // Dark Knight: aço, sangue e brasas
  twist: ['#6a1a14', '#1a0806', '<g fill="none" stroke="#ffb070" stroke-width="3" stroke-linecap="round" opacity=".85"><path d="M12 32 A20 20 0 0 1 44 14"/><path d="M52 32 A20 20 0 0 1 20 50"/></g><g transform="rotate(-35 32 32)"><path class="bl" d="M30 6 L34 6 L35 40 L29 40Z"/><rect class="au" x="22" y="39" width="20" height="4" rx="2"/><rect x="30" y="43" width="4" height="10" fill="#4a2a18"/></g>'],
  stab: ['#5a1812', '#140605', '<g stroke="#ffd2a0" stroke-width="2" stroke-linecap="round" opacity=".7"><path d="M8 40 L22 30"/><path d="M6 48 L20 38"/><path d="M14 54 L26 44"/></g><g transform="rotate(45 32 32)"><path class="bl" d="M30 2 L34 2 L35.5 40 L28.5 40Z"/><rect class="au" x="21" y="39" width="22" height="4" rx="2"/><rect x="30" y="43" width="4" height="12" fill="#4a2a18"/></g><circle cx="52" cy="12" r="5" fill="#fff" opacity=".8"/>'],
  swell: ['#3a4a18', '#0c1206', '<path class="au" d="M32 8 L52 16 L50 36 Q46 50 32 58 Q18 50 14 36 L12 16Z"/><path d="M32 12 L48 18 L46 35 Q43 46 32 53 Q21 46 18 35 L16 18Z" fill="#7a1a1a"/><path d="M32 22 L32 44 M21 33 L43 33" stroke="#ffe7a0" stroke-width="6" stroke-linecap="round"/>'],
  rage: ['#7a1208', '#1a0302', '<path d="M10 58 Q14 40 22 44 Q18 28 30 22 Q28 34 36 36 Q34 20 46 12 Q44 30 54 40 Q56 52 50 58Z" fill="#ff6a1a" opacity=".85"/><path d="M18 58 Q22 46 28 48 Q28 38 36 34 Q36 44 44 46 Q48 52 44 58Z" fill="#ffd24a"/><g transform="rotate(-30 32 34)"><path class="bl" d="M30 8 L34 8 L35 38 L29 38Z"/><rect class="au" x="23" y="37" width="18" height="4" rx="2"/></g><g transform="rotate(30 32 34)"><path class="bl" d="M30 8 L34 8 L35 38 L29 38Z"/><rect class="au" x="23" y="37" width="18" height="4" rx="2"/></g>'],
  destruct: ['#3a1030', '#0c0308', '<g stroke="#ff4a8a" stroke-width="2" fill="none" opacity=".9"><path d="M32 60 L26 48 L30 44 L22 34"/><path d="M32 60 L40 50 L36 44 L46 36"/><path d="M32 60 L32 46"/></g><ellipse cx="32" cy="58" rx="22" ry="5" fill="#ff4a8a" opacity=".35"/><path class="bl" d="M28 4 L36 4 L38 44 L26 44Z"/><path d="M32 6 L32 42" stroke="#fff8"/><rect class="au" x="16" y="42" width="32" height="5" rx="2"/>'],
  // Dark Wizard: arcano, fogo e gelo
  ball: ['#14306a', '#040a1c', '<circle cx="32" cy="32" r="22" fill="url(#glow)"/><circle cx="32" cy="32" r="12" fill="#bfe4ff"/><circle cx="28" cy="28" r="4" fill="#fff"/><g stroke="#8fd0ff" stroke-width="2" fill="none" opacity=".8"><path d="M8 32 Q20 20 32 32 Q44 44 56 32"/><path d="M32 8 Q44 20 32 32 Q20 44 32 56"/></g>'],
  flame: ['#6a2a06', '#180702', '<path d="M32 58 Q12 54 14 36 Q16 26 24 20 Q22 30 28 32 Q24 16 36 6 Q36 20 44 26 Q52 34 50 44 Q48 56 32 58Z" fill="#ff5a14"/><path d="M32 56 Q20 52 22 42 Q24 34 30 30 Q30 38 34 40 Q34 30 40 26 Q44 36 44 44 Q42 54 32 56Z" fill="#ffb02a"/><path d="M32 54 Q26 50 28 44 Q30 40 32 38 Q34 44 38 46 Q38 52 32 54Z" fill="#fff2a0"/>'],
  tele: ['#3a1464', '#0a0418', '<g fill="none" stroke-linecap="round"><path d="M32 32 m-4 0 a4 4 0 1 1 8 0 a8 8 0 1 1 -16 0 a12 12 0 1 1 24 0 a16 16 0 1 1 -32 0 a20 20 0 1 1 40 0" stroke="#c89aff" stroke-width="3"/></g><circle cx="32" cy="32" r="3" fill="#fff"/><g fill="#fff"><circle cx="12" cy="14" r="1.5"/><circle cx="52" cy="50" r="1.5"/><circle cx="50" cy="12" r="1"/></g>'],
  meteor: ['#4a1a06', '#0e0402', '<path d="M6 6 L40 34 L30 44 Z" fill="#ff7a1a" opacity=".55"/><path d="M14 6 L42 32 L34 40 Z" fill="#ffd24a" opacity=".6"/><circle cx="42" cy="42" r="13" fill="#5a3a28" stroke="#1a0c06" stroke-width="2"/><path d="M34 38 Q38 34 42 38 M44 46 Q48 44 50 48 M38 48 L40 50" stroke="#ff8a3a" stroke-width="2" fill="none"/><circle cx="42" cy="42" r="15" fill="none" stroke="#ff6a1a" stroke-width="2" opacity=".7"/>'],
  barrier: ['#0e3a5a', '#03101a', '<path d="M32 6 L54 19 L54 45 L32 58 L10 45 L10 19Z" fill="#5ac8ff" fill-opacity=".18" stroke="#8fe0ff" stroke-width="3"/><path d="M32 6 L32 58 M10 19 L54 45 M54 19 L10 45" stroke="#8fe0ff" stroke-width="1" opacity=".5"/><circle cx="32" cy="32" r="8" fill="#dff6ff"/>'],
  nova: ['#12405a', '#030e16', '<circle cx="32" cy="32" r="24" fill="url(#glow)" opacity=".7"/><g stroke="#e8faff" stroke-width="3" stroke-linecap="round"><path d="M32 6 L32 58"/><path d="M9.5 19 L54.5 45"/><path d="M54.5 19 L9.5 45"/></g><g stroke="#e8faff" stroke-width="2" fill="none" stroke-linecap="round"><path d="M26 10 L32 16 L38 10"/><path d="M26 54 L32 48 L38 54"/><path d="M12 26 L18 23 L15 16"/><path d="M52 38 L46 41 L49 48"/><path d="M52 26 L46 23 L49 16"/><path d="M12 38 L18 41 L15 48"/></g><circle cx="32" cy="32" r="4" fill="#fff"/>'],
  hell: ['#5a0a04', '#120201', '<circle cx="32" cy="34" r="22" fill="none" stroke="#ff4a1a" stroke-width="3"/><circle cx="32" cy="34" r="16" fill="none" stroke="#ffb02a" stroke-width="1.5" stroke-dasharray="4 3"/><path d="M14 52 Q18 40 24 46 Q24 32 32 26 Q34 38 40 40 Q44 32 50 30 Q52 44 48 52Z" fill="#ff5a14"/><path d="M22 54 Q26 46 30 48 Q32 40 36 38 Q38 46 42 48 Q44 52 42 56Z" fill="#ffd24a"/><path d="M26 16 Q32 8 38 16 L36 22 L28 22Z" fill="#e8d8c0" stroke="#1a0602"/><circle cx="30" cy="17" r="1.5" fill="#1a0602"/><circle cx="34" cy="17" r="1.5" fill="#1a0602"/>'],
  // Elfa: floresta, luz e flechas
  triple: ['#1a4a1c', '#051206', '<g stroke="#e8d8b0" stroke-width="2.5" stroke-linecap="round"><path d="M10 54 L50 14"/><path d="M8 40 L44 8"/><path d="M24 56 L56 22"/></g><g class="bl"><path d="M50 14 L42 16 L48 22Z"/><path d="M44 8 L36 10 L42 16Z"/><path d="M56 22 L48 24 L54 30Z"/></g><g fill="#6ab04a"><path d="M10 54 L6 52 L8 58Z"/><path d="M8 40 L4 38 L6 44Z"/><path d="M24 56 L20 54 L22 60Z"/></g>'],
  pierce: ['#16403a', '#04100e', '<g fill="none" stroke="#7affd8" stroke-width="2" opacity=".75"><ellipse cx="22" cy="32" rx="4" ry="12"/><ellipse cx="34" cy="32" rx="4" ry="12"/><ellipse cx="46" cy="32" rx="4" ry="12"/></g><path d="M4 32 L54 32" stroke="#e8d8b0" stroke-width="3"/><path class="bl" d="M60 32 L50 26 L50 38Z"/><path d="M4 32 L0 28 M4 32 L0 36" stroke="#6ab04a" stroke-width="3"/>'],
  heal: ['#1a5a2a', '#041408', '<circle cx="32" cy="32" r="22" fill="url(#glow)" opacity=".6"/><path d="M32 10 Q52 18 50 38 Q40 52 32 56 Q18 44 16 30 Q18 16 32 10Z" fill="#6ad06a" stroke="#1a4a1a" stroke-width="2"/><path d="M32 14 L32 52" stroke="#1a4a1a" stroke-width="1.5"/><path d="M32 22 L32 42 M22 32 L42 32" stroke="#fff" stroke-width="6" stroke-linecap="round"/>'],
  aura: ['#4a4a12', '#121204', '<g stroke="#ffe88a" stroke-width="2.5" stroke-linecap="round">' + Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6; return '<path d="M' + (32 + Math.cos(a) * 15).toFixed(1) + ' ' + (32 + Math.sin(a) * 15).toFixed(1) + ' L' + (32 + Math.cos(a) * (i % 2 ? 24 : 28)).toFixed(1) + ' ' + (32 + Math.sin(a) * (i % 2 ? 24 : 28)).toFixed(1) + '"/>'; }).join('') + '</g><circle cx="32" cy="32" r="11" fill="#fff4b0"/><path d="M32 24 Q38 30 32 40 Q26 30 32 24Z" fill="#6ab04a"/>'],
  spirit: ['#0e3a2a', '#020e08', '<circle cx="32" cy="32" r="24" fill="url(#glow)" opacity=".5"/><path d="M32 58 L32 30" stroke="#6b4a2a" stroke-width="5"/><path d="M32 40 L22 30 M32 36 L42 26" stroke="#6b4a2a" stroke-width="3"/><circle cx="32" cy="20" r="14" fill="#3aa05a"/><circle cx="20" cy="28" r="9" fill="#4ab86a"/><circle cx="44" cy="26" r="9" fill="#4ab86a"/><g fill="#d8ffb0"><circle cx="14" cy="12" r="2"/><circle cx="50" cy="10" r="1.6"/><circle cx="54" cy="44" r="2"/><circle cx="10" cy="46" r="1.4"/></g>'],
  rain: ['#20304a', '#060a12', '<path d="M4 10 Q32 0 60 10" stroke="#8aa8d0" stroke-width="2" fill="none" opacity=".6"/>' + [8, 20, 32, 44, 56].map((x, i) => '<g transform="translate(' + x + ' ' + (14 + (i % 2) * 10) + ')"><path d="M0 0 L0 24" stroke="#e8d8b0" stroke-width="2"/><path class="bl" d="M0 30 L-4 22 L4 22Z"/><path d="M0 0 L-3 -4 M0 0 L3 -4" stroke="#6ab04a" stroke-width="2"/></g>').join('')],
};
const _skillIcon = {};
export function skillIconURI(id) {
  if (_skillIcon[id]) return _skillIcon[id];
  const a = SKILL_ART[id] || ['#333', '#111', '<circle cx="32" cy="32" r="12" fill="#aaa"/>'];
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs>' +
    '<radialGradient id="bg" cx=".5" cy=".42" r=".75"><stop offset="0" stop-color="' + shade(a[0], 0.28) + '"/><stop offset=".55" stop-color="' + a[0] + '"/><stop offset="1" stop-color="' + a[1] + '"/></radialGradient>' +
    '<radialGradient id="glow"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".4" stop-color="' + shade(a[0], 0.6) + '" stop-opacity=".6"/><stop offset="1" stop-color="' + a[0] + '" stop-opacity="0"/></radialGradient>' +
    '<linearGradient id="bl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#b8c4d0"/><stop offset="1" stop-color="#4a5460"/></linearGradient>' +
    '<linearGradient id="au" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6e3a6"/><stop offset="1" stop-color="#8a6420"/></linearGradient></defs>' +
    '<style>.bl{fill:url(#bl);stroke:#10141a;stroke-width:1}.au{fill:url(#au);stroke:#1a0f06;stroke-width:1}</style>' +
    '<rect width="64" height="64" fill="url(#bg)"/>' +
    '<path d="M0 0 L64 64 M64 0 L0 64" stroke="#fff" stroke-opacity=".03" stroke-width="10"/>' + a[2] +
    '<rect x="1" y="1" width="62" height="62" fill="none" stroke="#000" stroke-opacity=".55" stroke-width="2"/>' +
    '<rect x="3" y="3" width="58" height="58" fill="none" stroke="#e8c878" stroke-opacity=".35" stroke-width="1"/></svg>';
  return (_skillIcon[id] = 'data:image/svg+xml,' + encodeURIComponent(svg));
}
// ---------- ícones de item (SVG procedural, fundo por tipo, cor por raridade) ----------
const ICON_SHAPE = {
  sword: '<path class="m" d="M29.5 6 L34.5 6 L35.5 40 L28.5 40 Z"/><path d="M32 8 L32 38" stroke="#fff6" stroke-width="1"/><rect class="g" x="19" y="39" width="26" height="5" rx="2"/><rect class="w" x="29.5" y="44" width="5" height="11" rx="1"/><circle class="g" cx="32" cy="58" r="3.5"/>',
  staff: '<path d="M18 60 L41 17" stroke="#6b4a2a" stroke-width="5" stroke-linecap="round"/><path d="M18 60 L41 17" stroke="#0005" stroke-width="1.5"/><path class="g" d="M36 20 Q34 10 42 6 Q52 8 50 18 Q46 24 36 20Z"/><circle class="m" cx="43" cy="14" r="5.5"/><circle cx="41" cy="12" r="2" fill="#fffc"/>',
  bow: '<path d="M22 5 Q56 32 22 59" stroke="#6b4a2a" stroke-width="5" fill="none" stroke-linecap="round"/><path class="ms" d="M22 5 Q56 32 22 59" stroke-width="2" fill="none"/><path d="M22 5 L22 59" stroke="#ddd" stroke-width="1"/><path d="M12 32 L52 32" stroke="#c9b28a" stroke-width="2"/><path class="m" d="M52 32 L45 28 L45 36Z"/><path d="M12 32 L8 28 M12 32 L8 36" stroke="#c9b28a" stroke-width="2"/>',
  helm: '<path class="m" d="M13 38 Q12 12 32 9 Q52 12 51 38 L51 50 L41 50 L41 35 L23 35 L23 50 L13 50 Z"/><path d="M32 10 L32 35" stroke="#0006" stroke-width="2"/><rect x="23" y="30" width="18" height="4" fill="#0008"/><path class="g" d="M29 9 Q32 1 35 9Z"/>',
  armor: '<path class="m" d="M18 12 L26 7 Q32 14 38 7 L46 12 L55 22 L47 29 L46 57 L18 57 L17 29 L9 22 Z"/><path d="M32 16 L32 56 M20 36 L44 36" stroke="#0006" stroke-width="1.5"/><circle class="g" cx="32" cy="26" r="4"/>',
  gloves: '<path class="m" d="M20 58 L19 30 L21 14 Q24 10 26 14 L27 28 L28 10 Q31 6 33 10 L34 28 L36 12 Q39 9 41 13 L41 31 L45 22 Q49 20 49 25 L45 41 L43 58 Z"/><rect class="g" x="18" y="50" width="27" height="7" rx="2"/>',
  boots: '<path class="m" d="M21 7 L37 7 L37 39 L51 45 Q57 48 55 57 L19 57 Z"/><rect class="g" x="20" y="8" width="17" height="5" rx="1"/><path d="M19 52 L55 52" stroke="#0007" stroke-width="2"/>',
  ring: '<circle cx="32" cy="40" r="14" fill="none" class="ms" stroke-width="6"/><circle cx="32" cy="40" r="14" fill="none" stroke="#fff5" stroke-width="1.5"/><path class="g" d="M32 12 L41 21 L32 30 L23 21 Z"/><path d="M32 12 L32 30 M23 21 L41 21" stroke="#fff8" stroke-width="1"/>',
  pendant: '<path d="M14 6 Q32 34 50 6" stroke="#c9b28a" stroke-width="2" fill="none" stroke-dasharray="3 2"/><path class="m" d="M32 26 L45 40 L32 59 L19 40 Z"/><path d="M32 26 L32 59 M19 40 L45 40" stroke="#fff7" stroke-width="1"/><circle class="g" cx="32" cy="24" r="3"/>',
  wings: '<path class="m" d="M31 32 Q15 4 3 12 Q10 19 7 27 Q14 29 11 37 Q19 37 19 46 Q27 40 31 38Z"/><path class="m" d="M33 32 Q49 4 61 12 Q54 19 57 27 Q50 29 53 37 Q45 37 45 46 Q37 40 33 38Z"/><path d="M29 30 Q18 16 8 14 M29 34 Q18 28 11 29 M29 37 Q22 36 15 38 M35 30 Q46 16 56 14 M35 34 Q46 28 53 29 M35 37 Q42 36 49 38" stroke="#0005" stroke-width="1.2" fill="none"/><circle class="g" cx="32" cy="35" r="3"/>',
  jewel: '<path class="m" d="M32 6 L51 22 L32 59 L13 22 Z"/><path d="M13 22 L51 22 M32 6 L24 22 L32 59 L40 22 Z" stroke="#fff8" stroke-width="1" fill="none"/><path d="M20 14 L26 12" stroke="#fff" stroke-width="2" stroke-linecap="round"/>',
  potion: '<path d="M26 7 L38 7 L38 22 Q52 30 50 44 Q48 58 32 58 Q16 58 14 44 Q12 30 26 22Z" fill="#fff2" stroke="#e8e0d0aa" stroke-width="2"/><path class="m" d="M15.5 40 Q32 34 48.5 40 Q48 56 32 56 Q16 56 15.5 40Z"/><rect x="24" y="4" width="16" height="6" rx="2" fill="#8a6a42"/><path d="M20 30 Q18 38 20 44" stroke="#fff9" stroke-width="2" fill="none" stroke-linecap="round"/>',
};
/** Fundo por tipo de item: cor base do "tecido"/moldura atrás do ícone. */
const ICON_BG = { sword: '#5a1b17', staff: '#3b1d52', bow: '#1f3f22', helm: '#1d2d45', armor: '#4a3316', gloves: '#34391a', boots: '#3d2616', ring: '#3a1f4a', pendant: '#153c3e', wings: '#27204f', jewel: '#20183a', potion: '#2a1a1a' };
const _iconCache = {};
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)));
  return '#' + ((ch(n >> 16) << 16) | (ch((n >> 8) & 255) << 8) | ch(n & 255)).toString(16).padStart(6, '0');
}
function iconKind(it) {
  if (it.kind === 'jewel') return 'jewel';
  if (it.kind === 'potion') return 'potion';
  if (it.slot === 'weapon') return it.cls === 'dw' ? 'staff' : it.cls === 'elf' ? 'bow' : 'sword';
  return it.slot;
}
export function iconURI(kind, col) {
  const key = kind + col;
  if (_iconCache[key]) return _iconCache[key];
  const hi = shade(col, 0.65), lo = shade(col, -0.55);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs>' +
    '<linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + hi + '"/><stop offset=".5" stop-color="' + col + '"/><stop offset="1" stop-color="' + lo + '"/></linearGradient>' +
    '<linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6e3a6"/><stop offset="1" stop-color="#8a6420"/></linearGradient></defs>' +
    '<style>.m{fill:url(#a);stroke:#0009;stroke-width:1.4}.ms{stroke:url(#a)}.g{fill:url(#b);stroke:#0008;stroke-width:1}.w{fill:#4a3322;stroke:#0008}</style>' +
    ICON_SHAPE[kind] + '</svg>';
  return (_iconCache[key] = 'data:image/svg+xml,' + encodeURIComponent(svg));
}
export function glyph(it) {
  const kind = iconKind(it);
  const c = it.kind === 'jewel' ? R.JEWELS[it.id].color : it.kind === 'potion' ? (it.id === 'hp' ? '#e8483a' : '#3a78e8') : R.RARITY[it.rarity].color;
  return { kind, c, bg: it.kind === 'potion' ? (it.id === 'hp' ? '#3a1414' : '#141e3a') : ICON_BG[kind], src: iconURI(kind, c) };
}
export function iconHtml(g) {
  return '<span class="gl" style="--bg:' + g.bg + ';--rc:' + g.c + '"><img src="' + g.src + '" alt="" draggable="false"></span>';
}
