import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  Text,
  View,
} from 'react-native';
import Icon from '../components/Icon';
import { EmptyState, Input, Screen, TopBar } from '../components/shared';
import { EmptyStateCard, ErrorCard, OfflineCard } from '../components/screenStates';
import { useNav } from '../navigation/useNav';
import { navigateFromNotification } from '../navigation/navigationRef';
import { useAppState } from '../state/AppState';
import {
  deleteCustomerNotification,
  listCustomerNotifications,
  type CustomerNotification,
} from '../api/customer';
import {
  NOTIFICATIONS_CACHE_PREFIX,
  NotificationsCache,
} from '../state/primaryTabCache';
import { isNetworkError, resourceErrorMessage } from '../utils/apiErrors';
import {
  countUnreadNotifications,
  deleteNotificationRemote,
  markAllNotificationsReadRemote,
  markOneNotificationReadRemote,
  refreshUnreadNotificationCount,
  syncNotificationCachesAfterRead,
} from '../utils/notificationSync';
import { NotificationHero } from './NotificationHero';
import { NotificationSkeletonList } from './NotificationSkeletonList';
import { NotificationSwipeRow } from './NotificationSwipeRow';
import {
  groupNotificationsByDate,
  matchesNotificationFilter,
  matchesNotificationSearch,
  NOTIFICATION_FILTERS,
  type NotificationFilter,
} from './notificationUtils';
import { lineHeightFor } from '../setup/androidText';

function apiMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function NotificationsScreen() {
  const { back } = useNav();
  const { authToken, getCachedValue, setCachedValue, clearCachedValue } = useAppState();
  const [notifications, setNotifications] = useState<CustomerNotification[]>([]);
  const [locallyRead, setLocallyRead] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>('all');

  const cacheApi = useMemo(() => ({ getCachedValue, setCachedValue, clearCachedValue }), [clearCachedValue, getCachedValue, setCachedValue]);

  const loadNotifications = useCallback(async (force = false) => {
    if (!authToken) {
      setError('Please sign in again to load notifications.');
      setLoading(false);
      setRefreshing(false);
      setOffline(false);
      return;
    }

    const cacheKey = `${NOTIFICATIONS_CACHE_PREFIX}:${authToken}`;
    const cached = getCachedValue<NotificationsCache>(cacheKey);

    if (cached && !force) {
      setNotifications(cached);
      setLoading(false);
      setError('');
      setOffline(false);
      return;
    }

    if (force) setRefreshing(true);
    else setLoading(true);
    setError('');
    setOffline(false);

    try {
      const nextNotifications = await listCustomerNotifications(authToken, { limit: 50 });
      setNotifications(nextNotifications);
      setCachedValue(cacheKey, nextNotifications);
      await refreshUnreadNotificationCount(authToken, cacheApi);
    } catch (err) {
      if (isNetworkError(err)) {
        setOffline(true);
        if (cached?.length) {
          setNotifications(cached);
          setError('');
        } else {
          setError(resourceErrorMessage(err, 'Could not load notifications.'));
        }
      } else {
        setError(apiMessage(err, 'Could not load notifications.'));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authToken, cacheApi, getCachedValue, setCachedValue]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const filteredNotifications = useMemo(() => {
    return notifications.filter(
      (notification) =>
        matchesNotificationFilter(notification, activeFilter, locallyRead)
        && matchesNotificationSearch(notification, searchQuery),
    );
  }, [activeFilter, locallyRead, notifications, searchQuery]);

  const sections = useMemo(
    () => groupNotificationsByDate(filteredNotifications),
    [filteredNotifications],
  );

  const unreadCount = useMemo(
    () => notifications.filter((notification) => notification.unread && !locallyRead.has(notification.id)).length,
    [locallyRead, notifications],
  );

  const markNotificationRead = useCallback(async (notification: CustomerNotification) => {
    if (!notification.unread || !authToken) return;
    setLocallyRead((prev) => new Set(prev).add(notification.id));
    setNotifications((prev) =>
      prev.map((item) => (item.id === notification.id ? { ...item, unread: false } : item)),
    );
    try {
      await markOneNotificationReadRemote(authToken, notification.id, cacheApi);
    } catch {
      // Optimistic UI; sync on next refresh.
    }
  }, [authToken, cacheApi]);

  const openNotification = useCallback(async (notification: CustomerNotification) => {
    await markNotificationRead(notification);
    navigateFromNotification({
      type: notification.notificationType || notification.event,
      notificationType: notification.notificationType || notification.event,
      screen: notification.screen || undefined,
      screenKey: notification.screenKey || notification.deepLink || undefined,
      deepLink: notification.deepLink || notification.screenKey || undefined,
      listingId: notification.listingId || undefined,
      enquiryId: notification.enquiryId || undefined,
      dealId: notification.dealId || undefined,
      propertyId: notification.propertyId || undefined,
      entityId: notification.entityId || undefined,
      entityType: notification.entityType || undefined,
      image: notification.image || undefined,
      createdAt: notification.createdAt || undefined,
      notificationId: notification.id,
    });
  }, [markNotificationRead]);

  const removeNotification = useCallback(async (notificationId: string) => {
    setNotifications((prev) => prev.filter((item) => item.id !== notificationId));
    if (!authToken) return;
    try {
      await deleteNotificationRemote(authToken, notificationId, cacheApi);
    } catch {
      setError('Could not delete notification. Pull to refresh and try again.');
      loadNotifications(true);
    }
  }, [authToken, cacheApi, loadNotifications]);

  const markAllRead = useCallback(async () => {
    const ids = notifications.filter((notification) => notification.unread).map((notification) => notification.id);
    setLocallyRead(new Set(notifications.map((notification) => notification.id)));
    if (!authToken || ids.length === 0) return;
    try {
      const nextNotifications = await markAllNotificationsReadRemote(authToken, ids, cacheApi);
      setNotifications(nextNotifications);
      setLocallyRead(new Set());
    } catch {
      setError('Marked read locally. Sync will retry when notifications reload.');
      void syncNotificationCachesAfterRead(authToken, cacheApi);
    }
  }, [authToken, cacheApi, notifications]);

  const showSkeleton = loading && notifications.length === 0;
  const showEmpty = !loading && !error && !offline && notifications.length === 0;
  const showFilteredEmpty = !loading && notifications.length > 0 && filteredNotifications.length === 0;

  const listHeader = (
    <View>
      <NotificationHero unreadCount={unreadCount} />

      <View className="px-4 mb-3">
        <Input
          icon="search"
          placeholder="Search notifications"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12 }}
      >
        {NOTIFICATION_FILTERS.map((filter) => {
          const selected = activeFilter === filter.key;
          const count = filter.key === 'unread' ? unreadCount : undefined;
          return (
            <Pressable
              key={filter.key}
              onPress={() => setActiveFilter(filter.key)}
              className={`flex-row items-center gap-1.5 px-3.5 py-2 mr-2 rounded-full border ${
                selected ? 'bg-brand-600 border-brand-600' : 'bg-white border-ink-200'
              }`}
            >
              <Text
                className={`text-[12px] font-semibold ${selected ? 'text-white' : 'text-ink-700'}`}
                style={{ lineHeight: lineHeightFor(12) }}
              >
                {filter.label}
              </Text>
              {typeof count === 'number' && count > 0 ? (
                <View className={`min-w-[18px] h-[18px] px-1 rounded-full items-center justify-center ${selected ? 'bg-white/20' : 'bg-brand-50'}`}>
                  <Text className={`text-[10px] font-bold ${selected ? 'text-white' : 'text-brand-700'}`}>{count}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {offline ? <View className="px-4 mb-3"><OfflineCard onRetry={() => loadNotifications(true)} /></View> : null}
      {!!error && !offline ? <View className="px-4 mb-3"><ErrorCard message={error} onRetry={() => loadNotifications(true)} /></View> : null}
      {showSkeleton ? <NotificationSkeletonList /> : null}
      {showEmpty ? (
        <EmptyState
          icon="bell-off"
          title="No notifications yet"
          body="Property updates, visit alerts, and deal milestones will appear here."
        />
      ) : null}
      {showFilteredEmpty ? (
        <View className="px-4">
          <EmptyStateCard
            icon="search"
            title="No matching notifications"
            body="Try a different search term or filter to see more updates."
          />
        </View>
      ) : null}
    </View>
  );

  return (
    <Screen fill>
      <TopBar
        onBack={back}
        title="Notifications"
        sub={unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
        right={(
          <Pressable
            onPress={markAllRead}
            disabled={unreadCount === 0}
            className={`px-3 py-1.5 rounded-full border ${unreadCount > 0 ? 'border-brand-200 bg-brand-50' : 'border-ink-200 bg-ink-50 opacity-60'}`}
          >
            <Text className="text-brand-600 text-[11px] font-semibold">Mark all read</Text>
          </Pressable>
        )}
      />

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 28 }}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadNotifications(true)}
            tintColor="#1A6FFF"
            colors={['#1A6FFF']}
            progressBackgroundColor="#EFF6FF"
          />
        )}
        ListHeaderComponent={listHeader}
        renderSectionHeader={({ section }) => (
          <View className="px-4 py-2 bg-white/95 border-b border-ink-100">
            <View className="flex-row items-center gap-2">
              <Icon name="calendar-days" size={12} color="#64748B" />
              <Text className="text-[11px] font-bold uppercase tracking-wider text-ink-500">{section.title}</Text>
              <View className="flex-1 h-px bg-ink-100" />
              <Text className="text-[10px] text-ink-400 font-medium">{section.data.length}</Text>
            </View>
          </View>
        )}
        renderItem={({ item, index, section }) => {
          const unread = item.unread && !locallyRead.has(item.id);
          const isLast = index === section.data.length - 1;
          return (
            <View className="px-4">
              <NotificationSwipeRow
                notification={item}
                unread={unread}
                isLast={isLast}
                onPress={() => openNotification(item)}
                onMarkRead={() => markNotificationRead(item)}
                onDelete={() => removeNotification(item.id)}
              />
            </View>
          );
        }}
        ListEmptyComponent={showSkeleton || showEmpty || showFilteredEmpty ? <View /> : null}
      />
    </Screen>
  );
}
