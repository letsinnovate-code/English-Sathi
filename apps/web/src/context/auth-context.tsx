"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  apiLogin,
  apiRegister,
  apiLogout,
  apiGetMe,
  bootstrapSession,
  clearAuth,
} from "@/lib/api";
import type { AuthSessionResponseDTO } from "@english-sathi/shared-types";
import type { LoginInput, RegisterUserInput } from "@english-sathi/validation";

type AuthSession = Omit<AuthSessionResponseDTO, "tokens">;

type AuthState =
  | { status: "loading" }
  | { status: "unauthenticated" }
  | { status: "authenticated"; session: AuthSession };

type AuthContextValue = {
  state: AuthState;
  login: (dto: LoginInput) => Promise<AuthSessionResponseDTO>;
  register: (dto: RegisterUserInput) => Promise<AuthSessionResponseDTO>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" });

  const refresh = useCallback(async () => {
    try {
      const hasSession = await bootstrapSession();
      if (!hasSession) {
        setState({ status: "unauthenticated" });
        return;
      }
      const session = await apiGetMe();
      setState({ status: "authenticated", session });
    } catch {
      clearAuth();
      setState({ status: "unauthenticated" });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (dto: LoginInput) => {
    const session = await apiLogin(dto);
    setState({ status: "authenticated", session });
    return session;
  }, []);

  const register = useCallback(async (dto: RegisterUserInput) => {
    const session = await apiRegister(dto);
    setState({ status: "authenticated", session });
    return session;
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setState({ status: "unauthenticated" });
  }, []);

  return (
    <AuthContext.Provider value={{ state, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export function useSession(): AuthSession | null {
  const { state } = useAuth();
  return state.status === "authenticated" ? state.session : null;
}

