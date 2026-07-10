import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import CustomerCatalog from './customer/Catalog';
import VendorProducts from './vendor/MyProducts';
import AdminDashboard from './admin/Dashboard';

/**
 * Role-aware home page. A single route for "/" avoids React Router matching
 * the first of several same-path routes.
 */
export default function Home() {
  const { role } = useAuth();
  if (role === 'customer') return <CustomerCatalog />;
  if (role === 'vendor') return <VendorProducts />;
  if (role === 'admin') return <AdminDashboard />;
  return <Navigate to="/login" replace />;
}
