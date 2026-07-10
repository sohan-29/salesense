import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Spinner from './Spinner';

/**
 * Guard: redirect to /login when unauthenticated; render children when loaded.
 * `roles` (optional array) restricts to specific roles.
 */
export default function ProtectedRoute({ children, roles }) {
  const { account, role, loading } = useAuth();
  if (loading) return <Spinner label="Loading session…" />;
  if (!account) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(role)) return <Navigate to="/" replace />;
  return children;
}
