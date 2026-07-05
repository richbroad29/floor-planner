// Supabase Edge Function (Deno) — fetch a Rightmove listing server-side and
// return its floorplan image URL. A browser can't fetch rightmove.co.uk directly
// (CORS), so this does it. Deploy in Phase E:
//
//   supabase functions deploy rightmove
//
// It is NOT part of the front-end build (lives outside src/, uses Deno APIs).

const cors: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'content-type': 'application/json' },
  });
}

// Walk any parsed JSON looking for `floorplans: [{ url }]` entries.
function collectFloorplanUrls(node: unknown, out: string[]) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const n of node) collectFloorplanUrls(n, out);
    return;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key.toLowerCase() === 'floorplans' && Array.isArray(value)) {
      for (const fp of value) {
        const u = (fp as Record<string, unknown>)?.url;
        if (typeof u === 'string' && /^https?:/.test(u)) out.push(u);
      }
    }
    collectFloorplanUrls(value, out);
  }
}

// @ts-expect-error Deno global is available in the Edge runtime, not in app tsc
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { url } = await req.json();
    if (typeof url !== 'string' || !/rightmove\.co\.uk/i.test(url)) {
      return json({ error: 'Please provide a rightmove.co.uk property URL.' }, 400);
    }

    const resp = await fetch(url, {
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'accept-language': 'en-GB,en;q=0.9',
      },
    });
    if (!resp.ok) return json({ error: `Rightmove returned ${resp.status}.` }, 502);
    const html = await resp.text();

    const urls: string[] = [];
    const next = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (next) {
      try {
        collectFloorplanUrls(JSON.parse(next[1]), urls);
      } catch {
        /* ignore parse errors, fall through */
      }
    }
    if (!urls.length) {
      const legacy = html.match(/window\.PAGE_MODEL\s*=\s*(\{[\s\S]*?\});/);
      if (legacy) {
        try {
          collectFloorplanUrls(JSON.parse(legacy[1]), urls);
        } catch {
          /* ignore */
        }
      }
    }
    if (!urls.length) {
      const re = /https:\/\/media[^"']*_FLP_[^"']*\.(?:png|jpe?g|gif)/gi;
      const found = html.match(re);
      if (found) urls.push(...found);
    }

    if (!urls.length) return json({ error: 'No floorplan image found on that listing.' }, 404);
    return json({ floorplanUrl: urls[0] }, 200);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
