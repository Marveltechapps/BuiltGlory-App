import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

type NotificationsModule = typeof import('expo-notifications');

let notificationsModule: NotificationsModule | null | undefined;

function getNotificationsModule(): NotificationsModule | null {
  if (isRunningInExpoGo()) return null;
  if (notificationsModule === undefined) {
    notificationsModule = require('expo-notifications') as NotificationsModule;
  }
  return notificationsModule;
}

export async function setAppBadgeCount(count: number) {
  const Notifications = getNotificationsModule();
  if (!Notifications || Platform.OS === 'web') return;
  try {
    const next = Math.max(0, Math.min(99, Math.round(count)));
    await Notifications.setBadgeCountAsync(next);
  } catch {
    // Badge updates are best-effort on unsupported devices.
  }
}

export async function clearAppBadgeCount() {
  return setAppBadgeCount(0);
}
