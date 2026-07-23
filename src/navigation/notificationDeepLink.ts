export type NotificationDeepLinkPayload = {
  type?: string;
  notificationType?: string;
  screen?: string;
  screenKey?: string;
  deepLink?: string;
  listingId?: string;
  sellRequestId?: string;
  enquiryId?: string;
  dealId?: string;
  propertyId?: string;
  entityId?: string;
  entityType?: string;
  image?: string;
  createdAt?: string;
  notificationId?: string;
  inAppNotificationId?: string;
  title?: string;
  body?: string;
};

/** Master Document Part 8 + compact screen codes → React Navigation keys. */
const SCREEN_CODE_TO_NAV: Record<string, string> = {
  B10: 'enquiry',
  B12: 'visitCalendar',
  B12A: 'rescheduleVisit',
  // Master Document B-13 = Deal Confirmed (buyer); opens enquiry detail tracker
  B13: 'enquiryDetail',
  B14: 'documentsShared',
  B15: 'payment',
  B15A: 'paymentFailure',
  B16: 'registrationDetails',
  P05: 'listingDetail',
  P08: 'enquiryDetail',
  // Master Document SL-11 = Listing Re-upload
  SL11: 'reupload',
  // Master Document SL-12 = Offer Screen
  SL12: 'offer',
  SL14: 'dealConfirmed',
  SL15: 'paymentSchedule',
  SL16: 'sellRegistration',
  SL17: 'dealComplete',
  SL18: 'rejectedListing',
  SL09: 'sellerDashboard',
  SL10: 'verificationStatus',
  home: 'home',
};

/** Master Document N-codes → deep link by audience when payload lacks deepLink/screen. */
const NOTIFICATION_TYPE_TO_DEEP_LINK: Record<string, { buyer: string; seller?: string }> = {
  'N-01': { buyer: 'P-08' },
  'N-02': { buyer: 'P-08', seller: 'P-05' },
  'N-03': { buyer: 'B-12' },
  'N-04': { buyer: 'SL-12', seller: 'SL-12' },
  'N-05': { buyer: 'B-13', seller: 'SL-14' },
  'N-06': { buyer: 'B-14', seller: 'SL-11' },
  'N-07': { buyer: 'B-15', seller: 'SL-15' },
  'N-08': { buyer: 'B-16', seller: 'SL-16' },
};

const LEGACY_DEEP_LINK_TO_NAV: Record<string, string> = {
  'B-12 Schedule Visit': 'visitCalendar',
  'B-12': 'visitCalendar',
  'B-13 Visit Confirmation': 'visitConfirmation',
  'B-13': 'enquiryDetail',
  'B-14 Documents Shared': 'documentsShared',
  'B-14': 'documentsShared',
  'B-15 Payment': 'payment',
  'B-15': 'payment',
  'B-16 Registration': 'registrationDetails',
  'B-16': 'registrationDetails',
  'B-04 Property Detail': 'propertyDetail',
  'P-02 My Enquiries': 'myEnquiries',
  'P-05 Listing Detail': 'listingDetail',
  'P-05': 'listingDetail',
  'P-08 Enquiry Detail': 'enquiryDetail',
  'P-08': 'enquiryDetail',
  'SL-09 Seller Dashboard': 'sellerDashboard',
  'SL-07 Review Listing': 'sellReview',
  'SL-18 Listing Status': 'verificationStatus',
  'SL-11 Offer Screen': 'offer',
  'SL-11 Listing Re-upload': 'reupload',
  'SL-11': 'reupload',
  'SL-12 Offer Screen': 'offer',
  'SL-12': 'offer',
  'SL-14 Deal Confirmed': 'dealConfirmed',
  'SL-14': 'dealConfirmed',
  'SL-15 Payment Schedule': 'paymentSchedule',
  'SL-15': 'paymentSchedule',
  'SL-16 Registration': 'sellRegistration',
  'SL-16': 'sellRegistration',
};

function normalizeScreenCode(value?: string) {
  return String(value || '').trim().replace(/[-\s]/g, '').toUpperCase();
}

function normalizeNotificationType(value?: string) {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (raw.startsWith('N') && digits.length) return `N-${digits.padStart(2, '0')}`;
  return raw;
}

export function resolveNotificationScreen(payload: NotificationDeepLinkPayload = {}): string {
  const screenKey = payload.screenKey || payload.deepLink;

  if (screenKey && LEGACY_DEEP_LINK_TO_NAV[screenKey]) {
    return LEGACY_DEEP_LINK_TO_NAV[screenKey];
  }

  if (screenKey && SCREEN_CODE_TO_NAV[normalizeScreenCode(screenKey)]) {
    return SCREEN_CODE_TO_NAV[normalizeScreenCode(screenKey)];
  }

  if (screenKey && /^[a-z]/i.test(screenKey) && !screenKey.includes(' ')) {
    return screenKey;
  }

  const code = normalizeScreenCode(payload.screen);
  if (SCREEN_CODE_TO_NAV[code]) return SCREEN_CODE_TO_NAV[code];

  const type = normalizeNotificationType(payload.notificationType || payload.type);
  const typeMap = NOTIFICATION_TYPE_TO_DEEP_LINK[type];
  if (typeMap) {
    const entityType = String(payload.entityType || '').toLowerCase();
    const preferSeller = ['sell_request', 'acquisition', 'seller'].some((value) => entityType.includes(value));
    const deepLink = preferSeller && typeMap.seller ? typeMap.seller : typeMap.buyer;
    const fromType = SCREEN_CODE_TO_NAV[normalizeScreenCode(deepLink)] || LEGACY_DEEP_LINK_TO_NAV[deepLink];
    if (fromType) return fromType;
  }

  return screenKey || 'notifications';
}

export function buildNotificationNavContext(payload: NotificationDeepLinkPayload = {}) {
  const listingId = payload.listingId || payload.sellRequestId || '';
  const entityId = payload.entityId || '';
  const entityType = String(payload.entityType || '').toLowerCase();
  return {
    notificationId: payload.inAppNotificationId || payload.notificationId || '',
    listingId: listingId || (entityType === 'sell_request' ? entityId : ''),
    sellRequestId: payload.sellRequestId || listingId || (entityType === 'sell_request' ? entityId : ''),
    enquiryId: payload.enquiryId || (entityType === 'buy_enquiry' ? entityId : ''),
    dealId: payload.dealId || (entityType === 'sales_deal' ? entityId : ''),
    visitId: entityType === 'visit' ? entityId : '',
    propertyId: payload.propertyId || '',
    entityId,
    entityType: payload.entityType || '',
    notificationType: payload.notificationType || payload.type || '',
    image: payload.image || '',
    createdAt: payload.createdAt || '',
    refresh: true,
  };
}

export function extractNotificationPayload(data: Record<string, unknown> = {}): NotificationDeepLinkPayload {
  const inAppNotificationId = String(data.inAppNotificationId || '');
  const notificationId = String(inAppNotificationId || data.notificationId || '');
  const listingId = String(data.listingId || data.sellRequestId || '');
  return {
    type: String(data.type || data.notificationType || data.event || ''),
    notificationType: String(data.notificationType || data.type || data.event || ''),
    screen: String(data.screen || ''),
    screenKey: String(data.screenKey || data.deepLink || ''),
    deepLink: String(data.deepLink || data.screenKey || ''),
    listingId,
    sellRequestId: String(data.sellRequestId || listingId),
    enquiryId: String(data.enquiryId || ''),
    dealId: String(data.dealId || ''),
    propertyId: String(data.propertyId || ''),
    entityId: String(data.entityId || ''),
    entityType: String(data.entityType || ''),
    image: String(data.image || ''),
    createdAt: String(data.createdAt || ''),
    title: String(data.title || ''),
    body: String(data.body || ''),
    notificationId,
    inAppNotificationId: inAppNotificationId || undefined,
  };
}
