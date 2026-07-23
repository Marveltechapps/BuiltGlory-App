import React from 'react';
import { View, Text, Pressable } from 'react-native';
import Icon from './Icon';
import { Spinner } from './shared';

export function LoadingBlock({ label }: { label: string }) {
  return (
    <View className="py-8 items-center gap-2">
      <Spinner color="#1A6FFF" size={20} />
      <Text className="text-[12px] text-ink-500">{label}</Text>
    </View>
  );
}

export function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View className="mx-4 mb-3 p-3 bg-rose-50 border border-rose-200 rounded-card flex-row items-center gap-2">
      <Icon name="alert-circle" size={14} color="#E11D48" />
      <Text className="text-[12px] text-rose-700 flex-1">{message}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} className="px-2 py-1 rounded-md bg-white border border-rose-200">
          <Text className="text-[11px] font-semibold text-rose-700">Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function OfflineCard({ onRetry }: { onRetry?: () => void }) {
  return (
    <View className="mx-4 mb-3 p-3 bg-ink-50 border border-ink-200 rounded-card flex-row items-center gap-2">
      <Icon name="wifi-off" size={14} color="#64748B" />
      <Text className="text-[12px] text-ink-700 flex-1">You appear to be offline. Pull to refresh when your connection returns.</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} className="px-2 py-1 rounded-md bg-white border border-ink-200">
          <Text className="text-[11px] font-semibold text-ink-700">Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyStateCard({
  title,
  body,
  icon = 'inbox',
}: {
  title: string;
  body: string;
  icon?: string;
}) {
  return (
    <View className="rounded-card border border-ink-200 bg-white p-6 items-center">
      <Icon name={icon} size={28} color="#94A3B8" />
      <Text className="text-[14px] font-semibold mt-3 text-center">{title}</Text>
      <Text className="text-[12px] text-ink-500 mt-1 text-center leading-relaxed">{body}</Text>
    </View>
  );
}
