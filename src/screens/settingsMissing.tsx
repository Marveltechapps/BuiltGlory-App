import React from 'react';
import { Linking, View, Text, Pressable } from 'react-native';
import Icon from '../components/Icon';
import { Screen, TopBar } from '../components/shared';
import { useNav } from '../navigation/useNav';
import { contentBody, contentMetaArray, contentMetaString, fallbackAboutContent, useContentItem } from '../content';

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
      <View className="px-4 pb-6">
        {loading && <Text className="mb-3 text-[12px] text-ink-500">Loading company content...</Text>}
        {!!error && (
          <Pressable onPress={reload} className="mb-3 p-3 rounded-card border border-amber-200 bg-amber-50">
            <Text className="text-[12px] text-amber-800">Using saved company copy. Tap to retry CMS content.</Text>
          </Pressable>
        )}
        <View className="flex-row items-center gap-4 p-4 rounded-card bg-brand-50 border border-brand-200 mb-6">
          <View className="w-16 h-16 rounded-2xl bg-brand-600 items-center justify-center"><Text className="text-white font-black text-3xl">B</Text></View>
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
              <Pressable onPress={() => Linking.openURL(`mailto:${contentMetaString(about, 'supportEmail', 'support@builtglory.com')}`)} className="flex-row items-start gap-2"><Icon name="mail" size={14} color="#1A6FFF" /><Text className="text-[12px] text-brand-600 font-medium">{contentMetaString(about, 'supportEmail', 'support@builtglory.com')}</Text></Pressable>
              <Pressable onPress={() => Linking.openURL(`tel:${contentMetaString(about, 'supportPhone', '+91 44 4000 8000').replace(/\s/g, '')}`)} className="flex-row items-start gap-2"><Icon name="phone" size={14} color="#1A6FFF" /><Text className="text-[12px] text-brand-600 font-medium">{contentMetaString(about, 'supportPhone', '+91 44 4000 8000')}</Text></Pressable>
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
      </View>
    </Screen>
  );
}
