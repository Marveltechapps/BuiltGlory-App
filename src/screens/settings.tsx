import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from '../components/Icon';
import { Screen, TopBar, Field, Input, Toggle, Btn, UserAvatar } from '../components/shared';
import { useNav } from '../navigation/useNav';
import { useAppState } from '../state/AppState';
import { fallbackFaqContent, useContentSection, useFaqTopics } from '../content';
import {
  createCallbackRequest,
  createSupportTicket,
  cancelAccountDeletion,
  AccountDeletionStatus,
  CustomerApiError,
  CustomerProfile,
  getAccountDeletionStatus,
  listSupportTickets,
  requestAccountDeletion,
  SupportTicket,
} from '../api/customer';

const APP_SETTINGS_KEY = 'builtglory.appSettings';
const SUPPORT_PHONE = '+914440008000';

type NotificationChannel = 'sms' | 'whatsapp' | 'email' | 'push' | 'in_app';
type NotificationPrefs = Record<NotificationChannel, { transactional: boolean; marketing: boolean }>;
type AppPreferences = { language: 'English' | 'Tamil'; darkMode: boolean; locationMode: 'gps' | 'manual' };

const defaultNotificationPrefs: NotificationPrefs = {
  sms: { transactional: true, marketing: false },
  whatsapp: { transactional: true, marketing: false },
  email: { transactional: true, marketing: false },
  push: { transactional: true, marketing: false },
  in_app: { transactional: true, marketing: false },
};

const defaultAppPreferences: AppPreferences = {
  language: 'English',
  darkMode: false,
  locationMode: 'gps',
};

function apiMessage(error: unknown, fallback: string) {
  return error instanceof CustomerApiError ? error.message : fallback;
}

function profileName(user: CustomerProfile | null) {
  return user?.name || user?.fullName || 'Builtglory customer';
}

function profilePhone(user: CustomerProfile | null) {
  return user?.phone || user?.mobileNumber || user?.phoneNormalized || 'Phone not available';
}

function profileEmail(user: CustomerProfile | null) {
  return user?.email || 'Email not added';
}

function prefsFromUser(user: CustomerProfile | null): NotificationPrefs {
  const source = (user?.notificationPreferences ?? {}) as Partial<Record<NotificationChannel, Partial<{ transactional: boolean; marketing: boolean }>>>;
  return (Object.keys(defaultNotificationPrefs) as NotificationChannel[]).reduce((acc, channel) => {
    acc[channel] = {
      transactional: source[channel]?.transactional ?? defaultNotificationPrefs[channel].transactional,
      marketing: source[channel]?.marketing ?? defaultNotificationPrefs[channel].marketing,
    };
    return acc;
  }, {} as NotificationPrefs);
}

function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View className="p-3 rounded-card border border-rose-200 bg-rose-50 flex-row items-center gap-2">
      <Icon name="alert-circle" size={14} color="#E11D48" />
      <Text className="flex-1 text-[12px] text-rose-700">{message}</Text>
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
    <View className="py-8 items-center gap-2">
      <ActivityIndicator color="#1A6FFF" />
      <Text className="text-[12px] text-ink-500">{label}</Text>
    </View>
  );
}

function TicketStatus({ status }: { status?: string }) {
  const closed = status === 'resolved' || status === 'closed';
  return (
    <View className={`px-2 py-1 rounded-full ${closed ? 'bg-emerald-50' : 'bg-amber-50'}`}>
      <Text className={`text-[10px] font-semibold capitalize ${closed ? 'text-emerald-700' : 'text-amber-700'}`}>{status || 'open'}</Text>
    </View>
  );
}

// ─── A-01 Settings Main ──────────────────────────────────────
export function SettingsMainScreen() {
  const { go, back } = useNav();
  const { currentUser, refreshCurrentUser } = useAppState();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rows = [
    { icon: 'user', label: 'Edit Profile', sub: 'Name, photo, email', target: 'profileEdit' },
    { icon: 'bell', label: 'Notification Settings', sub: 'Choose what alerts you receive', target: 'notificationSettings' },
    { icon: 'smartphone', label: 'App Settings', sub: 'Language, theme, location', target: 'appSettings' },
    { icon: 'shield', label: 'Account Settings', sub: 'Password and account', target: 'accountSettings' },
  ];
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await refreshCurrentUser();
    } catch (err) {
      setError(apiMessage(err, 'Could not refresh account details.'));
    } finally {
      setLoading(false);
    }
  }, [refreshCurrentUser]);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <Screen>
      <TopBar onBack={back} title="Settings" />
      <View className="px-4 gap-4">
        <View className="p-4 rounded-card border border-brand-200 bg-brand-50 flex-row items-center gap-3">
          <UserAvatar
            imageUri={typeof currentUser?.profilePhoto === 'string' ? currentUser.profilePhoto : null}
            label={profileName(currentUser)}
            size={48}
            bgClassName="bg-brand-600"
          />
          <View className="flex-1">
            <Text className="text-[15px] font-bold text-ink-900">{profileName(currentUser)}</Text>
            <Text className="text-[11.5px] text-ink-600 mt-0.5">{profilePhone(currentUser)}</Text>
            <Text className="text-[11px] text-ink-500">{profileEmail(currentUser)}</Text>
          </View>
          {loading && <ActivityIndicator color="#1A6FFF" />}
        </View>
        {error && <InlineError message={error} onRetry={load} />}
        <View className="rounded-card border border-ink-200">
          {rows.map((r, i) => (
            <Pressable key={r.label} onPress={() => go(r.target)} className={`flex-row items-center gap-3 p-4 ${i ? 'border-t border-ink-100' : ''}`}>
              <View className="w-10 h-10 rounded-full bg-ink-100 items-center justify-center"><Icon name={r.icon} size={18} color="#64748B" /></View>
              <View className="flex-1"><Text className="text-[14px] font-semibold text-ink-900">{r.label}</Text><Text className="text-[11.5px] text-ink-500">{r.sub}</Text></View>
              <Icon name="chevron-right" size={16} color="#94A3B8" />
            </Pressable>
          ))}
        </View>
        <Pressable onPress={() => go('helpFaqs')} className="w-full flex-row items-center gap-3 p-4 rounded-card border border-brand-200 bg-brand-50">
          <View className="w-10 h-10 rounded-full bg-brand-600 items-center justify-center"><Icon name="circle-help" size={18} color="white" /></View>
          <View className="flex-1"><Text className="text-[14px] font-semibold text-brand-700">Help & Support</Text><Text className="text-[11.5px] text-brand-600">FAQs and customer support</Text></View>
          <Icon name="chevron-right" size={16} color="#1A6FFF" />
        </Pressable>
      </View>
    </Screen>
  );
}

// ─── A-02 Notification Settings ──────────────────────────────
export function NotificationSettingsScreen() {
  const { back } = useNav();
  const { currentUser, refreshCurrentUser, updateProfile } = useAppState();
  const [prefs, setPrefs] = useState<NotificationPrefs>(() => prefsFromUser(currentUser));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rows: [NotificationChannel, string, string][] = [
    ['push', 'Push notifications', 'App alerts for enquiries, visits and deals'],
    ['whatsapp', 'WhatsApp updates', 'Verified property and transaction reminders'],
    ['sms', 'SMS updates', 'Critical OTP, visit and payment messages'],
    ['email', 'Email updates', 'Documents, receipts and long-form updates'],
    ['in_app', 'In-app inbox', 'Notifications inside the Builtglory app'],
  ];
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const user = await refreshCurrentUser();
      setPrefs(prefsFromUser(user));
    } catch (err) {
      setError(apiMessage(err, 'Could not load notification settings.'));
    } finally {
      setLoading(false);
    }
  }, [refreshCurrentUser]);
  useEffect(() => {
    load();
  }, [load]);
  const set = async (channel: NotificationChannel, field: 'transactional' | 'marketing', value: boolean) => {
    const next = { ...prefs, [channel]: { ...prefs[channel], [field]: value } };
    setPrefs(next);
    setSaving(`${channel}-${field}`);
    setSaved(false);
    setError(null);
    try {
      await updateProfile({ notificationPreferences: next });
      setSaved(true);
    } catch (err) {
      setPrefs(prefs);
      setError(apiMessage(err, 'Could not save notification settings.'));
    } finally {
      setSaving(null);
    }
  };
  return (
    <Screen>
      <TopBar onBack={back} title="Notification Settings" />
      <View className="px-4 gap-3">
        {loading && <LoadingBlock label="Loading notification preferences..." />}
        {error && <InlineError message={error} onRetry={load} />}
        {saved && !saving && <View className="p-3 rounded-card bg-emerald-50 border border-emerald-200"><Text className="text-[12px] text-emerald-700">Preferences saved.</Text></View>}
        <View className="rounded-card border border-ink-200">
          {rows.map(([channel, label, sub], i) => (
            <View key={channel} className={`p-4 ${i ? 'border-t border-ink-100' : ''}`}>
              <View className="flex-row items-center gap-3">
                <View className="flex-1"><Text className="text-[14px] font-semibold text-ink-900">{label}</Text><Text className="text-[11.5px] text-ink-500">{sub}</Text></View>
                {saving?.startsWith(channel) && <ActivityIndicator color="#1A6FFF" />}
              </View>
              <View className="flex-row items-center justify-between mt-3">
                <Text className="text-[12px] text-ink-600">Transactional</Text>
                <Toggle on={prefs[channel].transactional} onChange={(v) => set(channel, 'transactional', v)} />
              </View>
              <View className="flex-row items-center justify-between mt-2">
                <Text className="text-[12px] text-ink-600">Marketing and offers</Text>
                <Toggle on={prefs[channel].marketing} onChange={(v) => set(channel, 'marketing', v)} />
              </View>
            </View>
          ))}
        </View>
      </View>
    </Screen>
  );
}

// ─── A-03 App Settings ───────────────────────────────────────
export function AppSettingsScreen() {
  const { back } = useNav();
  const [prefs, setPrefs] = useState<AppPreferences>(defaultAppPreferences);
  const [saved, setSaved] = useState(false);
  const dark = prefs.darkMode;
  useEffect(() => {
    AsyncStorage.getItem(APP_SETTINGS_KEY)
      .then((value) => {
        if (value) setPrefs({ ...defaultAppPreferences, ...JSON.parse(value) });
      })
      .catch(() => undefined);
  }, []);
  const update = (next: AppPreferences) => {
    setPrefs(next);
    setSaved(false);
    AsyncStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(next))
      .then(() => setSaved(true))
      .catch(() => setSaved(false));
  };
  return (
    <Screen dark={dark}>
      <TopBar onBack={back} title="App Settings" dark={dark} />
      <View className="px-4 gap-5">
        {saved && <View className="p-3 rounded-card bg-emerald-50 border border-emerald-200"><Text className="text-[12px] text-emerald-700">App preferences saved on this device.</Text></View>}
        <View>
          <Text className={`text-[12px] font-semibold uppercase tracking-wider mb-2 ${dark ? 'text-white/50' : 'text-ink-500'}`}>Language</Text>
          <View className="flex-row gap-2">
            {(['English', 'Tamil'] as const).map((l) => (
              <Pressable key={l} onPress={() => update({ ...prefs, language: l })} className={`flex-1 h-12 rounded-card border items-center justify-center ${prefs.language === l ? 'border-brand-600 bg-brand-50' : 'border-ink-200'}`}>
                <Text className={`text-[14px] font-medium ${prefs.language === l ? 'text-brand-700' : dark ? 'text-white/70' : 'text-ink-700'}`}>{l}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View>
          <Text className={`text-[12px] font-semibold uppercase tracking-wider mb-2 ${dark ? 'text-white/50' : 'text-ink-500'}`}>Appearance</Text>
          <View className={`flex-row items-center gap-3 p-4 rounded-card border ${dark ? 'border-white/15' : 'border-ink-200'}`}>
            <Icon name={dark ? 'moon' : 'sun'} size={18} color={dark ? '#fff' : '#64748B'} />
            <View className="flex-1"><Text className={`text-[14px] font-semibold ${dark ? 'text-white' : 'text-ink-900'}`}>Dark Mode</Text></View>
            <Toggle on={dark} onChange={(v) => update({ ...prefs, darkMode: v })} />
          </View>
        </View>
        <View>
          <Text className={`text-[12px] font-semibold uppercase tracking-wider mb-2 ${dark ? 'text-white/50' : 'text-ink-500'}`}>Location</Text>
          <View className="gap-2">
            {([['gps', 'Use GPS', 'Auto-detect my location'], ['manual', 'Manual entry', 'Pick city and area myself']] as const).map(([id, label, sub]) => (
              <Pressable key={id} onPress={() => update({ ...prefs, locationMode: id })} className={`flex-row items-center gap-3 p-3 rounded-card border ${prefs.locationMode === id ? 'border-brand-600 bg-brand-50' : dark ? 'border-white/15' : 'border-ink-200'}`}>
                <Icon name={id === 'gps' ? 'locate-fixed' : 'map-pin'} size={17} color={prefs.locationMode === id ? '#1A6FFF' : dark ? '#fff' : '#64748B'} />
                <View className="flex-1"><Text className={`text-[13.5px] font-semibold ${dark ? 'text-white' : 'text-ink-900'}`}>{label}</Text><Text className={`text-[11px] ${dark ? 'text-white/50' : 'text-ink-500'}`}>{sub}</Text></View>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Screen>
  );
}

// ─── A-04 Account Settings ───────────────────────────────────
export function AccountSettingsScreen() {
  const { go, back } = useNav();
  const { currentUser, signOut } = useAppState();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logout = async () => {
    setSigningOut(true);
    setError(null);
    try {
      await signOut();
      go('splash');
    } catch (err) {
      setError(apiMessage(err, 'Could not sign out. Please try again.'));
    } finally {
      setSigningOut(false);
    }
  };
  return (
    <Screen>
      <TopBar onBack={back} title="Account Settings" />
      <View className="px-4 gap-4">
        <View className="rounded-card border border-ink-200 p-4">
          <Text className="text-[14px] font-bold text-ink-900">Signed in account</Text>
          <Text className="text-[12px] text-ink-600 mt-2">{profileName(currentUser)}</Text>
          <Text className="text-[12px] text-ink-500">{profilePhone(currentUser)}</Text>
          <Text className="text-[12px] text-ink-500">{profileEmail(currentUser)}</Text>
          <Btn className="w-full mt-4" variant="outline" onPress={() => go('profileEdit')}>Edit Profile</Btn>
          <Btn className="w-full mt-2" variant="outline" onPress={() => go('changePhone')}>Change Phone Number</Btn>
        </View>
        <View className="rounded-card border border-ink-200 p-4">
          <Text className="text-[14px] font-bold text-ink-900">Session</Text>
          <Text className="text-[12px] text-ink-500 mt-1">Logout revokes your refresh token on the backend and clears the local session.</Text>
          {error && <View className="mt-3"><InlineError message={error} /></View>}
          <Btn className="w-full mt-4" variant="dark" disabled={signingOut} onPress={logout}>{signingOut ? 'Signing out...' : 'Logout'}</Btn>
        </View>
        <View className="pt-3 border-t border-ink-100">
          <Pressable onPress={() => go('accountDeletion')} className="w-full flex-row items-center gap-2 justify-center py-2">
            <Icon name="trash-2" size={15} color="#E11D48" /><Text className="text-[13px] text-rose-600 font-medium">Delete Account</Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

// ─── A-04a Account Deletion ───────────────────────────────────
export function AccountDeletionScreen() {
  const { back } = useNav();
  const { authToken } = useAppState();
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState<AccountDeletionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const enabled = typed === 'DELETE';
  const activeRequest = status?.status === 'requested';
  const scheduledAt = status?.scheduledDeletionAt ? new Date(status.scheduledDeletionAt).toLocaleDateString('en-IN') : null;
  const loadStatus = useCallback(async () => {
    if (!authToken) return;
    setLoading(true);
    setError('');
    try {
      setStatus(await getAccountDeletionStatus(authToken));
    } catch (err) {
      setError(apiMessage(err, 'Could not load account deletion status.'));
    } finally {
      setLoading(false);
    }
  }, [authToken]);
  useEffect(() => {
    loadStatus();
  }, [loadStatus]);
  const submit = async () => {
    if (!authToken || !enabled || saving) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const next = await requestAccountDeletion(authToken, { confirmation: 'DELETE', reason: reason.trim() || null });
      setStatus(next);
      setMessage('Account deletion request submitted. Complete support verification before the grace period ends.');
      setTyped('');
    } catch (err) {
      setError(apiMessage(err, 'Could not request account deletion.'));
    } finally {
      setSaving(false);
    }
  };
  const cancel = async () => {
    if (!authToken || saving) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const next = await cancelAccountDeletion(authToken);
      setStatus(next);
      setMessage('Account deletion request cancelled.');
    } catch (err) {
      setError(apiMessage(err, 'Could not cancel account deletion request.'));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Screen>
      <TopBar onBack={back} title="Delete Account" />
      <View className="px-4">
        <View className="rounded-card border border-rose-200 bg-rose-50/50 p-4 mb-4">
          <View className="flex-row items-center gap-2 mb-2"><Icon name="triangle-alert" size={18} color="#E11D48" /><Text className="text-[14px] font-bold text-rose-800">This cannot be undone</Text></View>
          <Text className="text-[12px] text-rose-700 mb-2">Requesting deletion starts backend tracking, support verification, and a grace period before final anonymization.</Text>
          {['Profile and contact details', 'Saved searches and favourites', 'Enquiry and listing history', 'Uploaded documents'].map((t) => (
            <View key={t} className="flex-row items-center gap-2 mb-1"><Icon name="x" size={12} color="#E11D48" /><Text className="text-[12.5px] text-rose-800">{t}</Text></View>
          ))}
        </View>
        {loading && <LoadingBlock label="Loading deletion status..." />}
        {error ? <View className="mb-3"><InlineError message={error} onRetry={loadStatus} /></View> : null}
        {message ? <View className="mb-3 p-3 rounded-card bg-emerald-50 border border-emerald-200"><Text className="text-[12px] text-emerald-700">{message}</Text></View> : null}
        {status && status.status !== 'none' && (
          <View className="rounded-card border border-amber-200 bg-amber-50 p-3 mb-3">
            <Text className="text-[13px] font-bold text-amber-900 capitalize">Status: {status.status.replace(/_/g, ' ')}</Text>
            <Text className="text-[11.5px] text-amber-800 mt-1">Verification: {status.verificationStatus || 'not_started'}</Text>
            {scheduledAt && <Text className="text-[11.5px] text-amber-800 mt-1">Grace period ends: {scheduledAt}</Text>}
            {activeRequest && (
              <Pressable onPress={cancel} disabled={saving} className="mt-3 h-10 rounded-xl bg-white border border-amber-300 items-center justify-center">
                <Text className="text-[13px] font-semibold text-amber-800">{saving ? 'Cancelling...' : 'Cancel Deletion Request'}</Text>
              </Pressable>
            )}
          </View>
        )}
        <View className="flex-row items-start gap-2 p-3 rounded-card bg-ink-50 mb-2">
          <Icon name="scale" size={14} color="#64748B" />
          <Text className="text-[11.5px] text-ink-600 flex-1">Some records are retained as required by law. Deletion follows a <Text className="font-bold">30-day grace period</Text> and complies with the <Text className="font-bold">DPDP Act 2023</Text>.</Text>
        </View>
        <Field label="Reason (optional)"><Input value={reason} onChangeText={setReason} placeholder="Tell us why you are leaving" multiline /></Field>
        <Field label="Type DELETE to confirm"><Input value={typed} onChangeText={setTyped} placeholder="DELETE" /></Field>
        <Pressable onPress={submit} disabled={!enabled || !authToken || saving || activeRequest} className={`w-full h-12 mt-5 rounded-xl items-center justify-center ${enabled && authToken && !saving && !activeRequest ? 'bg-rose-600' : 'bg-rose-200'}`}>
          <Text className="text-white font-semibold text-[15px]">{saving ? 'Submitting...' : activeRequest ? 'Deletion Already Requested' : 'Request Account Deletion'}</Text>
        </Pressable>
        <Pressable onPress={back} className="w-full h-12 mt-2 rounded-xl items-center justify-center bg-ink-100"><Text className="text-ink-700 font-semibold text-[15px]">Keep My Account</Text></Pressable>
      </View>
    </Screen>
  );
}

// ─── A-05 Help & FAQs ────────────────────────────────────────
export function HelpFaqsScreen() {
  const { go, back } = useNav();
  const [q, setQ] = useState('');
  const { items: faqs, loading, error, reload } = useContentSection('faq', fallbackFaqContent);
  const topics = useFaqTopics(faqs);
  const results = q ? faqs.filter((f) => (f.title + ' ' + (f.body || '')).toLowerCase().includes(q.toLowerCase())) : [];
  return (
    <Screen>
      <TopBar onBack={back} title="Help & FAQs" />
      <View className="px-4">
        <Input icon="search" placeholder="Search help articles" value={q} onChangeText={setQ} />
        {loading && <Text className="mt-3 text-[12px] text-ink-500">Loading help content...</Text>}
        {!!error && (
          <Pressable onPress={reload} className="mt-3 p-3 rounded-card border border-amber-200 bg-amber-50">
            <Text className="text-[12px] text-amber-800">Using saved help copy. Tap to retry CMS content.</Text>
          </Pressable>
        )}
        {q ? (
          <View className="mt-4 gap-2">
            <Text className="text-[11px] text-ink-500">{results.length} results</Text>
            {results.length === 0 && <Text className="text-[12px] text-ink-500">No FAQ articles match your search. Contact support for help.</Text>}
            {results.map((f) => (
              <View key={f.slug} className="p-3 rounded-card border border-ink-200">
                <Text className="text-[13px] font-semibold">{f.title}</Text>
                <Text className="text-[12px] text-ink-500 mt-1 leading-relaxed">{f.body}</Text>
              </View>
            ))}
          </View>
        ) : (
          <>
            <View className="flex-row flex-wrap gap-2.5 mt-4">
              {topics.map((t) => (
                <Pressable key={t.id} onPress={() => go('faqTopic', { topic: t })} style={{ width: '47%' }} className="p-3.5 rounded-card border border-ink-200 flex-row items-center gap-3">
                  <View className="w-10 h-10 rounded-xl bg-brand-50 items-center justify-center"><Icon name={t.icon} size={18} color="#1A6FFF" /></View>
                  <View className="flex-1"><Text className="text-[13px] font-semibold" numberOfLines={1}>{t.label}</Text><Text className="text-[10.5px] text-ink-500">{t.count} articles</Text></View>
                </Pressable>
              ))}
            </View>
            <Pressable onPress={() => go('customerSupport')} className="w-full mt-4 flex-row items-center gap-3 p-4 rounded-card border border-brand-200 bg-brand-50">
              <View className="w-10 h-10 rounded-full bg-brand-600 items-center justify-center"><Icon name="headphones" size={18} color="white" /></View>
              <View className="flex-1"><Text className="text-[14px] font-semibold text-brand-700">Still need help?</Text><Text className="text-[11.5px] text-brand-600">Contact customer support</Text></View>
              <Icon name="chevron-right" size={16} color="#1A6FFF" />
            </Pressable>
          </>
        )}
      </View>
    </Screen>
  );
}

// ─── A-06 FAQ Topic Detail ────────────────────────────────────
export function FaqTopicScreen() {
  const { back, ctx } = useNav();
  const topic = ctx?.topic || { id: 'buying', label: 'Buying' };
  const { items: faqs, loading, error, reload } = useContentSection('faq', fallbackFaqContent);
  const topicFaqs = faqs.filter((f) => !topic.id || f.category === topic.id);
  const [open, setOpen] = useState<Set<number>>(new Set([0]));
  const toggle = (i: number) => setOpen((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
  return (
    <Screen>
      <TopBar onBack={back} title={topic.label} sub="Frequently asked questions" />
      <View className="px-4">
        {loading && <Text className="mb-3 text-[12px] text-ink-500">Loading help content...</Text>}
        {!!error && (
          <Pressable onPress={reload} className="mb-3 p-3 rounded-card border border-amber-200 bg-amber-50">
            <Text className="text-[12px] text-amber-800">Using saved help copy. Tap to retry CMS content.</Text>
          </Pressable>
        )}
        <View className="border border-ink-200 rounded-card overflow-hidden">
          {topicFaqs.map((f, i) => (
            <View key={i} className={i ? 'border-t border-ink-200' : ''}>
              <Pressable onPress={() => toggle(i)} className="flex-row items-center justify-between gap-2 p-3.5">
                <Text className="text-[13px] font-medium flex-1">{f.title}</Text>
                <Icon name={open.has(i) ? 'chevron-up' : 'chevron-down'} size={16} color="#64748B" />
              </Pressable>
              {open.has(i) && <Text className="px-3.5 pb-3.5 text-[12.5px] text-ink-500 leading-relaxed">{f.body}</Text>}
            </View>
          ))}
          {topicFaqs.length === 0 && <Text className="p-3.5 text-[12px] text-ink-500">No articles are published for this topic yet.</Text>}
        </View>
      </View>
    </Screen>
  );
}

// ─── A-07 Customer Support ───────────────────────────────────
export function CustomerSupportScreen() {
  const { go, back } = useNav();
  const { authToken, currentUser } = useAppState();
  const [form, setForm] = useState({ name: profileName(currentUser), phone: profilePhone(currentUser).replace(/\D/g, '').slice(-10), slot: '' });
  const [ticket, setTicket] = useState({ category: 'general' as const, subject: '', message: '' });
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [submittingCallback, setSubmittingCallback] = useState(false);
  const [submittingTicket, setSubmittingTicket] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadTickets = useCallback(async () => {
    if (!authToken) return;
    setLoading(true);
    setError(null);
    try {
      setTickets(await listSupportTickets(authToken, { limit: 5, sort: 'newest' }));
    } catch (err) {
      setError(apiMessage(err, 'Could not load support tickets.'));
    } finally {
      setLoading(false);
    }
  }, [authToken]);
  useEffect(() => {
    loadTickets();
  }, [loadTickets]);
  const submitCallback = async () => {
    if (!authToken) {
      setError('Please sign in to request a callback.');
      return;
    }
    if (!form.slot) return;
    setSubmittingCallback(true);
    setError(null);
    setSent(null);
    try {
      await createCallbackRequest(authToken, {
        source: 'help_support',
        sourceScreen: 'customerSupport',
        category: 'general',
        reason: `Callback requested by ${form.name || 'customer'} at ${form.phone || profilePhone(currentUser)}.`,
        bestTimePreference: form.slot.toLowerCase() as 'morning' | 'afternoon' | 'evening',
      });
      setSent("We'll call you in your chosen slot.");
    } catch (err) {
      setError(apiMessage(err, 'Could not request callback.'));
    } finally {
      setSubmittingCallback(false);
    }
  };
  const submitTicket = async () => {
    if (!authToken) {
      setError('Please sign in to submit a support ticket.');
      return;
    }
    if (!ticket.subject.trim() || !ticket.message.trim()) return;
    setSubmittingTicket(true);
    setError(null);
    setSent(null);
    try {
      await createSupportTicket(authToken, {
        category: ticket.category,
        subject: ticket.subject.trim(),
        message: ticket.message.trim(),
        priority: 'medium',
      });
      setTicket({ category: 'general', subject: '', message: '' });
      setSent('Support ticket submitted.');
      await loadTickets();
    } catch (err) {
      setError(apiMessage(err, 'Could not submit support ticket.'));
    } finally {
      setSubmittingTicket(false);
    }
  };
  return (
    <Screen>
      <TopBar onBack={back} title="Customer Support" />
      <View className="px-4 gap-3">
        {sent && <View className="flex-row items-center gap-2 p-3 rounded-card bg-emerald-50 border border-emerald-200"><Icon name="check-circle" size={16} color="#10B981" /><Text className="text-[13px] text-emerald-700">{sent}</Text></View>}
        {error && <InlineError message={error} onRetry={loadTickets} />}
        <View className="rounded-card border border-ink-200 p-4 mb-3">
          <Text className="text-[14px] font-semibold mb-3">Request a Callback</Text>
          <View className="gap-3">
            <Field label="Name"><Input icon="user" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} /></Field>
            <Field label="Phone"><Input icon="phone" prefix="+91" keyboardType="phone-pad" value={form.phone} onChangeText={(v) => setForm({ ...form, phone: v })} /></Field>
            <Field label="Preferred time slot">
              <View className="flex-row gap-2">
                {['Morning', 'Afternoon', 'Evening'].map((s) => (
                  <Pressable key={s} onPress={() => setForm({ ...form, slot: s })} className={`flex-1 h-10 rounded-card items-center justify-center ${form.slot === s ? 'bg-brand-600' : 'bg-ink-100'}`}>
                    <Text className={`text-[12px] font-medium ${form.slot === s ? 'text-white' : 'text-ink-700'}`}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            </Field>
            <Btn className="w-full" disabled={!form.slot || submittingCallback} onPress={submitCallback}>{submittingCallback ? 'Requesting...' : 'Request Callback'}</Btn>
          </View>
        </View>
        <View className="rounded-card border border-ink-200 p-4">
          <Text className="text-[14px] font-semibold mb-3">Raise a Support Ticket</Text>
          <View className="gap-3">
            <Field label="Subject" required><Input icon="message-circle" value={ticket.subject} onChangeText={(v) => setTicket({ ...ticket, subject: v })} placeholder="What do you need help with?" /></Field>
            <Field label="Message" required><Input multiline value={ticket.message} onChangeText={(v) => setTicket({ ...ticket, message: v })} placeholder="Describe the issue or question" /></Field>
            <Btn className="w-full" disabled={!ticket.subject.trim() || !ticket.message.trim() || submittingTicket} onPress={submitTicket}>{submittingTicket ? 'Submitting...' : 'Submit Ticket'}</Btn>
          </View>
        </View>
        <View className="rounded-card border border-ink-200 p-4">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-[14px] font-semibold">Recent Tickets</Text>
            <Pressable onPress={loadTickets}><Text className="text-[12px] text-brand-600 font-semibold">Refresh</Text></Pressable>
          </View>
          {loading ? (
            <LoadingBlock label="Loading tickets..." />
          ) : tickets.length === 0 ? (
            <Text className="text-[12px] text-ink-500">No support tickets yet.</Text>
          ) : (
            <View className="gap-2">
              {tickets.map((item) => (
                <View key={item._id ?? item.referenceId ?? item.subject} className="p-3 rounded-card bg-ink-50">
                  <View className="flex-row items-center gap-2">
                    <Text className="flex-1 text-[12.5px] font-semibold text-ink-900" numberOfLines={1}>{item.subject || 'Support ticket'}</Text>
                    <TicketStatus status={item.status} />
                  </View>
                  <Text className="text-[11px] text-ink-500 mt-1">{item.referenceId || 'Ticket'}{item.createdAt ? ` - ${new Date(item.createdAt).toLocaleDateString('en-IN')}` : ''}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
        <Pressable onPress={() => go('callUs')} className="w-full flex-row items-center gap-3 p-4 rounded-card border border-ink-200">
          <View className="w-11 h-11 rounded-full bg-ink-100 items-center justify-center"><Icon name="phone-call" size={20} color="#334155" /></View>
          <View className="flex-1"><Text className="text-[14px] font-semibold">Call Us</Text><Text className="text-[11.5px] text-ink-500">Speak to an advisor</Text></View>
          <Icon name="chevron-right" size={16} color="#94A3B8" />
        </Pressable>
      </View>
    </Screen>
  );
}

// ─── A-07a Call Us Screen ────────────────────────────────────
export function CallUsScreen() {
  const { go, back } = useNav();
  const { authToken } = useAppState();
  const now = new Date();
  const open = now.getDay() >= 1 && now.getDay() <= 6 && now.getHours() >= 9 && now.getHours() < 19;
  const [requesting, setRequesting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const requestCallback = async () => {
    if (!authToken) {
      setMessage('Please sign in to request a callback.');
      return;
    }
    setRequesting(true);
    setMessage(null);
    try {
      await createCallbackRequest(authToken, {
        source: 'help_support',
        sourceScreen: 'callUs',
        category: 'general',
        reason: 'Callback requested from Call Us screen.',
        bestTimePreference: 'morning',
      });
      setMessage('Callback request sent.');
    } catch (err) {
      setMessage(apiMessage(err, 'Could not request callback.'));
    } finally {
      setRequesting(false);
    }
  };
  return (
    <Screen>
      <TopBar onBack={back} title="Call Us" />
      <View className="px-4">
        <View className="rounded-card border border-ink-200 p-5 items-center mb-4">
          <View className="w-16 h-16 rounded-full bg-brand-50 items-center justify-center mb-3"><Icon name="phone-call" size={28} color="#1A6FFF" /></View>
          <Pressable onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE}`)}><Text className="text-[22px] font-bold text-brand-600">+91 44 4000 8000</Text></Pressable>
          <Text className="text-[12px] text-ink-500 mt-1">Builtglory Customer Care</Text>
          <Pressable onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE}`)} className="flex-row items-center gap-2 h-11 px-6 mt-4 rounded-xl bg-brand-600">
            <Icon name="phone" size={16} color="white" /><Text className="text-white font-semibold text-[14px]">Tap to Call</Text>
          </Pressable>
        </View>
        <View className="rounded-card bg-ink-50 p-3.5 items-center">
          <Text className="text-[12px] text-ink-500">Office hours</Text>
          <Text className="text-[13px] font-semibold text-ink-900 mt-0.5">Mon–Sat · 9:00 AM – 7:00 PM IST</Text>
        </View>
        {!open && (
          <View className="mt-4 rounded-card border border-amber-200 bg-amber-50 p-4 items-center">
            <Icon name="moon" size={22} color="#D97706" />
            <Text className="text-[13px] font-semibold text-amber-800 mt-2">We are currently closed.</Text>
            <Text className="text-[11.5px] text-amber-700 mt-0.5 mb-3 text-center">Leave your number and we'll call you back.</Text>
            <Btn variant="outline" size="sm" disabled={requesting} onPress={requestCallback}>{requesting ? 'Requesting...' : 'Request Callback'}</Btn>
          </View>
        )}
        {open && <Btn className="w-full mt-4" variant="outline" onPress={() => go('customerSupport')}>Request Callback Instead</Btn>}
        {message && <View className="mt-4 p-3 rounded-card bg-ink-50"><Text className="text-[12px] text-ink-700">{message}</Text></View>}
      </View>
    </Screen>
  );
}
