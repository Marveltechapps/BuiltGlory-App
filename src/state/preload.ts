import {
  CustomerProfile,
  PublicContentItem,
  SellRequest,
  getFavoriteProperties,
  getPublicContent,
  listBuyEnquiries,
  listCustomerNotifications,
  listCustomerProperties,
  listSellRequests,
} from '../api/customer';
import {
  BUY_TYPE_COUNTS_CACHE_KEY,
  BUY_ENQUIRIES_CACHE_PREFIX,
  FAVORITE_IDS_CACHE_PREFIX,
  FAVORITES_LIST_CACHE_PREFIX,
  FEATURED_LIST_CACHE_KEY,
  HOME_FEED_CACHE_KEY,
  HOME_UNREAD_CACHE_PREFIX,
  HistoryCache,
  HomeFeedCache,
  NOTIFICATIONS_CACHE_PREFIX,
  NotificationsCache,
  PROFILE_SUMMARY_CACHE_PREFIX,
  ProfileSummaryCache,
  SELL_LISTINGS_CACHE_PREFIX,
  UPCOMING_LIST_CACHE_KEY,
  VISITS_CACHE_PREFIX,
  VisitsCache,
  buildBuyTypeCounts,
  contentItemCacheKey,
  toDisplayProperty,
} from './primaryTabCache';

const PRIMARY_PRELOAD_TIMEOUT_MS = 1800;
const PRIMARY_CONTENT_SLUGS = [
  'home-screen-banners-config',
  'home-screen-layout-config',
  'property-type-visibility-config',
];

type CacheWriter = <T>(key: string, value: T) => void;

export type PrimaryTabPreloadOptions = {
  accessToken: string | null;
  currentUser: CustomerProfile | null;
  setCachedValue: CacheWriter;
};

async function ignoreFailure(task: Promise<unknown>) {
  try {
    await task;
  } catch {
    // Preload is opportunistic; screen loaders keep their own retry/error states.
  }
}

async function withTimeout(task: Promise<void>, timeoutMs = PRIMARY_PRELOAD_TIMEOUT_MS) {
  await Promise.race([
    task,
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

export async function preloadPrimaryTabs({ accessToken, currentUser, setCachedValue }: PrimaryTabPreloadOptions) {
  if (!currentUser || !accessToken) return;

  const fullFeaturedPromise = listCustomerProperties({ featured: true, limit: 50, sort: 'newest' });
  const fullUpcomingPromise = listCustomerProperties({ upcoming: true, limit: 50, sort: 'newest' });
  const allPropertiesPromise = listCustomerProperties({ limit: 100, sort: 'newest' });
  const favoritesPromise = getFavoriteProperties(accessToken);
  const enquiriesPromise = listBuyEnquiries(accessToken, { limit: 50, sort: 'newest' });
  const listingsPromise = listSellRequests(accessToken, { limit: 50, sort: 'newest' });
  const notificationsPromise = listCustomerNotifications(accessToken, { limit: 50 });

  const preloadHome = ignoreFailure((async () => {
    const [featuredData, upcomingData] = await Promise.all([
      fullFeaturedPromise,
      fullUpcomingPromise,
    ]);
    const featured = featuredData.map(toDisplayProperty).filter((property) => property.id);
    const upcoming = upcomingData.map(toDisplayProperty).filter((property) => property.id);
    const homeFeed: HomeFeedCache = {
      featured: featured.slice(0, 5),
      upcoming: upcoming.slice(0, 3),
    };
    setCachedValue(HOME_FEED_CACHE_KEY, homeFeed);
    setCachedValue(FEATURED_LIST_CACHE_KEY, featured);
    setCachedValue(UPCOMING_LIST_CACHE_KEY, upcoming);
  })());

  const preloadBuy = ignoreFailure((async () => {
    const properties = await allPropertiesPromise;
    setCachedValue(BUY_TYPE_COUNTS_CACHE_KEY, buildBuyTypeCounts(properties));
  })());

  const preloadFavorites = ignoreFailure((async () => {
    const favorites = await favoritesPromise;
    const ids = new Set(favorites.map((property) => String(property._id ?? property.id ?? '')).filter(Boolean));
    setCachedValue(`${FAVORITE_IDS_CACHE_PREFIX}:${accessToken}`, ids);
    setCachedValue(`${FAVORITES_LIST_CACHE_PREFIX}:${accessToken}`, favorites.map(toDisplayProperty).filter((property) => property.id));
  })());

  const preloadNotifications = ignoreFailure((async () => {
    const notifications: NotificationsCache = await notificationsPromise;
    const unread = notifications.filter((notification) => notification.unread).length;
    setCachedValue(`${NOTIFICATIONS_CACHE_PREFIX}:${accessToken}`, notifications);
    setCachedValue(`${HOME_UNREAD_CACHE_PREFIX}:${accessToken}`, unread);
    return unread;
  })());

  const preloadProfile = ignoreFailure((async () => {
    const [favorites, enquiries, listings, notifications] = await Promise.all([
      favoritesPromise,
      enquiriesPromise,
      listingsPromise,
      notificationsPromise,
    ]);
    const summary: ProfileSummaryCache = {
      stats: { saved: favorites.length, enquiries: enquiries.length, listed: listings.length },
      unread: notifications.filter((notification) => notification.unread).length,
    };
    setCachedValue(`${PROFILE_SUMMARY_CACHE_PREFIX}:${accessToken}`, summary);
    setCachedValue<HistoryCache>(`${BUY_ENQUIRIES_CACHE_PREFIX}:${accessToken}:history`, { enquiries, sellRequests: listings });
  })());

  const preloadSell = ignoreFailure((async () => {
    const listings: SellRequest[] = await listingsPromise;
    setCachedValue(`${SELL_LISTINGS_CACHE_PREFIX}:${accessToken}`, listings);
  })());

  const preloadEnquiriesAndVisits = ignoreFailure((async () => {
    const enquiries = await enquiriesPromise;
    const visits: VisitsCache = enquiries.flatMap((enquiry) => enquiry.visits || []);
    setCachedValue(`${BUY_ENQUIRIES_CACHE_PREFIX}:${accessToken}`, enquiries);
    setCachedValue(`${VISITS_CACHE_PREFIX}:${accessToken}`, visits);
  })());

  const preloadContent = ignoreFailure(Promise.all(
    PRIMARY_CONTENT_SLUGS.map(async (slug) => {
      const item: PublicContentItem = await getPublicContent(slug);
      setCachedValue(contentItemCacheKey(slug), item);
    })
  ).then(() => undefined));

  await withTimeout(Promise.all([
    preloadHome,
    preloadBuy,
    preloadFavorites,
    preloadNotifications,
    preloadProfile,
    preloadSell,
    preloadEnquiriesAndVisits,
    preloadContent,
  ]).then(() => undefined));
}
