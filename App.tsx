import './global.css';
import { useCallback, useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppStateProvider } from './src/state/AppState';
import { RootNavigator } from './src/navigation/RootNavigator';
import { PushNotificationHost } from './src/components/PushNotificationHost';
import { navigationRef, flushPendingNotificationNavigation, handleAppUrl } from './src/navigation/navigationRef';
import { logResolvedApiConfig } from './src/config/api';

logResolvedApiConfig();

SplashScreen.preventAutoHideAsync().catch(() => {});

function AppShell() {
  return (
    <>
      <RootNavigator />
      <PushNotificationHost />
      <StatusBar style="dark" />
    </>
  );
}

export default function App() {
  const [appIsReady, setAppIsReady] = useState(false);

  useEffect(() => {
    setAppIsReady(true);
  }, []);

  useEffect(() => {
    void Linking.getInitialURL().then((url) => handleAppUrl(url));
    const subscription = Linking.addEventListener('url', ({ url }) => handleAppUrl(url));
    return () => subscription.remove();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (appIsReady) {
      await SplashScreen.hideAsync();
    }
  }, [appIsReady]);

  if (!appIsReady) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
        <SafeAreaProvider>
          <AppStateProvider>
            <NavigationContainer
              ref={navigationRef}
              onReady={() => {
                flushPendingNotificationNavigation();
              }}
              onStateChange={() => {
                flushPendingNotificationNavigation();
              }}
            >
              <AppShell />
            </NavigationContainer>
          </AppStateProvider>
        </SafeAreaProvider>
      </View>
    </GestureHandlerRootView>
  );
}
