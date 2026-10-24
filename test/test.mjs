import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { parseSongPage, isChord } from '../docs/parse.js';
import { chordNotes, transposeName } from '../docs/chord.js';

const notes = (c) => chordNotes(c).notes.join(' ');

// ---- chord -> notes
const cases = {
  C: 'C E G',
  Csus: 'C F G',
  Dm7: 'D F A C',
  'Dm7(4)': 'D F A C G',
  F2: 'F A C G', // add2 voiced above the triad
  Fmaj7: 'F A C E',
  Am7: 'A C E G',
  'G(4)': 'G C D',
  'C/E': 'C E G',
  Bb: 'Bb D F',
  Bbmaj7: 'Bb D F A',
  'F#m7': 'F# A C# E',
  G7: 'G B D F',
  Gsus2: 'G A D',
  Cadd9: 'C E G D',
  Em9: 'E G B D F#',
  Bdim: 'B D F',
  Caug: 'C E G#',
  Eb: 'Eb G Bb',
  A7sus4: 'A D E G',
  'Bm7b5': 'B D F A',
  C6: 'C E G A',
};
for (const [c, want] of Object.entries(cases)) assert.equal(notes(c), want, `${c}: got "${notes(c)}", want "${want}"`);

// slash chord bass
assert.equal(chordNotes('C/E').lh.name, 'E');
assert.equal(chordNotes('D/F#').lh.name, 'F#');
assert.equal(chordNotes('C/D').notes.join(' '), 'D C E G'); // bass not in chord is shown first

// ---- transposing
assert.equal(transposeName('Dm7(4)', 7, 'G'), 'Am7(4)');
assert.equal(transposeName('C/E', 7, 'G'), 'G/B');
assert.equal(transposeName('F2', 5, 'F'), 'Bb2'); // flat key -> flats
assert.equal(transposeName('F2', 2, 'G'), 'G2');
assert.equal(transposeName('C', 1, 'Db'), 'Db');
assert.equal(transposeName('C', 1, 'D'), 'C#');

// ---- chord detection is strict
for (const ok of ['C', 'Dm7(4)', 'F2', 'C/E', 'G(4)', 'Bbmaj7', 'Csus']) assert.ok(isChord(ok), ok);
for (const no of ['presence', 'sit', 'Add', 'Jesus,', 'a', 'Ebb', 'holy', 'You', '|']) assert.ok(!isChord(no), no);

// ---- page parsing (fixture mimics the page structure, lyrics replaced by filler)
const fixture = readFileSync(new URL('./fixture.txt', import.meta.url), 'utf8').replaceAll('<<BR>>', ' ');
const song = parseSongPage(fixture);
const show = (ln) => ln.map((s) => (s.chord ? `[${s.chord}]` : '') + s.text).join('');
assert.equal(song.title, 'Nothing Else');
assert.equal(song.artist, 'Cody Carnes');
assert.equal(song.originalKey, 'C');
assert.equal(song.bpm, 68);
assert.deepEqual(song.sections.map((s) => s.name), ['Intro', 'Chorus', 'Verse 1', 'Bridge X3', 'End Chord']);
assert.deepEqual(song.sections[0].chords, ['Dm7(4)', 'F', 'C', 'Csus', 'C', 'Dm7(4)', 'Fmaj7', 'C', 'Csus', 'C']);
assert.equal(song.sections[0].bars.length, 2);
assert.deepEqual(song.sections[0].bars[0][1], { chord: 'Dm7(4)' });
assert.deepEqual(song.sections[0].bars[0][2], { text: '/' });
assert.deepEqual(song.sections[1].lines.map(show), [
  'Alpha beta gamma [Dm7(4)]delta[F2]',
  'Epsilon zeta [C]eta theta iota',
  'Kappa lambda [Dm7(4)]mikro[F2]ent', // "ent" glues onto "mikro" (a chord split the word)
  'Nu xi [C]pi rho[Csus][C]',
]);
assert.deepEqual(song.sections[2].lines.map(show), ['Rho [F2]sigma tau', 'Upsilon [C/E]phi chi psi']);
assert.deepEqual(song.sections[3].lines.map(show), [
  'Omega [Dm7(4)]You',
  'Nothing else, [F2]nothing else [Am7]Nothing else will [G(4)]do',
]);
assert.deepEqual(song.sections[4].chords, ['G(4)']);
assert.ok(!song.uniqueChords.includes('Ab'), 'key-picker list must not leak into chords');
assert.deepEqual(song.uniqueChords, ['Dm7(4)', 'F', 'C', 'Csus', 'Fmaj7', 'F2', 'C/E', 'Am7', 'G(4)']);

// no explicit breaks: falls back to "capital letter after a chord starts a new line"
const noBreaks = parseSongPage(fixture.replace(/^ $/gm, ''));
assert.equal(show(noBreaks.sections[1].lines[1]), 'Epsilon zeta [C]eta theta iota');

// ---- same page as HTML (chords in their own spans, plus a meta tag)
const html = `<html><head><title>Nothing Else - Cody Carnes | Worship Together</title>
<meta name="cludo:originalKey" content="C"></head><body><h1>Nothing Else</h1>
<ul><li>Ab</li><li>A</li><li>Bb</li></ul>
<div><h4>Verse 1</h4><p>I'm <span class="chord">F2</span> sorry when <span class="chord">C/E</span> I just sang</p></div>
<h3>Request Translation</h3></body></html>`;
const h = parseSongPage(html);
assert.equal(h.originalKey, 'C');
assert.deepEqual(h.sections[0].chords, ['F2', 'C/E']);
assert.equal(show(h.sections[0].lines[0]), "I'm [F2]sorry when [C/E]I just sang"); // spacing kept exactly from the HTML

console.log('all tests passed');
