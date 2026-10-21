// ---------- texturas procedurais geradas com antecedência ----------
// As texturas do chão, das paredes e dos detalhes são calculadas pixel a pixel na CPU e ficam em
// cache (art/textures.js). Na primeira visita a cada bioma isso era 60–70% do tempo de entrada na
// zona (0,3–0,5 s num PC, 1–2 s num celular, com a tela parada). Aqui elas são geradas aos poucos
// enquanto o navegador está ocioso (tela de título, cidade), uma por vez, para que a primeira
// entrada em cada zona já encontre tudo pronto.
import { texDecal, texDetail } from '../art/textures.js';
import { BIOMES } from './biomes.js';
import { biomeTex } from './biomeTextures.js';

const DETAILS = ['skin', 'fur', 'scale', 'metal', 'cloth', 'leather', 'bone', 'membrane', 'stone'];
const DECALS = ['blood', 'moss', 'crack', 'web', 'ash'];

/** Lista de tarefas (cada uma gera um conjunto de texturas; o cache torna a repetição grátis). */
export function prewarmJobs() {
  return [
    ...DETAILS.map((k) => () => texDetail(k)),
    ...DECALS.map((k) => () => texDecal(k)),
    ...Object.keys(BIOMES).map((id) => () => biomeTex(id)),
  ];
}

/**
 * Começa a gerar as texturas em segundo plano: uma tarefa por momento ocioso, com folga entre
 * elas para não roubar quadros. `busy()` = true adia (ex.: em combate).
 */
export function startTexPrewarm(busy, delayMs) {
  const jobs = prewarmJobs();
  const idle = typeof requestIdleCallback === 'function' ? (f) => requestIdleCallback(f, { timeout: 4000 }) : (f) => setTimeout(() => f({ timeRemaining: () => 50 }), 200);
  const next = () => {
    if (!jobs.length) return;
    idle((dl) => {
      if (busy && busy()) { setTimeout(next, 1500); return; }
      if (dl && dl.timeRemaining && dl.timeRemaining() < 8 && !dl.didTimeout) { next(); return; }
      const job = jobs.shift();
      try { job(); } catch { /* uma textura que falhe é gerada de novo quando a zona precisar */ }
      setTimeout(next, 250);
    });
  };
  setTimeout(next, delayMs == null ? 2500 : delayMs);
}
