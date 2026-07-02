import React from 'react';
import { Route, getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { BottomTabBarProps, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BOTTOM_NAV_HEIGHT, BottomNav } from '../components/shared';
import { useAppState } from '../state/AppState';
import { ALL_SCREENS } from './registry';

const RootStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const AppStack = createNativeStackNavigator();

const AUTH_SCREEN_KEYS = new Set([
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
]);
const GLOBAL_SCREEN_KEYS = new Set(['offline', 'forceUpdate', 'maintenance', 'sessionExpiry']);
const TAB_BAR_VISIBLE_ROUTES = new Set(['home', 'buyTypes', 'sellTypes', 'sellerDashboard', 'profile']);

const ROOT_SCREENS = ALL_SCREENS.filter((screen) => AUTH_SCREEN_KEYS.has(screen.key) || GLOBAL_SCREEN_KEYS.has(screen.key));
const APP_SCREENS = ALL_SCREENS.filter((screen) => !AUTH_SCREEN_KEYS.has(screen.key) && !GLOBAL_SCREEN_KEYS.has(screen.key));

const TAB_CONFIG = [
  { id: 'home', routeName: 'HomeTab', rootScreen: 'home' },
  { id: 'buy', routeName: 'BuyTab', rootScreen: 'buyTypes' },
  { id: 'sell', routeName: 'SellTab', rootScreen: 'sellTypes' },
  { id: 'profile', routeName: 'ProfileTab', rootScreen: 'profile' },
];

const TAB_ID_BY_ROUTE = Object.fromEntries(TAB_CONFIG.map((tab) => [tab.routeName, tab.id]));
const TAB_ROUTE_BY_ID = Object.fromEntries(TAB_CONFIG.map((tab) => [tab.id, tab.routeName]));
const TAB_ROOT_BY_ROUTE = Object.fromEntries(TAB_CONFIG.map((tab) => [tab.routeName, tab.rootScreen]));

function AppStackNavigator({ initialRouteName }: { initialRouteName: string }) {
  return (
    <AppStack.Navigator initialRouteName={initialRouteName} screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      {APP_SCREENS.map((screen) => (
        <AppStack.Screen key={screen.key} name={screen.key} component={screen.Comp} />
      ))}
    </AppStack.Navigator>
  );
}

function activeNestedRouteName(route: Route<string>) {
  return getFocusedRouteNameFromRoute(route) ?? TAB_ROOT_BY_ROUTE[route.name];
}

function AppTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { currentUser } = useAppState();
  const activeRoute = state.routes[state.index];
  const activeNestedRoute = activeNestedRouteName(activeRoute);
  const profilePhoto = typeof currentUser?.profilePhoto === 'string' ? currentUser.profilePhoto : null;

  if (!TAB_BAR_VISIBLE_ROUTES.has(activeNestedRoute)) return null;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: BOTTOM_NAV_HEIGHT + insets.bottom,
        backgroundColor: '#FFFFFF',
      }}
    >
      <BottomNav
        active={TAB_ID_BY_ROUTE[activeRoute.name]}
        profilePhoto={profilePhoto}
        onNav={(tab) => {
          const routeName = TAB_ROUTE_BY_ID[tab];
          if (routeName && routeName !== activeRoute.name) navigation.navigate(routeName);
        }}
      />
    </View>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      initialRouteName="HomeTab"
      backBehavior="history"
      detachInactiveScreens={false}
      screenOptions={{ headerShown: false, lazy: true }}
      tabBar={(props) => <AppTabBar {...props} />}
    >
      {TAB_CONFIG.map((tab) => (
        <Tab.Screen key={tab.routeName} name={tab.routeName}>
          {() => <AppStackNavigator initialRouteName={tab.rootScreen} />}
        </Tab.Screen>
      ))}
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  return (
    <RootStack.Navigator initialRouteName="splash" screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      {ROOT_SCREENS.map((screen) => (
        <RootStack.Screen key={screen.key} name={screen.key} component={screen.Comp} />
      ))}
      <RootStack.Screen name="MainTabs" component={MainTabs} options={{ animation: 'none' }} />
    </RootStack.Navigator>
  );
}
