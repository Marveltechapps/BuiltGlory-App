import { BuyEnquiry, CustomerNotification, CustomerProperty, CustomerVisit, SellRequest } from '../api/customer';
import { Property, normalizePropertyTypeKey, PROPERTY_TYPE_SLUG_TO_BACKEND } from '../data/data';

export type DisplayProperty = Property & { backend?: CustomerProperty };
export type HomeFeedCache = { featured: DisplayProperty[]; upcoming: DisplayProperty[] };
export type ProfileStats = { saved: number; enquiries: number; listed: number };
export type ProfileSummaryCache = { stats: ProfileStats; unread: number };
export type HistoryCache = { enquiries: BuyEnquiry[]; sellRequests: SellRequest[] };
export type NotificationsCache = CustomerNotification[];
export type VisitsCache = CustomerVisit[];

export const HOME_FEED_CACHE_KEY = 'tab:home:feed';
export const FEATURED_LIST_CACHE_KEY = 'screen:featured:list';
export const UPCOMING_LIST_CACHE_KEY = 'screen:upcoming:list';
export const HOME_UNREAD_CACHE_PREFIX = 'tab:home:unread';
export const FAVORITE_IDS_CACHE_PREFIX = 'tab:favorites:ids';
export const FAVORITES_LIST_CACHE_PREFIX = 'screen:favorites:list';
export const BUY_TYPE_COUNTS_CACHE_KEY = 'tab:buy:typeCounts';
export const BUY_ENQUIRIES_CACHE_PREFIX = 'screen:buy:enquiries';
export const NOTIFICATIONS_CACHE_PREFIX = 'screen:notifications:list';
export const PROFILE_SUMMARY_CACHE_PREFIX = 'tab:profile:summary';
export const SELL_LISTINGS_CACHE_PREFIX = 'tab:sell:listings';
export const VISITS_CACHE_PREFIX = 'screen:visits:list';
export const CONTENT_ITEM_CACHE_PREFIX = 'content:item';

export const TYPE_TO_BACKEND: Record<string, string> = {
  ...PROPERTY_TYPE_SLUG_TO_BACKEND,
};

const BACKEND_TO_APP_SLUG = Object.fromEntries(
  Object.entries(PROPERTY_TYPE_SLUG_TO_BACKEND).map(([slug, backend]) => [backend, slug]),
);

export function contentItemCacheKey(slug: string) {
  return `${CONTENT_ITEM_CACHE_PREFIX}:${slug}`;
}

export function toBackendType(type?: string) {
  if (!type) return undefined;
  return normalizePropertyTypeKey(type) ?? TYPE_TO_BACKEND[type] ?? type;
}

export function toNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function propertyMediaImages(media?: { coverPhoto?: string; photos?: string[] }): string[] {
  const photos = media?.photos ?? [];
  const cover = media?.coverPhoto;
  const combined = cover ? [cover, ...photos] : photos;
  const seen = new Set<string>();
  return combined.filter((url): url is string => {
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

export function toDisplayProperty(property: CustomerProperty): DisplayProperty {
  const id = String(property._id ?? property.id ?? property.referenceId ?? '');
  const area = toNumber(property.specs?.builtUpArea ?? property.specs?.carpetArea ?? property.specs?.plotArea);
  return {
    id,
    title: property.title ?? 'Untitled property',
    price: toNumber(property.price),
    type: normalizePropertyTypeKey(property.type) ?? property.type ?? 'residential',
    bhk: toNumber(property.specs?.bhk),
    area,
    floor: property.specs?.floor ?? '—',
    flatNo: property.address?.line2 ?? '—',
    location: property.address?.locality ?? property.address?.line1 ?? property.address?.city ?? 'Location unavailable',
    city: property.address?.city ?? '',
    images: propertyMediaImages(property.media),
    amenities: property.amenities ?? [],
    verified: property.status === 'available',
    negotiable: !!property.isNegotiable,
    views: toNumber(property.metrics?.views),
    enquiries: toNumber(property.metrics?.enquiries),
    posted: property.createdAt ? new Date(property.createdAt).toLocaleDateString('en-IN') : 'Recently added',
    rating: 0,
    sqftPrice: area > 0 ? Math.round(toNumber(property.price) / area) : 0,
    builder: property.source ?? 'BuiltGlory',
    desc: property.description ?? '',
    badge: property.isUpcoming ? 'Upcoming' : 'For Sale',
    launchDate: property.launchDate,
    backend: property,
  };
}

export function buildBuyTypeCounts(properties: CustomerProperty[]) {
  const next: Record<string, number> = {};
  properties.forEach((property) => {
    const backendType = normalizePropertyTypeKey(property.type) ?? property.type ?? 'residential';
    const appType = BACKEND_TO_APP_SLUG[backendType] ?? backendType;
    next[appType] = (next[appType] ?? 0) + 1;
  });
  return next;
}
