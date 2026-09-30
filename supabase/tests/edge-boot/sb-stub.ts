// Test double for npm:@supabase/supabase-js used ONLY by the boot tests (no network, no real project).
export function createClient() {
  return { auth: { getUser: async () => ({ data: { user: null }, error: { message: "stub" } }) } };
}
