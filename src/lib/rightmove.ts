// Fetch a Rightmove listing's floorplan image URL via our Supabase Edge Function.
// A browser can't fetch rightmove.co.uk directly (CORS), so the function does the
// server-side fetch + parse. Until it's deployed (Phase E), this throws a clear
// message pointing the user at upload / image-URL instead.
import { RIGHTMOVE_ENDPOINT, SUPABASE_ANON_KEY } from './config';

export class RightmoveNotConfigured extends Error {}

export async function fetchRightmoveFloorplan(propertyUrl: string): Promise<string> {
  if (!RIGHTMOVE_ENDPOINT) {
    throw new RightmoveNotConfigured(
      "Rightmove URL import isn't switched on yet (needs the Supabase Edge Function, Phase E). " +
        'For now, download the floorplan image from Rightmove and use "Upload floorplan" or "Image URL".',
    );
  }
  const res = await fetch(RIGHTMOVE_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(SUPABASE_ANON_KEY ? { authorization: `Bearer ${SUPABASE_ANON_KEY}`, apikey: SUPABASE_ANON_KEY } : {}),
    },
    body: JSON.stringify({ url: propertyUrl }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Couldn't fetch that Rightmove floorplan (${res.status}). ${text}`.trim());
  }
  const data = (await res.json()) as { floorplanUrl?: string; error?: string };
  if (data.error) throw new Error(data.error);
  if (!data.floorplanUrl) throw new Error('No floorplan image was found on that Rightmove listing.');
  return data.floorplanUrl;
}
