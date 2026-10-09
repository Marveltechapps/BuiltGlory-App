import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PushNotificationBanner } from '../hooks/usePushNotifications';
import Icon from './Icon';
import { lineHeightFor } from '../setup/androidText';
import { useLayout } from '../layout/breakpoints';

type NotificationBannerProps = {
  banner: PushNotificationBanner;
  onDismiss: () => void;
  onPress: () => void;
};

export function NotificationBanner({ banner, onDismiss, onPress }: NotificationBannerProps) {
  const entry = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
  const layout = useLayout();

  useEffect(() => {
    Animated.spring(entry, {
      toValue: 1,
      speed: 18,
      bounciness: 8,
      useNativeDriver: true,
    }).start();
  }, [entry]);

  const translateY = entry.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] });
  const opacity = entry;
  const payloadImage = banner.payload?.image;
  const imageUri = typeof payloadImage === 'string' && payloadImage.trim() ? payloadImage.trim() : undefined;
  const sideInset = Math.max(12, layout.gutter * 0.75, insets.left, insets.right);

  return (
    <Animated.View
      style={{
        opacity,
        transform: [{ translateY }],
        position: 'absolute',
        left: sideInset,
        right: sideInset,
        top: Math.max(12, insets.top + 8),
        zIndex: 50,
        maxWidth: layout.contentMaxWidth ?? undefined,
        alignSelf: 'center',
        width: '100%',
      }}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${banner.title}. ${banner.body}`}
        className="overflow-hidden rounded-2xl border border-brand-200 bg-white"
        style={{
          shadowColor: '#0F172A',
          shadowOpacity: 0.12,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: 10,
        }}
      >
        <View className="absolute left-0 top-0 bottom-0 w-1 bg-brand-600" />
        <View className="p-3.5 flex-row items-start gap-3">
          <View className="w-11 h-11 rounded-xl overflow-hidden bg-brand-50 border border-brand-100 items-center justify-center">
            {imageUri ? (
              <Image source={{ uri: imageUri }} className="w-full h-full" resizeMode="cover" />
            ) : (
              <Icon name="bell" size={18} color="#1A6FFF" />
            )}
          </View>
          <View className="flex-1 min-w-0">
            <Text className="text-[13px] font-bold text-ink-900" style={{ lineHeight: lineHeightFor(13) }} numberOfLines={2}>
              {banner.title}
            </Text>
            <Text className="text-[12px] text-ink-500 mt-0.5" style={{ lineHeight: lineHeightFor(12) }} numberOfLines={3}>
              {banner.body}
            </Text>
            <Text className="text-[10px] text-brand-600 font-semibold mt-1.5">Tap to open</Text>
          </View>
          <Pressable
            onPress={onDismiss}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Dismiss notification"
            className="w-10 h-10 rounded-full bg-ink-50 items-center justify-center"
          >
            <Icon name="x" size={16} color="#64748B" />
          </Pressable>
        </View>
      </Pressable>
    </Animated.View>
  );
}
