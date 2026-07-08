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
import {
  markCustomerNotificationRead,
  registerCustomerPushToken,
} from '../api/customer';
import { extractNotificationPayload } from '../navigation/notificationDeepLink';
import { flushPendingNotificationNavigation, navigateFromNotification } from '../navigation/navigationRef';
import { useAppState } from '../state/AppState';
import { HOME_UNREAD_CACHE_PREFIX, NOTIFICATIONS_CACHE_PREFIX } from '../state/primaryTabCache';

export type PushNotificationBanner = {
  title: string;
  body: string;
  payload: Record<string, unknown>;
};

export function usePushNotifications() {
  const { authToken, clearCachedValue } = useAppState();
  const lastRegisteredTokenRef = useRef<string | null>(null);
  const handledColdStartRef = useRef(false);
  const [banner, setBanner] = useState<PushNotificationBanner | null>(null);

  const syncToken = useCallback(async (force = false) => {
    if (!authToken) return;
    const token = await registerForFcmPushNotificationsAsync();
    if (!token) return;
    if (!force && lastRegisteredTokenRef.current === token) return;
    await registerCustomerPushToken(authToken, { token, platform: getPushPlatform() });
    lastRegisteredTokenRef.current = token;
  }, [authToken]);

  const markNotificationRead = useCallback(async (payload: ReturnType<typeof extractNotificationPayload>) => {
    if (!authToken || !payload.notificationId) return;
    try {
      await markCustomerNotificationRead(authToken, payload.notificationId);
      clearCachedValue(`${NOTIFICATIONS_CACHE_PREFIX}:${authToken}`);
      clearCachedValue(`${HOME_UNREAD_CACHE_PREFIX}:${authToken}`);
    } catch (error) {
      if (__DEV__) {
        console.warn('Failed to mark notification read:', error);
      }
    }
  }, [authToken, clearCachedValue]);

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
  }, [authToken, syncToken]);

  useEffect(() => {
    if (!isRemotePushSupported()) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && authToken) {
        syncToken(true).catch(() => undefined);
        flushPendingNotificationNavigation();
      }
    });
    return () => sub.remove();
  }, [authToken, syncToken]);

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
          clearCachedValue(`${HOME_UNREAD_CACHE_PREFIX}:${authToken}`);
        }
      },
      onNotificationResponse: (response) => {
        setBanner(null);
        handleNotificationOpen(response).catch(() => undefined);
      },
    });
  }, [authToken, clearCachedValue, handleNotificationOpen]);

  return {
    banner,
    dismissBanner,
    handleBannerPress,
  };
}
