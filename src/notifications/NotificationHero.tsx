import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View, Text } from 'react-native';
import Icon from '../components/Icon';
import { lineHeightFor } from '../setup/androidText';

export function NotificationHero({ unreadCount }: { unreadCount: number }) {
  const entry = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const badgeScale = useRef(new Animated.Value(unreadCount > 0 ? 0.6 : 1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(entry, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ),
    ]).start();
  }, [entry, pulse]);

  useEffect(() => {
    if (unreadCount <= 0) return;
    badgeScale.setValue(0.6);
    Animated.spring(badgeScale, {
      toValue: 1,
      speed: 16,
      bounciness: 14,
      useNativeDriver: true,
    }).start();
  }, [badgeScale, unreadCount]);

  const translateY = entry.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  const opacity = entry;
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0.05] });

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }} className="mx-4 mb-4">
      <View className="overflow-hidden rounded-3xl border border-brand-100 bg-brand-50">
        <View className="absolute -right-8 -top-10 w-36 h-36 rounded-full bg-brand-200/30" />
        <View className="absolute -left-6 bottom-0 w-28 h-28 rounded-full bg-white/50" />
        <View className="px-4 py-4 flex-row items-center gap-4">
          <View className="w-16 h-16 items-center justify-center">
            <Animated.View
              className="absolute w-16 h-16 rounded-full bg-brand-200/40"
              style={{ opacity: ringOpacity, transform: [{ scale: ringScale }] }}
            />
            <View className="w-14 h-14 rounded-2xl bg-white border border-brand-100 items-center justify-center shadow-sm">
              <Icon name="bell" size={26} color="#1A6FFF" />
            </View>
            {unreadCount > 0 ? (
              <Animated.View
                style={{ transform: [{ scale: badgeScale }] }}
                className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1.5 rounded-full bg-rose-500 border-2 border-white items-center justify-center"
              >
                <Text className="text-white text-[10px] font-bold">{unreadCount > 99 ? '99+' : unreadCount}</Text>
              </Animated.View>
            ) : null}
          </View>
          <View className="flex-1">
            <Text className="text-[17px] font-bold text-ink-900" style={{ lineHeight: lineHeightFor(17) }}>
              Stay in the loop
            </Text>
            <Text className="text-[12px] text-ink-600 mt-0.5" style={{ lineHeight: lineHeightFor(12) }}>
              {unreadCount > 0
                ? `${unreadCount} unread update${unreadCount === 1 ? '' : 's'} waiting for you`
                : 'You are all caught up on property updates'}
            </Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}
