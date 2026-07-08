import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

declare const process: { env?: Record<string, string | undefined> } | undefined;

/** Default production API origin when no build-time override is provided. */
export const DEFAULT_PRODUCTION_API_ORIGIN = 'https://api.builtglory.com';

const DEFAULT_DEV_API_PORT = '3002';

const ENV_KEYS = {
  apiUrl: ['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_API_BASE_URL'],
  productionApiUrl: ['EXPO_PUBLIC_PRODUCTION_API_URL'],
  apiPort: ['EXPO_PUBLIC_API_PORT'],
} as const;

function stripTrailingSlashes(value: string) {
  return value.trim().replace(/\/+$/, '');
}

function readEnv(keys: readonly string[]) {
  for (const key of keys) {
    const fromProcess = process?.env?.[key]?.trim();
    if (fromProcess) return fromProcess;
  }

  const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
  for (const key of keys) {
    const fromExtra = extra?.[key]?.trim();
    if (fromExtra) return fromExtra;
  }

  return undefined;
}

function resolveExpoDevHost() {
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(':')[0]?.trim();
    if (host) return host;
  }

  const legacyHost =
    (Constants as { manifest2?: { extra?: { expoGo?: { debuggerHost?: string } } } }).manifest2?.extra?.expoGo
      ?.debuggerHost ??
    (Constants as { manifest?: { debuggerHost?: string } }).manifest?.debuggerHost;

  if (legacyHost) {
    const host = legacyHost.split(':')[0]?.trim();
    if (host) return host;
  }

  return null;
}

function resolveDevApiOrigin() {
  const configured = readEnv(ENV_KEYS.apiUrl);
  if (configured) return stripTrailingSlashes(configured);

  const devHost = resolveExpoDevHost();
  if (devHost) {
    const port = readEnv(ENV_KEYS.apiPort) || DEFAULT_DEV_API_PORT;
    return `http://${devHost}:${port}`;
  }

  // Android emulator: host machine loopback alias (physical devices use LAN IP via EXPO_PUBLIC_API_URL).
  if (Platform.OS === 'android' && !Device.isDevice) {
    const port = readEnv(ENV_KEYS.apiPort) || DEFAULT_DEV_API_PORT;
    return `http://10.0.2.2:${port}`;
  }

  throw new Error(
    'EXPO_PUBLIC_API_URL is not set. Add your computer\'s LAN IP (e.g. http://192.168.1.8:3002) to Customer-App-V1/.env and restart Expo.',
  );
}

function resolveProductionApiOrigin() {
  const configuredProduction = readEnv(ENV_KEYS.productionApiUrl);
  if (configuredProduction) return stripTrailingSlashes(configuredProduction);

  const configuredDev = readEnv(ENV_KEYS.apiUrl);
  if (configuredDev) return stripTrailingSlashes(configuredDev);

  return DEFAULT_PRODUCTION_API_ORIGIN;
}

export function resolveApiOrigin() {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    return resolveDevApiOrigin();
  }
  return resolveProductionApiOrigin();
}

export function normalizeApiBaseUrl(value: string) {
  const trimmed = stripTrailingSlashes(value);
  if (!trimmed) return `${resolveApiOrigin()}/api/v1`;
  if (trimmed.endsWith('/api/v1')) return trimmed;
  if (trimmed.endsWith('/api')) return `${trimmed}/v1`;
  return `${trimmed}/api/v1`;
}

export const API_BASE_URL = normalizeApiBaseUrl(resolveApiOrigin());

/** @deprecated Use API_BASE_URL — kept for existing imports. */
export const CUSTOMER_API_BASE_URL = API_BASE_URL;

export function getApiOrigin() {
  return resolveApiOrigin();
}

export function getApiBaseUrl() {
  return normalizeApiBaseUrl(resolveApiOrigin());
}

export function getChatServerOrigin() {
  return getApiBaseUrl()
    .replace(/\/api\/v1\/?$/, '')
    .replace(/\/api\/?$/, '');
}

export type ApiConfigDiagnostics = {
  devMode: boolean;
  apiOrigin: string;
  apiBaseUrl: string;
  env: {
    EXPO_PUBLIC_API_URL?: string;
    EXPO_PUBLIC_PRODUCTION_API_URL?: string;
    EXPO_PUBLIC_API_PORT?: string;
  };
};

export function getApiConfigDiagnostics(): ApiConfigDiagnostics {
  const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
  return {
    devMode: typeof __DEV__ !== 'undefined' && __DEV__,
    apiOrigin: resolveApiOrigin(),
    apiBaseUrl: getApiBaseUrl(),
    env: {
      EXPO_PUBLIC_API_URL: readEnv(ENV_KEYS.apiUrl) ?? extra?.EXPO_PUBLIC_API_URL,
      EXPO_PUBLIC_PRODUCTION_API_URL:
        readEnv(ENV_KEYS.productionApiUrl) ?? extra?.EXPO_PUBLIC_PRODUCTION_API_URL,
      EXPO_PUBLIC_API_PORT: readEnv(ENV_KEYS.apiPort) ?? extra?.EXPO_PUBLIC_API_PORT,
    },
  };
}

/** Logs the resolved API URL once at startup (visible in adb logcat for release APKs). */
export function logResolvedApiConfig() {
  const diagnostics = getApiConfigDiagnostics();
  console.log(
    `[BuiltGlory API] __DEV__=${String(diagnostics.devMode)} origin=${diagnostics.apiOrigin} base=${diagnostics.apiBaseUrl}`,
  );
}
