import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

declare const process: { env?: Record<string, string | undefined> } | undefined;

/** Default production API origin when no build-time override is provided. */
export const DEFAULT_PRODUCTION_API_ORIGIN = 'https://api.builtglory.com';

const DEFAULT_DEV_API_PORT = '5001';

const ENV_KEYS = {
  apiUrl: ['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_API_BASE_URL'],
  /** @deprecated Tunnel/ngrok is not used for local Expo LAN development. */
  tunnelApiUrl: ['EXPO_PUBLIC_TUNNEL_API_URL'],
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

function isLoopbackHost(hostname: string) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function isPrivateIpv4Host(hostname: string) {
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;

  const match = hostname.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (!match) return false;

  const secondOctet = Number(match[1]);
  return secondOctet >= 16 && secondOctet <= 31;
}

function isLikelyLanOnlyHost(hostname: string) {
  return isLoopbackHost(hostname) || isPrivateIpv4Host(hostname);
}

function isTunnelExpoHost(hostname: string | null) {
  if (!hostname) return false;
  return !isLikelyLanOnlyHost(hostname);
}

function rewriteDevOriginForDevice(origin: string, fallbackPort: string) {
  try {
    const url = new URL(origin);
    const port = url.port || fallbackPort;

    // Android emulator reaches the host machine via 10.0.2.2, not localhost.
    if (Platform.OS === 'android' && !Device.isDevice && isLoopbackHost(url.hostname)) {
      return `http://10.0.2.2:${port}`;
    }

    const devHost = resolveExpoDevHost();
    const expoOnLan = Boolean(devHost && isPrivateIpv4Host(devHost));
    const originIsLocal =
      isLoopbackHost(url.hostname) || isPrivateIpv4Host(url.hostname);

    // Physical device / simulator on LAN: keep the API port, but follow Expo's
    // current LAN host. That way a stale .env IP or Metro moving 8081→8082
    // cannot break API calls (Metro's port is never used as the API port).
    if (expoOnLan && originIsLocal && url.hostname !== devHost) {
      return `http://${devHost}:${port}`;
    }

    if (isLoopbackHost(url.hostname) && (Device.isDevice || Platform.OS === 'ios')) {
      if (devHost && !isLoopbackHost(devHost) && !isTunnelExpoHost(devHost)) {
        return `http://${devHost}:${port}`;
      }
    }

    return origin;
  } catch {
    return origin;
  }
}

function resolveDevApiOrigin() {
  const port = readEnv(ENV_KEYS.apiPort) || DEFAULT_DEV_API_PORT;
  const configured = readEnv(ENV_KEYS.apiUrl);
  const configuredTunnel = readEnv(ENV_KEYS.tunnelApiUrl);
  const configuredProduction = readEnv(ENV_KEYS.productionApiUrl);
  const devHost = resolveExpoDevHost();
  const usingExpoTunnel = isTunnelExpoHost(devHost);

  // Prefer Expo's advertised LAN host so DHCP IP changes never require .env edits.
  if (devHost && isPrivateIpv4Host(devHost)) {
    if (configured) {
      return rewriteDevOriginForDevice(stripTrailingSlashes(configured), port);
    }
    return `http://${devHost}:${port}`;
  }

  if (usingExpoTunnel) {
    if (configuredTunnel) return stripTrailingSlashes(configuredTunnel);
    if (configuredProduction) return stripTrailingSlashes(configuredProduction);
  }

  if (configured) {
    return rewriteDevOriginForDevice(stripTrailingSlashes(configured), port);
  }

  if (devHost) {
    return `http://${devHost}:${port}`;
  }

  // Android emulator: host machine loopback alias.
  if (Platform.OS === 'android' && !Device.isDevice) {
    return `http://10.0.2.2:${port}`;
  }

  throw new Error(
    'Could not resolve a LAN API URL. Start Expo with `npm start` (LAN mode) on the same Wi-Fi as the device, or set EXPO_PUBLIC_API_PORT (default 5001).',
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
    EXPO_PUBLIC_TUNNEL_API_URL?: string;
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
      EXPO_PUBLIC_TUNNEL_API_URL: readEnv(ENV_KEYS.tunnelApiUrl) ?? extra?.EXPO_PUBLIC_TUNNEL_API_URL,
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
