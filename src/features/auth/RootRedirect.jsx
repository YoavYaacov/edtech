import { Navigate } from 'react-router-dom';
import RequireRole from './RequireRole';
import { useAuth, homePathFor } from './AuthProvider';

function RedirectHome() {
  const { profile } = useAuth();
  return <Navigate to={homePathFor(profile.role)} replace />;
}

export default function RootRedirect() {
  return (
    <RequireRole>
      <RedirectHome />
    </RequireRole>
  );
}
