export const AUTH_SCREEN_KEYS = [
  'splash',
  'onboarding',
  'login',
  'otp',
  'profileSetup',
  'locationType',
  'terms',
  'permissions',
] as const;

export const LEGAL_SCREEN_KEYS = ['termsOfUse', 'privacyPolicy'] as const;

export const GLOBAL_SCREEN_KEYS = ['offline', 'forceUpdate', 'maintenance', 'sessionExpiry'] as const;

export const AUTH_SCREEN_KEY_SET = new Set<string>(AUTH_SCREEN_KEYS);
export const LEGAL_SCREEN_KEY_SET = new Set<string>(LEGAL_SCREEN_KEYS);
export const GLOBAL_SCREEN_KEY_SET = new Set<string>(GLOBAL_SCREEN_KEYS);

/** Screens registered on the root stack (not inside MainTabs). */
export const ROOT_SCREEN_NAMES = new Set<string>([
  ...AUTH_SCREEN_KEYS,
  ...LEGAL_SCREEN_KEYS,
  ...GLOBAL_SCREEN_KEYS,
]);

export const TAB_CONFIG = [
  { id: 'home', routeName: 'HomeTab', rootScreen: 'home' },
  { id: 'buy', routeName: 'BuyTab', rootScreen: 'buyTypes' },
  { id: 'sell', routeName: 'SellTab', rootScreen: 'sellTypes' },
  { id: 'profile', routeName: 'ProfileTab', rootScreen: 'profile' },
] as const;

export type TabId = (typeof TAB_CONFIG)[number]['id'];
export type TabRouteName = (typeof TAB_CONFIG)[number]['routeName'];

export const TAB_ID_BY_ROUTE: Record<string, TabId> = Object.fromEntries(
  TAB_CONFIG.map((tab) => [tab.routeName, tab.id]),
) as Record<string, TabId>;

export const TAB_ROUTE_BY_ID: Record<string, TabRouteName> = Object.fromEntries(
  TAB_CONFIG.map((tab) => [tab.id, tab.routeName]),
) as Record<string, TabRouteName>;

export const TAB_ROOT_BY_ROUTE: Record<string, string> = Object.fromEntries(
  TAB_CONFIG.map((tab) => [tab.routeName, tab.rootScreen]),
);

export const TAB_STACK_ROOTS: Record<string, string> = { ...TAB_ROOT_BY_ROUTE };

export const MAIN_TAB_NAMES = TAB_CONFIG.map((tab) => tab.routeName);

export const TAB_TARGETS: Record<string, { tab: TabRouteName; screen: string }> = {
  home: { tab: 'HomeTab', screen: 'home' },
  buyTypes: { tab: 'BuyTab', screen: 'buyTypes' },
  sellTypes: { tab: 'SellTab', screen: 'sellTypes' },
  profile: { tab: 'ProfileTab', screen: 'profile' },
};

export const TAB_BY_ID: Record<string, { tab: TabRouteName; screen: string }> = {
  home: TAB_TARGETS.home,
  buy: TAB_TARGETS.buyTypes,
  sell: TAB_TARGETS.sellTypes,
  profile: TAB_TARGETS.profile,
};

export const TAB_BAR_VISIBLE_ROUTES = new Set([
  'home',
  'buyTypes',
  'sellTypes',
  'sellerDashboard',
  'profile',
]);

export const HOME_TAB_SCREENS = new Set([
  'home',
  'search',
  'featured',
  'upcoming',
  'help',
  'supportTickets',
  'liveChat',
  'supportTicketChat',
]);

export const BUY_TAB_SCREENS = new Set([
  'buyTypes', 'filters', 'buyList', 'propertyDetail', 'floorPlan', 'specs', 'advantages',
  'vrTour', 'aerial', 'shareProperty', 'enquiry', 'enquirySuccess', 'visitCalendar',
  'rescheduleVisit', 'visitConfirmation', 'nriVideoCall', 'nriVideoConfirm',
  'documentsShared', 'payment', 'paymentFailure', 'registrationDetails', 'cancelEnquiry',
  'propertyWithdrawn', 'soldOut', 'favorites', 'compare', 'advancedFilters', 'mapView',
]);

export const SELL_TAB_SCREENS = new Set([
  'sellTypes', 'sellIntent', 'sellAddress', 'sellDetails', 'sellPhotos', 'sellAmenities',
  'sellPrice', 'sellReview', 'sellSuccess', 'draftSuccess', 'sellerDashboard', 'editListing',
  'verificationStatus', 'reupload', 'offer', 'acceptNegotiate', 'dealConfirmed',
  'paymentSchedule', 'sellRegistration', 'dealComplete', 'rejectedListing', 'sellEnquiries',
  'sellVisitMgmt', 'sellChat',
]);

export const PROFILE_TAB_SCREENS = new Set([
  'profile', 'profileEdit', 'changePhone', 'myListings', 'myVisits', 'myDeals',
  'listingDetail', 'noListings', 'myEnquiries', 'enquiryDetail', 'noEnquiries',
  'notifications', 'pdfViewer', 'offers', 'newsInsights',
  'generalInfo', 'helpFeedback', 'historyEnquiries', 'settingsMain', 'notificationSettings',
  'appSettings', 'accountSettings', 'accountDeletion', 'helpFaqs', 'faqTopic',
  'customerSupport', 'callUs', 'aboutUs', 'rateApp',
]);

export function isRootScreen(screen: string) {
  return ROOT_SCREEN_NAMES.has(screen);
}

export function isTabRootScreen(screen: string) {
  return Boolean(TAB_TARGETS[screen]);
}

export function resolveScreenTab(screen: string): TabRouteName {
  if (TAB_TARGETS[screen]) return TAB_TARGETS[screen].tab;
  if (BUY_TAB_SCREENS.has(screen)) return 'BuyTab';
  if (SELL_TAB_SCREENS.has(screen)) return 'SellTab';
  if (PROFILE_TAB_SCREENS.has(screen)) return 'ProfileTab';
  if (HOME_TAB_SCREENS.has(screen)) return 'HomeTab';
  return 'HomeTab';
}

export function buildMainTabsResetState(activeTab: string, stackRoutes: Array<{ name: string; params?: any }>) {
  const index = Math.max(0, MAIN_TAB_NAMES.indexOf(activeTab as TabRouteName));
  return {
    index,
    routes: MAIN_TAB_NAMES.map((tab) => ({
      name: tab,
      state: tab === activeTab
        ? {
            index: Math.max(0, stackRoutes.length - 1),
            routes: stackRoutes,
          }
        : {
            index: 0,
            routes: [{ name: TAB_STACK_ROOTS[tab] }],
          },
    })),
  };
}

export function buildTabRootResetState(activeTab: string, activeScreen: string, nextCtx: any = {}) {
  return buildMainTabsResetState(activeTab, [{
    name: activeScreen,
    ...(activeScreen ? { params: { ctx: nextCtx } } : {}),
  }]);
}

export function buildTabFlowResetState(screen: string, nextCtx: any = {}) {
  const tab = resolveScreenTab(screen);
  const rootScreen = TAB_STACK_ROOTS[tab];
  const stackRoutes = screen === rootScreen
    ? [{ name: rootScreen, params: { ctx: nextCtx } }]
    : [
        { name: rootScreen },
        { name: screen, params: { ctx: nextCtx } },
      ];
  return buildMainTabsResetState(tab, stackRoutes);
}
