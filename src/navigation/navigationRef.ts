import { CommonActions, createNavigationContainerRef } from '@react-navigation/native';
import {
  buildNotificationNavContext,
  extractNotificationPayload,
  NotificationDeepLinkPayload,
  resolveNotificationScreen,
} from './notificationDeepLink';

export const navigationRef = createNavigationContainerRef<any>();

const TAB_TARGETS: Record<string, { tab: string; screen: string }> = {
  home: { tab: 'HomeTab', screen: 'home' },
  buyTypes: { tab: 'BuyTab', screen: 'buyTypes' },
  sellTypes: { tab: 'SellTab', screen: 'sellTypes' },
  profile: { tab: 'ProfileTab', screen: 'profile' },
};

let pendingNotificationPayload: NotificationDeepLinkPayload | null = null;

export function queueNotificationNavigation(payload: NotificationDeepLinkPayload) {
  pendingNotificationPayload = payload;
  if (navigationRef.isReady()) {
    navigateFromNotification(payload);
    pendingNotificationPayload = null;
  }
}

export function flushPendingNotificationNavigation() {
  if (!pendingNotificationPayload || !navigationRef.isReady()) return;
  navigateFromNotification(pendingNotificationPayload);
  pendingNotificationPayload = null;
}

export function navigateFromNotification(raw: NotificationDeepLinkPayload | Record<string, unknown>) {
  if (!navigationRef.isReady()) {
    queueNotificationNavigation(extractNotificationPayload(raw as Record<string, unknown>));
    return;
  }

  const payload = 'screen' in raw || 'screenKey' in raw
    ? (raw as NotificationDeepLinkPayload)
    : extractNotificationPayload(raw as Record<string, unknown>);

  const screen = resolveNotificationScreen(payload);
  const ctx = buildNotificationNavContext(payload);

  if (TAB_TARGETS[screen]) {
    const target = TAB_TARGETS[screen];
    navigationRef.dispatch(
      CommonActions.navigate({
        name: 'MainTabs',
        params: {
          screen: target.tab,
          params: { screen: target.screen, params: { ctx } },
        },
      }),
    );
    return;
  }

  navigationRef.dispatch(
    CommonActions.navigate({
      name: 'MainTabs',
      params: {
        screen: 'HomeTab',
        params: {
          screen,
          params: { ctx },
        },
      },
    }),
  );
}
