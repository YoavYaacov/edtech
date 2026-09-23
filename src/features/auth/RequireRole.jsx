import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, homePathFor } from './AuthProvider';
import { ErrorState, LoadingState } from '../../components/ui/States';
import Button from '../../components/ui/Button';
import { errors, nav } from '../../i18n/he';

// UX guard only. Real authorization is enforced by RLS in the database.
export default function RequireRole({ role, children }) {
  const { session, profile, profileStatus, isInitializing, reloadProfile, signOut } = useAuth();
  const location = useLocation();

  if (isInitializing) return <LoadingState fullPage />;

  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  if (profileStatus === 'error' || profileStatus === 'missing') {
    return (
      <ErrorState
        fullPage
        message={profileStatus === 'missing' ? errors.profileMissing : errors.profileLoad}
        onRetry={profileStatus === 'error' ? reloadProfile : undefined}
      >
        <Button variant="ghost" onClick={signOut}>{nav.signOut}</Button>
      </ErrorState>
    );
  }

  if (role && profile.role !== role) return <Navigate to={homePathFor(profile.role)} replace />;

  return children;
}
