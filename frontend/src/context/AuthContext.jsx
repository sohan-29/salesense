import { createContext, useContext, useEffect, useState } from 'react';
import { authApi } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [role, setRole] = useState(null); // 'customer' | 'vendor' | 'admin'
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
      .then(({ account: a, role: r }) => {
        setAccount(a);
        setRole(r);
      })
      .catch(() => localStorage.removeItem('shopsense_token'))
      .finally(() => setLoading(false));
  }, []);

  const store = (token, a, r) => {
    localStorage.setItem('shopsense_token', token);
    setAccount(a);
    setRole(r);
  };

  const login = async (kind, credentials) => {
    const fn = {
      customer: authApi.customerLogin,
      vendor: authApi.vendorLogin,
      admin: authApi.adminLogin,
    }[kind];
    const { token, account: a, role: r } = await fn(credentials);
    store(token, a, r);
    return { account: a, role: r };
  };

  const register = async (kind, body) => {
    const fn = {
      customer: authApi.customerRegister,
      vendor: authApi.vendorRegister,
      admin: authApi.adminRegister,
    }[kind];
    const { token, account: a, role: r } = await fn(body);
    store(token, a, r);
    return { account: a, role: r };
  };

  const logout = () => {
    localStorage.removeItem('shopsense_token');
    setAccount(null);
    setRole(null);
  };

  const refreshAccount = async () => {
    const { account: a, role: r } = await authApi.me();
    setAccount(a);
    setRole(r);
    return { account: a, role: r };
  };

  return (
    <AuthContext.Provider
      value={{
        account,
        role,
        loading,
        isAdmin: role === 'admin',
        isVendor: role === 'vendor',
        isCustomer: role === 'customer',
        login,
        register,
        logout,
        refreshAccount,
        setAccount,
      }}
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
