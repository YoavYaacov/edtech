import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

const AuthContext = createContext(null);

// session: undefined = still initializing, null = signed out, object = signed in
// profileStatus: idle | loading | ready | missing | error
export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [profileStatus, setProfileStatus] = useState('idle');

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session ?? null);
    });
    // Never call other Supabase methods inside this callback (can deadlock);
    // profile loading happens in the effect below.
    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession ?? null);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user?.id ?? null;

  const loadProfile = useCallback(async () => {
    if (!userId) {
      setProfile(null);
      setProfileStatus('idle');
      return;
    }
    setProfileStatus('loading');
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, full_name')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      setProfile(null);
      setProfileStatus('error');
    } else if (!data) {
      setProfile(null);
      setProfileStatus('missing');
    } else {
      setProfile(data);
      setProfileStatus('ready');
    }
  }, [userId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      profileStatus,
      isInitializing: session === undefined || (session && (profileStatus === 'idle' || profileStatus === 'loading')),
      reloadProfile: loadProfile,
      signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
      signOut: () => supabase.auth.signOut(),
      sendPasswordReset: (email) =>
        supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/set-password`,
        }),
      updatePassword: (password) => supabase.auth.updateUser({ password }),
    }),
    [session, profile, profileStatus, loadProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export const homePathFor = (role) => (role === 'teacher' ? '/teacher' : '/student');
