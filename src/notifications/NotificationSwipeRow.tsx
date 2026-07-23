import React, { useRef } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import Icon from '../components/Icon';
import type { CustomerNotification } from '../api/customer';
import { NotificationTimelineCard } from './NotificationTimelineCard';

type NotificationSwipeRowProps = {
  notification: CustomerNotification;
  unread: boolean;
  isLast: boolean;
  onPress: () => void;
  onMarkRead: () => void;
  onDelete: () => void;
};

function SwipeAction({
  label,
  icon,
  color,
  backgroundColor,
  onPress,
  align,
}: {
  label: string;
  icon: string;
  color: string;
  backgroundColor: string;
  onPress: () => void;
  align: 'left' | 'right';
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`justify-center px-4 ${align === 'left' ? 'items-start' : 'items-end'}`}
      style={{ backgroundColor, width: 92, marginBottom: 12, borderRadius: 16 }}
    >
      <Icon name={icon} size={18} color={color} />
      <Text className="text-[11px] font-semibold mt-1" style={{ color }}>{label}</Text>
    </Pressable>
  );
}

export function NotificationSwipeRow({
  notification,
  unread,
  isLast,
  onPress,
  onMarkRead,
  onDelete,
}: NotificationSwipeRowProps) {
  const swipeRef = useRef<Swipeable>(null);

  const closeSwipe = () => swipeRef.current?.close();

  const renderLeftActions = (
    _progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>,
  ) => {
    if (!unread) return null;
    const scale = dragX.interpolate({
      inputRange: [0, 80],
      outputRange: [0.7, 1],
      extrapolate: 'clamp',
    });
    return (
      <Animated.View style={{ transform: [{ scale }] }}>
        <SwipeAction
          label="Read"
          icon="check"
          color="#1259D4"
          backgroundColor="#EEF4FF"
          align="left"
          onPress={() => {
            closeSwipe();
            onMarkRead();
          }}
        />
      </Animated.View>
    );
  };

  const renderRightActions = (
    _progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>,
  ) => {
    const scale = dragX.interpolate({
      inputRange: [-80, 0],
      outputRange: [1, 0.7],
      extrapolate: 'clamp',
    });
    return (
      <Animated.View style={{ transform: [{ scale }] }}>
        <SwipeAction
          label="Delete"
          icon="trash-2"
          color="#BE123C"
          backgroundColor="#FFF1F2"
          align="right"
          onPress={() => {
            closeSwipe();
            onDelete();
          }}
        />
      </Animated.View>
    );
  };

  return (
    <Swipeable
      ref={swipeRef}
      friction={2}
      overshootFriction={8}
      leftThreshold={40}
      rightThreshold={40}
      renderLeftActions={unread ? renderLeftActions : undefined}
      renderRightActions={renderRightActions}
    >
      <NotificationTimelineCard
        notification={notification}
        unread={unread}
        isLast={isLast}
        onPress={onPress}
      />
    </Swipeable>
  );
}
