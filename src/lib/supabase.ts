// Supabase client — only created when the env vars are present (Phase E).
// The anon key is a public client key; per-user data is protected by Row-Level
// Security in the database, not by hiding this key.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';

export const supabaseEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase: SupabaseClient | null = supabaseEnabled
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
