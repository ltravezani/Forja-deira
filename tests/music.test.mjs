import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './helpers.mjs';

const { MUSIC_THEMES, MUSIC_LEVELS, musicLevel, scaleNote } = await load('engine/music.js');
const { BIOMES } = await load('world/biomes.js');

test('todo tipo de mapa tem um tema de música', () => {
  for (const b of Object.keys(BIOMES)) assert.ok(MUSIC_THEMES[b], 'sem tema: ' + b);
});

test('temas usam graus válidos e notas audíveis', () => {
  for (const [name, th] of Object.entries(MUSIC_THEMES)) {
    assert.ok(th.bpm > 0 && th.barsPerChord > 0, name);
    for (const d of th.chords) {
      assert.ok(Number.isInteger(d) && d >= 0 && d < th.scale.length, name + ' acorde ' + d);
      const lo = scaleNote(th, d, -1), hi = scaleNote(th, 2 * th.scale.length, th.lead.oct);
      assert.ok(lo >= 24 && hi <= 108, name + ' fora da faixa: ' + lo + '..' + hi);
    }
  }
});

test('scaleNote atravessa oitavas', () => {
  const th = { root: 60, scale: [0, 2, 4, 5, 7, 9, 11] };
  assert.equal(scaleNote(th, 0), 60);
  assert.equal(scaleNote(th, 7), 72);
  assert.equal(scaleNote(th, 2, -1), 52);
});

test('nível de música: padrão média e valores inválidos ignorados', () => {
  assert.equal(MUSIC_LEVELS[musicLevel({})].name, 'média');
  assert.equal(musicLevel({ music: 0 }), 0);
  assert.equal(musicLevel({ music: 9 }), 2);
  assert.equal(musicLevel(null), 2);
});
