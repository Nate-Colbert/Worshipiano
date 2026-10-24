// Extracts song info, chords and lyric lines (with chord positions) from a
// worshiptogether.com song page. Accepts raw HTML, or plain text (paste fallback).
//
// Section shape:
//   { name, chords:[...all chords in order],
//     bars:[ [ {chord} | {text} ... ] ],            // "| Dm7 / / / |" style lines
//     lines:[ [ {chord:string|null, text:string} ] ] // each segment = chord sitting above its text
//   }

const CHORD_RE =
  /^[A-G][#b]?(?:maj|Maj|min|dim|aug|m|M|sus|add|\+|°|ø|Δ|-)?(?:(?:sus|add|maj|b|#|\+|-)?\d+)*(?:\([#b]?\d+\))*(?:\/[A-G][#b]?)?$/;

const SECTION_RE =
  /^(intro|verse|chorus|pre[- ]?chorus|bridge|tag|outro|interlude|instrumental|turnaround|ending|end chord|refrain|vamp|coda|solo|channel|post[- ]?chorus)(\s*\d+)?(\s*[xX×]\s*\d+)?(\s*\(.*\))?$/i;

// Used only in plain-text mode, to guess whether a fragment continues a word
// that a chord split in half ("mom" + chord + "ent" -> "moment").
const SMALL_WORDS = new Set(
  ('a an the to in of my me i you on up so we he it is no do go be by at as if or and for but not all can are was ' +
    'his her our your one how who why see joy way day now yes new let may get set put out off own run sit God ' +
    'him she its who you too two ten has had did say saw see sea sun son sin win war')
    .split(' ')
);

export function isChord(tok) {
  return CHORD_RE.test(tok);
}

function decode(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
}

// Turn the page into a flat list of {t:'text', v, raw} and {t:'break'} items.
function toItems(input) {
  const markup = /<\w[^>]*>/.test(input);
  const items = [];
  if (markup) {
    let t = input.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, '\u0001');
    t = t.replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|section|ul|ol)>/gi, '\u0001').replace(/<[^>]+>/g, '\u0002');
    for (const part of decode(t).split(/([\u0001\u0002])/)) {
      if (part === '\u0001') items.push({ t: 'break' });
      else if (part === '\u0002' || part === '') continue;
      else {
        const raw = part.replace(/\s+/g, ' ');
        const v = raw.trim();
        if (v) items.push({ t: 'text', v, raw });
      }
    }
  } else {
    for (const l of decode(input).replace(/\r/g, '').split('\n')) {
      const v = l.replace(/\s+/g, ' ').trim();
      if (v) items.push({ t: 'text', v, raw: v });
      else if (l.length > 0) items.push({ t: 'break' }); // whitespace-only line = visual line break
    }
  }
  return { items, markup };
}

function meta(input, name) {
  const a = new RegExp(`(?:name|property)=["'](?:cludo:)?${name}["'][^>]*content=["']([^"']*)["']`, 'i').exec(input);
  if (a) return decode(a[1]).trim();
  const b = new RegExp(`content=["']([^"']*)["'][^>]*(?:name|property)=["'](?:cludo:)?${name}["']`, 'i').exec(input);
  return b ? decode(b[1]).trim() : null;
}

function after(lines, label) {
  const i = lines.findIndex((l) => l.toLowerCase().replace(/:$/, '') === label.toLowerCase());
  return i >= 0 && lines[i + 1] ? lines[i + 1] : null;
}

function continuesWord(prev, next) {
  if (!/[A-Za-z]$/.test(prev)) return false;
  const first = next.split(' ')[0];
  const single = next.trim() === first;
  return single && /^[a-z]{2,4}$/.test(first) && !SMALL_WORDS.has(first);
}

export function parseSongPage(input) {
  const { items, markup } = toItems(input);
  const lines = items.filter((i) => i.t === 'text').map((i) => i.v);

  // ---- metadata
  let title = null, artist = null;
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(input);
  if (h1) title = decode(h1[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
  const pt = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(input);
  const pageTitle = pt
    ? decode(pt[1]).replace(/\s+/g, ' ').trim()
    : lines.find((l) => /\|\s*Worship Together$/i.test(l)) || null;
  if (!title) {
    const hl = lines.find((l) => /^#\s+\S/.test(l));
    if (hl) title = hl.replace(/^#\s+/, '');
  }
  if (pageTitle) {
    const core = pageTitle.split('|')[0].trim();
    const dash = core.lastIndexOf(' - ');
    if (dash > 0) {
      title = title || core.slice(0, dash).trim();
      artist = core.slice(dash + 3).trim();
    }
  }
  const originalKey = meta(input, 'originalKey') || after(lines, 'Original Key');
  const bpmRaw = after(lines, 'BPM');
  const bpm = bpmRaw && /^\d+$/.test(bpmRaw) ? +bpmRaw : null;

  // ---- chart region: first section heading .. "Request Translation" / "Writer(s)"
  const isText = (it) => it.t === 'text';
  const start = items.findIndex((it) => isText(it) && SECTION_RE.test(it.v));
  let end = items.findIndex(
    (it, i) => i > start && isText(it) && (/^(#+\s*)?Request Translation$/i.test(it.v) || /^Writer\(s\):?$/i.test(it.v))
  );
  if (end < 0) end = items.length;

  const explicitBreaks = !markup && items.slice(Math.max(start, 0), end).some((it) => it.t === 'break');
  const sections = [];
  let cur = null, line = null, prev = null, pendingBreak = false;
  const flush = () => {
    if (line && line.length && cur) cur.lines.push(line);
    line = null;
  };

  if (start >= 0) {
    for (const it of items.slice(start, end)) {
      if (it.t === 'break') {
        if (prev === 'T' || prev === 'C') pendingBreak = true;
        continue;
      }
      const v = it.v;

      if (SECTION_RE.test(v)) {
        flush();
        cur = { name: v, chords: [], bars: [], lines: [] };
        sections.push(cur);
        prev = null;
        pendingBreak = false;
        continue;
      }
      if (!cur) continue;

      if (v.startsWith('|')) {
        flush();
        const toks = v.split(/\s+/).map((tok) => (isChord(tok) ? { chord: tok } : { text: tok }));
        cur.bars.push(toks);
        toks.forEach((t) => t.chord && cur.chords.push(t.chord));
        prev = null;
        continue;
      }

      if (isChord(v)) {
        cur.chords.push(v);
        if (!line) line = [];
        line.push({ chord: v, text: '' });
        prev = 'C';
        continue;
      }

      // ---- lyric text
      const chordOnly = line && line.every((s) => !s.text);
      let newLine;
      if (!line) newLine = true;
      else if (markup) newLine = pendingBreak && !chordOnly;
      else {
        // plain text: trust explicit line breaks; with none, guess "capital letter after a chord = new line"
        const guess = !explicitBreaks && prev === 'C' && /^[A-Z]/.test(v);
        newLine = !chordOnly && (prev === 'T' || pendingBreak || guess);
      }

      if (newLine) {
        flush();
        line = [];
      }
      const last = line[line.length - 1];
      if (last && last.chord && !last.text) last.text = it.raw;
      else if (last && markup && prev === 'T') last.text += it.raw;
      else line.push({ chord: null, text: it.raw });
      prev = 'T';
      pendingBreak = false;
    }
    flush();
  }

  const clean = sections.filter((s) => s.chords.length || s.lines.length);

  // ---- tidy spacing
  for (const s of clean) {
    for (const ln of s.lines) {
      if (markup) {
        // a space right after a chord span belongs to the gap between words, not under the chord
        for (let i = 1; i < ln.length; i++) {
          if (/^\s/.test(ln[i].text)) {
            ln[i].text = ln[i].text.replace(/^\s+/, '');
            if (ln[i - 1].text && !/\s$/.test(ln[i - 1].text)) ln[i - 1].text += ' ';
          }
        }
      } else {
        for (let i = 0; i < ln.length - 1; i++) {
          const a = ln[i].text, b = ln[i + 1].text;
          if (a && b) ln[i].text = continuesWord(a, b) ? a : a + ' ';
        }
      }
      if (ln[0]) ln[0].text = ln[0].text.replace(/^\s+/, '');
      const l = ln[ln.length - 1];
      if (l) l.text = l.text.replace(/\s+$/, '');
    }
  }

  const uniqueChords = [...new Set(clean.flatMap((s) => s.chords))];
  return { title, artist, originalKey, bpm, sections: clean, uniqueChords };
}
