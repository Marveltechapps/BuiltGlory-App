import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, View, Text, Pressable } from 'react-native';
import Icon from '../components/Icon';
import { Screen, TopBar, Field, Input, Toggle, Btn, Badge, PhotoPlaceholder, SuccessBurst, FadeInView, PageBody } from '../components/shared';
import { gridItemWidth, useLayout } from '../layout/breakpoints';
import { formatINR } from '../data/data';
import { useFlowCompletionBack, useNav } from '../navigation/useNav';
import { useAppState } from '../state/AppState';
import { CustomerApiError } from '../api/customer';
import { getSellRequest, getSellValuationEstimate, submitSellRequest, updateSellRequest, SellRequest, SellValuationEstimate } from '../api/customer';
import { ctxSellRequestId, sellRequestIdOf, sellRequestLocation, sellRequestPhotoUrls, sellRequestTitle } from './sell';
import { SellHeader } from './sell';
import {
  COMMERCIAL_TYPE_OPTIONS,
  FACING_OPTIONS,
  FURNISH_OPTIONS,
  INTERIOR_SCOPE_OPTIONS,
  LEGAL_STRUCTURE_OPTIONS,
  OWNERSHIP_OPTIONS,
  PARKING_TYPE_OPTIONS,
  PLOT_APPROVAL_OPTIONS,
  POSSESSION_OPTIONS,
  SELL_LIMITS,
  clearFieldError,
  digitsOnly,
  firstErrorKey,
  hydrateSellDetails,
  isSectionValid,
  sellFieldVisibility,
  useSellFormScroll,
  validateSellDetails,
  validateSellPrice,
  validateSellReview,
  validateSellSubmission,
} from '../utils/sellValidation';

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
    ?? null;
}

function OptionChips({
  options,
  value,
  onChange,
  columns,
}: {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
  columns?: boolean;
}) {
  const layout = useLayout();
  const itemW = gridItemWidth(layout.contentWidth - layout.gutter * 2, 2, 8);
  return (
    <View className="flex-row flex-wrap" style={{ gap: 8 }}>
      {options.map((option) => {
        const active = value === option;
        return (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            style={columns ? { width: itemW } : undefined}
            className={`${columns ? 'py-2 px-1' : 'px-3 py-2'} rounded-card border items-center ${active ? 'border-brand-600 bg-brand-50' : 'border-ink-200'}`}
          >
            <Text className={`text-[12px] text-center ${active ? 'text-brand-700 font-semibold' : 'text-ink-700'}`} numberOfLines={2}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── SL-04 Property Details Form (dynamic based on type) ──────
export function SellPropertyDetailsScreen() {
  const { go, back, ctx } = useNav();
  const { authToken } = useAppState();
  const type = ctx?.type || ctx?.sellRequest?.propertyType || 'apartment';
  const visible = sellFieldVisibility(type);
  const [data, setData] = useState(() => hydrateSellDetails(ctx, ctx?.sellRequest));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { scrollRef, registerForm, registerField, scrollToField } = useSellFormScroll();
  const set = <K extends keyof typeof data>(key: K, value: (typeof data)[K]) => {
    setData((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => clearFieldError(current, String(key)));
  };
  const blurField = (key: keyof typeof data) => {
    const next = validateSellDetails({ ...data }, type);
    setFieldErrors((current) => {
      const updated = { ...current };
      if (next[String(key)]) updated[String(key)] = next[String(key)];
      else delete updated[String(key)];
      return updated;
    });
  };
  const saveAndContinue = async () => {
    if (saving || !authToken) return;
    const errors = validateSellDetails(data, type);
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
        propertyTitle: data.title.trim().slice(0, SELL_LIMITS.titleMax),
        propertyType: type,
        ownershipType: visible.ownership ? data.ownership : undefined,
        possessionStatus: visible.possession ? data.possession : (ctx?.basic?.age || undefined),
        loanOnProperty: visible.loan ? data.loanOnProperty : false,
        loanDetails: visible.loan && data.loanOnProperty
          ? { lender: data.loanLender.trim(), outstanding: Number(data.loanOutstanding) }
          : null,
        description: data.description.trim() || null,
        specifications: {
          ...(ctx?.sellRequest?.specifications ?? {}),
          title: data.title.trim(),
          ...(visible.bhk ? { bhk: data.bhk || ctx?.basic?.bhk } : {}),
          ...(visible.builtUp ? { builtUpArea: data.builtUp ? Number(data.builtUp) : undefined } : {}),
          ...(visible.plotArea ? { plotArea: data.area ? Number(data.area) : undefined, area: data.area ? Number(data.area) : undefined } : {}),
          ...(visible.floor ? { floor: data.floor || ctx?.basic?.floor } : {}),
          ...(visible.facing ? { facing: data.facing } : {}),
          ...(visible.furnishing ? { furnishing: data.furnish, furnishDetails: data.furnish === 'Unfurnished' ? null : data.furnishDetails.trim() } : {}),
          ...(visible.parking ? { parking: Number(data.parking), parkingCount: Number(data.parking), parkingType: Number(data.parking) > 0 ? data.parkingType : null } : {}),
          ...(visible.commercialType ? { commercialType: data.commercialType } : {}),
          ...(visible.rera ? { reraNumber: data.reraNumber.trim() || null } : {}),
          ...(visible.plotExtras ? { roadWidth: data.roadWidth ? Number(data.roadWidth) : null, approvalType: data.approvalType || null } : {}),
          ...(visible.nriFields ? {
            countryOfResidence: data.countryOfResidence.trim(),
            poaHolderName: data.poaHolderName.trim() || null,
            poaHolderPhone: data.poaHolderPhone || null,
            poaHolderEmail: data.poaHolderEmail.trim() || null,
          } : {}),
          ...(visible.fractionalFields ? {
            sharePercentage: Number(data.sharePercentage),
            totalPropertyValue: Number(data.totalPropertyValue),
            legalStructure: data.legalStructure,
          } : {}),
          ...(visible.interiorFields ? {
            scopeOfWork: data.scopeOfWork,
            budgetRange: data.budgetRange.trim(),
            expectedStartDate: data.expectedStartDate,
          } : {}),
          virtualTourUrl: data.virtualTourUrl.trim() || null,
        },
        draftStep: 4,
      });
      go('sellPhotos', { ...ctx, details: data, sellRequest, sellRequestId: sellRequestIdOf(sellRequest) });
    } catch (e) {
      setError(apiMessage(e, 'Unable to save property details.'));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Screen padBottom scrollRef={scrollRef}>
      <SellHeader step={3} back={back} title="Property Details" />
      {!!error && <ErrorCard message={error} />}
      <PageBody className="mt-4 gap-4" onLayout={(e) => registerForm(e.nativeEvent.layout.y)}>
        <View onLayout={(e) => registerField('title', e.nativeEvent.layout.y)}>
          <Field label="Property Title" required error={fieldErrors.title}>
            <Input placeholder="e.g. Bright 3 BHK in Adyar" value={data.title} maxLength={SELL_LIMITS.titleMax} invalid={!!fieldErrors.title} onChangeText={(v) => set('title', v)} onBlur={() => blurField('title')} />
          </Field>
        </View>
        {visible.bhk && (
          <View onLayout={(e) => registerField('bhk', e.nativeEvent.layout.y)}>
            <Field label="BHK" required error={fieldErrors.bhk}>
                <OptionChips options={['1', '2', '3', '4', '5+', 'Studio']} value={data.bhk.replace(/ BHK$/i, '')} onChange={(v) => set('bhk', v)} />
            </Field>
          </View>
        )}
        {visible.builtUp && (
          <View onLayout={(e) => registerField('builtUp', e.nativeEvent.layout.y)}>
            <Field label="Built-up Area (sqft)" required error={fieldErrors.builtUp}>
              <Input keyboardType="numeric" placeholder="e.g. 1200" value={data.builtUp} invalid={!!fieldErrors.builtUp} onChangeText={(v) => set('builtUp', digitsOnly(v))} onBlur={() => blurField('builtUp')} />
            </Field>
          </View>
        )}
        {visible.plotArea && (
          <View onLayout={(e) => registerField('area', e.nativeEvent.layout.y)}>
            <Field label="Plot Area (sqft)" required={type === 'plot' || type === 'land'} error={fieldErrors.area}>
              <Input keyboardType="numeric" placeholder="e.g. 2400" value={data.area} invalid={!!fieldErrors.area} onChangeText={(v) => set('area', digitsOnly(v))} onBlur={() => blurField('area')} />
            </Field>
          </View>
        )}
        {visible.commercialType && (
          <View onLayout={(e) => registerField('commercialType', e.nativeEvent.layout.y)}>
            <Field label="Commercial Type" required error={fieldErrors.commercialType}>
              <OptionChips options={COMMERCIAL_TYPE_OPTIONS} value={data.commercialType} onChange={(v) => set('commercialType', v)} />
            </Field>
          </View>
        )}
        {visible.facing && (
          <View onLayout={(e) => registerField('facing', e.nativeEvent.layout.y)}>
            <Field label="Facing Direction" required error={fieldErrors.facing}>
              <OptionChips options={FACING_OPTIONS} value={data.facing} onChange={(v) => set('facing', v)} />
            </Field>
          </View>
        )}
        {visible.ownership && (
          <View onLayout={(e) => registerField('ownership', e.nativeEvent.layout.y)}>
            <Field label="Ownership Type" required error={fieldErrors.ownership}>
              <OptionChips options={OWNERSHIP_OPTIONS} value={data.ownership} onChange={(v) => set('ownership', v)} columns />
            </Field>
          </View>
        )}
        {visible.possession && (
          <View onLayout={(e) => registerField('possession', e.nativeEvent.layout.y)}>
            <Field label="Possession Status" required error={fieldErrors.possession}>
              <OptionChips options={POSSESSION_OPTIONS} value={data.possession} onChange={(v) => set('possession', v)} />
            </Field>
          </View>
        )}
        {visible.furnishing && (
          <>
            <View onLayout={(e) => registerField('furnish', e.nativeEvent.layout.y)}>
              <Field label="Furnishing" required error={fieldErrors.furnish}>
                <OptionChips options={FURNISH_OPTIONS} value={data.furnish} onChange={(v) => set('furnish', v)} />
              </Field>
            </View>
            {data.furnish !== 'Unfurnished' && (
              <View onLayout={(e) => registerField('furnishDetails', e.nativeEvent.layout.y)}>
                <Field label="Furnishing Details" required error={fieldErrors.furnishDetails}>
                  <Input
                    multiline
                    placeholder="e.g. Modular kitchen, 3 ACs, wardrobes in all bedrooms"
                    value={data.furnishDetails}
                    maxLength={SELL_LIMITS.furnishDetailsMax}
                    invalid={!!fieldErrors.furnishDetails}
                    onChangeText={(v) => set('furnishDetails', v)}
                    onBlur={() => blurField('furnishDetails')}
                  />
                </Field>
              </View>
            )}
          </>
        )}
        {visible.parking && (
          <>
            <View onLayout={(e) => registerField('parking', e.nativeEvent.layout.y)}>
              <Field label="Parking Count" required error={fieldErrors.parking} hint="Enter 0 if there is no parking">
                <Input keyboardType="numeric" placeholder="e.g. 1" value={data.parking} invalid={!!fieldErrors.parking} onChangeText={(v) => set('parking', digitsOnly(v))} onBlur={() => blurField('parking')} />
              </Field>
            </View>
            {Number(data.parking) > 0 && (
              <View onLayout={(e) => registerField('parkingType', e.nativeEvent.layout.y)}>
                <Field label="Parking Type" required error={fieldErrors.parkingType}>
                  <OptionChips options={PARKING_TYPE_OPTIONS} value={data.parkingType} onChange={(v) => set('parkingType', v)} />
                </Field>
              </View>
            )}
          </>
        )}
        {visible.plotExtras && (
          <>
            <View onLayout={(e) => registerField('roadWidth', e.nativeEvent.layout.y)}>
              <Field label="Road Width (ft)" hint="Optional" error={fieldErrors.roadWidth}>
                <Input keyboardType="numeric" placeholder="e.g. 30" value={data.roadWidth} invalid={!!fieldErrors.roadWidth} onChangeText={(v) => set('roadWidth', digitsOnly(v))} onBlur={() => blurField('roadWidth')} />
              </Field>
            </View>
            <View onLayout={(e) => registerField('approvalType', e.nativeEvent.layout.y)}>
              <Field label="Approval Type" hint="Optional" error={fieldErrors.approvalType}>
                <OptionChips options={PLOT_APPROVAL_OPTIONS} value={data.approvalType} onChange={(v) => set('approvalType', v)} />
              </Field>
            </View>
          </>
        )}
        {visible.rera && (
          <View onLayout={(e) => registerField('reraNumber', e.nativeEvent.layout.y)}>
            <Field label="RERA Number" hint="Optional" error={fieldErrors.reraNumber}>
              <Input placeholder="e.g. TN/01/Building/0123/2024" value={data.reraNumber} maxLength={SELL_LIMITS.reraMax} invalid={!!fieldErrors.reraNumber} onChangeText={(v) => set('reraNumber', v)} onBlur={() => blurField('reraNumber')} />
            </Field>
          </View>
        )}
        {visible.nriFields && (
          <>
            <View onLayout={(e) => registerField('countryOfResidence', e.nativeEvent.layout.y)}>
              <Field label="Country of Residence" required error={fieldErrors.countryOfResidence}>
                <Input placeholder="e.g. United States" value={data.countryOfResidence} invalid={!!fieldErrors.countryOfResidence} onChangeText={(v) => set('countryOfResidence', v)} onBlur={() => blurField('countryOfResidence')} />
              </Field>
            </View>
            <View onLayout={(e) => registerField('poaHolderName', e.nativeEvent.layout.y)}>
              <Field label="POA Holder Name" required={data.ownership === 'Power of Attorney'} error={fieldErrors.poaHolderName}>
                <Input placeholder="Full name" value={data.poaHolderName} invalid={!!fieldErrors.poaHolderName} onChangeText={(v) => set('poaHolderName', v)} onBlur={() => blurField('poaHolderName')} />
              </Field>
            </View>
            <View onLayout={(e) => registerField('poaHolderPhone', e.nativeEvent.layout.y)}>
              <Field label="POA Holder Phone" required={data.ownership === 'Power of Attorney'} error={fieldErrors.poaHolderPhone}>
                <Input keyboardType="phone-pad" prefix="+91" maxLength={10} placeholder="9876543210" value={data.poaHolderPhone} invalid={!!fieldErrors.poaHolderPhone} onChangeText={(v) => set('poaHolderPhone', digitsOnly(v).slice(0, 10))} onBlur={() => blurField('poaHolderPhone')} />
              </Field>
            </View>
            <View onLayout={(e) => registerField('poaHolderEmail', e.nativeEvent.layout.y)}>
              <Field label="POA Holder Email" hint="Optional" error={fieldErrors.poaHolderEmail}>
                <Input keyboardType="email-address" autoCapitalize="none" placeholder="name@email.com" value={data.poaHolderEmail} invalid={!!fieldErrors.poaHolderEmail} onChangeText={(v) => set('poaHolderEmail', v)} onBlur={() => blurField('poaHolderEmail')} />
              </Field>
            </View>
          </>
        )}
        {visible.fractionalFields && (
          <>
            <View onLayout={(e) => registerField('sharePercentage', e.nativeEvent.layout.y)}>
              <Field label="Share Percentage" required error={fieldErrors.sharePercentage}>
                <Input keyboardType="numeric" placeholder="e.g. 10" value={data.sharePercentage} invalid={!!fieldErrors.sharePercentage} onChangeText={(v) => set('sharePercentage', v.replace(/[^\d.]/g, ''))} onBlur={() => blurField('sharePercentage')} />
              </Field>
            </View>
            <View onLayout={(e) => registerField('totalPropertyValue', e.nativeEvent.layout.y)}>
              <Field label="Total Property Value (₹)" required error={fieldErrors.totalPropertyValue}>
                <Input prefix="₹" keyboardType="numeric" placeholder="e.g. 25000000" value={data.totalPropertyValue} invalid={!!fieldErrors.totalPropertyValue} onChangeText={(v) => set('totalPropertyValue', digitsOnly(v))} onBlur={() => blurField('totalPropertyValue')} />
              </Field>
            </View>
            <View onLayout={(e) => registerField('legalStructure', e.nativeEvent.layout.y)}>
              <Field label="Legal Structure" required error={fieldErrors.legalStructure}>
                <OptionChips options={LEGAL_STRUCTURE_OPTIONS} value={data.legalStructure} onChange={(v) => set('legalStructure', v)} />
              </Field>
            </View>
          </>
        )}
        {visible.interiorFields && (
          <>
            <View onLayout={(e) => registerField('scopeOfWork', e.nativeEvent.layout.y)}>
              <Field label="Scope of Work" required error={fieldErrors.scopeOfWork}>
                <OptionChips options={INTERIOR_SCOPE_OPTIONS} value={data.scopeOfWork} onChange={(v) => set('scopeOfWork', v)} />
              </Field>
            </View>
            <View onLayout={(e) => registerField('budgetRange', e.nativeEvent.layout.y)}>
              <Field label="Budget Range" required error={fieldErrors.budgetRange}>
                <Input placeholder="e.g. 8–12 lakhs" value={data.budgetRange} invalid={!!fieldErrors.budgetRange} onChangeText={(v) => set('budgetRange', v)} onBlur={() => blurField('budgetRange')} />
              </Field>
            </View>
            <View onLayout={(e) => registerField('expectedStartDate', e.nativeEvent.layout.y)}>
              <Field label="Expected Start Date" required error={fieldErrors.expectedStartDate} hint="Use YYYY-MM-DD">
                <Input placeholder="2026-09-01" value={data.expectedStartDate} invalid={!!fieldErrors.expectedStartDate} onChangeText={(v) => set('expectedStartDate', v)} onBlur={() => blurField('expectedStartDate')} />
              </Field>
            </View>
          </>
        )}
        {visible.loan && (
          <>
            <View className="flex-row items-center justify-between p-3 rounded-card border border-ink-200">
              <View className="flex-1 pr-3">
                <Text className="text-[14px] font-semibold">Loan on property?</Text>
                <Text className="text-[11px] text-ink-500">Required if an outstanding home loan exists</Text>
              </View>
              <Toggle on={data.loanOnProperty} onChange={(v) => set('loanOnProperty', v)} />
            </View>
            {data.loanOnProperty && (
              <>
                <View onLayout={(e) => registerField('loanLender', e.nativeEvent.layout.y)}>
                  <Field label="Lender Name" required error={fieldErrors.loanLender}>
                    <Input placeholder="e.g. SBI, HDFC" value={data.loanLender} invalid={!!fieldErrors.loanLender} onChangeText={(v) => set('loanLender', v)} onBlur={() => blurField('loanLender')} />
                  </Field>
                </View>
                <View onLayout={(e) => registerField('loanOutstanding', e.nativeEvent.layout.y)}>
                  <Field label="Outstanding Amount (₹)" required error={fieldErrors.loanOutstanding}>
                    <Input prefix="₹" keyboardType="numeric" placeholder="e.g. 2500000" value={data.loanOutstanding} invalid={!!fieldErrors.loanOutstanding} onChangeText={(v) => set('loanOutstanding', digitsOnly(v))} onBlur={() => blurField('loanOutstanding')} />
                  </Field>
                </View>
              </>
            )}
          </>
        )}
        <View onLayout={(e) => registerField('virtualTourUrl', e.nativeEvent.layout.y)}>
          <Field label="Virtual Tour URL" hint="Optional" error={fieldErrors.virtualTourUrl}>
            <Input autoCapitalize="none" placeholder="https://..." value={data.virtualTourUrl} invalid={!!fieldErrors.virtualTourUrl} onChangeText={(v) => set('virtualTourUrl', v)} onBlur={() => blurField('virtualTourUrl')} />
          </Field>
        </View>
        <View onLayout={(e) => registerField('description', e.nativeEvent.layout.y)}>
          <Field label="Description" hint="Optional · at least 20 characters if provided" error={fieldErrors.description}>
            <Input multiline placeholder="Describe the property, neighbourhood and highlights" value={data.description} maxLength={SELL_LIMITS.descriptionMax} invalid={!!fieldErrors.description} onChangeText={(v) => set('description', v)} onBlur={() => blurField('description')} />
            <Text className="mt-1.5 text-[11px] text-ink-500">{data.description.length}/{SELL_LIMITS.descriptionMax}</Text>
          </Field>
        </View>
      </PageBody>
      <PageBody className="mt-4">
        <Pressable onPress={saveAndContinue} disabled={saving || !authToken} className={`w-full min-h-12 py-3 rounded-xl items-center justify-center ${saving || !authToken ? 'bg-ink-100' : 'bg-brand-600'}`}>
          <Text className={`font-semibold text-[15px] ${saving || !authToken ? 'text-ink-400' : 'text-white'}`}>{saving ? 'Saving...' : 'Continue to Photos'}</Text>
        </Pressable>
      </PageBody>
    </Screen>
  );
}

// ─── SL-07 Expected Price Entry ───────────────────────────────
export function SellPriceEntryScreen() {
  const { go, back, ctx } = useNav();
  const { authToken } = useAppState();
  const [price, setPrice] = useState(() => String(ctx?.price || ctx?.sellRequest?.askingPrice || ''));
  const [negotiable, setNegotiable] = useState(ctx?.negotiable ?? ctx?.sellRequest?.negotiable ?? true);
  const [valuation, setValuation] = useState<SellValuationEstimate | null>(ctx?.valuationEstimate ?? null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateError, setEstimateError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const { scrollRef, registerForm, registerField, scrollToField } = useSellFormScroll();
  const sellRequestId = ctxSellRequestId(ctx);
  const area = valuation?.area || requestArea(ctx?.sellRequest, ctx) || 0;
  const askingAmount = positiveNumber(price) ?? 0;
  const estimate = valuation;
  const pricePerSqft = askingAmount && area ? Math.round(askingAmount / area) : 0;
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
    if (saving || !authToken) return;
    const errors = validateSellPrice(price);
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
        askingPrice: Number(price),
        negotiable,
        draftStep: 7,
      });
      go('sellReview', { ...ctx, price, negotiable, valuationEstimate: valuation, sellRequest, sellRequestId: sellRequestIdOf(sellRequest) });
    } catch (e) {
      setError(apiMessage(e, 'Unable to save expected price.'));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Screen padBottom scrollRef={scrollRef}>
      <SellHeader step={6} back={back} title="Expected Price" />
      {!!error && <ErrorCard message={error} />}
      <PageBody className="mt-4 gap-4" onLayout={(e) => registerForm(e.nativeEvent.layout.y)}>
        <Text className="text-[16px] font-semibold text-ink-900">Set your asking price</Text>
        <View onLayout={(e) => registerField('price', e.nativeEvent.layout.y)}>
          <Field label="Expected Price (₹)" required error={fieldErrors.price} hint={`Minimum ₹${SELL_LIMITS.priceMin.toLocaleString('en-IN')}`}>
            <Input
              prefix="₹"
              keyboardType="numeric"
              placeholder="e.g. 8500000"
              value={price}
              invalid={!!fieldErrors.price}
              onChangeText={(v) => {
                setPrice(digitsOnly(v));
                setFieldErrors((current) => clearFieldError(current, 'price'));
              }}
              onBlur={() => {
                const errors = validateSellPrice(price);
                setFieldErrors(errors);
              }}
            />
          </Field>
        </View>
        {!!price && !fieldErrors.price && (
          <>
            <View className="p-3 bg-brand-50 rounded-card">
              <Text className="text-[12px] text-brand-700 mb-1">Price per sqft</Text>
              <Text className="text-[20px] font-bold text-brand-600">₹ {pricePerSqft.toLocaleString('en-IN')}</Text>
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
      </PageBody>
      <PageBody className="mt-4">
        <Pressable onPress={saveAndContinue} disabled={saving || !authToken} className={`w-full min-h-12 py-3 rounded-xl items-center justify-center ${saving || !authToken ? 'bg-ink-100' : 'bg-brand-600'}`}>
          <Text className={`font-semibold text-[15px] ${saving || !authToken ? 'text-ink-400' : 'text-white'}`}>{saving ? 'Saving...' : 'Review Listing'}</Text>
        </Pressable>
      </PageBody>
    </Screen>
  );
}

// ─── SL Review Listing (pre-submit summary) ──────────────────
export function SellReviewScreen() {
  const { go, completeTo, back, ctx } = useNav();
  const { authToken } = useAppState();
  const [request, setRequest] = useState<SellRequest | null>(ctx?.sellRequest ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  const submitLock = useRef(false);
  const sellRequestId = ctxSellRequestId(ctx);
  const photoUrls = sellRequestPhotoUrls(request, ctx);
  const photoCount = photoUrls.length || request?.photosCount || request?.photos?.length || 0;
  const sectionIssues = validateSellSubmission(request, ctx);
  useEffect(() => {
    if (!authToken || !sellRequestId) return;
    getSellRequest(authToken, sellRequestId).then(setRequest).catch((e) => setError(apiMessage(e, 'Unable to refresh listing draft.')));
  }, [authToken, sellRequestId]);
  const handleSubmit = async () => {
    if (!authToken || !sellRequestId || submitting || submitLock.current) return;
    const reviewErrors = validateSellReview(confirmed);
    setConfirmError(reviewErrors.confirmed || '');
    const issues = validateSellSubmission(request, ctx);
    if (issues.length || reviewErrors.confirmed) {
      setError(issues[0] ? `${issues[0].section}: ${issues[0].message}` : reviewErrors.confirmed);
      return;
    }
    submitLock.current = true;
    setSubmitting(true);
    setError('');
    try {
      const submitted = await submitSellRequest(authToken, sellRequestId);
      completeTo('sellSuccess', { sellRequest: submitted, sellRequestId: sellRequestIdOf(submitted) });
    } catch (e) {
      setError(apiMessage(e, 'Unable to submit listing. Check all required details and try again.'));
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };
  const handleSaveDraft = async () => {
    if (!authToken || !sellRequestId || savingDraft || submitting) return;
    setSavingDraft(true);
    setError('');
    try {
      const saved = await updateSellRequest(authToken, sellRequestId, { draftStep: 7 });
      completeTo('draftSuccess', { sellRequest: saved, sellRequestId });
    } catch (e) {
      setError(apiMessage(e, 'Unable to save draft.'));
    } finally {
      setSavingDraft(false);
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
      <PageBody className="mt-4 gap-3">
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
        {sectionIssues.length > 0 && (
          <View className="rounded-card border border-rose-200 bg-rose-50 p-3 gap-2">
            <Text className="text-[12px] font-semibold text-rose-700">Please fix these before submitting</Text>
            {sectionIssues.slice(0, 8).map((issue) => (
              <Pressable key={`${issue.screen}-${issue.field}`} onPress={() => go(issue.screen)} className="flex-row items-start gap-2">
                <Icon name="triangle-alert" size={14} color="#E11D48" />
                <Text className="flex-1 text-[12px] text-rose-700">{issue.section}: {issue.message}</Text>
              </Pressable>
            ))}
          </View>
        )}
        <Pressable
          onPress={() => {
            setConfirmed((current) => !current);
            setConfirmError('');
          }}
          className={`flex-row items-start gap-3 p-3 rounded-card border ${confirmError ? 'border-rose-500 bg-rose-50' : confirmed ? 'border-brand-600 bg-brand-50' : 'border-ink-200'}`}
        >
          <View className={`w-5 h-5 rounded border items-center justify-center ${confirmed ? 'bg-brand-600 border-brand-600' : 'border-ink-300 bg-white'}`}>
            {confirmed ? <Icon name="check" size={12} color="white" /> : null}
          </View>
          <Text className="flex-1 text-[12.5px] text-ink-700">I confirm that the property details, photos, price and ownership information are accurate.</Text>
        </Pressable>
        {!!confirmError && <Text className="text-[11.5px] text-rose-600 -mt-2">{confirmError}</Text>}
        <Pressable onPress={handleSubmit} disabled={submitting || savingDraft || sectionIssues.length > 0} className={`w-full min-h-[52px] py-3.5 rounded-card items-center justify-center flex-row gap-2 ${submitting || savingDraft || sectionIssues.length > 0 ? 'bg-ink-100' : 'bg-brand-600'}`}>
          <Text className={`font-semibold text-[15px] ${submitting || savingDraft || sectionIssues.length > 0 ? 'text-ink-400' : 'text-white'}`}>{submitting ? 'Submitting…' : 'Submit Listing'}</Text>
        </Pressable>
        <Pressable onPress={handleSaveDraft} disabled={savingDraft || submitting} className="w-full min-h-[52px] py-3.5 rounded-card items-center justify-center border border-ink-200 flex-row gap-1.5">
          <Text className="text-ink-700 font-semibold text-[15px]">{savingDraft ? 'Saving…' : 'Save as Draft'}</Text>
        </Pressable>
      </PageBody>
    </Screen>
  );
}

// ─── SL-08 Submission Confirmation ────────────────────────────
export function SellSuccessScreen() {
  const { openFromTabRoot, resetTo, ctx } = useNav();
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
          <Btn className="flex-1" onPress={() => openFromTabRoot('myListings')}>My Listings</Btn>
        </View>
      </View>
    </Screen>
  );
}
