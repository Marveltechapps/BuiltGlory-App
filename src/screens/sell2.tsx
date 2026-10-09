import React, { useEffect, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Icon from '../components/Icon';
import { Screen, TopBar, Field, Input, Btn, DocCard, Toast, useToast, Sheet, SuccessBurst, FadeInView, PageBody } from '../components/shared';
import { formatINR } from '../data/data';
import { useFlowCompletionBack, useNav } from '../navigation/useNav';
import { useAppState } from '../state/AppState';
import {
  getSellRequest,
  submitSellRequest,
  submitSellerOfferDecision,
  SellRequest,
  updateCurrentCustomer,
  updateSellRequest,
  uploadCustomerDocument,
} from '../api/customer';
import { ctxSellRequestId, sellDraftResumeContext, sellRequestIdOf, sellRequestTitle, useSellerActivityContext } from './sell';
import { isNetworkError, resourceErrorMessage } from '../utils/apiErrors';
import { findWorkflowDocument, sellerDealTimelineLabel } from '../utils/sellerDocuments';
import { LoadingBlock, OfflineCard } from '../components/screenStates';
import {
  SELL_LIMITS,
  clearFieldError,
  digitsOnly,
  firstErrorKey,
  isSectionValid,
  useSellFormScroll,
  validateDocumentAsset,
  validateEditListing,
} from '../utils/sellValidation';

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

function uploadFileName(asset: ImagePicker.ImagePickerAsset, fallback: string) {
  const extension = (asset.mimeType || '').split('/')[1] || asset.uri.split('.').pop() || 'jpg';
  return asset.fileName?.trim() || `${fallback}.${extension}`;
}

function uploadMimeType(asset: ImagePicker.ImagePickerAsset) {
  if (asset.mimeType) return asset.mimeType;
  return asset.uri.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
}

function inferLegalDocumentType(name: string, reason = '') {
  const text = `${name} ${reason}`.toLowerCase();
  if (text.includes('sale_deed') || text.includes('sale deed') || text.includes('title')) return 'sale_deed';
  if (text.includes('khata')) return 'khata_certificate';
  if (text.includes('tax')) return 'property_tax_receipt';
  if (text.includes('identity') || text.includes('aadhaar') || text.includes('pan') || text.includes('kyc')) return 'identity_proof';
  return name.replace(/\s+/g, '_').toLowerCase() || 'identity_proof';
}

function useSellRequestContext(ctx: any) {
  const { authToken } = useAppState();
  const [request, setRequest] = useState<SellRequest | null>(ctx?.sellRequest ?? ctx?.p ?? null);
  const [loading, setLoading] = useState(Boolean(ctx?.refresh || ctxSellRequestId(ctx)));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const sellRequestId = ctxSellRequestId(ctx);
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
      setRequest(await getSellRequest(authToken, sellRequestId));
      setError('');
      setOffline(false);
    } catch (e) {
      if (isNetworkError(e)) setOffline(true);
      if (!silent) setError(resourceErrorMessage(e, 'Unable to load sell request.'));
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
  return { authToken, request, setRequest, loading, refreshing, error, offline, load: () => load(false), refresh, sellRequestId };
}

// ─── SL-09 Edit Listing ──────────────────────────────────────
export function EditListingScreen() {
  const { go, completeTo, back, ctx } = useNav();
  const { authToken, request, setRequest, error, load, sellRequestId } = useSellRequestContext(ctx);
  const src: any = request || ctx?.p || {};
  const [data, setData] = useState({
    title: src.propertyTitle || src.title || '',
    price: src.askingPrice ? String(src.askingPrice) : src.price ? String(src.price) : '',
    area: src.specifications?.builtUpArea ? String(src.specifications.builtUpArea) : src.area ? String(src.area) : '',
    floor: src.specifications?.floor ? String(src.specifications.floor) : src.floor ? String(src.floor) : '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const { scrollRef, registerForm, registerField, scrollToField } = useSellFormScroll();
  const { msg, fire } = useToast();
  useEffect(() => {
    if (!request) return;
    setData({
      title: request.propertyTitle || '',
      price: request.askingPrice ? String(request.askingPrice) : '',
      area: request.specifications?.builtUpArea ? String(request.specifications.builtUpArea) : '',
      floor: typeof request.specifications?.floor === 'string' ? request.specifications.floor : '',
    });
  }, [request]);
  const canEdit = ['draft', 'changes_requested'].includes(request?.status || '');
  const save = async () => {
    if (!authToken || !sellRequestId) {
      fire('Please sign in again before saving.');
      return;
    }
    if (!canEdit) {
      fire('This listing can only be edited while it is a draft or when changes are requested.');
      return;
    }
    const errors = validateEditListing(data, request?.propertyType || ctx?.type);
    setFieldErrors(errors);
    if (!isSectionValid(errors)) {
      scrollToField(firstErrorKey(errors));
      fire(errors[firstErrorKey(errors)] || 'Please fix the highlighted fields.');
      return;
    }
    setSaved(true);
    try {
      const updated = await updateSellRequest(authToken, sellRequestId, {
        propertyTitle: data.title.trim().slice(0, SELL_LIMITS.titleMax),
        askingPrice: Number(data.price),
        specifications: { ...(request?.specifications ?? {}), builtUpArea: data.area ? Number(data.area) : undefined, floor: data.floor },
      });
      setRequest(updated);
      fire('Changes saved!');
      setTimeout(() => { setSaved(false); go('sellerDashboard'); }, 800);
    } catch (e) {
      setSaved(false);
      fire(apiMessage(e, 'Unable to save changes.'));
    }
  };
  const saveDraft = async () => {
    if (!authToken || !sellRequestId) {
      fire('Please sign in again before saving a draft.');
      return;
    }
    try {
      const updated = await updateSellRequest(authToken, sellRequestId, {
        propertyTitle: data.title,
        askingPrice: data.price ? Number(data.price) : undefined,
        specifications: { ...(request?.specifications ?? {}), builtUpArea: data.area ? Number(data.area) : undefined, floor: data.floor },
        draftStep: request?.draftStep ?? 7,
      });
      setRequest(updated);
      completeTo('draftSuccess', { data, sellRequest: updated, sellRequestId: sellRequestIdOf(updated) });
    } catch (e) {
      fire(apiMessage(e, 'Unable to save draft.'));
    }
  };
  const openPhotos = () => {
    if (!request) {
      fire('Listing details are still loading.');
      return;
    }
    go('sellPhotos', sellDraftResumeContext(request));
  };
  return (
    <Screen padBottom scrollRef={scrollRef}>
      <TopBar onBack={back} title="Edit Listing" sub={`Status: ${request?.status ?? 'loading'}`} />
      {!!error && <ErrorCard message={error} onRetry={load} />}
      <PageBody onLayout={(e) => registerForm(e.nativeEvent.layout.y)}>
        <View className="flex-row items-center gap-2 p-3 rounded-card bg-brand-50 mb-4">
          <Icon name="info" size={14} color="#1A6FFF" />
          <Text className="text-[12px] text-brand-700 flex-1">
            {canEdit
              ? 'You can edit this listing while it is a draft or after Builtglory requests changes.'
              : 'This listing is under review or live. Contact Builtglory if you need a change.'}
          </Text>
        </View>
        <View className="gap-4">
          <View onLayout={(e) => registerField('title', e.nativeEvent.layout.y)}>
            <Field label="Property Title" required error={fieldErrors.title}>
              <Input value={data.title} maxLength={SELL_LIMITS.titleMax} invalid={!!fieldErrors.title} onChangeText={(v) => { setData({ ...data, title: v }); setFieldErrors((current) => clearFieldError(current, 'title')); }} />
            </Field>
          </View>
          <View onLayout={(e) => registerField('price', e.nativeEvent.layout.y)}>
            <Field label="Asking Price (₹)" required error={fieldErrors.price}>
              <Input prefix="₹" keyboardType="numeric" value={data.price} invalid={!!fieldErrors.price} onChangeText={(v) => { setData({ ...data, price: digitsOnly(v) }); setFieldErrors((current) => clearFieldError(current, 'price')); }} />
            </Field>
          </View>
          <View className="flex-row gap-3">
            <View className="flex-1" onLayout={(e) => registerField('area', e.nativeEvent.layout.y)}>
              <Field label="Built-up Area" error={fieldErrors.area}>
                <Input keyboardType="numeric" value={data.area} invalid={!!fieldErrors.area} onChangeText={(v) => { setData({ ...data, area: digitsOnly(v) }); setFieldErrors((current) => clearFieldError(current, 'area')); }} />
              </Field>
            </View>
            <View className="flex-1" onLayout={(e) => registerField('floor', e.nativeEvent.layout.y)}>
              <Field label="Floor" error={fieldErrors.floor}>
                <Input keyboardType="numeric" value={data.floor} invalid={!!fieldErrors.floor} onChangeText={(v) => { setData({ ...data, floor: v.replace(/[^\d-]/g, '') }); setFieldErrors((current) => clearFieldError(current, 'floor')); }} />
              </Field>
            </View>
          </View>
          <Pressable onPress={openPhotos} className="w-full flex-row items-center justify-between p-3.5 rounded-card border border-ink-200">
            <Text className="text-[13px] font-semibold">Photos & Amenities</Text>
            <Icon name="chevron-right" size={16} color="#94A3B8" />
          </Pressable>
        </View>
      </PageBody>
      <Toast message={msg} />
      <View className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-ink-200 gap-2">
        <Pressable onPress={save} disabled={saved || !canEdit} className={`w-full min-h-12 py-3 rounded-xl items-center justify-center flex-row gap-2 ${saved ? 'bg-emerald-500' : canEdit ? 'bg-brand-600' : 'bg-ink-100'}`}>
          <Text className={`font-semibold text-[15px] ${canEdit || saved ? 'text-white' : 'text-ink-400'}`}>{saved ? 'Saved!' : 'Save Changes'}</Text>
        </Pressable>
        {request?.status === 'draft' && (
        <Pressable onPress={saveDraft} className="w-full min-h-12 py-3 rounded-xl items-center justify-center border border-ink-200">
          <Text className="text-ink-700 font-semibold text-[15px]">Save as Draft</Text>
        </Pressable>
        )}
      </View>
    </Screen>
  );
}

// ─── SL-08a Draft Save Success ───────────────────────────────
export function DraftSuccessScreen() {
  const { openFromTabRoot, resetTo, ctx } = useNav();
  useFlowCompletionBack();
  const draftData = ctx?.sellRequest || ctx?.data || {};
  return (
    <Screen fill>
      <View className="flex-1 items-center justify-center px-6">
        <SuccessBurst icon="save" color="#3B82F6" bgClassName="bg-blue-50" />
        <Text className="text-[22px] font-bold text-center">Draft saved successfully</Text>
        <Text className="text-ink-500 mt-2 max-w-[280px] text-[13px] leading-relaxed text-center">
          Your listing draft has been saved. You can continue editing it anytime from My Listings.
        </Text>
        {(draftData.propertyTitle || draftData.title) && (
          <View className="mt-6 rounded-card border border-ink-200 p-4 gap-3 w-full">
            <Text className="text-[12px] text-ink-500 font-semibold uppercase tracking-wider">Draft Details</Text>
            <FadeInView><Text className="text-[11px] text-ink-500">Property Title</Text><Text className="text-[13px] font-semibold">{draftData.propertyTitle || draftData.title}</Text></FadeInView>
            {draftData.referenceId && <FadeInView delay={80}><Text className="text-[11px] text-ink-500">Reference</Text><Text className="text-[13px] font-semibold">{draftData.referenceId}</Text></FadeInView>}
            <View className="flex-row gap-4">
              {(draftData.askingPrice || draftData.price) && <View><Text className="text-[11px] text-ink-500">Expected Price</Text><Text className="text-[13px] font-semibold text-brand-600">{formatINR(Number(draftData.askingPrice || draftData.price))}</Text></View>}
              {(draftData.specifications?.builtUpArea || draftData.area) && <View><Text className="text-[11px] text-ink-500">Area (sqft)</Text><Text className="text-[13px] font-semibold">{draftData.specifications?.builtUpArea || draftData.area}</Text></View>}
            </View>
          </View>
        )}
        <View className="mt-6 flex-row gap-2 w-full">
          <Btn variant="outline" className="flex-1" onPress={() => openFromTabRoot('myListings')}>My Listings</Btn>
          <Btn className="flex-1" onPress={() => resetTo('home')}>Home</Btn>
        </View>
      </View>
    </Screen>
  );
}

// ─── SL-10 Verification & Inspection Status ──────────────────
export function VerificationStatusScreen() {
  const { go, back, ctx } = useNav();
  const { request, loading, error, offline, load } = useSellRequestContext(ctx);
  const status = request?.status ?? 'draft';
  const hasChanges = status === 'changes_requested' || !!request?.changeRequests?.length || request?.documents?.some((doc) => doc.status === 'rejected' || doc.status === 'missing');
  const steps = [
    { title: 'Submitted', state: status !== 'draft' ? 'done' : 'future', date: request?.submittedAt ? new Date(request.submittedAt).toLocaleDateString() : undefined },
    { title: 'Verification Call', state: ['under_review', 'accepted', 'approved', 'active', 'negotiating', 'sold', 'changes_requested'].includes(status) ? 'done' : 'future', detail: status === 'under_review' ? 'Builtglory team is reviewing your request.' : undefined },
    { title: 'Document Verification', state: hasChanges ? 'alert' : ['approved', 'active', 'negotiating', 'sold'].includes(status) ? 'done' : 'future', detail: hasChanges ? (request?.changeRequests?.[0] ?? 'Action needed on documents or listing details.') : undefined, action: 'reupload' },
    { title: 'Site Inspection', state: ['active', 'negotiating', 'sold'].includes(status) ? 'done' : 'future' },
    { title: 'Legal Verification', state: ['active', 'negotiating', 'sold'].includes(status) ? 'done' : 'future' },
    { title: 'Valuation', state: ['negotiating', 'sold'].includes(status) ? 'done' : 'future' },
  ];
  const doneCount = steps.filter((step) => step.state === 'done').length;
  return (
    <Screen>
      <TopBar onBack={back} title="Verification Status" sub={sellRequestTitle(request)} />
      {loading && <LoadingBlock label="Loading listing verification status..." />}
      {offline && <OfflineCard onRetry={load} />}
      {!!error && <ErrorCard message={error} onRetry={load} />}
      <PageBody>
        <View className="rounded-card bg-ink-50 p-3 mb-5 flex-row items-center gap-3">
          <View className="w-11 h-11 rounded-full bg-amber-100 items-center justify-center"><Icon name="clock" size={20} color="#D97706" /></View>
          <View>
            <Text className="text-[13px] font-semibold">{status.replace(/_/g, ' ')} · {doneCount} of {steps.length} complete</Text>
            <Text className="text-[11.5px] text-ink-500">Most listings verify within 24–48 hrs</Text>
          </View>
        </View>
        <View className="gap-2">
          {steps.map((step, idx) => (
            <Pressable
              key={idx}
              onPress={() => step.action === 'reupload' && go('reupload', { sellRequest: request, sellRequestId: sellRequestIdOf(request) })}
              className={`p-4 rounded-card border ${step.state === 'done' ? 'border-emerald-200 bg-emerald-50' : step.state === 'alert' ? 'border-amber-200 bg-amber-50' : 'border-ink-200 bg-white'}`}
            >
              <View className="flex-row items-start gap-3">
                <View className={`w-7 h-7 rounded-full items-center justify-center ${step.state === 'done' ? 'bg-emerald-500' : step.state === 'alert' ? 'bg-amber-500' : 'bg-ink-200'}`}>
                  <Text className={`text-[12px] font-bold ${step.state === 'future' ? 'text-ink-600' : 'text-white'}`}>{step.state === 'done' ? '✓' : step.state === 'alert' ? '!' : idx + 1}</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-[14px] font-semibold text-ink-900">{step.title}</Text>
                  {step.date && <Text className="text-[11px] text-ink-500 mt-0.5">{step.date}</Text>}
                  {step.detail && <Text className="text-[12px] text-ink-700 mt-1">{step.detail}</Text>}
                </View>
                <Icon name="chevron-right" size={16} color="#94A3B8" />
              </View>
            </Pressable>
          ))}
        </View>
      </PageBody>
    </Screen>
  );
}

// ─── SL-11 Listing Re-upload ─────────────────────────────────
export function ReuploadScreen() {
  const { back, ctx } = useNav();
  const { authToken, request, setRequest, loading, error, offline, load, sellRequestId } = useSellRequestContext(ctx);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [uploadedDocs, setUploadedDocs] = useState<Record<string, any>>({});
  const flaggedDocs = request?.documents?.filter((doc) => doc.status === 'rejected' || doc.status === 'missing') ?? [];
  const flagged = flaggedDocs.length
    ? flaggedDocs.map((doc, index) => ({ id: doc.name || `doc-${index}`, name: doc.name || `Document ${index + 1}`, reason: doc.rejectionReason || 'Please re-upload this document clearly.' }))
    : (request?.changeRequests ?? ['Please re-upload requested seller documents.']).map((reason, index) => ({ id: `change-${index}`, name: `Requested document ${index + 1}`, reason }));
  const allDone = flagged.length > 0 && flagged.every((item) => uploadedDocs[item.id]);
  const pickDocument = async (item: { id: string; name: string }) => {
    if (!authToken || !sellRequestId) {
      setSaveError('Please sign in again before uploading documents.');
      return;
    }
    setSaveError('');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setSaveError('Photo library permission is required to upload this document.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: false,
      quality: 0.9,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const fileError = validateDocumentAsset(asset);
    if (fileError) {
      setSaveError(fileError);
      return;
    }
    setSaving(true);
    try {
      const uploaded = await uploadCustomerDocument(authToken, {
        ownerType: 'sell_request',
        ownerId: sellRequestId,
        purpose: 'legal',
        documentType: inferLegalDocumentType(item.name, item.reason),
        file: {
          uri: asset.uri,
          name: uploadFileName(asset, item.id),
          type: uploadMimeType(asset),
        },
      });
      setUploadedDocs((current) => ({ ...current, [item.id]: uploaded }));
    } catch (e) {
      setSaveError(apiMessage(e, 'Unable to upload this document.'));
    } finally {
      setSaving(false);
    }
  };
  const submit = async () => {
    if (saving || !authToken || !sellRequestId || !allDone) return;
    setSaving(true);
    setSaveError('');
    try {
      const replacementDocs = flagged.map((item) => {
        const doc = uploadedDocs[item.id];
        const documentType = inferLegalDocumentType(item.name, item.reason);
        return {
          documentId: doc?._id ?? doc?.id,
          name: documentType,
          documentType,
          status: doc?.status === 'uploaded' ? 'uploaded' : 'pending',
          scanStatus: doc?.scanStatus,
          fileUrl: doc?.url,
          uploadedAt: new Date().toISOString(),
        };
      });
      const existingDocs = (request?.documents ?? []).filter((doc) => !flagged.some((item) => item.name === doc.name));
      const updated = await updateSellRequest(authToken, sellRequestId, {
        documents: [...existingDocs, ...replacementDocs],
        changeRequests: [],
      });
      const resubmitted = updated.status === 'changes_requested'
        ? await submitSellRequest(authToken, sellRequestId)
        : updated;
      setRequest(resubmitted);
      back();
    } catch (e) {
      setSaveError(apiMessage(e, 'Unable to submit re-uploaded documents.'));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Screen padBottom>
      <TopBar onBack={back} title="Re-upload Documents" />
      {loading && <LoadingBlock label="Loading listing documents..." />}
      {offline && <OfflineCard onRetry={load} />}
      {!!error && <ErrorCard message={error} onRetry={load} />}
      {!!saveError && <ErrorCard message={saveError} />}
      <PageBody>
        <View className="flex-row items-center gap-2 p-3 rounded-card bg-amber-50 border border-amber-200 mb-4">
          <Icon name="triangle-alert" size={14} color="#D97706" /><Text className="text-[12px] text-amber-800 flex-1">Only flagged documents need re-uploading. Uploaded files are attached to this sell request for review.</Text>
        </View>
        <View className="gap-3">
          {flagged.map((f) => (
            <DocCard
              key={f.id}
              name={f.name}
              meta={uploadedDocs[f.id] ? 'Uploaded for review' : 'Upload required'}
              flagged
              reason={f.reason}
              action={
                <View className="px-3 pb-3">
                  <Pressable onPress={() => pickDocument(f)} disabled={saving} className="w-full min-h-10 py-2 rounded-card bg-brand-50 items-center justify-center flex-row gap-2">
                    <Text className="font-semibold text-[13px] text-brand-700">{uploadedDocs[f.id] ? 'Replace upload' : 'Upload document'}</Text>
                  </Pressable>
                </View>
              }
            />
          ))}
        </View>
      </PageBody>
      <View className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-ink-200">
        <Pressable onPress={submit} disabled={!allDone || saving} className={`w-full min-h-12 py-3 rounded-xl items-center justify-center ${allDone && !saving ? 'bg-brand-600' : 'bg-ink-100'}`}>
          <Text className={`font-semibold text-[15px] ${allDone && !saving ? 'text-white' : 'text-ink-400'}`}>{saving ? 'Submitting...' : 'Submit for Re-verification'}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

// ─── SL-12 Offer Screen ───────────────────────────────────────
export function OfferScreen() {
  const { go, back, ctx } = useNav();
  const { activity, request, loading, refreshing, error, offline, load, refresh, sellRequestId } = useSellerActivityContext(ctx);
  const initialExpirySeconds = Math.max(
    0,
    Math.floor((new Date((activity as any)?.offer?.expiresAt ?? 0).getTime() - Date.now()) / 1000),
  );
  const [secs, setSecs] = useState(initialExpirySeconds);
  useEffect(() => {
    const nextSecs = Math.max(
      0,
      Math.floor((new Date((activity as any)?.offer?.expiresAt ?? 0).getTime() - Date.now()) / 1000),
    );
    setSecs(nextSecs);
  }, [(activity as any)?.offer?.expiresAt]);
  useEffect(() => {
    if (secs <= 0) return;
    const t = setInterval(() => setSecs((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [secs > 0]);
  const hh = Math.floor(secs / 3600), mm = Math.floor((secs % 3600) / 60), ss = secs % 60;
  const offerAmount = activity?.offer?.amount || request?.sale?.salePrice || request?.askingPrice || 0;
  return (
    <Screen padBottom refreshing={refreshing} onRefresh={refresh}>
      <TopBar onBack={back} title="Builtglory Offer" sub={sellRequestTitle(request)} />
      {loading && <LoadingBlock label="Loading offer details..." />}
      {offline && <OfflineCard onRetry={load} />}
      {!!error && <ErrorCard message={error} onRetry={load} />}
      <PageBody>
        <View className="rounded-card border-2 border-brand-600 p-5 items-center mb-4">
          <Text className="text-[12px] text-ink-500 uppercase tracking-wider">Our offer for your property</Text>
          <Text className="text-[40px] font-bold text-brand-600 leading-display mt-1">{offerAmount ? formatINR(offerAmount) : 'Pending'}</Text>
          <View className="flex-row items-center gap-1 bg-emerald-50 px-2 py-1 rounded-full mt-2">
            <Icon name="trending-up" size={12} color="#10B981" /><Text className="text-[11.5px] text-emerald-700">{activity?.offer?.status ?? request?.status ?? 'pending'} status</Text>
          </View>
        </View>
        <View className="rounded-card bg-ink-900 p-4 mb-4">
          <Text className="text-[11px] text-white/60 uppercase tracking-wider text-center mb-2">Offer expires in</Text>
          <View className="flex-row justify-center gap-2">
            {[[hh, 'hrs'], [mm, 'min'], [ss, 'sec']].map(([v, l]) => (
              <View key={l as string} className="bg-white/10 rounded-md px-3 py-2 items-center" style={{ minWidth: 56 }}>
                <Text className="text-white text-[22px] font-bold leading-display">{String(v).padStart(2, '0')}</Text>
                <Text className="text-white/60 text-[9px] mt-1">{l}</Text>
              </View>
            ))}
          </View>
        </View>
        <View className="rounded-card bg-ink-50 p-3"><Text className="text-[12px] text-ink-600 leading-relaxed">This offer is loaded from your Builtglory acquisition workflow and reflects the latest valuation or negotiated amount.</Text></View>
      </PageBody>
      <View className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-ink-200 flex-row gap-2">
        <Btn variant="outline" className="flex-1" disabled={!offerAmount} onPress={() => go('acceptNegotiate', { mode: 'negotiate', sellRequest: request, sellRequestId, sellerActivity: activity, offerAmount })}>Negotiate</Btn>
        <Pressable disabled={!offerAmount} onPress={() => go('acceptNegotiate', { mode: 'accept', sellRequest: request, sellRequestId, sellerActivity: activity, offerAmount })} className={`flex-1 min-h-[52px] py-3.5 rounded-card items-center justify-center ${offerAmount ? 'bg-emerald-600' : 'bg-ink-100'}`}>
          <Text className="text-white font-semibold text-[15px]">Accept Offer</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

// ─── SL-13 Accept / Negotiate ────────────────────────────────
export function AcceptNegotiateScreen() {
  const { go, back, ctx } = useNav();
  const { authToken } = useAppState();
  const { activity, request, loading, error: loadError, offline, load } = useSellerActivityContext(ctx);
  const mode = ctx?.mode || 'negotiate';
  const [counter, setCounter] = useState('');
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const offerAmount = Number(
    ctx?.offerAmount
    || activity?.offer?.amount
    || ctx?.sellerActivity?.offer?.amount
    || request?.sale?.salePrice
    || request?.askingPrice
    || ctx?.sellRequest?.sale?.salePrice
    || ctx?.sellRequest?.askingPrice
    || 0,
  );
  const counterAmount = Number(counter);
  const requestNegotiationCallback = async (decision: 'accept' | 'negotiate') => {
    const sellRequestId = ctxSellRequestId(ctx);
    if (!authToken || !sellRequestId) {
      setError('Please sign in again before requesting negotiation support.');
      return;
    }
    if (decision === 'negotiate' && !(Number(counter) > 0)) {
      setError('Enter a valid counter offer.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const activity = await submitSellerOfferDecision(authToken, sellRequestId, decision === 'accept'
        ? { decision: 'accepted', notes: notes || null }
        : { decision: 'countered', counterAmount: Number(counter), notes: notes || null });
      if (decision === 'accept') go('dealConfirmed', { ...ctx, offerAmount: activity.offer?.amount || offerAmount, sellerActivity: activity, sellRequest: activity.sellRequest, sellRequestId });
      else setSubmitted(true);
    } catch (e) {
      setError(apiMessage(e, 'Unable to request negotiation support.'));
    } finally {
      setSaving(false);
    }
  };

  if (mode === 'accept') {
    return (
      <Screen>
        <TopBar onBack={back} title="Accept Offer" />
        {loading && <LoadingBlock label="Loading offer details..." />}
        {offline && <OfflineCard onRetry={load} />}
        {!!loadError && <ErrorCard message={loadError} onRetry={load} />}
        {!!error && <ErrorCard message={error} />}
        <PageBody>
          <View className="rounded-card border border-ink-200 p-5 items-center">
            <Text className="text-[12px] text-ink-500">You are accepting Builtglory's offer of</Text>
            <Text className="text-[32px] font-bold text-brand-600 mt-1">{formatINR(offerAmount)}</Text>
          </View>
          <View className="mt-4 p-3 rounded-card bg-ink-50"><Text className="text-[12px] text-ink-600 leading-relaxed">Once you confirm, we'll generate a term sheet and move to deal confirmation.</Text></View>
          <Btn className="w-full mt-5" onPress={() => setConfirm(true)}>Confirm & Accept</Btn>
        </PageBody>
        {confirm && (
          <Sheet onClose={() => setConfirm(false)} title="Confirm acceptance?">
            <Text className="text-[13px] text-ink-500 mb-5">You're accepting {formatINR(offerAmount)} for {sellRequestTitle(ctx?.sellRequest)}. We'll proceed to deal confirmation.</Text>
            <View className="gap-2">
              <Btn className="w-full" disabled={saving} onPress={() => requestNegotiationCallback('accept')}>{saving ? 'Accepting...' : 'Yes, Accept Offer'}</Btn>
              <Pressable onPress={() => setConfirm(false)} className="w-full min-h-12 py-3 rounded-xl items-center justify-center bg-ink-100"><Text className="text-ink-700 font-semibold text-[15px]">Go Back</Text></Pressable>
            </View>
          </Sheet>
        )}
      </Screen>
    );
  }

  if (submitted) {
    return (
      <Screen>
        <TopBar onBack={back} title="Counter Offer Sent" />
        <PageBody>
          <View className="rounded-card bg-amber-50 border border-amber-200 p-4 flex-row items-center gap-3">
            <View className="w-11 h-11 rounded-full bg-amber-100 items-center justify-center"><Icon name="loader-2" size={20} color="#D97706" /></View>
            <View className="flex-1">
              <Text className="text-[14px] font-semibold text-amber-900">Negotiation in progress</Text>
              <Text className="text-[12px] text-amber-700">Your counter of {formatINR(counterAmount)} was saved to the seller negotiation workflow.</Text>
            </View>
          </View>
          <View className="mt-4 rounded-card border border-ink-200">
            <View className="flex-row justify-between px-3 py-2.5"><Text className="text-[12px] text-ink-500">Builtglory offer</Text><Text className="text-[13px] font-semibold">{formatINR(offerAmount)}</Text></View>
            <View className="flex-row justify-between px-3 py-2.5 border-t border-ink-100"><Text className="text-[12px] text-ink-500">Your counter</Text><Text className="text-[13px] font-semibold text-brand-600">{formatINR(counterAmount)}</Text></View>
          </View>
          <Btn variant="outline" className="w-full mt-5" onPress={() => go('sellerDashboard')}>Back to My Listings</Btn>
        </PageBody>
      </Screen>
    );
  }

  return (
    <Screen padBottom>
      <TopBar onBack={back} title="Send Counter Offer" />
      {loading && <LoadingBlock label="Loading offer details..." />}
      {offline && <OfflineCard onRetry={load} />}
      {!!loadError && <ErrorCard message={loadError} onRetry={load} />}
      {!!error && <ErrorCard message={error} />}
      <PageBody>
        <View className="rounded-card bg-ink-50 p-3 mb-4 flex-row justify-between items-center">
          <Text className="text-[12px] text-ink-500">Builtglory's offer</Text>
          <Text className="text-[16px] font-bold">{formatINR(offerAmount)}</Text>
        </View>
        <Field label="Your counter offer (₹)" required><Input prefix="₹" keyboardType="numeric" placeholder="e.g. 8800000" value={counter} onChangeText={setCounter} /></Field>
        {!!counter && <Text className="text-[12px] text-brand-700 -mt-2 mb-2">≈ {formatINR(Number(counter))}</Text>}
        <Field label="Notes (optional)"><Input multiline placeholder="Add a note to support your counter offer…" value={notes} onChangeText={setNotes} /></Field>
      </PageBody>
      <View className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-ink-200">
        <Pressable onPress={() => counter && requestNegotiationCallback('negotiate')} disabled={!counter || saving} className={`w-full min-h-12 py-3 rounded-xl items-center justify-center ${counter && !saving ? 'bg-brand-600' : 'bg-ink-100'}`}>
          <Text className={`font-semibold text-[15px] ${counter && !saving ? 'text-white' : 'text-ink-400'}`}>{saving ? 'Submitting...' : 'Submit Counter Offer'}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

// ─── SL-14 Deal Confirmed + Bank Details ─────────────────────
export function DealConfirmedScreen() {
  const { go, back, ctx } = useNav();
  const { authToken, request, loading, error: requestError, offline, load } = useSellRequestContext(ctx);
  const { activity, loading: activityLoading, error: activityError, offline: activityOffline, load: loadActivity } = useSellerActivityContext(ctx);
  const [bank, setBank] = useState({ holder: '', name: '', acc: '', accConfirm: '', ifsc: '', branch: '', upi: '' });
  const [confirmedDeal, setConfirmedDeal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string, v: string) => setBank((b) => ({ ...b, [k]: v }));
  const accMatch = bank.acc && bank.acc === bank.accConfirm;
  const valid = bank.holder && bank.name && accMatch && bank.ifsc.length >= 6;
  const offerAmount = Number(ctx?.offerAmount || activity?.offer?.amount || request?.sale?.salePrice || request?.askingPrice || 0);
  const termSheet = findWorkflowDocument(activity, ['term sheet', 'sale agreement', 'sale_agreement']);
  const timelineLabel = sellerDealTimelineLabel(activity);
  const screenLoading = loading || activityLoading;
  const screenError = requestError || activityError;
  const screenOffline = offline || activityOffline;
  const retryLoad = () => {
    load();
    loadActivity();
  };
  const saveBankDetails = async () => {
    if (!authToken || !valid || saving) return;
    setSaving(true);
    setError('');
    try {
      await updateCurrentCustomer(authToken, {
        bankDetails: {
          accountHolderName: bank.holder,
          bankName: bank.name,
          accountNumberLast4: bank.acc.slice(-4),
          ifsc: bank.ifsc,
          branch: bank.branch || null,
          upiId: bank.upi || null,
          updatedAt: new Date().toISOString(),
        },
      });
      go('paymentSchedule', { ...ctx, offerAmount, sellRequest: request, sellRequestId: ctxSellRequestId(ctx) });
    } catch (e) {
      setError(apiMessage(e, 'Unable to save bank details.'));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Screen padBottom>
      <TopBar onBack={back} title="Deal Confirmed" />
      {screenLoading && <LoadingBlock label="Loading deal details..." />}
      {screenOffline && <OfflineCard onRetry={retryLoad} />}
      {!!screenError && <ErrorCard message={screenError} onRetry={retryLoad} />}
      {!!error && <ErrorCard message={error} />}
      <PageBody>
        <View className="rounded-card border border-emerald-200 bg-emerald-50/40 p-4 mb-5">
          <View className="flex-row items-center gap-2 mb-3"><Icon name="circle-check" size={18} color="#10B981" /><Text className="text-[14px] font-bold text-emerald-800">Deal agreed</Text></View>
          <View className="gap-2.5">
            <View className="flex-row justify-between"><Text className="text-[12px] text-ink-500">Final agreed price</Text><Text className="text-[15px] font-bold">{formatINR(offerAmount)}</Text></View>
            <Pressable
              className={`flex-row items-center gap-2 px-3 py-2.5 rounded-card bg-white border border-ink-200 ${termSheet ? '' : 'opacity-60'}`}
              disabled={!termSheet}
              onPress={() => termSheet && go('pdfViewer', { doc: termSheet, from: 'dealConfirmed' })}
            >
              <Icon name="file-text" size={16} color="#E11D48" />
              <Text className="flex-1 text-[13px] font-semibold">{termSheet?.name ?? 'Term sheet pending'}</Text>
              <Icon name="chevron-right" size={15} color="#94A3B8" />
            </Pressable>
            <View className="flex-row justify-between"><Text className="text-[12px] text-ink-500">Expected timeline</Text><Text className="text-[13px] font-semibold">{timelineLabel}</Text></View>
          </View>
          {!confirmedDeal ? (
            <Btn className="w-full mt-3" size="sm" onPress={() => setConfirmedDeal(true)}>Confirm Deal</Btn>
          ) : (
            <View className="mt-3 flex-row items-center gap-1.5"><Icon name="check-circle" size={14} color="#10B981" /><Text className="text-[12px] text-emerald-700 font-semibold">Deal confirmed — now add your bank details</Text></View>
          )}
        </View>
        <Text className="text-[14px] font-semibold mb-3">Your bank details for payout</Text>
        <View className="gap-3">
          <Field label="Account Holder Name" required><Input value={bank.holder} onChangeText={(v) => set('holder', v)} placeholder="As per bank records" /></Field>
          <Field label="Bank Name" required><Input value={bank.name} onChangeText={(v) => set('name', v)} placeholder="e.g. HDFC Bank" /></Field>
          <Field label="Account Number" required><Input keyboardType="numeric" value={bank.acc} onChangeText={(v) => set('acc', v)} placeholder="Enter account number" /></Field>
          <Field label="Confirm Account Number" required>
            <Input keyboardType="numeric" value={bank.accConfirm} onChangeText={(v) => set('accConfirm', v)} placeholder="Re-enter account number" />
            {!!bank.accConfirm && !accMatch && <Text className="text-[11px] text-rose-500 mt-1.5">Account numbers don't match</Text>}
          </Field>
          <Field label="IFSC Code" required><Input value={bank.ifsc} onChangeText={(v) => set('ifsc', v.toUpperCase())} placeholder="e.g. HDFC0001234" /></Field>
          <View className="flex-row gap-3">
            <View className="flex-1"><Field label="Branch (optional)"><Input value={bank.branch} onChangeText={(v) => set('branch', v)} /></Field></View>
            <View className="flex-1"><Field label="UPI ID (optional)"><Input value={bank.upi} onChangeText={(v) => set('upi', v)} /></Field></View>
          </View>
        </View>
      </PageBody>
      <View className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-ink-200">
        <Pressable onPress={saveBankDetails} disabled={!(confirmedDeal && valid) || saving} className={`w-full min-h-12 py-3 rounded-xl items-center justify-center ${confirmedDeal && valid && !saving ? 'bg-brand-600' : 'bg-ink-100'}`}>
          <Text className={`font-semibold text-[15px] ${confirmedDeal && valid && !saving ? 'text-white' : 'text-ink-400'}`}>{saving ? 'Saving...' : 'Save Bank Details'}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

// ─── SL-15 Payment Schedule ───────────────────────────────────
export function PaymentScheduleScreen() {
  const { go, back, ctx } = useNav();
  const { activity, loading, refreshing, error, offline, load, refresh } = useSellerActivityContext(ctx);
  const offerAmount = Number(ctx?.offerAmount || activity?.offer?.amount || ctx?.sellRequest?.sale?.salePrice || ctx?.sellRequest?.askingPrice || 0);
  const schedule = activity?.payoutSchedule ?? [];
  return (
    <Screen padBottom refreshing={refreshing} onRefresh={refresh}>
      <TopBar onBack={back} title="Payment Schedule" />
      {loading && <LoadingBlock label="Loading payout schedule..." />}
      {offline && <OfflineCard onRetry={load} />}
      {!!error && <ErrorCard message={error} onRetry={load} />}
      <PageBody className="gap-3">
        {schedule.length ? schedule.map((item) => (
          <View key={item.key} className="rounded-card border border-ink-200 p-4">
            <View className="flex-row items-center justify-between mb-1"><Text className="text-[13px] font-semibold">{item.label}</Text><Text className="text-[16px] font-bold text-brand-600">{formatINR(item.amount)}</Text></View>
            <Text className="text-[11.5px] text-ink-500">{item.dueLabel || 'Due as per agreement'} · payout status {item.status ?? 'pending'}</Text>
          </View>
        )) : (
          <View className="rounded-card border border-amber-200 bg-amber-50 p-4">
            <Text className="text-[13px] font-semibold text-amber-900">Payout schedule pending</Text>
            <Text className="text-[12px] text-amber-800 mt-1">Builtglory will publish the seller payout schedule after the deal terms are finalized.</Text>
          </View>
        )}
        <View className="rounded-card border border-ink-200 p-4 flex-row items-center justify-between">
          <Text className="text-[13px] font-semibold">Payment Mode</Text>
          <Text className="text-[13px] text-ink-700">Bank Transfer (escrow)</Text>
        </View>
        <View className="rounded-card bg-ink-900 p-4 flex-row items-center justify-between">
          <Text className="text-[12px] text-white/70 uppercase tracking-wider">Total</Text>
          <Text className="text-[22px] font-bold text-white">{formatINR(offerAmount)}</Text>
        </View>
      </PageBody>
      <View className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-ink-200">
        <Btn className="w-full" disabled={!schedule.length} onPress={() => go('sellRegistration', { ...ctx, sellerActivity: activity })}>Confirm Schedule</Btn>
      </View>
    </Screen>
  );
}

// ─── SL-16 Registration Appointment ──────────────────────────
export function SellRegistrationScreen() {
  const { completeTo, back, ctx } = useNav();
  const { activity, request, loading, error, offline, load } = useSellerActivityContext(ctx);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const appointment = activity?.registration?.appointment ?? ctx?.sellerActivity?.registration?.appointment;
  const docs = activity?.registration?.checklist ?? [];
  const allChecked = docs.length > 0 && docs.every((d) => checks[d]);
  const { msg, fire } = useToast();
  const appointmentDate = appointment?.date ? new Date(appointment.date).toLocaleDateString() : 'Appointment pending';
  const appointmentTime = appointment?.time || 'Time pending';
  const officeName = appointment?.officeName || 'Sub-Registrar Office';
  const officeAddress = appointment?.address || 'Address will appear once registration is scheduled.';
  return (
    <Screen padBottom>
      <TopBar onBack={back} title="Registration Appointment" />
      {loading && <LoadingBlock label="Loading registration details..." />}
      {offline && <OfflineCard onRetry={load} />}
      {!!error && <ErrorCard message={error} onRetry={load} />}
      <PageBody>
        <View className="rounded-card border border-ink-200 overflow-hidden mb-4">
          <View className="bg-brand-600 px-4 py-3">
            <Text className="text-[11px] uppercase tracking-wider text-white/80">Appointment</Text>
            <Text className="text-[20px] font-bold text-white mt-1">{appointmentDate}</Text>
            <Text className="text-[13px] text-white">{appointmentTime}</Text>
          </View>
          <View className="flex-row items-center gap-3 p-3.5">
            <View className="w-10 h-10 rounded-full bg-brand-50 items-center justify-center"><Icon name="landmark" size={18} color="#1A6FFF" /></View>
            <View className="flex-1">
              <Text className="text-[13px] font-semibold">{officeName}</Text>
              <Text className="text-[11.5px] text-ink-500">{officeAddress}</Text>
            </View>
          </View>
        </View>
        <Text className="text-[14px] font-semibold mb-2">Documents to carry</Text>
        {docs.length ? (
          <View className="rounded-card border border-ink-200 mb-4">
            {docs.map((d, i) => (
              <Pressable key={d} onPress={() => setChecks((c) => ({ ...c, [d]: !c[d] }))} className={`flex-row items-center gap-3 p-3 ${i ? 'border-t border-ink-100' : ''}`}>
                <View className={`w-5 h-5 rounded-md border-2 items-center justify-center ${checks[d] ? 'bg-brand-600 border-brand-600' : 'border-ink-300'}`}>
                  {checks[d] && <Icon name="check" size={12} color="white" strokeWidth={3} />}
                </View>
                <Text className={`text-[13px] ${checks[d] ? 'text-ink-400 line-through' : 'text-ink-800'}`}>{d}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <View className="rounded-card border border-amber-200 bg-amber-50 p-4 mb-4">
            <Text className="text-[13px] font-semibold text-amber-900">Registration checklist pending</Text>
            <Text className="text-[12px] text-amber-800 mt-1">Builtglory will publish the required carry-list when registration is scheduled.</Text>
          </View>
        )}
        <Btn variant="outline" className="w-full" icon="calendar-plus" onPress={() => fire(appointment ? 'Use your device calendar to add this appointment.' : 'Appointment is not scheduled yet.')}>Calendar reminder</Btn>
      </PageBody>
      <Toast message={msg} />
      <View className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-ink-200">
        <Pressable onPress={() => completeTo('dealComplete', { ...ctx, sellRequest: request })} disabled={!allChecked} className={`w-full min-h-12 py-3 rounded-xl items-center justify-center ${allChecked ? 'bg-brand-600' : 'bg-ink-100'}`}>
          <Text className={`font-semibold text-[15px] ${allChecked ? 'text-white' : 'text-ink-400'}`}>Confirm Appointment</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

// ─── SL-17 Deal Complete ─────────────────────────────────────
export function DealCompleteScreen() {
  const { go, resetTo, ctx } = useNav();
  useFlowCompletionBack();
  const { request, loading, error, offline, load } = useSellRequestContext(ctx);
  const { activity } = useSellerActivityContext(ctx);
  const saleDeed = findWorkflowDocument(activity, ['sale deed', 'sale_deed']);
  const payoutComplete = (activity?.payoutSchedule ?? []).length > 0
    && (activity?.payoutSchedule ?? []).every((item) => item.status === 'paid');
  const registrationComplete = activity?.registration?.status === 'completed'
    || String((activity?.acquisition as Record<string, unknown> | null | undefined)?.stage ?? '') === 'acquired';
  const paymentLabel = payoutComplete ? '✓ Received' : (activity?.payoutSchedule?.some((item) => item.status === 'paid') ? 'In progress' : 'Pending');
  const registrationLabel = registrationComplete ? '✓ Completed' : (activity?.registration?.appointment ? 'Scheduled' : 'Pending');
  return (
    <Screen fill>
      {loading && <LoadingBlock label="Loading deal summary..." />}
      {offline && <OfflineCard onRetry={load} />}
      {!!error && <ErrorCard message={error} onRetry={load} />}
      <View className="flex-1 items-center justify-center px-6">
        <SuccessBurst icon="party-popper" />
        <Text className="text-[22px] font-bold text-center">Your property has been sold</Text>
        <Text className="text-ink-500 mt-2 text-[13px] max-w-[250px] leading-relaxed text-center">Congratulations! The deal for {sellRequestTitle(request || ctx?.sellRequest)} is complete.</Text>
        <View className="mt-6 rounded-card border border-ink-200 w-full">
          <FadeInView className="flex-row items-center justify-between px-4 py-3"><Text className="text-[13px] font-medium">Payment</Text><Text className={`text-[12px] font-semibold ${payoutComplete ? 'text-emerald-700' : 'text-ink-600'}`}>{paymentLabel}</Text></FadeInView>
          <FadeInView delay={80} className="flex-row items-center justify-between px-4 py-3 border-t border-ink-100"><Text className="text-[13px] font-medium">Registration</Text><Text className={`text-[12px] font-semibold ${registrationComplete ? 'text-emerald-700' : 'text-ink-600'}`}>{registrationLabel}</Text></FadeInView>
        </View>
        <Btn
          className="w-full mt-5"
          icon="file-text"
          disabled={!saleDeed}
          onPress={() => saleDeed && go('pdfViewer', { doc: saleDeed, from: 'dealComplete' })}
        >
          {saleDeed ? `View ${saleDeed.name}` : 'Sale deed pending'}
        </Btn>
        <Btn className="w-full mt-3" onPress={() => resetTo('home')}>Go to Home</Btn>
        <Pressable onPress={() => go('help')} className="mt-4"><Text className="text-[13px] text-brand-600 font-semibold">Contact Builtglory</Text></Pressable>
      </View>
    </Screen>
  );
}

// ─── SL-18 Rejected Listing ───────────────────────────────────
export function RejectedListingScreen() {
  const { go, back, ctx } = useNav();
  const { request, loading, error, offline, load } = useSellRequestContext(ctx);
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <Screen>
      <TopBar onBack={back} title="Listing Rejected" />
      {loading && <LoadingBlock label="Loading listing details..." />}
      {offline && <OfflineCard onRetry={load} />}
      {!!error && <ErrorCard message={error} onRetry={load} />}
      <PageBody>
        <View className="rounded-card border border-rose-200 bg-rose-50/50 p-4 flex-row gap-3 mb-4">
          <Icon name="circle-x" size={20} color="#E11D48" />
          <View>
            <Text className="text-[14px] font-semibold text-rose-800">Listing could not be approved</Text>
            <Text className="text-[12.5px] text-rose-700 mt-0.5">Reason: {request?.rejectionReason || request?.changeRequests?.[0] || 'Builtglory review team requested changes.'}</Text>
          </View>
        </View>
        <View className="flex-row items-center gap-2 p-3 rounded-card bg-ink-50 mb-5">
          <Icon name="shield-check" size={14} color="#10B981" /><Text className="text-[12px] text-ink-600 flex-1">All your uploaded documents remain safe in your account.</Text>
        </View>
        <View className="gap-2">
          <Btn variant="outline" className="w-full" icon="headphones" onPress={() => go('help')}>Contact Builtglory Team</Btn>
          <Pressable onPress={() => setConfirmDelete(true)} className="w-full min-h-12 py-3 rounded-xl items-center justify-center"><Text className="text-rose-600 font-medium text-[14px]">Delete Listing</Text></Pressable>
        </View>
      </PageBody>
      {confirmDelete && (
        <Sheet onClose={() => setConfirmDelete(false)} title="Delete this listing?">
          <Text className="text-[13px] text-ink-500 mb-5">This permanently removes the listing. Your uploaded documents stay in your account.</Text>
          <View className="gap-2">
            <Pressable onPress={() => go('sellerDashboard')} className="w-full min-h-12 py-3 rounded-xl items-center justify-center bg-rose-600"><Text className="text-white font-semibold text-[15px]">Delete Listing</Text></Pressable>
            <Pressable onPress={() => setConfirmDelete(false)} className="w-full min-h-12 py-3 rounded-xl items-center justify-center bg-ink-100"><Text className="text-ink-700 font-semibold text-[15px]">Keep Listing</Text></Pressable>
          </View>
        </Sheet>
      )}
    </Screen>
  );
}
