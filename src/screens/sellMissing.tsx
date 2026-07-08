import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, View, Text, Pressable } from 'react-native';
import Icon from '../components/Icon';
import { Screen, TopBar, Field, Input, Toggle, Btn, Badge, PhotoPlaceholder, SuccessBurst, FadeInView } from '../components/shared';
import { formatINR } from '../data/data';
import { useFlowCompletionBack, useNav } from '../navigation/useNav';
import { useAppState } from '../state/AppState';
import { CustomerApiError } from '../api/customer';
import { getSellRequest, getSellValuationEstimate, submitSellRequest, updateSellRequest, SellRequest, SellValuationEstimate } from '../api/customer';
import { ctxSellRequestId, sellRequestIdOf, sellRequestLocation, sellRequestPhotoUrls, sellRequestTitle } from './sell';
import { SellHeader } from './sell';

function apiMessage(error: unknown, fallback = 'Something went wrong. Please try again.') {
  if (error instanceof CustomerApiError && Array.isArray(error.details)) {
    const fields = error.details
      .map((detail) => (typeof detail === 'object' && detail && 'field' in detail ? String((detail as { field?: string }).field || '') : ''))
      .filter(Boolean);
    if (fields.length) return `${error.message} Missing: ${fields.join(', ')}.`;
  }
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

function positiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function requestArea(request?: SellRequest | null, ctx?: any) {
  const specs = (request?.specifications ?? ctx?.sellRequest?.specifications ?? {}) as Record<string, unknown>;
  return positiveNumber(specs.builtUpArea)
    ?? positiveNumber(specs.carpetArea)
    ?? positiveNumber(specs.plotArea)
    ?? positiveNumber(specs.area)
    ?? positiveNumber(ctx?.basic?.builtUp)
    ?? positiveNumber(ctx?.details?.builtUp)
    ?? positiveNumber(ctx?.details?.area)
    ?? 1450;
}

// ─── SL-04 Property Details Form (dynamic based on type) ──────
export function SellPropertyDetailsScreen() {
  const { go, back, ctx } = useNav();
  const { authToken } = useAppState();
  const type = ctx?.type || 'apartment';
  const [data, setData] = useState({
    title: '', ownership: 'Freehold', facing: 'East', age: '', furnish: 'Unfurnished',
    bhk: '', builtUp: '', floor: '', area: '', landArea: '', parking: 1,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string, v: any) => setData((d) => ({ ...d, [k]: v }));
  const isValid = !!(data.title && data.ownership && ((type === 'apartment' || type === 'villa') ? data.bhk : true) && (data.builtUp || data.area) && authToken && ctxSellRequestId(ctx));
  const showBHK = type === 'apartment' || type === 'villa';
  const showBuiltUp = type === 'apartment' || type === 'villa' || type === 'commercial';
  const showArea = type === 'plot' || type === 'land';
  const saveAndContinue = async () => {
    if (!isValid || saving || !authToken) return;
    setSaving(true);
    setError('');
    try {
      const sellRequest = await updateSellRequest(authToken, ctxSellRequestId(ctx), {
        propertyTitle: data.title,
        propertyType: type,
        ownershipType: data.ownership,
        possessionStatus: data.age || ctx?.basic?.age || 'Ready to move',
        specifications: {
          ...(ctx?.sellRequest?.specifications ?? {}),
          title: data.title,
          bhk: data.bhk || ctx?.basic?.bhk,
          builtUpArea: data.builtUp ? Number(data.builtUp) : undefined,
          plotArea: data.area ? Number(data.area) : undefined,
          floor: data.floor || ctx?.basic?.floor,
          facing: data.facing,
          furnishing: data.furnish,
          parking: data.parking,
        },
        draftStep: 3,
      });
      go('sellPhotos', { ...ctx, details: data, sellRequest, sellRequestId: sellRequestIdOf(sellRequest) });
    } catch (e) {
      setError(apiMessage(e, 'Unable to save property details.'));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Screen padBottom>
      <SellHeader step={3} back={back} title="Property Details" />
      {!!error && <ErrorCard message={error} />}
      <View className="px-4 mt-4 gap-4">
        <Field label="Property Title" required><Input placeholder="e.g. Bright 3 BHK in Adyar" value={data.title} onChangeText={(v) => set('title', v)} /></Field>
        {showBHK && (
          <Field label="BHK" required>
            <View className="flex-row flex-wrap gap-2">
              {['1', '2', '3', '4', '5+'].map((b) => (
                <Pressable key={b} onPress={() => set('bhk', b)} className={`px-4 py-2 rounded-full ${data.bhk === b ? 'bg-brand-600' : 'bg-ink-100'}`}>
                  <Text className={`text-[12px] font-medium ${data.bhk === b ? 'text-white' : 'text-ink-700'}`}>{b}</Text>
                </Pressable>
              ))}
            </View>
          </Field>
        )}
        {showBuiltUp && <Field label="Built-up Area (sqft)" required><Input keyboardType="numeric" placeholder="e.g. 1200" value={data.builtUp} onChangeText={(v) => set('builtUp', v)} /></Field>}
        {showArea && <Field label="Plot Area (sqft)" required><Input keyboardType="numeric" placeholder="e.g. 2400" value={data.area} onChangeText={(v) => set('area', v)} /></Field>}
        <Field label="Facing Direction" required>
          <View className="flex-row gap-2">
            {['North', 'South', 'East', 'West'].map((f) => (
              <Pressable key={f} onPress={() => set('facing', f)} className={`flex-1 py-2 rounded-card border items-center ${data.facing === f ? 'border-brand-600 bg-brand-50' : 'border-ink-200'}`}>
                <Text className={`text-[12px] font-medium ${data.facing === f ? 'text-brand-700' : ''}`}>{f}</Text>
              </Pressable>
            ))}
          </View>
        </Field>
        <Field label="Ownership Type" required>
          <View className="flex-row flex-wrap gap-2">
            {['Freehold', 'Leasehold', 'Co-op', 'Power of Attorney'].map((o) => (
              <Pressable key={o} onPress={() => set('ownership', o)} style={{ width: '47%' }} className={`py-2 rounded-card border items-center ${data.ownership === o ? 'border-brand-600 bg-brand-50' : 'border-ink-200'}`}>
                <Text className={`text-[12px] ${data.ownership === o ? 'text-brand-700 font-semibold' : ''}`}>{o}</Text>
              </Pressable>
            ))}
          </View>
        </Field>
      </View>
      <View className="px-4 mt-4">
        <Pressable onPress={saveAndContinue} disabled={!isValid || saving} className={`w-full min-h-12 py-3 rounded-xl items-center justify-center ${isValid && !saving ? 'bg-brand-600' : 'bg-ink-100'}`}>
          <Text className={`font-semibold text-[15px] ${isValid && !saving ? 'text-white' : 'text-ink-400'}`}>{saving ? 'Saving...' : 'Continue to Photos'}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

// ─── SL-07 Expected Price Entry ───────────────────────────────
export function SellPriceEntryScreen() {
  const { go, back, ctx } = useNav();
  const { authToken } = useAppState();
  const [price, setPrice] = useState('');
  const [negotiable, setNegotiable] = useState(true);
  const [valuation, setValuation] = useState<SellValuationEstimate | null>(ctx?.valuationEstimate ?? null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateError, setEstimateError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const sellRequestId = ctxSellRequestId(ctx);
  const area = valuation?.area || requestArea(ctx?.sellRequest, ctx);
  const askingAmount = positiveNumber(price) ?? 0;
  const estimate = valuation;
  const pricePerSqft = askingAmount && area ? Math.round(askingAmount / area) : 0;
  const valid = !!(price && Number(price) > 0 && authToken && ctxSellRequestId(ctx));
  useEffect(() => {
    if (!authToken || !sellRequestId) return;
    setEstimateLoading(true);
    setEstimateError('');
    getSellValuationEstimate(authToken, sellRequestId)
      .then(setValuation)
      .catch((e) => setEstimateError(apiMessage(e, 'Live market estimate is unavailable.')))
      .finally(() => setEstimateLoading(false));
  }, [authToken, sellRequestId]);
  const saveAndContinue = async () => {
    if (!valid || saving || !authToken) return;
    setSaving(true);
    setError('');
    try {
      const sellRequest = await updateSellRequest(authToken, ctxSellRequestId(ctx), {
        askingPrice: Number(price),
        negotiable,
        draftStep: 6,
      });
      go('sellReview', { ...ctx, price, negotiable, valuationEstimate: valuation, sellRequest, sellRequestId: sellRequestIdOf(sellRequest) });
    } catch (e) {
      setError(apiMessage(e, 'Unable to save expected price.'));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Screen padBottom>
      <SellHeader step={6} back={back} title="Expected Price" />
      {!!error && <ErrorCard message={error} />}
      <View className="px-4 mt-4 gap-4">
        <Text className="text-[16px] font-semibold text-ink-900">Set your asking price</Text>
        <Field label="Expected Price (₹)" required><Input prefix="₹" keyboardType="numeric" placeholder="e.g. 8500000" value={price} onChangeText={setPrice} /></Field>
        {!!price && (
          <>
            <View className="p-3 bg-brand-50 rounded-card">
              <Text className="text-[12px] text-brand-700 mb-1">Price per sqft</Text>
              <Text className="text-[20px] font-bold text-brand-600">₹ {pricePerSqft}</Text>
            </View>
            <View className="rounded-card border border-ink-200 p-4">
              <View className="flex-row items-center gap-2 mb-3">
                <Icon name="trending-up" size={16} color="#1A6FFF" />
                <Text className="text-[13px] font-semibold flex-1">Market estimate</Text>
                {estimateLoading && <ActivityIndicator size="small" color="#1A6FFF" />}
                {valuation?.confidence && <Badge color={valuation.confidence === 'high' ? 'green' : valuation.confidence === 'medium' ? 'brand' : 'amber'}>{valuation.confidence}</Badge>}
              </View>
              <Text className="text-[12px] text-ink-600 leading-relaxed">
                {valuation?.basis || estimateError || 'Live market estimate will appear here after backend valuation completes.'}
              </Text>
              {valuation?.estimatedPrice && (
                <Text className="text-[12px] text-ink-700 mt-2">Suggested midpoint: <Text className="font-bold">{formatINR(valuation.estimatedPrice)}</Text>{typeof valuation.askingPriceDeltaPercent === 'number' ? ` · Your price is ${Math.abs(valuation.askingPriceDeltaPercent)}% ${valuation.askingPriceDeltaPercent >= 0 ? 'above' : 'below'}` : ''}</Text>
              )}
              {estimate ? (
                <View className="mt-2 flex-row items-center justify-between">
                  <View className="items-center flex-1"><Text className="text-[10px] text-ink-500">Low</Text><Text className="text-[16px] font-bold">{formatINR(estimate.low)}</Text></View>
                  <Text className="text-[12px] text-ink-400">—</Text>
                  <View className="items-center flex-1"><Text className="text-[10px] text-ink-500">High</Text><Text className="text-[16px] font-bold">{formatINR(estimate.high)}</Text></View>
                </View>
              ) : null}
            </View>
          </>
        )}
        <View className="flex-row items-center justify-between p-3 rounded-card border border-ink-200">
          <View><Text className="text-[14px] font-semibold">Price negotiable?</Text><Text className="text-[11px] text-ink-500">Buyers can request a quote</Text></View>
          <Toggle on={negotiable} onChange={setNegotiable} />
        </View>
      </View>
      <View className="px-4 mt-4">
        <Pressable onPress={saveAndContinue} disabled={!valid || saving} className={`w-full min-h-12 py-3 rounded-xl items-center justify-center ${valid && !saving ? 'bg-brand-600' : 'bg-ink-100'}`}>
          <Text className={`font-semibold text-[15px] ${valid && !saving ? 'text-white' : 'text-ink-400'}`}>{saving ? 'Saving...' : 'Review Listing'}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

// ─── SL Review Listing (pre-submit summary) ──────────────────
export function SellReviewScreen() {
  const { go, completeTo, back, ctx } = useNav();
  const { authToken } = useAppState();
  const [request, setRequest] = useState<SellRequest | null>(ctx?.sellRequest ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const sellRequestId = ctxSellRequestId(ctx);
  const photoUrls = sellRequestPhotoUrls(request, ctx);
  const photoCount = photoUrls.length || request?.photosCount || request?.photos?.length || 0;
  useEffect(() => {
    if (!authToken || !sellRequestId) return;
    getSellRequest(authToken, sellRequestId).then(setRequest).catch((e) => setError(apiMessage(e, 'Unable to refresh listing draft.')));
  }, [authToken, sellRequestId]);
  const handleSubmit = async () => {
    if (!authToken || !sellRequestId || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const submitted = await submitSellRequest(authToken, sellRequestId);
      completeTo('sellSuccess', { sellRequest: submitted, sellRequestId: sellRequestIdOf(submitted) });
    } catch (e) {
      setError(apiMessage(e, 'Unable to submit listing. Check all required details and try again.'));
    } finally {
      setSubmitting(false);
    }
  };
  const handleSaveDraft = async () => {
    if (!authToken || !sellRequestId) return;
    setError('');
    try {
      const saved = await updateSellRequest(authToken, sellRequestId, { draftStep: 7 });
      completeTo('draftSuccess', { sellRequest: saved, sellRequestId });
    } catch (e) {
      setError(apiMessage(e, 'Unable to save draft.'));
    }
  };
  const summary = [
    ['Basic Details', `${request?.specifications?.bhk ?? ctx?.basic?.bhk ?? 'BHK'} · ${request?.specifications?.builtUpArea ?? request?.specifications?.plotArea ?? 'Area'} sqft`, 'sellIntent'],
    ['Location', sellRequestLocation(request), 'sellAddress'],
    ['Pricing', request?.askingPrice ? `${formatINR(request.askingPrice)} · ${request.negotiable ? 'Negotiable' : 'Fixed'}` : 'Price pending', 'sellPrice'],
    ['Photos', `${photoCount} photos uploaded`, 'sellPhotos'],
    ['Amenities', `${request?.amenities?.length ?? 0} selected`, 'sellAmenities'],
  ];
  return (
    <Screen padBottom>
      <SellHeader step={7} back={back} title="Review Listing" />
      {!!error && <ErrorCard message={error} />}
      <View className="px-4 mt-4 gap-3">
        <PhotoPlaceholder tag="review" height={140} imageUri={photoUrls[0]} className="rounded-card">
          <View className="absolute top-3 left-3"><Badge color="amber">{request?.status ?? 'DRAFT'}</Badge></View>
        </PhotoPlaceholder>
        {photoUrls.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {photoUrls.slice(1).map((url, index) => (
              <Image key={`photo-${index + 1}`} source={{ uri: url }} style={{ width: 72, height: 72, borderRadius: 12 }} resizeMode="cover" />
            ))}
          </ScrollView>
        )}
        <View className="rounded-card bg-brand-50 border border-brand-100 p-3">
          <Text className="text-[13px] font-bold text-ink-900">{sellRequestTitle(request)}</Text>
          <Text className="text-[11.5px] text-ink-600 mt-0.5">Reference: {request?.referenceId ?? 'Will be generated after save'}</Text>
        </View>
        <View className="rounded-card border border-ink-200">
          {summary.map(([k, v, target], i) => (
            <Pressable key={k} onPress={() => go(target)} className={`flex-row items-center gap-3 p-3.5 ${i ? 'border-t border-ink-100' : ''}`}>
              <View className="flex-1">
                <Text className="text-[11px] text-ink-500">{k}</Text>
                <Text className="text-[13px] font-medium text-ink-900">{v}</Text>
              </View>
              <Icon name="pencil" size={14} color="#64748B" />
            </Pressable>
          ))}
        </View>
        <Pressable onPress={handleSubmit} disabled={submitting} className={`w-full min-h-[52px] py-3.5 rounded-card items-center justify-center flex-row gap-2 ${submitting ? 'bg-brand-400' : 'bg-brand-600'}`}>
          <Text className="text-white font-semibold text-[15px]">{submitting ? 'Submitting…' : 'Submit Listing'}</Text>
        </Pressable>
        <Pressable onPress={handleSaveDraft} className="w-full min-h-[52px] py-3.5 rounded-card items-center justify-center border border-ink-200 flex-row gap-1.5">
          <Text className="text-ink-700 font-semibold text-[15px]">Save as Draft</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

// ─── SL-08 Submission Confirmation ────────────────────────────
export function SellSuccessScreen() {
  const { go, resetTo, ctx } = useNav();
  useFlowCompletionBack();
  const { authToken } = useAppState();
  const [request, setRequest] = useState<SellRequest | null>(ctx?.sellRequest ?? null);
  const [error, setError] = useState('');
  useEffect(() => {
    const sellRequestId = ctxSellRequestId(ctx);
    if (!authToken || !sellRequestId) return;
    getSellRequest(authToken, sellRequestId).then(setRequest).catch((e) => setError(apiMessage(e, 'Unable to refresh submitted listing.')));
  }, [authToken, ctx]);
  const steps = [
    { num: '1', title: 'Document Review', desc: '12-24 hours' },
    { num: '2', title: 'Site Inspection', desc: '2-3 days' },
    { num: '3', title: 'Legal Verification', desc: '3-5 days' },
    { num: '4', title: 'Offer from Builtglory', desc: 'After verification' },
  ];
  return (
    <Screen fill>
      <View className="flex-1 items-center justify-center px-6">
        <SuccessBurst icon="party-popper" />
        <Text className="text-[22px] font-bold text-center">Your property has been submitted</Text>
        <Text className="text-ink-500 mt-2 max-w-[280px] text-[13px] leading-relaxed text-center">
          {request?.referenceId ? `${request.referenceId} is now ${request.status ?? 'submitted'}.` : "Builtglory team will review within 48 hours. You'll receive updates on your progress."}
        </Text>
        {!!error && <View className="mt-4 w-full"><ErrorCard message={error} /></View>}
        <View className="mt-6 rounded-card border border-ink-200 p-4 gap-3 w-full">
          <Text className="text-[12px] text-ink-500 font-semibold uppercase tracking-wider">4 next steps</Text>
          {steps.map((s, idx) => (
            <FadeInView key={s.num} delay={idx * 80} className="flex-row items-start gap-3">
              <View className="w-7 h-7 rounded-full bg-brand-100 items-center justify-center"><Text className="text-brand-600 font-bold text-[12px]">{s.num}</Text></View>
              <View><Text className="text-[13px] font-semibold text-ink-900">{s.title}</Text><Text className="text-[11px] text-ink-500">{s.desc}</Text></View>
            </FadeInView>
          ))}
        </View>
        <View className="mt-6 flex-row gap-2 w-full">
          <Btn variant="outline" className="flex-1" onPress={() => resetTo('home')}>Home</Btn>
          <Btn className="flex-1" onPress={() => go('myListings')}>My Listings</Btn>
        </View>
      </View>
    </Screen>
  );
}
