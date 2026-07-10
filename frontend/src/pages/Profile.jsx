import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import CustomerProfile from './customer/CustomerProfile';
import VendorProfile from './vendor/VendorProfile';

/**
 * Role-aware profile page. Admins have no profile page → go to dashboard.
 */
export default function Profile() {
  const { role } = useAuth();
  if (role === 'customer') return <CustomerProfile />;
  if (role === 'vendor') return <VendorProfile />;
  return <Navigate to="/" replace />;
}
