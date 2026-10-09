import { Platform, Share } from 'react-native';
import Constants from 'expo-constants';
import { getApiOrigin } from './api';
import { formatINR } from '../data/data';

declare const process: { env?: Record<string, string | undefined> } | undefined;

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

/**
 * Public origin used in shared property links.
 * Prefer EXPO_PUBLIC_APP_LINK_ORIGIN when a real domain is hosted.
 * Otherwise use the live API origin so the link actually resolves.
 */
export function getAppLinkOrigin() {
  const configured = readEnv(['EXPO_PUBLIC_APP_LINK_ORIGIN', 'EXPO_PUBLIC_APP_PUBLIC_URL']);
  if (configured) return stripTrailingSlashes(configured);
  return stripTrailingSlashes(getApiOrigin());
}

export function getAppLinkHost() {
  try {
    return new URL(getAppLinkOrigin()).hostname;
  } catch {
    return 'builtglory.app';
  }
}

export function propertySharePath(propertyId: string) {
  return `/p/${encodeURIComponent(propertyId)}`;
}

export function propertyShareUrl(propertyId: string) {
  return `${getAppLinkOrigin()}${propertySharePath(propertyId)}`;
}

export function propertyCustomSchemeUrl(propertyId: string) {
  return `builtglory://property/${encodeURIComponent(propertyId)}`;
}

export function buildPropertyShareMessage(property: {
  title?: string;
  location?: string;
  city?: string;
  price?: number;
  desc?: string;
  id: string;
}) {
  const url = propertyShareUrl(property.id);
  const summary = [property.location, property.city].filter((part) => typeof part === 'string' && part.trim()).join(', ');
  const price = property.price ? formatINR(property.price) : '';
  const excerpt = typeof property.desc === 'string' ? property.desc.trim().replace(/\s+/g, ' ').slice(0, 160) : '';
  const lines = [property.title?.trim(), summary, price, excerpt].filter(Boolean) as string[];
  return { url, lines, text: [...lines, url].join('\n') };
}

export async function sharePropertyNative(property: {
  title?: string;
  location?: string;
  city?: string;
  price?: number;
  desc?: string;
  id: string;
}) {
  const { url, lines, text } = buildPropertyShareMessage(property);
  const title = property.title?.trim() || 'BuiltGlory property';
  if (Platform.OS === 'ios') {
    await Share.share({ title, message: lines.join('\n'), url });
  } else {
    await Share.share({ title, message: text });
  }
  return url;
}

export function extractPropertyIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const path = `${parsed.hostname || ''}${parsed.pathname || ''}`.replace(/^\/+/, '');
    const segments = path.split('/').filter(Boolean);
    const index = segments.findIndex((segment) => segment === 'p' || segment === 'property');
    if (index >= 0 && segments[index + 1]) {
      return decodeURIComponent(segments[index + 1].split('?')[0]);
    }
    const fromQuery = parsed.searchParams.get('propertyId') || parsed.searchParams.get('id');
    return fromQuery ? decodeURIComponent(fromQuery) : null;
  } catch {
    return null;
  }
}
