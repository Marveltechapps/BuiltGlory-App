import {
  deleteCustomerNotification,
  getCustomerNotificationUnreadCount,
  listCustomerNotifications,
  markCustomerNotificationRead,
  markCustomerNotificationsRead,
  type CustomerNotification,
} from '../api/customer';
import { setAppBadgeCount } from './notificationBadge';
import { HOME_UNREAD_CACHE_PREFIX, NOTIFICATIONS_CACHE_PREFIX } from '../state/primaryTabCache';

type CacheApi = {
  getCachedValue: <T>(key: string) => T | null;
  setCachedValue: <T>(key: string, value: T) => void;
  clearCachedValue: (key: string) => void;
};

export function countUnreadNotifications(notifications: CustomerNotification[]) {
  return notifications.filter((notification) => notification.unread).length;
}

export async function refreshUnreadNotificationCount(authToken: string, cache: CacheApi) {
  try {
    const count = await getCustomerNotificationUnreadCount(authToken);
    cache.setCachedValue(`${HOME_UNREAD_CACHE_PREFIX}:${authToken}`, count);
    await setAppBadgeCount(count);
    return count;
  } catch {
    try {
      const notifications = await listCustomerNotifications(authToken, { limit: 50 });
      const count = countUnreadNotifications(notifications);
      cache.setCachedValue(`${NOTIFICATIONS_CACHE_PREFIX}:${authToken}`, notifications);
      cache.setCachedValue(`${HOME_UNREAD_CACHE_PREFIX}:${authToken}`, count);
      await setAppBadgeCount(count);
      return count;
    } catch {
      return cache.getCachedValue<number>(`${HOME_UNREAD_CACHE_PREFIX}:${authToken}`) ?? 0;
    }
  }
}

export async function syncNotificationCachesAfterRead(
  authToken: string,
  cache: CacheApi,
  notifications?: CustomerNotification[],
) {
  cache.clearCachedValue(`${NOTIFICATIONS_CACHE_PREFIX}:${authToken}`);
  if (notifications) {
    cache.setCachedValue(`${NOTIFICATIONS_CACHE_PREFIX}:${authToken}`, notifications);
    const count = countUnreadNotifications(notifications);
    cache.setCachedValue(`${HOME_UNREAD_CACHE_PREFIX}:${authToken}`, count);
    await setAppBadgeCount(count);
    return count;
  }
  return refreshUnreadNotificationCount(authToken, cache);
}

export async function markOneNotificationReadRemote(authToken: string, notificationId: string, cache: CacheApi) {
  await markCustomerNotificationRead(authToken, notificationId);
  return syncNotificationCachesAfterRead(authToken, cache);
}

export async function markAllNotificationsReadRemote(authToken: string, ids: string[], cache: CacheApi) {
  const notifications = await markCustomerNotificationsRead(authToken, ids);
  await syncNotificationCachesAfterRead(authToken, cache, notifications);
  return notifications;
}

export async function deleteNotificationRemote(authToken: string, notificationId: string, cache: CacheApi) {
  await deleteCustomerNotification(authToken, notificationId);
  return refreshUnreadNotificationCount(authToken, cache);
}
