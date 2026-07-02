import React from 'react';
import { View, Text, Pressable, SectionList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import { SCREEN_GROUPS } from '../navigation/registry';
import { useNav } from '../navigation/useNav';

export function DevIndexScreen() {
  const { jump, back } = useNav();
  const sections = SCREEN_GROUPS.map((g) => ({ title: g.group, data: g.items }));
  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="px-4 pt-2 pb-3 flex-row items-center gap-3">
        <Pressable onPress={back} className="-ml-1 p-2 rounded-full"><Icon name="arrow-left" size={22} color="#0F172A" /></Pressable>
        <View>
          <Text className="text-[18px] font-bold text-ink-900">Screen Index</Text>
          <Text className="text-[11px] text-ink-500">All screens for QA / demo</Text>
        </View>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.key}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderSectionHeader={({ section }) => (
          <View className="px-4 py-1.5 bg-ink-50">
            <Text className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">{section.title}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <Pressable onPress={() => jump(item.key)} className="flex-row items-center justify-between px-4 py-3 border-b border-ink-100">
            <Text className="text-[13px] text-ink-800">{item.label}</Text>
            <Icon name="chevron-right" size={14} color="#94A3B8" />
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
