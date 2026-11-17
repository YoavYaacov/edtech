import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { homePathFor, useAuth } from './AuthProvider';
import { freshOpenTarget, isFreshOpen } from './freshOpen';

// Mounted once inside the router. Acts once, when the session and profile are ready on a fresh open.
export default function FreshOpenRedirect() {
  const { session, profile, isInitializing } = useAuth();
  const [pending, setPending] = useState(() => isFreshOpen());
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!pending || isInitializing) return;
    setPending(false);
    if (!session || !profile) return;
    const target = freshOpenTarget(location.pathname, homePathFor(profile.role));
    if (target) navigate(target, { replace: true });
  }, [pending, isInitializing, session, profile, location.pathname, navigate]);
  return null;
}
