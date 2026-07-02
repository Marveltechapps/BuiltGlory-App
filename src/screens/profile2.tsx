import React, { useEffect, useState } from 'react';
import { Linking, View, Text, Pressable, ScrollView } from 'react-native';
import Icon from '../components/Icon';
import { Screen, TopBar, Badge, Chip, PhotoPlaceholder, Btn, Timeline } from '../components/shared';
import { formatINR } from '../data/data';
import { useNav } from '../navigation/useNav';
import { useAppState } from '../state/AppState';
import {
  BuyEnquiry,
  cancelBuyEnquiry,
  CustomerPayment,
  CustomerVisit,
  getBuyEnquiry,
  getCustomerDocumentReadUrl,
  getSellRequest,
  listBuyEnquiries,
  listCustomerPayments,
  listSellRequests,
  SellRequest,
} from '../api/customer';
import { BUY_ENQUIRIES_CACHE_PREFIX, VISITS_CACHE_PREFIX, VisitsCache } from '../state/primaryTabCache';

function apiMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function requestId(request?: SellRequest | null) {
  return String(request?._id ?? request?.id ?? request?.referenceId ?? '');
}

function requestTitle(request?: SellRequest | null) {
  return request?.propertyTitle || request?.referenceId || 'Seller listing';
}

function requestLocation(request?: SellRequest | null) {
  const address = request?.address;
  return [address?.locality, address?.city].filter(Boolean).join(', ') || 'Location pending';
}

function enquiryId(enquiry?: BuyEnquiry | null) {
  return String(enquiry?._id ?? enquiry?.id ?? enquiry?.referenceId ?? '');
}

function documentIdOf(doc: any) {
  return String(doc?.documentId ?? doc?._id ?? doc?.id ?? doc?.document?._id ?? doc?.document?.id ?? '');
}

function directDocumentUrlOf(doc: any) {
  return String(doc?.readUrl ?? doc?.fileUrl ?? doc?.url ?? '');
}

function enquiryProperty(enquiry?: BuyEnquiry | null) {
  if (typeof enquiry?.propertyId === 'object' && enquiry.propertyId) return enquiry.propertyId;
  return null;
}

function enquiryStatusLabel(status?: string) {
  const value = String(status || 'new');
  const labels: Record<string, string> = {
    new: 'New',
    responded: 'Responded',
    visit_scheduled: 'Visit Scheduled',
    negotiating: 'Negotiating',
    closed: 'Closed',
    awaiting: 'Awaiting',
  };
  return labels[value] ?? value.replace(/_/g, ' ');
}

function enquiryStatusColor(status?: string) {
  const value = String(status || 'new');
  if (value.includes('cancel')) return 'rose';
  if (value === 'closed') return 'ink';
  if (value === 'negotiating') return 'amber';
  if (value === 'responded' || value.includes('completed') || value.includes('verified') || value.includes('paid')) return 'green';
  if (value.includes('await') || value.includes('pending')) return 'amber';
  return 'brand';
}

function enquiryStatusRank(status?: string) {
  const ranks: Record<string, number> = {
    new: 0,
    awaiting: 0,
    responded: 1,
    visit_scheduled: 2,
    negotiating: 3,
    closed: 4,
  };
  return ranks[String(status || 'new')] ?? 0;
}

function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View className="rounded-card border border-rose-100 bg-rose-50 p-3">
      <Text className="text-[12px] text-rose-700">{message}</Text>
      {onRetry && <Pressable onPress={onRetry} className="mt-2"><Text className="text-[12px] font-semibold text-rose-700">Retry</Text></Pressable>}
    </View>
  );
}

function LoadingBlock({ label }: { label: string }) {
  return <View className="py-8 items-center"><Text className="text-[12px] text-ink-500">{label}</Text></View>;
}

// ─── P-05 Listing Detail / Seller Status Tracker ─────────────
export function ListingDetailScreen() {
  const { go, back, ctx } = useNav<{ sellRequestId?: string; sellRequest?: SellRequest }>();
  const { authToken } = useAppState();
  const [request, setRequest] = useState<SellRequest | null>(ctx.sellRequest || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const sellRequestId = ctx.sellRequestId || requestId(ctx.sellRequest);
  const load = async () => {
    if (!authToken || !sellRequestId) {
      if (!request) setError('Listing context is missing.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      setRequest(await getSellRequest(authToken, sellRequestId));
    } catch (err) {
      setError(apiMessage(err, 'Could not load listing status.'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, [authToken, sellRequestId]);
  const status = String(request?.status || (request?.isDraft ? 'draft' : 'submitted'));
  const steps = [
    { title: 'Submitted', state: request?.submittedAt || !request?.isDraft ? 'done' : 'future', date: request?.submittedAt ? new Date(request.submittedAt).toLocaleDateString() : undefined },
    { title: 'Verification Call', state: ['new', 'under_review', 'changes_requested', 'approved', 'sold'].includes(status) ? 'current' : 'future', detail: status.replace(/_/g, ' ') },
    { title: 'Document Verification', state: request?.documents?.some((doc) => doc.status === 'verified') ? 'done' : 'future', detail: `${request?.documents?.length || 0} document(s)` },
    { title: 'Site Inspection', state: status === 'approved' ? 'current' : 'future' },
    { title: 'Legal Verification', state: status === 'approved' ? 'current' : 'future' },
    { title: 'Valuation', state: request?.sale?.salePrice ? 'done' : 'future' },
    { title: 'Offer Sent', state: request?.sale?.salePrice ? 'current' : 'future' },
    { title: 'Negotiation / Accepted', state: status === 'sold' ? 'done' : 'future' },
    { title: 'Deal Confirmed', state: status === 'sold' ? 'done' : 'future' },
    { title: 'Sold / Withdrawn', state: ['sold', 'withdrawn'].includes(status) ? 'done' : 'future' },
  ] as const;
  return (
    <Screen>
      <TopBar onBack={back} title="Listing Status" sub="10-step pipeline" right={<Pressable onPress={() => go('editListing', { sellRequestId, sellRequest: request })}><Text className="text-brand-600 text-[13px] font-semibold">Edit</Text></Pressable>} />
      <View className="px-4 pb-6">
        {loading && <LoadingBlock label="Loading listing status..." />}
        {!!error && <View className="mb-3"><ErrorCard message={error} onRetry={load} /></View>}
        <View className="rounded-card border border-ink-200 overflow-hidden mb-5">
          <View className="flex-row gap-3 p-3">
            <PhotoPlaceholder tag={sellRequestId || request?.referenceId || 'listing'} width={72} height={72} className="rounded-md">
              <View className="absolute top-1 left-1"><Badge color={request?.isDraft ? 'amber' : status === 'rejected' ? 'rose' : 'brand'}>{request?.isDraft ? 'draft' : status}</Badge></View>
            </PhotoPlaceholder>
            <View className="flex-1">
              <Text className="text-[14px] font-semibold" numberOfLines={1}>{requestTitle(request)}</Text>
              <Text className="text-[11.5px] text-ink-500">{requestLocation(request)}</Text>
              <Text className="text-[14px] font-bold text-brand-600 mt-1">{formatINR(request?.askingPrice || 0)}</Text>
            </View>
          </View>
          <View className="flex-row border-t border-ink-100">
            {[[String(request?.metrics?.views || 0), 'Views'], [String(request?.metrics?.enquiryCount || 0), 'Enquiries'], [status.replace(/_/g, ' '), 'Status']].map(([v, l]) => (
              <View key={l} className="flex-1 py-2.5 items-center"><Text className="text-[14px] font-bold">{v}</Text><Text className="text-[10px] text-ink-500">{l}</Text></View>
            ))}
          </View>
        </View>
        <View className="rounded-card bg-brand-50 p-3 mb-5 flex-row items-center gap-3">
          <View className="w-11 h-11 rounded-full bg-brand-600 items-center justify-center"><Icon name="zap" size={20} color="white" /></View>
          <View><Text className="text-[13px] font-semibold">{status.replace(/_/g, ' ')}</Text><Text className="text-[11.5px] text-brand-700">{request?.changeRequests?.[0] || request?.rejectionReason || 'Backend listing status is up to date'}</Text></View>
        </View>
        <Timeline steps={steps as any} />
      </View>
    </Screen>
  );
}

// ─── My Visits / My Deals ─────────────────────────────────────
export function MyVisitsScreen() {
  const { back } = useNav();
  const { authToken, getCachedValue, setCachedValue } = useAppState();
  const [tab, setTab] = useState('all');
  const [visits, setVisits] = useState<CustomerVisit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const loadVisits = async () => {
    if (!authToken) {
      setError('Please sign in again to load your visits.');
      return;
    }
    const cacheKey = `${VISITS_CACHE_PREFIX}:${authToken}`;
    const cached = getCachedValue<VisitsCache>(cacheKey);
    if (cached) {
      setVisits(cached);
      setLoading(false);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const enquiries = await listBuyEnquiries(authToken, { limit: 50, sort: 'newest' });
      const nextVisits = enquiries.flatMap((enquiry) => enquiry.visits || []);
      setVisits(nextVisits);
      setCachedValue(cacheKey, nextVisits);
      setCachedValue(`${BUY_ENQUIRIES_CACHE_PREFIX}:${authToken}`, enquiries);
    } catch (err) {
      setError(apiMessage(err, 'Could not load visit records.'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    loadVisits();
  }, [authToken]);
  const filtered = tab === 'all' ? visits : visits.filter((v) => v.status === tab);
  return (
    <Screen>
      <TopBar onBack={back} title="My Visits" sub={`${visits.length} total`} />
      <View className="px-4">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} className="mb-3">
          {['all', 'upcoming', 'completed'].map((t) => (
            <Chip key={t} active={tab === t} onPress={() => setTab(t)}>{t === 'all' ? 'All' : t[0].toUpperCase() + t.slice(1)}</Chip>
          ))}
        </ScrollView>
        {!!error && <View className="mb-3"><ErrorCard message={error} onRetry={loadVisits} /></View>}
        {loading ? <LoadingBlock label="Loading visit records..." /> : filtered.length === 0 ? (
          <View className="py-12 items-center"><Icon name="calendar" size={40} color="#CBD5E1" /><Text className="mt-2 text-[13px] text-ink-400">No {tab} visits</Text></View>
        ) : (
          <View className="gap-3">
            {filtered.map((v) => (
              <View key={String(v._id ?? v.id ?? v.referenceId)} className="rounded-card border border-ink-200 p-4 bg-white">
                <View className="flex-row items-start justify-between mb-3">
                  <View><Text className="text-[13px] font-semibold text-ink-900">{typeof v.propertyId === 'object' ? v.propertyId?.title : v.referenceId || 'Property visit'}</Text><Text className="text-[11px] text-ink-500">{v.visitType || 'physical'} visit</Text></View>
                  <Badge color={v.status === 'upcoming' ? 'brand' : 'green'}>{v.status}</Badge>
                </View>
                <View className="flex-row gap-4">
                  <View className="flex-row items-center gap-1.5"><Icon name="calendar" size={14} color="#475569" /><Text className="text-[12px] text-ink-600">{v.visitDate ? new Date(v.visitDate).toLocaleDateString() : 'Date pending'}</Text></View>
                  <View className="flex-row items-center gap-1.5"><Icon name="clock" size={14} color="#475569" /><Text className="text-[12px] text-ink-600">{v.visitTime || 'Time pending'}</Text></View>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

export function MyDealsScreen() {
  const { go, back } = useNav();
  const { authToken } = useAppState();
  const [tab, setTab] = useState('active');
  const [deals, setDeals] = useState<Array<{ id: string; property: string; price: number; stage: string; progress: number; status: string; enquiry?: BuyEnquiry; payment?: CustomerPayment }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const loadDeals = async () => {
    if (!authToken) {
      setError('Please sign in again to load your deals.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [enquiries, payments] = await Promise.all([
        listBuyEnquiries(authToken, { limit: 50, sort: 'newest' }),
        listCustomerPayments(authToken, { limit: 50, sort: 'newest' }),
      ]);
      const enquiryDeals = enquiries
        .filter((enquiry) => enquiry.deal || ['deal_confirmed', 'token_paid', 'registration', 'completed'].includes(String(enquiry.status)))
        .map((enquiry) => ({
          id: enquiryId(enquiry),
          property: enquiryProperty(enquiry)?.title || enquiry.propertySnapshot?.title || enquiry.referenceId || 'Property deal',
          price: enquiryProperty(enquiry)?.price || enquiry.propertySnapshot?.price || 0,
          stage: String(enquiry.status || 'active').replace(/_/g, ' '),
          progress: String(enquiry.status).includes('completed') ? 100 : 65,
          status: String(enquiry.status).includes('completed') ? 'completed' : 'active',
          enquiry,
        }));
      const paymentDeals = payments.map((payment) => ({
        id: String(payment._id ?? payment.id ?? payment.referenceId),
        property: payment.referenceId || 'Payment record',
        price: payment.amount || 0,
        stage: String(payment.status || payment.type || 'payment').replace(/_/g, ' '),
        progress: payment.status === 'paid' ? 100 : 75,
        status: payment.status === 'paid' ? 'completed' : 'active',
        payment,
      }));
      setDeals([...enquiryDeals, ...paymentDeals]);
    } catch (err) {
      setError(apiMessage(err, 'Could not load your deals.'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    loadDeals();
  }, [authToken]);
  const filtered = tab === 'all' ? deals : deals.filter((d) => d.status === tab);
  return (
    <Screen>
      <TopBar onBack={back} title="My Deals" sub={`${deals.length} total`} />
      <View className="px-4">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} className="mb-3">
          {['all', 'active', 'completed'].map((t) => (
            <Chip key={t} active={tab === t} onPress={() => setTab(t)}>{t === 'all' ? 'All' : t[0].toUpperCase() + t.slice(1)}</Chip>
          ))}
        </ScrollView>
        {!!error && <View className="mb-3"><ErrorCard message={error} onRetry={loadDeals} /></View>}
        {loading && <LoadingBlock label="Loading deals..." />}
        {!loading && !error && filtered.length === 0 && <View className="py-12 items-center"><Icon name="handshake" size={40} color="#CBD5E1" /><Text className="mt-2 text-[13px] text-ink-400">No {tab} deals</Text></View>}
        <View className="gap-3">
          {filtered.map((d) => (
            <View key={d.id} className="rounded-card border border-ink-200 p-4 bg-white">
              <View className="flex-row items-start justify-between mb-3">
                <View><Text className="text-[13px] font-semibold text-ink-900">{d.property}</Text><Text className="text-[11px] text-brand-600 font-medium">{formatINR(d.price)}</Text></View>
                <Badge color={d.status === 'active' ? 'brand' : 'green'}>{d.stage}</Badge>
              </View>
              <View className="mb-2">
                <View className="flex-row items-center justify-between mb-1"><Text className="text-[11px] text-ink-500">Progress</Text><Text className="text-[11px] font-semibold text-ink-700">{d.progress}%</Text></View>
                <View className="w-full h-2 bg-ink-100 rounded-full overflow-hidden"><View className="h-full bg-brand-600 rounded-full" style={{ width: `${d.progress}%` }} /></View>
              </View>
              <Pressable onPress={() => d.enquiry ? go('enquiryDetail', { enquiryId: enquiryId(d.enquiry), enquiry: d.enquiry }) : go('paymentSchedule')} className="w-full h-9 rounded-card bg-brand-50 items-center justify-center"><Text className="text-brand-600 text-[12px] font-semibold">View Details →</Text></Pressable>
            </View>
          ))}
        </View>
      </View>
    </Screen>
  );
}

export function NoListingsScreen() {
  const { go, back } = useNav();
  const { authToken } = useAppState();
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!authToken) return;
    listSellRequests(authToken, { limit: 1 }).then((items) => setCount(items.length)).catch(() => setCount(null));
  }, [authToken]);
  return (
    <Screen>
      <TopBar onBack={back} title="My Listings" />
      <View className="flex-1 items-center justify-center px-8">
        <View className="w-28 h-28 rounded-3xl bg-brand-50 items-center justify-center mb-5"><Icon name="tag" size={48} color="#1A6FFF" strokeWidth={1.5} /></View>
        <Text className="text-[18px] font-bold text-ink-900 text-center">You haven't listed any properties yet.</Text>
        <Text className="text-[13px] text-ink-500 mt-2 max-w-[250px] leading-relaxed text-center">{count && count > 0 ? 'You already have listings. Open My Listings to manage them.' : 'List your property and start receiving verified buyer enquiries.'}</Text>
        <Btn className="mt-6" icon="plus" onPress={() => go('sellTypes')}>List a Property</Btn>
      </View>
    </Screen>
  );
}

// ─── P-08 Enquiry Detail / Buyer Status Tracker ──────────────
export function EnquiryDetailScreen() {
  const { go, back, ctx } = useNav<{ enquiryId?: string; enquiry?: BuyEnquiry }>();
  const { authToken, getCachedValue, setCachedValue } = useAppState();
  const [enquiry, setEnquiry] = useState<BuyEnquiry | null>(ctx.enquiry || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [canceling, setCanceling] = useState(false);
  const activeEnquiryId = ctx.enquiryId || enquiryId(ctx.enquiry);
  const load = async () => {
    if (!authToken || !activeEnquiryId) {
      if (!enquiry) setError('Enquiry context is missing.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const latest = await getBuyEnquiry(authToken, activeEnquiryId);
      setEnquiry(latest);
      const cacheKey = `${BUY_ENQUIRIES_CACHE_PREFIX}:${authToken}`;
      const cached = getCachedValue<BuyEnquiry[]>(cacheKey);
      if (cached) {
        const next = cached.map((item) => enquiryId(item) === activeEnquiryId ? latest : item);
        setCachedValue(cacheKey, next);
      }
    } catch (err) {
      setError(apiMessage(err, 'Could not load enquiry details.'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, [authToken, activeEnquiryId]);
  const cancel = async () => {
    if (!authToken || !activeEnquiryId) return;
    setCanceling(true);
    setError('');
    try {
      const updated = await cancelBuyEnquiry(authToken, activeEnquiryId, 'Cancelled from customer profile.');
      setEnquiry(updated);
      const cacheKey = `${BUY_ENQUIRIES_CACHE_PREFIX}:${authToken}`;
      const cached = getCachedValue<BuyEnquiry[]>(cacheKey);
      if (cached) {
        const next = cached.map((item) => enquiryId(item) === activeEnquiryId ? updated : item);
        setCachedValue(cacheKey, next);
      }
    } catch (err) {
      setError(apiMessage(err, 'Could not cancel this enquiry.'));
    } finally {
      setCanceling(false);
    }
  };
  const property = enquiryProperty(enquiry);
  const status = String(enquiry?.status || 'awaiting');
  const isCancelled = status.includes('cancel');
  const submittedLabel = enquiry?.submittedAt ? new Date(enquiry.submittedAt).toLocaleDateString() : 'Pending';
  const visitCount = enquiry?.visits?.length || 0;
  const rank = enquiryStatusRank(status);
  const steps = [
    { title: 'Enquiry Submitted', state: enquiry?.submittedAt ? 'done' : 'current', date: enquiry?.submittedAt ? new Date(enquiry.submittedAt).toLocaleDateString() : undefined },
    { title: 'Advisor Responded', state: rank >= 1 ? 'done' : 'current', detail: enquiryStatusLabel(status) },
    { title: 'Visit Scheduled', state: rank >= 2 || enquiry?.visits?.length ? 'done' : 'future', detail: enquiry?.visits?.[0]?.visitDate ? new Date(enquiry.visits[0].visitDate).toLocaleDateString() : undefined },
    { title: 'Negotiation', state: rank >= 3 ? 'current' : 'future' },
    { title: 'Deal Confirmed', state: enquiry?.deal ? 'current' : 'future' },
    { title: 'Documents Shared', state: status.includes('document') ? 'current' : 'future' },
    { title: 'Token Payment', state: status.includes('payment') ? 'current' : 'future' },
    { title: 'Registration', state: status.includes('registration') ? 'current' : 'future' },
    { title: 'Closed', state: rank >= 4 || status.includes('completed') ? 'done' : 'future' },
  ] as const;
  return (
    <Screen fill>
      <TopBar onBack={back} title="Enquiry Status" sub="8-step pipeline" />
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        <View className="px-4">
          {loading && <LoadingBlock label="Loading enquiry details..." />}
          {!!error && <View className="mb-3"><ErrorCard message={error} onRetry={load} /></View>}
          <View className="rounded-card border border-ink-200 overflow-hidden bg-white mb-4">
            <View className="flex-row items-start gap-3 p-3.5">
              <PhotoPlaceholder tag={activeEnquiryId || 'enquiry'} width={72} height={72} className="rounded-md" />
              <View className="flex-1 min-w-0">
                <View className="flex-row items-start gap-2">
                  <Text className="text-[14px] font-semibold text-ink-900 flex-1" numberOfLines={2}>{property?.title || enquiry?.propertySnapshot?.title || 'Property enquiry'}</Text>
                  <Badge color={enquiryStatusColor(status)}>{enquiryStatusLabel(status)}</Badge>
                </View>
                <Text className="text-[11.5px] text-ink-500 mt-1" numberOfLines={1}>{property?.city || enquiry?.propertySnapshot?.location || 'Location pending'}</Text>
                <Text className="text-[14px] font-bold text-brand-600 mt-1">{formatINR(property?.price || enquiry?.propertySnapshot?.price || 0)}</Text>
                <Text className="text-[10.5px] text-ink-400 mt-0.5" numberOfLines={1}>Ref ID: {enquiry?.referenceId || activeEnquiryId || 'Pending'}</Text>
              </View>
            </View>
            <View className="flex-row border-t border-ink-100 bg-ink-50">
              {[[submittedLabel, 'Submitted'], [String(visitCount), 'Visits'], [enquiryStatusLabel(status), 'Status']].map(([value, label]) => (
                <View key={label} className="flex-1 py-2.5 px-2 items-center">
                  <Text className="text-[12px] font-semibold text-ink-800 text-center" numberOfLines={1}>{value}</Text>
                  <Text className="text-[10px] text-ink-500 mt-0.5">{label}</Text>
                </View>
              ))}
            </View>
          </View>
          <View className="rounded-card bg-brand-50 border border-brand-100 p-3 mb-5 flex-row items-center gap-3">
            <View className="w-10 h-10 rounded-full bg-brand-600 items-center justify-center"><Icon name="activity" size={18} color="white" /></View>
            <View className="flex-1">
              <Text className="text-[13px] font-semibold text-ink-900">{enquiryStatusLabel(status)}</Text>
              <Text className="text-[11.5px] text-brand-700 mt-0.5">{visitCount ? `${visitCount} visit record(s) linked to this enquiry.` : 'Builtglory will update each step as your enquiry progresses.'}</Text>
            </View>
          </View>
          <Timeline steps={steps as any} />
        </View>
      </ScrollView>
      <View className="p-4 bg-white border-t border-ink-200">
        <Pressable onPress={cancel} disabled={canceling || isCancelled} className={`w-full h-12 rounded-xl items-center justify-center ${canceling || isCancelled ? 'bg-ink-50' : 'bg-rose-50'}`}>
          <Text className={`font-medium text-[14px] ${canceling || isCancelled ? 'text-ink-400' : 'text-rose-600'}`}>{isCancelled ? 'Enquiry Cancelled' : canceling ? 'Cancelling...' : 'Cancel Enquiry'}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

export function NoEnquiriesScreen() {
  const { go, back } = useNav();
  const { authToken } = useAppState();
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!authToken) return;
    listBuyEnquiries(authToken, { limit: 1 }).then((items) => setCount(items.length)).catch(() => setCount(null));
  }, [authToken]);
  return (
    <Screen>
      <TopBar onBack={back} title="My Enquiries" />
      <View className="flex-1 items-center justify-center px-8">
        <View className="w-28 h-28 rounded-3xl bg-brand-50 items-center justify-center mb-5"><Icon name="inbox" size={48} color="#1A6FFF" strokeWidth={1.5} /></View>
        <Text className="text-[18px] font-bold text-ink-900 text-center">You haven't submitted any enquiries yet.</Text>
        <Text className="text-[13px] text-ink-500 mt-2 max-w-[250px] leading-relaxed text-center">{count && count > 0 ? 'You already have enquiries. Open My Enquiries to view them.' : 'Browse verified properties and submit an enquiry to get started.'}</Text>
        <Btn className="mt-6" icon="search" onPress={() => go('home')}>Browse Properties</Btn>
      </View>
    </Screen>
  );
}

// ─── P-11 Document Viewer (PDF) ───────────────────────────────
export function DocumentViewerScreen() {
  const { back, ctx } = useNav();
  const { authToken } = useAppState();
  const doc = ctx?.doc || { name: 'Sale Deed' };
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [readUrl, setReadUrl] = useState(directDocumentUrlOf(doc));
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const totalPages = 6;
  const documentId = documentIdOf(doc);
  const loadReadUrl = async () => {
    const directUrl = directDocumentUrlOf(doc);
    if (directUrl) {
      setReadUrl(directUrl);
      return;
    }
    if (!authToken || !documentId) {
      setError('A secure document URL is not available for this record yet.');
      return;
    }
    setLoadingUrl(true);
    setError(null);
    try {
      const result = await getCustomerDocumentReadUrl(authToken, documentId);
      setReadUrl(result.readUrl);
    } catch {
      setError('Could not create a secure document read URL.');
    } finally {
      setLoadingUrl(false);
    }
  };
  useEffect(() => {
    loadReadUrl();
  }, [authToken, documentId]);
  const openDocument = async () => {
    if (!readUrl) {
      await loadReadUrl();
      return;
    }
    Linking.openURL(readUrl).catch(() => setError('Could not open this document.'));
  };
  return (
    <View className="flex-1 bg-ink-900">
      <View className="h-11" />
      <View className="px-3 py-2.5 flex-row items-center gap-2">
        <Pressable onPress={back} className="w-9 h-9 rounded-full items-center justify-center"><Icon name="arrow-left" size={20} color="white" /></Pressable>
        <View className="flex-1">
          <Text className="text-[14px] font-semibold text-white" numberOfLines={1}>{doc.name}.pdf</Text>
          <Text className="text-[10.5px] text-white/50">{readUrl ? 'Secure URL ready' : `Page ${page} of ${totalPages}`}</Text>
        </View>
        <Pressable onPress={openDocument} className="w-9 h-9 rounded-full items-center justify-center"><Icon name="download" size={17} color="white" /></Pressable>
        <Pressable onPress={openDocument} className="w-9 h-9 rounded-full items-center justify-center"><Icon name="external-link" size={16} color="white" /></Pressable>
      </View>
      {!!error && (
        <View className="mx-4 mb-3 rounded-card border border-rose-300 bg-rose-500/10 p-3 flex-row items-center gap-2">
          <Icon name="alert-circle" size={14} color="#FDA4AF" />
          <Text className="text-[12px] text-rose-100 flex-1">{error}</Text>
          <Pressable onPress={loadReadUrl}><Text className="text-[11px] font-semibold text-white">Retry</Text></Pressable>
        </View>
      )}
      <View className="flex-1 items-center justify-center p-4">
        <View className="bg-white rounded shadow-2xl overflow-hidden" style={{ width: 280 * zoom }}>
          <View className="p-6">
            <View className="items-center mb-4">
              <Text className="text-[11px] font-bold text-ink-900 uppercase tracking-wider">{doc.name}</Text>
              <Text className="text-[8px] text-ink-400 mt-1">{loadingUrl ? 'Generating secure read URL...' : readUrl ? 'Builtglory · Secure document ready' : 'Builtglory · Document metadata'}</Text>
            </View>
            <View className="gap-1.5">
              {Array.from({ length: 10 }).map((_, i) => (
                <View key={i} className="h-1.5 rounded-full bg-ink-100" style={{ width: `${60 + ((i * 37) % 40)}%` }} />
              ))}
            </View>
            <View className="my-4 h-20 rounded bg-ink-50 items-center justify-center"><Icon name="stamp" size={28} color="#CBD5E1" /></View>
            <Pressable onPress={openDocument} className={`h-10 rounded-card items-center justify-center ${readUrl ? 'bg-brand-600' : 'bg-ink-200'}`}>
              <Text className={`text-[12px] font-semibold ${readUrl ? 'text-white' : 'text-ink-600'}`}>{readUrl ? 'Open secure document' : loadingUrl ? 'Preparing document...' : 'Request secure URL'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
      <View className="px-4 py-3 flex-row items-center justify-between border-t border-white/10">
        <Pressable onPress={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="w-10 h-10 rounded-full bg-white/10 items-center justify-center"><Icon name="chevron-left" size={18} color="white" /></Pressable>
        <View className="flex-row items-center gap-2">
          <Pressable onPress={() => setZoom((z) => Math.max(0.8, z - 0.2))} className="w-10 h-10 rounded-full bg-white/10 items-center justify-center"><Icon name="zoom-out" size={16} color="white" /></Pressable>
          <Text className="text-white/70 text-[12px] w-10 text-center">{Math.round(zoom * 100)}%</Text>
          <Pressable onPress={() => setZoom((z) => Math.min(2, z + 0.2))} className="w-10 h-10 rounded-full bg-white/10 items-center justify-center"><Icon name="zoom-in" size={16} color="white" /></Pressable>
        </View>
        <Pressable onPress={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="w-10 h-10 rounded-full bg-white/10 items-center justify-center"><Icon name="chevron-right" size={18} color="white" /></Pressable>
      </View>
    </View>
  );
}
