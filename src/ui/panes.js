// ---------- painéis Personagem, Habilidades, Drops e Opções ----------
import { G, S, UI } from '../core/state.js';
import { esc, fmt, R } from '../core/util.js';
import { MUSIC_LEVELS, musicLevel } from '../engine/music.js';
import { skillUnlocked } from '../game/skills.js';
import { skillIconURI } from './icons.js';

export function statLabel(k) { return { str: 'Força', agi: 'Agilidade', vit: 'Vitalidade', ene: 'Energia' }[k]; }
export function paneChar() {
  const ch = G.ch, st = G.st, C = R.CLASSES[ch.cls];
  const ev = R.canEvolve(ch), rs = R.canReset(ch);
  let h = '<h3>' + esc(ch.name) + '</h3><p class="note">' + esc(R.className(ch)) + ' · ' + esc(C.role) + ' · Nível ' + ch.level + ' · ' + ch.resets + ' reset(s) · ' + ch.bossKills + ' chefes</p>';
  h += '<h4>Atributos <span class="pts">' + (ch.points ? '· ' + fmt(ch.points) + ' pontos livres' : '') + '</span></h4>';
  ['str', 'agi', 'vit', 'ene'].forEach((k) => {
    h += '<div class="statrow"><span>' + statLabel(k) + '</span><b class="num">' + fmt(ch.stats[k]) + (st.total[k] !== ch.stats[k] ? ' <span class="note">(' + fmt(st.total[k]) + ')</span>' : '') + '</b><span class="row">' +
      '<button class="btn sm" data-act="stat" data-k="' + k + '" data-n="1"' + (ch.points ? '' : ' disabled') + '>+1</button>' +
      '<button class="btn sm" data-act="stat" data-k="' + k + '" data-n="10"' + (ch.points >= 10 ? '' : ' disabled') + '>+10</button>' +
      '<button class="btn sm" data-act="stat" data-k="' + k + '" data-n="100"' + (ch.points >= 100 ? '' : ' disabled') + '>+100</button></span></div>';
  });
  h += '<div class="row" style="margin-top:8px"><button class="btn" data-act="auto"' + (ch.points ? '' : ' disabled') + '>Distribuir automaticamente</button><span class="note">Perfil ' + esc(C.tiers[0]) + ': ' + Object.entries(C.auto).map(([k, v]) => statLabel(k).slice(0, 3) + ' ' + Math.round(v * 100) + '%').join(' · ') + '</span></div>';
  h += '<h4>Combate</h4><dl class="kv">' +
    '<dt>Combat Points</dt><dd class="cpv">' + fmt(G.cp || 0) + '</dd>' +
    '<dt>HP / MP / AG</dt><dd>' + fmt(st.maxHp) + ' / ' + fmt(st.maxMp) + ' / ' + fmt(st.maxAg) + '</dd>' +
    '<dt>' + (ch.cls === 'dw' ? 'Dano mágico' : 'Dano') + '</dt><dd>' + fmt(st.minDmg) + ' ~ ' + fmt(st.maxDmg) + '</dd>' +
    '<dt>Defesa</dt><dd>' + fmt(st.def) + '</dd>' +
    '<dt>Velocidade de ataque</dt><dd>' + st.atkSpeed + ' (' + st.attackInterval.toFixed(2) + 's)</dd>' +
    '<dt>Crítico / Excelente</dt><dd>' + st.critPct + '% / ' + st.excPct + '%</dd>' +
    '<dt>Bônus de dano</dt><dd>+' + st.dmgPct + '%</dd>' +
    '<dt>Redução de dano</dt><dd>' + st.dmgRed.toFixed(1) + '%</dd>' +
    '<dt>Multiplicador de habilidade</dt><dd>×' + st.skillMul.toFixed(3) + '</dd>' +
    '<dt>Encontrar Magia (MF)</dt><dd>' + st.mf + '% <span class="note">(efetivo p/ raros ' + R.mfEffective(st.mf).toFixed(0) + '%)</span></dd>' +
    '<dt>EXP para o próximo nível</dt><dd>' + fmt(R.expToNext(ch.level) - ch.exp) + '</dd></dl>';
  h += '<h4>Evolução de classe</h4>';
  h += '<p>' + C.tiers.map((t, i) => (i === ch.tier ? '<b style="color:var(--gold)">' + t + '</b>' : t)).join(' → ') + '</p>';
  h += ev.next ? '<p class="note">Próxima: ' + esc(ev.name) + ' — requer nível ' + ev.next.level + ', ' + ev.next.bosses + ' chefes' + (ev.next.resets ? ', ' + ev.next.resets + ' reset' : '') + '. ' + (ev.ok ? '<b style="color:var(--ok)">Pronto: fale com o Mestre Orvan.</b>' : 'Falta: ' + esc(ev.reasons.join(', ')) + '.') + '</p>' : '<p class="note">Evolução máxima alcançada.</p>';
  h += '<h4>Reset</h4><p class="note">Nível volta a 1, atributos voltam à base e você recebe ' + fmt(R.RATES.resetPoints) + ' pontos × resets (+' + R.RATES.resetBonusPerLevel + ' por nível acima de 400). Custo ' + fmt(rs.cost) + ' Gold. ' + (rs.ok ? '<b style="color:var(--ok)">Disponível com o Mestre Orvan.</b>' : 'Falta: ' + esc(rs.reasons.join(', ')) + '.') + '</p>';
  return h;
}

export function paneSkills() {
  const ch = G.ch, st = G.st;
  const pts = R.treePoints(ch) - R.treeSpent(ch);
  let h = '<h3>Habilidades</h3><p class="note">Custam MP e AG. Teclas 1–6 lançam no cursor; clique no slot para escolher a do botão direito.</p>';
  R.skillsFor(ch.cls).forEach((id) => {
    const sk = R.SKILLS[id];
    const ok = skillUnlocked(id);
    const inBar = ch.skillBar.indexOf(id);
    const c = R.skillCost(st, sk);
    h += '<div class="skill' + (ok ? '' : ' locked') + '"><img class="skic" src="' + skillIconURI(id) + '" alt=""><div><span class="t">' + esc(sk.name) + '</span> <span class="c">· MP ' + c.mp + ' · AG ' + c.ag + ' · recarga ' + sk.cd + 's' + (sk.mult ? ' · ×' + sk.mult : '') + (st.boosts[id] ? ' · +' + st.boosts[id] + '%' : '') + '</span><div class="c">' + esc(sk.desc) + '</div>' +
      (ok ? '' : '<div class="c" style="color:var(--danger)">Requer nível ' + sk.lvl + (sk.tier ? ' e ' + R.CLASSES[ch.cls].tiers[sk.tier] : '') + '</div>') + '</div><div>' +
      (ok ? (inBar >= 0 ? '<button class="btn sm" data-act="unbar" data-id="' + id + '">Slot ' + (inBar + 1) + ' ✕</button>' : '<button class="btn sm" data-act="bar" data-id="' + id + '"' + (ch.skillBar.length >= 6 ? ' disabled' : '') + '>Pôr na barra</button>') : '') + '</div></div>';
  });
  h += '<h4>Árvore de maestria · <span class="pts">' + pts + ' pontos</span></h4><p class="note">1 ponto a cada 10 níveis, +10 por reset, +5 por evolução. Até 5 ranks por nó.</p><div class="tree">';
  R.TREES[ch.cls].forEach((br, bi) => {
    h += '<div class="branch"><h5>' + esc(br.name) + '</h5>';
    br.nodes.forEach((n, ni) => {
      const nid = R.treeNodeId(ch.cls, bi, ni);
      const r = ch.tree[nid] || 0;
      const k = n[0];
      const lab = k.indexOf('skill:') === 0 ? R.SKILLS[k.slice(6)].name + ' +' + n[1] + '%' : { dmgPct: 'Dano', critPct: 'Crítico', hpPct: 'HP', defPct: 'Defesa', lifeSteal: 'Roubo de vida', agRegen: 'Regen. AG', atkSpeedPct: 'Vel. ataque', excPct: 'Excelente', costPct: 'Custo MP/AG', cdPct: 'Recarga', mpPct: 'MP', healPct: 'Cura', moveSpeedPct: 'Movimento', mfPct: 'Encontrar Magia' }[k] + ' ' + (n[1] > 0 ? '+' : '') + n[1] + '%';
      h += '<button class="node' + (r ? ' has' : '') + '" data-act="node" data-id="' + nid + '"' + (pts > 0 && r < 5 ? '' : ' disabled') + '><span class="rk">' + r + '/5</span><b>' + esc(n[2]) + '</b><span>' + esc(lab) + ' por rank</span></button>';
    });
    h += '</div>';
  });
  h += '</div>';
  return h;
}

// ---------- tabela de drops ----------
export function paneLoot() {
  let h = '<h3>Drops</h3>';
  {
    const st = G.st;
    const rows = ['comum', 'magico', 'excelente', 'ancestral', 'lendario'];
    const t0 = R.rarityTable(0, 'normal'), tn = R.rarityTable(st.mf, 'normal'), te = R.rarityTable(st.mf, 'elite'), tb = R.rarityTable(st.mf, 'boss');
    const pc = (v) => (v * 100 < 0.1 ? (v * 100).toFixed(3) : (v * 100).toFixed(2)) + '%';
    h += '<p>Seu Encontrar Magia: <b>' + st.mf + '%</b> · efetivo para Excelente+ <b>' + R.mfEffective(st.mf).toFixed(1) + '%</b> (retorno decrescente, teto suave ' + R.MF_SOFTCAP + ').</p>';
    h += '<div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Raridade (dado que caiu item)</th><th>Base</th><th>Você</th><th>Elite</th><th>Chefe</th></tr></thead><tbody>' +
      rows.map((r) => '<tr><td style="color:' + R.RARITY[r].color + '">' + R.RARITY[r].name + '</td><td>' + pc(t0[r]) + '</td><td>' + pc(tn[r]) + '</td><td>' + pc(te[r]) + '</td><td>' + pc(tb[r]) + '</td></tr>').join('') + '</tbody></table></div>';
    h += '<p class="note">Chance de item por monstro comum: ' + (R.DROP_CHANCE.item * (1 + st.mf / 400) * 100).toFixed(1) + '%. Elites soltam 1–2 itens garantidos; chefes 3–5. 60% dos itens favorecem sua classe.</p>';
    h += '<p class="note">Cada drop usa seed = hash(seed do andar, id do monstro, contador de abates): a mesma seed sempre gera o mesmo item.</p>';
    h += '<h4>Últimos drops</h4><div class="list">' + (G.dropLog.length ? G.dropLog.slice(0, 15).map((d) => '<div class="li"><span style="color:' + R.RARITY[d.rarity].color + '">' + esc(d.name) + '</span><span class="a note">' + d.src + '</span><span class="s mono">seed ' + d.seed + (d.roll != null ? ' · rolagem ' + d.roll.toFixed(5) : '') + ' · MF ' + d.mf + '%</span></div>').join('') : '<p class="note">Mate alguns monstros.</p>') + '</div>';
  }
  return h;
}

export function paneOpts() {
  const s = S.settings;
  let h = '<h3>Opções</h3>';
  h += '<h4>Gráficos</h4><div class="row"><select class="fld" id="qualSel" aria-label="Qualidade gráfica">' + ['alta', 'media', 'baixa'].map((q) => '<option value="' + q + '"' + (s.quality === q ? ' selected' : '') + '>' + { alta: 'Alta (sombras, 2× DPR)', media: 'Média', baixa: 'Baixa (sem sombras)' }[q] + '</option>').join('') + '</select>' +
    '<button class="btn" data-act="toggleOutline">Contorno cartoon: ' + (s.outline === false ? 'desligado' : 'ligado') + '</button></div>';
  h += '<h4>Interface</h4><div class="row"><button class="btn" data-act="toggleSound">Som: ' + (s.sound ? 'ligado' : 'desligado') + '</button><button class="btn" data-act="cycleMusic">Música: ' + MUSIC_LEVELS[musicLevel(s)].name + '</button><button class="btn" data-act="toggleLabels">Nomes de itens: ' + (s.labels ? 'todos' : 'só raros (Alt mostra todos)') + '</button></div>';
  const shakeLv = s.shake == null ? 1 : s.shake;
  h += '<h4>Jogabilidade</h4><div class="row">' +
    '<button class="btn" data-act="cycleShake">Tremor de tela: ' + ({ 0: 'desligado', 0.5: 'suave', 1: 'normal' }[shakeLv] || 'normal') + '</button>' +
    '<button class="btn" data-act="toggleHitStop">Pausa de impacto: ' + (s.hitStop === false ? 'desligada' : 'ligada') + '</button>' +
    '<button class="btn" data-act="toggleAutoPause">Pausar ao sair da janela: ' + (s.autoPause === false ? 'não' : 'sim') + '</button></div>' +
    '<p class="note">Com "reduzir movimento" ativo no sistema, o tremor fica limitado e a pausa de impacto desligada. Esc pausa o jogo.</p>';
  h += '<h4>Câmera</h4><p class="note">Botão do meio ou Ctrl + arrastar gira a câmera; roda do mouse aproxima. A visão isométrica fixa é a mais legível: as paredes baixas das masmorras são calculadas para ela.</p><div class="row"><button class="btn sm" data-act="camreset">Voltar à visão isométrica (Home)</button></div>';
  h += '<h4>Modo de teste</h4><p class="note">Atalhos para avaliar sistemas de fim de jogo sem grind.</p><div class="row">' +
    '<button class="btn sm" data-act="t-lvl">+100 níveis</button><button class="btn sm" data-act="t-gold">+5.000.000 Gold</button><button class="btn sm" data-act="t-leg">Gerar item lendário</button><button class="btn sm" data-act="t-jew">+10 de cada Jewel</button><button class="btn sm" data-act="t-boss">+5 chefes</button></div>';
  h += '<h4>Conta</h4><div class="row"><button class="btn" data-act="quit">Voltar à tela inicial</button><button class="btn" data-act="wipe">' + (UI.confirmWipe ? 'Confirmar: apagar tudo' : 'Apagar todos os dados locais') + '</button></div>';
  h += '<p class="note" style="margin-top:14px">Protótipo Forja-deira v' + R.VERSION + ' · Three.js r160 · jogo offline. Progresso salvo neste navegador.</p>';
  return h;
}
