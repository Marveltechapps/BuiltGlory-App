import Constants from 'expo-constants';

declare const process: { env?: Record<string, string | undefined> } | undefined;

const ENV_KEYS = ['EXPO_PUBLIC_GOOGLE_MAPS_API_KEY', 'GOOGLE_MAPS_API_KEY'] as const;

function readMapsEnv() {
  for (const key of ENV_KEYS) {
    const fromProcess = process?.env?.[key]?.trim();
    if (fromProcess) return fromProcess;
  }

  const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined;
  for (const key of ENV_KEYS) {
    const fromExtra = extra?.[key]?.trim();
    if (fromExtra) return fromExtra;
  }

  return '';
}

export function getGoogleMapsApiKey() {
  return readMapsEnv();
}

export function isGoogleMapsConfigured() {
  return getGoogleMapsApiKey().length > 0;
}
