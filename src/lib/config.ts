// Runtime configuration from Vite env vars. These get set in Phase E when the
// Supabase project + Google sign-in are wired up. Empty by default so the app
// runs fully local-first with no backend.
export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

// The Rightmove-import Edge Function endpoint. Defaults to the Supabase
// project's function URL when SUPABASE_URL is set.
export const RIGHTMOVE_ENDPOINT =
  (import.meta.env.VITE_RIGHTMOVE_ENDPOINT as string | undefined) ??
  (SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/rightmove` : '');
