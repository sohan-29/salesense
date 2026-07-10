import { createContext, useContext, useEffect, useState } from 'react';
import { authApi } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [vendor, setVendor] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount: if we have a token, fetch the profile.
  useEffect(() => {
    const token = localStorage.getItem('shopsense_token');
    if (!token) {
      setLoading(false);
      return;
    }
    authApi
      .me()
      .then(({ vendor: v }) => setVendor(v))
      .catch(() => localStorage.removeItem('shopsense_token'))
      .finally(() => setLoading(false));
  }, []);

  const login = async (credentials) => {
    const { token, vendor: v } = await authApi.login(credentials);
    localStorage.setItem('shopsense_token', token);
    setVendor(v);
    return v;
  };

  const register = async (body) => {
    const { token, vendor: v } = await authApi.register(body);
    localStorage.setItem('shopsense_token', token);
    setVendor(v);
    return v;
  };

  const logout = () => {
    localStorage.removeItem('shopsense_token');
    setVendor(null);
  };

  const refreshVendor = async () => {
    const { vendor: v } = await authApi.me();
    setVendor(v);
    return v;
  };

  const isAdmin = vendor?.role === 'admin';

  return (
    <AuthContext.Provider
      value={{ vendor, loading, isAdmin, login, register, logout, refreshVendor, setVendor }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
