import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Keyboard, KeyboardAvoidingView, Platform, View, Text, Pressable, ScrollView, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { androidInputStyle } from '../setup/androidText';
import * as ImagePicker from 'expo-image-picker';
import Icon from '../components/Icon';
import {
  Screen, TopBar, Field, Input, Chip, Badge, Btn, PhotoPlaceholder, ProgressBar,
  FadeInView, EmptyState, PageBody,
} from '../components/shared';
import { PROPERTY_TYPES, SPECS, formatINR } from '../data/data';
import { useNav } from '../navigation/useNav';
import { PropertyTypeGrid } from './buy';
import { useAppState } from '../state/AppState';
import { SELL_LISTINGS_CACHE_PREFIX } from '../state/primaryTabCache';
import { ChatSocket, createChatSocket } from '../realtime/chatSocket';
import { usePolling } from '../hooks/usePolling';
import { gridItemWidth, useLayout } from '../layout/breakpoints';
import {
  AGE_OPTIONS,
  BHK_OPTIONS,
  SELL_LIMITS,
  clearFieldError,
  digitsOnly,
  firstErrorKey,
  hydrateSellAddress,
  hydrateSellBasic,
  isSectionValid,
  sellFieldVisibility,
  sellSubTypesFor,
  useSellFormScroll,
  validatePhotoAsset,
  validateSellAddress,
  validateSellAmenities,
  validateSellBasic,
  validateSellPhotos,
} from '../utils/sellValidation';
import {
  createCallbackRequest,
  createSellRequestDraft,
  getSellRequest,
  getSellerActivity,
  listCustomerProperties,
  listSellRequests,
  sendSellerMessage,
  SellerActivity,
  SellRequest,
  SellRequestDocument,
  submitSellerVisitAction,
  updateSellRequest,
  uploadCustomerDocument,
} from '../api/customer';
import { isNetworkError, resourceErrorMessage } from '../utils/apiErrors';
import { LocationPickerMap } from '../components/LocationPickerMap';
import { DetectedLocation, distanceMeters, isValidCoordinate } from '../utils/location';

export const sellRequestIdOf = (request?: SellRequest | null) => request?._id ?? request?.id ?? '';
export const ctxSellRequestId = (ctx?: any) =>
  String(
    ctx?.sellRequestId
    ?? ctx?.listingId
    ?? sellRequestIdOf(ctx?.sellRequest)
    ?? (String(ctx?.entityType || '').toLowerCase() === 'sell_request' ? ctx?.entityId : '')
    ?? '',
  ).trim();

export const SELL_DRAFT_STEP_SCREENS: Record<number, string> = {
  1: 'sellIntent',
  2: 'sellAddress',
  3: 'sellDetails',
  4: 'sellPhotos',
  5: 'sellAmenities',
  6: 'sellPrice',
  7: 'sellReview',
};

export function sellDraftResumeScreen(draftStep?: number) {
  return SELL_DRAFT_STEP_SCREENS[draftStep ?? 1] ?? 'sellIntent';
}

export function sellDraftResumeContext(request?: SellRequest | null) {
  if (!request) return {};
  return {
    type: request.propertyType,
    sellRequest: request,
    sellRequestId: sellRequestIdOf(request),
    price: request.askingPrice ? String(request.askingPrice) : undefined,
    negotiable: request.negotiable,
    amenities: request.amenities,
    photos: sellRequestPhotoUrls(request),
  };
}

export function sellRequestPhotoUrls(request?: SellRequest | null, ctx?: any): string[] {
  const fromRequest = (request?.photos ?? []).filter(Boolean) as string[];
  if (fromRequest.length) return fromRequest;
  const fromCtx = Array.isArray(ctx?.photos) ? (ctx.photos as unknown[]).filter(Boolean) as string[] : [];
  if (fromCtx.length) return fromCtx;
  return (request?.documents ?? [])
    .filter((doc) => doc.fileUrl && doc.status !== 'rejected' && doc.status !== 'missing')
    .map((doc) => doc.fileUrl!)
    .filter(Boolean);
}

function photoFileName(photo: ImagePicker.ImagePickerAsset, index: number) {
  const fromAsset = photo.fileName?.trim();
  if (fromAsset) return fromAsset;
  const extension = (photo.mimeType || '').split('/')[1] || photo.uri.split('.').pop() || 'jpg';
  return `sell-request-photo-${index + 1}.${extension}`;
}

function photoMimeType(photo: ImagePicker.ImagePickerAsset) {
  if (photo.mimeType) return photo.mimeType;
  const extension = photo.uri.split('.').pop()?.toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return 'image/jpeg';
}

function apiMessage(error: unknown, fallback = 'Something went wrong. Please try again.') {
  return error instanceof Error ? error.message : fallback;
}

function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View className="mx-4 p-3 bg-rose-50 border border-rose-200 rounded-card flex-row items-center gap-2">
      <Icon name="triangle-alert" size={16} color="#E11D48" />
      <Text className="flex-1 text-[12px] text-rose-700">{message}</Text>
      {onRetry && <Pressable onPress={onRetry}><Text className="text-[12px] font-semibold text-rose-700">Retry</Text></Pressable>}
    </View>
  );
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <View className="py-10 items-center gap-2">
      <ActivityIndicator color="#1A6FFF" />
      <Text className="text-[12px] text-ink-500">{label}</Text>
    </View>
  );
}

function EmptyBlock({ title, action, onPress }: { title: string; action?: string; onPress?: () => void }) {
  return (
    <View className="items-center py-14 px-6">
      <Icon name="inbox" size={36} color="#CBD5E1" />
      <Text className="mt-2 text-[13px] font-semibold text-ink-800 text-center">{title}</Text>
      {action && onPress && <Btn className="mt-4" size="sm" onPress={onPress}>{action}</Btn>}
    </View>
  );
}

export function sellRequestTitle(request?: SellRequest | null) {
  return request?.propertyTitle || 'Property listing';
}

export function sellRequestLocation(request?: SellRequest | null) {
  return [request?.address?.street, request?.address?.locality, request?.address?.city, request?.address?.pincode].filter(Boolean).join(', ') || 'Location pending';
}

export function useSellerActivityContext(ctx: any) {
  const { authToken } = useAppState();
  const sellRequestId = ctxSellRequestId(ctx);
  const [activity, setActivity] = useState<SellerActivity | null>(ctx?.sellerActivity ?? null);
  const [request, setRequest] = useState<SellRequest | null>(ctx?.sellRequest ?? ctx?.p ?? null);
  const [loading, setLoading] = useState(Boolean(ctx?.refresh || sellRequestId));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const load = async (silent = false) => {
    if (!authToken) {
      if (!silent) {
        setLoading(false);
        setError('Please sign in again to load this listing.');
      }
      return;
    }
    if (!sellRequestId) {
      if (!silent) {
        setLoading(false);
        setError('Listing context is missing from this notification.');
      }
      return;
    }
    if (!silent) {
      setLoading(true);
      setError('');
      setOffline(false);
    }
    try {
      const next = await getSellerActivity(authToken, sellRequestId);
      setActivity(next);
      setRequest(next.sellRequest);
      setError('');
      setOffline(false);
    } catch (e) {
      if (isNetworkError(e)) setOffline(true);
      if (!silent) setError(resourceErrorMessage(e, 'Unable to load seller activity.'));
    } finally {
      if (!silent) setLoading(false);
      setRefreshing(false);
    }
  };
  const refresh = async () => {
    setRefreshing(true);
    await load(true);
  };
  useEffect(() => {
    load(Boolean(ctx?.refresh));
  }, [authToken, sellRequestId, ctx?.refresh]);
  usePolling(() => load(true), 10000, Boolean(authToken && sellRequestId));
  return {
    authToken,
    sellRequestId,
    activity,
    request,
    setActivity,
    setRequest,
    loading,
    refreshing,
    error,
    offline,
    load: () => load(false),
    refresh,
  };
}

// ─── SL-01 Property Type Selection (Sell) ────────────────────
export function SellTypeScreen() {
  const { go } = useNav();
  const { authToken } = useAppState();
  const [savingType, setSavingType] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [recentSold, setRecentSold] = useState<Array<{ id: string; price: number; days: number; title: string }>>([]);
  const startDraft = async (type: string) => {
    if (!authToken || savingType) {
      setError('Please sign in again before creating a sell request.');
      return;
    }
    setSavingType(type);
    setError('');
    try {
      const sellRequest = await createSellRequestDraft(authToken, { propertyType: type, draftStep: 1 });
      go('sellIntent', { type, sellRequest, sellRequestId: sellRequestIdOf(sellRequest) });
    } catch (e) {
      setError(apiMessage(e, 'Unable to create sell request draft.'));
    } finally {
      setSavingType(null);
    }
  };
  useEffect(() => {
    let cancelled = false;
    listCustomerProperties({ recentlySold: true, limit: 8, sort: 'newest' })
      .then((properties) => {
        if (cancelled) return;
        setRecentSold(properties.map((property) => {
          const soldAt = property.soldAt ? new Date(property.soldAt).getTime() : Date.parse(property.updatedAt || '') || Date.now();
          const days = Math.max(1, Math.round((Date.now() - soldAt) / 86400000));
          return {
            id: String(property._id ?? property.id ?? property.referenceId ?? ''),
            price: Number(property.price) || 0,
            days,
            title: property.title || 'Sold property',
          };
        }).filter((item) => item.id && item.price > 0));
      })
      .catch(() => {
        if (!cancelled) setRecentSold([]);
      });
    return () => { cancelled = true; };
  }, []);
  return (
    <Screen padBottom>
      <TopBar
        title="Sell Property"
        right={
          <Pressable onPress={() => go('help')} className="w-9 h-9 rounded-full bg-ink-100 items-center justify-center">
            <Icon name="help-circle" size={17} color="#64748B" />
          </Pressable>
        }
      />
      <PageBody className="mb-4">
        <Text className="text-[22px] font-bold text-ink-900">What Would You Like to Sell?</Text>
        <Text className="text-[14px] text-ink-500 mt-1">Select property type to get started</Text>
      </PageBody>
      {!!error && <ErrorCard message={error} />}
      {savingType && <LoadingBlock label="Saving property type..." />}
      <PropertyTypeGrid onSelect={startDraft} accentColor="#059669" surface="sell" />
      <PageBody className="mt-5">
        <Text className="text-[14px] font-semibold mb-2">Need Help?</Text>
        <View className="bg-brand-50 rounded-xl p-4 flex-row items-start gap-3">
          <Icon name="info" size={16} color="#1A6FFF" />
          <View className="flex-1">
            <Text className="text-[13px] font-medium text-ink-900 mb-0.5">Not sure which category?</Text>
            <Text className="text-[12px] text-ink-600 mb-3">Get free consultation from our property experts</Text>
            <Pressable onPress={() => go('callUs')} className="flex-row items-center gap-2 bg-brand-600 px-4 py-2 rounded-lg self-start">
              <Icon name="phone" size={14} color="white" /><Text className="text-white text-[12px] font-medium">Call Us</Text>
            </Pressable>
          </View>
        </View>
      </PageBody>
      <PageBody className="mt-5">
        <Text className="text-[14px] font-semibold mb-3">Recently Sold on Builtglory</Text>
        {recentSold.length === 0 ? (
          <View className="rounded-card border border-ink-200 p-4">
            <Text className="text-[12px] text-ink-500">Sold listings will appear here from live inventory once deals close.</Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
            {recentSold.map((item) => (
              <View key={item.id} style={{ width: 130 }} className="bg-white border border-ink-200 rounded-lg overflow-hidden">
                <PhotoPlaceholder tag={item.id} height={72} />
                <View className="p-2">
                  <Text className="text-[13px] font-bold text-brand-600">{formatINR(item.price)}</Text>
                  <Text className="text-[10.5px] text-ink-600" numberOfLines={1}>{item.title}</Text>
                  <Text className="text-[10.5px] text-ink-500">Sold in {item.days} days</Text>
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </PageBody>
      <PageBody className="mt-5 mb-6">
        <Text className="text-[14px] font-semibold mb-3">Why Sell with Builtglory?</Text>
        <View className="flex-row flex-wrap gap-2">
          <View className="bg-emerald-500 px-3 py-1.5 rounded-full"><Text className="text-white text-[11px] font-semibold">✓ No Commission</Text></View>
          <View className="bg-brand-600 px-3 py-1.5 rounded-full"><Text className="text-white text-[11px] font-semibold">✓ Verified Buyers</Text></View>
          <View className="bg-amber-500 px-3 py-1.5 rounded-full"><Text className="text-white text-[11px] font-semibold">✓ Quick Sale</Text></View>
        </View>
      </PageBody>
    </Screen>
  );
}

// ─── Sell step header ─────────────────────────────────────────
export function SellHeader({ step, totalSteps = 7, back, title }: { step: number; totalSteps?: number; back: () => void; title: string }) {
  const layout = useLayout();
  return (
    <View className="pt-2 bg-white" style={{ paddingHorizontal: layout.gutter }}>
      <View className="flex-row items-center justify-between -ml-1 mb-1 gap-2">
        <Pressable onPress={back} hitSlop={8} className="min-w-[44px] min-h-[44px] items-center justify-center rounded-full"><Icon name="arrow-left" size={20} color="#0F172A" /></Pressable>
        <View className="flex-1 min-w-0 items-center">
          <Text className="text-[10px] text-ink-500 font-semibold uppercase tracking-wider">Step {step} of {totalSteps}</Text>
          <Text className="text-[17px] font-bold text-ink-900 text-center" numberOfLines={2}>{title}</Text>
        </View>
        <Text className="text-[11px] text-ink-400 font-medium mr-2 w-10 text-right">{step}/{totalSteps}</Text>
      </View>
      <ProgressBar value={(step / totalSteps) * 100} />
    </View>
  );
}

// ─── SL-02 Basic Details ─────────────────────────────────────
export function SellBasicScreen() {
  const { go, back, ctx } = useNav();
  const { authToken } = useAppState();
  const type = ctx?.type || ctx?.sellRequest?.propertyType || 'apartment';
  const typeLabel = PROPERTY_TYPES.find((t) => t.id === type)?.label || 'Apartment';
  const visible = sellFieldVisibility(type);
  const subTypeOpts = sellSubTypesFor(type);
  const [data, setData] = useState(() => hydrateSellBasic(ctx, ctx?.sellRequest));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [subTypeOpen, setSubTypeOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { scrollRef, registerForm, registerField, scrollToField } = useSellFormScroll();
  const set = (k: keyof typeof data, v: string) => {
    setData((d) => ({ ...d, [k]: v }));
    setFieldErrors((current) => clearFieldError(current, k === 'totalFloors' ? 'floor' : String(k)));
    if (k === 'totalFloors') setFieldErrors((current) => clearFieldError(current, 'totalFloors'));
  };
  const blurField = (key: keyof typeof data) => {
    const next = validateSellBasic({ ...data }, type);
    setFieldErrors((current) => {
      const updated = { ...current };
      if (next[key]) updated[String(key)] = next[key];
      else delete updated[String(key)];
      if (key === 'floor' || key === 'totalFloors') {
        if (next.floor) updated.floor = next.floor;
        else delete updated.floor;
        if (next.totalFloors) updated.totalFloors = next.totalFloors;
        else delete updated.totalFloors;
      }
      return updated;
    });
  };
  const saveAndContinue = async () => {
    if (saving || !authToken) return;
    const errors = validateSellBasic(data, type);
    setFieldErrors(errors);
    if (!isSectionValid(errors)) {
      scrollToField(firstErrorKey(errors));
      return;
    }
    if (!ctxSellRequestId(ctx)) {
      setError('Listing draft is missing. Go back and start again.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const sellRequest = await updateSellRequest(authToken, ctxSellRequestId(ctx), {
        propertyType: type,
        propertyTitle: data.title.trim().slice(0, SELL_LIMITS.titleMax),
        draftStep: 2,
        specifications: {
          ...ctx?.sellRequest?.specifications,
          ...(visible.subType ? { subType: data.subType } : {}),
          ...(visible.bhk ? { bhk: data.bhk } : {}),
          ...(visible.builtUp ? { builtUpArea: Number(data.builtUp) } : {}),
          ...(visible.floor ? { floor: data.floor } : {}),
          ...(visible.totalFloors ? { totalFloors: Number(data.totalFloors) } : {}),
          ...(visible.unitNo ? { unitNo: data.unitNo.trim() || null } : {}),
          ...(visible.age ? { age: data.age, propertyAge: data.age } : {}),
        },
      });
      go('sellAddress', { ...ctx, type, basic: data, sellRequest, sellRequestId: sellRequestIdOf(sellRequest) });
    } catch (e) {
      setError(apiMessage(e, 'Unable to save basic details.'));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Screen padBottom scrollRef={scrollRef}>
      <SellHeader step={1} back={back} title="Basic Details" />
      {!!error && <ErrorCard message={error} />}
      {!authToken && <ErrorCard message="Please sign in again before saving seller details." />}
      <PageBody className="mt-4 gap-4" onLayout={(e) => registerForm(e.nativeEvent.layout.y)}>
        <View className="flex-row items-center justify-between bg-brand-50 rounded-full px-4 py-2.5">
          <Text className="text-brand-600 text-[13px] font-medium">{typeLabel} Selected</Text>
          <Pressable onPress={back}><Icon name="edit-2" size={14} color="#1A6FFF" /></Pressable>
        </View>
        <Text className="text-[16px] font-semibold text-ink-900">Tell Us About Your Property</Text>
        <View onLayout={(e) => registerField('title', e.nativeEvent.layout.y)}>
          <Field label="Property Title" required error={fieldErrors.title}>
            <Input
              placeholder="e.g. Bright 3 BHK in Adyar"
              value={data.title}
              maxLength={SELL_LIMITS.titleMax}
              invalid={!!fieldErrors.title}
              onChangeText={(v) => set('title', v)}
              onBlur={() => blurField('title')}
            />
            <Text className="mt-1.5 text-[11px] text-ink-500">{data.title.length}/{SELL_LIMITS.titleMax} characters</Text>
          </Field>
        </View>
        {visible.subType && (
          <View onLayout={(e) => registerField('subType', e.nativeEvent.layout.y)}>
            <Field label="Property Sub-Type" required error={fieldErrors.subType}>
              <Pressable
                onPress={() => setSubTypeOpen((open) => !open)}
                className={`min-h-[48px] px-3 py-2.5 bg-white border rounded-card flex-row items-center justify-between ${fieldErrors.subType ? 'border-rose-500' : subTypeOpen || data.subType ? 'border-brand-600' : 'border-ink-200'}`}
              >
                <Text className={`text-[14px] ${data.subType ? 'text-ink-900' : 'text-ink-400'}`}>
                  {data.subType || 'Select sub-type'}
                </Text>
                <Icon name={subTypeOpen ? 'chevron-up' : 'chevron-down'} size={16} color="#64748B" />
              </Pressable>
              {subTypeOpen && (
                <View className="mt-1 border border-ink-200 rounded-card overflow-hidden bg-white">
                  {subTypeOpts.map((option) => {
                    const active = data.subType === option;
                    return (
                      <Pressable
                        key={option}
                        onPress={() => {
                          set('subType', option);
                          setSubTypeOpen(false);
                        }}
                        className={`px-3 py-3 border-b border-ink-100 ${active ? 'bg-brand-50' : 'bg-white'}`}
                      >
                        <Text className={`text-[14px] ${active ? 'text-brand-700 font-semibold' : 'text-ink-800'}`}>{option}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </Field>
          </View>
        )}
        {visible.bhk && (
          <View onLayout={(e) => registerField('bhk', e.nativeEvent.layout.y)}>
            <Field label="BHK Configuration" required error={fieldErrors.bhk}>
              <View className="flex-row flex-wrap gap-2">
                {BHK_OPTIONS.map((b) => (
                  <Pressable key={b} onPress={() => set('bhk', b)} className={`px-4 py-2 rounded-full ${data.bhk === b ? 'bg-brand-600' : 'bg-ink-100'}`}>
                    <Text className={`text-[12px] font-medium ${data.bhk === b ? 'text-white' : 'text-ink-700'}`}>{b}</Text>
                  </Pressable>
                ))}
              </View>
            </Field>
          </View>
        )}
        {visible.builtUp && (
          <View onLayout={(e) => registerField('builtUp', e.nativeEvent.layout.y)}>
            <Field label="Built-up Area (sqft)" required error={fieldErrors.builtUp}>
              <Input
                keyboardType="numeric"
                placeholder="e.g. 1200"
                value={data.builtUp}
                invalid={!!fieldErrors.builtUp}
                onChangeText={(v) => set('builtUp', digitsOnly(v))}
                onBlur={() => blurField('builtUp')}
              />
            </Field>
          </View>
        )}
        {(visible.floor || visible.totalFloors) && (
          <View onLayout={(e) => registerField('floor', e.nativeEvent.layout.y)}>
            <Field label="Floor Number" required error={fieldErrors.floor || fieldErrors.totalFloors}>
              <View className="flex-row gap-2">
                {visible.floor && (
                  <View className="flex-1">
                    <Input
                      keyboardType="numeric"
                      placeholder="Your floor"
                      value={data.floor}
                      invalid={!!fieldErrors.floor}
                      onChangeText={(v) => set('floor', v.replace(/[^\d-]/g, ''))}
                      onBlur={() => blurField('floor')}
                    />
                  </View>
                )}
                {visible.totalFloors && (
                  <View className="flex-1">
                    <Input
                      keyboardType="numeric"
                      placeholder="Total floors"
                      value={data.totalFloors}
                      invalid={!!fieldErrors.totalFloors}
                      onChangeText={(v) => set('totalFloors', digitsOnly(v))}
                      onBlur={() => blurField('totalFloors')}
                    />
                  </View>
                )}
              </View>
            </Field>
          </View>
        )}
        {visible.unitNo && (
          <View onLayout={(e) => registerField('unitNo', e.nativeEvent.layout.y)}>
            <Field label="Flat / Unit Number" hint="Optional" error={fieldErrors.unitNo}>
              <Input
                placeholder="e.g. A-204, Tower B"
                value={data.unitNo}
                maxLength={SELL_LIMITS.unitNoMax}
                invalid={!!fieldErrors.unitNo}
                onChangeText={(v) => set('unitNo', v)}
                onBlur={() => blurField('unitNo')}
              />
            </Field>
          </View>
        )}
        {visible.age && (
          <View onLayout={(e) => registerField('age', e.nativeEvent.layout.y)}>
            <Field label="Property Age" required error={fieldErrors.age}>
              <View className="flex-row flex-wrap gap-2">
                {AGE_OPTIONS.map((a) => (
                  <Pressable key={a} onPress={() => set('age', a)} className={`px-3 py-2 rounded-full ${data.age === a ? 'bg-brand-600' : 'bg-ink-100'}`}>
                    <Text className={`text-[12px] font-medium ${data.age === a ? 'text-white' : 'text-ink-700'}`}>{a}</Text>
                  </Pressable>
                ))}
              </View>
            </Field>
          </View>
        )}
      </PageBody>
      <PageBody className="mt-4">
        <Pressable onPress={saveAndContinue} disabled={saving || !authToken} className={`w-full min-h-12 py-3 rounded-xl items-center justify-center ${saving || !authToken ? 'bg-ink-100' : 'bg-brand-600'}`}>
          <Text className={`font-semibold text-[15px] ${saving || !authToken ? 'text-ink-400' : 'text-white'}`}>{saving ? 'Saving...' : 'Continue to Location'}</Text>
        </Pressable>
      </PageBody>
    </Screen>
  );
}

// ─── SL-03 Location & Address ────────────────────────────────
export function SellLocationScreen() {
  const { go, back, ctx } = useNav();
  const { authToken } = useAppState();
  const [data, setData] = useState(() => hydrateSellAddress(ctx, ctx?.sellRequest));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { scrollRef, registerForm, registerField, scrollToField } = useSellFormScroll();
  const set = (patch: Partial<typeof data>) => {
    setData((current) => ({ ...current, ...patch }));
    Object.keys(patch).forEach((key) => setFieldErrors((current) => clearFieldError(current, key)));
  };
  const blurField = (key: keyof typeof data) => {
    const next = validateSellAddress({ ...data });
    setFieldErrors((current) => {
      const updated = { ...current };
      if (next[key]) updated[String(key)] = next[key];
      else delete updated[String(key)];
      return updated;
    });
  };
  const handleMapLocation = useCallback((location: DetectedLocation | null) => {
    if (!location || !isValidCoordinate(location.latitude, location.longitude)) return;
    setData((current) => {
      const movedFar =
        current.latitude == null ||
        current.longitude == null ||
        distanceMeters(
          { latitude: current.latitude, longitude: current.longitude },
          { latitude: location.latitude, longitude: location.longitude },
        ) > 120;
      const nextPin = location.postalCode && /^\d{6}$/.test(location.postalCode) ? location.postalCode : current.pin;
      const nextCity = (location.city || current.city).replace(/[^A-Za-z .'-]/g, ' ').replace(/\s+/g, ' ').trim();
      return {
        ...current,
        latitude: location.latitude,
        longitude: location.longitude,
        ...(movedFar
          ? {
              building: location.street || current.building,
              area: location.locality || current.area,
              city: nextCity || current.city,
              pin: nextPin,
              state: location.state || current.state,
              country: location.country || current.country || 'India',
              formattedAddress: location.formattedAddress || current.formattedAddress,
            }
          : {
              formattedAddress: location.formattedAddress || current.formattedAddress,
            }),
      };
    });
    setFieldErrors((current) => clearFieldError(clearFieldError(current, 'coordinates'), 'city'));
  }, []);
  const saveAndContinue = async () => {
    if (saving || !authToken) return;
    const errors = validateSellAddress(data);
    setFieldErrors(errors);
    if (!isSectionValid(errors)) {
      scrollToField(firstErrorKey(errors) === 'coordinates' ? 'building' : firstErrorKey(errors));
      return;
    }
    if (!ctxSellRequestId(ctx)) {
      setError('Listing draft is missing. Go back and start again.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const sellRequest = await updateSellRequest(authToken, ctxSellRequestId(ctx), {
        address: {
          street: data.building.trim(),
          locality: data.area.trim() || null,
          city: data.city.trim(),
          state: data.state.trim() || null,
          pincode: data.pin,
          latitude: data.latitude ?? undefined,
          longitude: data.longitude ?? undefined,
        },
        draftStep: 3,
      });
      go('sellDetails', { ...ctx, location: data, sellRequest, sellRequestId: sellRequestIdOf(sellRequest) });
    } catch (e) {
      setError(apiMessage(e, 'Unable to save address details.'));
    } finally {
      setSaving(false);
    }
  };
  const savedCoordinate =
    data.latitude != null && data.longitude != null && isValidCoordinate(data.latitude, data.longitude)
      ? { latitude: data.latitude, longitude: data.longitude }
      : null;
  return (
    <Screen fill>
      <SellHeader step={2} back={back} title="Location & Address" />
      {!!error && <ErrorCard message={error} />}
      {!!fieldErrors.coordinates && <ErrorCard message={fieldErrors.coordinates} />}
      <PageBody className="mt-3">
        <LocationPickerMap
          initialCoordinate={savedCoordinate}
          selectable
          autoDetect
          autoTrack
          showSearch
          showTrackingToggle
          height={250}
          onLocationChange={handleMapLocation}
        />
      </PageBody>
      <PageBody className="mt-3 flex-1" onLayout={(e) => registerForm(e.nativeEvent.layout.y)}>
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View className="gap-4 pb-4">
            <View onLayout={(e) => registerField('building', e.nativeEvent.layout.y)}>
              <Field label="Building / Society" required error={fieldErrors.building}>
                <Input icon="building-2" placeholder="e.g. Sunrise Heights" value={data.building} invalid={!!fieldErrors.building} maxLength={SELL_LIMITS.streetMax} onChangeText={(v) => set({ building: v })} onBlur={() => blurField('building')} />
              </Field>
            </View>
            <View onLayout={(e) => registerField('area', e.nativeEvent.layout.y)}>
              <Field label="Area / Locality" hint="Optional" error={fieldErrors.area}>
                <Input icon="map" placeholder="e.g. Adyar" value={data.area} invalid={!!fieldErrors.area} maxLength={SELL_LIMITS.localityMax} onChangeText={(v) => set({ area: v })} onBlur={() => blurField('area')} />
              </Field>
            </View>
            <View className="flex-row gap-3">
              <View className="flex-1" onLayout={(e) => registerField('city', e.nativeEvent.layout.y)}>
                <Field label="City" required error={fieldErrors.city}>
                  <Input icon="map-pin" value={data.city} invalid={!!fieldErrors.city} maxLength={SELL_LIMITS.cityMax} onChangeText={(v) => set({ city: v })} onBlur={() => blurField('city')} />
                </Field>
              </View>
              <View className="flex-1" onLayout={(e) => registerField('pin', e.nativeEvent.layout.y)}>
                <Field label="Pincode" required error={fieldErrors.pin}>
                  <Input maxLength={6} keyboardType="numeric" placeholder="6-digit" value={data.pin} invalid={!!fieldErrors.pin} onChangeText={(v) => set({ pin: digitsOnly(v).slice(0, 6) })} onBlur={() => blurField('pin')} />
                </Field>
              </View>
            </View>
            {(data.state || data.country) && (
              <Text className="text-[11px] text-ink-500">
                {[data.state, data.country].filter(Boolean).join(', ')}
                {data.latitude != null && data.longitude != null ? ` · ${data.latitude.toFixed(5)}, ${data.longitude.toFixed(5)}` : ''}
              </Text>
            )}
          </View>
        </ScrollView>
      </PageBody>
      <PageBody className="mt-2 mb-3">
        <Pressable onPress={saveAndContinue} disabled={saving || !authToken} className={`w-full min-h-12 py-3 rounded-xl items-center justify-center ${saving || !authToken ? 'bg-ink-100' : 'bg-brand-600'}`}>
          <Text className={`font-semibold text-[15px] ${saving || !authToken ? 'text-ink-400' : 'text-white'}`}>{saving ? 'Saving...' : 'Confirm location'}</Text>
        </Pressable>
      </PageBody>
    </Screen>
  );
}

// ─── SL-06 Photo Upload ──────────────────────────────────────
export function SellPhotosScreen() {
  const layout = useLayout();
  const photoCols = layout.isTablet ? 4 : 3;
  const photoGap = layout.gap;
  const photoW = gridItemWidth(layout.contentWidth - layout.gutter * 2 - 28, photoCols, photoGap); // inner card padding ~14*2
  const { go, back, ctx } = useNav();
  const { authToken } = useAppState();
  const sellRequestId = ctxSellRequestId(ctx);
  const [sellRequest, setSellRequest] = useState<SellRequest | null>(ctx?.sellRequest ?? null);
  const [existingPhotos, setExistingPhotos] = useState<string[]>(() => sellRequestPhotoUrls(ctx?.sellRequest, ctx));
  const [photos, setPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const MIN = SELL_LIMITS.photosMin;
  const totalSelected = existingPhotos.length + photos.length;
  useEffect(() => {
    if (!authToken || !sellRequestId) return;
    setLoadingExisting(true);
    getSellRequest(authToken, sellRequestId)
      .then((request) => {
        setSellRequest(request);
        setExistingPhotos(sellRequestPhotoUrls(request, ctx));
      })
      .catch((e) => setError(apiMessage(e, 'Unable to load saved photos for this listing.')))
      .finally(() => setLoadingExisting(false));
  }, [authToken, sellRequestId]);
  const pickPhotos = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsMultipleSelection: true,
      quality: 0.85,
      selectionLimit: 0,
    });

    if (result.canceled) return;

    const rejected: string[] = [];
    const accepted = result.assets.filter((asset) => {
      if (asset.type === 'video') {
        rejected.push('Videos are not allowed. Upload photos only.');
        return false;
      }
      const photoError = validatePhotoAsset(asset);
      if (photoError) {
        rejected.push(photoError);
        return false;
      }
      return true;
    });
    setPhotos((current) => {
      const next = [...current];
      accepted.forEach((asset) => {
        if (!next.some((photo) => photo.uri === asset.uri)) next.push(asset);
      });
      return next.slice(0, SELL_LIMITS.photosMax - existingPhotos.length);
    });
    if (rejected.length) {
      setFieldErrors({ photos: rejected[0] });
    } else {
      setFieldErrors((current) => clearFieldError(current, 'photos'));
    }
  };
  const removePhoto = (uri: string) => setPhotos((current) => current.filter((photo) => photo.uri !== uri));
  const removeExistingPhoto = (url: string) => setExistingPhotos((current) => current.filter((photo) => photo !== url));
  const saveAndContinue = async () => {
    if (saving || !authToken || !sellRequestId) return;
    const errors = validateSellPhotos(totalSelected, photos);
    setFieldErrors(errors);
    if (!isSectionValid(errors)) return;
    setSaving(true);
    setError('');
    try {
      const uploadedDocs = await Promise.all(
        photos.map((photo, index) =>
          uploadCustomerDocument(authToken, {
            ownerType: 'sell_request',
            ownerId: sellRequestId,
            purpose: 'property_media',
            documentType: existingPhotos.length === 0 && index === 0 ? 'cover_photo' : 'photo',
            file: {
              uri: photo.uri,
              name: photoFileName(photo, index),
              type: photoMimeType(photo),
            },
          }),
        ),
      );
      const uploadedPhotoUrls = uploadedDocs
        .map((doc) => doc.url)
        .filter((url): url is string => Boolean(url));
      const allPhotoUrls = [...existingPhotos, ...uploadedPhotoUrls].filter(Boolean);
      if (allPhotoUrls.length < MIN) {
        throw new Error('Photos uploaded, but secure media URLs are not available yet.');
      }
      const existingDocuments = (sellRequest?.documents ?? ctx?.sellRequest?.documents ?? []).filter(
        (doc: SellRequestDocument) => Boolean(doc.fileUrl),
      );
      const updatedSellRequest = await updateSellRequest(authToken, sellRequestId, {
        photos: allPhotoUrls,
        documents: [
          ...existingDocuments,
          ...uploadedDocs.map((doc, index) => ({
            documentId: doc._id ?? doc.id,
            name: doc.fileName ?? photoFileName(photos[index], index),
            status: doc.status === 'uploaded' ? 'uploaded' : 'pending',
            scanStatus: doc.scanStatus,
            fileUrl: doc.url,
          })),
        ],
        draftStep: 5,
      });
      go('sellAmenities', { ...ctx, photos: allPhotoUrls, sellRequest: updatedSellRequest, sellRequestId: sellRequestIdOf(updatedSellRequest) });
    } catch (e) {
      setError(apiMessage(e, 'Unable to save property photos.'));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Screen padBottom>
      <SellHeader step={4} back={back} title="Add Photos" />
      {!!error && <ErrorCard message={error} />}
      {!!fieldErrors.photos && <ErrorCard message={fieldErrors.photos} />}
      {!sellRequestId && <ErrorCard message="Listing draft is missing. Go back and reopen this draft from My Listings." />}
      <PageBody className="mt-4 gap-4">
        <View className="rounded-card border border-brand-100 bg-brand-50/50 p-3.5">
          <View className="flex-row items-start justify-between gap-3 mb-3">
            <View className="flex-1">
              <Text className="text-[15px] font-bold text-ink-900">Property photos</Text>
              <Text className="text-[12px] text-ink-500 mt-0.5">Add at least {MIN} photos (JPG, PNG or WEBP, max 25MB each). The first one becomes your cover.</Text>
            </View>
            <View className="rounded-full bg-white px-3 py-1 border border-brand-100">
              <Text className="text-[11px] font-bold text-brand-700">{totalSelected} selected</Text>
            </View>
          </View>

          <View className="flex-row flex-wrap mb-3" style={{ gap: photoGap }}>
            {existingPhotos.map((photoUrl, i) => (
              <View key={`existing-${i}`} style={{ width: photoW }} className="aspect-square relative">
                <Image source={{ uri: photoUrl }} className="rounded-card w-full h-full bg-ink-100" resizeMode="cover" />
                {i === 0 && <View className="absolute top-1 left-1 bg-emerald-600 px-1.5 py-0.5 rounded"><Text className="text-white text-[9px] font-bold">COVER</Text></View>}
                <Pressable onPress={() => removeExistingPhoto(photoUrl)} hitSlop={8} className="absolute -top-1.5 -right-1.5 w-7 h-7 rounded-full bg-rose-500 items-center justify-center">
                  <Icon name="x" size={12} color="white" />
                </Pressable>
              </View>
            ))}
            {photos.map((photo, i) => (
              <View key={`new-${i}-${photo.assetId ?? photo.uri}`} style={{ width: photoW }} className="aspect-square relative">
                <Image source={{ uri: photo.uri }} className="rounded-card w-full h-full bg-ink-100" resizeMode="cover" />
                {existingPhotos.length === 0 && i === 0 && <View className="absolute top-1 left-1 bg-emerald-600 px-1.5 py-0.5 rounded"><Text className="text-white text-[9px] font-bold">COVER</Text></View>}
                <Pressable onPress={() => removePhoto(photo.uri)} hitSlop={8} className="absolute -top-1.5 -right-1.5 w-7 h-7 rounded-full bg-rose-500 items-center justify-center">
                  <Icon name="x" size={12} color="white" />
                </Pressable>
              </View>
            ))}
            <Pressable onPress={pickPhotos} style={{ width: photoW }} className="aspect-square rounded-card border-2 border-dashed border-brand-300 bg-white items-center justify-center">
              <View className="w-9 h-9 rounded-full bg-brand-50 items-center justify-center mb-1">
                <Icon name="plus" size={22} color="#1A6FFF" />
              </View>
              <Text className="text-[10px] font-semibold text-brand-700">Add photos</Text>
            </Pressable>
          </View>

          {totalSelected === 0 && !loadingExisting && (
            <View className="rounded-card bg-white border border-ink-100 p-3 flex-row items-center gap-2">
              <Icon name="image-plus" size={16} color="#1A6FFF" />
              <Text className="text-[12px] text-ink-600 flex-1">No photos selected yet. Tap plus to choose photos from your media library.</Text>
            </View>
          )}
          {loadingExisting && <LoadingBlock label="Loading saved photos..." />}

          <View className="mt-3 p-3 bg-white rounded-card flex-row items-center gap-2">
            <Icon name="info" size={14} color="#64748B" /><Text className="text-[12px] text-ink-700">{totalSelected}/{MIN} required photos</Text>
          </View>
        </View>

        <Text className="text-[13px] font-semibold mb-2">Tips for great photos</Text>
        {['Shoot in daylight with windows open', 'Wide-angle covers more of each room', 'Tidy clutter before each shot'].map((t) => (
          <View key={t} className="flex-row gap-2 mb-1.5"><Icon name="check" size={14} color="#10B981" /><Text className="text-[12px] text-ink-700 flex-1">{t}</Text></View>
        ))}
      </PageBody>
      <PageBody className="mt-4">
        <Pressable onPress={saveAndContinue} disabled={saving || !sellRequestId || !authToken} className={`w-full min-h-12 py-3 rounded-xl items-center justify-center ${saving || !sellRequestId || !authToken ? 'bg-ink-100' : 'bg-brand-600'}`}>
          <Text className={`font-semibold text-[15px] ${saving || !sellRequestId || !authToken ? 'text-ink-400' : 'text-white'}`}>{saving ? 'Saving...' : `Continue (${totalSelected}/${MIN} photos)`}</Text>
        </Pressable>
      </PageBody>
    </Screen>
  );
}

// ─── SL-05 Amenities ─────────────────────────────────────────
export function SellAmenitiesScreen() {
  const { go, back, ctx } = useNav();
  const layout = useLayout();
  const cols = layout.isTablet ? 4 : 3;
  const gap = layout.gap;
  const itemW = gridItemWidth(layout.contentWidth - layout.gutter * 2, cols, gap);
  const { authToken } = useAppState();
  const type = ctx?.type || ctx?.sellRequest?.propertyType || 'apartment';
  const visible = sellFieldVisibility(type);
  const [sel, setSel] = useState<Set<string>>(() => {
    const saved = (ctx?.amenities ?? ctx?.sellRequest?.amenities) as string[] | undefined;
    if (Array.isArray(saved) && saved.length) return new Set(saved);
    return new Set();
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const toggle = (l: string) => {
    const s = new Set(sel);
    s.has(l) ? s.delete(l) : s.add(l);
    setSel(s);
    setFieldErrors((current) => clearFieldError(current, 'amenities'));
  };
  const extra = ['Modular Kitchen', 'Marble flooring', 'Wooden flooring', 'AC', 'RO water', 'Geyser', 'Wardrobes', 'Balcony'];
  const all = [...SPECS, ...extra.map((l) => ({ label: l, icon: 'sparkles' }))];
  const saveAndContinue = async () => {
    if (saving || !authToken || !ctxSellRequestId(ctx)) return;
    const amenities = Array.from(sel);
    const errors = validateSellAmenities(amenities, type);
    setFieldErrors(errors);
    if (!isSectionValid(errors)) return;
    setSaving(true);
    setError('');
    try {
      const sellRequest = await updateSellRequest(authToken, ctxSellRequestId(ctx), { amenities, draftStep: 6 });
      go('sellPrice', { ...ctx, amenities, sellRequest, sellRequestId: sellRequestIdOf(sellRequest) });
    } catch (e) {
      setError(apiMessage(e, 'Unable to save amenities.'));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Screen padBottom>
      <SellHeader step={5} back={back} title="Amenities" />
      {!!error && <ErrorCard message={error} />}
      {!!fieldErrors.amenities && <ErrorCard message={fieldErrors.amenities} />}
      <PageBody className="mt-4">
        <Text className="text-[12px] text-ink-500 mb-3">
          Selected <Text className="text-emerald-700 font-bold">{sel.size}</Text> of {all.length}
          {visible.amenitiesRequired ? <Text className="text-ink-500"> · at least one required</Text> : <Text className="text-ink-500"> · optional for this property type</Text>}
        </Text>
        <View className="flex-row flex-wrap" style={{ gap }}>
          {all.map((a) => (
            <Pressable key={a.label} onPress={() => toggle(a.label)} style={{ width: itemW }} className={`p-2.5 rounded-card border items-center gap-1.5 min-h-[76px] ${sel.has(a.label) ? 'border-emerald-500 bg-emerald-50' : 'border-ink-200'}`}>
              <Icon name={a.icon} size={18} color={sel.has(a.label) ? '#059669' : '#94A3B8'} />
              <Text className="text-[10px] text-center font-medium leading-caption" numberOfLines={2}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      </PageBody>
      <PageBody className="mt-4">
        <Btn className="w-full" disabled={saving || !authToken} onPress={saveAndContinue}>{saving ? 'Saving...' : 'Continue to Pricing'}</Btn>
      </PageBody>
    </Screen>
  );
}

// ─── SL-09 Seller Dashboard ──────────────────────────────────
export function SellerDashboardScreen() {
  const { go, back } = useNav();
  const { authToken, getCachedValue, setCachedValue } = useAppState();
  const [listings, setListings] = useState<SellRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const loadListings = async (force = false, silent = false) => {
    if (!authToken) {
      setError('Please sign in again to view your listings.');
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const cacheKey = `${SELL_LISTINGS_CACHE_PREFIX}:${authToken}`;
    const cached = getCachedValue<SellRequest[]>(cacheKey);
    if (cached && !force) {
      setListings(cached);
      setLoading(false);
      return;
    }

    if (force && !silent) setRefreshing(true);
    else if (!silent) setLoading(true);
    setError('');
    try {
      const nextListings = await listSellRequests(authToken, { limit: 50, sort: 'newest' });
      setListings(nextListings);
      setCachedValue(cacheKey, nextListings);
    } catch (e) {
      setError(apiMessage(e, 'Unable to load seller listings.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  useEffect(() => { loadListings(); }, [authToken]);
  usePolling(() => loadListings(true, true), 15000, Boolean(authToken));
  const activeCount = listings.filter((listing) => listing.status !== 'draft').length;
  const draftCount = listings.filter((listing) => listing.status === 'draft').length;
  return (
    <Screen padBottom refreshing={refreshing} onRefresh={() => loadListings(true)}>
      <TopBar
        onBack={back}
        title="My listings"
        sub={`${activeCount} active · ${draftCount} draft`}
        right={
          <Pressable onPress={() => go('sellTypes')} className="w-9 h-9 rounded-full bg-brand-600 items-center justify-center">
            <Icon name="plus" size={16} color="white" />
          </Pressable>
        }
      />
      {!!error && <ErrorCard message={error} onRetry={loadListings} />}
      {loading && <LoadingBlock label="Loading seller listings..." />}
      <PageBody>
        <Text className="text-[14px] font-semibold mb-2">Your listings</Text>
        {!loading && !error && listings.length === 0 ? (
          <EmptyState icon="tag" title="No sell requests yet." action="List a Property" onPress={() => go('sellTypes')} />
        ) : (
        <View className="gap-3">
          {listings.map((p, idx) => (
            <FadeInView key={sellRequestIdOf(p) || p.referenceId} delay={idx * 45} className="rounded-card border border-ink-200 overflow-hidden bg-white">
              <View className="flex-row gap-3 p-2 items-start">
                <Pressable onPress={() => go('listingDetail', { sellRequest: p, sellRequestId: sellRequestIdOf(p) })} className="flex-row gap-3 flex-1">
                  <PhotoPlaceholder tag={sellRequestIdOf(p) || p.referenceId} width={80} height={80} className="rounded-md">
                    <View className="absolute top-1 left-1"><Badge color={p.status === 'active' ? 'green' : p.status === 'rejected' ? 'rose' : 'amber'}>{p.status ?? 'draft'}</Badge></View>
                  </PhotoPlaceholder>
                  <View className="flex-1 py-1">
                    <Text className="text-[13px] font-semibold" numberOfLines={1}>{sellRequestTitle(p)}</Text>
                    <Text className="text-[11px] text-ink-500" numberOfLines={1}>{sellRequestLocation(p)}</Text>
                    <Text className="text-[13px] font-bold text-brand-600 mt-0.5">{p.askingPrice ? formatINR(p.askingPrice) : 'Price pending'}</Text>
                  </View>
                </Pressable>
                <Pressable onPress={() => go('editListing', { sellRequest: p, sellRequestId: sellRequestIdOf(p) })} className="mt-1 w-8 h-8 rounded-full bg-brand-50 border border-brand-100 items-center justify-center">
                  <Icon name="pencil" size={14} color="#1A6FFF" />
                </Pressable>
              </View>
              <View className="flex-row border-t border-ink-100">
                <Pressable onPress={() => go('sellVisitMgmt', { sellRequest: p, sellRequestId: sellRequestIdOf(p) })} className="flex-1 py-2 items-center"><Text className="text-[11.5px] font-semibold text-ink-700">Visits ({p.metrics?.visitCount ?? 0})</Text></Pressable>
                <Pressable onPress={() => go('verificationStatus', { sellRequest: p, sellRequestId: sellRequestIdOf(p) })} className="flex-1 py-2 items-center"><Text className="text-[11.5px] font-semibold text-ink-500">Status</Text></Pressable>
              </View>
            </FadeInView>
          ))}
        </View>
        )}
      </PageBody>
    </Screen>
  );
}

// ─── SL-10 Enquiry Management ────────────────────────────────
export function SellEnquiriesScreen() {
  const { go, back } = useNav();
  const { authToken, getCachedValue, setCachedValue } = useAppState();
  const [requests, setRequests] = useState<SellRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('all');
  const loadRequests = async (force = false) => {
    if (!authToken) {
      setError('Please sign in again to view seller enquiries.');
      setLoading(false);
      return;
    }
    const cacheKey = `${SELL_LISTINGS_CACHE_PREFIX}:${authToken}`;
    const cached = getCachedValue<SellRequest[]>(cacheKey);
    if (cached && !force) {
      setRequests(cached);
      setLoading(false);
      setError('');
      return;
    }
    setLoading(!cached);
    setError('');
    try {
      const nextRequests = await listSellRequests(authToken, { limit: 50, sort: 'newest' });
      setRequests(nextRequests);
      setCachedValue(cacheKey, nextRequests);
    } catch (e) {
      setError(apiMessage(e, 'Unable to load seller enquiry context.'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { loadRequests(); }, [authToken]);
  usePolling(() => loadRequests(true), 15000, Boolean(authToken));
  const list = requests.filter((request) => (tab === 'all' ? true : (request.status ?? 'draft') === tab));
  const totalEnquiries = requests.reduce((sum, request) => sum + (request.metrics?.enquiryCount ?? 0), 0);
  return (
    <Screen>
      <TopBar onBack={back} title="Buyer enquiries" sub={`${totalEnquiries} tracked interest`} />
      {!!error && <ErrorCard message={error} onRetry={loadRequests} />}
      {loading && <LoadingBlock label="Loading seller enquiry context..." />}
      <PageBody>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} className="mb-2">
          {['all', 'new', 'active', 'negotiating', 'sold'].map((t) => (
            <Chip key={t} active={tab === t} onPress={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</Chip>
          ))}
        </ScrollView>
        {!loading && list.length === 0 ? (
          <View className="py-12 items-center"><Icon name="inbox" size={40} color="#CBD5E1" /><Text className="mt-2 text-[13px]">No seller listings in this category</Text></View>
        ) : (
          <View className="gap-2">
            {list.map((request) => (
              <View key={sellRequestIdOf(request) || request.referenceId} className="p-3 rounded-card border border-ink-200">
                <View className="flex-row items-center gap-3">
                  <View className="w-10 h-10 rounded-full bg-brand-100 items-center justify-center"><Icon name="users" size={16} color="#1A6FFF" /></View>
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2"><Text className="text-[13px] font-semibold">{sellRequestTitle(request)}</Text><Badge color={request.status === 'active' ? 'green' : 'brand'}>{request.status ?? 'draft'}</Badge></View>
                    <Text className="text-[10.5px] text-ink-500">{request.metrics?.enquiryCount ?? 0} enquiries · {request.metrics?.saveCount ?? 0} saves</Text>
                  </View>
                </View>
                <Text className="text-[12.5px] text-ink-700 mt-2 leading-relaxed">
                  {request.metrics?.enquiryCount ?? 0} buyer enquiries and {request.metrics?.visitCount ?? 0} visits tracked for this listing.
                </Text>
                <View className="flex-row gap-2 mt-2.5">
                  <Btn size="sm" variant="outline" icon="calendar" onPress={() => go('sellVisitMgmt', { sellRequest: request, sellRequestId: sellRequestIdOf(request) })}>Visits</Btn>
                  <Btn size="sm" icon="message-circle" onPress={() => go('sellChat', { sellRequest: request, sellRequestId: sellRequestIdOf(request) })}>Request callback</Btn>
                </View>
              </View>
            ))}
          </View>
        )}
      </PageBody>
    </Screen>
  );
}

// ─── SL-11 Visit Scheduling (seller) ─────────────────────────
export function SellVisitMgmtScreen() {
  const { back, ctx } = useNav();
  const { authToken, sellRequestId, activity, setActivity, request, loading, error, load } = useSellerActivityContext(ctx);
  const [actionId, setActionId] = useState('');
  const [actionError, setActionError] = useState('');
  const visits = activity?.visits ?? [];
  const visitCount = activity?.metrics.visitCount ?? request?.metrics?.visitCount ?? 0;
  const visitIdOf = (visit: SellerActivity['visits'][number]) => String(visit._id ?? '').trim();
  const tomorrowSlotFor = (visit: SellerActivity['visits'][number]) => {
    const base = visit.visitDate ? new Date(visit.visitDate) : new Date();
    base.setDate(base.getDate() + 1);
    return base.toISOString();
  };
  const actOnVisit = async (visit: SellerActivity['visits'][number], action: 'confirm' | 'reschedule') => {
    const visitId = visitIdOf(visit);
    if (!authToken || !sellRequestId || !visitId || actionId) return;
    setActionId(`${visitId}:${action}`);
    setActionError('');
    try {
      const next = await submitSellerVisitAction(authToken, sellRequestId, visitId, action === 'confirm'
        ? { action: 'confirm' }
        : {
          action: 'reschedule',
          visitDate: tomorrowSlotFor(visit),
          visitTime: visit.visitTime || '10:00 AM',
          reason: 'Seller suggested the same slot on the next day.',
        });
      setActivity(next);
    } catch (e) {
      setActionError(apiMessage(e, 'Unable to update visit.'));
    } finally {
      setActionId('');
    }
  };
  return (
    <Screen>
      <TopBar onBack={back} title="Visit scheduling" sub={`${visitCount} visit requests tracked`} />
      {!!error && <ErrorCard message={error} onRetry={load} />}
      {!!actionError && <ErrorCard message={actionError} />}
      {loading && <LoadingBlock label="Loading seller visit activity..." />}
      <PageBody>
        <Text className="text-[13px] font-semibold mb-2">Visit requests</Text>
        {visits.length === 0 ? (
          <View className="rounded-card border border-ink-200 p-4">
            <Text className="text-[14px] font-semibold">{sellRequestTitle(request)}</Text>
            <Text className="text-[12px] text-ink-600 mt-1">No visit records are linked to this listing yet.</Text>
            <View className="mt-3 flex-row items-center justify-between">
              <Text className="text-[12px] text-ink-500">Tracked visit count</Text>
              <Badge color={visitCount ? 'brand' : 'ink'}>{visitCount}</Badge>
            </View>
          </View>
        ) : (
          <View className="gap-2">
            {visits.map((visit) => (
              <View key={visit._id ?? visit.referenceId} className="rounded-card border border-ink-200 p-3">
                <View className="flex-row items-center justify-between">
                  <Text className="text-[13px] font-semibold">{visit.visitType === 'virtual' ? 'Video tour' : 'Property visit'}</Text>
                  <Badge color={visit.status === 'completed' ? 'green' : visit.status === 'cancelled' ? 'rose' : 'brand'}>{visit.status ?? 'scheduled'}</Badge>
                </View>
                <Text className="text-[12px] text-ink-600 mt-1">{visit.visitDate ? new Date(visit.visitDate).toLocaleDateString() : 'Date pending'} · {visit.visitTime || 'Time pending'}</Text>
                {typeof visit.rescheduleCount === 'number' && visit.rescheduleCount > 0 && <Text className="text-[11px] text-ink-500 mt-1">Rescheduled {visit.rescheduleCount} time{visit.rescheduleCount === 1 ? '' : 's'}</Text>}
                {typeof visit.feedback?.notes === 'string' && <Text className="text-[11.5px] text-ink-500 mt-1">{visit.feedback.notes}</Text>}
                {!['cancelled', 'completed'].includes(visit.status ?? '') && (
                  <View className="flex-row gap-2 mt-3">
                    {visit.status !== 'confirmed' && (
                      <Btn size="sm" icon="check" disabled={!!actionId} onPress={() => actOnVisit(visit, 'confirm')}>
                        {actionId === `${visitIdOf(visit)}:confirm` ? 'Confirming...' : 'Confirm'}
                      </Btn>
                    )}
                    <Btn size="sm" variant="outline" icon="calendar" disabled={!!actionId} onPress={() => actOnVisit(visit, 'reschedule')}>
                      {actionId === `${visitIdOf(visit)}:reschedule` ? 'Sending...' : 'Suggest tomorrow'}
                    </Btn>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </PageBody>
    </Screen>
  );
}

// ─── SL-12 Negotiation Chat ──────────────────────────────────
export function SellChatScreen() {
  const layout = useLayout();
  const bubbleMaxWidth = Math.round(layout.contentWidth * (layout.isTablet ? 0.62 : layout.isPhoneSm ? 0.88 : 0.82));
  const { back, ctx } = useNav();
  const { authToken, sellRequestId, activity, setActivity, loading, error, load } = useSellerActivityContext(ctx);
  const insets = useSafeAreaInsets();
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardBottomInset, setKeyboardBottomInset] = useState(0);
  const composerKeyboardGap = Platform.OS === 'android' && keyboardVisible ? 12 : 0;
  const socketRef = useRef<ChatSocket | null>(null);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('');
  const [sending, setSending] = useState(false);
  const messages = activity?.messages ?? [];

  useEffect(() => {
    if (!authToken || !sellRequestId) return;
    const socket = createChatSocket(authToken);
    socketRef.current = socket;

    socket.on('sell:activity_updated', ({ activity: nextActivity }) => {
      setActivity(nextActivity);
    });
    socket.on('connect', () => {
      socket.emit('sell:join', { sellRequestId }, (payload) => {
        if (payload.ok) {
          setActivity(payload.activity);
          setStatus('');
        } else if (payload.error) {
          setStatus(payload.error);
        }
      });
    });
    socket.on('connect_error', () => {
      setStatus('Realtime chat is reconnecting. Messages will still send normally.');
    });

    return () => {
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [authToken, sellRequestId, setActivity]);

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

  const send = async () => {
    if (!draft.trim() || sending) return;
    if (!authToken || !sellRequestId) {
      setStatus('Please sign in again before sending a message.');
      return;
    }
    const note = draft.trim();
    setSending(true);
    setStatus('');
    const socket = socketRef.current;
    if (socket?.connected) {
      socket.emit('sell:send', { sellRequestId, text: note }, (payload) => {
        setSending(false);
        if (payload.ok) {
          setActivity(payload.activity);
          setDraft('');
          setStatus('Message sent to Builtglory.');
        } else {
          setStatus(payload.error ?? 'Unable to send message.');
        }
      });
      return;
    }
    try {
      const next = await sendSellerMessage(authToken, sellRequestId, note);
      setActivity(next);
      setDraft('');
      setStatus('Message sent to Builtglory.');
    } catch (e) {
      setStatus(apiMessage(e, 'Unable to send message.'));
    } finally {
      setSending(false);
    }
  };
  const requestCallback = async () => {
    await requestCallbackWithReason(`Negotiation callback for sell request ${ctxSellRequestId(ctx) || sellRequestTitle(ctx?.sellRequest)}`);
  };
  const requestCallbackWithReason = async (reason: string) => {
    if (!authToken) {
      setStatus('Please sign in again before requesting a callback.');
      return;
    }
    try {
      const callback = await createCallbackRequest(authToken, {
        source: 'profile_support',
        sourceScreen: 'sellChat',
        category: 'pricing',
        reason,
        bestTimePreference: 'afternoon',
      });
      setStatus(`Callback requested${callback.referenceId ? `: ${callback.referenceId}` : ''}.`);
    } catch (e) {
      setStatus(apiMessage(e, 'Unable to request callback.'));
    }
  };
  return (
    <Screen fill>
      <View className="pt-2 pb-3 flex-row items-center gap-3 border-b border-ink-200 bg-white" style={{ paddingHorizontal: layout.gutter }}>
        <Pressable onPress={back} hitSlop={8} className="-ml-1 min-w-[44px] min-h-[44px] items-center justify-center rounded-full"><Icon name="arrow-left" size={20} color="#0F172A" /></Pressable>
        <View className="w-10 h-10 rounded-full bg-brand-100 items-center justify-center"><Icon name="headphones" size={16} color="#1A6FFF" /></View>
        <View className="flex-1 min-w-0">
          <Text className="text-[14px] font-semibold" numberOfLines={1}>{sellRequestTitle(ctx?.sellRequest)}</Text>
          <Text className="text-[10.5px] text-emerald-600">● Messages saved</Text>
        </View>
        <Pressable onPress={requestCallback} className="w-9 h-9 rounded-full bg-ink-100 items-center justify-center"><Icon name="phone" size={14} color="#0F172A" /></Pressable>
      </View>
      {!!status && <View className="py-2 bg-brand-50" style={{ paddingHorizontal: layout.gutter }}><Text className="text-[12px] text-brand-700">{status}</Text></View>}
      {!!error && <View className="py-2 bg-rose-50" style={{ paddingHorizontal: layout.gutter }}><Text className="text-[12px] text-rose-700" onPress={() => load()}>{error}</Text></View>}
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
      <ScrollView className="flex-1 px-3 bg-ink-50" contentContainerStyle={{ paddingTop: 12, paddingBottom: 14, gap: 8 }} showsVerticalScrollIndicator={false}>
        <View className="self-center px-3 py-1 rounded-full bg-white/90 border border-ink-200">
          <Text className="text-center text-[10.5px] text-ink-500">Today</Text>
        </View>
        {loading && <Text className="text-center text-[12px] text-ink-500">Loading negotiation activity...</Text>}
        {!loading && messages.length === 0 && (
          <View className="self-center px-3 py-2 rounded-2xl bg-white border border-ink-200 shadow-sm" style={{ maxWidth: bubbleMaxWidth }}>
            <Text className="text-[13px] text-ink-900">No negotiation messages are linked yet. Send a message and Builtglory will follow up on this listing.</Text>
          </View>
        )}
        {messages.map((m, i) => {
          const mine = m.sender === 'seller';
          return (
          <View key={`${m.threadId ?? m.logId ?? 'message'}-${i}`} className={`flex-row ${mine ? 'justify-end' : 'justify-start'}`}>
            <View className={`px-3 py-2 shadow-sm ${mine ? 'bg-brand-600 rounded-t-2xl rounded-bl-2xl rounded-br-md' : 'bg-white border border-ink-200 rounded-t-2xl rounded-br-2xl rounded-bl-md'}`} style={{ maxWidth: bubbleMaxWidth }}>
              <Text className={`text-[13px] leading-5 ${mine ? 'text-white' : 'text-ink-900'}`}>{m.text || (m.type === 'offer' ? 'Offer shared' : 'Message')}</Text>
              {!!m.offerAmount && (
                <View className={`mt-1.5 -mx-2 -mb-1 px-2 py-1.5 rounded-md ${mine ? 'bg-white/15' : 'bg-emerald-50'}`}>
                  <Text className={`text-[12px] font-semibold ${mine ? 'text-white' : 'text-emerald-700'}`}>
                    Offer: {formatINR(m.offerAmount)}{m.offerStatus ? ` · ${m.offerStatus}` : ''}
                  </Text>
                </View>
              )}
              <View className={`mt-1 flex-row items-center gap-1 ${mine ? 'self-end' : 'self-start'}`}>
                <Text className={`text-[9.5px] ${mine ? 'text-white/70' : 'text-ink-400'}`}>{m.createdAt ? new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'now'}</Text>
                {mine && <Icon name="check-check" size={11} color="rgba(255,255,255,0.72)" />}
              </View>
            </View>
          </View>
          );
        })}
      </ScrollView>
      <View
        className="pt-2 border-t border-ink-200 bg-white"
        style={{
          paddingHorizontal: layout.gutter,
          marginBottom: keyboardBottomInset + composerKeyboardGap,
          paddingBottom: keyboardVisible ? 6 : Math.max(insets.bottom, 12),
          paddingLeft: Math.max(layout.gutter, insets.left || 0),
          paddingRight: Math.max(layout.gutter, insets.right || 0),
        }}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} className="mb-2">
          <Chip icon="tag">Send counter</Chip>
          <Chip icon="calendar">Suggest visit</Chip>
          <Chip icon="file-text">Share docs</Chip>
        </ScrollView>
        <View className="flex-row items-end gap-2">
          <View className="w-11 h-11 rounded-full bg-ink-100 items-center justify-center"><Icon name="paperclip" size={15} color="#0F172A" /></View>
          <View className="flex-1 min-h-11 max-h-28 px-4 py-2 rounded-3xl bg-ink-100 justify-center">
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Type a message..."
              placeholderTextColor="#94A3B8"
              multiline
              className="text-[14px] text-ink-900"
              style={{ minHeight: 24, maxHeight: 88, textAlignVertical: 'top', ...androidInputStyle(14) }}
            />
          </View>
          <Pressable
            onPress={send}
            disabled={!draft.trim() || sending}
            className={`w-11 h-11 rounded-full items-center justify-center ${draft.trim() && !sending ? 'bg-brand-600' : 'bg-ink-200'}`}
          >
            {sending ? <ActivityIndicator size="small" color="#64748B" /> : <Icon name="send" size={16} color="white" />}
          </Pressable>
        </View>
      </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
