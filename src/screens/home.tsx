import React, { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image, Keyboard, KeyboardAvoidingView, Linking, Platform, View, Text, Pressable, ScrollView, TextInput, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { androidInputStyle } from '../setup/androidText';
import Svg, { Path } from 'react-native-svg';
import Icon from '../components/Icon';
import { BrandLogo } from '../components/BrandLogo';
import {
  Screen, TopBar, Input, Chip, Badge, Heart, PropertyCard, PhotoPlaceholder,
  Sheet, Toast, useToast, Btn, Toggle, Field, Spinner, SkeletonCard, EmptyState,
  AnimatedNumber, FadeInView, PressableScale,
} from '../components/shared';
import { PROPERTY_TYPES, formatINR, formatPropertyTypeLabel } from '../data/data';
import { useAppState } from '../state/AppState';
import { useNav } from '../navigation/useNav';
import { useFocusEffect } from '@react-navigation/native';
import { ChatSocket, createChatSocket } from '../realtime/chatSocket';
import { contentMetaArray, fallbackFaqContent, useContentItem, useContentSection } from '../content';
import { openCompanyCall, openCompanyWhatsApp } from '../config/companyContact';
import {
  addSupportTicketResponse,
  CreateSupportTicketInput,
  createCallbackRequest,
  createAppFeedback,
  createSupportTicket,
  CustomerProfile,
  clearRecentSearches,
  getSupportTicket,
  listRecentSearches,
  listCustomerProperties,
  listSupportTickets,
  listTrendingSearches,
  recordRecentSearch,
  SupportTicket,
} from '../api/customer';
import {
  FEATURED_LIST_CACHE_KEY,
  HOME_FEED_CACHE_KEY,
  HOME_UNREAD_CACHE_PREFIX,
  HomeFeedCache,
  DisplayProperty,
  UPCOMING_LIST_CACHE_KEY,
  toDisplayProperty,
} from '../state/primaryTabCache';
import { refreshUnreadNotificationCount } from '../utils/notificationSync';

type TourStepId = 'search' | 'actions' | 'favorite' | 'nav';
type TourTarget = { top: number; left: number; width: number; height: number };
type HomeBannerConfig = {
  id: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  useImage?: boolean;
  bgColor?: string;
  textColor?: string;
  ctaText?: string;
  ctaColor?: string;
  navigateTo?: 'property' | 'featured' | 'upcoming' | 'buy' | 'sell' | 'url' | 'none';
  propertyId?: string | null;
  externalUrl?: string | null;
  startDate?: string;
  expiryDate?: string;
  isActive?: boolean;
  order?: number;
};
type HomeSectionConfig = {
  id: string;
  isActive?: boolean;
  order?: number;
};

const fallbackHomeBannersContent = {
  slug: 'home-screen-banners-config',
  section: 'banner' as const,
  title: 'Home Screen Banners',
  metadata: { banners: [] },
};
const fallbackHomeLayoutContent = {
  slug: 'home-screen-layout-config',
  section: 'home' as const,
  title: 'Home Screen Section Layout',
  metadata: { sections: [] },
};
const HOME_GUIDE_SEEN_KEY_PREFIX = 'builtglory.homeGuide.seen.v1';
const SEARCH_RECENTS_CACHE_PREFIX = 'screen:search:recents';
const SEARCH_TRENDING_CACHE_KEY = 'screen:search:trending';

function homeGuideSeenKey(user: CustomerProfile | null) {
  const userId = user?._id ?? user?.id ?? user?.referenceId ?? user?.phoneNormalized ?? user?.mobileNumber ?? user?.phone ?? 'guest';
  return `${HOME_GUIDE_SEEN_KEY_PREFIX}.${String(userId).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
}

function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View className="p-3 bg-rose-50 border border-rose-200 rounded-card flex-row items-center gap-2">
      <Icon name="alert-circle" size={14} color="#E11D48" />
      <Text className="text-[12px] text-rose-700 flex-1">{message}</Text>
      {onRetry && (
        <Pressable onPress={onRetry} className="px-2 py-1 rounded-md bg-white border border-rose-200">
          <Text className="text-[11px] font-semibold text-rose-700">Retry</Text>
        </Pressable>
      )}
    </View>
  );
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <View className="py-8 px-4 gap-3">
      <View className="items-center gap-2 mb-1">
        <Spinner color="#1A6FFF" size={20} />
        <Text className="text-[12px] text-ink-500">{label}</Text>
      </View>
      <SkeletonCard compact />
      <SkeletonCard compact />
    </View>
  );
}

function CompactLoadingBlock({ label }: { label: string }) {
  return (
    <View className="py-6 items-center gap-2">
      <Spinner color="#1A6FFF" size={20} />
      <Text className="text-[12px] text-ink-500">{label}</Text>
    </View>
  );
}

// ─── H-01 Home ───────────────────────────────────────────────
export function HomeScreen() {
  const { go } = useNav();
  const { authToken, currentUser, fav, getCachedValue, setCachedValue, clearCachedValue, loadFavoriteIds, toggleRemoteFavorite } = useAppState();
  const [unread, setUnread] = useState(0);
  const [coach, setCoach] = useState(false);
  const [featured, setFeatured] = useState<DisplayProperty[]>([]);
  const [upcoming, setUpcoming] = useState<DisplayProperty[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [refreshingFeed, setRefreshingFeed] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [tourTargets, setTourTargets] = useState<Partial<Record<TourStepId, TourTarget>>>({});
  const rootRef = useRef<any>(null);
  const searchRef = useRef<any>(null);
  const actionsRef = useRef<any>(null);
  const favoriteRef = useRef<any>(null);
  const { item: bannerConfig } = useContentItem('home-screen-banners-config', fallbackHomeBannersContent);
  const { item: layoutConfig } = useContentItem('home-screen-layout-config', fallbackHomeLayoutContent);
  const homeSections = contentMetaArray<HomeSectionConfig>(layoutConfig, 'sections');
  const isHomeSectionEnabled = useCallback((sectionId: string) => {
    const section = homeSections.find((item) => item.id === sectionId);
    return section?.isActive !== false;
  }, [homeSections]);
  const homeBanners = contentMetaArray<HomeBannerConfig>(bannerConfig, 'banners')
    .filter((banner) => {
      const now = Date.now();
      if (!isHomeSectionEnabled('promotional_banners')) return false;
      if (banner.isActive === false) return false;
      if (banner.startDate && new Date(banner.startDate).getTime() > now) return false;
      if (banner.expiryDate && new Date(banner.expiryDate).getTime() < now) return false;
      return true;
    })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const showFeaturedSection = isHomeSectionEnabled('featured_properties');
  const showUpcomingSection = isHomeSectionEnabled('upcoming_properties');
  const openHomeBanner = useCallback((banner: HomeBannerConfig) => {
    switch (banner.navigateTo) {
      case 'property':
        if (banner.propertyId) go('propertyDetail', { propertyId: banner.propertyId });
        break;
      case 'featured':
        go('featured');
        break;
      case 'upcoming':
        go('upcoming');
        break;
      case 'buy':
        go('buyTypes');
        break;
      case 'sell':
        go('sellTypes');
        break;
      case 'url':
        if (banner.externalUrl) Linking.openURL(banner.externalUrl).catch(() => undefined);
        break;
      default:
        break;
    }
  }, [go]);
  const loadHomeFeed = useCallback(async (force = false) => {
    const cached = getCachedValue<HomeFeedCache>(HOME_FEED_CACHE_KEY);
    if (cached && !force) {
      setFeatured(cached.featured);
      setUpcoming(cached.upcoming);
      setLoadingFeed(false);
      loadFavoriteIds().catch(() => new Set<string>());
      return;
    }

    if (force) setRefreshingFeed(true);
    else setLoadingFeed(true);
    setFeedError(null);
    try {
      const [featuredData, upcomingData] = await Promise.all([
        listCustomerProperties({ featured: true, limit: 5, sort: 'newest' }),
        listCustomerProperties({ upcoming: true, limit: 3, sort: 'newest' }),
        loadFavoriteIds().catch(() => new Set<string>()),
      ]);
      const nextFeatured = featuredData.map(toDisplayProperty).filter((property) => property.id);
      const nextUpcoming = upcomingData.map(toDisplayProperty).filter((property) => property.id);
      setFeatured(nextFeatured);
      setUpcoming(nextUpcoming);
      setCachedValue<HomeFeedCache>(HOME_FEED_CACHE_KEY, { featured: nextFeatured, upcoming: nextUpcoming });
    } catch {
      setFeedError('Could not load properties from the server.');
      setFeatured([]);
      setUpcoming([]);
    } finally {
      setLoadingFeed(false);
      setRefreshingFeed(false);
    }
  }, [getCachedValue, loadFavoriteIds, setCachedValue]);
  const loadUnreadCount = useCallback(async (force = false) => {
    if (!authToken) {
      setUnread(0);
      return;
    }
    if (!force) {
      const cached = getCachedValue<number>(`${HOME_UNREAD_CACHE_PREFIX}:${authToken}`);
      if (cached !== null) {
        setUnread(cached);
        return;
      }
    }
    try {
      const nextUnread = await refreshUnreadNotificationCount(authToken, { getCachedValue, setCachedValue, clearCachedValue });
      setUnread(nextUnread);
    } catch {
      setUnread(0);
    }
  }, [authToken, clearCachedValue, getCachedValue, setCachedValue]);
  const handleFavorite = useCallback(async (id: string) => {
    try {
      await toggleRemoteFavorite(id);
    } catch {
      setFeedError('Could not update saved property. Please try again.');
    }
  }, [toggleRemoteFavorite]);
  const measureTarget = useCallback((id: TourStepId, ref: React.MutableRefObject<any>, adjust?: (target: TourTarget) => TourTarget) => {
    requestAnimationFrame(() => {
      rootRef.current?.measureInWindow?.((rootLeft: number, rootTop: number) => {
        ref.current?.measureInWindow?.((left: number, top: number, width: number, height: number) => {
          const next = adjust
            ? adjust({ left: left - rootLeft, top: top - rootTop, width, height })
            : { left: left - rootLeft, top: top - rootTop, width, height };
          setTourTargets((prev) => ({ ...prev, [id]: next }));
        });
      });
    });
  }, []);
  useEffect(() => {
    if (authToken && !currentUser) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const key = homeGuideSeenKey(currentUser);

    AsyncStorage.getItem(key)
      .then((seen) => {
        if (cancelled || seen === 'true') return;
        timer = setTimeout(() => {
          if (cancelled) return;
          setCoach(true);
          AsyncStorage.setItem(key, 'true').catch(() => undefined);
        }, 800);
      })
      .catch(() => {
        if (!cancelled) setCoach(true);
      });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [authToken, currentUser]);
  const closeCoach = useCallback(() => {
    setCoach(false);
    AsyncStorage.setItem(homeGuideSeenKey(currentUser), 'true').catch(() => undefined);
  }, [currentUser]);
  useEffect(() => {
    loadHomeFeed();
  }, [loadHomeFeed]);
  useEffect(() => {
    loadUnreadCount();
  }, [loadUnreadCount]);

  useFocusEffect(
    React.useCallback(() => {
      void loadUnreadCount(true);
    }, [loadUnreadCount]),
  );
  useEffect(() => {
    if (!coach) return;
    const t = setTimeout(() => {
      measureTarget('search', searchRef);
      measureTarget('actions', actionsRef);
      measureTarget('favorite', favoriteRef, (target) => ({
        top: target.top + 12,
        left: target.left + target.width - 52,
        width: 40,
        height: 40,
      }));
    }, 80);
    return () => clearTimeout(t);
  }, [coach, measureTarget]);
  return (
    <View ref={rootRef} className="flex-1">
      <Screen
        padBottom
        refreshing={refreshingFeed}
        onRefresh={() => loadHomeFeed(true)}
        fixedTop={
          <View className="px-4 pt-2 pb-5 flex-row items-center justify-between bg-white">
            <BrandLogo size={36} />
            <View className="flex-row items-center gap-1">
              <PressableScale onPress={() => go('help')} className="w-9 h-9 rounded-full bg-ink-100 items-center justify-center">
                <Icon name="help-circle" size={17} color="#64748B" />
              </PressableScale>
              <PressableScale
                onPress={() => go('notifications')}
                className="w-9 h-9 rounded-full bg-ink-100 items-center justify-center relative"
              >
                <Icon name="bell" size={17} color="#64748B" />
                {unread > 0 && (
                  <View className="absolute top-1 right-1 min-w-[16px] h-4 bg-rose-500 rounded-full items-center justify-center px-1">
                    <Text className="text-white text-[9px] font-bold">{unread > 99 ? '99+' : unread}</Text>
                  </View>
                )}
              </PressableScale>
            </View>
          </View>
        }
      >
        <View className="px-4">
          <PressableScale
            ref={searchRef}
            onLayout={() => measureTarget('search', searchRef)}
            onPress={() => go('search')}
            className="flex-row items-center gap-2 px-3.5 py-3 bg-ink-100 rounded-xl"
          >
            <Icon name="search" size={16} color="#64748B" />
            <Text className="flex-1 text-[14px] text-ink-500">Search by location or property type</Text>
          </PressableScale>
        </View>

      {homeBanners.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mt-4 pl-4"
          contentContainerStyle={{ gap: 12, paddingRight: 16 }}
        >
          {homeBanners.map((banner) => {
            const showImage = banner.useImage && !!banner.imageUrl;
            const textColor = banner.textColor === 'white'
              ? '#FFFFFF'
              : banner.textColor === 'dark'
                ? '#0F172A'
                : banner.textColor || '#0F172A';
            return (
              <PressableScale
                key={banner.id}
                onPress={() => openHomeBanner(banner)}
                style={{ width: 280, backgroundColor: showImage ? '#0F172A' : banner.bgColor || '#EFF6FF' }}
                className="relative overflow-hidden rounded-2xl p-4 min-h-[116px] justify-between"
              >
                {showImage && (
                  <>
                    <Image source={{ uri: banner.imageUrl }} className="absolute inset-0 w-full h-full" resizeMode="cover" />
                    <View className="absolute inset-0 bg-black/35" />
                  </>
                )}
                <View className="relative">
                <Text
                  className="text-[18px] font-bold"
                  style={{ color: textColor }}
                  numberOfLines={2}
                >
                  {banner.title}
                </Text>
                {!!banner.subtitle && (
                  <Text
                    className="text-[12px] mt-1"
                    style={{ color: textColor }}
                    numberOfLines={2}
                  >
                    {banner.subtitle}
                  </Text>
                )}
              </View>
              {!!banner.ctaText && banner.navigateTo !== 'none' && (
                <View
                  className="relative self-start rounded-full px-3 py-1.5 mt-3"
                  style={{ backgroundColor: banner.ctaColor || '#1A6FFF' }}
                >
                  <Text className="text-[11px] font-semibold" style={{ color: (banner.ctaColor || '').toLowerCase() === '#ffffff' ? '#1A6FFF' : '#FFFFFF' }}>{banner.ctaText}</Text>
                </View>
              )}
              </PressableScale>
            );
          })}
        </ScrollView>
      )}

      <View ref={actionsRef} onLayout={() => measureTarget('actions', actionsRef)} className="px-4 mt-4 flex-row gap-3">
        <PressableScale onPress={() => go('buyTypes')} className="flex-1 min-h-[104px] rounded-xl p-4 justify-between bg-brand-600">
          <Icon name="home" size={26} color="white" />
          <View>
            <Text className="text-[16px] font-bold text-white">Buy</Text>
            <Text className="text-[11px] text-white/80">Browse properties</Text>
          </View>
        </PressableScale>
        <PressableScale onPress={() => go('sellTypes')} className="flex-1 min-h-[104px] rounded-xl p-4 justify-between bg-brand-50">
          <Icon name="tag" size={26} color="#1A6FFF" />
          <View>
            <Text className="text-[16px] font-bold text-brand-600">Sell</Text>
            <Text className="text-[11px] text-brand-600/70">List your property</Text>
          </View>
        </PressableScale>
      </View>

      <View className="px-4 mt-3 flex-row gap-2">
        {[[String(featured.length + upcoming.length), 'Loaded listings'], ['0%', 'Brokerage'], ['24×7', 'Support']].map(([n, l]) => (
          <FadeInView key={l} className="flex-1 p-2.5 bg-ink-50 rounded-card items-center">
            <AnimatedNumber value={n} className="text-[15px] font-bold text-brand-600 leading-display" />
            <Text className="text-[10.5px] text-ink-500 mt-1">{l}</Text>
          </FadeInView>
        ))}
      </View>

      {feedError && <View className="px-4 mt-4"><ErrorCard message={feedError} onRetry={loadHomeFeed} /></View>}

      {showFeaturedSection && (
        <>
          <View className="px-4 mt-6 flex-row items-center justify-between">
            <View>
              <Text className="text-[15px] font-bold">Featured Properties</Text>
              <Text className="text-[11px] text-ink-500">Hand-picked, ready to move in</Text>
            </View>
            <Pressable onPress={() => go('featured')} className="flex-row items-center gap-1">
              <Text className="text-brand-600 text-[12px] font-semibold">See All</Text>
              <Icon name="arrow-right" size={12} color="#1A6FFF" />
            </Pressable>
          </View>
          {loadingFeed ? (
            <LoadingBlock label="Loading featured properties..." />
          ) : featured.length === 0 ? (
            <EmptyState icon="home" title="No featured properties yet" body="Check back after new verified listings are published." />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3 pl-4" contentContainerStyle={{ gap: 12, paddingRight: 16 }}>
              {featured.slice(0, 5).map((p, idx) => (
                <FadeInView
                  key={p.id}
                  delay={idx * 65}
                  ref={idx === 0 ? favoriteRef : undefined}
                  onLayout={idx === 0 ? () => measureTarget('favorite', favoriteRef, (target) => ({
                    top: target.top + 12,
                    left: target.left + target.width - 52,
                    width: 40,
                    height: 40,
                  })) : undefined}
                  style={{ width: 240 }}
                >
                  <PropertyCard p={p} fav={fav.has(p.id)} onFav={() => handleFavorite(p.id)} onPress={() => go('propertyDetail', { p })} />
                </FadeInView>
              ))}
            </ScrollView>
          )}
        </>
      )}

      {showUpcomingSection && (
        <>
          <View className="px-4 mt-6 flex-row items-center justify-between">
            <View>
              <Text className="text-[15px] font-bold">Upcoming Properties</Text>
              <Text className="text-[11px] text-ink-500">Book early access</Text>
            </View>
            <Pressable onPress={() => go('upcoming')} className="flex-row items-center gap-1">
              <Text className="text-brand-600 text-[12px] font-semibold">See All</Text>
              <Icon name="arrow-right" size={12} color="#1A6FFF" />
            </Pressable>
          </View>
          {loadingFeed ? (
            <LoadingBlock label="Loading upcoming launches..." />
          ) : upcoming.length === 0 ? (
            <EmptyState icon="clock" title="No upcoming launches right now" body="New launch windows will appear here." />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3 pl-4" contentContainerStyle={{ gap: 12, paddingRight: 16 }}>
              {upcoming.slice(0, 3).map((p, idx) => (
                <FadeInView key={p.id} delay={idx * 70} style={{ width: 240 }} className="bg-white rounded-card border border-ink-200 overflow-hidden">
                  <Pressable onPress={() => go('propertyDetail', { p })}>
                    <PhotoPlaceholder tag={p.id} imageUri={p.images?.[0]} height={130}>
                      <View className="absolute top-2 left-2"><Badge color="amber">Upcoming</Badge></View>
                      <View className="absolute top-2 right-2"><Heart active={fav.has(p.id)} onPress={() => handleFavorite(p.id)} /></View>
                    </PhotoPlaceholder>
                  </Pressable>
                  <View className="p-3">
                    <Text className="text-[13px] font-semibold" numberOfLines={1}>{p.title}</Text>
                    <Text className="text-[12px] text-ink-500 mt-0.5">{p.location}, {p.city}</Text>
                    <Text className="text-[14px] font-bold text-brand-600 mt-1">{formatINR(p.price)}</Text>
                    <View className="mt-2 bg-ink-900 px-2 py-1 rounded self-start flex-row items-center gap-1">
                      <Icon name="clock" size={10} color="white" />
                      <Text className="text-white text-[10px] font-semibold">Launching soon</Text>
                    </View>
                  </View>
                </FadeInView>
              ))}
            </ScrollView>
          )}
        </>
      )}

      <View className="px-4 mt-6">
        <PressableScale onPress={() => go('help')} className="flex-row items-center gap-3 p-4 rounded-card border border-brand-200 bg-brand-50">
          <View className="w-10 h-10 rounded-full bg-brand-600 items-center justify-center">
            <Icon name="headphones" size={18} color="white" />
          </View>
          <View className="flex-1">
            <Text className="text-[14px] font-semibold text-brand-700">Need help finding a home?</Text>
            <Text className="text-[11px] text-brand-600">Chat with our property advisor</Text>
          </View>
          <Icon name="arrow-right" size={16} color="#1A6FFF" />
        </PressableScale>
      </View>
      </Screen>
      {coach && <CoachMarksScreen targets={tourTargets} onDone={closeCoach} />}
    </View>
  );
}

function useBrowseTypeGridLayout() {
  const { width } = useWindowDimensions();
  const gap = 10;
  const pad = 16;
  const columns = width < 360 ? 3 : 4;
  const itemWidth = (width - pad * 2 - gap * (columns - 1)) / columns;
  const iconBox = Math.round(Math.min(48, Math.max(36, itemWidth * 0.5)));
  const iconSize = Math.round(iconBox * 0.45);
  const fontSize = width < 360 ? 9.5 : 10.5;
  return { gap, itemWidth, iconBox, iconSize, fontSize };
}

// ─── H-02 Search ─────────────────────────────────────────────
export function SearchScreen() {
  const { go, back } = useNav();
  const browseTypeGrid = useBrowseTypeGridLayout();
  const { authToken, getCachedValue, setCachedValue } = useAppState();
  const [q, setQ] = useState('');
  const [recents, setRecents] = useState<string[]>([]);
  const [trending, setTrending] = useState<string[]>([]);
  const [results, setResults] = useState<DisplayProperty[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [loadingSearchMeta, setLoadingSearchMeta] = useState(true);
  const recentCacheKey = `${SEARCH_RECENTS_CACHE_PREFIX}:${authToken ?? 'guest'}`;
  const loadSearchMeta = useCallback(async (force = false) => {
    const cachedTrending = getCachedValue<string[]>(SEARCH_TRENDING_CACHE_KEY, 10 * 60 * 1000);
    const cachedRecents = getCachedValue<string[]>(recentCacheKey, 10 * 60 * 1000);
    if (!force) {
      if (cachedTrending) setTrending(cachedTrending);
      if (cachedRecents) setRecents(cachedRecents);
      if (cachedTrending && (!authToken || cachedRecents)) {
        setLoadingSearchMeta(false);
        return;
      }
    }

    setLoadingSearchMeta(true);
    try {
      const [nextTrending, nextRecents] = await Promise.all([
        listTrendingSearches({ limit: 8 }).catch(() => cachedTrending ?? []),
        authToken ? listRecentSearches(authToken).catch(() => cachedRecents ?? []) : Promise.resolve([]),
      ]);
      setTrending(nextTrending);
      setCachedValue(SEARCH_TRENDING_CACHE_KEY, nextTrending);
      setRecents(nextRecents);
      setCachedValue(recentCacheKey, nextRecents);
    } finally {
      setLoadingSearchMeta(false);
    }
  }, [authToken, getCachedValue, recentCacheKey, setCachedValue]);
  const clearRecents = useCallback(async () => {
    setRecents([]);
    setCachedValue(recentCacheKey, []);
    if (!authToken) return;
    try {
      await clearRecentSearches(authToken);
    } catch {
      loadSearchMeta(true).catch(() => undefined);
    }
  }, [authToken, loadSearchMeta, recentCacheKey, setCachedValue]);
  useEffect(() => {
    loadSearchMeta();
  }, [loadSearchMeta]);
  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setResults([]);
      setSearching(false);
      setSearchError(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    const t = setTimeout(async () => {
      try {
        const data = await listCustomerProperties({ search: term, limit: 20, sort: 'relevance' });
        const nextResults = data.map(toDisplayProperty).filter((property) => property.id);
        setResults(nextResults);
        if (authToken && term.length > 1) {
          recordRecentSearch(authToken, term, nextResults.length)
            .then((nextRecents) => {
              setRecents(nextRecents);
              setCachedValue(recentCacheKey, nextRecents);
            })
            .catch(() => undefined);
        }
      } catch {
        setSearchError('Could not search properties. Please try again.');
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [authToken, q, recentCacheKey, setCachedValue]);
  return (
    <Screen>
      <View className="px-4 pt-2 pb-3 flex-row items-center gap-2">
        <Pressable onPress={back} className="-ml-1 p-2 rounded-full">
          <Icon name="arrow-left" size={20} color="#0F172A" />
        </Pressable>
        <View className="flex-1">
          <Input icon="search" placeholder="Search city, area or property" value={q} onChangeText={setQ} />
        </View>
        {!!q && (
          <Pressable onPress={() => go('filters')} className="w-10 h-10 rounded-card bg-brand-50 items-center justify-center">
            <Icon name="sliders-horizontal" size={16} color="#1A6FFF" />
          </Pressable>
        )}
      </View>
      <View className="px-4">
        {!q && (
          <>
            <View className="mb-5">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-[13px] font-semibold text-ink-700">Recent searches</Text>
                {recents.length > 0 && <Pressable onPress={clearRecents}><Text className="text-[11px] text-ink-500">Clear</Text></Pressable>}
              </View>
              <View className="gap-1">
                {loadingSearchMeta && recents.length === 0 && <Text className="text-[12px] text-ink-500 py-2">Loading recent searches...</Text>}
                {!loadingSearchMeta && recents.length === 0 && <Text className="text-[12px] text-ink-500 py-2">Searches you make will appear here.</Text>}
                {recents.map((r, i) => (
                  <Pressable key={i} onPress={() => setQ(r)} className="flex-row items-center gap-3 p-3 rounded-card">
                    <Icon name="clock" size={14} color="#94A3B8" />
                    <Text className="flex-1 text-[14px]">{r}</Text>
                    <Icon name="arrow-up-left" size={14} color="#94A3B8" />
                  </Pressable>
                ))}
              </View>
            </View>
            <View className="mb-5">
              <Text className="text-[13px] font-semibold text-ink-700 mb-2">Trending in Chennai</Text>
              <View className="flex-row flex-wrap gap-2">
                {loadingSearchMeta && trending.length === 0 && <Text className="text-[12px] text-ink-500 py-2">Loading trending searches...</Text>}
                {trending.map((t) => <Chip key={t} icon="trending-up" onPress={() => setQ(t)}>{t}</Chip>)}
              </View>
            </View>
            <View>
              <Text className="text-[13px] font-semibold text-ink-700 mb-2">Browse by type</Text>
              <View className="flex-row flex-wrap" style={{ gap: browseTypeGrid.gap }}>
                {PROPERTY_TYPES.slice(0, 8).map((t) => (
                  <Pressable
                    key={t.id}
                    onPress={() => go('buyList', { type: t.id })}
                    style={{ width: browseTypeGrid.itemWidth }}
                    className="rounded-card border border-ink-200 items-center py-2.5 px-1"
                  >
                    <View
                      style={{ width: browseTypeGrid.iconBox, height: browseTypeGrid.iconBox }}
                      className="rounded-xl bg-brand-50 items-center justify-center mb-2"
                    >
                      <Icon name={t.icon} size={browseTypeGrid.iconSize} color="#1A6FFF" />
                    </View>
                    <Text
                      style={{ fontSize: browseTypeGrid.fontSize }}
                      className="font-medium text-center text-ink-700 leading-caption px-0.5"
                      numberOfLines={2}
                    >
                      {t.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </>
        )}
        {!!q && (
          <View className="mt-2 gap-2">
            <Text className="text-[11px] text-ink-500">{searching ? 'Searching...' : `${results.length} results for "${q}"`}</Text>
            {searchError && <ErrorCard message={searchError} />}
            {searching ? (
              <CompactLoadingBlock label="Searching properties..." />
            ) : results.length === 0 ? (
              <EmptyState icon="search-x" title="No results found" body="Try another location or property type." />
            ) : (
              results.map((p, idx) => (
                <FadeInView key={p.id} delay={idx * 45}>
                  <PropertyCard p={p} variant="compact" onPress={() => go('propertyDetail', { p })} />
                </FadeInView>
              ))
            )}
          </View>
        )}
      </View>
    </Screen>
  );
}

// ─── H-03 Featured List ──────────────────────────────────────
export function FeaturedListScreen() {
  const { go, back } = useNav();
  const { fav, getCachedValue, setCachedValue, loadFavoriteIds, toggleRemoteFavorite } = useAppState();
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [sort, setSort] = useState('newest');
  const [showSort, setShowSort] = useState(false);
  const [list, setList] = useState<DisplayProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const loadFeatured = useCallback(async (force = false) => {
    const cached = getCachedValue<DisplayProperty[]>(FEATURED_LIST_CACHE_KEY);
    if (cached && !force) {
      setList(cached);
      setLoading(false);
      setListError(null);
      loadFavoriteIds().catch(() => new Set<string>());
      return;
    }
    if (force) setRefreshing(true);
    else setLoading(true);
    setListError(null);
    try {
      const [properties] = await Promise.all([
        listCustomerProperties({ featured: true, limit: 50, sort: 'newest' }),
        loadFavoriteIds().catch(() => new Set<string>()),
      ]);
      const nextList = properties.map(toDisplayProperty).filter((property) => property.id);
      setList(nextList);
      setCachedValue(FEATURED_LIST_CACHE_KEY, nextList);
    } catch {
      setListError('Could not load featured properties.');
      setList([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getCachedValue, loadFavoriteIds, setCachedValue]);
  const sortedList = React.useMemo(() => {
    const l = [...list];
    if (sort === 'price-asc') l.sort((a, b) => a.price - b.price);
    if (sort === 'price-desc') l.sort((a, b) => b.price - a.price);
    return l;
  }, [list, sort]);
  const handleFavorite = useCallback(async (id: string) => {
    try {
      await toggleRemoteFavorite(id);
    } catch {
      setListError('Could not update saved property. Please try again.');
    }
  }, [toggleRemoteFavorite]);
  useEffect(() => {
    loadFeatured();
  }, [loadFeatured]);
  const sortLabels: Record<string, string> = { newest: 'Newest First', 'price-asc': 'Price: Low → High', 'price-desc': 'Price: High → Low' };
  return (
    <Screen refreshing={refreshing} onRefresh={() => loadFeatured(true)}>
      <TopBar
        onBack={back}
        title="Featured Properties"
        sub={`${list.length} hand-picked listings`}
        right={
          <View className="flex-row items-center gap-1.5">
            <Pressable onPress={() => go('filters')} className="w-8 h-8 rounded-full bg-ink-100 items-center justify-center">
              <Icon name="sliders-horizontal" size={14} color="#334155" />
            </Pressable>
            <Pressable onPress={() => setShowSort(true)} className="h-8 px-2 rounded-full bg-ink-100 flex-row items-center gap-1">
              <Icon name="arrow-up-down" size={11} color="#334155" />
              <Text className="text-[11px] font-medium text-ink-700">Sort</Text>
            </Pressable>
            <View className="flex-row bg-ink-100 rounded-full p-0.5">
              <Pressable onPress={() => setView('list')} className={`px-2 py-1 rounded-full ${view === 'list' ? 'bg-white' : ''}`}>
                <Icon name="list" size={14} color="#0F172A" />
              </Pressable>
              <Pressable onPress={() => setView('grid')} className={`px-2 py-1 rounded-full ${view === 'grid' ? 'bg-white' : ''}`}>
                <Icon name="grid-3x3" size={14} color="#0F172A" />
              </Pressable>
            </View>
          </View>
        }
      />
      <View className="px-4 pb-6">
        {listError && <View className="mb-3"><ErrorCard message={listError} onRetry={loadFeatured} /></View>}
        {loading ? (
          <LoadingBlock label="Loading featured properties..." />
        ) : sortedList.length === 0 ? (
          <EmptyState icon="search-x" title="No properties found" action="Retry" onPress={() => { setSort('newest'); loadFeatured(); }} />
        ) : view === 'list' ? (
          <View className="gap-3">
            {sortedList.map((p, idx) => (
              <FadeInView key={p.id} delay={idx * 35}>
                <PropertyCard p={p} fav={fav.has(p.id)} onFav={() => handleFavorite(p.id)} onPress={() => go('propertyDetail', { p })} />
              </FadeInView>
            ))}
          </View>
        ) : (
          <View className="flex-row flex-wrap gap-3">
            {sortedList.map((p, idx) => (
              <FadeInView key={p.id} delay={idx * 35} style={{ width: '47%' }} className="bg-white border border-ink-200 rounded-card overflow-hidden">
              <Pressable onPress={() => go('propertyDetail', { p })}>
                <PhotoPlaceholder tag={p.id} imageUri={p.images?.[0]} height={110}>
                  <View className="absolute top-2 left-2"><Badge color="brand">{formatPropertyTypeLabel(p.type)}</Badge></View>
                  <View className="absolute top-2 right-2"><Heart active={fav.has(p.id)} onPress={() => handleFavorite(p.id)} /></View>
                </PhotoPlaceholder>
                <View className="p-2.5">
                  <Text className="text-[12px] font-semibold" numberOfLines={1}>{p.title}</Text>
                  <Text className="text-[10px] text-ink-500" numberOfLines={1}>{p.location}</Text>
                  <Text className="text-[13px] font-bold text-brand-600 mt-1">{formatINR(p.price)}</Text>
                </View>
              </Pressable>
              </FadeInView>
            ))}
          </View>
        )}
      </View>
      {showSort && (
        <Sheet onClose={() => setShowSort(false)} title="Sort by">
          <View className="gap-2">
            {Object.entries(sortLabels).map(([k, v]) => (
              <Pressable
                key={k}
                onPress={() => { setSort(k); setShowSort(false); }}
                className={`flex-row items-center justify-between p-3 rounded-card border ${sort === k ? 'border-brand-600 bg-brand-50' : 'border-ink-200'}`}
              >
                <Text className="text-[14px] font-medium">{v}</Text>
                {sort === k && <Icon name="check" size={16} color="#1A6FFF" />}
              </Pressable>
            ))}
          </View>
        </Sheet>
      )}
    </Screen>
  );
}

// ─── H-04 Upcoming List ──────────────────────────────────────
function Countdown({ date }: { date?: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = Math.max(0, new Date(date || Date.now()).getTime() - now);
  const d = Math.floor(diff / 86400000), h = Math.floor((diff % 86400000) / 3600000),
    m = Math.floor((diff % 3600000) / 60000), s = Math.floor((diff % 60000) / 1000);
  return (
    <View className="flex-row gap-2 mt-2">
      {[[d, 'days'], [h, 'hrs'], [m, 'min'], [s, 'sec']].map(([v, l]) => (
        <View key={l as string} className="bg-ink-900 rounded-md px-2 py-1.5 items-center" style={{ minWidth: 44 }}>
          <Text className="text-white text-[15px] font-bold leading-display">{String(v).padStart(2, '0')}</Text>
          <Text className="text-white/70 text-[9px] mt-0.5">{l}</Text>
        </View>
      ))}
    </View>
  );
}

export function UpcomingListScreen() {
  const { go, back } = useNav();
  const { fav, getCachedValue, setCachedValue, loadFavoriteIds, toggleRemoteFavorite } = useAppState();
  const [list, setList] = useState<DisplayProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const { msg, fire } = useToast();
  const loadUpcoming = useCallback(async (force = false) => {
    const cached = getCachedValue<DisplayProperty[]>(UPCOMING_LIST_CACHE_KEY);
    if (cached && !force) {
      setList(cached);
      setLoading(false);
      setListError(null);
      loadFavoriteIds().catch(() => new Set<string>());
      return;
    }
    if (force) setRefreshing(true);
    else setLoading(true);
    setListError(null);
    try {
      const [properties] = await Promise.all([
        listCustomerProperties({ upcoming: true, limit: 50, sort: 'newest' }),
        loadFavoriteIds().catch(() => new Set<string>()),
      ]);
      const nextList = properties.map(toDisplayProperty).filter((property) => property.id);
      setList(nextList);
      setCachedValue(UPCOMING_LIST_CACHE_KEY, nextList);
    } catch {
      setListError('Could not load upcoming launches.');
      setList([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [getCachedValue, loadFavoriteIds, setCachedValue]);
  const handleFavorite = useCallback(async (id: string) => {
    try {
      await toggleRemoteFavorite(id);
    } catch {
      setListError('Could not update saved property. Please try again.');
    }
  }, [toggleRemoteFavorite]);
  useEffect(() => {
    loadUpcoming();
  }, [loadUpcoming]);
  return (
    <Screen refreshing={refreshing} onRefresh={() => loadUpcoming(true)}>
      <TopBar onBack={back} title="Upcoming launches" sub="Be first to book" />
      <View className="px-4">
        {listError && <ErrorCard message={listError} onRetry={loadUpcoming} />}
      </View>
      {loading ? (
        <LoadingBlock label="Loading upcoming launches..." />
      ) : list.length === 0 ? (
        <EmptyState icon="clock" title="No upcoming properties right now" body="Upcoming launch alerts will appear here." />
      ) : (
        <View className="px-4 gap-4">
          {list.map((p, idx) => (
            <FadeInView key={p.id} delay={idx * 45} className="rounded-card border border-ink-200 overflow-hidden bg-white">
              <Pressable onPress={() => go('propertyDetail', { p })}>
                <PhotoPlaceholder tag={p.id} imageUri={p.images?.[0]} height={150}>
                  <View className="absolute top-3 left-3"><Badge color="amber">Coming soon</Badge></View>
                  <View className="absolute top-3 right-3"><Heart active={fav.has(p.id)} onPress={() => handleFavorite(p.id)} /></View>
                </PhotoPlaceholder>
              </Pressable>
              <View className="p-3">
                <View className="flex-row items-start justify-between gap-2">
                  <Text className="font-semibold text-[15px] flex-1">{p.title}</Text>
                  <Text className="text-brand-600 font-bold text-[14px]">{formatINR(p.price)}</Text>
                </View>
                <View className="flex-row items-center gap-1 mt-0.5">
                  <Icon name="map-pin" size={12} color="#64748B" />
                  <Text className="text-[12px] text-ink-500">{p.location}, {p.city}</Text>
                </View>
                <Countdown date={p.launchDate} />
                <View className="mt-3 flex-row items-center gap-3 p-2.5 rounded-md bg-ink-50">
                  <View className="w-9 h-9 rounded-full bg-white items-center justify-center">
                    <Icon name="bell" size={14} color="#1A6FFF" />
                  </View>
                  <View className="flex-1">
                    <Text className="text-[12px] font-bold">Launch alerts</Text>
                    <Text className="text-ink-500 text-[10.5px]">Save the property to follow this launch</Text>
                  </View>
                  <Pressable onPress={() => fire('Save this property to follow launch updates.')} className="px-3 py-1.5 rounded-full bg-white border border-ink-200">
                    <Text className="text-[10.5px] font-semibold text-ink-600">Info</Text>
                  </Pressable>
                </View>
              </View>
            </FadeInView>
          ))}
        </View>
      )}
      <Toast message={msg} />
    </Screen>
  );
}

// ─── H-05 Help & Support ─────────────────────────────────────
export function HelpScreen() {
  const { go, back } = useNav();
  const { authToken, currentUser } = useAppState();
  const [open, setOpen] = useState<number | null>(null);
  const { items: faqs, loading: loadingFaqs, error: faqError, reload: reloadFaqs } = useContentSection('faq', fallbackFaqContent);
  const [callbackModal, setCallbackModal] = useState(false);
  const [cbTime, setCbTime] = useState<'morning' | 'afternoon' | 'evening' | ''>('');
  const [feedback, setFeedback] = useState('');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [supportError, setSupportError] = useState<string | null>(null);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [submittingCallback, setSubmittingCallback] = useState(false);
  const { msg, fire } = useToast();
  const loadTickets = useCallback(async () => {
    if (!authToken) {
      setTickets([]);
      setLoadingTickets(false);
      return;
    }
    setLoadingTickets(true);
    setSupportError(null);
    try {
      const data = await listSupportTickets(authToken, { limit: 3, sort: 'newest' });
      setTickets(data);
    } catch {
      setSupportError('Could not load your recent support tickets.');
    } finally {
      setLoadingTickets(false);
    }
  }, [authToken]);
  const preferredTimeFor = (slot: 'morning' | 'afternoon' | 'evening') => {
    const next = new Date(Date.now() + 24 * 60 * 60 * 1000);
    next.setHours(slot === 'morning' ? 10 : slot === 'afternoon' ? 14 : 18, 0, 0, 0);
    return next.toISOString();
  };
  const handleCallback = async () => {
    if (!authToken || !cbTime || submittingCallback) return;
    setSubmittingCallback(true);
    setSupportError(null);
    try {
      const callback = await createCallbackRequest(authToken, {
        source: 'help_support',
        sourceScreen: 'help',
        category: 'general',
        bestTimePreference: cbTime,
        preferredTime: preferredTimeFor(cbTime),
      });
      setCallbackModal(false);
      setCbTime('');
      fire(`Callback requested${callback.referenceId ? `: ${callback.referenceId}` : ''}.`);
    } catch {
      setSupportError('Could not request a callback. Please try again.');
    } finally {
      setSubmittingCallback(false);
    }
  };
  const handleFeedback = async () => {
    const message = feedback.trim();
    if (!authToken || !message || submittingFeedback) return;
    setSubmittingFeedback(true);
    setSupportError(null);
    try {
      const savedFeedback = await createAppFeedback(authToken, {
        message,
        source: 'customer_app',
        sourceScreen: 'help',
      });
      setFeedback('');
      fire(`Feedback submitted${savedFeedback.referenceId ? `: ${savedFeedback.referenceId}` : ''}.`);
    } catch {
      setSupportError('Could not submit feedback. Please try again.');
    } finally {
      setSubmittingFeedback(false);
    }
  };
  const handleEmailSupport = async () => {
    try {
      await Linking.openURL('mailto:support@builtglory.com');
    } catch {
      fire('No email app found. Please email support@builtglory.com.');
    }
  };
  useEffect(() => {
    loadTickets();
  }, [loadTickets]);
  return (
    <Screen>
      <TopBar onBack={back} title="Need help?" sub="We're here, 24×7" />
      <View className="px-4">
        {supportError && <View className="mb-4"><ErrorCard message={supportError} onRetry={loadTickets} /></View>}
        {!authToken && (
          <View className="mb-4">
            <ErrorCard message="Please sign in again to create callbacks or support tickets." />
          </View>
        )}
        <View className="flex-row gap-2 mb-6 flex-wrap">
          <Pressable
            onPress={() => {
              go('supportTickets');
            }}
            className="flex-1 min-w-[30%] p-3 rounded-card border border-ink-200 items-center"
          >
            <View className="w-10 h-10 rounded-full bg-brand-50 items-center justify-center mb-2"><Icon name="message-circle" size={18} color="#1A6FFF" /></View>
            <Text className="text-[12.5px] font-semibold">Support ticket</Text>
            <Text className="text-[10px] text-ink-500">Tracked</Text>
          </Pressable>
          <Pressable onPress={() => setCallbackModal(true)} className="flex-1 min-w-[30%] p-3 rounded-card border border-ink-200 items-center">
            <View className="w-10 h-10 rounded-full bg-brand-50 items-center justify-center mb-2"><Icon name="phone-call" size={18} color="#1A6FFF" /></View>
            <Text className="text-[12.5px] font-semibold">Callback</Text>
            <Text className="text-[10px] text-ink-500">Free</Text>
          </Pressable>
          <Pressable onPress={() => void openCompanyCall()} className="flex-1 min-w-[30%] p-3 rounded-card border border-ink-200 items-center">
            <View className="w-10 h-10 rounded-full bg-brand-50 items-center justify-center mb-2"><Icon name="phone" size={18} color="#1A6FFF" /></View>
            <Text className="text-[12.5px] font-semibold">Call</Text>
            <Text className="text-[10px] text-ink-500">Now</Text>
          </Pressable>
          <Pressable onPress={() => void openCompanyWhatsApp()} className="flex-1 min-w-[30%] p-3 rounded-card border border-emerald-200 bg-emerald-50 items-center">
            <View className="w-10 h-10 rounded-full bg-emerald-100 items-center justify-center mb-2"><Icon name="message-circle" size={18} color="#059669" /></View>
            <Text className="text-[12.5px] font-semibold text-emerald-800">WhatsApp</Text>
            <Text className="text-[10px] text-emerald-700">Chat</Text>
          </Pressable>
          <Pressable onPress={handleEmailSupport} className="flex-1 min-w-[30%] p-3 rounded-card border border-ink-200 items-center">
            <View className="w-10 h-10 rounded-full bg-brand-50 items-center justify-center mb-2"><Icon name="mail" size={18} color="#1A6FFF" /></View>
            <Text className="text-[12.5px] font-semibold">Email</Text>
            <Text className="text-[10px] text-ink-500">24 hrs</Text>
          </Pressable>
        </View>
        <Text className="text-[14px] font-semibold mb-2">Frequently asked</Text>
        {loadingFaqs && <Text className="mb-2 text-[12px] text-ink-500">Loading help content...</Text>}
        {!!faqError && (
          <Pressable onPress={reloadFaqs} className="mb-2 p-3 rounded-card border border-amber-200 bg-amber-50">
            <Text className="text-[12px] text-amber-800">Using saved help copy. Tap to retry CMS content.</Text>
          </Pressable>
        )}
        <View className="border border-ink-200 rounded-card overflow-hidden mb-6">
          {faqs.slice(0, 5).map((f, i) => (
            <View key={i} className={i ? 'border-t border-ink-200' : ''}>
              <Pressable onPress={() => setOpen(open === i ? null : i)} className="flex-row items-center justify-between gap-2 p-3.5">
                <Text className="text-[13px] font-medium flex-1">{f.title}</Text>
                <Icon name={open === i ? 'chevron-up' : 'chevron-down'} size={16} color="#64748B" />
              </Pressable>
              {open === i && <Text className="px-3.5 pb-3.5 text-[12.5px] text-ink-500 leading-relaxed">{f.body}</Text>}
            </View>
          ))}
        </View>
        <Text className="text-[14px] font-semibold mb-2">Send us feedback</Text>
        <Input multiline placeholder="Tell us what's on your mind…" value={feedback} onChangeText={setFeedback} />
        <Btn className="w-full mt-3" disabled={!authToken || !feedback.trim() || submittingFeedback} onPress={handleFeedback}>
          {submittingFeedback ? 'Submitting...' : 'Submit feedback'}
        </Btn>
        <Text className="text-[14px] font-semibold mt-6 mb-2">Recent tickets</Text>
        {loadingTickets ? (
          <LoadingBlock label="Loading support tickets..." />
        ) : tickets.length === 0 ? (
          <View className="p-4 rounded-card border border-ink-200 items-center">
            <Text className="text-[13px] font-semibold text-ink-700">No support tickets yet</Text>
            <Text className="text-[11px] text-ink-500 mt-1">Tracked support issues will appear here.</Text>
          </View>
        ) : (
          <View className="gap-2">
            {tickets.map((ticket) => (
              <Pressable key={ticket._id ?? ticket.referenceId} onPress={() => go('supportTicketChat', { ticketId: ticketIdOf(ticket) })} className="p-3 rounded-card border border-ink-200">
                <View className="flex-row items-center justify-between gap-2">
                  <Text className="text-[13px] font-semibold flex-1" numberOfLines={1}>{ticket.subject ?? 'Support ticket'}</Text>
                  <Badge color={ticket.status === 'resolved' ? 'green' : 'brand'}>{ticket.status ?? 'open'}</Badge>
                </View>
                <Text className="text-[11px] text-ink-500 mt-1">{ticket.referenceId ?? 'Ticket pending reference'}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
      {callbackModal && (
        <Sheet onClose={() => setCallbackModal(false)} title="Request a Callback">
          <View className="gap-3">
            <View className="p-3 rounded-card bg-ink-50 border border-ink-200">
              <Text className="text-[12px] text-ink-500">We will call your verified profile number.</Text>
              <Text className="text-[13px] font-semibold text-ink-900 mt-1">
                {typeof currentUser?.phone === 'string' ? currentUser.phone : typeof currentUser?.mobileNumber === 'string' ? currentUser.mobileNumber : 'Verified customer phone'}
              </Text>
            </View>
            <Field label="Preferred Time">
              <View className="flex-row gap-2 flex-wrap">
                {[
                  ['morning', 'Morning 9-12'],
                  ['afternoon', 'Afternoon 12-4'],
                  ['evening', 'Evening 4-7'],
                ].map(([id, label]) => (
                  <Chip key={id} active={cbTime === id} onPress={() => setCbTime(id as 'morning' | 'afternoon' | 'evening')}>{label}</Chip>
                ))}
              </View>
            </Field>
            <Btn className="w-full" disabled={!authToken || !cbTime || submittingCallback} onPress={handleCallback}>
              {submittingCallback ? 'Requesting...' : 'Confirm Callback'}
            </Btn>
          </View>
        </Sheet>
      )}
      <Toast message={msg} />
    </Screen>
  );
}

type TicketCategory = CreateSupportTicketInput['category'];

const ticketCategories: { id: TicketCategory; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'technical', label: 'Technical' },
  { id: 'payment', label: 'Payment' },
  { id: 'property_inquiry', label: 'Property' },
  { id: 'complaint', label: 'Complaint' },
];

function ticketIdOf(ticket: SupportTicket) {
  return String(ticket._id ?? ticket.id ?? '');
}

function ticketDate(value?: string) {
  if (!value) return 'Just now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Just now';
  return date.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ─── H-06 Support Tickets ──────────────────────────────────────
export function SupportTicketsScreen() {
  const { back, go } = useNav();
  const { authToken } = useAppState();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [category, setCategory] = useState<TicketCategory>('general');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { msg, fire } = useToast();

  const loadTickets = useCallback(async () => {
    if (!authToken) {
      setTickets([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await listSupportTickets(authToken, { limit: 20, sort: 'newest' });
      setTickets(data);
    } catch {
      setError('Could not load support ticket history.');
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const submitTicket = async () => {
    if (!authToken || saving || !subject.trim() || !message.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const ticket = await createSupportTicket(authToken, {
        category,
        subject: subject.trim(),
        message: message.trim(),
        priority: category === 'complaint' ? 'high' : 'medium',
      });
      setSubject('');
      setMessage('');
      setTickets((current) => [ticket, ...current]);
      fire(`Ticket created${ticket.referenceId ? `: ${ticket.referenceId}` : ''}.`);
      go('supportTicketChat', { ticketId: ticketIdOf(ticket) });
    } catch {
      setError('Could not create support ticket. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <TopBar onBack={back} title="Support tickets" sub="Create tickets and view ticket history" />
      <View className="px-4 gap-4">
        {error && <ErrorCard message={error} onRetry={loadTickets} />}
        {!authToken && <ErrorCard message="Please sign in again to use support tickets." />}

        <View className="rounded-card border border-ink-200 p-4">
          <Text className="text-[14px] font-semibold mb-3">Create a new ticket</Text>
          <View className="gap-3">
            <Field label="Category">
              <View className="flex-row flex-wrap gap-2">
                {ticketCategories.map((item) => (
                  <Chip key={item.id} active={category === item.id} onPress={() => setCategory(item.id)}>{item.label}</Chip>
                ))}
              </View>
            </Field>
            <Field label="Subject">
              <Input placeholder="Short title for your issue" value={subject} onChangeText={setSubject} />
            </Field>
            <Field label="Message">
              <Input multiline placeholder="Explain what happened..." value={message} onChangeText={setMessage} />
            </Field>
            <Btn disabled={!authToken || !subject.trim() || !message.trim() || saving} onPress={submitTicket}>
              {saving ? 'Creating...' : 'Create support ticket'}
            </Btn>
          </View>
        </View>

        <Text className="text-[14px] font-semibold">Ticket history</Text>
        {loading ? (
          <LoadingBlock label="Loading ticket history..." />
        ) : tickets.length === 0 ? (
          <View className="p-4 rounded-card border border-ink-200 items-center">
            <Text className="text-[13px] font-semibold text-ink-700">No tickets yet</Text>
            <Text className="text-[11px] text-ink-500 mt-1">Create a ticket above to start a support chat.</Text>
          </View>
        ) : (
          <View className="gap-2">
            {tickets.map((ticket) => {
              const id = ticketIdOf(ticket);
              return (
                <Pressable key={id || ticket.referenceId} onPress={() => go('supportTicketChat', { ticketId: id })} className="p-3 rounded-card border border-ink-200 bg-white">
                  <View className="flex-row items-center justify-between gap-2">
                    <Text className="text-[13px] font-semibold flex-1" numberOfLines={1}>{ticket.subject ?? 'Support ticket'}</Text>
                    <Badge color={ticket.status === 'resolved' ? 'green' : 'brand'}>{ticket.status ?? 'open'}</Badge>
                  </View>
                  <Text className="text-[11px] text-ink-500 mt-1">{ticket.referenceId ?? 'Reference pending'}</Text>
                  <Text className="text-[11px] text-ink-500 mt-1">{ticketDate(ticket.createdAt)}</Text>
                  <Text className="text-[11px] font-semibold text-brand-600 mt-2">View chat</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
      <Toast message={msg} />
    </Screen>
  );
}

export function SupportTicketChatScreen() {
  const { back, ctx } = useNav<{ ticketId?: string }>();
  const { authToken } = useAppState();
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardBottomInset, setKeyboardBottomInset] = useState(0);
  const composerKeyboardGap = Platform.OS === 'android' && keyboardVisible ? 12 : 0;
  const ticketId = ctx.ticketId ?? '';
  const socketRef = useRef<ChatSocket | null>(null);
  const messagesScrollRef = useRef<ScrollView | null>(null);
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(true);
  const [replying, setReplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { msg, fire } = useToast();

  const loadTicket = useCallback(async () => {
    if (!authToken || !ticketId) {
      setTicket(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setTicket(await getSupportTicket(authToken, ticketId));
    } catch {
      setError('Could not load ticket conversation.');
    } finally {
      setLoading(false);
    }
  }, [authToken, ticketId]);

  useEffect(() => {
    loadTicket();
  }, [loadTicket]);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardVisible(true);
      setKeyboardBottomInset(Platform.OS === 'android' ? event.endCoordinates.height : 0);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false);
      setKeyboardBottomInset(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!authToken || !ticketId) return;
    const socket = createChatSocket(authToken);
    socketRef.current = socket;

    socket.on('support:ticket_updated', ({ ticket: updatedTicket }) => {
      setTicket(updatedTicket);
    });
    socket.on('connect', () => {
      socket.emit('support:join', { ticketId }, (payload) => {
        if (payload.ok) {
          setTicket(payload.ticket);
          setError(null);
        } else if (payload.error) {
          setError(payload.error);
        }
      });
    });
    socket.on('connect_error', () => {
      setError('Realtime chat is reconnecting. Messages will still send normally.');
    });

    return () => {
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [authToken, ticketId]);

  const submitReply = async () => {
    const text = reply.trim();
    if (!authToken || !ticketId || !text || replying) return;
    setReplying(true);
    setError(null);
    const socket = socketRef.current;
    if (socket?.connected) {
      socket.emit('support:send', { ticketId, message: text }, (payload) => {
        setReplying(false);
        if (payload.ok) {
          setReply('');
          setTicket(payload.ticket);
          fire('Reply sent.');
        } else {
          setError(payload.error ?? 'Could not send reply. Please try again.');
        }
      });
      return;
    }
    try {
      const updatedTicket = await addSupportTicketResponse(authToken, ticketId, text);
      setReply('');
      setTicket(updatedTicket);
      fire('Reply sent.');
    } catch {
      setError('Could not send reply. Please try again.');
    } finally {
      setReplying(false);
    }
  };

  const thread = ticket
    ? [
        {
          id: 'original',
          message: ticket.message ?? '',
          responderType: 'customer',
          createdAt: ticket.createdAt,
        },
        ...(ticket.responses ?? []),
      ].filter((item) => item.message)
    : [];
  const ticketClosed = ticket?.status === 'closed';

  useEffect(() => {
    if (!ticket) return;
    const frame = requestAnimationFrame(() => {
      messagesScrollRef.current?.scrollToEnd({ animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [ticket?.id, ticket?._id, thread.length]);

  return (
    <Screen fill>
      <View className="px-4 pt-2 pb-3 flex-row items-center gap-3 border-b border-ink-200 bg-white">
        <Pressable onPress={back} className="-ml-1 p-2 rounded-full">
          <Icon name="arrow-left" size={20} color="#0F172A" />
        </Pressable>
        <View className="w-10 h-10 rounded-full bg-brand-100 items-center justify-center">
          <Icon name="headphones" size={16} color="#1A6FFF" />
        </View>
        <View className="flex-1 min-w-0">
          <Text className="text-[14px] font-semibold text-ink-900" numberOfLines={1}>{ticket?.subject ?? 'Support chat'}</Text>
          <Text className="text-[10.5px] text-ink-500">{ticket?.referenceId ?? 'Ticket conversation'}</Text>
        </View>
        {ticket && <Badge color={ticketClosed ? 'ink' : 'brand'}>{ticket.status ?? 'open'}</Badge>}
      </View>

      <KeyboardAvoidingView
        className="flex-1 bg-ink-50"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <View className="px-4 pt-3 gap-2">
          {error && <ErrorCard message={error} onRetry={loadTicket} />}
          {!authToken && <ErrorCard message="Please sign in again to view this ticket." />}
          {!ticketId && <ErrorCard message="Ticket details are unavailable. Please open a ticket from history." />}
        </View>
        {loading ? (
          <View className="flex-1 items-center justify-center px-6">
            <LoadingBlock label="Loading ticket conversation..." />
          </View>
        ) : ticket ? (
          <>
            <ScrollView
              ref={messagesScrollRef}
              className="flex-1 px-3"
              contentContainerStyle={{ paddingTop: 12, paddingBottom: 14, gap: 8 }}
              showsVerticalScrollIndicator={false}
              onLayout={() => messagesScrollRef.current?.scrollToEnd({ animated: false })}
              onContentSizeChange={() => messagesScrollRef.current?.scrollToEnd({ animated: false })}
            >
              <View className="self-center px-3 py-1 rounded-full bg-white/90 border border-ink-200">
                <Text className="text-[10.5px] text-ink-500">{ticketDate(ticket.createdAt) || 'Today'}</Text>
              </View>
              {thread.map((item, index) => {
                const mine = item.responderType !== 'admin';
                return (
                  <View key={item.id ?? item._id ?? `${item.responderType}-${index}`} className={`flex-row ${mine ? 'justify-end' : 'justify-start'}`}>
                    <View className={`max-w-[82%] px-3 py-2 shadow-sm ${mine ? 'bg-brand-600 rounded-t-2xl rounded-bl-2xl rounded-br-md' : 'bg-white border border-ink-200 rounded-t-2xl rounded-br-2xl rounded-bl-md'}`}>
                      <Text className={`text-[13px] leading-5 ${mine ? 'text-white' : 'text-ink-900'}`}>{item.message}</Text>
                      <View className={`mt-1 flex-row items-center gap-1 ${mine ? 'self-end' : 'self-start'}`}>
                        <Text className={`text-[9.5px] ${mine ? 'text-white/70' : 'text-ink-400'}`}>{ticketDate(item.createdAt)}</Text>
                        {mine && <Icon name="check-check" size={11} color="rgba(255,255,255,0.72)" />}
                      </View>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
            <View
              className="px-3 pt-2 border-t border-ink-200 bg-white"
              style={{
                marginBottom: keyboardBottomInset + composerKeyboardGap,
                paddingBottom: keyboardVisible ? 6 : Math.max(insets.bottom, 12),
              }}
            >
              {ticketClosed && <Text className="text-center text-[11px] text-ink-500 mb-2">This ticket is closed.</Text>}
              <View className="flex-row items-end gap-2">
                <View className="flex-1 min-h-11 max-h-28 px-4 py-2 rounded-3xl bg-ink-100 justify-center">
                  <TextInput
                    value={reply}
                    onChangeText={setReply}
                    placeholder={ticketClosed ? 'Ticket closed' : 'Message support...'}
                    placeholderTextColor="#94A3B8"
                    editable={!ticketClosed && !replying}
                    multiline
                    className="text-[14px] text-ink-900"
                    style={{ minHeight: 24, maxHeight: 88, textAlignVertical: 'top', ...androidInputStyle(14) }}
                  />
                </View>
                <Pressable
                  onPress={submitReply}
                  disabled={!reply.trim() || replying || ticketClosed}
                  className={`w-11 h-11 rounded-full items-center justify-center ${reply.trim() && !replying && !ticketClosed ? 'bg-brand-600' : 'bg-ink-200'}`}
                >
                  {replying ? <Spinner color="#64748B" size={16} /> : <Icon name="send" size={16} color="white" />}
                </Pressable>
              </View>
            </View>
          </>
        ) : (
          <View className="m-4 p-4 rounded-card border border-ink-200 bg-white items-center">
            <Text className="text-[13px] font-semibold text-ink-700">Ticket not found</Text>
            <Text className="text-[11px] text-ink-500 mt-1">Please open the ticket again from history.</Text>
          </View>
        )}
      </KeyboardAvoidingView>
      <Toast message={msg} />
    </Screen>
  );
}

// ─── H-06 Coach Marks ─────────────────────────────────────────
export function CoachMarksScreen({
  targets,
  onDone,
}: {
  targets: Partial<Record<TourStepId, TourTarget>>;
  onDone: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const steps = [
    {
      id: 'search' as const,
      icon: 'search',
      title: 'Search anything',
      body: 'Find properties by city, area, builder, or property type.',
      fallback: { top: insets.top + 58, left: 16, width: width - 32, height: 48 },
    },
    {
      id: 'actions' as const,
      icon: 'home',
      title: 'Buy or sell fast',
      body: 'Use the Buy and Sell cards to start the right journey in seconds.',
      fallback: { top: insets.top + 120, left: 16, width: width - 32, height: 100 },
    },
    {
      id: 'favorite' as const,
      icon: 'heart',
      title: 'Save favourites',
      body: 'Tap the heart on listings you like and revisit them from Saved Properties.',
      fallback: { top: insets.top + 370, left: Math.min(width - 64, 220), width: 40, height: 40 },
    },
    {
      id: 'nav' as const,
      icon: 'navigation',
      title: 'Use quick navigation',
      body: 'Switch between Home, Buy, Sell, and Profile from the bottom navigation.',
      fallback: { top: height - insets.bottom - 64, left: 0, width, height: 64 + insets.bottom },
    },
  ];
  const [i, setI] = useState(0);
  const step = steps[i];
  const target = targets[step.id] || step.fallback;
  const highlight = {
    top: Math.max(insets.top + 6, target.top - 5),
    left: Math.max(8, target.left - 5),
    width: Math.min(width - Math.max(8, target.left - 5) - 8, target.width + 10),
    height: target.height + 10,
  };
  const cardBelow = highlight.top + highlight.height + 16;
  const cardTop = cardBelow < height - 300
    ? cardBelow
    : Math.max(insets.top + 12, highlight.top - 286);
  const labelTop = highlight.top > insets.top + 38 ? -32 : 8;
  const highlightRadius = Math.min(22, highlight.width / 2, highlight.height / 2);
  const highlightRight = highlight.left + highlight.width;
  const highlightBottom = highlight.top + highlight.height;
  const overlayPath = [
    `M0 0H${width}V${height}H0Z`,
    `M${highlight.left + highlightRadius} ${highlight.top}`,
    `H${highlightRight - highlightRadius}`,
    `A${highlightRadius} ${highlightRadius} 0 0 1 ${highlightRight} ${highlight.top + highlightRadius}`,
    `V${highlightBottom - highlightRadius}`,
    `A${highlightRadius} ${highlightRadius} 0 0 1 ${highlightRight - highlightRadius} ${highlightBottom}`,
    `H${highlight.left + highlightRadius}`,
    `A${highlightRadius} ${highlightRadius} 0 0 1 ${highlight.left} ${highlightBottom - highlightRadius}`,
    `V${highlight.top + highlightRadius}`,
    `A${highlightRadius} ${highlightRadius} 0 0 1 ${highlight.left + highlightRadius} ${highlight.top}`,
    'Z',
  ].join(' ');
  return (
    <View
      className="absolute inset-0"
      style={{ zIndex: 50, elevation: 50 }}
    >
        <Svg
          pointerEvents="none"
          width={width}
          height={height}
          style={{ position: 'absolute', top: 0, left: 0 }}
        >
          <Path d={overlayPath} fill="rgba(0, 0, 0, 0.5)" fillRule="evenodd" />
        </Svg>
        <Pressable className="absolute inset-0" onPress={onDone} />

        <View
          pointerEvents="none"
          className="absolute rounded-[22px] border-2 border-white bg-white/10"
          style={highlight}
        >
          <View className="absolute left-0 px-2.5 py-1 rounded-full bg-white" style={{ top: labelTop }}>
            <Text className="text-[11px] font-bold text-brand-600">Look here</Text>
          </View>
        </View>

        <View
          className="absolute left-5 right-5 bg-white rounded-[28px] p-5 border border-white/40"
          style={{ top: cardTop }}
        >
          <View className="flex-row items-center justify-between mb-4">
            <View>
              <Text className="text-[11px] font-bold text-brand-600 uppercase tracking-wider">Customer guide</Text>
              <Text className="text-[18px] font-bold text-ink-900 mt-0.5">How Builtglory works</Text>
            </View>
            <View className="px-2.5 py-1 bg-brand-600 rounded-full">
              <Text className="text-white text-[10px] font-bold">{i + 1}/{steps.length}</Text>
            </View>
          </View>

          <View className="w-14 h-14 rounded-2xl bg-brand-50 items-center justify-center mb-4">
            <Icon name={step.icon} size={24} color="#1A6FFF" />
          </View>

          <Text className="text-[17px] font-bold text-ink-900 mb-1.5">{step.title}</Text>
          <Text className="text-[13px] text-ink-500 leading-relaxed">{step.body}</Text>

          <View className="mt-5 flex-row items-center gap-2">
            {steps.map((_, idx) => (
              <View key={idx} className={`h-1.5 rounded-full ${idx === i ? 'w-7 bg-brand-600' : 'w-2 bg-ink-200'}`} />
            ))}
          </View>

          <View className="mt-5 flex-row items-center gap-2">
            <Pressable onPress={onDone} className="h-10 px-3 rounded-card items-center justify-center">
              <Text className="text-ink-500 text-[13px] font-medium">Skip</Text>
            </Pressable>
            <View className="flex-1" />
            {i > 0 && (
              <Btn variant="outline" size="sm" onPress={() => setI(i - 1)} icon="arrow-left">
                Back
              </Btn>
            )}
            <Btn size="sm" onPress={() => (i < steps.length - 1 ? setI(i + 1) : onDone())} iconRight={i < steps.length - 1 ? 'arrow-right' : 'check'}>
              {i < steps.length - 1 ? 'Next' : 'Got it'}
            </Btn>
          </View>
        </View>
    </View>
  );
}
