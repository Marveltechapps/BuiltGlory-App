import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { NotificationResponse } from 'expo-notifications';
import {
  addPushNotificationListeners,
  ensureNotificationPermissionsAsync,
  getPushPlatform,
  isRemotePushSupported,
  registerForFcmPushNotificationsAsync,
} from '../services/notifications';
import { removeCustomerPushToken, registerCustomerPushToken, type CustomerProfile } from '../api/customer';
import { extractNotificationPayload } from '../navigation/notificationDeepLink';
import { flushPendingNotificationNavigation, navigateFromNotification } from '../navigation/navigationRef';
import { useAppState } from '../state/AppState';
import { NOTIFICATIONS_CACHE_PREFIX } from '../state/primaryTabCache';
import { markOneNotificationReadRemote, refreshUnreadNotificationCount } from '../utils/notificationSync';

export type PushNotificationBanner = {
  title: string;
  body: string;
  payload: Record<string, unknown>;
};

function pushPreferenceEnabled(user: CustomerProfile | null | undefined) {
  const notificationPreferences = user?.notificationPreferences as
    | Partial<Record<'sms' | 'whatsapp' | 'email' | 'push' | 'in_app', { transactional?: boolean; marketing?: boolean }>>
    | undefined;
  const pushPrefs = notificationPreferences?.push;
  if (!pushPrefs) return true;
  return pushPrefs.transactional !== false;
}

export function usePushNotifications() {
  const { authToken, currentUser, clearCachedValue, getCachedValue, setCachedValue } = useAppState();
  const lastRegisteredTokenRef = useRef<string | null>(null);
  const handledColdStartRef = useRef(false);
  const [banner, setBanner] = useState<PushNotificationBanner | null>(null);
  const cacheApi = useCallback(
    () => ({ getCachedValue, setCachedValue, clearCachedValue }),
    [clearCachedValue, getCachedValue, setCachedValue],
  );

  const syncToken = useCallback(async (force = false) => {
    if (!authToken || !pushPreferenceEnabled(currentUser)) {
      if (authToken && lastRegisteredTokenRef.current) {
        await removeCustomerPushToken(authToken, lastRegisteredTokenRef.current).catch(() => undefined);
        lastRegisteredTokenRef.current = null;
      }
      return;
    }
    const token = await registerForFcmPushNotificationsAsync();
    if (!token) return;
    if (!force && lastRegisteredTokenRef.current === token) return;
    await registerCustomerPushToken(authToken, { token, platform: getPushPlatform() });
    lastRegisteredTokenRef.current = token;
  }, [authToken, currentUser]);

  const markNotificationRead = useCallback(async (payload: ReturnType<typeof extractNotificationPayload>) => {
    if (!authToken || !payload.notificationId) return;
    try {
      await markOneNotificationReadRemote(authToken, payload.notificationId, cacheApi());
    } catch (error) {
      if (__DEV__) {
        console.warn('Failed to mark notification read:', error);
      }
    }
  }, [authToken, cacheApi]);

  const handleNotificationOpen = useCallback(async (response: NotificationResponse) => {
    const content = response.notification.request.content;
    const data = (content.data || {}) as Record<string, unknown>;
    const payload = extractNotificationPayload(data);
    await markNotificationRead(payload);
    navigateFromNotification(payload);
  }, [markNotificationRead]);

  const dismissBanner = useCallback(() => {
    setBanner(null);
  }, []);

  const handleBannerPress = useCallback(() => {
    if (!banner) return;
    const payload = extractNotificationPayload(banner.payload);
    setBanner(null);
    void markNotificationRead(payload);
    navigateFromNotification(payload);
  }, [banner, markNotificationRead]);

  useEffect(() => {
    if (!isRemotePushSupported()) return;
    ensureNotificationPermissionsAsync().catch((error) => {
      if (__DEV__) console.warn('Failed to request notification permission:', error);
    });
  }, []);

  useEffect(() => {
    if (!isRemotePushSupported() || !authToken) {
      lastRegisteredTokenRef.current = null;
      return;
    }
    syncToken().catch((error) => {
      if (__DEV__) console.warn('Failed to register FCM push token:', error);
    });
  }, [authToken, currentUser, syncToken]);

  useEffect(() => {
    if (!isRemotePushSupported()) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && authToken) {
        syncToken(true).catch(() => undefined);
        void refreshUnreadNotificationCount(authToken, cacheApi());
        flushPendingNotificationNavigation();
      }
    });
    return () => sub.remove();
  }, [authToken, cacheApi, syncToken]);

  useEffect(() => {
    if (!isRemotePushSupported() || handledColdStartRef.current) return;
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response || handledColdStartRef.current) return;
        handledColdStartRef.current = true;
        handleNotificationOpen(response).catch(() => undefined);
      })
      .catch(() => undefined);
  }, [handleNotificationOpen]);

  useEffect(() => {
    if (!isRemotePushSupported()) return;
    return addPushNotificationListeners({
      onNotificationReceived: (notification) => {
        const content = notification.request.content;
        const data = (content.data || {}) as Record<string, unknown>;
        setBanner({
          title: content.title || 'BuiltGlory',
          body: content.body || 'You have a new notification.',
          payload: data,
        });
        if (authToken) {
          clearCachedValue(`${NOTIFICATIONS_CACHE_PREFIX}:${authToken}`);
          void refreshUnreadNotificationCount(authToken, cacheApi());
        }
      },
      onNotificationResponse: (response) => {
        setBanner(null);
        handleNotificationOpen(response).catch(() => undefined);
      },
    });
  }, [authToken, cacheApi, clearCachedValue, handleNotificationOpen]);

  return {
    banner,
    dismissBanner,
    handleBannerPress,
  };
}
