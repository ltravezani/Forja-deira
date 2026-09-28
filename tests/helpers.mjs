// Carrega Three.js e as regras como globais (igual ao navegador) antes de importar módulos do jogo.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!globalThis.THREE) {
  globalThis.window = globalThis;
  vm.runInThisContext(readFileSync(path.join(ROOT, 'vendor/three.js'), 'utf8'));
  vm.runInThisContext(readFileSync(path.join(ROOT, 'src/rules.js'), 'utf8'));
}
export const R = globalThis.ForjaRules;
/** import() de um módulo de src/ (depois dos globais prontos). */
export const load = (rel) => import(path.join(ROOT, 'src', rel));
