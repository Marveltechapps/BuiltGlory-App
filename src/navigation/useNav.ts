import { CommonActions, useNavigation, useRoute } from '@react-navigation/native';

const TAB_TARGETS: Record<string, { tab: string; screen: string }> = {
  home: { tab: 'HomeTab', screen: 'home' },
  buyTypes: { tab: 'BuyTab', screen: 'buyTypes' },
  sellTypes: { tab: 'SellTab', screen: 'sellTypes' },
  profile: { tab: 'ProfileTab', screen: 'profile' },
};

const TAB_BY_ID: Record<string, { tab: string; screen: string }> = {
  home: TAB_TARGETS.home,
  buy: TAB_TARGETS.buyTypes,
  sell: TAB_TARGETS.sellTypes,
  profile: TAB_TARGETS.profile,
};

const ROOT_SCREEN_NAMES = new Set([
  'splash',
  'onboarding',
  'login',
  'otp',
  'profileSetup',
  'locationType',
  'terms',
  'permissions',
  'termsOfUse',
  'privacyPolicy',
  'offline',
  'forceUpdate',
  'maintenance',
  'sessionExpiry',
]);

function rootNavigation(navigation: any) {
  let next = navigation;
  while (next?.getParent?.()) next = next.getParent();
  return next;
}

function isTabNavigator(navigation: any) {
  return Boolean(navigation?.getState?.().routeNames?.some((name: string) => name.endsWith('Tab')));
}

export function useNav<T = any>() {
  const navigation: any = useNavigation();
  const route = useRoute<any>();
  const ctx: T = route.params?.ctx || {};

  const go = (screen: string, nextCtx: any = {}) => {
    if (TAB_TARGETS[screen]) {
      const target = TAB_TARGETS[screen];
      rootNavigation(navigation).navigate('MainTabs', {
        screen: target.tab,
        params: { screen: target.screen, params: { ctx: nextCtx } },
      });
      return;
    }
    if (ROOT_SCREEN_NAMES.has(screen)) {
      rootNavigation(navigation).navigate(screen, { ctx: nextCtx });
      return;
    }
    navigation.navigate(screen, { ctx: nextCtx });
  };
  const back = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else go('home');
  };
  const jump = (screen: string) => {
    if (TAB_TARGETS[screen]) {
      go(screen);
      return;
    }
    if (ROOT_SCREEN_NAMES.has(screen)) {
      rootNavigation(navigation).navigate(screen, { ctx: {} });
      return;
    }
    navigation.navigate(screen, { ctx: {} });
  };
  const resetTo = (screen: string, nextCtx: any = {}) => {
    const root = rootNavigation(navigation);
    if (TAB_TARGETS[screen]) {
      const target = TAB_TARGETS[screen];
      root.dispatch(CommonActions.reset({
        index: 0,
        routes: [{
          name: 'MainTabs',
          params: { screen: target.tab, params: { screen: target.screen, params: { ctx: nextCtx } } },
        }],
      }));
      return;
    }
    root.dispatch(CommonActions.reset({
      index: 0,
      routes: [{ name: screen, params: { ctx: nextCtx } }],
    }));
  };
  const switchTab = (tab: string) => {
    const target = TAB_BY_ID[tab];
    if (!target || route.name === target.screen) return;
    const parent = navigation.getParent?.();
    if (isTabNavigator(parent)) {
      parent.navigate(target.tab);
      return;
    }
    rootNavigation(navigation).navigate('MainTabs', { screen: target.tab });
  };
  const onNav = (tab: string) => {
    switchTab(tab);
  };

  return { go, back, jump, resetTo, onNav, ctx, navigation };
}
