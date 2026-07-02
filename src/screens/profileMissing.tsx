import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import Icon from '../components/Icon';
import { Screen, TopBar, Field, Input, Btn, Badge, Chip, PhotoPlaceholder, FadeInView, EmptyState } from '../components/shared';
import { formatINR } from '../data/data';
import { useNav } from '../navigation/useNav';
import { useAppState } from '../state/AppState';
import { BuyEnquiry, listBuyEnquiries, listSellRequests, SellRequest, sendCustomerOtp, verifyCustomerOtp } from '../api/customer';
import { BUY_ENQUIRIES_CACHE_PREFIX, SELL_LISTINGS_CACHE_PREFIX } from '../state/primaryTabCache';

function apiMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function sellRequestId(request: SellRequest) {
  return String(request._id ?? request.id ?? request.referenceId ?? '');
}

function sellTitle(request: SellRequest) {
  return request.propertyTitle || request.referenceId || 'Untitled listing';
}

function sellLocation(request: SellRequest) {
  const address = request.address;
  return [address?.locality, address?.city].filter(Boolean).join(', ') || 'Location pending';
}

function enquiryId(enquiry: BuyEnquiry) {
  return String(enquiry._id ?? enquiry.id ?? enquiry.referenceId ?? '');
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
  if (value === 'closed') return 'ink';
  if (value === 'negotiating') return 'amber';
  if (value === 'responded') return 'green';
  if (value === 'visit_scheduled') return 'brand';
  return 'amber';
}

function isActiveEnquiry(status?: string) {
  const value = String(status || 'new');
  return !['closed', 'cancelled', 'completed'].includes(value);
}

function enquiryProperty(enquiry: BuyEnquiry) {
  if (typeof enquiry.propertyId === 'object' && enquiry.propertyId) return enquiry.propertyId;
  return null;
}

function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View className="rounded-card border border-rose-100 bg-rose-50 p-3">
      <Text className="text-[12px] text-rose-700">{message}</Text>
      {onRetry && (
        <Pressable onPress={onRetry} className="mt-2">
          <Text className="text-[12px] font-semibold text-rose-700">Retry</Text>
        </Pressable>
      )}
    </View>
  );
}

function LoadingBlock({ label }: { label: string }) {
  return <View className="py-8 items-center"><Text className="text-[12px] text-ink-500">{label}</Text></View>;
}

// ─── P-03 Change Phone Number (OTP flow) ──────────────────────
export function ChangePhoneScreen() {
  const { go, back } = useNav();
  const { authToken, updateProfile } = useAppState();
  const [step, setStep] = useState<'new' | 'otp' | 'verified'>('new');
  const [newPhone, setNewPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [requestId, setRequestId] = useState('');
  const [timer, setTimer] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const sendOtp = async () => {
    if (!newPhone || newPhone.length < 10) return;
    setLoading(true);
    setError('');
    try {
      const response = await sendCustomerOtp(newPhone, '+91', 'change_phone');
      setRequestId(response.requestId);
      setStep('otp');
      setTimer(Math.max(1, Math.min(60, Math.ceil((new Date(response.canResendAt).getTime() - Date.now()) / 1000) || 30)));
    } catch (err) {
      setError(apiMessage(err, 'Could not send OTP to this phone number.'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (timer <= 0) return;
    const t = setInterval(() => setTimer((tm) => tm - 1), 1000);
    return () => clearInterval(t);
  }, [timer]);
  const verifyOtp = async () => {
    if (otp.length !== 6) return;
    if (!authToken) {
      setError('Please sign in again before changing phone number.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const verified = await verifyCustomerOtp({ phone: newPhone, otp, requestId, purpose: 'change_phone' });
      await updateProfile({
        phone: `+91 ${newPhone}`,
        phoneNormalized: verified.phoneNormalized || `91${newPhone}`,
        mobileNumber: newPhone,
      });
      setStep('verified');
      setTimeout(() => go('profileEdit'), 1200);
    } catch (err) {
      setError(apiMessage(err, 'Could not verify and update this phone number.'));
    } finally {
      setLoading(false);
    }
  };
  if (step === 'verified') {
    return (
      <Screen fill>
        <View className="flex-1 items-center justify-center px-6">
          <View className="mb-6 w-20 h-20 rounded-full bg-emerald-50 items-center justify-center"><Icon name="check-circle" size={44} color="#10B981" /></View>
          <Text className="text-[22px] font-bold text-center">Phone number updated</Text>
          <Text className="text-ink-500 mt-2 text-[13px]">Your new number +91 {newPhone} is now verified.</Text>
        </View>
      </Screen>
    );
  }
  return (
    <Screen>
      <TopBar onBack={back} title={step === 'new' ? 'Change Phone Number' : 'Verify Phone'} />
      <View className="px-4">
        {step === 'new' ? (
          <>
            <Text className="text-[16px] font-semibold mb-1 mt-2">Enter new phone number</Text>
            <Text className="text-[12.5px] text-ink-500 mb-4">We'll send a verification code to this number.</Text>
            <Field label="New Phone Number" required><Input prefix="+91" keyboardType="numeric" maxLength={10} value={newPhone} onChangeText={(v) => setNewPhone(v.replace(/\D/g, ''))} placeholder="9876543210" /></Field>
            {!!error && <View className="mt-4"><ErrorCard message={error} /></View>}
            <Btn className="w-full mt-6" disabled={loading || !newPhone || newPhone.length < 10} onPress={sendOtp}>{loading ? 'Sending...' : 'Send OTP'}</Btn>
          </>
        ) : (
          <>
            <Text className="text-[16px] font-semibold mb-1 mt-2">Enter verification code</Text>
            <Text className="text-[12.5px] text-ink-500 mb-4">We sent a 6-digit code to +91 {newPhone}</Text>
            <Field label="Verification Code" required><Input maxLength={6} keyboardType="numeric" value={otp} onChangeText={(v) => setOtp(v.replace(/\D/g, ''))} placeholder="000000" /></Field>
            {!!error && <View className="mt-4"><ErrorCard message={error} /></View>}
            <Btn className="w-full mt-6" disabled={loading || otp.length !== 6} onPress={verifyOtp}>{loading ? 'Verifying...' : 'Verify & Update'}</Btn>
            <Pressable onPress={sendOtp} disabled={loading || timer > 0} className="w-full mt-3 items-center"><Text className={`text-[13px] font-medium ${timer > 0 ? 'text-ink-400' : 'text-brand-600'}`}>{timer > 0 ? `Resend in ${timer}s` : 'Resend code'}</Text></Pressable>
          </>
        )}
      </View>
    </Screen>
  );
}

// ─── P-04 My Listings ──────────────────────────────────────────
export function MyListingsScreen() {
  const { go, back } = useNav();
  const { authToken, getCachedValue, setCachedValue } = useAppState();
  const [tab, setTab] = useState('all');
  const [listings, setListings] = useState<SellRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const loadListings = async (force = false) => {
    if (!authToken) {
      setError('Please sign in again to load your listings.');
      setRefreshing(false);
      return;
    }
    const cacheKey = `${SELL_LISTINGS_CACHE_PREFIX}:${authToken}`;
    const cached = getCachedValue<SellRequest[]>(cacheKey);
    if (cached && !force) {
      setListings(cached);
      setLoading(false);
      setError('');
      return;
    }
    if (force) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const nextListings = await listSellRequests(authToken, { limit: 50, sort: 'newest' });
      setListings(nextListings);
      setCachedValue(cacheKey, nextListings);
    } catch (err) {
      setError(apiMessage(err, 'Could not load your listings.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  useEffect(() => {
    loadListings();
  }, [authToken]);
  const filtered = tab === 'all'
    ? listings
    : listings.filter((l) => {
      if (tab === 'active') return !l.isDraft && !['sold', 'withdrawn', 'rejected'].includes(String(l.status));
      if (tab === 'sold') return ['sold', 'completed', 'acquired'].includes(String(l.status));
      if (tab === 'withdrawn') return ['withdrawn', 'paused'].includes(String(l.status));
      return String(l.status) === tab;
    });
  return (
    <Screen refreshing={refreshing} onRefresh={() => loadListings(true)}>
      <TopBar onBack={back} title="My Listings" sub={`${listings.length} total`} right={
        <Pressable onPress={() => go('sellTypes')} className="w-9 h-9 rounded-full bg-brand-600 items-center justify-center"><Icon name="plus" size={16} color="white" /></Pressable>
      } />
      <View className="px-4">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} className="mb-3">
          {['all', 'active', 'sold', 'withdrawn'].map((t) => (
            <Chip key={t} active={tab === t} onPress={() => setTab(t)}>{t === 'all' ? 'All' : t[0].toUpperCase() + t.slice(1)}</Chip>
          ))}
        </ScrollView>
        {!!error && <View className="mb-3"><ErrorCard message={error} onRetry={loadListings} /></View>}
        {loading && <LoadingBlock label="Loading your listings..." />}
        {!loading && !error && listings.length === 0 && (
          <EmptyState icon="tag" title="No listings yet" action="List a Property" onPress={() => go('sellTypes')} />
        )}
        <View className="gap-3">
          {filtered.map((p, idx) => (
            <FadeInView key={sellRequestId(p)} delay={idx * 45}>
            <Pressable onPress={() => go('listingDetail', { sellRequestId: sellRequestId(p), sellRequest: p })} className="rounded-card border border-ink-200 overflow-hidden bg-white flex-row gap-3 p-3">
              <PhotoPlaceholder tag={sellRequestId(p)} width={80} height={80} className="rounded-md">
                <View className="absolute top-1 left-1"><Badge color={p.isDraft ? 'amber' : p.status === 'rejected' ? 'rose' : p.status === 'sold' ? 'brand' : 'green'}>{p.isDraft ? 'draft' : p.status || 'active'}</Badge></View>
              </PhotoPlaceholder>
              <View className="flex-1 py-1">
                <Text className="text-[13px] font-semibold" numberOfLines={1}>{sellTitle(p)}</Text>
                <Text className="text-[11px] text-ink-500" numberOfLines={1}>{sellLocation(p)}</Text>
                <Text className="text-[13px] font-bold text-brand-600 mt-0.5">{formatINR(p.askingPrice || 0)}</Text>
              </View>
            </Pressable>
            </FadeInView>
          ))}
        </View>
      </View>
    </Screen>
  );
}

// ─── P-07 My Enquiries (consolidated) ─────────────────────────
export function MyEnquiriesConsolidatedScreen() {
  const { go, back } = useNav();
  const { authToken, getCachedValue, setCachedValue } = useAppState();
  const [tab, setTab] = useState('all');
  const [enquiries, setEnquiries] = useState<BuyEnquiry[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const loadEnquiries = async (force = false) => {
    if (!authToken) {
      setError('Please sign in again to load your enquiries.');
      setRefreshing(false);
      return;
    }
    const cacheKey = `${BUY_ENQUIRIES_CACHE_PREFIX}:${authToken}`;
    const cached = force ? null : getCachedValue<BuyEnquiry[]>(cacheKey);
    if (cached) {
      setEnquiries(cached);
      setLoading(false);
      setError('');
    } else if (force) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    if (!cached) setError('');
    try {
      const nextEnquiries = await listBuyEnquiries(authToken, { limit: 50, sort: 'newest' });
      setEnquiries(nextEnquiries);
      setCachedValue(cacheKey, nextEnquiries);
    } catch (err) {
      if (!cached) setError(apiMessage(err, 'Could not load your enquiries.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  useEffect(() => {
    loadEnquiries();
  }, [authToken]);
  const filtered = tab === 'all' ? enquiries : enquiries.filter((e) => {
    const status = String(e.status || 'new');
    return tab === 'active' ? isActiveEnquiry(status) : status === tab;
  });
  return (
    <Screen refreshing={refreshing} onRefresh={() => loadEnquiries(true)}>
      <TopBar onBack={back} title="My Enquiries" sub={`${enquiries.length} total`} />
      <View className="px-4">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} className="mb-3">
          {['all', 'active', 'responded', 'visit_scheduled', 'negotiating', 'closed'].map((t) => (
            <Chip key={t} active={tab === t} onPress={() => setTab(t)}>{t === 'all' ? 'All' : enquiryStatusLabel(t)}</Chip>
          ))}
        </ScrollView>
        {!!error && <View className="mb-3"><ErrorCard message={error} onRetry={() => loadEnquiries(true)} /></View>}
        {loading && <LoadingBlock label="Loading your enquiries..." />}
        {!loading && !error && enquiries.length === 0 && (
          <View className="py-12 items-center"><Icon name="inbox" size={40} color="#CBD5E1" /><Text className="mt-2 text-[13px] text-ink-400">No enquiries yet</Text><Btn className="mt-4" icon="search" onPress={() => go('home')}>Browse Properties</Btn></View>
        )}
        <View className="gap-3">
          {filtered.map((e) => (
            <Pressable key={enquiryId(e)} onPress={() => go('enquiryDetail', { enquiryId: enquiryId(e), enquiry: e })} className="rounded-card border border-ink-200 overflow-hidden bg-white flex-row gap-3 p-3">
              <PhotoPlaceholder tag={enquiryId(e)} width={64} height={64} className="rounded-md" />
              <View className="flex-1">
                <View className="flex-row items-center gap-2 mb-0.5"><Text className="text-[13px] font-semibold flex-1" numberOfLines={1}>{enquiryProperty(e)?.title || e.propertySnapshot?.title || e.referenceId || 'Property enquiry'}</Text><Badge color={enquiryStatusColor(e.status)}>{enquiryStatusLabel(e.status)}</Badge></View>
                <Text className="text-[11px] text-ink-500" numberOfLines={1}>{enquiryProperty(e)?.city || e.propertySnapshot?.location || 'Location pending'} · {formatINR(enquiryProperty(e)?.price || e.propertySnapshot?.price || 0)}</Text>
                <Text className="text-[10.5px] text-ink-600 mt-1">{e.visits?.length ? `${e.visits.length} visit record(s)` : e.submittedAt ? `Submitted ${new Date(e.submittedAt).toLocaleDateString()}` : 'Awaiting advisor update'}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>
    </Screen>
  );
}
