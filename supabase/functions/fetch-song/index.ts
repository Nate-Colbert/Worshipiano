// Supabase Edge Function: fetches a worshiptogether.com song page and returns its HTML.
// (Browsers can't fetch it directly because of CORS, so this acts as a tiny proxy.
//  All parsing happens in the browser, in docs/parse.js.)

const ALLOWED_HOSTS = new Set(["www.worshiptogether.com", "worshiptogether.com"]);
const MAX_BYTES = 3_000_000;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const { url } = await req.json().catch(() => ({ url: null }));
  let u: URL;
  try {
    u = new URL(String(url));
  } catch {
    return json({ error: "That doesn't look like a valid URL." }, 400);
  }
  if (u.protocol !== "https:" || !ALLOWED_HOSTS.has(u.hostname) || !u.pathname.startsWith("/songs/")) {
    return json({ error: "Only https://www.worshiptogether.com/songs/... links are supported." }, 400);
  }

  let res: Response;
  try {
    res = await fetch(u.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PianoChordHelper/1.0)",
        Accept: "text/html",
        "Accept-Language": "en",
      },
    });
  } catch (e) {
    return json({ error: `Couldn't reach the site: ${(e as Error).message}` }, 502);
  }

  // make sure redirects didn't take us somewhere else
  if (!ALLOWED_HOSTS.has(new URL(res.url).hostname)) return json({ error: "Unexpected redirect." }, 502);
  if (!res.ok) return json({ error: `Site returned ${res.status}` }, 502);

  const html = await res.text();
  if (html.length > MAX_BYTES) return json({ error: "Page too large." }, 413);
  return json({ html });
});
