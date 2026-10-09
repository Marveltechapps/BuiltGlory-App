import React, { useState } from 'react';
import { Linking, Platform, View, Text, Pressable } from 'react-native';
import Constants from 'expo-constants';
import * as StoreReview from 'expo-store-review';
import Icon from '../components/Icon';
import { BrandLogo } from '../components/BrandLogo';
import { Btn, FadeInView, Field, Input, Screen, TopBar, PageBody } from '../components/shared';
import { useNav } from '../navigation/useNav';
import { useAppState } from '../state/AppState';
import { createAppFeedback, getPublicAppConfig } from '../api/customer';
import { contentBody, contentMetaArray, contentMetaString, fallbackAboutContent, useContentItem } from '../content';
import {
  COMPANY_SUPPORT_EMAIL,
  COMPANY_SUPPORT_PHONE_DISPLAY,
  openCompanyCall,
  openCompanySupportEmail,
  openCompanyWhatsApp,
} from '../config/companyContact';

const STORE_FALLBACK_URL = Platform.OS === 'android' ? 'https://play.google.com/store/apps' : 'https://apps.apple.com';
const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];

function androidStoreUrl(packageName: string) {
  return `https://play.google.com/store/apps/details?id=${packageName}`;
}

async function resolveStoreUrl() {
  try {
    const config = await getPublicAppConfig();
    const configured = Platform.OS === 'android' ? config.storeUrls.android : config.storeUrls.ios;
    if (configured && configured !== STORE_FALLBACK_URL) return configured;
  } catch {
    // fall through to platform defaults
  }
  if (Platform.OS === 'android') {
    const packageName = Constants.expoConfig?.android?.package || 'com.builtglory.builtglory';
    return androidStoreUrl(packageName);
  }
  return STORE_FALLBACK_URL;
}

async function openAppStoreRating() {
  if (await StoreReview.isAvailableAsync()) {
    await StoreReview.requestReview();
  }
  const storeUrl = await resolveStoreUrl();
  const canOpen = await Linking.canOpenURL(storeUrl);
  if (canOpen) {
    await Linking.openURL(storeUrl);
    return;
  }
  await Linking.openURL(STORE_FALLBACK_URL);
}

function StarRating({
  value,
  onChange,
}: {
  value: number;
  onChange: (rating: number) => void;
}) {
  return (
    <View className="items-center">
      <View className="flex-row gap-2">
        {[1, 2, 3, 4, 5].map((star) => {
          const filled = star <= value;
          return (
            <Pressable
              key={star}
              onPress={() => onChange(star)}
              accessibilityRole="button"
              accessibilityLabel={`Rate ${star} star${star > 1 ? 's' : ''}`}
              className="p-1"
            >
              <Icon
                name="star"
                size={36}
                color={filled ? '#F59E0B' : '#CBD5E1'}
                fill={filled ? '#F59E0B' : 'none'}
                strokeWidth={filled ? 1.5 : 2}
              />
            </Pressable>
          );
        })}
      </View>
      {value > 0 && (
        <Text className="mt-2 text-[13px] font-semibold text-amber-600">{RATING_LABELS[value]}</Text>
      )}
    </View>
  );
}

// ─── Rate the App ─────────────────────────────────────────────
export function RateAppScreen() {
  const { back } = useNav();
  const { authToken } = useAppState();
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const submitRating = async () => {
    if (rating < 1) {
      setError('Please select a star rating before submitting.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      if (authToken) {
        const message = feedback.trim()
          ? `App rating: ${rating}/5 — ${feedback.trim()}`
          : `App rating: ${rating}/5`;
        await createAppFeedback(authToken, {
          message,
          source: 'customer_app',
          sourceScreen: 'rateApp',
          metadata: { rating, feedback: feedback.trim() || undefined },
        });
      }
      await openAppStoreRating();
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit your rating. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <Screen>
        <TopBar onBack={back} title="Rate the App" />
        <View className="flex-1 px-6 justify-center items-center">
          <FadeInView className="items-center w-full">
            <View className="w-20 h-20 rounded-full bg-emerald-100 items-center justify-center mb-5">
              <Icon name="heart" size={40} color="#10B981" fill="#10B981" strokeWidth={1.5} />
            </View>
            <Text className="text-[20px] font-bold text-ink-900 text-center">Thank you!</Text>
            <Text className="text-[14px] text-ink-600 text-center mt-2 leading-relaxed max-w-[280px]">
              Your feedback helps us improve BuiltGlory for everyone. We truly appreciate you taking the time.
            </Text>
            <View className="w-full mt-8">
              <Btn onPress={back}>Done</Btn>
            </View>
          </FadeInView>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <TopBar onBack={back} title="Rate the App" sub="Share your experience" />
      <PageBody className="pb-8 gap-6">
        <FadeInView className="items-center pt-2">
          <BrandLogo size={80} />
          <Text className="text-[20px] font-bold text-ink-900 mt-4">Enjoying BuiltGlory?</Text>
          <Text className="text-[13px] text-ink-600 text-center mt-2 leading-relaxed max-w-[300px]">
            Your rating on the {Platform.OS === 'ios' ? 'App Store' : 'Play Store'} helps others discover trusted real estate listings.
          </Text>
        </FadeInView>

        <FadeInView delay={80} className="p-5 rounded-card bg-ink-50 border border-ink-100">
          <Text className="text-[13px] font-semibold text-ink-700 text-center mb-4">How would you rate your experience?</Text>
          <StarRating value={rating} onChange={(v) => { setRating(v); setError(''); }} />
        </FadeInView>

        <FadeInView delay={140}>
          <Field label="Additional feedback" hint="Optional — tell us what you love or what we can improve">
            <Input
              multiline
              placeholder="Share your thoughts…"
              value={feedback}
              onChangeText={setFeedback}
            />
          </Field>
        </FadeInView>

        {!!error && (
          <View className="p-3 rounded-card border border-rose-200 bg-rose-50">
            <Text className="text-[12px] text-rose-700">{error}</Text>
          </View>
        )}

        <FadeInView delay={200} className="gap-3 mt-2">
          <Btn onPress={submitRating} disabled={rating < 1 || submitting} icon="star">
            {submitting ? 'Submitting…' : 'Submit Rating'}
          </Btn>
          <Btn variant="ghost" onPress={back} disabled={submitting}>
            Maybe Later
          </Btn>
        </FadeInView>
      </PageBody>
    </Screen>
  );
}

// ─── A-08 About Us ────────────────────────────────────────────
export function AboutUsScreen() {
  const { go, back } = useNav();
  const { item: about, loading, error, reload } = useContentItem('about-builtglory', fallbackAboutContent);
  const steps = contentMetaArray<{ title: string; desc: string }>(
    about,
    'steps',
    contentMetaArray<{ title: string; desc: string }>(fallbackAboutContent, 'steps')
  );
  return (
    <Screen>
      <TopBar onBack={back} title="About Us" sub="Learn about Builtglory" />
      <PageBody className="pb-6">
        {loading && <Text className="mb-3 text-[12px] text-ink-500">Loading company content...</Text>}
        {!!error && (
          <Pressable onPress={reload} className="mb-3 p-3 rounded-card border border-amber-200 bg-amber-50">
            <Text className="text-[12px] text-amber-800">Using saved company copy. Tap to retry CMS content.</Text>
          </Pressable>
        )}
        <View className="flex-row items-center gap-4 p-4 rounded-card bg-brand-50 border border-brand-200 mb-6">
          <BrandLogo size={64} />
          <View>
            <Text className="text-[16px] font-bold text-ink-900">BUILTGLORY</Text>
            <Text className="text-[12px] text-ink-600">Version {contentMetaString(about, 'version', '1.0.0')}</Text>
            <Text className="text-[11px] text-ink-500">© {contentMetaString(about, 'copyright', '2026 Builtglory')} · All rights reserved</Text>
          </View>
        </View>
        <View className="mb-6">
          <Text className="text-[16px] font-bold text-ink-900 mb-2">Our Mission</Text>
          <Text className="text-[13px] text-ink-600 leading-relaxed">
            {contentBody(about)}
          </Text>
        </View>
        <View className="mb-6">
          <Text className="text-[16px] font-bold text-ink-900 mb-3">How Builtglory Works</Text>
          <View className="gap-3">
            {steps.map((s, index) => (
              <View key={s.title} className="flex-row gap-3">
                <View className="w-8 h-8 rounded-full bg-brand-600 items-center justify-center"><Text className="text-white font-bold text-[13px]">{index + 1}</Text></View>
                <View className="flex-1"><Text className="text-[13px] font-semibold text-ink-900">{s.title}</Text><Text className="text-[12px] text-ink-600 mt-0.5">{s.desc}</Text></View>
              </View>
            ))}
          </View>
        </View>
        <View className="rounded-card border border-ink-200">
          <View className="p-4">
            <Text className="text-[13px] font-bold text-ink-900 mb-2">Contact Information</Text>
            <View className="gap-2">
              <View className="flex-row items-start gap-2"><Icon name="map-pin" size={14} color="#1A6FFF" /><Text className="text-[12px] text-ink-700 flex-1">{contentMetaString(about, 'address', '123 Tech Park, OMR, Adyar, Chennai 600020, India')}</Text></View>
              <Pressable onPress={() => void openCompanySupportEmail()} className="flex-row items-start gap-2"><Icon name="mail" size={14} color="#1A6FFF" /><Text className="text-[12px] text-brand-600 font-medium">{contentMetaString(about, 'supportEmail', COMPANY_SUPPORT_EMAIL)}</Text></Pressable>
              <Pressable onPress={() => void openCompanyCall()} className="flex-row items-start gap-2"><Icon name="phone" size={14} color="#1A6FFF" /><Text className="text-[12px] text-brand-600 font-medium">{contentMetaString(about, 'supportPhone', COMPANY_SUPPORT_PHONE_DISPLAY)}</Text></Pressable>
              <Pressable onPress={() => void openCompanyWhatsApp()} className="flex-row items-start gap-2"><Icon name="message-circle" size={14} color="#059669" /><Text className="text-[12px] text-emerald-700 font-medium">WhatsApp: {COMPANY_SUPPORT_PHONE_DISPLAY}</Text></Pressable>
            </View>
          </View>
          <Pressable onPress={() => go('customerSupport')} className="flex-row items-center justify-between p-4 border-t border-ink-100">
            <Text className="text-[13px] font-semibold text-ink-900">Contact Support</Text>
            <Icon name="chevron-right" size={16} color="#94A3B8" />
          </Pressable>
        </View>
        <View className="mt-6 gap-2">
          <Pressable onPress={() => go('termsOfUse')} className="p-3 rounded-card border border-ink-200 flex-row items-center justify-between">
            <Text className="text-[13px] font-semibold text-ink-900">Terms of Use</Text>
            <Icon name="chevron-right" size={16} color="#94A3B8" />
          </Pressable>
          <Pressable onPress={() => go('privacyPolicy')} className="p-3 rounded-card border border-ink-200 flex-row items-center justify-between">
            <Text className="text-[13px] font-semibold text-ink-900">Privacy Policy</Text>
            <Icon name="chevron-right" size={16} color="#94A3B8" />
          </Pressable>
        </View>
        <View className="mt-6 p-4 rounded-card bg-ink-50 items-center">
          <Text className="text-[11px] text-ink-700 font-medium">{contentMetaString(about, 'tagline', 'Simplifying real estate, one transaction at a time')}</Text>
        </View>
      </PageBody>
    </Screen>
  );
}
