import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { MemberDTO } from '@nocap/shared';
import { api, setUnauthorizedHandler } from './api';

interface AuthState {
  member: MemberDTO | null;
  checking: boolean;
  logIn: (memberId: string) => Promise<void>;
  logOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [member, setMember] = useState<MemberDTO | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    setUnauthorizedHandler(() => setMember(null));
    api
      .me()
      .then(setMember)
      .catch(() => setMember(null))
      .finally(() => setChecking(false));
  }, []);

  const logIn = useCallback(async (memberId: string) => {
    setMember(await api.devLogin(memberId));
  }, []);

  const logOut = useCallback(async () => {
    await api.logout();
    setMember(null);
  }, []);

  const value = useMemo(
    () => ({ member, checking, logIn, logOut }),
    [member, checking, logIn, logOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
