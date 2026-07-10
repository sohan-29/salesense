import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Spinner from './Spinner';

/**
 * Guard: redirect to /login when unauthenticated; render children when loaded.
 * `adminOnly` additionally restricts to admin role.
 */
export default function ProtectedRoute({ children, adminOnly = false }) {
  const { vendor, loading, isAdmin } = useAuth();
  if (loading) return <Spinner label="Loading session…" />;
  if (!vendor) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
  return children;
}
