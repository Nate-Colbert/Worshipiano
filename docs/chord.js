// Chord name -> piano notes. Pure functions, no DOM, so it can be tested in Node.

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb']);

export const KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export function notePc(letter, acc) {
  return (LETTER_PC[LETTERS.indexOf(letter)] + (acc === '#' ? 1 : acc === 'b' ? -1 : 0) + 12) % 12;
}

function spell(rootLetter, rootPc, semis, deg) {
  const idx = (LETTERS.indexOf(rootLetter) + deg) % 7;
  const target = (rootPc + semis) % 12;
  let diff = ((target - LETTER_PC[idx] + 18) % 12) - 6; // -6..5
  const acc = diff > 0 ? '#'.repeat(diff) : diff < 0 ? 'b'.repeat(-diff) : '';
  return LETTERS[idx] + acc;
}

/**
 * Parse a chord symbol such as Dm7(4), F2, C/E, Gsus4, Bbmaj7, A7sus4.
 * Returns { name, root, bass, tones:[{semis, deg}] } or null.
 *
 * Conventions for the worship-chart shorthand:
 *   X2      -> add2 (e.g. F2 = F G A C)
 *   X(4)    -> sus4 on a plain major chord, add4 on anything else
 *   Xsus    -> sus4
 */
export function parseChord(name) {
  const m = /^([A-G])([#b]?)(.*)$/.exec(name.trim());
  if (!m) return null;
  const [, letter, acc, restIn] = m;
  let rest = restIn;

  let bass = null;
  const sl = rest.lastIndexOf('/');
  if (sl >= 0) {
    const b = /^([A-G])([#b]?)$/.exec(rest.slice(sl + 1));
    if (b) {
      bass = { letter: b[1], acc: b[2] };
      rest = rest.slice(0, sl);
    }
  }

  const parens = [];
  rest = rest.replace(/\(([#b]?\d+)\)/g, (_, x) => {
    parens.push(x);
    return '';
  });

  let minor = false, hasMaj = false, dim = false, halfDim = false;
  let fifth = 'P', sus = null, power = false;
  let seventh = null; // 'b7' | 'maj7' | 'dim7'
  let six = false;
  const ext = new Set(); // semitone values above root (9th = 14 ...)
  const alters = []; // {s,d}

  const addNumber = (n) => {
    if (n === 2 || n === 9) ext.add('9');
    else if (n === 4 || n === 11) ext.add('11');
    else if (n === 13) ext.add('13');
  };

  let s = rest;
  while (s.length) {
    let mm;
    if ((mm = /^(maj|Maj|M|Δ)/.exec(s))) { hasMaj = true; s = s.slice(mm[0].length); }
    else if ((mm = /^(min|m|-)/.exec(s))) { minor = true; s = s.slice(mm[0].length); }
    else if ((mm = /^(dim|°)/.exec(s))) { dim = true; minor = true; fifth = 'd'; s = s.slice(mm[0].length); }
    else if (s[0] === 'ø') { halfDim = true; minor = true; fifth = 'd'; seventh = 'b7'; s = s.slice(1); }
    else if ((mm = /^(aug|\+)/.exec(s))) { fifth = 'A'; s = s.slice(mm[0].length); }
    else if ((mm = /^sus(2|4)?/.exec(s))) { sus = mm[1] || '4'; s = s.slice(mm[0].length); }
    else if ((mm = /^add(\d+)/.exec(s))) { addNumber(+mm[1]); s = s.slice(mm[0].length); }
    else if ((mm = /^([b#])(\d+)/.exec(s))) {
      const n = +mm[2], flat = mm[1] === 'b';
      if (n === 5) fifth = flat ? 'd' : 'A';
      else if (n === 9) alters.push(flat ? { s: 13, d: 1 } : { s: 15, d: 1 });
      else if (n === 11) alters.push({ s: 18, d: 3 });
      else if (n === 13) alters.push({ s: 20, d: 5 });
      s = s.slice(mm[0].length);
    }
    else if ((mm = /^(\d+)/.exec(s))) {
      const n = +mm[1];
      if (n === 5) power = true;
      else if (n === 6) six = true;
      else if (n === 7) seventh = seventh || (hasMaj ? 'maj7' : dim ? 'dim7' : 'b7');
      else if (n === 9 || n === 11 || n === 13) {
        seventh = seventh || (hasMaj ? 'maj7' : 'b7');
        ext.add('9');
        if (n >= 11) ext.add('11');
        if (n === 13) ext.add('13');
      } else addNumber(n);
      s = s.slice(mm[0].length);
    }
    else s = s.slice(1);
  }
  if (hasMaj && !seventh && !/\d/.test(rest)) seventh = 'maj7'; // "Cmaj"

  for (const p of parens) {
    if (/^[#b]/.test(p)) {
      const n = +p.slice(1), flat = p[0] === 'b';
      if (n === 5) fifth = flat ? 'd' : 'A';
      else if (n === 9) alters.push(flat ? { s: 13, d: 1 } : { s: 15, d: 1 });
      else if (n === 11) alters.push({ s: 18, d: 3 });
      else if (n === 13) alters.push({ s: 20, d: 5 });
    } else if (p === '4' && !minor && !seventh && !six && !ext.size && !sus && !power) {
      sus = '4';
    } else addNumber(+p);
  }

  const tones = [{ semis: 0, deg: 0 }];
  if (sus === '4') tones.push({ semis: 5, deg: 3 });
  else if (sus === '2') tones.push({ semis: 2, deg: 1 });
  else if (!power) tones.push(minor ? { semis: 3, deg: 2 } : { semis: 4, deg: 2 });
  tones.push(fifth === 'd' ? { semis: 6, deg: 4 } : fifth === 'A' ? { semis: 8, deg: 4 } : { semis: 7, deg: 4 });
  if (six) tones.push({ semis: 9, deg: 5 });
  if (seventh === 'b7') tones.push({ semis: 10, deg: 6 });
  if (seventh === 'maj7') tones.push({ semis: 11, deg: 6 });
  if (seventh === 'dim7') tones.push({ semis: 9, deg: 6 });
  if (ext.has('9')) tones.push({ semis: 14, deg: 1 });
  if (ext.has('11')) tones.push({ semis: 17, deg: 3 });
  if (ext.has('13')) tones.push({ semis: 21, deg: 5 });
  tones.push(...alters);
  tones.sort((a, b) => a.semis - b.semis);

  return { name, root: { letter, acc }, bass, tones };
}

/**
 * Notes for a chord, spelled correctly, with a simple piano voicing:
 * left hand = bass note (octave 3), right hand = chord stacked from C4 upward.
 * Returns { name, notes:[names], rh:[{midi,name}], lh:{midi,name} } or null.
 */
export function chordNotes(name) {
  const c = parseChord(name);
  if (!c) return null;
  const rootPc = notePc(c.root.letter, c.root.acc);
  const rootName = c.root.letter + c.root.acc;

  const spelled = c.tones.map((t) => ({
    name: spell(c.root.letter, rootPc, t.semis, t.deg),
    semis: t.semis,
  }));

  const rh = spelled.map((t) => {
    let midi = 60 + rootPc + t.semis;
    while (midi > 83) midi -= 12;
    return { midi, name: t.name };
  });

  const bassName = c.bass ? c.bass.letter + c.bass.acc : rootName;
  const bassPc = c.bass ? notePc(c.bass.letter, c.bass.acc) : rootPc;
  const lh = { midi: 48 + bassPc, name: bassName };

  // note list for text display: bass first if slash chord and not in chord already
  const names = spelled.map((t) => t.name);
  const display = c.bass && !names.includes(bassName) ? [bassName, ...names] : names;
  return { name, notes: display, rh, lh, bassName };
}

export function transposeName(name, semitones, targetKey) {
  const flats = FLAT_KEYS.has(targetKey);
  const m = /^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?))?$/.exec(name.trim());
  if (!m) return name;
  const move = (n) => {
    const pc = (notePc(n[0], n.slice(1)) + semitones + 120) % 12;
    return pcName(pc, flats);
  };
  return move(m[1]) + m[2] + (m[3] ? '/' + move(m[3]) : '');
}

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export function pcName(pc, flats) {
  return (flats ? FLAT_NAMES : SHARP_NAMES)[pc];
}

export function keyPc(key) {
  return notePc(key[0], key.slice(1));
}
