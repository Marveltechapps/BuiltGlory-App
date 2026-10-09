import { CommonActions, createNavigationContainerRef } from '@react-navigation/native';
import {
  buildNotificationNavContext,
  extractNotificationPayload,
  NotificationDeepLinkPayload,
  resolveNotificationScreen,
} from './notificationDeepLink';
import { resolveNotificationTab } from './notificationScreenTab';
import { TAB_TARGETS, buildTabFlowResetState, buildTabRootResetState, isRootScreen } from './routes';
import { extractPropertyIdFromUrl } from '../config/appLinks';

export const navigationRef = createNavigationContainerRef<any>();

let pendingNotificationPayload: NotificationDeepLinkPayload | null = null;

export function queueNotificationNavigation(payload: NotificationDeepLinkPayload) {
  pendingNotificationPayload = payload;
  applyPendingAppLink();
}

export function flushPendingNotificationNavigation() {
  if (!pendingNotificationPayload || !navigationRef.isReady()) return;
  if (currentRootRouteName() !== 'MainTabs') return;
  navigateFromNotification(pendingNotificationPayload);
  pendingNotificationPayload = null;
}

function currentRootRouteName() {
  if (!navigationRef.isReady()) return null;
  const state = navigationRef.getRootState();
  return state?.routes?.[state.index]?.name ?? null;
}

export function notifySessionExpired() {
  if (!navigationRef.isReady()) return;
  const current = currentRootRouteName();
  if (current !== 'MainTabs') return;
  navigationRef.dispatch(CommonActions.reset({
    index: 0,
    routes: [{ name: 'sessionExpiry' }],
  }));
}

export function parseAppUrl(url: string): NotificationDeepLinkPayload | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'exp:' || parsed.protocol === 'exps:') return null;

    const params = Object.fromEntries(parsed.searchParams.entries());
    const propertyId = extractPropertyIdFromUrl(url) || params.propertyId || '';
    const isPropertyPath = /\/(p|property)(\/|$)/i.test(`${parsed.hostname}${parsed.pathname}`)
      || parsed.hostname === 'p'
      || parsed.hostname === 'property'
      || Boolean(params.propertyId);
    if (propertyId && isPropertyPath) {
      return {
        screen: 'propertyDetail',
        screenKey: 'propertyDetail',
        deepLink: 'propertyDetail',
        propertyId,
        listingId: params.listingId || params.sellRequestId,
        sellRequestId: params.sellRequestId || params.listingId,
        enquiryId: params.enquiryId,
        dealId: params.dealId,
        entityId: params.entityId || propertyId,
        entityType: params.entityType || 'property',
        notificationType: params.notificationType || params.type,
        type: params.type || params.notificationType,
      };
    }

    if (parsed.protocol !== 'builtglory:') return null;
    const hostOrPath = `${parsed.hostname || ''}${parsed.pathname || ''}`.replace(/^\/+/, '');
    const screen = hostOrPath.split('/')[0];
    if (!screen) return null;
    return {
      screen,
      screenKey: screen,
      deepLink: screen,
      listingId: params.listingId || params.sellRequestId,
      sellRequestId: params.sellRequestId || params.listingId,
      enquiryId: params.enquiryId,
      dealId: params.dealId,
      propertyId: params.propertyId,
      entityId: params.entityId,
      entityType: params.entityType,
      notificationType: params.notificationType || params.type,
      type: params.type || params.notificationType,
    };
  } catch {
    return null;
  }
}

export function handleAppUrl(url: string | null | undefined) {
  if (!url) return;
  const payload = parseAppUrl(url);
  if (!payload) return;
  pendingNotificationPayload = payload;
  applyPendingAppLink();
}

export function applyPendingAppLink() {
  if (!pendingNotificationPayload || !navigationRef.isReady()) return false;
  if (currentRootRouteName() !== 'MainTabs') return false;
  navigateFromNotification(pendingNotificationPayload);
  pendingNotificationPayload = null;
  return true;
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

  if (isRootScreen(screen)) {
    navigationRef.dispatch(CommonActions.navigate({
      name: screen,
      params: { ctx },
    }));
    return;
  }

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

  const tab = resolveNotificationTab(screen);
  navigationRef.dispatch(
    CommonActions.navigate({
      name: 'MainTabs',
      params: {
        screen: tab,
        params: {
          screen,
          params: { ctx },
        },
      },
    }),
  );
}

export { buildTabFlowResetState, buildTabRootResetState };
