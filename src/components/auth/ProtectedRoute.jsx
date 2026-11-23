import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import LoadingScreen from '../common/LoadingScreen';

/**
 * Wraps a page element and only renders it when someone is signed in.
 * Pass `requireRole="admin"` to further restrict a route to admin accounts —
 * signed-in users of the wrong role are redirected to the dashboard rather
 * than being told the route doesn't exist.
 *
 * @param {{ children: React.ReactNode, requireRole?: 'user'|'admin' }} props
 */
export default function ProtectedRoute({ children, requireRole }) {
  const { currentUser, signedOut, loading, loadError, retryLoad } = useAuth();
  const location = useLocation();

  // Don't judge "signed in or not" before the server has answered (otherwise every reload signs you out).
  if (loading) return <LoadingScreen error={loadError} onRetry={retryLoad} />;

  if (!currentUser) {
    // Just logged out -> homepage. Otherwise (deep link such as a team invite link while
    // signed out) -> the homepage's log-in popup, remembering where the person was headed.
    if (signedOut) return <Navigate to="/" replace />;
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/?auth=login&next=${encodeURIComponent(next)}`} replace />;
  }
  if (requireRole && currentUser.accountRole !== requireRole) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}
