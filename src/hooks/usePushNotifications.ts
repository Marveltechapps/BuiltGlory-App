import { useEffect, useRef } from 'react';
import {
  addPushNotificationListeners,
  getPushPlatform,
  registerForFcmPushNotificationsAsync,
} from '../services/notifications';
import { registerCustomerPushToken } from '../api/customer';

export function usePushNotifications(accessToken: string | null) {
  const lastRegisteredTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!accessToken) {
      lastRegisteredTokenRef.current = null;
      return;
    }

    let cancelled = false;

    const syncToken = async () => {
      const token = await registerForFcmPushNotificationsAsync();
      if (!token || cancelled) return;
      if (lastRegisteredTokenRef.current === token) return;

      await registerCustomerPushToken(accessToken, {
        token,
        platform: getPushPlatform(),
      });
      lastRegisteredTokenRef.current = token;
      console.log('FCM push token registered with backend');
    };

    syncToken().catch((error) => {
      console.warn('Failed to register FCM push token:', error);
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    return addPushNotificationListeners({
      onNotificationReceived: (notification) => {
        console.log('Push notification received:', notification);
      },
      onNotificationResponse: (response) => {
        console.log('Push notification opened:', response);
      },
    });
  }, []);
}
