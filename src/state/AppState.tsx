import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AuthSession,
  CustomerProfile,
  getCurrentCustomer,
  getFavoriteProperties,
  logoutCustomerSession,
  refreshCustomerSession,
  removeCustomerPushToken,
  saveCustomerProperty,
  setCustomerSessionRefreshHandler,
  unsaveCustomerProperty,
  updateCurrentCustomer,
  UpdateCustomerProfileInput,
} from '../api/customer';
import { FAVORITE_IDS_CACHE_PREFIX } from './primaryTabCache';
import { preloadPrimaryTabs } from './preload';
import { registerForFcmPushNotificationsAsync } from '../services/notifications';

const AUTH_SESSION_KEY = 'builtglory.authSession';
const ACCESS_TOKEN_REFRESH_BUFFER_MS = 60_000;
const fallbackStorage = new Map<string, string>();

async function getStoredValue(key: string) {
  try {
    const value = await AsyncStorage.getItem(key);
    if (value !== null) fallbackStorage.set(key, value);
    return value ?? fallbackStorage.get(key) ?? null;
  } catch {
    return fallbackStorage.get(key) ?? null;
  }
}

async function setStoredValue(key: string, value: string) {
  fallbackStorage.set(key, value);
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // Auth can still continue in-memory if native storage is temporarily unavailable.
  }
}

async function removeStoredValue(key: string) {
  fallbackStorage.delete(key);
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // Sign-out can still clear in-memory state if native storage is temporarily unavailable.
  }
}

type StoredAuthSession = AuthSession & {
  accessTokenExpiresAt: number;
  refreshedAt: number;
  user?: CustomerProfile | null;
};

type AppStateValue = {
  fav: Set<string>;
  authToken: string | null;
  currentUser: CustomerProfile | null;
  getCachedValue: <T>(key: string, maxAgeMs?: number) => T | null;
  setCachedValue: <T>(key: string, value: T) => void;
  clearCachedValue: (key: string) => void;
  toggleFav: (id: string) => void;
  loadFavoriteIds: () => Promise<Set<string>>;
  toggleRemoteFavorite: (id: string) => Promise<boolean>;
  validateToken: () => Promise<CustomerProfile | null>;
  preloadPrimaryTabResources: () => Promise<void>;
  signIn: (session?: AuthSession) => Promise<CustomerProfile | null>;
  signOut: () => Promise<void>;
  refreshCurrentUser: () => Promise<CustomerProfile | null>;
  updateProfile: (data: UpdateCustomerProfileInput) => Promise<CustomerProfile>;
};

const AppStateContext = createContext<AppStateValue | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [fav, setFav] = useState<Set<string>>(new Set());
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<CustomerProfile | null>(null);
  const authTokenRef = useRef<string | null>(null);
  const currentUserRef = useRef<CustomerProfile | null>(null);
  const refreshInFlightRef = useRef<Promise<AuthSession | null> | null>(null);
  const cacheRef = useRef(new Map<string, { value: unknown; updatedAt: number }>());

  const getCachedValue = useCallback(<T,>(key: string, maxAgeMs = 5 * 60 * 1000) => {
    const entry = cacheRef.current.get(key);
    if (!entry) return null;
    if (Date.now() - entry.updatedAt > maxAgeMs) return null;
    return entry.value as T;
  }, []);

  const setCachedValue = useCallback(<T,>(key: string, value: T) => {
    cacheRef.current.set(key, { value, updatedAt: Date.now() });
  }, []);

  const clearCachedValue = useCallback((key: string) => {
    cacheRef.current.delete(key);
  }, []);

  const toggleFav = useCallback((id: string) => {
    setFav((f) => {
      const s = new Set(f);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  }, []);

  const loadFavoriteIds = useCallback(async () => {
    if (!authToken) {
      setFav(new Set());
      return new Set<string>();
    }
    const cached = getCachedValue<Set<string>>(`${FAVORITE_IDS_CACHE_PREFIX}:${authToken}`);
    if (cached) {
      setFav(cached);
      return cached;
    }
    const favorites = await getFavoriteProperties(authToken);
    const ids = new Set(favorites.map((property) => String(property._id ?? property.id ?? '')).filter(Boolean));
    setFav(ids);
    setCachedValue(`${FAVORITE_IDS_CACHE_PREFIX}:${authToken}`, ids);
    return ids;
  }, [authToken, getCachedValue, setCachedValue]);

  const toggleRemoteFavorite = useCallback(async (id: string) => {
    if (!authToken) throw new Error('A valid customer session is required.');
    const wasSaved = fav.has(id);
    const next = new Set(fav);
    if (wasSaved) next.delete(id);
    else next.add(id);
    setFav(next);

    try {
      if (wasSaved) await unsaveCustomerProperty(authToken, id);
      else await saveCustomerProperty(authToken, id);
      return !wasSaved;
    } catch (error) {
      setFav(fav);
      throw error;
    }
  }, [authToken, fav]);

  const clearSession = useCallback(async () => {
    await removeStoredValue(AUTH_SESSION_KEY);
    cacheRef.current.clear();
    authTokenRef.current = null;
    currentUserRef.current = null;
    setAuthToken(null);
    setCurrentUser(null);
  }, []);

  const storeSession = useCallback(async (session: AuthSession, user: CustomerProfile | null = currentUserRef.current) => {
    const stored: StoredAuthSession = {
      ...session,
      accessTokenExpiresAt: Date.now() + session.expiresInSeconds * 1000,
      refreshedAt: Date.now(),
      user,
    };
    await setStoredValue(AUTH_SESSION_KEY, JSON.stringify(stored));
    authTokenRef.current = session.accessToken;
    setAuthToken(session.accessToken);
  }, []);

  const cacheStoredUser = useCallback(async (user: CustomerProfile | null) => {
    const raw = await getStoredValue(AUTH_SESSION_KEY);
    if (!raw) return;

    try {
      const storedSession = JSON.parse(raw) as Partial<StoredAuthSession>;
      if (!storedSession.accessToken || !storedSession.refreshToken || !storedSession.expiresInSeconds) return;
      await setStoredValue(AUTH_SESSION_KEY, JSON.stringify({ ...storedSession, user }));
    } catch {
      // A malformed stored session will be cleared by the next validation attempt.
    }
  }, []);

  const isStoredAccessTokenFresh = useCallback((session: Partial<StoredAuthSession>) => (
    Boolean(
      session.accessToken &&
      session.expiresInSeconds &&
      session.accessTokenExpiresAt &&
      session.accessTokenExpiresAt > Date.now() + ACCESS_TOKEN_REFRESH_BUFFER_MS
    )
  ), []);

  const refreshSessionWithToken = useCallback(async (refreshToken: string) => {
    if (!refreshInFlightRef.current) {
      refreshInFlightRef.current = refreshCustomerSession(refreshToken)
        .then(async (session) => {
          await storeSession(session);
          return session;
        })
        .catch(async () => {
          await clearSession();
          return null;
        })
        .finally(() => {
          refreshInFlightRef.current = null;
        });
    }

    return await refreshInFlightRef.current;
  }, [clearSession, storeSession]);

  const refreshStoredSession = useCallback(async (expiredAccessToken: string) => {
    const raw = await getStoredValue(AUTH_SESSION_KEY);
    if (!raw) return null;

    try {
      const storedSession = JSON.parse(raw) as Partial<StoredAuthSession>;
      if (!storedSession.refreshToken) return null;

      if (
        storedSession.accessToken &&
        storedSession.accessToken !== expiredAccessToken &&
        storedSession.expiresInSeconds &&
        isStoredAccessTokenFresh(storedSession)
      ) {
        return {
          accessToken: storedSession.accessToken,
          refreshToken: storedSession.refreshToken,
          expiresInSeconds: storedSession.expiresInSeconds,
        };
      }

      return await refreshSessionWithToken(storedSession.refreshToken);
    } catch {
      await clearSession();
      return null;
    }
  }, [clearSession, isStoredAccessTokenFresh, refreshSessionWithToken]);

  useEffect(() => {
    setCustomerSessionRefreshHandler(refreshStoredSession);
    return () => setCustomerSessionRefreshHandler(null);
  }, [refreshStoredSession]);

  const validateToken = useCallback(async () => {
    const raw = await getStoredValue(AUTH_SESSION_KEY);
    if (!raw) {
      authTokenRef.current = null;
      currentUserRef.current = null;
      setAuthToken(null);
      setCurrentUser(null);
      return null;
    }

    try {
      const storedSession = JSON.parse(raw) as Partial<StoredAuthSession>;
      if (!storedSession.refreshToken) {
        await clearSession();
        return null;
      }

      const session = isStoredAccessTokenFresh(storedSession)
        ? {
            accessToken: storedSession.accessToken as string,
            refreshToken: storedSession.refreshToken,
            expiresInSeconds: storedSession.expiresInSeconds as number,
          }
        : await refreshSessionWithToken(storedSession.refreshToken);

      if (!session) return null;

      authTokenRef.current = session.accessToken;
      setAuthToken(session.accessToken);
      if (isStoredAccessTokenFresh(storedSession) && storedSession.user) {
        currentUserRef.current = storedSession.user;
        setCurrentUser(storedSession.user);
        return storedSession.user;
      }

      const user = await getCurrentCustomer(session.accessToken);
      await storeSession(session, user);
      currentUserRef.current = user;
      setCurrentUser(user);
      return user;
    } catch {
      await clearSession();
      return null;
    }
  }, [clearSession, isStoredAccessTokenFresh, refreshSessionWithToken, storeSession]);

  const signIn = useCallback(async (session?: AuthSession) => {
    if (!session) {
      await clearSession();
      return null;
    }
    const user = await getCurrentCustomer(session.accessToken);
    await storeSession(session, user);
    currentUserRef.current = user;
    setCurrentUser(user);
    return user;
  }, [clearSession, storeSession]);

  const signOut = useCallback(async () => {
    const raw = await getStoredValue(AUTH_SESSION_KEY);
    const token = await registerForFcmPushNotificationsAsync().catch(() => null);
    if (raw) {
      try {
        const storedSession = JSON.parse(raw) as Partial<StoredAuthSession>;
        if (storedSession.refreshToken) {
          await logoutCustomerSession(authToken ?? storedSession.accessToken ?? null, storedSession.refreshToken);
        }
        if (token && (authToken || storedSession.accessToken)) {
          await removeCustomerPushToken(authToken ?? storedSession.accessToken ?? '', token).catch(() => undefined);
        }
      } catch {
        // Local sign-out must still complete if the revoke request fails.
      }
    }
    await clearSession();
  }, [authToken, clearSession]);

  const refreshCurrentUser = useCallback(async () => {
    if (!authToken) return null;
    const user = await getCurrentCustomer(authToken);
    currentUserRef.current = user;
    setCurrentUser(user);
    await cacheStoredUser(user);
    return user;
  }, [authToken, cacheStoredUser]);

  const updateProfile = useCallback(async (data: UpdateCustomerProfileInput) => {
    if (!authToken) throw new Error('A valid customer session is required.');
    const user = await updateCurrentCustomer(authToken, data);
    currentUserRef.current = user;
    setCurrentUser(user);
    await cacheStoredUser(user);
    return user;
  }, [authToken, cacheStoredUser]);

  const preloadPrimaryTabResources = useCallback(async () => {
    await preloadPrimaryTabs({
      accessToken: authTokenRef.current,
      currentUser: currentUserRef.current,
      setCachedValue,
    });
  }, [setCachedValue]);

  return (
    <AppStateContext.Provider value={{ fav, authToken, currentUser, getCachedValue, setCachedValue, clearCachedValue, toggleFav, loadFavoriteIds, toggleRemoteFavorite, validateToken, preloadPrimaryTabResources, signIn, signOut, refreshCurrentUser, updateProfile }}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
