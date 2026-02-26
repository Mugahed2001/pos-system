import axios from "axios";
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getMeApi, loginApi } from "../api/authApi";
import {
  AUTH_USER_KEY,
  AUTH_TOKEN_KEY,
  AUTH_USERNAME_KEY,
  BRANCH_ID_KEY,
  CONFIG_VERSION_KEY,
  DEVICE_ID_KEY,
  DEVICE_TOKEN_KEY,
} from "../../../shared/constants/keys";
import { storage } from "../../../shared/lib/storage";
import { setUnauthorizedHandler } from "../../../shared/lib/apiClient";
import type { AuthContextValue, AuthUser, LoginPayload } from "./types";
import { ENV } from "../../../app/config/env";

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const SESSION_KEYS = [
  AUTH_TOKEN_KEY,
  AUTH_USER_KEY,
  AUTH_USERNAME_KEY,
  DEVICE_ID_KEY,
  DEVICE_TOKEN_KEY,
  BRANCH_ID_KEY,
  CONFIG_VERSION_KEY,
] as const;

function getAuthErrorStatus(error: unknown): number | undefined {
  if (!axios.isAxiosError(error)) {
    return undefined;
  }
  return error.response?.status;
}

type UserLike = {
  id?: number | null;
  username?: string;
  is_staff?: boolean;
  roles?: string[];
};

function normalizeUser(data: UserLike, fallbackUsername = ""): AuthUser | null {
  const username = typeof data.username === "string" && data.username.trim() ? data.username : fallbackUsername.trim();
  if (!username) {
    return null;
  }

  return {
    id: typeof data.id === "number" ? data.id : null,
    username,
    is_staff: Boolean(data.is_staff),
    roles: Array.isArray(data.roles) ? data.roles.filter((x): x is string => typeof x === "string") : [],
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  const ensureDeviceContext = useCallback(async () => {
    const [storedDeviceId, storedDeviceToken] = await Promise.all([
      storage.getString(DEVICE_ID_KEY),
      storage.getString(DEVICE_TOKEN_KEY),
    ]);

    await Promise.all([
      storedDeviceId ? Promise.resolve() : storage.setString(DEVICE_ID_KEY, ENV.defaultDeviceId),
      storedDeviceToken ? Promise.resolve() : storage.setString(DEVICE_TOKEN_KEY, ENV.defaultDeviceToken),
    ]);
  }, []);

  const clearSessionStorage = useCallback(async () => {
    await Promise.all(SESSION_KEYS.map((key) => storage.remove(key)));
  }, []);

  const clearSessionState = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const signOut = useCallback(async () => {
    await clearSessionStorage();
    clearSessionState();
  }, [clearSessionStorage, clearSessionState]);

  const signIn = useCallback(async (payload: LoginPayload) => {
    const response = await loginApi(payload);
    const resolvedUser = normalizeUser(response, payload.username);
    if (!resolvedUser) {
      throw new Error("Login response is missing username.");
    }

    await ensureDeviceContext();

    await Promise.all([
      storage.setString(AUTH_TOKEN_KEY, response.token),
      storage.setString(AUTH_USER_KEY, JSON.stringify(resolvedUser)),
      storage.remove(AUTH_USERNAME_KEY),
      storage.setString(BRANCH_ID_KEY, response.branch_id ?? ENV.defaultBranchId),
      storage.setString(CONFIG_VERSION_KEY, "0"),
    ]);

    setToken(response.token);
    setUser(resolvedUser);
  }, [ensureDeviceContext]);

  useEffect(() => {
    setUnauthorizedHandler(async () => {
      await clearSessionStorage();
      clearSessionState();
    });
    return () => {
      setUnauthorizedHandler(null);
    };
  }, [clearSessionStorage, clearSessionState]);

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      try {
        const [storedToken, storedUserRaw, legacyUsername] = await Promise.all([
          storage.getString(AUTH_TOKEN_KEY),
          storage.getString(AUTH_USER_KEY),
          storage.getString(AUTH_USERNAME_KEY),
        ]);

        let storedUser: AuthUser | null = null;
        if (storedUserRaw) {
          try {
            storedUser = normalizeUser(JSON.parse(storedUserRaw) as Partial<AuthUser>) ?? null;
          } catch {
            storedUser = null;
          }
        }
        if (!storedUser && legacyUsername) {
          storedUser = normalizeUser({ username: legacyUsername, is_staff: false });
        }

        if (!storedToken) {
          await clearSessionStorage();
          if (isMounted) {
            clearSessionState();
          }
          return;
        }

        await ensureDeviceContext();

        try {
          const me = await getMeApi();
          const verifiedUser = normalizeUser(me, storedUser?.username ?? "");
          if (!verifiedUser) {
            throw new Error("User profile is missing username.");
          }

          const verifiedToken = me.token || storedToken;
          await Promise.all([
            storage.setString(AUTH_TOKEN_KEY, verifiedToken),
            storage.setString(AUTH_USER_KEY, JSON.stringify(verifiedUser)),
            storage.remove(AUTH_USERNAME_KEY),
            storage.setString(BRANCH_ID_KEY, me.branch_id ?? ENV.defaultBranchId),
          ]);
          if (!isMounted) {
            return;
          }
          setToken(verifiedToken);
          setUser(verifiedUser);
        } catch (error: unknown) {
          const status = getAuthErrorStatus(error);
          if (status === 401 || status === 403) {
            await clearSessionStorage();
            if (isMounted) {
              clearSessionState();
            }
            return;
          }

          if (!isMounted) {
            return;
          }
          if (storedUser) {
            setToken(storedToken);
            setUser(storedUser);
          } else {
            clearSessionState();
          }
        }
      } finally {
        if (!isMounted) {
          return;
        }
        setIsBootstrapping(false);
      }
    };

    void bootstrap();
    return () => {
      isMounted = false;
    };
  }, [clearSessionState, clearSessionStorage, ensureDeviceContext]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token && user),
      isBootstrapping,
      signIn,
      signOut,
    }),
    [isBootstrapping, signIn, signOut, token, user],
  );

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return context;
}
