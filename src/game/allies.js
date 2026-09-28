// ---------- aliados (pet e invocações) ----------
import { animateModel, buildBeast, disposeModel } from '../art/models.js';
import { G } from '../core/state.js';
import { dist2, fmt, R } from '../core/util.js';
import { Sfx } from '../engine/audio.js';
import { emit } from '../engine/effects.js';
import { world } from '../engine/renderer.js';
import { hitMonster } from './combat.js';
import { face, stepToward, turn } from './movement.js';
import { refreshPaneSoon } from '../ui/drawer.js';
import { log } from '../ui/log.js';
import { gy } from '../world/grid.js';

export function spawnAlly(kind, x, z, dur) {
  const model = kind === 'pet'
    ? buildBeast({ fur: 0xe8883a, dark: 0x3a2a22, eye: 0x1a1a1a, tailColor: 0xfff0e0, bushy: true, scale: 0.62 })
    : buildBeast({ fur: 0x5ae08a, dark: 0x2a6a4a, eye: 0xffffff, flame: false, scale: 1.1 });
  if (kind === 'spirit') model.mats.forEach((m) => { m.userData.baseEmissive = new THREE.Color(0x2aa05a); m.userData.baseEI = 0.5; m.emissive.copy(m.userData.baseEmissive); m.emissiveIntensity = 0.5; m.transparent = true; m.opacity = 0.85; });
  model.root.position.set(x, gy(x, z), z);
  world.add(model.root);
  const a = { kind, x, z, rot: 0, model, target: null, atkCd: 0, attackAnim: 0, until: dur ? G.time + dur : Infinity, away: 0, moving: false, gold: 0 };
  G.allies.push(a);
  if (kind === 'pet') G.pet = a;
  return a;
}
/**
 * Manda o pet vender na cidade. Sem `picked`, leva os itens Comuns/Mágicos;
 * com `picked` (itens marcados no inventário), leva só esses, de qualquer tipo.
 */
export function sendPetToSell(picked) {
  const pet = G.pet;
  if (!pet) return false;
  if (pet.away > G.time) { log('O pet ainda está na cidade vendendo.', 'warn'); return false; }
  const sell = Array.isArray(picked)
    ? picked.filter((it) => G.ch.bag.includes(it))
    : G.ch.bag.filter((it) => it.slot && R.RARITY[it.rarity].order <= 1 && !it.locked);
  if (!sell.length) { log(Array.isArray(picked) ? 'Nenhum item marcado para o pet vender.' : 'Nada para vender: o pet só vende itens Comuns e Mágicos.', 'warn'); return false; }
  let total = 0;
  sell.forEach((it) => { total += Math.floor(R.itemValue(it) * 0.5); G.ch.bag.splice(G.ch.bag.indexOf(it), 1); });
  pet.away = G.time + 18;
  pet.gold = total;
  pet.model.root.visible = false;
  emit(pet.x, 0.5, pet.z, { n: 30, color: 0xffd24a, speed: 3, up: 2, life: 0.8, size: 1 });
  log('Pet partiu para a cidade com ' + sell.length + ' itens. Volta em 18s.', 'sys');
  refreshPaneSoon();
  return true;
}
export function updateAllies(dt) {
  const p = G.player;
  for (let i = G.allies.length - 1; i >= 0; i--) {
    const a = G.allies[i];
    if (a.until < G.time) { emit(a.x, 0.6, a.z, { n: 30, color: 0x8affb0, speed: 3, life: 0.6, size: 1 }); removeAlly(a); G.allies.splice(i, 1); continue; }
    if (a.kind === 'pet' && a.away) {
      if (a.away > G.time) continue;
      a.away = 0; a.model.root.visible = true; a.x = p.x - 1; a.z = p.z + 1;
      G.ch.gold += a.gold;
      log('Pet voltou com ' + fmt(a.gold) + ' Gold.', 'loot');
      emit(a.x, 0.5, a.z, { n: 20, color: 0xffd24a, speed: 3, up: 2, life: 0.7, size: 0.9 });
      Sfx.coin();
    }
    // alvo: monstro mais perto do jogador
    if (G.zone !== 'town' && (!a.target || a.target.dead || dist2(a.target, p) > 110)) {
      a.target = null;
      let bd = 60;
      for (const m of G.monsters) { if (m.dead || !m.aggro) continue; const d = dist2(m, p); if (d < bd) { bd = d; a.target = m; } }
    }
    a.moving = false;
    a.atkCd -= dt;
    if (a.target) {
      const d = Math.hypot(a.target.x - a.x, a.target.z - a.z);
      if (d > 1.6 + a.target.radius) stepToward(a, a.target.x, a.target.z, 7.5, dt, 0.3);
      else if (a.atkCd <= 0) {
        a.atkCd = 1;
        a.attackAnim = 0.001;
        face(a, a.target.x, a.target.z);
        const k = a.kind === 'pet' ? 0.3 : 0.9;
        hitMonster(a.target, k, null);
      }
    } else {
      const d = Math.hypot(p.x - a.x, p.z - a.z);
      if (d > 3) stepToward(a, p.x - Math.sin(p.rot) * 1.6, p.z - Math.cos(p.rot) * 1.6, d > 8 ? 12 : 7, dt, 0.3);
      if (d > 20) { a.x = p.x; a.z = p.z; }
    }
    turn(a, dt);
    if (a.attackAnim > 0) { a.attackAnim += dt * 3.5; if (a.attackAnim >= 1) a.attackAnim = 0; }
    const fly = a.model.fly || 0;
    a.model.root.position.set(a.x, gy(a.x, a.z) + (fly ? fly + Math.sin(G.time * 2.3) * 0.18 : 0), a.z);
    a.model.root.rotation.y = a.rot;
    if (a.model.shadowY) a.model.shadowY.value = gy(a.x, a.z);
    animateModel(a.model, { t: G.time, dt, moving: a.moving, attack: a.attackAnim, speed: 14 });
    // o anjo guardião solta um brilho leve, como no cliente
    if (fly && a.model.root.visible && Math.random() < dt * 6) emit(a.x + (Math.random() - 0.5) * 0.4, fly - 0.2, a.z + (Math.random() - 0.5) * 0.4, { n: 1, color: 0xcfe6ff, speed: 0.3, up: -0.6, life: 0.9, size: 0.35, grav: -0.6, drag: 1 });
  }
}

function removeAlly(a) {
  world.remove(a.model.root);
  disposeModel(a.model);
  if (G.pet === a) G.pet = null;
}
/** Remove aliados; com `keepPet` o pet continua acompanhando o jogador. */
export function clearAllies(keepPet) {
  for (let i = G.allies.length - 1; i >= 0; i--) {
    const a = G.allies[i];
    if (keepPet && a.kind === 'pet') { a.target = null; continue; }
    removeAlly(a);
    G.allies.splice(i, 1);
  }
}
