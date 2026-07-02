import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Linking, Platform } from 'react-native';
import Icon from '../components/Icon';
import { Spinner } from '../components/shared';
import { useNav } from '../navigation/useNav';
import { nextAuthenticatedRoute } from '../navigation/profileFlow';
import { useAppState } from '../state/AppState';
import { getPublicAppConfig, PublicAppConfig } from '../api/customer';

const STORE_UPDATE_URL = Platform.OS === 'android' ? 'https://play.google.com/store/apps' : 'https://apps.apple.com';
const CURRENT_APP_VERSION = '1.0.0';
const REQUIRED_APP_VERSION = '1.0.0';
const MAINTENANCE_BACK_AT = '2:00 PM IST';
const MAINTENANCE_MESSAGE = "Builtglory is under maintenance. We'll be back shortly.";

function usePublicAppConfig() {
  const [config, setConfig] = useState<PublicAppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setConfig(await getPublicAppConfig());
    } catch {
      setError('Using last-known app defaults until config is reachable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getPublicAppConfig()
      .then((next) => {
        if (active) setConfig(next);
      })
      .catch(() => {
        if (active) setError('Using last-known app defaults until config is reachable.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  return { config, loading, error, reload: load };
}

// ─── G-01 No Internet / Offline ───────────────────────────────
export function OfflineScreen() {
  const { go } = useNav();
  const [retrying, setRetrying] = useState(false);
  const retry = () => { setRetrying(true); setTimeout(() => { setRetrying(false); go('home'); }, 1200); };
  return (
    <View className="flex-1 bg-white items-center justify-center px-8">
      <View className="w-24 h-24 rounded-full bg-ink-100 items-center justify-center mb-5"><Icon name="wifi-off" size={44} color="#94A3B8" /></View>
      <Text className="text-[20px] font-bold text-ink-900 text-center">No internet connection</Text>
      <Text className="text-[13px] text-ink-500 mt-2 max-w-[240px] leading-relaxed text-center">Please check your network and try again.</Text>
      <Pressable onPress={retry} disabled={retrying} className="flex-row items-center justify-center gap-2 h-12 px-8 mt-6 rounded-xl bg-brand-600">
        {retrying && <Spinner color="white" />}
        <Text className="text-white font-semibold text-[15px]">{retrying ? 'Retrying…' : 'Retry'}</Text>
      </Pressable>
    </View>
  );
}

// ─── G-02 Force Update ─────────────────────────────────────────
export function ForceUpdateScreen() {
  const { config, loading, error, reload } = usePublicAppConfig();
  const storeUrl =
    (Platform.OS === 'android' ? config?.storeUrls.android : config?.storeUrls.ios) || STORE_UPDATE_URL;
  const currentVersion = config?.versions.current || CURRENT_APP_VERSION;
  const requiredVersion = config?.versions.minimumSupported || REQUIRED_APP_VERSION;
  const latestVersion = config?.versions.latest || requiredVersion;
  const [openError, setOpenError] = useState('');
  const openStore = async () => {
    setOpenError('');
    try {
      await Linking.openURL(storeUrl);
    } catch {
      setOpenError('Could not open the store link. Please update from your app store.');
    }
  };
  return (
    <View className="flex-1 bg-white items-center justify-center px-8">
      <View className="w-24 h-24 rounded-3xl bg-brand-600 items-center justify-center mb-5"><Icon name="arrow-up-circle" size={48} color="white" strokeWidth={1.5} /></View>
      <Text className="text-[20px] font-bold text-ink-900 text-center">Update required</Text>
      <Text className="text-[13px] text-ink-500 mt-2 max-w-[260px] leading-relaxed text-center">A new version of Builtglory is available. Please update to continue.</Text>
      <Pressable onPress={openStore} className="flex-row items-center justify-center gap-2 h-12 px-8 mt-6 rounded-xl bg-brand-600">
        <Icon name="download" size={17} color="white" /><Text className="text-white font-semibold text-[15px]">Update Now</Text>
      </Pressable>
      <Text className="text-[11px] text-ink-400 mt-3">Current {currentVersion} · Required {requiredVersion} · Latest {latestVersion}</Text>
      {loading ? (
        <View className="mt-2 flex-row items-center gap-1.5"><Spinner color="#94A3B8" size={13} /><Text className="text-[10.5px] text-ink-400">Checking app config...</Text></View>
      ) : (
        <Text className="text-[10.5px] text-ink-400 mt-1 text-center">Version checks are loaded from backend app config.</Text>
      )}
      {!!error && <Pressable onPress={reload}><Text className="text-[10.5px] text-amber-700 mt-2 text-center">{error} Tap to retry.</Text></Pressable>}
      {!!openError && <Text className="text-[11px] text-rose-600 mt-2 text-center">{openError}</Text>}
    </View>
  );
}

// ─── G-03 Maintenance Mode ─────────────────────────────────────
export function MaintenanceScreen() {
  const [secs, setSecs] = useState(60);
  const { config, loading, error, reload } = usePublicAppConfig();
  const message = config?.maintenance.message || MAINTENANCE_MESSAGE;
  const expectedBackAt = config?.maintenance.expectedBackAt || MAINTENANCE_BACK_AT;
  useEffect(() => {
    const t = setInterval(() => setSecs((d) => (d <= 1 ? 60 : d - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <View className="flex-1 bg-white items-center justify-center px-8">
      <View className="w-24 h-24 rounded-full bg-amber-50 items-center justify-center mb-5"><Icon name="wrench" size={42} color="#D97706" /></View>
      <Text className="text-[20px] font-bold text-ink-900 text-center">Under maintenance</Text>
      <Text className="text-[13px] text-ink-500 mt-2 max-w-[250px] leading-relaxed text-center">{message}</Text>
      <View className="mt-5 px-4 py-2 rounded-full bg-ink-50 flex-row items-center gap-2">
        <Icon name="clock" size={13} color="#64748B" /><Text className="text-[12px] text-ink-600">Expected back by {expectedBackAt}</Text>
      </View>
      <View className="mt-4 flex-row items-center gap-1.5"><Spinner color="#94A3B8" size={13} /><Text className="text-[11.5px] text-ink-400">Auto-retrying in {secs}s</Text></View>
      <Text className="text-[10.5px] text-ink-400 mt-2 text-center">{loading ? 'Checking maintenance config...' : 'Maintenance status is loaded from backend app config.'}</Text>
      {!!error && <Pressable onPress={reload}><Text className="text-[10.5px] text-amber-700 mt-2 text-center">{error} Tap to retry.</Text></Pressable>}
    </View>
  );
}

// ─── G-04 Session Expiry ────────────────────────────────────────
export function SessionExpiryScreen() {
  const { resetTo } = useNav();
  const { validateToken, signOut } = useAppState();
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');
  const retrySession = async () => {
    setChecking(true);
    setMessage('');
    const user = await validateToken();
    setChecking(false);
    if (user) resetTo(nextAuthenticatedRoute(user));
    else setMessage('We could not refresh your session. Please log in again.');
  };
  const loginAgain = async () => {
    setChecking(true);
    await signOut();
    setChecking(false);
    resetTo('login');
  };
  return (
    <View className="flex-1 bg-white items-center justify-center px-8">
      <View className="w-24 h-24 rounded-full bg-ink-100 items-center justify-center mb-5"><Icon name="clock-alert" size={42} color="#64748B" /></View>
      <Text className="text-[20px] font-bold text-ink-900 text-center">Session expired</Text>
      <Text className="text-[13px] text-ink-500 mt-2 max-w-[250px] leading-relaxed text-center">Your session has expired. Please log in again.</Text>
      <View className="mt-4 px-3 py-1.5 rounded-full bg-emerald-50 flex-row items-center gap-1.5"><Icon name="shield-check" size={13} color="#10B981" /><Text className="text-[11.5px] text-emerald-700 font-medium">Your data is safe</Text></View>
      {!!message && <Text className="text-[12px] text-rose-600 mt-3 text-center">{message}</Text>}
      <Pressable onPress={retrySession} disabled={checking} className="flex-row items-center justify-center gap-2 h-12 px-8 mt-5 rounded-xl bg-brand-600">
        {checking ? <Spinner color="white" /> : <Icon name="refresh-cw" size={17} color="white" />}
        <Text className="text-white font-semibold text-[15px]">{checking ? 'Checking...' : 'Try Refresh'}</Text>
      </Pressable>
      <Pressable onPress={loginAgain} disabled={checking} className="flex-row items-center justify-center gap-2 h-11 px-8 mt-2 rounded-xl bg-ink-100">
        <Icon name="log-in" size={17} color="#334155" /><Text className="text-ink-700 font-semibold text-[15px]">Log In Again</Text>
      </Pressable>
      <Text className="text-[11px] text-ink-400 mt-3">You'll return to where you left off.</Text>
    </View>
  );
}
