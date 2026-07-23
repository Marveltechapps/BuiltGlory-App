import React from 'react';
import { Image, View, Text } from 'react-native';
import Icon from '../components/Icon';
import { Badge, PhotoPlaceholder, PressableScale } from '../components/shared';
import type { CustomerNotification } from '../api/customer';
import {
  formatRelativeTime,
  notificationIcon,
  notificationStatusChip,
} from './notificationUtils';
import { lineHeightFor } from '../setup/androidText';

type NotificationTimelineCardProps = {
  notification: CustomerNotification;
  unread: boolean;
  isLast: boolean;
  onPress: () => void;
};

export function NotificationTimelineCard({
  notification,
  unread,
  isLast,
  onPress,
}: NotificationTimelineCardProps) {
  const chip = notificationStatusChip(notification);
  const icon = notificationIcon(notification);
  const imageUri = typeof notification.image === 'string' && notification.image.trim() ? notification.image.trim() : undefined;

  return (
    <View className="flex-row gap-3">
      <View className="w-5 items-center">
        <View className={`w-2.5 h-2.5 rounded-full mt-5 ${unread ? 'bg-brand-600' : 'bg-ink-300'}`} />
        {!isLast ? <View className="flex-1 w-px bg-ink-200 mt-1 mb-1" /> : null}
      </View>

      <PressableScale
        onPress={onPress}
        className={`flex-1 mb-3 rounded-2xl border overflow-hidden ${
          unread ? 'border-brand-200 bg-brand-50/50' : 'border-ink-200 bg-white'
        }`}
        style={{
          shadowColor: '#0F172A',
          shadowOpacity: unread ? 0.08 : 0.04,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: unread ? 3 : 1,
        }}
      >
        {unread ? <View className="absolute left-0 top-0 bottom-0 w-1 bg-brand-600 rounded-l-2xl" /> : null}
        <View className="p-3.5 flex-row gap-3">
          <View className="w-14 h-14 rounded-2xl overflow-hidden border border-ink-100 bg-ink-50">
            {imageUri ? (
              <Image source={{ uri: imageUri }} className="w-full h-full" resizeMode="cover" />
            ) : (
              <PhotoPlaceholder tag={notification.id} className="w-full h-full rounded-2xl">
                <View className="absolute inset-0 items-center justify-center bg-black/10">
                  <Icon name={icon} size={22} color="#FFFFFF" />
                </View>
              </PhotoPlaceholder>
            )}
          </View>

          <View className="flex-1 min-w-0">
            <View className="flex-row items-start justify-between gap-2">
              <Text
                className={`flex-1 text-[14px] ${unread ? 'font-bold text-ink-900' : 'font-semibold text-ink-800'}`}
                style={{ lineHeight: lineHeightFor(14) }}
                numberOfLines={2}
              >
                {notification.title}
              </Text>
              <View className="items-end gap-1">
                <Text className="text-[10.5px] text-ink-400 font-medium">{formatRelativeTime(notification.createdAt)}</Text>
                {unread ? <View className="w-2 h-2 rounded-full bg-brand-600" /> : null}
              </View>
            </View>

            <Text
              className="text-[12px] text-ink-500 mt-1"
              style={{ lineHeight: lineHeightFor(12) }}
              numberOfLines={2}
            >
              {notification.body}
            </Text>

            <View className="flex-row items-center justify-between mt-2.5">
              <Badge color={chip.color} icon={icon}>{chip.label}</Badge>
              <Text className="text-[10px] text-ink-400">Tap to open</Text>
            </View>
          </View>
        </View>
      </PressableScale>
    </View>
  );
}
