import React, { useCallback, useEffect, useState } from 'react';
import { Linking, View, Text, Pressable } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import Icon from '../components/Icon';
import { Screen, TopBar, Field, DocCard, Btn, PhotoPlaceholder, Toast, useToast, Sheet, Spinner, SuccessBurst, ShakeView } from '../components/shared';
import { formatINR } from '../data/data';
import { useFlowCompletionBack, useNav } from '../navigation/useNav';
import { useAppState } from '../state/AppState';
import { usePolling } from '../hooks/usePolling';
import { BUY_ENQUIRIES_CACHE_PREFIX } from '../state/primaryTabCache';
import { enquiryId, formatPaymentStatus } from '../utils/buyEnquiryStatus';
import {
  BuyEnquiry,
  cancelBuyEnquiry,
  createTokenPayment,
  CustomerPayment,
  CustomerProperty,
  getBuyEnquiry,
  getCustomerDocumentReadUrl,
  getCustomerProperty,
  getPublicAppConfig,
  listCustomerPayments,
} from '../api/customer';

type PaymentConfig = {
  tokenAmount: number;
  escrow: {
    accountHolder: string;
    bankName: string;
    accountNumber: string;
    ifsc: string;
    branch: string;
    upiId: string;
    chequePayee: string;
    chequeInstructions: string[];
  };
};

function normalizeEscrowConfig(value: unknown): PaymentConfig['escrow'] | null {
  const incoming = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const accountHolder = typeof incoming.accountHolder === 'string' ? incoming.accountHolder.trim() : '';
  const bankName = typeof incoming.bankName === 'string' ? incoming.bankName.trim() : '';
  const accountNumber = typeof incoming.accountNumber === 'string' ? incoming.accountNumber.trim() : '';
  const ifsc = typeof incoming.ifsc === 'string' ? incoming.ifsc.trim() : '';
  const branch = typeof incoming.branch === 'string' ? incoming.branch.trim() : '';
  const upiId = typeof incoming.upiId === 'string' ? incoming.upiId.trim() : '';
  const chequePayee = typeof incoming.chequePayee === 'string' ? incoming.chequePayee.trim() : '';
  const chequeInstructions = Array.isArray(incoming.chequeInstructions)
    ? incoming.chequeInstructions.map(String).map((item) => item.trim()).filter(Boolean)
    : [];
  if (!accountHolder || !bankName || !accountNumber || !ifsc) return null;
  return {
    accountHolder,
    bankName,
    accountNumber,
    ifsc,
    branch,
    upiId,
    chequePayee,
    chequeInstructions: Array.isArray(incoming.chequeInstructions) && incoming.chequeInstructions.length
      ? incoming.chequeInstructions.map(String).filter(Boolean)
      : chequeInstructions,
  };
}

function idOf(entity: any) {
  return String(entity?._id ?? entity?.id ?? '');
}

type SharedDocument = {
  id: string;
  name: string;
  meta: string;
  documentId?: string;
  fileUrl?: string;
};

function documentIdOf(doc: any) {
  return String(doc?.documentId ?? doc?._id ?? doc?.id ?? doc?.document?._id ?? doc?.document?.id ?? '');
}

function mapSharedDocuments(enquiry?: BuyEnquiry | null): SharedDocument[] {
  const rawDocs = [
    ...(((enquiry as any)?.documents ?? []) as any[]),
    ...(((enquiry as any)?.sharedDocuments ?? []) as any[]),
    ...(((enquiry as any)?.deal?.documents ?? []) as any[]),
  ];
  const seen = new Set<string>();
  return rawDocs
    .map((doc, index) => {
      const documentId = documentIdOf(doc);
      const fileUrl = String(doc?.fileUrl ?? doc?.url ?? doc?.readUrl ?? '');
      const id = documentId || fileUrl || `document-${index}`;
      if (seen.has(id)) return null;
      seen.add(id);
      const status = String(doc?.status ?? doc?.scanStatus ?? 'shared').replace(/_/g, ' ');
      const type = String(doc?.type ?? doc?.documentType ?? doc?.mimeType ?? 'PDF');
      return {
        id,
        name: String(doc?.name ?? doc?.title ?? doc?.fileName ?? `Document ${index + 1}`),
        meta: `${type.toUpperCase()} · ${status}`,
        documentId: documentId || undefined,
        fileUrl: fileUrl || undefined,
      };
    })
    .filter(Boolean) as SharedDocument[];
}

import { useBuyEnquiryResource } from '../hooks/useBuyEnquiryResource';
import { EmptyStateCard, ErrorCard, LoadingBlock, OfflineCard } from '../components/screenStates';
import { isNetworkError } from '../utils/apiErrors';

function usePropertyContext(ctx: any) {
  const initial = ctx?.property as CustomerProperty | undefined;
  const [property, setProperty] = useState<CustomerProperty | null>(initial ?? null);
  const [loading, setLoading] = useState(!!ctx?.propertyId);
  const [error, setError] = useState<string | null>(null);
  const propertyId = ctx?.propertyId || idOf(initial);
  const load = useCallback(async (silent = false) => {
    if (!propertyId) {
      if (!silent) setLoading(false);
      return;
    }
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      setProperty(await getCustomerProperty(propertyId));
    } catch {
      if (!silent) setError('Could not load property context.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [propertyId]);
  useEffect(() => {
    load(Boolean(ctx?.refresh));
  }, [load, ctx?.refresh]);
  return { property, propertyId, loading, error, reload: load };
}

// ─── B-14 Documents Shared ───────────────────────────────────
export function DocumentsSharedScreen() {
  const { go, back, ctx } = useNav();
  const { authToken } = useAppState();
  const { enquiry, enquiryId, loading, error, offline, reload, refresh, refreshing } = useBuyEnquiryResource(ctx);
  const title = enquiry?.propertySnapshot?.title ?? 'Property documents';
  const [downloaded, setDownloaded] = useState<Record<string, string>>({});
  const [docError, setDocError] = useState<string | null>(null);
  const docs = mapSharedDocuments(enquiry);
  const openDocument = async (doc: SharedDocument) => {
    setDownloaded((d) => ({ ...d, [doc.id]: 'loading' }));
    setDocError(null);
    try {
      const readUrl = doc.documentId && authToken
        ? (await getCustomerDocumentReadUrl(authToken, doc.documentId)).readUrl
        : doc.fileUrl;
      if (!readUrl) {
        setDocError('This document is listed, but a secure read URL is not available yet.');
        setDownloaded((d) => ({ ...d, [doc.id]: 'error' }));
        return;
      }
      await Linking.openURL(readUrl);
      setDownloaded((d) => ({ ...d, [doc.id]: 'done' }));
    } catch {
      setDocError('Could not open this document securely.');
      setDownloaded((d) => ({ ...d, [doc.id]: 'error' }));
    }
  };
  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <TopBar onBack={back} title="Documents Shared" sub={title} />
      {loading && <LoadingBlock label="Loading enquiry documents..." />}
      {offline && <OfflineCard onRetry={reload} />}
      {error && <ErrorCard message={error} onRetry={reload} />}
      {docError && <ErrorCard message={docError} />}
      <View className="px-4">
        <View className="flex-row items-center gap-2.5 p-3 rounded-card bg-brand-50 mb-4">
          <View className="w-8 h-8 rounded-full bg-brand-600 items-center justify-center"><Icon name="bell" size={15} color="white" /></View>
          <Text className="text-[12px] text-brand-800 leading-display-tight flex-1">Builtglory has shared your property documents. Tap any document to view.</Text>
        </View>
        <View className="gap-2.5">
          {!loading && docs.length === 0 && (
            <EmptyStateCard
              title="No shared documents yet"
              body="Verified documents will appear here after the Builtglory team shares them for this enquiry."
              icon="file-search"
            />
          )}
          {docs.map((d) => (
            <DocCard
              key={d.id}
              name={d.name}
              meta={downloaded[d.id] === 'done' ? 'Opened securely · ' + d.meta : downloaded[d.id] === 'loading' ? 'Opening secure URL...' : d.meta}
              onView={() => go('pdfViewer', { doc: d, from: 'documentsShared' })}
              onDownload={() => openDocument(d)}
            />
          ))}
        </View>
        <View className="mt-4 flex-row items-center gap-2 p-3 rounded-card bg-ink-50">
          <Icon name="shield-check" size={14} color="#10B981" />
          <Text className="text-[11.5px] text-ink-600 flex-1">All documents are legally verified by the Builtglory team.</Text>
        </View>
        <Btn className="w-full mt-4" icon="credit-card" onPress={() => go('payment', { enquiryId, enquiry, refresh: true })}>Proceed to Token Payment</Btn>
      </View>
    </Screen>
  );
}

// ─── B-15 Payment ────────────────────────────────────────────
export function PaymentScreen() {
  const { go, completeTo, back, ctx } = useNav();
  const { authToken } = useAppState();
  const { enquiry, enquiryId, loading, error: enquiryError, offline, reload, refresh, refreshing } = useBuyEnquiryResource(ctx);
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [method, setMethod] = useState('bank');
  const [status, setStatus] = useState<'idle' | 'processing'>('idle');
  const [copied, setCopied] = useState('');
  const [paymentConfig, setPaymentConfig] = useState<PaymentConfig | null>(null);
  const tokenAmount = paymentConfig?.tokenAmount ?? 0;
  const escrow = paymentConfig?.escrow ?? null;
  const configReady = !!paymentConfig && !!escrow && tokenAmount > 0;
  const copy = async (key: string, value?: string) => {
    if (!value) return;
    await Clipboard.setStringAsync(value);
    setCopied(key);
    setTimeout(() => setCopied(''), 1400);
  };
  const loadPaymentConfig = useCallback(async () => {
    try {
      const config = await getPublicAppConfig();
      const nextEscrow = normalizeEscrowConfig(config.payment?.escrow);
      const nextTokenAmount = Number(config.payment?.tokenAmount ?? 0);
      if (!nextEscrow || !(nextTokenAmount > 0)) {
        throw new Error('Payment configuration is incomplete.');
      }
      setPaymentConfig({ tokenAmount: nextTokenAmount, escrow: nextEscrow });
      setPaymentError(null);
    } catch {
      setPaymentConfig(null);
      setPaymentError('Token payment configuration is unavailable. Please retry or contact support.');
    }
  }, []);
  const loadPayments = useCallback(async (silent = false) => {
    if (!authToken) return;
    try {
      setPayments(await listCustomerPayments(authToken, { type: 'token', limit: 5, sort: 'newest' }));
      if (!silent) setPaymentError(null);
    } catch {
      if (!silent) setPaymentError('Could not load payment history.');
    }
  }, [authToken]);
  usePolling(() => loadPayments(true), 10000, Boolean(authToken));
  const pay = async () => {
    if (!authToken) {
      setPaymentError('Please sign in again before creating a token payment.');
      return;
    }
    const dealId = String((enquiry as any)?.dealId ?? (enquiry as any)?.deal?._id ?? (enquiry as any)?.deal?.id ?? '');
    if (!configReady) {
      setPaymentError('Token payment configuration is unavailable. Please retry before paying.');
      return;
    }
    if (!dealId) {
      setPaymentError('A sales deal is required before token payment can be created.');
      return;
    }
    setStatus('processing');
    setPaymentError(null);
    try {
      const payment = await createTokenPayment(authToken, {
        dealId,
        propertyId: typeof enquiry?.propertyId === 'string' ? enquiry.propertyId : idOf(enquiry?.propertyId),
        amount: tokenAmount,
        currency: 'INR',
        idempotencyKey: `${dealId}-token-${Date.now()}`,
      });
      setStatus('idle');
      completeTo(payment.status === 'failed' ? 'paymentFailure' : 'registrationDetails', { enquiryId, enquiry, payment, refresh: true });
    } catch {
      setStatus('idle');
      setPaymentError('Could not create the token payment order.');
      go('paymentFailure', { enquiryId, enquiry, reason: 'Payment order could not be created.', refresh: true });
    }
  };
  useEffect(() => {
    loadPaymentConfig();
    loadPayments();
  }, [loadPaymentConfig, loadPayments]);
  const methods = [
    { id: 'bank', label: 'Bank Transfer', icon: 'building-2' },
    { id: 'upi', label: 'UPI', icon: 'smartphone' },
    { id: 'cheque', label: 'Cheque', icon: 'file-text' },
  ];
  return (
    <Screen padBottom refreshing={refreshing} onRefresh={refresh}>
      <TopBar onBack={back} title="Token Payment" />
      {loading && <LoadingBlock label="Loading deal and payment context..." />}
      {offline && <OfflineCard onRetry={reload} />}
      {enquiryError && <ErrorCard message={enquiryError} onRetry={reload} />}
      {paymentError && <ErrorCard message={paymentError} onRetry={() => { loadPaymentConfig(); loadPayments(); }} />}
      <View className="px-4">
        <View className="rounded-card bg-brand-600 p-5 items-center mb-5">
          <Text className="text-[12px] text-white/70 uppercase tracking-wider">Token Amount</Text>
          <Text className="text-[36px] font-bold text-white leading-display mt-1">{configReady ? formatINR(tokenAmount) : 'Unavailable'}</Text>
          <Text className="text-[12px] text-white/80">Refundable · Held in Builtglory escrow</Text>
        </View>
        {!!payments.length && (
          <View className="rounded-card bg-ink-50 p-3 mb-4">
            <Text className="text-[12px] text-ink-500">Latest token payment</Text>
            <Text className="text-[13px] font-semibold text-ink-900">{payments[0].referenceId ?? 'Payment'} · {formatPaymentStatus(payments[0].status)}</Text>
          </View>
        )}
        <View className="flex-row gap-2 mb-4">
          {methods.map((m) => (
            <Pressable key={m.id} onPress={() => setMethod(m.id)} className={`flex-1 p-3 rounded-card border items-center gap-1.5 ${method === m.id ? 'border-brand-600 bg-brand-50' : 'border-ink-200'}`}>
              <Icon name={m.icon} size={18} color={method === m.id ? '#1A6FFF' : '#64748B'} />
              <Text className={`text-[11px] font-semibold ${method === m.id ? 'text-brand-700' : 'text-ink-600'}`}>{m.label}</Text>
            </Pressable>
          ))}
        </View>
        {!configReady && (
          <View className="rounded-card border border-amber-200 bg-amber-50 p-4 mb-4">
            <Text className="text-[13px] font-semibold text-amber-900">Payment details are loading from Builtglory.</Text>
            <Text className="text-[12px] text-amber-800 mt-1">Static escrow details are not shown for security. Retry to load the latest account instructions.</Text>
          </View>
        )}
        {configReady && method === 'bank' && escrow && (
          <View className="rounded-card border border-ink-200">
            {[['Account Holder', escrow.accountHolder, 'holder'], ['Bank', escrow.bankName, 'bank'], ['Account No.', escrow.accountNumber, 'acc'], ['IFSC', escrow.ifsc, 'ifsc'], ['Branch', escrow.branch, 'branch']].map(([k, v, key], i) => (
              <View key={key} className={`flex-row items-center gap-2 px-3 py-2.5 ${i ? 'border-t border-ink-100' : ''}`}>
                <View className="flex-1">
                  <Text className="text-[10.5px] text-ink-500">{k}</Text>
                  <Text className="text-[13px] font-semibold text-ink-900">{v}</Text>
                </View>
                <Pressable onPress={() => copy(key, v)}><Text className="text-[11px] font-semibold text-brand-600">{copied === key ? '✓ Copied' : 'Copy'}</Text></Pressable>
              </View>
            ))}
          </View>
        )}
        {configReady && method === 'upi' && escrow && (
          <View className="rounded-card border border-ink-200 p-4 items-center">
            <View className="w-44 h-44 rounded-lg items-center justify-center bg-white border border-ink-200">
              <Icon name="qr-code" size={64} color="#0F172A" />
            </View>
            <View className="mt-3 flex-row items-center gap-2 px-3 py-2 rounded-card bg-ink-50 w-full justify-between">
              <Text className="text-[13px] font-semibold">{escrow.upiId}</Text>
              <Pressable onPress={() => copy('upi', escrow.upiId)}><Text className="text-[11px] font-semibold text-brand-600">{copied === 'upi' ? '✓ Copied' : 'Copy'}</Text></Pressable>
            </View>
          </View>
        )}
        {configReady && method === 'cheque' && escrow && (
          <View className="rounded-card border border-ink-200 p-4 gap-2.5">
            <Text className="text-[13px] font-semibold">Cheque instructions</Text>
            {escrow.chequeInstructions.map((t, i) => (
              <View key={i} className="flex-row gap-2">
                <View className="w-5 h-5 rounded-full bg-brand-50 items-center justify-center"><Text className="text-brand-700 text-[10px] font-bold">{i + 1}</Text></View>
                <Text className="text-[12px] text-ink-700 flex-1">{t}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
      <View className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-ink-200">
        <Pressable onPress={pay} disabled={status === 'processing' || !configReady} className={`w-full min-h-12 py-3 rounded-xl items-center justify-center ${status === 'processing' || !configReady ? 'bg-ink-100' : 'bg-brand-600'}`}>
          <Text className={`font-semibold text-[15px] ${status === 'processing' || !configReady ? 'text-ink-400' : 'text-white'}`}>
            {status === 'processing' ? 'Creating payment...' : method === 'cheque' ? 'I have handed over the cheque' : `I have paid ${formatINR(tokenAmount)}`}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

// ─── B-15a Payment Failure ───────────────────────────────────
export function PaymentFailureScreen() {
  const { go, ctx } = useNav();
  const { enquiry, loading, error, offline, reload, refresh, refreshing } = useBuyEnquiryResource(ctx);
  const reason = ctx?.reason ?? (ctx?.payment as CustomerPayment | undefined)?.failureReason ?? 'Payment order failed or was declined.';
  return (
    <Screen fill refreshing={refreshing} onRefresh={refresh}>
      {loading && <LoadingBlock label="Loading payment context..." />}
      {offline && <OfflineCard onRetry={reload} />}
      {error && <ErrorCard message={error} onRetry={reload} />}
      <View className="flex-1 items-center justify-center px-6">
        <ShakeView trigger={reason}>
          <SuccessBurst icon="circle-x" color="#E11D48" bgClassName="bg-rose-50" />
        </ShakeView>
        <Text className="text-[21px] font-bold text-center">Payment failed</Text>
        <Text className="text-ink-500 mt-2 text-[13px] max-w-[260px] leading-relaxed text-center">
          Your token payment could not be confirmed. <Text className="text-ink-700 font-bold">Reason: {reason}</Text> No amount was deducted.
        </Text>
        <View className="mt-6 gap-2 w-full">
          <Btn className="w-full" icon="rotate-cw" onPress={() => go('payment', { enquiryId: enquiry?._id ?? enquiry?.id, enquiry, refresh: true })}>Try Again</Btn>
          <Btn variant="outline" className="w-full" icon="arrow-left-right" onPress={() => go('payment', { enquiryId: enquiry?._id ?? enquiry?.id, enquiry, refresh: true })}>Choose a Different Method</Btn>
        </View>
        <Pressable onPress={() => go('help')} className="mt-4"><Text className="text-[13px] text-brand-600 font-semibold">Contact Support</Text></Pressable>
      </View>
    </Screen>
  );
}

// ─── B-16 Registration Details ───────────────────────────────
export function RegistrationDetailsScreen() {
  const { resetTo, ctx } = useNav();
  useFlowCompletionBack();
  const [payment, setPayment] = useState<CustomerPayment | undefined>(ctx?.payment as CustomerPayment | undefined);
  const { enquiry, loading, error, offline, reload, refresh, refreshing } = useBuyEnquiryResource(ctx);
  const { authToken } = useAppState();
  const dealId = String((enquiry as any)?.deal?._id ?? (enquiry as any)?.deal?.id ?? (enquiry as any)?.dealId ?? (payment as any)?.dealId ?? '');
  const refreshPayment = useCallback(async () => {
    if (!authToken) return;
    try {
      const payments = await listCustomerPayments(authToken, { type: 'token', limit: 20, sort: 'newest' });
      const latest = dealId
        ? payments.find((item) => String(item.dealId ?? '') === dealId) ?? payments[0]
        : payments[0];
      if (latest) setPayment(latest);
    } catch {
      // Keep the last known payment state while enquiry polling continues.
    }
  }, [authToken, dealId]);
  useEffect(() => {
    refreshPayment();
  }, [refreshPayment]);
  usePolling(refreshPayment, 10000, Boolean(authToken));
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const registration = (enquiry as any)?.registration ?? (enquiry as any)?.deal?.registration ?? {};
  const appointment = registration.appointment ?? null;
  const docs: string[] = Array.isArray(registration.checklist) && registration.checklist.length
    ? registration.checklist.map(String).filter(Boolean)
    : mapSharedDocuments(enquiry).map((doc) => doc.name);
  const toggle = (d: string) => setChecks((c) => ({ ...c, [d]: !c[d] }));
  const allChecked = docs.length > 0 && docs.every((d) => checks[d]);
  const { msg, fire } = useToast();
  const appointmentDate = appointment?.date ? new Date(appointment.date).toLocaleDateString() : 'Appointment pending';
  const appointmentTime = appointment?.time || 'Time pending';
  const appointmentLocation = appointment?.officeName || enquiry?.propertySnapshot?.location || 'Registration office pending';
  const appointmentAddress = appointment?.address || 'Address will appear once registration is scheduled.';
  return (
    <Screen padBottom refreshing={refreshing} onRefresh={refresh}>
      <TopBar onBack={() => resetTo('home')} title="Registration Details" />
      {loading && <LoadingBlock label="Loading registration context..." />}
      {offline && <OfflineCard onRetry={reload} />}
      {error && <ErrorCard message={error} onRetry={reload} />}
      <View className="px-4">
        {!!payment && (
          <View className="rounded-card bg-emerald-50 border border-emerald-200 p-3 mb-4">
            <Text className="text-[12px] text-emerald-700">Token payment</Text>
            <Text className="text-[13px] font-semibold text-emerald-900">{payment.referenceId ?? 'Payment'} · {formatPaymentStatus(payment.status)}</Text>
          </View>
        )}
        <View className="rounded-card border border-ink-200 overflow-hidden mb-4">
          <View className="bg-brand-600 px-4 py-3">
            <Text className="text-[11px] uppercase tracking-wider text-white/80">Your appointment</Text>
            <Text className="text-[20px] font-bold text-white mt-1">{appointmentDate}</Text>
            <Text className="text-[13px] text-white">{appointmentTime}</Text>
          </View>
          <View className="flex-row items-center gap-3 p-3.5">
            <View className="w-10 h-10 rounded-full bg-brand-50 items-center justify-center"><Icon name="landmark" size={18} color="#1A6FFF" /></View>
            <View className="flex-1">
              <Text className="text-[13px] font-semibold">{appointmentLocation}</Text>
              <Text className="text-[11.5px] text-ink-500">{appointmentAddress}</Text>
            </View>
            <Icon name="map-pin" size={16} color="#1A6FFF" />
          </View>
        </View>
        <Text className="text-[14px] font-semibold mb-2">Documents to carry</Text>
        {docs.length ? (
          <View className="rounded-card border border-ink-200 mb-4">
            {docs.map((d, i) => (
              <Pressable key={d} onPress={() => toggle(d)} className={`flex-row items-center gap-3 p-3 ${i ? 'border-t border-ink-100' : ''}`}>
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
            <Text className="text-[12px] text-amber-800 mt-1">Builtglory will publish the appointment and carry-list after documentation is ready.</Text>
          </View>
        )}
        <Btn variant="outline" className="w-full" icon="calendar-plus" onPress={() => fire(appointment ? 'Use your device calendar to add this appointment.' : 'Appointment is not scheduled yet.')}>Calendar reminder</Btn>
      </View>
      <Toast message={msg} />
      <View className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-ink-200">
        <Pressable onPress={() => resetTo('home')} disabled={!allChecked} className={`w-full min-h-12 py-3 rounded-xl items-center justify-center ${allChecked ? 'bg-emerald-600' : 'bg-ink-100'}`}>
          <Text className={`font-semibold text-[15px] ${allChecked ? 'text-white' : 'text-ink-400'}`}>Deal Complete</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

// ─── B-17 Cancel Enquiry ──────────────────────────────────────
export function CancelEnquiryScreen() {
  const { resetTo, back, ctx } = useNav();
  const { authToken } = useAppState();
  const { enquiry, enquiryId, loading, error, offline, reload, refresh, refreshing } = useBuyEnquiryResource(ctx);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const reasons = ['Changed my mind', 'Found another property', 'Other'];
  const submitCancel = async () => {
    if (!authToken || !enquiryId || !reason) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await cancelBuyEnquiry(authToken, enquiryId, reason);
      resetTo('home');
    } catch {
      setSubmitError('Could not cancel this enquiry.');
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <TopBar onBack={back} title="Enquiry Detail" sub={enquiry?.referenceId ?? 'Buy enquiry'} />
      {loading && <LoadingBlock label="Loading enquiry..." />}
      {offline && <OfflineCard onRetry={reload} />}
      {error && <ErrorCard message={error} onRetry={reload} />}
      {submitError && <ErrorCard message={submitError} />}
      <Sheet onClose={back} title="Cancel this enquiry?">
        <View className="flex-row items-center gap-3 p-3 rounded-card bg-ink-50 mb-4">
          <PhotoPlaceholder tag={enquiry?.referenceId ?? 'enquiry'} width={44} height={44} className="rounded-md" />
          <Text className="text-[13px] font-semibold">{enquiry?.propertySnapshot?.title ?? 'Selected property'}</Text>
        </View>
        <Field label="Reason for cancelling">
          <View className="gap-2">
            {reasons.map((r) => (
              <Pressable key={r} onPress={() => setReason(r)} className={`p-3 rounded-card border ${reason === r ? 'border-brand-600 bg-brand-50' : 'border-ink-200'}`}>
                <Text className="text-[14px]">{r}</Text>
              </Pressable>
            ))}
          </View>
        </Field>
        <View className="gap-2 mt-5">
          <Pressable onPress={submitCancel} disabled={!reason || submitting} className={`w-full min-h-12 py-3 rounded-xl items-center justify-center ${reason && !submitting ? 'bg-rose-600' : 'bg-rose-200'}`}>
            <Text className="text-white font-semibold text-[15px]">{submitting ? 'Cancelling...' : 'Cancel Enquiry'}</Text>
          </Pressable>
          <Pressable onPress={back} className="w-full min-h-12 py-3 rounded-xl items-center justify-center bg-ink-100">
            <Text className="text-ink-700 font-semibold text-[15px]">Keep Enquiry</Text>
          </Pressable>
        </View>
      </Sheet>
    </Screen>
  );
}

// ─── B-18 Property Withdrawn ──────────────────────────────────
export function PropertyWithdrawnScreen() {
  const { go, back, ctx } = useNav();
  const { property, loading, error, reload } = usePropertyContext(ctx);
  const title = property?.title ?? 'This property';
  const location = property?.address?.locality ?? property?.address?.city ?? 'Location unavailable';
  return (
    <Screen>
      <TopBar onBack={back} title="Enquiry Detail" />
      {loading && <LoadingBlock label="Loading property status..." />}
      {error && <ErrorCard message={error} onRetry={reload} />}
      <View className="px-4">
        <View className="flex-row items-center gap-2.5 p-3.5 rounded-card bg-amber-50 border border-amber-200 mb-4">
          <Icon name="circle-alert" size={18} color="#D97706" />
          <Text className="text-[12.5px] text-amber-800 font-medium flex-1">This property is no longer available.</Text>
        </View>
        <View className="rounded-card border border-ink-200 p-3 opacity-50 mb-5">
          <View className="flex-row gap-3">
            <PhotoPlaceholder tag={idOf(property) || 'withdrawn'} width={72} height={72} className="rounded-md" />
            <View className="flex-1">
              <Text className="text-[14px] font-semibold">{title}</Text>
              <Text className="text-[12px] text-ink-500">{location}</Text>
              <Text className="text-[13px] font-bold text-ink-400 mt-1">{formatINR(property?.price ?? 0)}</Text>
            </View>
          </View>
        </View>
        <Btn className="w-full" icon="search" onPress={() => go('buyList', { type: property?.type })}>Browse Similar Properties</Btn>
      </View>
    </Screen>
  );
}

// ─── B-19 Sold Out ────────────────────────────────────────────
export function SoldOutScreen() {
  const { go, back, ctx } = useNav();
  const { property, loading, error, reload } = usePropertyContext(ctx);
  const title = property?.title ?? 'This property';
  return (
    <Screen padBottom>
      {loading && <LoadingBlock label="Loading property status..." />}
      {error && <ErrorCard message={error} onRetry={reload} />}
      <View>
        <PhotoPlaceholder tag={(idOf(property) || 'property') + 'sold'} height={260}>
          <Pressable onPress={back} className="absolute left-4 top-3 w-10 h-10 bg-white/90 rounded-full items-center justify-center"><Icon name="arrow-left" size={18} color="#0F172A" /></Pressable>
          <View className="absolute inset-0 bg-black/45 items-center justify-center">
            <Text className="border-4 border-white text-white text-[34px] font-black tracking-[6px] px-6 py-2 rounded">SOLD</Text>
          </View>
        </PhotoPlaceholder>
      </View>
      <View className="px-4 pt-5 items-center">
        <Text className="text-[20px] font-bold text-ink-900 text-center">This property has been sold</Text>
        <Text className="text-[13px] text-ink-500 mt-2 max-w-[270px] leading-relaxed text-center">
          {title} is no longer on the market. Explore similar listings nearby.
        </Text>
        <Btn className="w-full mt-6" icon="search" onPress={() => go('buyList', { type: property?.type ?? 'commercial' })}>View Similar Properties</Btn>
      </View>
    </Screen>
  );
}
