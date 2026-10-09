import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, View, Text, Pressable, ScrollView, Linking, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import { PropertyEmbedViewer } from '../components/PropertyEmbedViewer';
import { PropertyImageViewer } from '../components/PropertyImageViewer';
import {
  aerialDroneUrl,
  hasAerialContent,
  hasVirtualTour,
  isImageMediaUrl,
  propertyFloorPlans,
  virtualTourUrl,
} from '../utils/propertyMedia';
import {
  Screen, TopBar, Field, Input, Chip, Badge, PropertyCard, PhotoPlaceholder,
  Toast, useToast, Btn, Spinner, SuccessBurst, FadeInView, EmptyState, SkeletonCard, PageBody, Sheet,
} from '../components/shared';
import { PROPERTY_TYPES, SPECS, formatINR, formatPropertyTypeLabel, Property } from '../data/data';
import { useAppState } from '../state/AppState';
import { useFlowCompletionBack, useNav } from '../navigation/useNav';
import { useBuyEnquiryResource, propertyIdFromEnquiry } from '../hooks/useBuyEnquiryResource';
import { contentMetaArray, useContentItem } from '../content';
import { gridItemWidth, useLayout } from '../layout/breakpoints';
import {
  advisorInitials,
  DEFAULT_PROPERTY_ADVISOR,
  openCompanyCall,
} from '../config/companyContact';
import { BUY_TYPE_COUNTS_CACHE_KEY, FAVORITES_LIST_CACHE_PREFIX, TYPE_TO_BACKEND, buildBuyTypeCounts, propertyMediaImages, toBackendType } from '../state/primaryTabCache';
import {
  BuyEnquiry,
  createBuyEnquiry,
  createTokenPayment,
  createVisit,
  CustomerProperty,
  CustomerVisit,
  getBuyEnquiry,
  getCustomerProperty,
  getFavoriteProperties,
  getVisitAvailability,
  listCustomerProperties,
  rescheduleVisit,
  VisitAvailability,
  VisitAvailabilitySlot,
} from '../api/customer';
import { isNetworkError, resourceErrorMessage } from '../utils/apiErrors';
import { requestLocationPermission } from '../utils/location';
import { propertyShareUrl, sharePropertyNative } from '../config/appLinks';
import { propertyAmenityLabels, propertyHighlightLabels, propertySpecRows } from '../utils/propertySpecs';

const FLOOR_PLAN_ACCENTS = ['#34D399', '#FBBF24', '#F472B6', '#60A5FA', '#A78BFA'];

type DisplayProperty = Property & { backend?: CustomerProperty };
type PropertyTypeVisibilityConfig = {
  id: string;
  slug: string;
  icon: string;
  typeName: string;
  displayName: string;
  order: number;
  showOnBuy: boolean;
  showOnSell: boolean;
};

const fallbackPropertyTypeVisibilityContent = {
  slug: 'property-type-visibility-config',
  section: 'general' as const,
  title: 'Property Type Visibility',
  metadata: { propertyTypes: [] },
};

const EMPTY_PROPERTY: DisplayProperty = {
  id: '',
  title: 'Property details unavailable',
  price: 0,
  type: 'property',
  bhk: 0,
  area: 0,
  floor: '—',
  flatNo: '—',
  location: 'Location pending',
  city: '',
  images: [],
  amenities: [],
  verified: false,
  negotiable: false,
  views: 0,
  enquiries: 0,
  posted: '',
  rating: 0,
  sqftPrice: 0,
  builder: 'BuiltGlory',
  desc: 'Property details are not available yet. Please return to the listing and try again.',
  badge: 'Unavailable',
};

function toNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function propertyIdOf(property?: CustomerProperty | DisplayProperty | Property | null) {
  const backend = (property as DisplayProperty | undefined)?.backend;
  return String(backend?._id ?? backend?.id ?? (property as CustomerProperty | undefined)?._id ?? (property as CustomerProperty | undefined)?.id ?? (property as Property | undefined)?.id ?? '');
}

function propertyCoordinates(property?: DisplayProperty | CustomerProperty | null) {
  const backend = (property as DisplayProperty | undefined)?.backend ?? (property as CustomerProperty | undefined);
  const latitude = toNumber(backend?.address?.latitude ?? backend?.latitude, NaN);
  const longitude = toNumber(backend?.address?.longitude ?? backend?.longitude, NaN);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

function useGoogleMapUserLocation() {
  useEffect(() => {
    requestLocationPermission().catch(() => undefined);
  }, []);
}

function hasText(value?: string | null) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasAnyValue(values: unknown[]) {
  return values.some((value) => {
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'string') return value.trim().length > 0;
    if (typeof value === 'number') return Number.isFinite(value);
    if (typeof value === 'boolean') return value;
    return value != null;
  });
}

function openExternalUrl(url?: string | null) {
  if (!url) return Promise.reject(new Error('Missing URL'));
  return Linking.openURL(url);
}

function openDirections(coordinates: { latitude: number; longitude: number }, label?: string) {
  const { latitude, longitude } = coordinates;
  const destination = `${latitude},${longitude}`;
  const encodedLabel = encodeURIComponent(label || 'Property');
  const googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${destination}&destination_place_id=&travelmode=driving`;
  const appleUrl = `http://maps.apple.com/?daddr=${destination}&q=${encodedLabel}`;
  return Linking.openURL(Platform.OS === 'ios' ? appleUrl : googleUrl);
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function displayDate(date: Date, options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
  return date.toLocaleDateString('en-IN', options);
}

function nextDateOptions(count: number, startOffsetDays = 1) {
  return Array.from({ length: count }).map((_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + startOffsetDays + index);
    return {
      iso: toIsoDate(date),
      label: displayDate(date, { day: 'numeric', month: 'short' }),
      fullLabel: displayDate(date),
      weekday: date.toLocaleDateString('en-IN', { weekday: 'short' }),
    };
  });
}

function useVisitAvailability({
  authToken,
  propertyId,
  visitType,
  from,
  days,
}: {
  authToken?: string | null;
  propertyId?: string;
  visitType: 'physical' | 'virtual';
  from?: string;
  days: number;
}) {
  const [availability, setAvailability] = useState<VisitAvailability | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!authToken || !propertyId || !from) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getVisitAvailability(authToken, { propertyId, visitType, from, days });
      setAvailability(data);
    } catch {
      setAvailability(null);
      setError('Could not load live visit slot availability.');
    } finally {
      setLoading(false);
    }
  }, [authToken, propertyId, visitType, from, days]);

  useEffect(() => {
    reload();
  }, [reload]);

  const slotsForDate = useCallback((date: string, fallbackTimes: string[]) => {
    void fallbackTimes;
    return availability?.days.find((day) => day.date === date)?.slots ?? [];
  }, [availability]);

  return { availability, loading, error, reload, slotsForDate };
}

function toDisplayProperty(property: CustomerProperty): DisplayProperty {
  const id = String(property._id ?? property.id ?? property.referenceId ?? '');
  const city = property.address?.city ?? property.city ?? '';
  const locality = property.address?.locality ?? property.locality ?? property.address?.line1 ?? city;
  const area = toNumber(property.specs?.builtUpArea ?? property.specs?.carpetArea ?? property.specs?.plotArea);
  const rawBhk = property.specs?.bhk;
  return {
    id,
    title: property.title ?? 'Untitled property',
    price: toNumber(property.price),
    type: property.type ?? 'residential',
    bhk: typeof rawBhk === 'string' ? toNumber(rawBhk) : toNumber(rawBhk),
    area,
    floor: property.specs?.floor ?? (property.specs?.totalFloors ? `0 of ${property.specs.totalFloors}` : '—'),
    flatNo: property.address?.line2 ?? '—',
    location: locality ?? 'Location unavailable',
    city,
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
    badge: property.isUpcoming ? 'Upcoming' : property.status === 'sold' ? 'Sold' : 'For Sale',
    launchDate: property.launchDate,
    backend: property,
  };
}

function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View className="mx-4 p-3 bg-rose-50 border border-rose-200 rounded-card flex-row items-center gap-2">
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
    <View className="py-10 items-center gap-2">
      <Spinner color="#1A6FFF" size={20} />
      <Text className="text-[12px] text-ink-500">{label}</Text>
    </View>
  );
}

function EmptyBlock({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
  return (
    <View className="items-center py-16 px-6">
      <Icon name="search-x" size={48} color="#CBD5E1" />
      <Text className="text-[15px] font-semibold mt-4 text-center">{title}</Text>
      {action && onPress && <Btn className="mt-4" variant="outline" onPress={onPress}>{action}</Btn>}
    </View>
  );
}

function usePropertyDetailFromContext(ctx: any) {
  const initial = (ctx?.p as DisplayProperty | undefined) || EMPTY_PROPERTY;
  const propertyId = ctx?.propertyId || propertyIdOf(initial);
  const [property, setProperty] = useState<DisplayProperty>(initial);
  const [loading, setLoading] = useState(!!propertyId);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const load = useCallback(async (silent = false) => {
    if (!propertyId) {
      setLoading(false);
      setError('Property details are unavailable. Go back and open the listing again.');
      return;
    }
    if (!silent) {
      setLoading(true);
      setError(null);
      setOffline(false);
    }
    try {
      setProperty(toDisplayProperty(await getCustomerProperty(propertyId)));
      setError(null);
      setOffline(false);
    } catch (err) {
      if (isNetworkError(err)) setOffline(true);
      if (!silent) setError(resourceErrorMessage(err, 'Could not load the latest property information.'));
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  }, [propertyId]);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
  }, [load]);
  useEffect(() => {
    setProperty((ctx?.p as DisplayProperty | undefined) || EMPTY_PROPERTY);
    setLoading(!!propertyId);
    setError(null);
  }, [propertyId]);
  useEffect(() => {
    load(Boolean(ctx?.refresh));
  }, [load, ctx?.refresh]);
  return { property, propertyId, loading, refreshing, error, offline, reload: () => load(false), refresh };
}

// ─── PropertyTypeGrid ──────────────────────────────────────────
export function PropertyTypeGrid({
  onSelect,
  accentColor = '#1A6FFF',
  counts = {},
  surface = 'buy',
}: {
  onSelect: (id: string) => void;
  accentColor?: string;
  counts?: Record<string, number>;
  surface?: 'buy' | 'sell';
}) {
  const { item } = useContentItem('property-type-visibility-config', fallbackPropertyTypeVisibilityContent);
  const layout = useLayout();
  const columns = layout.typeColumns;
  const gap = layout.gap;
  const itemWidth = gridItemWidth(layout.contentWidth - layout.gutter * 2, columns, gap);
  const tileHeight = layout.isTablet ? 118 : layout.isPhoneSm ? 96 : 100;
  const cmsTypes = contentMetaArray<PropertyTypeVisibilityConfig>(item, 'propertyTypes');
  const visibleTypes = cmsTypes.length
    ? cmsTypes
        .filter((type) => (surface === 'buy' ? type.showOnBuy : type.showOnSell))
        .sort((a, b) => a.order - b.order)
        .map((type) => {
          const fallback = PROPERTY_TYPES.find((item) => item.id === type.slug);
          return {
            id: type.slug,
            label: type.displayName || type.typeName || fallback?.label || type.slug,
            icon: fallback?.icon || type.icon || 'home',
            sub: fallback?.sub || 'Browse',
          };
        })
    : PROPERTY_TYPES;
  return (
    <View style={{ paddingHorizontal: layout.gutter }}>
      <View className="flex-row flex-wrap" style={{ gap }}>
        {visibleTypes.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => onSelect(t.id)}
            style={{ width: itemWidth, height: tileHeight }}
            className="rounded-card border border-ink-200 p-2 items-center justify-center gap-1"
          >
            <View className={`${layout.isTablet ? 'w-12 h-12' : 'w-11 h-11'} rounded-xl bg-brand-50 items-center justify-center`}>
              <Icon name={t.icon} size={layout.isTablet ? 22 : 20} color={accentColor} />
            </View>
            <Text className={`${layout.isTablet ? 'text-[12px]' : 'text-[10.5px]'} font-semibold text-center leading-caption`} numberOfLines={2}>{t.label}</Text>
            <Text className="text-[9px] text-ink-500 leading-caption" numberOfLines={1}>{counts[t.id] ? `${counts[t.id]} live` : t.sub || 'Browse'}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// ─── B-01 Property Type Selection ────────────────────────────
export function BuyTypeScreen() {
  const { go } = useNav();
  const { getCachedValue, setCachedValue } = useAppState();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadTypeCounts = useCallback(async () => {
    const cached = getCachedValue<Record<string, number>>(BUY_TYPE_COUNTS_CACHE_KEY);
    if (cached) {
      setCounts(cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const properties = await listCustomerProperties({ limit: 100, sort: 'newest' });
      const next = buildBuyTypeCounts(properties);
      setCounts(next);
      setCachedValue(BUY_TYPE_COUNTS_CACHE_KEY, next);
    } catch {
      setError('Could not load property type availability.');
      setCounts({});
    } finally {
      setLoading(false);
    }
  }, [getCachedValue, setCachedValue]);
  useEffect(() => {
    loadTypeCounts();
  }, [loadTypeCounts]);
  return (
    <Screen padBottom>
      <TopBar title="Select Property Type" />
      <PageBody className="items-center mb-4">
        <Text className="text-[13px] text-ink-500">What are you looking for?</Text>
      </PageBody>
      {error && <ErrorCard message={error} onRetry={loadTypeCounts} />}
      {loading && <LoadingBlock label="Checking live property availability..." />}
      <PropertyTypeGrid counts={counts} onSelect={(type) => go('buyList', { type })} />
    </Screen>
  );
}

// ─── B-02 Filter Screen ──────────────────────────────────────
export function FilterScreen() {
  const { go, back, ctx } = useNav();
  const incoming = (ctx?.filters ?? {}) as Record<string, unknown>;
  const [bhk, setBHK] = useState<Set<any>>(() => {
    const raw = String(incoming.bhk || '');
    return new Set(raw ? raw.split(',').map((item) => (Number(item) || item)) : []);
  });
  const [sort, setSort] = useState(ctx?.filters?.sort === 'price_asc' ? 'price-asc' : ctx?.filters?.sort === 'price_desc' ? 'price-desc' : ctx?.filters?.sort === 'newest' ? 'new' : 'relevance');
  const [city, setCity] = useState(String(incoming.city || ctx?.city || ''));
  const [minLakh, setMinLakh] = useState(incoming.minPrice ? String(Number(incoming.minPrice) / 100000) : '');
  const [maxLakh, setMaxLakh] = useState(incoming.maxPrice ? String(Number(incoming.maxPrice) / 100000) : '');
  const [minArea, setMinArea] = useState(incoming.minArea ? String(incoming.minArea) : '');
  const [maxArea, setMaxArea] = useState(incoming.maxArea ? String(incoming.maxArea) : '');
  const [loading, setLoading] = useState(false);
  const [previewCount, setPreviewCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const type = ctx?.type || 'apartment';
  const toggleBHK = (b: any) => { const s = new Set(bhk); s.has(b) ? s.delete(b) : s.add(b); setBHK(s); };
  const resetFilters = () => {
    setBHK(new Set());
    setCity('');
    setSort('relevance');
    setMinLakh('');
    setMaxLakh('');
    setMinArea('');
    setMaxArea('');
  };
  const params = useMemo(() => {
    const minPrice = Number(minLakh) > 0 ? Math.round(Number(minLakh) * 100000) : undefined;
    const maxPrice = Number(maxLakh) > 0 ? Math.round(Number(maxLakh) * 100000) : undefined;
    return {
      type: toBackendType(type),
      city: city.trim() || undefined,
      bhk: Array.from(bhk).join(',') || undefined,
      minPrice,
      maxPrice,
      minArea: Number(minArea) > 0 ? Number(minArea) : undefined,
      maxArea: Number(maxArea) > 0 ? Number(maxArea) : undefined,
      sort: sort === 'price-asc' ? 'price_asc' as const : sort === 'price-desc' ? 'price_desc' as const : sort === 'new' ? 'newest' as const : 'relevance' as const,
    };
  }, [bhk, city, maxArea, maxLakh, minArea, minLakh, sort, type]);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const timer = setTimeout(async () => {
      try {
        const data = await listCustomerProperties({ ...params, limit: 50 });
        if (!cancelled) setPreviewCount(data.length);
      } catch {
        if (!cancelled) {
          setPreviewCount(0);
          setError('Could not preview matching properties.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [params]);
  return (
    <Screen padBottom>
      <TopBar onBack={back} title="Filters" right={<Pressable onPress={resetFilters}><Text className="text-brand-600 text-sm font-semibold">Reset</Text></Pressable>} />
      <PageBody className="gap-5">
        <Field label="Location"><Input icon="map-pin" placeholder="City or locality" value={city} onChangeText={setCity} /></Field>
        <View>
          <Text className="text-[13px] font-medium mb-2">Budget (₹ lakhs)</Text>
          <View className="flex-row gap-3">
            <View className="flex-1"><Input keyboardType="numeric" placeholder="Min" value={minLakh} onChangeText={(v) => setMinLakh(v.replace(/[^\d.]/g, ''))} /></View>
            <View className="flex-1"><Input keyboardType="numeric" placeholder="Max" value={maxLakh} onChangeText={(v) => setMaxLakh(v.replace(/[^\d.]/g, ''))} /></View>
          </View>
        </View>
        <View>
          <Text className="text-[13px] font-medium mb-2">Area (sqft)</Text>
          <View className="flex-row gap-3">
            <View className="flex-1"><Input keyboardType="numeric" placeholder="Min" value={minArea} onChangeText={(v) => setMinArea(v.replace(/[^\d]/g, ''))} /></View>
            <View className="flex-1"><Input keyboardType="numeric" placeholder="Max" value={maxArea} onChangeText={(v) => setMaxArea(v.replace(/[^\d]/g, ''))} /></View>
          </View>
        </View>
        <View>
          <Text className="text-[13px] font-medium mb-2">BHK</Text>
          <View className="flex-row flex-wrap gap-2">
            {[1, 2, 3, 4, '5+'].map((b) => <Chip key={b as any} active={bhk.has(b)} onPress={() => toggleBHK(b)}>{b} BHK</Chip>)}
          </View>
        </View>
        <View>
          <Text className="text-[13px] font-medium mb-2">Sort by</Text>
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            {[['relevance', 'Most relevant'], ['price-asc', 'Price: Low–High'], ['price-desc', 'Price: High–Low'], ['new', 'Newest first']].map(([id, l]) => (
              <Pressable key={id} onPress={() => setSort(id)} className={`min-w-[46%] flex-1 p-2.5 rounded-card border min-h-[44px] justify-center ${sort === id ? 'border-brand-600 bg-brand-50' : 'border-ink-200'}`}>
                <Text className={`text-[12px] ${sort === id ? 'text-brand-700 font-semibold' : 'text-ink-700'}`}>{l}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        {error && <ErrorCard message={error} />}
      </PageBody>
      <PageBody className="mt-4 flex-row gap-3">
        <Btn variant="outline" onPress={resetFilters}>Clear all</Btn>
        <Btn className="flex-1" disabled={loading} onPress={() => go('buyList', { type, filters: params })}>
          {loading ? 'Checking...' : `Show ${previewCount} results`}
        </Btn>
      </PageBody>
    </Screen>
  );
}

// ─── B-03 Property Listing ───────────────────────────────────
export function BuyListScreen() {
  const { go, back, ctx } = useNav();
  const layout = useLayout();
  const { fav, loadFavoriteIds, toggleRemoteFavorite } = useAppState();
  const type = ctx?.type || 'apartment';
  const filters = useMemo(() => ctx?.filters ?? {}, [ctx?.filters]);
  const [chips, setChips] = useState<Set<string>>(new Set());
  const [list, setList] = useState<DisplayProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = PROPERTY_TYPES.find((t) => t.id === type)?.label || 'Properties';
  const chipFilters = useMemo(() => {
    const extra: Record<string, unknown> = {};
    if (chips.has('Verified')) extra.verified = true;
    if (chips.has('Ready to move')) extra.possession = 'Ready to move';
    if (chips.has('Under ₹1Cr')) extra.maxPrice = Math.min(Number((filters as any).maxPrice) || 10000000, 10000000);
    if (chips.has('3+ BHK')) extra.bhk = (filters as any).bhk || '3,4,5+';
    if (chips.has('Negotiable')) extra.negotiable = true;
    return extra;
  }, [chips, filters]);
  const activeFilterCount = Object.values({ ...filters, ...chipFilters }).filter((value) => value !== undefined && value !== '' && value !== false).length;
  const locationLabel = String((filters as any).city || list[0]?.city || '').trim();
  const loadProperties = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [properties] = await Promise.all([
        listCustomerProperties({ type: toBackendType(type), limit: 50, sort: 'newest', ...filters, ...chipFilters }),
        loadFavoriteIds().catch(() => new Set<string>()),
      ]);
      setList(properties.map(toDisplayProperty).filter((property) => property.id));
    } catch {
      setList([]);
      setError('Could not load matching properties.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [chipFilters, filters, loadFavoriteIds, type]);
  const toggleChip = (chip: string) => {
    setChips((current) => {
      const next = new Set(current);
      next.has(chip) ? next.delete(chip) : next.add(chip);
      return next;
    });
  };
  const handleFavorite = useCallback(async (id: string) => {
    try {
      await toggleRemoteFavorite(id);
    } catch {
      setError('Could not update saved property. Please try again.');
    }
  }, [toggleRemoteFavorite]);
  useEffect(() => {
    loadProperties();
  }, [loadProperties]);
  return (
    <Screen refreshing={refreshing} onRefresh={() => loadProperties(true)}>
      <TopBar
        onBack={back}
        title={label}
        sub={`${list.length} ${locationLabel ? `properties in ${locationLabel}` : 'matching properties'}`}
        right={
          <Pressable onPress={() => go('mapView')} className="w-9 h-9 rounded-full bg-ink-100 items-center justify-center">
            <Icon name="map" size={16} color="#0F172A" />
          </Pressable>
        }
      />
      <PageBody className="flex-row gap-2 mb-3">
        <Pressable onPress={() => go('filters', { type, filters, city: (filters as any).city })} className="flex-1 min-w-0 flex-row items-center gap-2 px-3 py-2 rounded-card border border-ink-200">
          <Icon name="sliders-horizontal" size={14} color="#334155" /><Text className="text-[13px] text-ink-700" numberOfLines={1}>Filters{activeFilterCount ? ` · ${activeFilterCount}` : ''}</Text>
        </Pressable>
        <Pressable onPress={() => go('advancedFilters')} className="px-3 py-2 rounded-card bg-brand-50 flex-row items-center gap-1.5 shrink-0">
          <Icon name="settings-2" size={14} color="#1A6FFF" /><Text className="text-[13px] font-semibold text-brand-700">Advanced</Text>
        </Pressable>
      </PageBody>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: layout.gutter }}>
        {['Verified', 'Ready to move', 'Under ₹1Cr', '3+ BHK', 'Negotiable'].map((c) => (
          <Chip key={c} active={chips.has(c)} onPress={() => toggleChip(c)}>{c}</Chip>
        ))}
      </ScrollView>
      {error && <View className="mt-3"><ErrorCard message={error} onRetry={loadProperties} /></View>}
      {loading ? (
        <PageBody className="gap-3 mt-3">
          <LoadingBlock label="Loading matching properties..." />
          <SkeletonCard compact />
          <SkeletonCard compact />
        </PageBody>
      ) : list.length === 0 ? (
        <EmptyState icon="search-x" title="No properties found" action="Change Filters" onPress={() => go('filters', { type })} />
      ) : (
        <PageBody className="mt-2 gap-3 pb-4">
          {list.map((p, idx) => (
            <FadeInView key={p.id} delay={idx * 35}>
              <PropertyCard p={p} fav={fav.has(p.id)} onFav={() => handleFavorite(p.id)} onPress={() => go('propertyDetail', { p, propertyId: p.id })} />
            </FadeInView>
          ))}
        </PageBody>
      )}
    </Screen>
  );
}

// ─── B-04 Property Detail ────────────────────────────────────
export function PropertyDetailScreen() {
  const { go, back, ctx } = useNav();
  const { fav, loadFavoriteIds, toggleRemoteFavorite } = useAppState();
  const insets = useSafeAreaInsets();
  const layout = useLayout();
  const { msg, fire } = useToast();
  const initial = (ctx?.p as DisplayProperty | undefined) || EMPTY_PROPERTY;
  const [p, setProperty] = useState<DisplayProperty>(initial);
  const [loading, setLoading] = useState(!!(ctx?.propertyId || initial.id));
  const [error, setError] = useState<string | null>(null);
  const [img, setImg] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [planViewerOpen, setPlanViewerOpen] = useState(false);
  const [planViewerIndex, setPlanViewerIndex] = useState(0);
  const propertyId = ctx?.propertyId || propertyIdOf(p);
  const imageCount = p.images.length;
  const hasMultipleImages = imageCount > 1;
  const activeImageIndex = imageCount ? Math.min(img, imageCount - 1) : 0;
  const currentImage = p.images[activeImageIndex];
  const backend = p.backend;
  const floorPlans = useMemo(() => propertyFloorPlans(backend?.media), [backend?.media]);
  const planUrls = useMemo(() => floorPlans.map((plan) => plan.url), [floorPlans]);
  const coords = propertyCoordinates(p);
  const specsReady = hasAnyValue([
    p.amenities,
    backend?.highlights,
    backend?.specs?.bhk,
    backend?.specs?.builtUpArea,
    backend?.specs?.carpetArea,
    backend?.specs?.plotArea,
    backend?.specs?.floor,
    backend?.specs?.totalFloors,
    backend?.specs?.facing,
    backend?.specs?.age,
    backend?.specs?.furnishing,
    backend?.specs?.parking,
    backend?.specs?.reraNumber,
    backend?.specs?.possession,
    backend?.specs?.vastuCompliant,
    backend?.specs?.transactionType,
  ]);
  const locationReady = hasAnyValue([
    backend?.advantages?.investment,
    backend?.advantages?.location,
    backend?.advantages?.connectivity,
    backend?.nearbyPlaces,
    coords,
  ]);
  const featureLinks = [
    {
      dest: 'vrTour',
      icon: 'glasses',
      label: 'VR Tour',
      enabled: hasVirtualTour(backend?.media),
      unavailable: 'VR / 3D tour is not available for this property yet.',
    },
    {
      dest: 'aerial',
      icon: 'plane',
      label: 'Aerial',
      enabled: hasAerialContent(backend?.media),
      unavailable: 'Aerial video or drone media has not been added for this property yet.',
    },
    {
      dest: 'specs',
      icon: 'list-checks',
      label: 'Specs',
      enabled: specsReady,
      unavailable: 'Specifications are not available for this property yet.',
    },
    {
      dest: 'advantages',
      icon: 'map-pin',
      label: 'Location',
      enabled: locationReady,
      unavailable: 'Location highlights are not available for this property yet.',
    },
  ];
  const showPreviousImage = useCallback(() => {
    if (!hasMultipleImages) return;
    setImg((current) => (current - 1 + imageCount) % imageCount);
  }, [hasMultipleImages, imageCount]);
  const showNextImage = useCallback(() => {
    if (!hasMultipleImages) return;
    setImg((current) => (current + 1) % imageCount);
  }, [hasMultipleImages, imageCount]);
  const openImageViewer = useCallback(() => {
    if (!currentImage) return;
    setViewerOpen(true);
  }, [currentImage]);
  const openPlanViewer = useCallback((index: number) => {
    if (!planUrls.length) return;
    setPlanViewerIndex(Math.max(0, Math.min(index, planUrls.length - 1)));
    setPlanViewerOpen(true);
  }, [planUrls.length]);
  const openFeature = useCallback((dest: string, enabled: boolean, unavailable: string) => {
    if (!enabled) {
      fire(unavailable);
      return;
    }
    go(dest, { p, propertyId: propertyIdOf(p) });
  }, [fire, go, p]);
  const callAdvisor = useCallback(() => {
    void openCompanyCall().catch(() => fire('Could not open the phone dialer.'));
  }, [fire]);
  const loadDetail = useCallback(async (silent = false) => {
    if (!propertyId) {
      setLoading(false);
      return;
    }
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const [detail] = await Promise.all([
        getCustomerProperty(propertyId),
        loadFavoriteIds().catch(() => new Set<string>()),
      ]);
      setProperty(toDisplayProperty(detail));
      if (silent) setError(null);
    } catch {
      if (!silent) setError('Could not load latest property details.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [loadFavoriteIds, propertyId]);
  const handleFavorite = useCallback(async () => {
    try {
      await toggleRemoteFavorite(propertyIdOf(p));
    } catch {
      setError('Could not update saved property. Please try again.');
    }
  }, [p, toggleRemoteFavorite]);
  const loadedForId = React.useRef<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const silent = loadedForId.current === propertyId && !!propertyId;
      if (propertyId) {
        loadedForId.current = propertyId;
        void loadDetail(silent);
      } else {
        setLoading(false);
      }
      const timer = setInterval(() => {
        if (!cancelled && propertyId) void loadDetail(true);
      }, 45000);
      return () => {
        cancelled = true;
        clearInterval(timer);
      };
    }, [loadDetail, propertyId]),
  );
  useEffect(() => {
    setImg((current) => (imageCount ? Math.min(current, imageCount - 1) : 0));
  }, [imageCount]);
  return (
    <Screen fill>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 104 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        {loading && <LoadingBlock label="Loading property details..." />}
        {error && <View className="mt-2"><ErrorCard message={error} onRetry={() => void loadDetail(false)} /></View>}
        <View className="relative">
          <PhotoPlaceholder tag={p.id + activeImageIndex} height={layout.heroHeight}>
            {currentImage && (
              <Pressable
                onPress={openImageViewer}
                accessibilityRole="imagebutton"
                accessibilityLabel={`Open property image ${activeImageIndex + 1} of ${imageCount}`}
                className="absolute inset-0"
              >
                <Image source={{ uri: currentImage }} className="absolute inset-0 w-full h-full" resizeMode="cover" />
              </Pressable>
            )}
            {p.verified && (
              <View className="absolute top-16 left-4 bg-emerald-500 px-3 py-1 rounded-full flex-row items-center gap-1" style={{ top: Math.max(56, insets.top + 8) }}>
                <Icon name="badge-check" size={12} color="white" /><Text className="text-white text-[11px] font-medium">Verified</Text>
              </View>
            )}
            {hasMultipleImages && (
              <>
                <Pressable
                  accessibilityLabel="Show previous property image"
                  onPress={showPreviousImage}
                  hitSlop={8}
                  className="absolute left-3 w-11 h-11 rounded-full bg-white/90 items-center justify-center"
                  style={{ top: layout.heroHeight / 2 - 22, elevation: 4 }}
                >
                  <Icon name="chevron-left" size={24} color="#0F172A" strokeWidth={2.5} />
                </Pressable>
                <Pressable
                  accessibilityLabel="Show next property image"
                  onPress={showNextImage}
                  hitSlop={8}
                  className="absolute right-3 w-11 h-11 rounded-full bg-white/90 items-center justify-center"
                  style={{ top: layout.heroHeight / 2 - 22, elevation: 4 }}
                >
                  <Icon name="chevron-right" size={24} color="#0F172A" strokeWidth={2.5} />
                </Pressable>
                <View className="absolute bottom-3 left-0 right-0 flex-row items-center justify-center gap-1.5">
                  {p.images.map((_, index) => (
                    <Pressable
                      key={`img-dot-${index}`}
                      accessibilityLabel={`Show property image ${index + 1}`}
                      onPress={() => setImg(index)}
                      hitSlop={6}
                      className={`h-1.5 rounded-full ${index === activeImageIndex ? 'w-5 bg-white' : 'w-1.5 bg-white/60'}`}
                    />
                  ))}
                </View>
              </>
            )}
            <View className="absolute bottom-3 right-3 bg-black/60 px-2 py-0.5 rounded">
              <Text className="text-white text-[11px]">{imageCount ? `${activeImageIndex + 1}/${imageCount}` : 'No media'}</Text>
            </View>
          </PhotoPlaceholder>
        </View>
        <View className="pt-4 pb-6" style={{ paddingHorizontal: layout.gutter }}>
          <View className="flex-row flex-wrap items-center gap-2 mb-2">
            <Text style={{ fontSize: layout.isTablet ? 32 : 28 }} className="font-bold text-brand-600">{formatINR(p.price)}</Text>
            {p.negotiable && (
              <View className="bg-brand-50 px-2 py-0.5 rounded-md"><Text className="text-brand-600 text-[11px] font-semibold">Negotiable</Text></View>
            )}
          </View>
          <Text className="text-[18px] font-semibold text-ink-900 mb-2 leading-display-tight">{p.title}</Text>
          <View className="flex-row items-center justify-between mb-4 gap-2">
            <View className="flex-row items-center gap-1 flex-1 min-w-0 pr-2">
              <Icon name="map-pin" size={14} color="#475569" />
              <Text className="text-ink-600 text-[13px] flex-1" numberOfLines={2}>{p.location}, {p.city}</Text>
            </View>
            <Pressable onPress={() => go('mapView', { p, propertyId: propertyIdOf(p) })} hitSlop={8} className="min-h-[44px] justify-center">
              <Text className="text-brand-600 font-medium text-[12px]">View on Map</Text>
            </Pressable>
          </View>
          <View className="flex-row flex-wrap mb-5" style={{ gap: layout.gap }}>
            {([
              ['BHK', p.bhk ? `${p.bhk} BHK` : 'Plot'],
              ['Floor', p.floor],
              ['Area', `${p.area} sqft`],
              ['Flat No', p.flatNo || 'N/A'],
            ] as [string, string][]).map(([label, val]) => (
              <View
                key={label}
                style={{ width: gridItemWidth(layout.contentWidth - layout.gutter * 2, layout.isTabletSm ? 4 : 2, layout.gap) }}
                className="bg-ink-50 rounded-lg p-3"
              >
                <Text className="text-[11px] text-ink-500 mb-0.5">{label}</Text>
                <Text className="text-[14px] font-semibold text-ink-900" numberOfLines={1}>{val}</Text>
              </View>
            ))}
          </View>
          {!!p.desc?.trim() && (
            <>
              <Text className="text-[15px] font-semibold mb-2">About this property</Text>
              <Text className="text-[13px] text-ink-700 leading-relaxed mb-5">{p.desc}</Text>
            </>
          )}
          {floorPlans.length > 0 && (
            <View className="mb-5">
              <Text className="text-[15px] font-semibold text-ink-900 mb-3">Floor Plan</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 8 }}>
                {floorPlans.map((plan, index) => (
                  <View
                    key={`${plan.url}-${index}`}
                    style={{ width: layout.floorPlanThumbWidth, height: layout.isTablet ? 110 : 92, borderRadius: 16, overflow: 'hidden' }}
                  >
                    <Pressable
                      onPress={() => go('floorPlan', { p, propertyId: propertyIdOf(p), planIndex: index })}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${plan.label}`}
                      className="absolute inset-0"
                    >
                      <View className="absolute inset-0" style={{ backgroundColor: FLOOR_PLAN_ACCENTS[index % FLOOR_PLAN_ACCENTS.length] }} />
                      <Image source={{ uri: plan.url }} className="absolute inset-0 w-full h-full" resizeMode="cover" />
                      <View className="absolute inset-0 bg-black/10" />
                      <View className="absolute bottom-2 left-2 bg-black/50 rounded-full px-2.5 py-1">
                        <Text className="text-[10px] text-white font-semibold">{plan.label}</Text>
                      </View>
                    </Pressable>
                    <Pressable
                      onPress={() => openPlanViewer(index)}
                      accessibilityLabel={`Expand ${plan.label}`}
                      hitSlop={8}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/45 items-center justify-center"
                      style={{ zIndex: 2 }}
                    >
                      <Icon name="maximize-2" size={13} color="white" />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
          <View className="flex-row gap-2 mb-5">
            {featureLinks.map(({ dest, icon, label, enabled, unavailable }) => (
              <Pressable
                key={dest}
                onPress={() => openFeature(dest, enabled, unavailable)}
                accessibilityState={{ disabled: !enabled }}
                className={`flex-1 min-h-[76px] py-3 px-1 rounded-card border border-ink-200 items-center justify-center bg-white ${enabled ? '' : 'opacity-45'}`}
              >
                <Icon name={icon} size={22} color="#1A6FFF" />
                <Text className="text-[11px] font-semibold text-ink-900 mt-1.5 text-center">{label}</Text>
              </Pressable>
            ))}
          </View>
          <View className="flex-row items-center rounded-2xl bg-brand-50 px-3 py-3">
            <View className="w-12 h-12 rounded-full bg-brand-600 items-center justify-center">
              <Text className="text-white text-[14px] font-bold">{advisorInitials(DEFAULT_PROPERTY_ADVISOR.name)}</Text>
            </View>
            <View className="flex-1 ml-3 mr-2">
              <Text className="text-[14px] font-bold text-ink-900" numberOfLines={1}>{DEFAULT_PROPERTY_ADVISOR.name}</Text>
              <Text className="text-[12px] text-ink-500 mt-0.5">{DEFAULT_PROPERTY_ADVISOR.role}</Text>
            </View>
            <Pressable
              onPress={callAdvisor}
              accessibilityLabel="Call Builtglory advisor"
              className="w-11 h-11 rounded-full bg-white items-center justify-center border border-ink-100"
              style={{ elevation: 2 }}
            >
              <Icon name="phone" size={18} color="#1A6FFF" />
            </Pressable>
          </View>
        </View>
      </ScrollView>
      <PageBody className="absolute top-0 left-0 right-0 pt-3 flex-row items-center justify-between" style={{ zIndex: 10, elevation: 10 }}>
        <Pressable onPress={back} className="w-10 h-10 bg-white/90 rounded-full items-center justify-center">
          <Icon name="arrow-left" size={18} color="#0F172A" />
        </Pressable>
        <View className="flex-row gap-2">
          <Pressable onPress={handleFavorite} className="w-10 h-10 bg-white/90 rounded-full items-center justify-center">
            <Icon name="heart" size={18} color={fav.has(p.id) ? '#E11D48' : '#0F172A'} fill={fav.has(p.id) ? '#E11D48' : 'none'} />
          </Pressable>
          <Pressable
            onPress={() => {
              sharePropertyNative({
                id: propertyIdOf(p),
                title: p.title,
                location: p.location,
                city: p.city,
                price: p.price,
                desc: p.desc,
              }).catch(() => go('shareProperty', { p, propertyId: propertyIdOf(p) }));
            }}
            className="w-10 h-10 bg-white/90 rounded-full items-center justify-center"
          >
            <Icon name="share-2" size={18} color="#0F172A" />
          </Pressable>
        </View>
      </PageBody>
      <View className="absolute bottom-0 left-0 right-0 bg-white border-t border-ink-200 px-3 pt-3 flex-row gap-2" style={{ paddingBottom: 12 + insets.bottom, zIndex: 10, elevation: 10 }}>
        <Btn variant="outline" className="flex-1" icon="git-compare" onPress={() => go('compare', { p, propertyId: propertyIdOf(p) })}>Compare</Btn>
        <Btn className="flex-1" onPress={() => go('enquiry', { p, propertyId: propertyIdOf(p) })}>Submit Enquiry</Btn>
      </View>
      <PropertyImageViewer
        images={p.images}
        visible={viewerOpen}
        imageIndex={activeImageIndex}
        onClose={() => setViewerOpen(false)}
        onImageIndexChange={setImg}
      />
      <PropertyImageViewer
        images={planUrls}
        visible={planViewerOpen}
        imageIndex={planViewerIndex}
        onClose={() => setPlanViewerOpen(false)}
        onImageIndexChange={setPlanViewerIndex}
      />
      <Toast message={msg} />
    </Screen>
  );
}

// ─── B-05 Specifications ─────────────────────────────────────
export function SpecsScreen() {
  const { back, ctx } = useNav();
  const layout = useLayout();
  const cols = layout.tileColumns;
  const gap = layout.gap;
  const itemW = gridItemWidth(layout.contentWidth - layout.gutter * 2, cols, gap);
  const { property: p, loading, error, reload } = usePropertyDetailFromContext(ctx);
  const backend = p.backend;
  const specRows = propertySpecRows(backend, {
    price: p.price,
    type: p.type,
    location: p.location,
    city: p.city,
    area: p.area,
    bhk: p.bhk,
    floor: p.floor,
  });
  const amenities = propertyAmenityLabels(backend, p.amenities);
  const highlights = propertyHighlightLabels(backend);
  return (
    <Screen>
      <TopBar onBack={back} title="Specifications & Amenities" />
      {loading && <LoadingBlock label="Loading property specifications..." />}
      {error && <ErrorCard message={error} onRetry={reload} />}
      <ScrollView contentContainerStyle={{ paddingHorizontal: layout.gutter, paddingBottom: 32 }}>
        {!loading && !specRows.length && !amenities.length && !highlights.length && (
          <EmptyBlock title="Specifications have not been added for this property yet." />
        )}
        {specRows.length > 0 && (
          <View className="rounded-card border border-ink-200 overflow-hidden mb-5">
            {specRows.map((row, index) => (
              <View key={`${row.label}-${index}`} className={`flex-row px-3 py-2.5 ${index % 2 ? 'bg-ink-50' : 'bg-white'}`}>
                <Text className="w-[42%] text-[12px] text-ink-500 pr-2">{row.label}</Text>
                <Text className="flex-1 text-[13px] font-semibold text-ink-900">{row.value}</Text>
              </View>
            ))}
          </View>
        )}
        {amenities.length > 0 && (
          <View className="mb-5">
            <Text className="text-[14px] font-semibold mb-3">Amenities</Text>
            <View className="flex-row flex-wrap" style={{ gap }}>
              {amenities.map((label) => {
                const icon = SPECS.find((item) => label.toLowerCase().includes(item.label.toLowerCase().split(' ')[0]))?.icon ?? 'check';
                return (
                  <View key={label} style={{ width: itemW }} className="aspect-square rounded-card border border-brand-200 bg-brand-50 p-2 items-center justify-center gap-1.5">
                    <Icon name={icon} size={layout.isTablet ? 22 : 20} color="#1A6FFF" />
                    <Text style={{ fontSize: layout.isPhoneSm ? 9 : 10 }} className="text-center font-medium leading-caption" numberOfLines={2}>{label}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}
        {highlights.length > 0 && (
          <View className="gap-2">
            <Text className="text-[14px] font-semibold mb-2">Property highlights</Text>
            {highlights.map((h) => (
              <View key={h} className="flex-row items-center gap-2">
                <Icon name="check-circle-2" size={14} color="#10B981" /><Text className="text-[13px] text-ink-700 flex-1">{h}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

// ─── B-06 Advantages ─────────────────────────────────────────
export function AdvantagesScreen() {
  const { back, go, ctx } = useNav();
  const { property: p, propertyId, loading, error, reload } = usePropertyDetailFromContext(ctx);
  const insets = useSafeAreaInsets();
  useGoogleMapUserLocation();
  const backend = p.backend;
  const coordinates = propertyCoordinates(p);
  const mapRegion: Region | undefined = coordinates
    ? { ...coordinates, latitudeDelta: 0.01, longitudeDelta: 0.01 }
    : undefined;
  const nearby = backend?.nearbyPlaces ?? [];
  const advs = [
    ...(backend?.advantages?.investment ?? []).map((body) => ({ icon: 'trending-up', title: 'Investment', body, color: '#10B981' })),
    ...(backend?.advantages?.location ?? []).map((body) => ({ icon: 'map-pin', title: 'Location', body, color: '#1A6FFF' })),
    ...(backend?.advantages?.connectivity ?? []).map((body) => ({ icon: 'train', title: 'Connectivity', body, color: '#8B5CF6' })),
    ...nearby.slice(0, 6).map((place) => ({ icon: place.type === 'hospital' ? 'hospital' : place.type === 'school' ? 'school' : 'shopping-bag', title: place.name ?? 'Nearby place', body: place.distance ?? 'Nearby', color: '#F59E0B' })),
  ];
  return (
    <Screen fill>
      <TopBar onBack={back} title="Advantages & Location" />
      {loading && <LoadingBlock label="Loading location advantages..." />}
      {error && <ErrorCard message={error} onRetry={reload} />}
      <PageBody className="gap-3" style={{ paddingBottom: 104 + insets.bottom }}>
        {!loading && !advs.length && !mapRegion && (
          <EmptyBlock title="Location details have not been added for this property yet." />
        )}
        {advs.map((a, index) => (
          <View key={`${a.title}-${index}`} className="p-3 rounded-card border border-ink-200 flex-row items-center gap-3">
            <View className="w-11 h-11 rounded-full items-center justify-center" style={{ backgroundColor: a.color + '20' }}>
              <Icon name={a.icon} size={20} color={a.color} />
            </View>
            <View className="flex-1">
              <Text className="text-[14px] font-semibold">{a.title}</Text>
              <Text className="text-[11.5px] text-ink-500">{a.body}</Text>
            </View>
          </View>
        ))}
        <View className="h-52 rounded-card border border-ink-200 overflow-hidden bg-ink-100">
          {mapRegion ? (
            <>
              <MapView
                provider={PROVIDER_GOOGLE}
                style={{ flex: 1 }}
                initialRegion={mapRegion}
                showsBuildings
                showsUserLocation
                showsMyLocationButton
                zoomEnabled
                scrollEnabled
              >
                <Marker
                  coordinate={{ latitude: mapRegion.latitude, longitude: mapRegion.longitude }}
                  title={p.title}
                  description={[p.location, p.city].filter(Boolean).join(', ')}
                />
              </MapView>
              <View className="absolute left-3 right-3 bottom-3 flex-row items-center justify-between">
                <View className="bg-white/95 px-3 py-2 rounded-xl shadow flex-1 mr-2">
                  <Text className="text-[12px] font-semibold" numberOfLines={1}>{p.title}</Text>
                  <Text className="text-[10.5px] text-ink-500" numberOfLines={1}>{p.location}, {p.city}</Text>
                </View>
                <Pressable
                  onPress={() => openDirections(coordinates!, p.title).catch(() => go('mapView', { p, propertyId }))}
                  className="bg-white px-3 py-2 rounded-xl shadow"
                >
                  <Text className="text-[11px] font-semibold">Directions</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <View className="flex-1 items-center justify-center px-6">
              <Icon name="map-pin-off" size={32} color="#94A3B8" />
              <Text className="text-[13px] font-semibold mt-3 text-center">Map location unavailable</Text>
              <Text className="text-[11px] text-ink-500 mt-1 text-center">Latitude and longitude have not been saved for this property yet.</Text>
            </View>
          )}
        </View>
      </PageBody>
      <View className="absolute bottom-0 left-0 right-0 bg-white border-t border-ink-200 px-3 pt-3 flex-row gap-2" style={{ paddingBottom: 12 + insets.bottom, zIndex: 10, elevation: 10 }}>
        <Btn
          variant="outline"
          icon="glasses"
          className="flex-1"
          disabled={loading || !hasVirtualTour(backend?.media)}
          onPress={() => go('vrTour', { p, propertyId: propertyId || propertyIdOf(p) })}
        >
          VR walk
        </Btn>
        <Btn
          variant="outline"
          icon="plane"
          className="flex-1"
          disabled={loading || !hasAerialContent(backend?.media)}
          onPress={() => go('aerial', { p, propertyId: propertyId || propertyIdOf(p) })}
        >
          Aerial view
        </Btn>
      </View>
    </Screen>
  );
}

// ─── B-07 VR Tour ────────────────────────────────────────────
export function VRTourScreen() {
  const { back, ctx } = useNav();
  const { property: p, loading, error, reload } = usePropertyDetailFromContext(ctx);
  const tourUrl = virtualTourUrl(p.backend?.media);
  const tourReady = !loading && !error && !!tourUrl;
  return (
    <Screen dark fill>
      <TopBar onBack={back} title="360° Virtual Tour" dark />
      {loading && <LoadingBlock label="Loading virtual tour..." />}
      {error && <ErrorCard message={error} onRetry={reload} />}
      {!loading && !error && !tourUrl && (
        <View className="flex-1 items-center justify-center px-6">
          <Icon name="glasses" size={40} color="#64748B" />
          <Text className="text-white text-[15px] font-semibold mt-4 text-center">Virtual tour unavailable</Text>
          <Text className="text-white/60 text-[12px] mt-2 text-center">
            A 360° walkthrough has not been added for {p.title || 'this property'} yet.
          </Text>
          <Btn variant="outline" className="mt-5" onPress={reload}>Refresh</Btn>
        </View>
      )}
      {tourReady && tourUrl && (
        <View className="flex-1">
          <PageBody className="py-2 flex-row items-center justify-between">
            <Badge color="brand">360° Tour</Badge>
            <Text className="text-white/70 text-[11px] flex-1 ml-3" numberOfLines={1}>{p.title}</Text>
            <Pressable onPress={() => openExternalUrl(tourUrl).catch(() => undefined)} className="ml-2 px-2 py-1 rounded-full bg-white/10">
              <Icon name="external-link" size={14} color="white" />
            </Pressable>
          </PageBody>
          <PropertyEmbedViewer url={tourUrl} label="virtual tour" />
        </View>
      )}
    </Screen>
  );
}

// ─── B-08 Aerial View ────────────────────────────────────────
export function AerialScreen() {
  const { back, ctx } = useNav();
  const { property: p, loading, error, reload } = usePropertyDetailFromContext(ctx);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [showDroneMedia, setShowDroneMedia] = useState(false);
  useGoogleMapUserLocation();
  const coordinates = propertyCoordinates(p);
  const droneUrl = aerialDroneUrl(p.backend?.media);
  const droneImageUrl = droneUrl && isImageMediaUrl(droneUrl) ? droneUrl : null;
  const droneEmbedUrl = droneUrl && !isImageMediaUrl(droneUrl) ? droneUrl : null;
  const mapRegion: Region | undefined = coordinates
    ? { ...coordinates, latitudeDelta: 0.004, longitudeDelta: 0.004 }
    : undefined;
  const aerialReady = !loading && !error && hasAerialContent(p.backend?.media);
  const showSatelliteMap = aerialReady && mapRegion && !showDroneMedia;
  const showDroneEmbed = aerialReady && showDroneMedia && !!droneEmbedUrl;
  const showDroneImage = aerialReady && showDroneMedia && !!droneImageUrl;
  useEffect(() => {
    if (!coordinates && droneUrl) setShowDroneMedia(true);
  }, [coordinates, droneUrl]);
  return (
    <Screen dark fill>
      <TopBar onBack={back} title="Aerial View" dark />
      {loading && <LoadingBlock label="Loading aerial view..." />}
      {error && <ErrorCard message={error} onRetry={reload} />}
      {!loading && !error && !aerialReady && (
        <View className="flex-1 items-center justify-center px-6">
          <Icon name="plane" size={40} color="#64748B" />
          <Text className="text-white text-[15px] font-semibold mt-4 text-center">Aerial view unavailable</Text>
          <Text className="text-white/60 text-[12px] mt-2 text-center">
            Add aerial video or drone media for {p.title || 'this property'} from the dashboard.
          </Text>
          <Btn variant="outline" className="mt-5" onPress={reload}>Refresh</Btn>
        </View>
      )}
      {aerialReady && (
        <View className="flex-1">
          <PageBody className="py-2 flex-row items-center gap-2">
            {mapRegion && (
              <Pressable
                onPress={() => setShowDroneMedia(false)}
                className={`px-3 py-1.5 rounded-full ${!showDroneMedia ? 'bg-brand-600' : 'bg-white/10'}`}
              >
                <Text className={`text-[12px] font-semibold ${!showDroneMedia ? 'text-white' : 'text-white/70'}`}>Satellite map</Text>
              </Pressable>
            )}
            {droneUrl && (
              <Pressable
                onPress={() => setShowDroneMedia(true)}
                className={`px-3 py-1.5 rounded-full ${showDroneMedia ? 'bg-brand-600' : 'bg-white/10'}`}
              >
                <Text className={`text-[12px] font-semibold ${showDroneMedia ? 'text-white' : 'text-white/70'}`}>Drone media</Text>
              </Pressable>
            )}
            <View className="flex-1" />
            <Text className="text-white/60 text-[11px]" numberOfLines={1}>{p.title}</Text>
          </PageBody>
          {showSatelliteMap && mapRegion && (
            <View className="flex-1 mx-4 mb-4 rounded-card overflow-hidden border border-white/10">
              <MapView
                provider={PROVIDER_GOOGLE}
                style={{ flex: 1 }}
                initialRegion={mapRegion}
                mapType="satellite"
                showsBuildings
                showsCompass
                showsScale
                showsUserLocation
                showsMyLocationButton
                zoomEnabled
                scrollEnabled
              >
                <Marker
                  coordinate={{ latitude: mapRegion.latitude, longitude: mapRegion.longitude }}
                  title={p.title}
                  description={[p.location, p.city].filter(Boolean).join(', ')}
                />
              </MapView>
              <View className="absolute left-3 right-3 bottom-3 bg-black/60 px-3 py-2 rounded-xl">
                <Text className="text-white text-[12px] font-semibold" numberOfLines={1}>{p.title}</Text>
                <Text className="text-white/70 text-[10.5px]" numberOfLines={1}>
                  {p.location}, {p.city} · {mapRegion.latitude.toFixed(5)}, {mapRegion.longitude.toFixed(5)}
                </Text>
              </View>
            </View>
          )}
          {showDroneEmbed && droneEmbedUrl && (
            <View className="flex-1 mx-4 mb-4 rounded-card overflow-hidden border border-white/10">
              <PropertyEmbedViewer url={droneEmbedUrl} label="drone footage" />
            </View>
          )}
          {showDroneImage && droneImageUrl && (
            <View className="flex-1 mx-4 mb-4 rounded-card overflow-hidden border border-white/10 bg-ink-800">
              <Pressable onPress={() => setViewerOpen(true)} className="flex-1" accessibilityRole="imagebutton" accessibilityLabel="Open aerial image fullscreen">
                <Image source={{ uri: droneImageUrl }} className="w-full h-full" resizeMode="cover" />
              </Pressable>
              <View className="absolute top-3 left-3">
                <Badge color="brand">Drone capture</Badge>
              </View>
            </View>
          )}
          {!mapRegion && showDroneMedia && !droneUrl && (
            <View className="flex-1 items-center justify-center px-6">
              <Text className="text-white/70 text-[12px] text-center">Drone media is not available for this property.</Text>
            </View>
          )}
        </View>
      )}
      <PropertyImageViewer
        images={droneImageUrl ? [droneImageUrl] : []}
        visible={viewerOpen}
        onClose={() => setViewerOpen(false)}
      />
    </Screen>
  );
}

// ─── B-09 Share Property ─────────────────────────────────────
export function ShareScreen() {
  const { back, ctx } = useNav();
  const layout = useLayout();
  const { property: p, propertyId, loading, error, reload } = usePropertyDetailFromContext(ctx);
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const { msg, fire } = useToast();
  const id = propertyId || p.id;
  const shareUrl = id ? propertyShareUrl(id) : '';
  const copyShareLink = async () => {
    if (!shareUrl) return;
    await Clipboard.setStringAsync(shareUrl);
    setCopied(true);
    fire('Property link copied');
    setTimeout(() => setCopied(false), 1500);
  };
  const openNativeShare = async () => {
    if (!id) return;
    setSharing(true);
    try {
      await sharePropertyNative({
        id,
        title: p.title,
        location: p.location,
        city: p.city,
        price: p.price,
        desc: p.desc,
      });
    } catch {
      fire('Could not open the device share sheet');
    } finally {
      setSharing(false);
    }
  };
  return (
    <Screen>
      <TopBar onBack={back} title="Share property" />
      {loading && <LoadingBlock label="Loading share details..." />}
      {error && <ErrorCard message={error} onRetry={reload} />}
      <View style={{ paddingHorizontal: layout.gutter }}>
        <View className="bg-ink-50 rounded-card p-3 flex-row gap-3 items-center mb-5">
          <PhotoPlaceholder tag={p.id} width={72} height={72} className="rounded-md">
            {p.images[0] ? <Image source={{ uri: p.images[0] }} className="absolute inset-0 w-full h-full rounded-md" resizeMode="cover" /> : null}
          </PhotoPlaceholder>
          <View className="flex-1 min-w-0">
            <Text className="text-[13px] font-semibold" numberOfLines={2}>{p.title}</Text>
            <Text className="text-[11px] text-ink-500" numberOfLines={1}>{p.location} · {formatINR(p.price)}</Text>
          </View>
        </View>
        <Text className="text-[13px] text-ink-500 mb-4">
          Opens the native share sheet so you can send this listing through WhatsApp, Messages, Mail, or any other app installed on this device.
        </Text>
        <Btn icon="share-2" disabled={!id || sharing || loading} onPress={() => void openNativeShare()}>
          {sharing ? 'Opening share sheet...' : 'Share via installed apps'}
        </Btn>
        <Pressable
          onPress={() => copyShareLink().catch(() => fire('Could not copy link'))}
          className="flex-row items-center gap-2 p-2.5 rounded-card bg-ink-50 border border-ink-200 mt-4"
        >
          <Icon name="link" size={14} color="#64748B" />
          <Text className="flex-1 text-[12px] text-ink-700" numberOfLines={1}>{shareUrl || 'Property link unavailable'}</Text>
          <Text className="text-brand-600 text-[12px] font-semibold">{copied ? '✓ Copied' : 'Copy'}</Text>
        </Pressable>
      </View>
      <Toast message={msg} />
    </Screen>
  );
}

// ─── B-10 Enquiry Form ───────────────────────────────────────
export function EnquiryScreen() {
  const { back, go, completeTo, ctx } = useNav();
  const { authToken, currentUser } = useAppState();
  const { property: p, propertyId, loading: loadingProperty, error: propertyError, reload } = usePropertyDetailFromContext(ctx);
  const [name, setName] = useState(currentUser?.name ?? currentUser?.fullName ?? '');
  const [phone, setPhone] = useState(String(currentUser?.phoneNormalized ?? currentUser?.mobileNumber ?? currentUser?.phone ?? '').replace(/\D/g, '').slice(-10));
  const [contact, setContact] = useState('WhatsApp');
  const [types, setTypes] = useState<Set<string>>(new Set(['Schedule Visit']));
  const [visitTime, setVisitTime] = useState('Tomorrow, 10:00 AM – 12:00 PM');
  const [msgText, setMsgText] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggleType = (t: string) => { const s = new Set(types); s.has(t) ? s.delete(t) : s.add(t); setTypes(s); };
  const preferredVisitTime = visitTime.startsWith('Tomorrow') ? 'tomorrow_morning' : visitTime.startsWith('This Weekend') ? 'this_weekend_afternoon' : 'custom';
  const interestType = types.has('Schedule Visit') ? 'schedule_visit' : types.has('Price Negotiation') ? 'price_negotiation' : 'more_details';
  const valid = !!name && phone.length === 10 && agreed && !!authToken && !!propertyId;
  const submit = async () => {
    if (!valid || !authToken) return;
    setLoading(true);
    setError(null);
    try {
      const enquiry = await createBuyEnquiry(authToken, {
        propertyId,
        enquiryTypes: Array.from(types),
        preferredContact: contact.toLowerCase() as 'phone' | 'whatsapp' | 'email',
        interestType,
        preferredVisitTime,
        preferredVisitTimeSlot: visitTime,
        additionalMessage: msgText.trim() || null,
      });
      completeTo('enquirySuccess', { p, propertyId, enquiry });
    } catch {
      setError('Could not submit enquiry. Please check the details and try again.');
    } finally {
      setLoading(false);
    }
  };
  return (
    <Screen>
      <TopBar onBack={back} title="Submit Enquiry" />
      {loadingProperty && <LoadingBlock label="Loading property context..." />}
      {propertyError && <ErrorCard message={propertyError} onRetry={reload} />}
      {error && <ErrorCard message={error} />}
      {!authToken && <ErrorCard message="Please sign in again before submitting an enquiry." />}
      <PageBody className="gap-5">
        <View className="bg-brand-50 rounded-card p-3 flex-row gap-3">
          <PhotoPlaceholder tag={p.id} width={60} height={60} className="rounded-md" />
          <View className="flex-1">
            <Text className="text-[13px] font-semibold" numberOfLines={1}>{p.title}</Text>
            <Text className="text-[12px] text-brand-600 font-medium">{formatINR(p.price)} · {p.bhk > 0 ? `${p.bhk} BHK` : 'Plot'}</Text>
            <Text className="text-[11px] text-ink-500">Ref ID: BG-{p.id.toUpperCase()}</Text>
          </View>
        </View>
        <View>
          <Text className="text-[14px] font-semibold mb-3">Your Details</Text>
          <View className="gap-3">
            <Field label="Full Name" required><Input icon="user" value={name} onChangeText={setName} /></Field>
            <Field label="Mobile" required><Input icon="phone" prefix="+91" value={phone} onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))} /></Field>
            <View>
              <Text className="text-[13px] font-medium text-ink-700 mb-2">Preferred Contact</Text>
              <View className="flex-row gap-2">
                {['Phone', 'WhatsApp', 'Email'].map((m) => (
                  <Pressable key={m} onPress={() => setContact(m)} className={`flex-1 min-h-10 py-2 rounded-card items-center justify-center ${contact === m ? 'bg-brand-600' : 'bg-ink-100'}`}>
                    <Text className={`text-[12px] font-medium ${contact === m ? 'text-white' : 'text-ink-700'}`}>{m}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        </View>
        <View>
          <Text className="text-[14px] font-semibold mb-3">I'm interested in</Text>
          <View className="flex-row flex-wrap gap-2 mb-3">
            {['Schedule Visit', 'Price Negotiation', 'More Details'].map((t) => (
              <Pressable key={t} onPress={() => toggleType(t)} className={`px-3 py-2 rounded-full ${types.has(t) ? 'bg-brand-600' : 'bg-ink-100'}`}>
                <Text className={`text-[12px] font-medium ${types.has(t) ? 'text-white' : 'text-ink-700'}`}>{t}</Text>
              </Pressable>
            ))}
          </View>
          {types.has('Schedule Visit') && (
            <View className="gap-2">
              {['Tomorrow, 10:00 AM – 12:00 PM', 'This Weekend, 2:00 PM – 5:00 PM', 'Custom Date & Time'].map((opt) => (
                <Pressable
                  key={opt}
                  onPress={() => setVisitTime(opt)}
                  className={`p-3 rounded-card flex-row items-center gap-3 ${visitTime === opt ? 'bg-brand-50 border-2 border-brand-600' : 'bg-ink-50 border border-ink-200'}`}
                >
                  <View className={`w-5 h-5 rounded-full border-2 items-center justify-center ${visitTime === opt ? 'border-brand-600' : 'border-ink-300'}`}>
                    {visitTime === opt && <View className="w-2.5 h-2.5 rounded-full bg-brand-600" />}
                  </View>
                  <Text className="text-[13px] text-ink-800">{opt}</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>
        <Field label="Additional Message (Optional)">
          <Input multiline placeholder="Any specific requirements or questions?" value={msgText} onChangeText={(v) => setMsgText(v.slice(0, 500))} />
        </Field>
        <View>
          <Pressable onPress={() => setAgreed(!agreed)} className="flex-row items-start gap-3 mb-3">
            <View className={`mt-0.5 w-5 h-5 rounded border-2 items-center justify-center ${agreed ? 'bg-brand-600 border-brand-600' : 'border-ink-300'}`}>
              {agreed && <Icon name="check" size={11} color="white" strokeWidth={3} />}
            </View>
            <Text className="text-[12.5px] text-ink-700 leading-relaxed flex-1">I agree to be contacted by Builtglory and the property owner regarding this enquiry</Text>
          </Pressable>
          <View className="flex-row items-center gap-2 p-3 bg-ink-50 rounded-card">
            <Icon name="lock" size={13} color="#64748B" />
            <Text className="text-[11px] text-ink-600 flex-1">Your information is secure and shared only with the property owner.</Text>
          </View>
        </View>
        <Pressable onPress={submit} disabled={!valid || loading} className={`w-full min-h-12 py-3 rounded-xl items-center justify-center flex-row gap-2 ${valid && !loading ? 'bg-brand-600' : 'bg-ink-100'}`}>
          <Text className={`font-semibold text-[15px] ${valid && !loading ? 'text-white' : 'text-ink-400'}`}>{loading ? 'Submitting…' : 'Submit Enquiry'}</Text>
        </Pressable>
      </PageBody>
    </Screen>
  );
}

// ─── B-11 Enquiry Success ────────────────────────────────────
export function EnquirySuccessScreen() {
  const { go, resetTo, ctx } = useNav();
  useFlowCompletionBack();
  const { authToken } = useAppState();
  const enquiry = ctx?.enquiry as BuyEnquiry | undefined;
  const [latest, setLatest] = useState<BuyEnquiry | null>(enquiry ?? null);
  const [error, setError] = useState<string | null>(null);
  const enquiryId = String(enquiry?._id ?? enquiry?.id ?? '');
  useEffect(() => {
    if (!authToken || !enquiryId) return;
    getBuyEnquiry(authToken, enquiryId)
      .then(setLatest)
      .catch(() => setError('Enquiry submitted, but latest tracking details could not be loaded.'));
  }, [authToken, enquiryId]);
  return (
    <Screen fill>
      {error && <View className="mt-4"><ErrorCard message={error} /></View>}
      <View className="flex-1 items-center justify-center px-6">
        <SuccessBurst />
        <Text className="text-[22px] font-bold text-center">Enquiry submitted!</Text>
        <Text className="text-ink-500 mt-2 max-w-[250px] text-[13px] leading-relaxed text-center">
          {latest?.referenceId ? `Reference ${latest.referenceId}. ` : ''}Our advisor will call you within an hour. Track all your enquiries in History.
        </Text>
        <View className="mt-6 p-3 bg-ink-50 rounded-card gap-2 w-full">
          {['Advisor calls within 1 hour', 'Site visit confirmed by SMS', 'Offer & paperwork support'].map((t, idx) => (
            <FadeInView key={t} delay={idx * 90} className="flex-row items-center gap-2"><Icon name="check-circle" size={14} color="#1A6FFF" /><Text className="text-[12.5px]">{t}</Text></FadeInView>
          ))}
        </View>
        <View className="mt-6 flex-row gap-2 w-full">
          <Btn variant="outline" size="sm" className="flex-1" onPress={() => resetTo('home')}>Home</Btn>
          <Btn
            variant="outline"
            size="sm"
            className="flex-1"
            onPress={() => go('propertyDetail', { p: ctx?.p, propertyId: ctx?.propertyId })}
          >
            View Property
          </Btn>
          <Btn size="sm" className="flex-1" onPress={() => go('visitCalendar', { p: ctx?.p, propertyId: ctx?.propertyId, enquiry: latest ?? enquiry })}>Schedule Visit</Btn>
        </View>
      </View>
    </Screen>
  );
}

// ─── B-12 Visit Calendar ─────────────────────────────────────
export function VisitCalendarScreen() {
  const layout = useLayout();
  const slotCols = layout.isPhoneSm ? 3 : layout.isTablet ? 6 : 4;
  const slotGap = layout.gap;
  const slotW = gridItemWidth(layout.contentWidth - layout.gutter * 2, slotCols, slotGap);
  const { completeTo, back, ctx } = useNav();
  const { authToken } = useAppState();
  const enquiryResource = useBuyEnquiryResource(ctx);
  const resolvedPropertyId = String(ctx?.propertyId || propertyIdFromEnquiry(enquiryResource.enquiry) || '').trim();
  const propertyCtx = { ...ctx, propertyId: resolvedPropertyId, enquiry: enquiryResource.enquiry, enquiryId: enquiryResource.enquiryId };
  const { property: p, propertyId, loading, error, reload } = usePropertyDetailFromContext(propertyCtx);
  const enquiry = enquiryResource.enquiry;
  const dateOptions = useMemo(() => nextDateOptions(14), []);
  const [visitDate, setVisitDate] = useState(dateOptions[1]?.iso ?? dateOptions[0]?.iso ?? '');
  const [slot, setSlot] = useState('11:00 AM');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const slots = ['9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM'];
  const availability = useVisitAvailability({ authToken, propertyId, visitType: 'physical', from: dateOptions[0]?.iso, days: dateOptions.length });
  const slotOptions = availability.slotsForDate(visitDate, slots);
  const selectedSlotAvailable = slotOptions.some((item) => item.time === slot && item.available);
  const selectedDateLabel = dateOptions.find((date) => date.iso === visitDate)?.fullLabel ?? visitDate;
  useEffect(() => {
    if (availability.loading) return;
    const firstAvailable = slotOptions.find((item) => item.available)?.time;
    if (firstAvailable && !selectedSlotAvailable) setSlot(firstAvailable);
  }, [availability.loading, selectedSlotAvailable, slotOptions]);
  const submitVisit = async () => {
    if (!authToken || !propertyId) {
      setSubmitError('Please sign in again to schedule a visit.');
      return;
    }
    if (!selectedSlotAvailable) {
      setSubmitError('Please choose an available visit slot.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const visit = await createVisit(authToken, {
        propertyId,
        enquiryId: String(enquiryResource.enquiryId || enquiry?._id || enquiry?.id || '') || undefined,
        visitDate,
        visitTime: slot,
        visitType: 'physical',
      });
      completeTo('visitConfirmation', { date: selectedDateLabel, slot, p, propertyId, enquiry, visit });
    } catch {
      setSubmitError('Could not schedule this visit. Please try another slot.');
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Screen refreshing={enquiryResource.refreshing} onRefresh={enquiryResource.refresh}>
      <TopBar onBack={back} title="Schedule a visit" sub="Upcoming dates" />
      {enquiryResource.loading && <LoadingBlock label="Loading enquiry context..." />}
      {enquiryResource.offline && <ErrorCard message="You appear to be offline. Pull to refresh when your connection returns." onRetry={enquiryResource.reload} />}
      {enquiryResource.error && <ErrorCard message={enquiryResource.error} onRetry={enquiryResource.reload} />}
      {loading && <LoadingBlock label="Loading property context..." />}
      {error && <ErrorCard message={error} onRetry={reload} />}
      {submitError && <ErrorCard message={submitError} />}
      <PageBody>
        {availability.loading && <View className="mb-4"><LoadingBlock label="Checking live visit slots..." /></View>}
        {availability.error && <View className="mb-4"><ErrorCard message={availability.error} onRetry={availability.reload} /></View>}
        {availability.availability && (
          <View className="p-3 rounded-card bg-emerald-50 border border-emerald-200 mb-4 flex-row gap-2">
            <Icon name="check-circle" size={14} color="#059669" />
            <Text className="text-[12px] text-emerald-800 flex-1">Live slot availability loaded for this property. Booked times are disabled.</Text>
          </View>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {dateOptions.map((date) => {
            const selected = date.iso === visitDate;
            return (
              <Pressable key={date.iso} onPress={() => setVisitDate(date.iso)} className={`px-3 py-2 rounded-card border min-w-[76px] items-center ${selected ? 'border-brand-600 bg-brand-50' : 'border-ink-200 bg-white'}`}>
                <Text className={`text-[11px] ${selected ? 'text-brand-700 font-semibold' : 'text-ink-500'}`}>{date.weekday}</Text>
                <Text className={`text-[13px] ${selected ? 'text-brand-700 font-bold' : 'text-ink-800'}`}>{date.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Text className="text-[14px] font-semibold mt-5 mb-2">Available time slots</Text>
        <View className="flex-row flex-wrap" style={{ gap: slotGap }}>
          {slotOptions.map((s) => (
            <Pressable
              key={s.time}
              disabled={!s.available}
              onPress={() => setSlot(s.time)}
              style={{ width: slotW }}
              className={`py-2.5 rounded-card border items-center min-h-[44px] justify-center ${slot === s.time ? 'border-brand-600 bg-brand-50' : s.available ? 'border-ink-200' : 'border-ink-100 bg-ink-50'}`}
            >
              <Text className={`text-[11.5px] ${slot === s.time ? 'text-brand-700 font-semibold' : s.available ? '' : 'text-ink-300 line-through'}`}>{s.time}</Text>
            </Pressable>
          ))}
        </View>
        <View className="mt-4 p-3 bg-ink-50 rounded-card flex-row items-center gap-2">
          <Icon name="calendar" size={14} color="#1A6FFF" />
          <Text className="text-[12px] flex-1">Visit request for <Text className="font-bold">{selectedDateLabel} at {slot}</Text></Text>
        </View>
        <Btn className="w-full mt-4" disabled={submitting || availability.loading || !!availability.error || !selectedSlotAvailable} onPress={submitVisit}>{submitting ? 'Scheduling...' : 'Confirm visit'}</Btn>
      </PageBody>
    </Screen>
  );
}

// ─── B-13 Visit Confirmation ─────────────────────────────────
export function VisitConfirmationScreen() {
  const { go, resetTo, ctx } = useNav();
  useFlowCompletionBack();
  const p: DisplayProperty = ctx?.p || EMPTY_PROPERTY;
  const visit = ctx?.visit as CustomerVisit | undefined;
  const isNRI = ctx?.isNRI || false;
  const coords = propertyCoordinates(p);
  const directionsQuery = coords ? `${coords.latitude},${coords.longitude}` : [p.location, p.city].filter(Boolean).join(' ');
  return (
    <Screen>
      <PageBody className="pt-8 items-center">
        <SuccessBurst icon="calendar-check" color="#1A6FFF" bgClassName="bg-brand-50" />
        <Text className="text-[22px] font-bold">Visit confirmed!</Text>
        <Text className="text-ink-500 mt-2 text-[13px]">We've added it to your calendar.</Text>
      </PageBody>
      <PageBody className="mt-6">
        <View className="rounded-card border border-ink-200 overflow-hidden mb-4">
          <View className="bg-brand-600 px-4 py-3">
            <Text className="text-[11px] uppercase tracking-wider text-white/80">Your visit</Text>
            <Text className="text-[18px] font-bold text-white mt-1">{ctx?.date || (visit?.visitDate ? displayDate(new Date(visit.visitDate)) : 'Visit date pending')}</Text>
            <Text className="text-[13px] text-white">{ctx?.slot || '11:00 AM'}</Text>
          </View>
          <View className="p-4 gap-3">
            <View className="flex-row gap-3">
              <PhotoPlaceholder tag={p.id} width={60} height={60} className="rounded-md" />
              <View className="flex-1">
                <Text className="text-[13px] font-semibold" numberOfLines={1}>{p.title}</Text>
                <Text className="text-[11px] text-ink-500">{p.location}, {p.city}</Text>
                <Text className="text-[12px] font-bold text-brand-600 mt-0.5">{formatINR(p.price)}</Text>
              </View>
            </View>
            <View className="pt-2 border-t border-ink-100">
              <View><Text className="text-[10px] text-ink-500">Reference</Text><Text className="text-[12px] font-semibold">{visit?.referenceId ?? 'Pending'}</Text></View>
            </View>
          </View>
        </View>
        {isNRI && (
          <View className="rounded-card border border-blue-200 bg-blue-50 p-4 mb-4">
            <View className="flex-row items-start gap-3">
              <View className="w-10 h-10 rounded-full bg-blue-600 items-center justify-center"><Icon name="video" size={16} color="white" /></View>
              <View className="flex-1">
                <Text className="text-[13px] font-semibold text-blue-900">Video Call Available</Text>
                <Text className="text-[12px] text-blue-700 mt-0.5">Schedule a live video tour with our advisor before visiting in person.</Text>
              </View>
            </View>
            <Pressable onPress={() => go('nriVideoCall', { p, propertyId: ctx?.propertyId, enquiry: ctx?.enquiry, date: ctx?.date, slot: ctx?.slot })} className="w-full mt-3 h-10 rounded-card bg-blue-600 items-center justify-center flex-row gap-2">
              <Icon name="video" size={14} color="white" /><Text className="text-white font-semibold text-[13px]">Schedule Video Call</Text>
            </Pressable>
          </View>
        )}
        <View className="flex-row gap-2 mb-3">
          <Btn variant="outline" className="flex-1" icon="map-pin" onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(directionsQuery || 'Builtglory')}`)}>Directions</Btn>
          <Btn variant="outline" className="flex-1" icon="calendar" onPress={() => go('rescheduleVisit', { p, propertyId: ctx?.propertyId, visit, date: ctx?.date, slot: ctx?.slot })}>Reschedule</Btn>
        </View>
        <Btn className="w-full" onPress={() => resetTo('home')}>Done</Btn>
      </PageBody>
    </Screen>
  );
}

// ─── B-13a NRI Video Call Scheduling ────────────────────────
export function NRIVideoCallScreen() {
  const { completeTo, back, ctx } = useNav();
  const { authToken } = useAppState();
  const p: DisplayProperty = ctx?.p || EMPTY_PROPERTY;
  const propertyId = ctx?.propertyId || propertyIdOf(p);
  const enquiry = ctx?.enquiry as BuyEnquiry | undefined;
  const dates = useMemo(() => nextDateOptions(5), []);
  const [selectedDate, setSelectedDate] = useState(dates[0]?.iso ?? '');
  const [selectedSlot, setSelectedSlot] = useState('');
  const [language, setLanguage] = useState('english');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slots = ['9:00 AM', '10:30 AM', '2:00 PM', '4:30 PM', '6:00 PM'];
  const availability = useVisitAvailability({ authToken, propertyId, visitType: 'virtual', from: dates[0]?.iso, days: dates.length });
  const slotOptions = availability.slotsForDate(selectedDate, slots);
  const selectedSlotAvailable = slotOptions.some((item) => item.time === selectedSlot && item.available);
  useEffect(() => {
    if (availability.loading) return;
    const firstAvailable = slotOptions.find((item) => item.available)?.time;
    if (firstAvailable && !selectedSlotAvailable) setSelectedSlot(firstAvailable);
  }, [availability.loading, selectedSlotAvailable, slotOptions]);
  const scheduleVideoVisit = async () => {
    if (!authToken || !propertyId || !selectedDate || !selectedSlot || !selectedSlotAvailable) return;
    setSubmitting(true);
    setError(null);
    try {
      const visit = await createVisit(authToken, {
        propertyId,
        enquiryId: String(enquiry?._id ?? enquiry?.id ?? '') || undefined,
        visitDate: selectedDate,
        visitTime: selectedSlot,
        visitType: 'virtual',
        virtualPlatform: 'whatsapp_video',
      });
      completeTo('nriVideoConfirm', { p, propertyId, enquiry, visit, date: dates.find((date) => date.iso === selectedDate)?.fullLabel ?? selectedDate, slot: selectedSlot, language });
    } catch {
      setError('Could not schedule the video visit.');
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Screen padBottom>
      <TopBar onBack={back} title="Schedule Video Call" sub="NRI Property Tour" />
      {error && <ErrorCard message={error} />}
      <PageBody>
        <View className="rounded-card border border-ink-200 p-3 mb-4 flex-row gap-3">
          <PhotoPlaceholder tag={p.id} width={56} height={56} className="rounded-md" />
          <View className="flex-1">
            <Text className="text-[13px] font-semibold" numberOfLines={1}>{p.title}</Text>
            <Text className="text-[11px] text-ink-500" numberOfLines={1}>{p.location}</Text>
            <Text className="text-[12px] font-bold text-brand-600">{formatINR(p.price)}</Text>
          </View>
        </View>
        {availability.loading && <View className="mb-4"><LoadingBlock label="Checking live video slots..." /></View>}
        {availability.error && <View className="mb-4"><ErrorCard message={availability.error} onRetry={availability.reload} /></View>}
        {availability.availability && (
          <View className="p-3 rounded-card bg-emerald-50 border border-emerald-200 mb-4 flex-row gap-2">
            <Icon name="check-circle" size={14} color="#059669" />
            <Text className="text-[12px] text-emerald-800 flex-1">Live video slot availability loaded. Booked times are disabled.</Text>
          </View>
        )}
        <Text className="text-[13px] font-semibold text-ink-900 mb-2">Preferred Language</Text>
        <View className="flex-row flex-wrap mb-4" style={{ gap: 8 }}>
          {[['english', 'English'], ['tamil', 'Tamil'], ['hindi', 'Hindi'], ['kannada', 'Kannada']].map(([code, name]) => (
            <Pressable key={code} onPress={() => setLanguage(code)} className={`min-w-[46%] flex-1 py-2.5 rounded-card border items-center min-h-[44px] justify-center ${language === code ? 'border-brand-600 bg-brand-50' : 'border-ink-200'}`}>
              <Text className={`text-[12px] font-medium ${language === code ? 'text-brand-700' : ''}`}>{name}</Text>
            </Pressable>
          ))}
        </View>
        <Text className="text-[13px] font-semibold text-ink-900 mb-2">Select Date</Text>
        <View className="flex-row flex-wrap mb-4" style={{ gap: 8 }}>
          {dates.map((d) => (
            <Pressable key={d.iso} onPress={() => setSelectedDate(d.iso)} className={`min-w-[30%] flex-1 py-2 rounded-card border items-center min-h-[44px] justify-center ${selectedDate === d.iso ? 'border-brand-600 bg-brand-50' : 'border-ink-200'}`}>
              <Text className={`text-[12px] font-medium ${selectedDate === d.iso ? 'text-brand-700' : ''}`}>{d.label}</Text>
            </Pressable>
          ))}
        </View>
        <Text className="text-[13px] font-semibold text-ink-900 mb-2">Select Time (IST)</Text>
        <View className="gap-2 mb-6">
          {slotOptions.map((s) => (
            <Pressable
              key={s.time}
              disabled={!s.available}
              onPress={() => setSelectedSlot(s.time)}
              className={`p-3 rounded-card border ${selectedSlot === s.time ? 'border-brand-600 bg-brand-50' : s.available ? 'border-ink-200' : 'border-ink-100 bg-ink-50'}`}
            >
              <Text className={`text-[13px] font-medium ${selectedSlot === s.time ? 'text-brand-700' : s.available ? '' : 'text-ink-300 line-through'}`}>{s.time}</Text>
            </Pressable>
          ))}
        </View>
      </PageBody>
      <Btn
        className="mx-4"
        disabled={!selectedDate || !selectedSlotAvailable || submitting || availability.loading || !!availability.error}
        onPress={scheduleVideoVisit}
      >
        {submitting ? 'Scheduling...' : 'Schedule Video Call'}
      </Btn>
    </Screen>
  );
}

// ─── B-13b NRI Video Call Confirmation ───────────────────────
export function NRIVideoCallConfirmScreen() {
  const { openFromTabRoot, resetTo, ctx } = useNav();
  useFlowCompletionBack();
  const p: Property = ctx?.p || EMPTY_PROPERTY;
  const visit = ctx?.visit as CustomerVisit | undefined;
  return (
    <Screen fill>
      <View className="flex-1 items-center justify-center px-6">
        <SuccessBurst icon="video" color="#2563EB" bgClassName="bg-blue-50" />
        <Text className="text-[22px] font-bold text-center">Video call scheduled!</Text>
        <Text className="text-ink-500 mt-2 max-w-[280px] text-[13px] leading-relaxed text-center">
          Your NRI property tour is confirmed. Our advisor will call you at the scheduled time.
        </Text>
        <View className="mt-6 rounded-card border border-ink-200 p-4 gap-3 w-full">
          <View><Text className="text-[11px] text-ink-500">Property</Text><Text className="text-[13px] font-semibold">{p.title}</Text></View>
          {!!visit?.referenceId && <View><Text className="text-[11px] text-ink-500">Reference</Text><Text className="text-[13px] font-semibold">{visit.referenceId}</Text></View>}
          <View className="flex-row gap-4">
            <View className="flex-1"><Text className="text-[11px] text-ink-500">Date</Text><Text className="text-[13px] font-semibold">{ctx?.date}</Text></View>
            <View className="flex-1"><Text className="text-[11px] text-ink-500">Time (IST)</Text><Text className="text-[13px] font-semibold">{ctx?.slot}</Text></View>
          </View>
        </View>
        <View className="mt-6 flex-row gap-2 w-full">
          <Btn variant="outline" className="flex-1" onPress={() => openFromTabRoot('myVisits')}>My Visits</Btn>
          <Btn className="flex-1" onPress={() => resetTo('home')}>Home</Btn>
        </View>
      </View>
    </Screen>
  );
}

// ─── B-14 Favorites ──────────────────────────────────────────
export function FavoritesScreen() {
  const { go, back } = useNav();
  const { authToken, fav, getCachedValue, setCachedValue, loadFavoriteIds, toggleRemoteFavorite } = useAppState();
  const [list, setList] = useState<DisplayProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadFavorites = useCallback(async (force = false) => {
    if (!authToken) {
      setList([]);
      setLoading(false);
      setRefreshing(false);
      setError('Please sign in again to load saved properties.');
      return;
    }
    const cacheKey = `${FAVORITES_LIST_CACHE_PREFIX}:${authToken}`;
    const cached = getCachedValue<DisplayProperty[]>(cacheKey);
    if (cached && !force) {
      setList(cached);
      setLoading(false);
      setError(null);
      loadFavoriteIds().catch(() => new Set<string>());
      return;
    }
    if (force) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const properties = await getFavoriteProperties(authToken);
      await loadFavoriteIds().catch(() => new Set<string>());
      const nextList = properties.map(toDisplayProperty).filter((property) => property.id);
      setList(nextList);
      setCachedValue(cacheKey, nextList);
    } catch {
      setList([]);
      setError('Could not load saved properties.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authToken, getCachedValue, loadFavoriteIds, setCachedValue]);
  const removeFavorite = useCallback(async (id: string) => {
    try {
      await toggleRemoteFavorite(id);
      setList((current) => {
        const next = current.filter((property) => property.id !== id);
        if (authToken) setCachedValue(`${FAVORITES_LIST_CACHE_PREFIX}:${authToken}`, next);
        return next;
      });
    } catch {
      setError('Could not remove saved property.');
    }
  }, [authToken, setCachedValue, toggleRemoteFavorite]);
  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);
  return (
    <Screen refreshing={refreshing} onRefresh={() => loadFavorites(true)}>
      <TopBar onBack={back} title="Favorites" sub={`${list.length} saved`} />
      {error && <ErrorCard message={error} onRetry={loadFavorites} />}
      <PageBody>
        {loading ? (
          <LoadingBlock label="Loading saved properties..." />
        ) : list.length === 0 ? (
          <EmptyState icon="heart" title="No favorites yet" action="Browse properties" onPress={() => go('buyTypes')} />
        ) : (
          <View className="gap-3">
            {list.map((p, idx) => (
              <FadeInView key={p.id} delay={idx * 35}>
                <PropertyCard p={p} variant="compact" fav={fav.has(p.id)} onFav={() => removeFavorite(p.id)} onPress={() => go('propertyDetail', { p, propertyId: p.id })} />
              </FadeInView>
            ))}
          </View>
        )}
      </PageBody>
    </Screen>
  );
}

// ─── B-15 Comparison ─────────────────────────────────────────
const MAX_COMPARE = 3;

function compareValue(property: DisplayProperty | null, key: string) {
  if (!property) return '—';
  const specs = property.backend?.specs;
  switch (key) {
    case 'Price': return property.price ? formatINR(property.price) : '—';
    case 'Type': return formatPropertyTypeLabel(property.type);
    case 'Location': return [property.location, property.city].filter(Boolean).join(', ') || '—';
    case 'Area': return property.area ? `${property.area.toLocaleString('en-IN')} sqft` : '—';
    case 'Bedrooms': return specs?.bhk || property.bhk || '—';
    case 'Bathrooms': return specs?.bathrooms || specs?.washrooms || '—';
    case 'Floor': return specs?.floor || property.floor || '—';
    case 'Facing': return specs?.facing || '—';
    case 'Furnishing': return specs?.furnishing || '—';
    case 'Parking': return specs?.parking || '—';
    case 'Amenities': return propertyAmenityLabels(property.backend, property.amenities).join(', ') || '—';
    default: return '—';
  }
}

export function CompareScreen() {
  const { back, ctx } = useNav();
  const layout = useLayout();
  const { property: seed, loading, error, reload } = usePropertyDetailFromContext(ctx);
  const [items, setItems] = useState<DisplayProperty[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerResults, setPickerResults] = useState<DisplayProperty[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  useEffect(() => {
    if (!seed.id) return;
    setItems((current) => {
      const index = current.findIndex((item) => item.id === seed.id);
      if (index === -1) return [seed, ...current];
      const next = [...current];
      next[index] = seed;
      return next;
    });
  }, [seed]);
  const openPropertyImages = useCallback((property: DisplayProperty, startIndex = 0) => {
    if (!property.images.length) return;
    setViewerImages(property.images);
    setViewerIndex(Math.min(startIndex, property.images.length - 1));
    setViewerOpen(true);
  }, []);
  const addProperty = useCallback((property: DisplayProperty) => {
    setItems((current) => {
      if (current.some((item) => item.id === property.id)) return current;
      if (current.length >= MAX_COMPARE) return current;
      return [...current, property];
    });
    setPickerOpen(false);
    setPickerQuery('');
  }, []);
  const removeProperty = useCallback((id: string) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);
  useEffect(() => {
    if (!pickerOpen) return;
    let cancelled = false;
    setPickerLoading(true);
    setPickerError(null);
    const timer = setTimeout(async () => {
      try {
        const properties = await listCustomerProperties({
          search: pickerQuery.trim() || undefined,
          limit: 20,
          sort: 'newest',
        });
        if (cancelled) return;
        const selected = new Set(items.map((item) => item.id));
        setPickerResults(properties.map(toDisplayProperty).filter((property) => property.id && !selected.has(property.id)));
      } catch {
        if (!cancelled) {
          setPickerResults([]);
          setPickerError('Could not load properties to compare.');
        }
      } finally {
        if (!cancelled) setPickerLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [items, pickerOpen, pickerQuery]);
  const compareKeys = ['Price', 'Type', 'Location', 'Area', 'Bedrooms', 'Bathrooms', 'Floor', 'Facing', 'Furnishing', 'Parking', 'Amenities'];
  const columns = items.length ? items : [null];
  return (
    <Screen>
      <TopBar
        onBack={back}
        title="Compare properties"
        right={items.length < MAX_COMPARE ? (
          <Pressable onPress={() => setPickerOpen(true)}><Text className="text-brand-600 text-sm font-semibold">Add</Text></Pressable>
        ) : undefined}
      />
      {loading && <LoadingBlock label="Loading comparison..." />}
      {error && <ErrorCard message={error} onRetry={reload} />}
      <PageBody>
        {!items.length && !loading && (
          <EmptyBlock title="Add at least one more property to compare." action="Add property" onPress={() => setPickerOpen(true)} />
        )}
        {items.length > 0 && (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
              {items.map((p) => (
                <View key={p.id} style={{ width: Math.max(140, (layout.contentWidth - layout.gutter * 2 - 16) / Math.min(items.length, 2)) }} className="rounded-card border border-ink-200 overflow-hidden">
                  <Pressable onPress={() => openPropertyImages(p)} accessibilityRole="imagebutton" accessibilityLabel={`Open images for ${p.title}`}>
                    <PhotoPlaceholder tag={p.id} height={90}>
                      {p.images[0] && <Image source={{ uri: p.images[0] }} className="absolute inset-0 w-full h-full" resizeMode="cover" />}
                    </PhotoPlaceholder>
                  </Pressable>
                  <View className="p-2">
                    <Text className="text-[11px] font-semibold" numberOfLines={2}>{p.title}</Text>
                    <Text className="text-[10px] text-ink-500" numberOfLines={1}>{p.location}</Text>
                    {items.length > 1 && (
                      <Pressable onPress={() => removeProperty(p.id)} className="mt-2">
                        <Text className="text-[11px] font-semibold text-rose-600">Remove</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              ))}
              {items.length < MAX_COMPARE && (
                <Pressable onPress={() => setPickerOpen(true)} style={{ width: 120 }} className="h-[148px] rounded-card border border-dashed border-ink-300 items-center justify-center">
                  <Icon name="plus" size={22} color="#1A6FFF" />
                  <Text className="text-[11px] font-semibold text-brand-600 mt-2">Add property</Text>
                </Pressable>
              )}
            </ScrollView>
            <View className="rounded-card border border-ink-200 overflow-hidden mt-2">
              {compareKeys.map((key, i) => (
                <View key={key} className={`flex-row ${i % 2 ? 'bg-ink-50' : ''}`}>
                  <View className="px-2 py-2.5 shrink-0" style={{ width: layout.isPhoneSm ? 72 : 88, minWidth: 64 }}>
                    <Text className="text-[11px] text-ink-500 font-medium" numberOfLines={2}>{key}</Text>
                  </View>
                  {columns.map((property, index) => (
                    <View key={`${key}-${property?.id ?? index}`} className="flex-1 min-w-0 px-2 py-2.5 border-l border-ink-200">
                      <Text className="text-[12px] font-semibold" numberOfLines={3}>{compareValue(property, key)}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </>
        )}
      </PageBody>
      {pickerOpen && (
        <Sheet title="Add a property" onClose={() => setPickerOpen(false)}>
          <Input icon="search" placeholder="Search live listings" value={pickerQuery} onChangeText={setPickerQuery} />
          {pickerLoading && <LoadingBlock label="Searching properties..." />}
          {pickerError && <ErrorCard message={pickerError} />}
          {!pickerLoading && !pickerResults.length && <EmptyBlock title="No matching properties found." />}
          <View className="gap-2 mt-3">
            {pickerResults.map((property) => (
              <Pressable key={property.id} onPress={() => addProperty(property)} className="p-3 rounded-card border border-ink-200">
                <Text className="text-[13px] font-semibold" numberOfLines={1}>{property.title}</Text>
                <Text className="text-[11px] text-ink-500" numberOfLines={1}>{property.location} · {formatINR(property.price)}</Text>
              </Pressable>
            ))}
          </View>
        </Sheet>
      )}
      <PropertyImageViewer
        images={viewerImages}
        visible={viewerOpen}
        imageIndex={viewerIndex}
        onClose={() => setViewerOpen(false)}
        onImageIndexChange={setViewerIndex}
      />
    </Screen>
  );
}

// ─── B-16 Advanced Filters ───────────────────────────────────
export function AdvancedFiltersScreen() {
  const { back, go } = useNav();
  const sections = [
    { title: 'Property type', options: ['Apartment', 'Villa', 'Plot', 'Commercial', 'Studio'] },
    { title: 'Furnishing', options: ['Unfurnished', 'Semi-furnished', 'Fully furnished'] },
    { title: 'Facing', options: ['East', 'West', 'North', 'South', 'NE', 'NW', 'SE', 'SW'] },
    { title: 'Construction status', options: ['Ready to move', 'Under construction', 'New launch'] },
    { title: 'Age of property', options: ['< 1 yr', '1–5 yr', '5–10 yr', '10+ yr'] },
    { title: 'Posted by', options: ['Owner', 'Builder', 'Dealer'] },
  ];
  const [sel, setSel] = useState<Record<string, Set<string>>>({});
  const [amenities, setAmenities] = useState<Set<string>>(new Set());
  const [previewCount, setPreviewCount] = useState(0);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const toggle = (t: string, o: string) => {
    const s = new Set(sel[t] || []);
    s.has(o) ? s.delete(o) : s.add(o);
    const next = { ...sel, [t]: s };
    if (s.size === 0) delete next[t];
    setSel(next);
  };
  const toggleAmenity = (label: string) => {
    const s = new Set(amenities);
    s.has(label) ? s.delete(label) : s.add(label);
    setAmenities(s);
  };
  const reset = () => {
    setSel({});
    setAmenities(new Set());
  };
  const propertyType = Array.from(sel['Property type'] || [])[0]?.toLowerCase();
  const csvFilter = (key: string) => Array.from(sel[key] || []).join(',') || undefined;
  const backendFilters = useMemo(() => ({
    type: propertyType === 'studio' ? 'apartment' : propertyType,
    furnishing: csvFilter('Furnishing'),
    facing: csvFilter('Facing'),
    constructionStatus: csvFilter('Construction status'),
    propertyAge: csvFilter('Age of property'),
    postedBy: csvFilter('Posted by'),
    amenities: Array.from(amenities).join(',') || undefined,
    verified: true,
    sort: 'newest' as const,
    limit: 50,
  }), [amenities, propertyType, sel]);
  useEffect(() => {
    let cancelled = false;
    setChecking(true);
    setError(null);
    const timer = setTimeout(async () => {
      try {
        const properties = await listCustomerProperties(backendFilters);
        if (!cancelled) setPreviewCount(properties.length);
      } catch {
        if (!cancelled) {
          setPreviewCount(0);
          setError('Could not preview matching properties.');
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [backendFilters]);
  return (
    <Screen padBottom>
      <TopBar onBack={back} title="Advanced filters" right={<Pressable onPress={reset}><Text className="text-brand-600 text-sm font-semibold">Reset</Text></Pressable>} />
      <PageBody className="gap-5">
        {!!error && <ErrorCard message={error} />}
        {sections.map((sec) => (
          <View key={sec.title}>
            <Text className="text-[13px] font-semibold mb-2">{sec.title}</Text>
            <View className="flex-row flex-wrap gap-2">
              {sec.options.map((o) => <Chip key={o} active={sel[sec.title]?.has(o)} onPress={() => toggle(sec.title, o)}>{o}</Chip>)}
            </View>
          </View>
        ))}
        <View>
          <Text className="text-[13px] font-semibold mb-2">Amenities</Text>
          <View className="flex-row flex-wrap gap-2">
            {SPECS.slice(0, 12).map((s) => <Chip key={s.label} active={amenities.has(s.label)} icon={s.icon} onPress={() => toggleAmenity(s.label)}>{s.label}</Chip>)}
          </View>
        </View>
      </PageBody>
      <PageBody className="mt-4 flex-row gap-2">
        <Btn variant="outline" className="flex-1" onPress={reset}>Clear</Btn>
        <Btn className="flex-1" disabled={checking} onPress={() => go('buyList', { type: backendFilters.type, filters: backendFilters, amenities: Array.from(amenities) })}>
          {checking ? 'Checking...' : `Apply (${previewCount})`}
        </Btn>
      </PageBody>
    </Screen>
  );
}

// ─── B-17 Map View ───────────────────────────────────────────
type PropertyMapPin = { id: string; latitude: number; longitude: number; p: DisplayProperty };

function regionForPins(pins: PropertyMapPin[], activeId?: string): Region | undefined {
  if (pins.length === 0) return undefined;
  const activePin = pins.find((pin) => pin.id === activeId) ?? pins[0];
  const latitudes = pins.map((pin) => pin.latitude);
  const longitudes = pins.map((pin) => pin.longitude);
  const latitudeDelta = Math.max(0.01, (Math.max(...latitudes) - Math.min(...latitudes)) * 1.6);
  const longitudeDelta = Math.max(0.01, (Math.max(...longitudes) - Math.min(...longitudes)) * 1.6);

  return {
    latitude: activePin.latitude,
    longitude: activePin.longitude,
    latitudeDelta,
    longitudeDelta,
  };
}

export function MapViewScreen() {
  const { go, back, ctx } = useNav();
  const { fav, loadFavoriteIds, toggleRemoteFavorite } = useAppState();
  const mapRef = useRef<MapView | null>(null);
  const [pins, setPins] = useState<PropertyMapPin[]>([]);
  const [region, setRegion] = useState<Region>();
  const [active, setActive] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useGoogleMapUserLocation();
  const loadMapProperties = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [properties] = await Promise.all([
        listCustomerProperties({ city: ctx?.city, limit: 20, sort: 'newest' }),
        loadFavoriteIds().catch(() => new Set<string>()),
      ]);
      const displayProperties = properties.map(toDisplayProperty).filter((property) => property.id);
      const selected = ctx?.p as DisplayProperty | undefined;
      const withSelected = selected?.id && !displayProperties.some((property) => property.id === selected.id)
        ? [selected, ...displayProperties]
        : displayProperties;
      const geocoded = withSelected
        .map((property) => {
          const coords = propertyCoordinates(property);
          return coords ? { property, ...coords } : null;
        })
        .filter(Boolean) as Array<{ property: DisplayProperty; latitude: number; longitude: number }>;
      const next = geocoded.map(({ property, latitude, longitude }) => ({
        id: property.id,
        latitude,
        longitude,
        p: property,
      }));
      const activeId = selected?.id && next.some((pin) => pin.id === selected.id) ? selected.id : next[0]?.id ?? '';
      const nextRegion = regionForPins(next, activeId);
      setPins(next);
      setActive(activeId);
      setRegion(nextRegion);
      if (nextRegion) mapRef.current?.animateToRegion(nextRegion, 500);
    } catch {
      setPins([]);
      setRegion(undefined);
      setError('Could not load map properties.');
    } finally {
      setLoading(false);
    }
  }, [ctx?.city, ctx?.p, loadFavoriteIds]);
  const ap = pins.find((pin) => pin.id === active)?.p;
  const activePin = pins.find((pin) => pin.id === active);
  const selectPin = useCallback((pin: PropertyMapPin) => {
    setActive(pin.id);
    mapRef.current?.animateToRegion(
      {
        latitude: pin.latitude,
        longitude: pin.longitude,
        latitudeDelta: region?.latitudeDelta ?? 0.01,
        longitudeDelta: region?.longitudeDelta ?? 0.01,
      },
      450,
    );
  }, [region?.latitudeDelta, region?.longitudeDelta]);
  useEffect(() => {
    loadMapProperties();
  }, [loadMapProperties]);
  return (
    <Screen fill>
      <TopBar onBack={back} title="Map view" />
      {error && <ErrorCard message={error} onRetry={loadMapProperties} />}
      <View className="relative bg-ink-100 flex-1">
        {loading && <LoadingBlock label="Loading map properties..." />}
        {!loading && !error && pins.length === 0 && <EmptyBlock title="No properties with map coordinates found" action="Change Filters" onPress={() => go('advancedFilters')} />}
        {!loading && !error && pins.length > 0 && region && (
          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={{ flex: 1 }}
            initialRegion={region}
            onRegionChangeComplete={setRegion}
            showsUserLocation
            showsMyLocationButton
            zoomEnabled
            zoomControlEnabled
            scrollEnabled
            rotateEnabled
          >
            {pins.map((pin) => (
              <Marker
                key={pin.id}
                coordinate={{ latitude: pin.latitude, longitude: pin.longitude }}
                title={pin.p.title}
                description={[pin.p.location, pin.p.city].filter(Boolean).join(', ')}
                onPress={() => selectPin(pin)}
              >
                <View className={`px-2.5 py-1 rounded-full flex-row items-center gap-1 ${active === pin.id ? 'bg-brand-600' : 'bg-white'}`}>
                  <Icon name="map-pin" size={11} color={active === pin.id ? 'white' : '#0F172A'} />
                  <Text className={`text-[11px] font-bold ${active === pin.id ? 'text-white' : 'text-ink-900'}`}>{formatINR(pin.p.price).replace('₹ ', '')}</Text>
                </View>
              </Marker>
            ))}
          </MapView>
        )}
      </View>
      {ap && (
        <View className="p-3 bg-white border-t border-ink-200">
          <Text className="mb-2 text-[11px] text-ink-500">
            Coordinates: {activePin?.latitude.toFixed(5)}, {activePin?.longitude.toFixed(5)}
          </Text>
          {activePin && (
            <Btn
              variant="outline"
              icon="navigation"
              className="mb-2"
              onPress={() => openDirections({ latitude: activePin.latitude, longitude: activePin.longitude }, ap.title).catch(() => setError('Could not open directions.'))}
            >
              Get directions
            </Btn>
          )}
          <PropertyCard p={ap} variant="compact" fav={fav.has(ap.id)} onFav={() => toggleRemoteFavorite(ap.id).catch(() => setError('Could not update saved property.'))} onPress={() => go('propertyDetail', { p: ap, propertyId: ap.id })} />
        </View>
      )}
    </Screen>
  );
}

// ─── B-04a Floor Plan Viewer ─────────────────────────────────
export function FloorPlanScreen() {
  const { back, ctx } = useNav();
  const layout = useLayout();
  const { property: p, loading, error, reload } = usePropertyDetailFromContext(ctx);
  const area = p.area || toNumber(p.backend?.specs?.builtUpArea ?? p.backend?.specs?.carpetArea ?? p.backend?.specs?.plotArea);
  const floorPlans = useMemo(() => propertyFloorPlans(p.backend?.media), [p.backend?.media]);
  const planUrls = useMemo(() => floorPlans.map((plan) => plan.url), [floorPlans]);
  const initialPlanIndex = Math.max(0, Math.min(toNumber(ctx?.planIndex, 0), Math.max(planUrls.length - 1, 0)));
  const [active, setActive] = useState(initialPlanIndex);
  const [viewerOpen, setViewerOpen] = useState(false);
  const { msg, fire } = useToast();
  const activePlan = floorPlans[active];
  const floorPlanUrl = activePlan?.url ?? planUrls[0];
  const planChips = floorPlans.length
    ? floorPlans.map((plan) => plan.label)
    : [`${p.bhk > 0 ? `${p.bhk} BHK` : 'Property'} — ${area || 'Area'} sqft`];
  useEffect(() => {
    setActive(initialPlanIndex);
  }, [initialPlanIndex, p.id]);
  useEffect(() => {
    if (!planUrls.length) {
      setActive(0);
      return;
    }
    setActive((current) => Math.min(current, planUrls.length - 1));
  }, [planUrls.length]);
  return (
    <Screen dark>
      <TopBar
        onBack={back}
        title="Floor Plans"
        dark
        right={
          <Pressable onPress={() => floorPlanUrl ? openExternalUrl(floorPlanUrl).catch(() => fire('Could not open floor plan')) : fire('Floor plan file is not available yet')} className="w-9 h-9 rounded-full bg-white/10 items-center justify-center">
            <Icon name={floorPlanUrl ? 'external-link' : 'download'} size={16} color="white" />
          </Pressable>
        }
      />
      {loading && <LoadingBlock label="Loading floor plans..." />}
      {error && <ErrorCard message={error} onRetry={reload} />}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3" contentContainerStyle={{ gap: 8, paddingHorizontal: layout.gutter }}>
        {planChips.map((label, i) => (
          <Pressable key={`${label}-${i}`} onPress={() => setActive(i)} className={`px-3 py-1.5 rounded-full ${active === i ? 'bg-brand-600' : 'bg-white/10'}`}>
            <Text className={`text-[12px] font-semibold ${active === i ? 'text-white' : 'text-white/70'}`}>{label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <PageBody className="flex-1 items-center justify-center">
        <Pressable
          onPress={() => floorPlanUrl && setViewerOpen(true)}
          disabled={!floorPlanUrl}
          accessibilityRole="imagebutton"
          accessibilityLabel="Open floor plan image"
          className="rounded-card w-full"
        >
          <PhotoPlaceholder tag={'plan' + active + p.id} height={320} className="rounded-card w-full">
            {floorPlanUrl && <Image source={{ uri: floorPlanUrl }} className="absolute inset-0 w-full h-full" resizeMode="contain" />}
            <View className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 items-center justify-center">
              <Icon name="maximize-2" size={16} color="white" />
            </View>
            {floorPlanUrl && (
              <Pressable onPress={() => openExternalUrl(floorPlanUrl).catch(() => fire('Could not open floor plan'))} className="absolute bottom-3 left-3 right-3 h-10 rounded-card bg-white/90 items-center justify-center">
                <Text className="text-[12px] font-semibold text-ink-900">Open original floor plan</Text>
              </Pressable>
            )}
          </PhotoPlaceholder>
        </Pressable>
      </PageBody>
      <PropertyImageViewer
        images={planUrls}
        visible={viewerOpen}
        imageIndex={active}
        onClose={() => setViewerOpen(false)}
        onImageIndexChange={setActive}
      />
      <Toast message={msg} />
    </Screen>
  );
}

// ─── B-12a Reschedule Visit ───────────────────────────────────
export function RescheduleVisitScreen() {
  const layout = useLayout();
  const slotCols = layout.isPhoneSm ? 3 : layout.isTablet ? 6 : 4;
  const slotGap = layout.gap;
  const slotW = gridItemWidth(layout.contentWidth - layout.gutter * 2, slotCols, slotGap);
  const { completeTo, back, ctx } = useNav();
  const { authToken } = useAppState();
  const p: DisplayProperty = ctx?.p || EMPTY_PROPERTY;
  const propertyId = String(ctx?.propertyId || propertyIdOf(p));
  const visit = ctx?.visit as CustomerVisit | undefined;
  const prevDate = ctx?.date || visit?.visitDate || 'Current visit date pending';
  const prevSlot = ctx?.slot || '11:00 AM';
  const dateOptions = useMemo(() => nextDateOptions(14, 2), []);
  const [visitDate, setVisitDate] = useState(dateOptions[0]?.iso ?? '');
  const [slot, setSlot] = useState('2:00 PM');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slots = ['9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM'];
  const availability = useVisitAvailability({ authToken, propertyId, visitType: 'physical', from: dateOptions[0]?.iso, days: dateOptions.length });
  const slotOptions = availability.slotsForDate(visitDate, slots);
  const selectedSlotAvailable = slotOptions.some((item) => item.time === slot && item.available);
  const selectedDateLabel = dateOptions.find((date) => date.iso === visitDate)?.fullLabel ?? visitDate;
  useEffect(() => {
    if (availability.loading) return;
    const firstAvailable = slotOptions.find((item) => item.available)?.time;
    if (firstAvailable && !selectedSlotAvailable) setSlot(firstAvailable);
  }, [availability.loading, selectedSlotAvailable, slotOptions]);
  const confirmReschedule = async () => {
    const visitId = String(visit?._id ?? visit?.id ?? '');
    if (!authToken || !visitId) {
      setError('Visit reference is missing. Please schedule again from the property page.');
      return;
    }
    if (!selectedSlotAvailable) {
      setError('Please choose an available visit slot.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const updatedVisit = await rescheduleVisit(authToken, visitId, {
        visitDate,
        visitTime: slot,
        reason: 'Customer requested a new slot from the app.',
      });
      completeTo('visitConfirmation', { date: selectedDateLabel, slot, p, propertyId, visit: updatedVisit, rescheduled: true });
    } catch {
      setError('Could not reschedule this visit.');
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Screen>
      <TopBar onBack={back} title="Reschedule Visit" />
      {error && <ErrorCard message={error} />}
      <View className="mx-4 mb-4 p-3 rounded-card bg-amber-50 border border-amber-200 flex-row items-start gap-2">
        <Icon name="calendar-x" size={16} color="#D97706" />
        <View>
          <Text className="text-[12px] font-semibold text-amber-800">Current booking</Text>
          <Text className="text-[12px] text-amber-700">{prevDate} · {prevSlot}</Text>
        </View>
      </View>
      <PageBody>
        {availability.loading && <View className="mb-4"><LoadingBlock label="Checking live reschedule slots..." /></View>}
        {availability.error && <View className="mb-4"><ErrorCard message={availability.error} onRetry={availability.reload} /></View>}
        {availability.availability && (
          <View className="p-3 rounded-card bg-emerald-50 border border-emerald-200 mb-4 flex-row gap-2">
            <Icon name="check-circle" size={14} color="#059669" />
            <Text className="text-[12px] text-emerald-800 flex-1">Live reschedule availability loaded. Booked times are disabled.</Text>
          </View>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {dateOptions.map((date) => {
            const isSelected = date.iso === visitDate;
            return (
              <Pressable key={date.iso} onPress={() => setVisitDate(date.iso)} className={`px-3 py-2 rounded-card border min-w-[76px] items-center ${isSelected ? 'border-brand-600 bg-brand-50' : 'border-ink-200 bg-white'}`}>
                <Text className={`text-[11px] ${isSelected ? 'text-brand-700 font-semibold' : 'text-ink-500'}`}>{date.weekday}</Text>
                <Text className={`text-[13px] ${isSelected ? 'text-brand-700 font-bold' : 'text-ink-800'}`}>{date.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Text className="text-[14px] font-semibold mt-5 mb-2">Available time slots</Text>
        <View className="flex-row flex-wrap" style={{ gap: slotGap }}>
          {slotOptions.map((s) => (
            <Pressable
              key={s.time}
              disabled={!s.available}
              onPress={() => setSlot(s.time)}
              style={{ width: slotW }}
              className={`py-2.5 rounded-card border items-center min-h-[44px] justify-center ${slot === s.time ? 'border-brand-600 bg-brand-50' : s.available ? 'border-ink-200' : 'border-ink-100 bg-ink-50'}`}
            >
              <Text className={`text-[11.5px] ${slot === s.time ? 'text-brand-700 font-semibold' : s.available ? '' : 'text-ink-300 line-through'}`}>{s.time}</Text>
            </Pressable>
          ))}
        </View>
        <View className="mt-4 p-3 bg-ink-50 rounded-card flex-row items-center gap-2">
          <Icon name="calendar-check" size={14} color="#1A6FFF" />
          <Text className="text-[12px] flex-1">New visit request: <Text className="font-bold">{selectedDateLabel} at {slot}</Text></Text>
        </View>
        <Btn className="w-full mt-4" disabled={submitting || availability.loading || !!availability.error || !selectedSlotAvailable} onPress={confirmReschedule}>{submitting ? 'Rescheduling...' : 'Confirm Reschedule'}</Btn>
      </PageBody>
    </Screen>
  );
}
