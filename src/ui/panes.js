// ---------- painéis Personagem, Habilidades, Drops e Opções ----------
import { gltfEnabled, gltfStats } from '../art/gltfModels.js';
import { Cloud } from '../core/cloud.js';
import { CONFIG, uiScale } from '../core/config.js';
import { G, S, UI } from '../core/state.js';
import { dec, esc, fmt, R, touchUI } from '../core/util.js';
import { sfxVolume } from '../engine/audio.js';
import { musicVolume } from '../engine/music.js';
import { bloomOn } from '../engine/renderer.js';
import { autoSkillAllowed, autoSkillOn } from '../game/automation.js';
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
    '<dt>Pontos de Combate (CP)</dt><dd class="cpv">' + fmt(G.cp || 0) + '</dd>' +
    '<dt>HP / MP / AG</dt><dd>' + fmt(st.maxHp) + ' / ' + fmt(st.maxMp) + ' / ' + fmt(st.maxAg) + '</dd>' +
    '<dt>' + (ch.cls === 'dw' || C.magic ? 'Dano mágico' : 'Dano') + '</dt><dd>' + fmt(st.minDmg) + ' ~ ' + fmt(st.maxDmg) + '</dd>' +
    '<dt>Defesa</dt><dd>' + fmt(st.def) + '</dd>' +
    '<dt>Velocidade de ataque</dt><dd>' + st.atkSpeed + ' (' + dec(st.attackInterval, 2) + 's)</dd>' +
    '<dt>Crítico / Excelente</dt><dd>' + dec(st.critPct) + '% / ' + dec(st.excPct) + '%</dd>' +
    '<dt>Bônus de dano</dt><dd>+' + dec(st.dmgPct) + '%</dd>' +
    '<dt>Redução de dano</dt><dd>' + dec(st.dmgRed, 1) + '%</dd>' +
    '<dt>Multiplicador de habilidade</dt><dd>×' + dec(st.skillMul, 3) + '</dd>' +
    '<dt>Encontrar Magia</dt><dd>' + dec(st.mf) + '% <span class="note">(efetivo p/ raros ' + Math.round(R.mfEffective(st.mf)) + '%)</span></dd>' +
    '<dt>EXP para o próximo nível</dt><dd>' + fmt(R.expToNext(ch.level) - ch.exp) + '</dd></dl>';
  h += '<h4>Evolução de classe</h4>';
  h += '<p>' + C.tiers.map((t, i) => (i === ch.tier ? '<b style="color:var(--gold)">' + t + '</b>' : t)).join(' → ') + '</p>';
  h += ev.next ? '<p class="note">Próxima: ' + esc(ev.name) + ' — requer nível ' + ev.next.level + ', ' + ev.next.bosses + ' chefes' + (ev.next.resets ? ', ' + ev.next.resets + ' reset' : '') + '. ' + (ev.ok ? '<b style="color:var(--ok)">Pronto: fale com o Mestre Orvan.</b>' : 'Falta: ' + esc(ev.reasons.join(', ')) + '.') + '</p>' : '<p class="note">Evolução máxima alcançada.</p>';
  h += '<h4>Reset</h4><p class="note">Nível volta a 1, atributos e árvore de maestria voltam à base e você recebe ' + fmt(R.RATES.resetPoints) + ' pontos × resets (+' + R.RATES.resetBonusPerLevel + ' por nível acima de 400). Custo ' + fmt(rs.cost) + ' de Ouro. ' + (rs.ok ? '<b style="color:var(--ok)">Disponível com o Mestre Orvan.</b>' : 'Falta: ' + esc(rs.reasons.join(', ')) + '.') + '</p>';
  return h;
}

export function paneSkills() {
  const ch = G.ch, st = G.st;
  const pts = R.treePoints(ch) - R.treeSpent(ch);
  let h = '<h3>Habilidades</h3><p class="note">Custam MP e AG. ' + (touchUI() ? 'Toque no botão da habilidade para lançá-la no monstro mais próximo (ou à frente do herói).' : 'Teclas 1–6 lançam no cursor; clique no slot para escolher a do botão direito.') + '</p>' +
    '<p class="note"><b>Auto</b>: a habilidade sai sozinha quando houver um monstro ao alcance (o herói não anda sozinho; Teleporte e investidas ficam de fora).</p>';
  R.skillsFor(ch.cls).forEach((id) => {
    const sk = R.SKILLS[id];
    const ok = skillUnlocked(id);
    const inBar = ch.skillBar.indexOf(id);
    const c = R.skillCost(st, sk);
    h += '<div class="skill' + (ok ? '' : ' locked') + '"><img class="skic" src="' + skillIconURI(id) + '" alt=""><div><span class="t">' + esc(sk.name) + '</span> <span class="c">· MP ' + c.mp + ' · AG ' + c.ag + ' · recarga ' + dec(sk.cd) + 's' + (sk.mult ? ' · ×' + dec(sk.mult) : '') + (st.boosts[id] ? ' · +' + st.boosts[id] + '%' : '') + '</span><div class="c">' + esc(sk.desc) + '</div>' +
      (ok ? '' : '<div class="c" style="color:var(--danger)">Requer nível ' + sk.lvl + (sk.tier ? ' e ' + R.CLASSES[ch.cls].tiers[sk.tier] : '') + '</div>') + '</div><div>' +
      (ok && autoSkillAllowed(id) ? '<button class="btn sm' + (autoSkillOn(id) ? ' gold' : '') + '" data-act="autoskill" data-id="' + id + '" aria-pressed="' + autoSkillOn(id) + '" title="Lançar sozinha perto de monstros">Auto: ' + (autoSkillOn(id) ? 'sim' : 'não') + '</button> ' : '') +
      (ok ? (inBar >= 0 ? '<button class="btn sm" data-act="unbar" data-id="' + id + '">Slot ' + (inBar + 1) + ' ✕</button>' : '<button class="btn sm" data-act="bar" data-id="' + id + '"' + (ch.skillBar.length >= 6 ? ' disabled' : '') + '>Pôr na barra</button>') : '') + '</div></div>';
  });
  h += '<h4>Árvore de maestria · <span class="pts">' + pts + ' pontos</span></h4><p class="note">1 ponto a cada 10 níveis, +10 por reset, +5 por evolução. Até 5 ranks por nó.</p><div class="tree">';
  R.TREES[ch.cls].forEach((br, bi) => {
    h += '<div class="branch"><h5>' + esc(br.name) + '</h5>';
    br.nodes.forEach((n, ni) => {
      const nid = R.treeNodeId(ch.cls, bi, ni);
      const r = ch.tree[nid] || 0;
      const k = n[0];
      const lab = k.indexOf('skill:') === 0 ? R.SKILLS[k.slice(6)].name + ' +' + n[1] + '%' : { dmgPct: 'Dano', critPct: 'Crítico', hpPct: 'HP', defPct: 'Defesa', lifeSteal: 'Roubo de vida', agRegen: 'Regen. AG', atkSpeedPct: 'Vel. ataque', excPct: 'Excelente', costPct: 'Custo MP/AG', cdPct: 'Recarga', mpPct: 'MP', healPct: 'Cura', moveSpeedPct: 'Movimento', mfPct: 'Encontrar Magia' }[k] + ' ' + (n[1] > 0 ? '+' : '') + dec(n[1]) + '%';
      h += '<button class="node' + (r ? ' has' : '') + '" data-act="node" data-id="' + nid + '"' + (pts > 0 && r < 5 ? '' : ' disabled') + '><span class="rk">' + r + '/5</span><b>' + esc(n[2]) + '</b><span>' + esc(lab) + ' por rank</span></button>';
    });
    h += '</div>';
  });
  h += '</div>';
  return h;
}

// ---------- tabela de drops ----------
export function paneLoot() {
  const ch = G.ch;
  let h = '<h3>Drops</h3>';
  const yesNo = (act, on) => '<span class="row" role="group"><button class="btn sm' + (on ? ' gold' : '') + '" data-act="' + act + '" data-v="1" aria-pressed="' + on + '">Sim</button><button class="btn sm' + (on ? '' : ' gold') + '" data-act="' + act + '" data-v="0" aria-pressed="' + !on + '">Não</button></span>';
  h += '<h4>Automação</h4>' +
    '<div class="autorow"><span>Pegar drops do chão automaticamente</span>' + yesNo('autoLoot', !!ch.autoLoot) + '</div>' +
    '<div class="autorow"><span>Enviar pet para vender automaticamente</span>' + yesNo('autoPetSell', !!ch.autoPetSell) + '</div>' +
    '<p class="note">Coleta: tudo que cair a até ' + CONFIG.loot.autoLootRadius + ' m do herói, itens também (com a mochila cheia, os itens ficam no chão). Venda: o pet parte sozinho com ' + CONFIG.loot.autoPetSellMin + '+ itens vendáveis ou com a mochila quase cheia; leva o mesmo que na venda manual, menos Lendários, itens trancados e melhorias para você.</p>';
  {
    const st = G.st;
    const rows = ['comum', 'magico', 'excelente', 'ancestral', 'lendario'];
    const t0 = R.rarityTable(0, 'normal'), tn = R.rarityTable(st.mf, 'normal'), te = R.rarityTable(st.mf, 'elite'), tb = R.rarityTable(st.mf, 'boss');
    const pc = (v) => dec(v * 100, v * 100 < 0.1 ? 3 : 2) + '%';
    h += '<p>Seu Encontrar Magia: <b>' + dec(st.mf) + '%</b> · efetivo para Excelente+ <b>' + dec(R.mfEffective(st.mf), 1) + '%</b> (retorno decrescente, teto suave ' + R.MF_SOFTCAP + ').</p>';
    h += '<div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Raridade (dado que caiu item)</th><th>Base</th><th>Você</th><th>Elite</th><th>Chefe</th></tr></thead><tbody>' +
      rows.map((r) => '<tr><td style="color:' + R.RARITY[r].color + '">' + R.RARITY[r].name + '</td><td>' + pc(t0[r]) + '</td><td>' + pc(tn[r]) + '</td><td>' + pc(te[r]) + '</td><td>' + pc(tb[r]) + '</td></tr>').join('') + '</tbody></table></div>';
    h += '<p class="note">Chance de item por monstro comum: ' + dec(R.DROP_CHANCE.item * (1 + st.mf / 400) * 100, 1) + '%. Elites soltam 1–2 itens garantidos; chefes 3–5. 60% dos itens favorecem sua classe.</p>';
    const SRC = { normal: 'monstro', elite: 'elite', boss: 'chefe', mini: 'mini chefe', chest: 'baú', secret: 'tesouro' };
    const tech = !!UI.techOpen;
    h += '<h4>Últimos drops</h4><div class="list">' + (G.dropLog.length ? G.dropLog.slice(0, 15).map((d) => '<div class="li"><span style="color:' + R.RARITY[d.rarity].color + '">' + esc(d.name) + '</span><span class="a note">' + esc(SRC[d.src] || d.src) + '</span>' +
      (tech ? '<span class="s mono">seed ' + d.seed + (d.roll != null ? ' · rolagem ' + dec(d.roll, 5) : '') + ' · Encontrar Magia ' + dec(d.mf) + '%</span>' : '') + '</div>').join('') : '<p class="note">Mate alguns monstros.</p>') + '</div>';
    // seed e rolagem só interessam a quem audita o sorteio: ficam num bloco recolhido
    h += '<button class="btn sm techbtn" data-act="techToggle" aria-expanded="' + tech + '">' + (tech ? '▾' : '▸') + ' Detalhes técnicos</button>' +
      (tech ? '<p class="note">Cada drop usa seed = hash(seed do andar, id do monstro, contador de abates): a mesma seed sempre gera o mesmo item. A rolagem é o sorteio de raridade (0 a 1) comparado com a tabela acima.</p>' : '');
  }
  return h;
}

export function paneOpts() {
  const s = S.settings;
  let h = '<h3>Opções</h3>';
  h += '<h4>Gráficos</h4><div class="row"><select class="fld" id="qualSel" aria-label="Qualidade gráfica">' + ['alta', 'media', 'baixa'].map((q) => '<option value="' + q + '"' + (s.quality === q ? ' selected' : '') + '>' + { alta: 'Alta (sombras, 2× DPR)', media: 'Média', baixa: 'Baixa (sem sombras)' }[q] + '</option>').join('') + '</select>' +
    '<button class="btn" data-act="toggleOutline">Contorno cartoon: ' + (s.outline === false ? 'desligado' : 'ligado') + '</button>' +
    '<button class="btn" data-act="toggleBloom">Brilho (bloom): ' + (bloomOn() ? 'ligado' : 'desligado') + '</button>' +
    (gltfStats().ready ? '<button class="btn" data-act="toggleAnimChars">Personagens: ' + (gltfEnabled() ? 'animados' : 'simples') + '</button>' : '') + '</div>' +
    '<p class="note">Personagens simples são mais leves; monstros e moradores trocam de modelo na próxima área.</p>';
  const vol = (id, label, v) => '<label class="optrange"><span>' + label + '</span><input type="range" id="' + id + '" min="0" max="100" step="5" value="' + v + '" aria-label="' + label + '"><b class="num">' + v + '%</b></label>';
  h += '<h4>Som</h4><div class="row"><button class="btn" data-act="toggleSound">Som: ' + (s.sound ? 'ligado' : 'desligado') + '</button></div>' +
    vol('sfxVol', 'Efeitos', sfxVolume(s)) + vol('musicVol', 'Música', musicVolume(s));
  h += '<h4>Interface</h4><div class="row"><button class="btn" data-act="toggleLabels">Nomes de itens: ' + (s.labels ? 'todos' : 'só raros (' + (touchUI() ? 'botão Itens' : 'Alt') + ' mostra todos)') + '</button></div>' +
    '<label class="optrange"><span>Escala da interface</span><input type="range" id="uiScale" min="90" max="130" step="10" value="' + uiScale(s) + '" aria-label="Escala da interface"><b class="num">' + uiScale(s) + '%</b></label>';
  const shakeLv = s.shake == null ? 1 : s.shake;
  h += '<h4>Jogabilidade</h4><div class="row">' +
    '<button class="btn" data-act="cycleShake">Tremor de tela: ' + ({ 0: 'desligado', 0.5: 'suave', 1: 'normal' }[shakeLv] || 'normal') + '</button>' +
    '<button class="btn" data-act="toggleHitStop">Pausa de impacto: ' + (s.hitStop === false ? 'desligada' : 'ligada') + '</button>' +
    '<button class="btn" data-act="toggleAutoPause">Pausar ao sair da janela: ' + (s.autoPause === false ? 'não' : 'sim') + '</button></div>' +
    '<p class="note">Com "reduzir movimento" ativo no sistema, o tremor fica limitado e a pausa de impacto desligada. ' + (touchUI() ? 'O botão de pausa fica no menu do topo; fora da cidade, abrir um painel pausa o jogo.' : 'Esc pausa o jogo.') + '</p>';
  h += '<h4>Câmera</h4><p class="note">' + (touchUI() ? 'Afaste ou junte dois dedos na tela para aproximar ou afastar a câmera.' : 'Botão do meio ou Ctrl + arrastar gira a câmera; roda do mouse aproxima.') + ' A visão isométrica fixa é a mais legível: as paredes baixas das masmorras são calculadas para ela.</p><div class="row"><button class="btn sm" data-act="camreset">Voltar à visão isométrica' + (touchUI() ? '' : ' (Home)') + '</button></div>';
  h += '<h4>Conta</h4><div class="row"><button class="btn" data-act="quit">Voltar à tela inicial</button><button class="btn" data-act="wipe">' + (UI.confirmWipe ? 'Confirmar: apagar tudo' : 'Apagar todos os dados locais') + '</button></div>';
  h += '<p class="note">' + (Cloud.user ? 'Conectado à nuvem como <b>' + esc(Cloud.user.email) + '</b>: o progresso sobe sozinho a cada minuto. Apagar os dados locais não apaga o save da nuvem.' : 'Para guardar o progresso na nuvem, use o botão "Salvar na nuvem" na tela inicial.') + '</p>';
  h += '<p class="note" style="margin-top:14px">Protótipo Forja-deira v' + R.VERSION + ' · Three.js r160 · jogo offline. Progresso salvo neste navegador' + (Cloud.user ? ' e na nuvem' : '') + '.</p>';
  return h;
}
