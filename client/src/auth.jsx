import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, tokens } from './api.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const refreshUser = useCallback(async () => {
    const { data } = await api('/auth/me');
    setUser(data);
    return data;
  }, []);

  useEffect(() => {
    (async () => {
      if (tokens.has()) {
        try {
          await refreshUser();
        } catch {
          tokens.clear();
        }
      }
      setReady(true);
    })();
    const lost = () => setUser(null);
    window.addEventListener('auth-lost', lost);
    return () => window.removeEventListener('auth-lost', lost);
  }, [refreshUser]);

  const authenticate = async (path, body) => {
    const { data } = await api(path, { method: 'POST', body });
    tokens.set(data);
    setUser(data.user);
  };

  const value = {
    user,
    refreshUser,
    login: (b) => authenticate('/auth/login', b),
    register: (b) => authenticate('/auth/register', b),
    logout: () => {
      tokens.clear();
      setUser(null);
    },
  };

  if (!ready) return <p className="center muted">Загрузка…</p>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}