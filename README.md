# Piano Chord Helper

Paste a worshiptogether.com song link, get every chord as piano notes (with a keyboard diagram, tap-to-hear, and a key changer).

- **Frontend** (`docs/`): static site, hosted free on **GitHub Pages**.
- **Backend** (`supabase/functions/fetch-song`): a tiny **Supabase Edge Function** that fetches the song page for the browser (browsers can't do this directly because of CORS). It only accepts `https://www.worshiptogether.com/songs/...` links.
- Chord/lyric parsing and chord-to-notes logic run in the browser (`docs/parse.js`, `docs/chord.js`). The lyrics are read live from the page each time and shown with the chords above the words; nothing is stored. (Lyrics belong to their owners, so keep it for personal use and avoid saving them in a public database.)

## Deploy

### 1. Supabase
```bash
npm i -g supabase            # or: brew install supabase/tap/supabase
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase functions deploy fetch-song --no-verify-jwt
```
`--no-verify-jwt` lets the public page call it without an API key. The function is locked to worshiptogether.com song URLs, so it can't be used as a general proxy.

### 2. Point the frontend at it
Edit `docs/config.js`:
```js
export const FUNCTION_URL = 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/fetch-song';
```

### 3. GitHub Pages
Push this folder to a GitHub repo, then **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/docs`**.
Your app will be at `https://YOUR-USER.github.io/YOUR-REPO/`.

## Run locally
```bash
npm test          # parser + chord tests
npm run serve     # serves docs/ locally
```

## How chords become notes
- Notes are spelled properly (Bb not A#, F# not Gb) and follow the song's key when you transpose.
- Left hand plays the bass note (the root, or the note after the slash in `C/E`); right hand plays the chord from middle C upward.
- Worship-chart shorthand:
  - `F2` = add2 (F A C G)
  - `Csus` = sus4
  - `G(4)` = sus4 on a plain major chord (G C D)
  - `Dm7(4)` = Dm7 with the 4th added (D F A C G)
- If a chart writes a chord differently from how you'd play it, edit the rules in `parseChord()` in `docs/chord.js`.

## If the page structure changes
The page text is read in `docs/parse.js` (`parseSongPage`). If the site changes and nothing is found, use the "paste the page text" box in the app as a fallback, and adjust the parser.
