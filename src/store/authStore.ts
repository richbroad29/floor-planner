// Auth state: the signed-in user (via Google) and sign-in/out actions.
// No-ops gracefully when Supabase isn't configured.
import { create } from 'zustand';
import { supabase, supabaseEnabled } from '../lib/supabase';

export interface AuthUser {
  id: string;
  email?: string;
  name?: string;
  avatar?: string;
}

interface AuthState {
  user: AuthUser | null;
  ready: boolean; // initial session check done
  init: () => void;
  signInGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

function toUser(sessionUser: {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
} | null | undefined): AuthUser | null {
  if (!sessionUser) return null;
  const meta = sessionUser.user_metadata ?? {};
  return {
    id: sessionUser.id,
    email: sessionUser.email,
    name: (meta.full_name as string) ?? (meta.name as string) ?? undefined,
    avatar: (meta.avatar_url as string) ?? (meta.picture as string) ?? undefined,
  };
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  ready: !supabaseEnabled, // if there's no backend, we're "ready" immediately
  init: () => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      set({ user: toUser(data.session?.user), ready: true });
    });
    supabase.auth.onAuthStateChange((_event, session) => {
      set({ user: toUser(session?.user), ready: true });
    });
  },
  signInGoogle: async () => {
    if (!supabase) {
      window.alert('Cloud sign-in isn’t switched on yet (Supabase setup pending).');
      return;
    }
    // return to the same page after the Google round-trip
    const redirectTo = window.location.origin + import.meta.env.BASE_URL;
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  },
  signOut: async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    set({ user: null });
  },
}));
