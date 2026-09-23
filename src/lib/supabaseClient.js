import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

// Captured BEFORE the client consumes the URL, so the set-password page
// can detect error redirects such as an expired invite link.
export const initialUrlHash = typeof window !== 'undefined' ? window.location.hash : '';

// Only the public anon key is used in the browser. All authorization is
// enforced by Row Level Security in Postgres.
export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
