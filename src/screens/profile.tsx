import React, { useEffect, useState } from 'react';
import { Image, View, Text, Pressable } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Icon from '../components/Icon';
import { BrandLogo } from '../components/BrandLogo';
import { Screen, TopBar, Field, Input, Badge, PhotoPlaceholder, Sheet, UserAvatar, PageBody } from '../components/shared';
import { useLayout } from '../layout/breakpoints';
import { formatINR } from '../data/data';
import { useNav } from '../navigation/useNav';
import { useFocusEffect } from '@react-navigation/native';
import { useAppState } from '../state/AppState';
import {
  BuyEnquiry,
  createCallbackRequest,
  createAppFeedback,
  CustomerProfile,
  CustomerProperty,
  getFavoriteProperties,
  listBuyEnquiries,
  listCustomerProperties,
  listSellRequests,
  SellRequest,
  uploadCustomerDocument,
} from '../api/customer';
import {
  contentBody,
  contentMetaString,
  fallbackAboutContent,
  fallbackNewsContent,
  fallbackPrivacyContent,
  fallbackTermsContent,
  useContentItem,
  useContentSection,
} from '../content';
import {
  BUY_ENQUIRIES_CACHE_PREFIX,
  HistoryCache,
  HOME_UNREAD_CACHE_PREFIX,
  PROFILE_SUMMARY_CACHE_PREFIX,
  ProfileStats,
  ProfileSummaryCache,
  SELL_LISTINGS_CACHE_PREFIX,
} from '../state/primaryTabCache';
import { refreshUnreadNotificationCount } from '../utils/notificationSync';

function apiMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function profileName(user?: CustomerProfile | null) {
  return user?.name || user?.fullName || 'BuiltGlory Customer';
}

function profilePhone(user?: CustomerProfile | null) {
  return user?.phone || user?.mobileNumber || user?.phoneNormalized || 'Phone not available';
}

function propertyId(property?: CustomerProperty | null) {
  return String(property?._id ?? property?.id ?? property?.referenceId ?? '');
}

function enquiryTitle(enquiry: BuyEnquiry) {
  if (enquiry.propertySnapshot?.title) return enquiry.propertySnapshot.title;
  if (typeof enquiry.propertyId === 'object' && enquiry.propertyId?.title) return enquiry.propertyId.title;
  return enquiry.referenceId || 'Property enquiry';
}

function enquiryLocation(enquiry: BuyEnquiry) {
  if (enquiry.propertySnapshot?.location) return enquiry.propertySnapshot.location;
  if (typeof enquiry.propertyId === 'object') {
    const address = enquiry.propertyId.address;
    return [address?.locality, address?.city].filter(Boolean).join(', ') || enquiry.propertyId.locality || 'Location pending';
  }
  return 'Location pending';
}

function enquiryPrice(enquiry: BuyEnquiry) {
  const price = enquiry.propertySnapshot?.price ?? (typeof enquiry.propertyId === 'object' ? enquiry.propertyId.price : undefined);
  return typeof price === 'number' ? formatINR(price) : 'Price pending';
}

function sellTitle(request: SellRequest) {
  return request.propertyTitle || request.referenceId || 'Seller listing';
}

function sellLocation(request: SellRequest) {
  return [request.address?.locality, request.address?.city].filter(Boolean).join(', ') || 'Location pending';
}

function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View className="p-3 rounded-card border border-rose-100 bg-rose-50">
      <Text className="text-[12px] text-rose-700">{message}</Text>
      {onRetry && (
        <Pressable onPress={onRetry} className="mt-2">
          <Text className="text-[12px] font-semibold text-rose-700">Retry</Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── P-01 Profile ────────────────────────────────────────────
export function ProfileScreen() {
  const { go, resetTo } = useNav();
  const layout = useLayout();
  const { authToken, currentUser, getCachedValue, setCachedValue, clearCachedValue, refreshCurrentUser, signOut } = useAppState();
  const [unread, setUnread] = useState(0);
  const [showLogout, setShowLogout] = useState(false);
  const [stats, setStats] = useState<ProfileStats>({ saved: 0, enquiries: 0, listed: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const menuItems = [
    { icon: 'inbox', label: 'My Enquiries', sub: 'Track your buyer enquiries', target: 'myEnquiries' },
    { icon: 'calendar', label: 'My Visits', sub: 'Manage your property visits', target: 'myVisits' },
    { icon: 'handshake', label: 'My Deals', sub: 'Track your active deals', target: 'myDeals' },
    { icon: 'tag', label: 'My Listings', sub: 'Manage your property listings', target: 'myListings' },
    { icon: 'heart', label: 'Saved Properties', sub: 'Your saved properties', target: 'favorites' },
    { icon: 'settings', label: 'Settings', sub: 'App preferences and configuration', target: 'settingsMain' },
    { icon: 'help-circle', label: 'Help & Support', sub: 'Get support and share feedback', target: 'help' },
    { icon: 'info', label: 'General Info', sub: 'About, terms and privacy', target: 'generalInfo' },
  ];

  const loadProfileSummary = async () => {
    if (!authToken) {
      setError('Please sign in again to load your profile.');
      return;
    }
    const cacheKey = `${PROFILE_SUMMARY_CACHE_PREFIX}:${authToken}`;
    const cached = getCachedValue<ProfileSummaryCache>(cacheKey);
    if (cached) {
      setStats(cached.stats);
      setUnread(cached.unread);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      await refreshCurrentUser();
      const [favorites, enquiries, listings] = await Promise.all([
        getFavoriteProperties(authToken),
        listBuyEnquiries(authToken, { limit: 50, sort: 'newest' }),
        listSellRequests(authToken, { limit: 50, sort: 'newest' }),
      ]);
      const nextStats = { saved: favorites.length, enquiries: enquiries.length, listed: listings.length };
      const nextUnread = await refreshUnreadNotificationCount(authToken, { getCachedValue, setCachedValue, clearCachedValue });
      setStats(nextStats);
      setUnread(nextUnread);
      setCachedValue<ProfileSummaryCache>(cacheKey, { stats: nextStats, unread: nextUnread });
      setCachedValue(`${BUY_ENQUIRIES_CACHE_PREFIX}:${authToken}`, enquiries);
      setCachedValue(`${SELL_LISTINGS_CACHE_PREFIX}:${authToken}`, listings);
    } catch (err) {
      setError(apiMessage(err, 'Could not load profile summary.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authToken) return;
    loadProfileSummary();
  }, [authToken]);

  useFocusEffect(
    React.useCallback(() => {
      if (!authToken) {
        resetTo('login', { returnTo: 'profile' });
        return;
      }
      void refreshUnreadNotificationCount(authToken, { getCachedValue, setCachedValue, clearCachedValue }).then(setUnread);
    }, [authToken, clearCachedValue, getCachedValue, resetTo, setCachedValue]),
  );

  return (
    <Screen padBottom>
      <View className="bg-white pt-2 pb-5" style={{ paddingHorizontal: layout.gutter }}>
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-[18px] font-semibold text-ink-900 flex-1 min-w-0 pr-3">Profile</Text>
          <Pressable onPress={() => go('notifications')} className="w-11 h-11 rounded-full bg-ink-100 items-center justify-center relative">
            <Icon name="bell" size={17} color="#64748B" />
            {unread > 0 && <View className="absolute top-1 right-1 min-w-[16px] h-4 bg-rose-500 rounded-full items-center justify-center px-1"><Text className="text-white text-[9px] font-bold">{unread}</Text></View>}
          </Pressable>
        </View>
        <View className="flex-row items-center gap-4">
          <UserAvatar
            imageUri={typeof currentUser?.profilePhoto === 'string' ? currentUser.profilePhoto : null}
            size={64}
            iconSize={32}
          />
          <View className="flex-1 min-w-0">
            <Text className="text-[16px] font-semibold text-ink-900" numberOfLines={1}>{profileName(currentUser)}</Text>
            <Text className="text-[13px] text-ink-500" numberOfLines={1}>{profilePhone(currentUser)}</Text>
            <View className="flex-row items-center gap-1 mt-0.5"><Icon name="badge-check" size={12} color="#10B981" /><Text className="text-[11px] text-emerald-600 font-medium">Verified</Text></View>
          </View>
          <Pressable onPress={() => go('profileEdit')} className="w-9 h-9 rounded-full bg-ink-100 items-center justify-center"><Icon name="edit-2" size={15} color="#64748B" /></Pressable>
        </View>
        {error ? <View className="mt-4"><InlineError message={error} onRetry={loadProfileSummary} /></View> : null}
        <View className="flex-row gap-2 mt-4">
          {[[String(stats.saved), 'Saved'], [String(stats.enquiries), 'Enquiries'], [String(stats.listed), 'Listed']].map(([n, l]) => (
            <View key={l} className="flex-1 p-2 bg-ink-50 rounded-card items-center">
              <Text className="text-[18px] font-bold text-ink-900">{n}</Text>
              <Text className="text-[10px] text-ink-500">{l}</Text>
            </View>
          ))}
        </View>
        {loading && <Text className="text-[11px] text-ink-400 mt-2">Refreshing profile summary...</Text>}
      </View>
      <PageBody className="py-4 gap-2">
        {menuItems.map((item) => (
          <Pressable key={item.label} onPress={() => go(item.target)} className="flex-row items-center gap-4 p-3.5 bg-white rounded-card border border-ink-200">
            <View className="w-10 h-10 bg-ink-100 rounded-full items-center justify-center"><Icon name={item.icon} size={18} color="#64748B" /></View>
            <View className="flex-1 min-w-0"><Text className="text-[14px] font-semibold text-ink-900">{item.label}</Text><Text className="text-[11.5px] text-ink-500" numberOfLines={1}>{item.sub}</Text></View>
            <Icon name="chevron-right" size={16} color="#94A3B8" />
          </Pressable>
        ))}
        <Pressable onPress={() => setShowLogout(true)} className="flex-row items-center gap-4 p-3.5 bg-white rounded-card border border-rose-100 mt-4">
          <View className="w-10 h-10 bg-rose-50 rounded-full items-center justify-center"><Icon name="log-out" size={18} color="#E11D48" /></View>
          <Text className="flex-1 text-[14px] font-semibold text-rose-600">Logout</Text>
          <Icon name="chevron-right" size={16} color="#E11D48" />
        </Pressable>
      </PageBody>
      {showLogout && (
        <Sheet onClose={() => setShowLogout(false)}>
          <View className="items-center mb-6">
            <View className="w-16 h-16 rounded-full bg-rose-50 items-center justify-center mb-4"><Icon name="log-out" size={32} color="#E11D48" /></View>
            <Text className="text-[18px] font-bold text-ink-900">Logout?</Text>
            <Text className="text-[13px] text-ink-500 mt-2 text-center">Are you sure you want to logout from your account?</Text>
          </View>
          <View className="gap-2">
            <Pressable
              onPress={async () => {
                await signOut();
                resetTo('login');
              }}
              className="w-full min-h-12 py-3 rounded-xl items-center justify-center bg-rose-600"
            >
              <Text className="text-white font-semibold text-[15px]">Yes, Logout</Text>
            </Pressable>
            <Pressable onPress={() => setShowLogout(false)} className="w-full min-h-12 py-3 rounded-xl items-center justify-center border border-ink-200"><Text className="text-ink-700 font-semibold text-[15px]">Cancel</Text></Pressable>
          </View>
        </Sheet>
      )}
    </Screen>
  );
}

// ─── P-02 Edit Profile ───────────────────────────────────────
export function ProfileEditScreen() {
  const { go, back } = useNav();
  const { authToken, currentUser, refreshCurrentUser, updateProfile } = useAppState();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarState, setAvatarState] = useState<'empty' | 'uploading' | 'done' | 'error'>('empty');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const user = currentUser;
    if (!user) return;
    setName(profileName(user) === 'BuiltGlory Customer' ? '' : profileName(user));
    setEmail(typeof user?.email === 'string' ? user.email : '');
    setPhone(profilePhone(user));
    setAvatarUri(typeof user?.profilePhoto === 'string' && user.profilePhoto ? user.profilePhoto : null);
    setAvatarState(typeof user?.profilePhoto === 'string' && user.profilePhoto ? 'done' : 'empty');
  }, [currentUser]);

  useEffect(() => {
    refreshCurrentUser().catch(() => undefined);
  }, [refreshCurrentUser]);

  const save = async () => {
    if (!name.trim()) {
      setError('Full name is required.');
      return;
    }
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      await updateProfile({
        name: name.trim(),
        ...(email.trim() ? { email: email.trim().toLowerCase() } : {}),
      });
      setSaved(true);
      setTimeout(() => back(), 700);
    } catch (err) {
      setError(apiMessage(err, 'Could not save profile changes.'));
    } finally {
      setSaving(false);
    }
  };
  const changeProfilePhoto = async () => {
    if (avatarState === 'uploading') return;
    if (!authToken) {
      setError('Please sign in again before uploading a profile photo.');
      return;
    }
    setAvatarState('uploading');
    setError('');
    try {
      const user = currentUser ?? await refreshCurrentUser();
      const userId = String(user?.id ?? user?._id ?? '');
      if (!userId) throw new Error('Could not load your profile. Please try again.');

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setAvatarState(avatarUri ? 'done' : 'empty');
        setError('Photo library permission is required to upload a profile photo.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]) {
        setAvatarState(avatarUri ? 'done' : 'empty');
        return;
      }
      const asset = result.assets[0];
      const extension = (asset.mimeType || '').split('/')[1] || asset.uri.split('.').pop() || 'jpg';
      const uploaded = await uploadCustomerDocument(authToken, {
        ownerType: 'user',
        ownerId: userId,
        purpose: 'property_media',
        documentType: 'profile_photo',
        file: {
          uri: asset.uri,
          name: asset.fileName?.trim() || `profile-photo.${extension}`,
          type: asset.mimeType || `image/${extension}`,
        },
      });
      if (!uploaded.url) throw new Error('Profile photo upload did not return a URL.');
      const updated = await updateProfile({ profilePhoto: uploaded.url });
      const nextUri = typeof updated.profilePhoto === 'string' && updated.profilePhoto ? updated.profilePhoto : uploaded.url;
      setAvatarUri(nextUri);
      setAvatarState('done');
    } catch (err) {
      setAvatarState('error');
      setError(apiMessage(err, 'Could not upload your profile photo. Please try again.'));
    }
  };
  return (
    <Screen>
      <TopBar onBack={back} title="Edit Profile" />
      <View className="px-6">
        <View className="items-center mb-6">
          <View className="relative">
            <View className={`w-24 h-24 rounded-full items-center justify-center overflow-hidden ${avatarState === 'error' ? 'bg-rose-50' : avatarUri ? 'bg-brand-100' : 'bg-ink-100'}`}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} className="w-full h-full" resizeMode="cover" />
              ) : (
                <Icon name="user" size={44} color={avatarState === 'error' ? '#E11D48' : '#1A6FFF'} />
              )}
            </View>
            <Pressable
              onPress={changeProfilePhoto}
              disabled={avatarState === 'uploading'}
              className={`absolute bottom-0 right-0 w-8 h-8 rounded-full items-center justify-center ${avatarState === 'error' ? 'bg-rose-500' : 'bg-brand-600'} ${avatarState === 'uploading' ? 'opacity-70' : ''}`}
            >
              <Icon name={avatarState === 'error' ? 'rotate-cw' : 'camera'} size={14} color="white" />
            </Pressable>
          </View>
          <Pressable onPress={changeProfilePhoto} disabled={avatarState === 'uploading'} className="mt-3">
            <Text className="text-[12px] font-semibold text-brand-600">{avatarState === 'uploading' ? 'Uploading photo...' : avatarUri ? 'Change profile picture' : 'Add profile picture'}</Text>
          </Pressable>
        </View>
        <View className="gap-4">
          <Field label="Full Name" required><Input icon="user" value={name} onChangeText={setName} /></Field>
          <Field label="Phone Number" hint="Verified — cannot be changed">
            <View className="flex-row items-center gap-2 min-h-12 py-2.5 px-3 bg-ink-100 border border-ink-200 rounded-card">
              <Icon name="phone" size={16} color="#94A3B8" /><Text className="flex-1 text-[14px] text-ink-700">{phone}</Text><Icon name="lock" size={14} color="#94A3B8" />
            </View>
          </Field>
          <Field label="Email Address"><Input icon="mail" value={email} onChangeText={setEmail} /></Field>
        </View>
        {!!error && <View className="mt-4"><InlineError message={error} /></View>}
        <Pressable onPress={save} disabled={saving} className={`w-full min-h-12 py-3 mt-6 rounded-xl items-center justify-center ${saved ? 'bg-emerald-500' : 'bg-brand-600'} ${saving ? 'opacity-70' : ''}`}>
          <Text className="text-white font-semibold text-[15px]">{saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}</Text>
        </Pressable>
        <Pressable onPress={() => go('changePhone')} className="w-full min-h-11 py-2.5 mt-3 rounded-xl items-center justify-center bg-ink-50">
          <Text className="text-brand-600 font-semibold text-[13px]">Change Phone Number</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

// ─── G-01 Notifications ──────────────────────────────────────
export { NotificationsScreen } from '../notifications';

// ─── Extras: Offers, NewsInsights, GeneralInfo, HelpFeedback, MyEnquiries (history) ──
export function OffersScreen() {
  const { back, go } = useNav();
  const { authToken } = useAppState();
  const [featured, setFeatured] = useState<CustomerProperty[]>([]);
  const [enquiryCount, setEnquiryCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const loadOffers = async () => {
    setLoading(true);
    setError('');
    try {
      const [properties, enquiries] = await Promise.all([
        listCustomerProperties({ featured: true, limit: 6, sort: 'newest' }),
        authToken ? listBuyEnquiries(authToken, { limit: 50, sort: 'newest' }).catch(() => []) : Promise.resolve([]),
      ]);
      setFeatured(properties);
      setEnquiryCount(enquiries.length);
    } catch (err) {
      setError(apiMessage(err, 'Could not load offers right now.'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    loadOffers();
  }, [authToken]);
  const offers = [
    { icon: 'percent', title: 'Home Loan at 8.5%', sub: enquiryCount ? `Available for ${enquiryCount} active enquiry context(s)` : 'Partner banks · Limited time', color: '#1A6FFF', tag: 'Finance' },
    { icon: 'shield', title: 'Free Legal Verification', sub: featured.length ? `${featured.length} featured verified listing(s)` : 'For premium listings only', color: '#10B981', tag: 'New' },
    { icon: 'truck', title: 'Free Interior Consult', sub: 'Request callback to check eligibility', color: '#F59E0B', tag: 'Limited' },
    { icon: 'star', title: 'Priority Listing Boost', sub: 'Seller listings can be reviewed from History', color: '#8B5CF6', tag: 'Seller' },
  ];
  return (
    <Screen>
      <TopBar onBack={back} title="Offers & Deals" sub="Exclusive to Builtglory members" />
      <PageBody className="gap-3">
        {loading && <Text className="text-[12px] text-ink-500">Loading live offer context...</Text>}
        {!!error && <InlineError message={error} onRetry={loadOffers} />}
        {offers.map((o) => (
          <Pressable key={o.title} onPress={() => go(o.tag === 'Seller' ? 'historyEnquiries' : 'buyTypes')} className="rounded-card border border-ink-200 p-4 flex-row gap-4">
            <View className="w-12 h-12 rounded-xl items-center justify-center" style={{ backgroundColor: o.color + '18' }}><Icon name={o.icon} size={22} color={o.color} /></View>
            <View className="flex-1">
              <View className="flex-row items-center gap-2 mb-0.5">
                <Text className="text-[14px] font-semibold text-ink-900">{o.title}</Text>
                <View className="px-1.5 py-0.5 rounded-full" style={{ backgroundColor: o.color + '18' }}><Text className="text-[10px] font-bold" style={{ color: o.color }}>{o.tag}</Text></View>
              </View>
              <Text className="text-[12px] text-ink-500">{o.sub}</Text>
            </View>
          </Pressable>
        ))}
      </PageBody>
    </Screen>
  );
}

export function NewsInsightsScreen() {
  const { back } = useNav();
  const { items: articles, loading, error, reload } = useContentSection('news', fallbackNewsContent);
  return (
    <Screen>
      <TopBar onBack={back} title="News & Insights" sub="Real estate market updates" />
      <PageBody className="gap-3">
        {loading && <Text className="text-[12px] text-ink-500">Loading latest articles...</Text>}
        {!!error && (
          <Pressable onPress={reload} className="p-3 rounded-card border border-amber-200 bg-amber-50">
            <Text className="text-[12px] text-amber-800">Using saved articles. Tap to retry CMS content.</Text>
          </Pressable>
        )}
        {articles.map((a) => (
          <View key={a.slug} className="rounded-card border border-ink-200 overflow-hidden bg-white">
            <PhotoPlaceholder tag={'news-' + a.slug} height={120}>
              <View className="absolute top-2 left-2"><Badge color="brand">{a.category || a.excerpt || 'News'}</Badge></View>
            </PhotoPlaceholder>
            <View className="p-3">
              <Text className="text-[14px] font-semibold text-ink-900 leading-display-tight mb-2">{a.title}</Text>
              {!!a.body && <Text className="text-[12px] text-ink-500 mb-2" numberOfLines={2}>{a.body}</Text>}
              <View className="flex-row items-center gap-3"><Text className="text-[11px] text-ink-500">{contentMetaString(a, 'publishedLabel', a.publishedAt ? new Date(a.publishedAt).toLocaleDateString('en-IN') : 'Recently')}</Text><Text className="text-[11px] text-ink-500">{contentMetaString(a, 'readTime', '4 min')} read</Text></View>
            </View>
          </View>
        ))}
      </PageBody>
    </Screen>
  );
}

export function GeneralInfoScreen() {
  const { back, go } = useNav();
  const { item: about } = useContentItem('about-builtglory', fallbackAboutContent);
  const sections = [
    { icon: 'building-2', title: about.title, sub: about.excerpt || "India's verified real estate marketplace", target: 'aboutUs' },
    { icon: 'shield', title: 'Privacy Policy', sub: 'How we use and protect your data', target: 'privacyPolicy' },
    { icon: 'file-text', title: 'Terms of Service', sub: 'User agreement and marketplace rules', target: 'termsOfUse' },
    { icon: 'star', title: 'Rate the App', sub: 'Share your experience on the App Store', target: 'rateApp' },
  ];
  return (
    <Screen>
      <TopBar onBack={back} title="General Info" sub="About Builtglory" />
      <PageBody>
        <View className="flex-row items-center gap-3 p-4 bg-ink-50 rounded-card mb-4">
          <BrandLogo size={48} />
          <View><Text className="text-[15px] font-bold text-ink-900">BUILTGLORY</Text><Text className="text-[11px] text-ink-500">Version {contentMetaString(about, 'version', '1.0.0')} · India</Text></View>
        </View>
        <View className="rounded-card border border-ink-200">
          {sections.map((s, i) => (
            <Pressable key={s.title} onPress={() => s.target && go(s.target)} className={`flex-row items-center gap-3 p-4 ${i ? 'border-t border-ink-100' : ''}`}>
              <View className="w-10 h-10 rounded-full bg-ink-100 items-center justify-center"><Icon name={s.icon} size={18} color="#64748B" /></View>
              <View className="flex-1"><Text className="text-[14px] font-semibold text-ink-900">{s.title}</Text><Text className="text-[11.5px] text-ink-500">{s.sub}</Text></View>
              <Icon name="chevron-right" size={16} color="#94A3B8" />
            </Pressable>
          ))}
        </View>
      </PageBody>
    </Screen>
  );
}

function LegalContentScreen({
  slug,
  fallback,
  title,
  sub,
}: {
  slug: string;
  fallback: typeof fallbackTermsContent;
  title: string;
  sub: string;
}) {
  const { back } = useNav();
  const { item, loading, error, reload } = useContentItem(slug, fallback);
  const updatedLabel = contentMetaString(
    item,
    'lastUpdatedLabel',
    item.updatedAt ? new Date(item.updatedAt).toLocaleDateString('en-IN') : 'Latest version'
  );

  return (
    <Screen>
      <TopBar onBack={back} title={title} sub={sub} />
      <PageBody className="pb-6">
        {loading && <Text className="mb-3 text-[12px] text-ink-500">Loading latest legal copy...</Text>}
        {!!error && (
          <Pressable onPress={reload} className="mb-3 p-3 rounded-card border border-amber-200 bg-amber-50">
            <Text className="text-[12px] text-amber-800">Using saved legal copy. Tap to retry CMS content.</Text>
          </Pressable>
        )}
        <View className="rounded-card border border-ink-200 bg-white overflow-hidden">
          <View className="p-4 border-b border-ink-100">
            <Text className="text-[18px] font-bold text-ink-900">{item.title}</Text>
            {!!item.excerpt && <Text className="mt-1 text-[12px] text-ink-500">{item.excerpt}</Text>}
            <Text className="mt-2 text-[11px] text-ink-400">Last updated: {updatedLabel}</Text>
          </View>
          <View className="p-4">
            <Text className="text-[13px] leading-6 text-ink-700">{contentBody(item)}</Text>
          </View>
        </View>
      </PageBody>
    </Screen>
  );
}

export function TermsOfUseScreen() {
  return (
    <LegalContentScreen
      slug="terms-of-service"
      fallback={fallbackTermsContent}
      title="Terms of Use"
      sub="User agreement and marketplace rules"
    />
  );
}

export function PrivacyPolicyScreen() {
  return (
    <LegalContentScreen
      slug="privacy-policy"
      fallback={fallbackPrivacyContent}
      title="Privacy Policy"
      sub="How we use and protect your data"
    />
  );
}

export function HelpFeedbackScreen() {
  const { back } = useNav();
  const { authToken } = useAppState();
  const [feedback, setFeedback] = useState('');
  const [callbackRequested, setCallbackRequested] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const submitFeedback = async () => {
    if (!authToken) {
      setError('Please sign in again to send feedback.');
      return;
    }
    if (!feedback.trim()) {
      setError('Please enter your feedback.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await createAppFeedback(authToken, {
        message: feedback.trim(),
        source: 'customer_app',
        sourceScreen: 'helpFeedback',
      });
      setSubmitted(true);
    } catch (err) {
      setError(apiMessage(err, 'Could not submit feedback.'));
    } finally {
      setSubmitting(false);
    }
  };
  const requestCallback = async () => {
    if (!authToken) {
      setError('Please sign in again to request a callback.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await createCallbackRequest(authToken, {
        source: 'help_support',
        sourceScreen: 'helpFeedback',
        category: 'general',
        reason: feedback.trim() || 'Customer requested callback from Help & Feedback.',
        bestTimePreference: 'afternoon',
      });
      setCallbackRequested(true);
    } catch (err) {
      setError(apiMessage(err, 'Could not request a callback.'));
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <Screen>
      <TopBar onBack={back} title="Help & Feedback" sub="We're here 24×7" />
      <PageBody className="gap-5">
        <Text className="text-[14px] font-semibold mb-2">Send Feedback</Text>
        {!!error && <InlineError message={error} />}
        {submitted ? (
          <View className="p-4 bg-emerald-50 rounded-card items-center"><Icon name="check-circle" size={28} color="#10B981" /><Text className="text-[13px] font-semibold text-emerald-700 mt-2">Thanks for your feedback!</Text></View>
        ) : (
          <>
            <Input multiline placeholder="Tell us what's on your mind…" value={feedback} onChangeText={setFeedback} />
            <Pressable onPress={submitFeedback} disabled={!feedback.trim() || submitting} className={`w-full min-h-12 py-3 rounded-xl items-center justify-center ${feedback.trim() && !submitting ? 'bg-brand-600' : 'bg-ink-100'}`}>
              <Text className={`font-semibold text-[15px] ${feedback.trim() && !submitting ? 'text-white' : 'text-ink-400'}`}>{submitting ? 'Submitting...' : 'Submit Feedback'}</Text>
            </Pressable>
          </>
        )}
        <Pressable onPress={requestCallback} disabled={submitting || callbackRequested} className={`w-full min-h-11 py-2.5 rounded-xl items-center justify-center border ${callbackRequested ? 'border-emerald-200 bg-emerald-50' : 'border-ink-200 bg-white'}`}>
          <Text className={`font-semibold text-[13px] ${callbackRequested ? 'text-emerald-700' : 'text-brand-600'}`}>{callbackRequested ? 'Callback requested' : 'Request support callback'}</Text>
        </Pressable>
      </PageBody>
    </Screen>
  );
}

// ─── P-03 History & Enquiries (alt view, used by some links) ──
export function MyEnquiriesHistoryScreen() {
  const { go, back } = useNav();
  const { authToken, getCachedValue, setCachedValue } = useAppState();
  const [tab, setTab] = useState('enquiries');
  const [enquiries, setEnquiries] = useState<BuyEnquiry[]>([]);
  const [sellRequests, setSellRequests] = useState<SellRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const statusColor: any = { responded: 'green', visit_scheduled: 'brand', negotiating: 'amber', awaiting: 'amber', closed: 'ink', new: 'brand', submitted: 'brand', draft: 'amber', approved: 'green', rejected: 'rose' };
  const loadHistory = async (force = false) => {
    if (!authToken) {
      setError('Please sign in again to load your history.');
      setRefreshing(false);
      return;
    }
    const historyCacheKey = `${BUY_ENQUIRIES_CACHE_PREFIX}:${authToken}:history`;
    const cachedHistory = force ? null : getCachedValue<HistoryCache>(historyCacheKey);
    if (cachedHistory) {
      setEnquiries(cachedHistory.enquiries);
      setSellRequests(cachedHistory.sellRequests);
      setLoading(false);
      setError('');
    } else if (force) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    if (!cachedHistory) setError('');
    try {
      const [buyerHistory, sellerHistory] = await Promise.all([
        listBuyEnquiries(authToken, { limit: 50, sort: 'newest' }),
        listSellRequests(authToken, { limit: 50, sort: 'newest' }),
      ]);
      setEnquiries(buyerHistory);
      setSellRequests(sellerHistory);
      setCachedValue<HistoryCache>(historyCacheKey, { enquiries: buyerHistory, sellRequests: sellerHistory });
      setCachedValue(`${BUY_ENQUIRIES_CACHE_PREFIX}:${authToken}`, buyerHistory);
      setCachedValue(`${SELL_LISTINGS_CACHE_PREFIX}:${authToken}`, sellerHistory);
    } catch (err) {
      if (!cachedHistory) setError(apiMessage(err, 'Could not load history.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
  useEffect(() => {
    loadHistory();
  }, [authToken]);
  return (
    <Screen refreshing={refreshing} onRefresh={() => loadHistory(true)}>
      <TopBar onBack={back} title="History & Enquiries" sub="Your activity on Builtglory" />
      <PageBody>
        <View className="flex-row gap-2 mb-4">
          {[['enquiries', 'Buy Enquiries'], ['listings', 'Sell Requests']].map(([id, l]) => (
            <Pressable key={id} onPress={() => setTab(id)} className={`flex-1 py-2 rounded-card border items-center ${tab === id ? 'border-brand-600 bg-brand-50' : 'border-ink-200'}`}>
              <Text className={`text-[13px] font-semibold ${tab === id ? 'text-brand-700' : 'text-ink-500'}`}>{l}</Text>
            </Pressable>
          ))}
        </View>
        {loading && <Text className="text-[12px] text-ink-500 mb-3">Loading history...</Text>}
        {!!error && <View className="mb-3"><InlineError message={error} onRetry={() => loadHistory(true)} /></View>}
        {tab === 'enquiries' ? (
          <View className="gap-3">
            {!loading && enquiries.length === 0 && <Text className="text-[13px] text-ink-500 text-center py-8">No buy enquiries yet.</Text>}
            {enquiries.map((e) => {
              const p = typeof e.propertyId === 'object' ? e.propertyId : null;
              const id = String(e._id ?? e.id ?? e.referenceId ?? '');
              const pid = propertyId(p);
              return (
              <View key={id} className="rounded-card border border-ink-200 overflow-hidden bg-white">
                <Pressable onPress={() => pid ? go('propertyDetail', { propertyId: pid }) : undefined} className="flex-row gap-3 p-3">
                  <PhotoPlaceholder tag={pid || id} width={64} height={64} className="rounded-md" />
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2"><Text className="text-[13px] font-semibold flex-1" numberOfLines={1}>{enquiryTitle(e)}</Text><Badge color={statusColor[e.status || 'awaiting'] || 'amber'}>{String(e.status || 'awaiting')}</Badge></View>
                    <Text className="text-[11px] text-ink-500" numberOfLines={1}>{enquiryLocation(e)} · {enquiryPrice(e)}</Text>
                  </View>
                </Pressable>
                <Pressable onPress={() => go('enquiryDetail', { enquiryId: id, enquiry: e })} className="px-3 py-2 bg-ink-50 border-t border-ink-100">
                  <Text className="text-[11.5px] text-ink-600">{e.referenceId ? `Reference ${e.referenceId}` : 'Open enquiry details'}</Text>
                </Pressable>
              </View>
              );
            })}
          </View>
        ) : (
          <View className="gap-3">
            {!loading && sellRequests.length === 0 && <Text className="text-[13px] text-ink-500 text-center py-8">No sell requests yet.</Text>}
            {sellRequests.map((request) => {
              const id = String(request._id ?? request.id ?? request.referenceId ?? '');
              return (
                <Pressable key={id} onPress={() => go('listingDetail', { sellRequestId: id, sellRequest: request })} className="rounded-card border border-ink-200 overflow-hidden bg-white">
                  <View className="flex-row gap-3 p-3">
                    <PhotoPlaceholder tag={id || sellTitle(request)} width={64} height={64} className="rounded-md" />
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2"><Text className="text-[13px] font-semibold flex-1" numberOfLines={1}>{sellTitle(request)}</Text><Badge color={statusColor[request.status || (request.isDraft ? 'draft' : 'submitted')] || 'brand'}>{request.isDraft ? 'draft' : String(request.status || 'submitted')}</Badge></View>
                      <Text className="text-[11px] text-ink-500" numberOfLines={1}>{sellLocation(request)} · {formatINR(request.askingPrice || 0)}</Text>
                      <Text className="text-[11px] text-ink-400 mt-1">{request.referenceId || 'Open listing status'}</Text>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </PageBody>
    </Screen>
  );
}
