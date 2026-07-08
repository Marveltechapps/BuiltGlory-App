import * as Device from 'expo-device';
import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';
import type * as Notifications from 'expo-notifications';

type NotificationsModule = typeof import('expo-notifications');

let notificationsModule: NotificationsModule | null | undefined;

function getNotificationsModule(): NotificationsModule | null {
  if (isRunningInExpoGo()) {
    return null;
  }

  if (notificationsModule === undefined) {
    notificationsModule = require('expo-notifications') as NotificationsModule;
    notificationsModule.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  }

  return notificationsModule;
}

export function isRemotePushSupported(): boolean {
  return !isRunningInExpoGo();
}

export type PushPlatform = 'android' | 'ios' | 'web';

export type NotificationPermissionState = 'granted' | 'denied' | 'blocked';

function isAndroidNotificationRuntimeRequired(): boolean {
  return Platform.OS === 'android' && Number(Platform.Version) >= 33;
}

export async function ensureNotificationPermissionsAsync(): Promise<NotificationPermissionState | null> {
  const Notifications = getNotificationsModule();
  if (!Notifications || Platform.OS === 'web') {
    return null;
  }

  // Android 12 and below do not require POST_NOTIFICATIONS at runtime.
  if (Platform.OS === 'android' && !isAndroidNotificationRuntimeRequired()) {
    return 'granted';
  }

  const existing = await Notifications.getPermissionsAsync();
  if (existing.status === 'granted') {
    return 'granted';
  }

  if (existing.status === 'denied' && existing.canAskAgain === false) {
    if (__DEV__) {
      console.warn(
        'Notification permission is blocked. Enable notifications in system settings.',
      );
    }
    return 'blocked';
  }

  const requested = await Notifications.requestPermissionsAsync();
  if (requested.status === 'granted') {
    return 'granted';
  }

  if (requested.canAskAgain === false) {
    if (__DEV__) {
      console.warn(
        'Notification permission is blocked. Enable notifications in system settings.',
      );
    }
    return 'blocked';
  }

  if (__DEV__) {
    console.warn('Notification permission denied.');
  }
  return 'denied';
}

export async function registerForFcmPushNotificationsAsync(): Promise<string | null> {
  const Notifications = getNotificationsModule();
  if (!Notifications) {
    if (__DEV__) {
      console.warn(
        'Remote push notifications require a development build. Run: npx expo run:android or eas build --profile development',
      );
    }
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#E6F4FE',
    });
  }

  if (!Device.isDevice) {
    if (__DEV__) {
      console.warn('Push notifications require a physical device.');
    }
    return null;
  }

  const permissionState = await ensureNotificationPermissionsAsync();
  if (permissionState !== 'granted') {
    return null;
  }

  try {
    const devicePushToken = await Notifications.getDevicePushTokenAsync();
    if (__DEV__) {
      console.log('FCM device token:', devicePushToken.data);
    }
    return devicePushToken.data;
  } catch (error) {
    if (__DEV__) {
      console.warn('Failed to obtain FCM device token:', error);
    }
    return null;
  }
}

export function getPushPlatform(): PushPlatform {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'web';
}

export function addPushNotificationListeners(handlers: {
  onNotificationReceived?: (notification: Notifications.Notification) => void;
  onNotificationResponse?: (response: Notifications.NotificationResponse) => void;
}) {
  const Notifications = getNotificationsModule();
  if (!Notifications) {
    return () => undefined;
  }

  const notificationListener = Notifications.addNotificationReceivedListener((notification) => {
    handlers.onNotificationReceived?.(notification);
  });

  const responseListener = Notifications.addNotificationResponseReceivedListener((response) => {
    handlers.onNotificationResponse?.(response);
  });

  return () => {
    notificationListener.remove();
    responseListener.remove();
  };
}
