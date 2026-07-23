import React from 'react';
import { View } from 'react-native';
import { FadeInView } from '../components/shared';

function SkeletonBar({ width, height = 12 }: { width: number | `${number}%`; height?: number }) {
  return <View className="rounded-full bg-ink-100" style={{ width, height }} />;
}

function NotificationSkeletonCard({ delay = 0 }: { delay?: number }) {
  return (
    <FadeInView delay={delay} className="flex-row gap-3">
      <View className="w-5 items-center pt-4">
        <View className="w-2.5 h-2.5 rounded-full bg-ink-200" />
        <View className="flex-1 w-px bg-ink-100 mt-1" />
      </View>
      <View className="flex-1 mb-3 p-3.5 rounded-2xl border border-ink-100 bg-white">
        <View className="flex-row gap-3">
          <View className="w-14 h-14 rounded-2xl overflow-hidden bg-ink-100" />
          <View className="flex-1 gap-2 pt-1">
            <SkeletonBar width="72%" height={14} />
            <SkeletonBar width="100%" height={10} />
            <SkeletonBar width="88%" height={10} />
            <View className="flex-row justify-between items-center mt-1">
              <SkeletonBar width={64} height={18} />
              <SkeletonBar width={40} height={10} />
            </View>
          </View>
        </View>
      </View>
    </FadeInView>
  );
}

export function NotificationSkeletonList({ count = 5 }: { count?: number }) {
  return (
    <View className="px-4 pt-2">
      {Array.from({ length: count }, (_, index) => (
        <NotificationSkeletonCard key={index} delay={index * 60} />
      ))}
    </View>
  );
}
