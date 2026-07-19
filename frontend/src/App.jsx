import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import AuthPage from './pages/AuthPage';
import Home from './pages/Home';
import Profile from './pages/Profile';
import VendorSales from './pages/vendor/Sales';
import AdminVendors from './pages/admin/Vendors';
import AdminCustomers from './pages/admin/Customers';
import AdminProducts from './pages/admin/Products';
import AdminTransactions from './pages/admin/Transactions';
import AdminValidation from './pages/admin/Validation';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<AuthPage />} />

          {/* One authenticated layout for all roles; "/" is role-aware. */}
          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/" element={<Home />} />
            <Route path="/profile" element={<Profile />} />

            {/* Vendor only */}
            <Route path="/sales" element={<ProtectedRoute roles={['vendor']}><VendorSales /></ProtectedRoute>} />

            {/* Admin only */}
            <Route path="/vendors" element={<ProtectedRoute roles={['admin']}><AdminVendors /></ProtectedRoute>} />
            <Route path="/customers" element={<ProtectedRoute roles={['admin']}><AdminCustomers /></ProtectedRoute>} />
            <Route path="/products" element={<ProtectedRoute roles={['admin']}><AdminProducts /></ProtectedRoute>} />
            <Route path="/transactions" element={<ProtectedRoute roles={['admin']}><AdminTransactions /></ProtectedRoute>} />
            <Route path="/validation" element={<ProtectedRoute roles={['admin']}><AdminValidation /></ProtectedRoute>} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
