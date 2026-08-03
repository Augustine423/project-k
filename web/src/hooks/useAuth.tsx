import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  ApiRequestError,
  checkAuthAccountExists,
  fetchAuthMe,
  loginAccount,
  resetAuthPassword,
  setAuthUsername,
  signUpAccount,
  type AuthUserDto,
} from "../api/client";
import { normalizeEmail } from "../components/auth/authValidation";

const SESSION_KEY = "projectk.auth.session";

export interface AuthUser {
  id: string;
  email: string;
  username: string | null;
  fullName: string | null;
  needsUsername: boolean;
  /** Preferred name for meetings and dashboard greeting. */
  displayName: string;
}

interface StoredSession {
  token: string;
  user: AuthUserDto;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  signUp: (email: string, password: string, fullName: string) => Promise<AuthUser>;
  signIn: (email: string, password: string) => Promise<AuthUser>;
  signOut: () => void;
  setUsername: (username: string) => Promise<AuthUser>;
  requestPasswordReset: (email: string) => Promise<{ email: string; found: boolean }>;
  resetPassword: (email: string, newPassword: string) => Promise<void>;
  accountExists: (email: string) => Promise<boolean>;
  isAuthenticated: boolean;
  needsUsername: boolean;
  ready: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function toAuthUser(dto: AuthUserDto): AuthUser {
  const displayName = dto.username?.trim() || dto.fullName?.trim() || dto.email.split("@")[0] || "User";
  return {
    id: dto.id,
    email: dto.email,
    username: dto.username,
    fullName: dto.fullName,
    needsUsername: dto.needsUsername || !dto.username?.trim(),
    displayName,
  };
}

function readStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.token || !parsed?.user?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

function persistSession(session: StoredSession | null) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
  // Clear legacy local-only auth keys
  localStorage.removeItem("projectk.users");
  localStorage.removeItem("projectk.session");
  localStorage.removeItem("projectk.displayName");
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const stored = readStoredSession();
  const [token, setToken] = useState<string | null>(stored?.token ?? null);
  const [user, setUser] = useState<AuthUser | null>(stored ? toAuthUser(stored.user) : null);
  const [ready, setReady] = useState(!stored);

  useEffect(() => {
    if (!token) {
      setReady(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const me = await fetchAuthMe(token);
        if (cancelled) return;
        const next = { token, user: me };
        persistSession(next);
        setUser(toAuthUser(me));
      } catch {
        if (cancelled) return;
        persistSession(null);
        setToken(null);
        setUser(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const applySession = useCallback((session: { token: string; user: AuthUserDto }) => {
    persistSession(session);
    setToken(session.token);
    const authUser = toAuthUser(session.user);
    setUser(authUser);
    return authUser;
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    try {
      // Create account in DB but do not auto-login — user must sign in next.
      const session = await signUpAccount({
        email,
        password,
        fullName: fullName.trim() || undefined,
      });
      // #region agent log
      fetch("http://127.0.0.1:7901/ingest/04f6ee3f-e89d-4744-b298-47f83e50cfc2", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "c10931" },
        body: JSON.stringify({
          sessionId: "c10931",
          hypothesisId: "F2",
          location: "useAuth.tsx:signUp",
          message: "Signup succeeded without auto-session",
          data: { email: session.user.email, needsUsername: session.user.needsUsername },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      return toAuthUser(session.user);
    } catch (err) {
      // #region agent log
      fetch("http://127.0.0.1:7901/ingest/04f6ee3f-e89d-4744-b298-47f83e50cfc2", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "c10931" },
        body: JSON.stringify({
          sessionId: "c10931",
          hypothesisId: "F2",
          location: "useAuth.tsx:signUp",
          message: "Signup failed",
          data: { error: err instanceof Error ? err.message : String(err) },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      throw new Error(err instanceof ApiRequestError ? err.message : "Unable to create account.");
    }
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      try {
        const session = await loginAccount({ email, password });
        return applySession(session);
      } catch (err) {
        throw new Error(err instanceof ApiRequestError ? err.message : "Unable to sign in.");
      }
    },
    [applySession],
  );

  const signOut = useCallback(() => {
    persistSession(null);
    setToken(null);
    setUser(null);
  }, []);

  const setUsername = useCallback(
    async (username: string) => {
      if (!token) throw new Error("Not authenticated.");
      try {
        const me = await setAuthUsername(token, username);
        const session = { token, user: me };
        persistSession(session);
        const authUser = toAuthUser(me);
        setUser(authUser);
        return authUser;
      } catch (err) {
        throw new Error(err instanceof ApiRequestError ? err.message : "Unable to save username.");
      }
    },
    [token],
  );

  const requestPasswordReset = useCallback(async (email: string) => {
    const normalized = normalizeEmail(email);
    try {
      return await checkAuthAccountExists(normalized);
    } catch (err) {
      throw new Error(err instanceof ApiRequestError ? err.message : "Unable to continue.");
    }
  }, []);

  const resetPassword = useCallback(async (email: string, newPassword: string) => {
    try {
      await resetAuthPassword(email, newPassword);
    } catch (err) {
      throw new Error(err instanceof ApiRequestError ? err.message : "Unable to reset password.");
    }
  }, []);

  const accountExists = useCallback(async (email: string) => {
    const result = await checkAuthAccountExists(normalizeEmail(email));
    return result.found;
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      signUp,
      signIn,
      signOut,
      setUsername,
      requestPasswordReset,
      resetPassword,
      accountExists,
      isAuthenticated: Boolean(user && token),
      needsUsername: Boolean(user && token && user.needsUsername),
      ready,
    }),
    [
      user,
      token,
      signUp,
      signIn,
      signOut,
      setUsername,
      requestPasswordReset,
      resetPassword,
      accountExists,
      ready,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
