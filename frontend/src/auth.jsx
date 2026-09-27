import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api('/api/auth/me').then((data) => setUser(data.user)).catch(() => setUser(null)).finally(() => setReady(true));
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await api('/api/auth/login', { method: 'POST', body: { email, password } });
    setUser(data.user);
    return data.user;
  }, []);
  const register = useCallback(async (fields) => {
    const data = await api('/api/auth/register', { method: 'POST', body: fields });
    setUser(data.user);
    return data.user;
  }, []);
  // The account stays signed in on screen until the server confirms the session is gone.
  const logout = useCallback(async () => {
    await api('/api/auth/logout', { method: 'POST', body: {} });
    setUser(null);
  }, []);

  const value = useMemo(() => ({
    user, ready, setUser, login, register, logout,
  }), [user, ready, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
