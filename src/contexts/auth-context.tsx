"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { authApi, type RegisterPayload } from "@/lib/api/auth.api";
import { ApiClientError } from "@/lib/api/client";
import type { PublicUser } from "@/lib/types";

interface AuthContextValue {
  user: PublicUser | null;
  loading: boolean;
  isAdmin: boolean;
  login: (input: { email: string; password: string }) => Promise<PublicUser>;
  register: (input: RegisterPayload) => Promise<PublicUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (user: PublicUser | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await authApi.me();
      setUser(me.user);
      return;
    } catch (e) {
      // A stale/invalid cookie (expired server-side, old signing secret, etc.)
      // must be cleared once, otherwise cookie-presence middleware bounces
      // /login <-> /dashboard forever. Clear it either way, but never on a
      // transient dependency failure (503) — that must not kick the user out.
      setUser(null);
      if (e instanceof ApiClientError && e.code === "UNAUTHENTICATED") {
        try {
          await authApi.logout();
        } catch {
          /* ignore */
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (input: { email: string; password: string }) => {
    const res = await authApi.login(input);
    setUser(res.user);
    return res.user;
  }, []);

  const register = useCallback(async (input: RegisterPayload) => {
    const res = await authApi.register(input);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isAdmin: user?.role === "admin",
      login,
      register,
      logout,
      refresh,
      setUser,
    }),
    [user, loading, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
