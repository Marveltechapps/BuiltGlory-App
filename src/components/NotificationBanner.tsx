import { View, Text, Pressable } from 'react-native';
import type { PushNotificationBanner } from '../hooks/usePushNotifications';

type NotificationBannerProps = {
  banner: PushNotificationBanner;
  onDismiss: () => void;
  onPress: () => void;
};

export function NotificationBanner({ banner, onDismiss, onPress }: NotificationBannerProps) {
  return (
    <Pressable
      onPress={onPress}
      className="absolute left-3 right-3 top-14 z-50 rounded-card border border-brand-200 bg-white p-3 shadow-lg"
      style={{ elevation: 8 }}
    >
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="text-[13px] font-semibold text-ink-900">{banner.title}</Text>
          <Text className="text-[12px] text-ink-500 mt-1">{banner.body}</Text>
        </View>
        <Pressable onPress={onDismiss} hitSlop={8}>
          <Text className="text-[12px] font-semibold text-brand-600">Dismiss</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}
