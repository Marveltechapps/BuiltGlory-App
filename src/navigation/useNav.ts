import { useCallback } from 'react';
import { BackHandler } from 'react-native';
import { CommonActions, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import {
  MAIN_TAB_NAMES,
  ROOT_SCREEN_NAMES,
  TAB_BY_ID,
  TAB_STACK_ROOTS,
  TAB_TARGETS,
  buildTabFlowResetState,
  buildTabRootResetState,
  isRootScreen,
  isTabRootScreen,
} from './routes';

function rootNavigation(navigation: any) {
  let next = navigation;
  while (next?.getParent?.()) next = next.getParent();
  return next;
}

function isTabNavigator(navigation: any) {
  return Boolean(navigation?.getState?.().routeNames?.some((name: string) => name.endsWith('Tab')));
}

let lastNavKey = '';
let lastNavAt = 0;

function isDuplicateNavigation(screen: string, nextCtx: any) {
  const key = `${screen}:${JSON.stringify(nextCtx ?? {})}`;
  const now = Date.now();
  if (key === lastNavKey && now - lastNavAt < 450) return true;
  lastNavKey = key;
  lastNavAt = now;
  return false;
}

export function useNav<T = any>() {
  const navigation: any = useNavigation();
  const route = useRoute<any>();
  const ctx: T = route.params?.ctx || {};

  const go = (screen: string, nextCtx: any = {}) => {
    if (isDuplicateNavigation(screen, nextCtx)) return;

    if (TAB_TARGETS[screen]) {
      const target = TAB_TARGETS[screen];
      rootNavigation(navigation).navigate('MainTabs', {
        screen: target.tab,
        params: { screen: target.screen, params: { ctx: nextCtx } },
      });
      return;
    }
    if (isRootScreen(screen)) {
      rootNavigation(navigation).navigate(screen, { ctx: nextCtx });
      return;
    }
    if (route.name === screen && typeof navigation.push === 'function') {
      navigation.push(screen, { ctx: nextCtx });
      return;
    }
    navigation.navigate(screen, { ctx: nextCtx });
  };

  const back = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    if (ROOT_SCREEN_NAMES.has(route.name) || isTabRootScreen(route.name)) {
      return;
    }
    go('home');
  };

  const jump = (screen: string) => {
    if (TAB_TARGETS[screen]) {
      go(screen);
      return;
    }
    if (isRootScreen(screen)) {
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
          state: buildTabRootResetState(target.tab, target.screen, nextCtx),
        }],
      }));
      return;
    }
    root.dispatch(CommonActions.reset({
      index: 0,
      routes: [{ name: screen, params: { ctx: nextCtx } }],
    }));
  };

  const completeTo = (screen: string, nextCtx: any = {}) => {
    navigation.dispatch(CommonActions.reset({
      index: 0,
      routes: [{ name: screen, params: { ctx: nextCtx } }],
    }));
  };

  const openFromTabRoot = (screen: string, nextCtx: any = {}) => {
    if (TAB_TARGETS[screen]) {
      resetTo(screen, nextCtx);
      return;
    }
    rootNavigation(navigation).dispatch(CommonActions.reset({
      index: 0,
      routes: [{
        name: 'MainTabs',
        state: buildTabFlowResetState(screen, nextCtx),
      }],
    }));
  };

  const switchTab = (tab: string) => {
    const target = TAB_BY_ID[tab];
    if (!target) return;
    if (route.name === target.screen && isTabNavigator(navigation.getParent?.())) return;
    rootNavigation(navigation).navigate('MainTabs', {
      screen: target.tab,
      params: { screen: target.screen, params: { ctx: {} } },
    });
  };

  const onNav = (tab: string) => {
    switchTab(tab);
  };

  return {
    go,
    back,
    jump,
    resetTo,
    completeTo,
    openFromTabRoot,
    onNav,
    ctx,
    navigation,
    canGoBack: navigation.canGoBack(),
  };
}

export function useFlowCompletionBack(options?: { redirectToHome?: boolean }) {
  const { resetTo, navigation } = useNav();
  const redirectToHome = options?.redirectToHome ?? true;

  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({ gestureEnabled: false });
      const onBack = () => {
        if (redirectToHome) resetTo('home');
        return true;
      };
      const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
      return () => sub.remove();
    }, [navigation, redirectToHome, resetTo]),
  );
}

export function useBlockHardwareBack() {
  const navigation: any = useNavigation();

  useFocusEffect(
    useCallback(() => {
      navigation.setOptions({ gestureEnabled: false });
      const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
      return () => sub.remove();
    }, [navigation]),
  );
}

export { MAIN_TAB_NAMES, TAB_STACK_ROOTS };
