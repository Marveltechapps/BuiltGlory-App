import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  RefreshControl,
  Modal as RNModal,
  ActivityIndicator,
  Switch,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from './Icon';
import { formatINR, formatPropertyTypeLabel, Property } from '../data/data';
import { androidInputStyle, lineHeightFor } from '../setup/androidText';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const MOTION = {
  quick: 150,
  normal: 240,
  slow: 420,
};

function usePressScale(disabled?: boolean) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = () => {
    if (disabled) return;
    Animated.spring(scale, {
      toValue: 0.96,
      speed: 28,
      bounciness: 4,
      useNativeDriver: true,
    }).start();
  };
  const pressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      speed: 26,
      bounciness: 7,
      useNativeDriver: true,
    }).start();
  };
  return { scale, pressIn, pressOut };
}

function useEntryAnimation(delay = 0, distance = 10) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(value, {
      toValue: 1,
      duration: MOTION.slow,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [delay, value]);
  return {
    opacity: value,
    transform: [
      {
        translateY: value.interpolate({
          inputRange: [0, 1],
          outputRange: [distance, 0],
        }),
      },
    ],
  };
}

export const FadeInView = React.forwardRef<any, {
  children: React.ReactNode;
  delay?: number;
  distance?: number;
  className?: string;
  style?: any;
  onLayout?: (event: any) => void;
  [key: string]: any;
}>(function FadeInView({
  children,
  delay = 0,
  distance = 10,
  className,
  style,
  onLayout,
  ...rest
}, ref) {
  const animatedStyle = useEntryAnimation(delay, distance);
  return (
    <Animated.View ref={ref} onLayout={onLayout} className={className} style={[animatedStyle, style]} {...rest}>
      {children}
    </Animated.View>
  );
});

export const PressableScale = React.forwardRef<any, {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  className?: string;
  style?: any;
  onLayout?: (event: any) => void;
  [key: string]: any;
}>(function PressableScale({
  children,
  onPress,
  disabled,
  className = '',
  style,
  onLayout,
  ...rest
}, ref) {
  const { scale, pressIn, pressOut } = usePressScale(disabled);
  return (
    <AnimatedPressable
      ref={ref}
      onPress={onPress}
      disabled={disabled}
      onPressIn={pressIn}
      onPressOut={pressOut}
      onLayout={onLayout}
      className={className}
      style={[style, { transform: [{ scale }] }]}
      {...rest}
    >
      {children}
    </AnimatedPressable>
  );
});

export function AnimatedNumber({
  value,
  className = '',
}: {
  value: string | number;
  className?: string;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  const numeric = typeof value === 'number' ? value : Number(value);
  const [display, setDisplay] = useState(Number.isFinite(numeric) ? 0 : value);
  useEffect(() => {
    if (!Number.isFinite(numeric)) {
      setDisplay(value);
      return undefined;
    }
    progress.setValue(0);
    const id = progress.addListener(({ value: v }) => setDisplay(Math.round(v * numeric)));
    Animated.timing(progress, {
      toValue: 1,
      duration: MOTION.slow,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => progress.removeListener(id);
  }, [numeric, progress, value]);
  return <Text className={className}>{String(display)}</Text>;
}

export function EmptyState({
  icon = 'sparkles',
  title,
  body,
  action,
  onPress,
}: {
  icon?: string;
  title: string;
  body?: string;
  action?: string;
  onPress?: () => void;
}) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });
  return (
    <FadeInView className="items-center py-14 px-6">
      <Animated.View
        className="w-16 h-16 rounded-2xl bg-brand-50 items-center justify-center"
        style={{ transform: [{ scale }] }}
      >
        <Icon name={icon} size={30} color="#1A6FFF" />
      </Animated.View>
      <Text className="mt-3 text-[14px] font-semibold text-ink-800 text-center" style={{ lineHeight: lineHeightFor(14) }}>{title}</Text>
      {!!body && <Text className="mt-1 text-[11.5px] text-ink-500 text-center" style={{ lineHeight: lineHeightFor(11.5) }}>{body}</Text>}
      {!!action && !!onPress && <Btn className="mt-4" size="sm" onPress={onPress}>{action}</Btn>}
    </FadeInView>
  );
}

export function ShakeView({
  trigger,
  children,
  className,
  style,
}: {
  trigger?: unknown;
  children: React.ReactNode;
  className?: string;
  style?: any;
}) {
  const shake = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!trigger) return;
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 1, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 55, useNativeDriver: true }),
    ]).start();
  }, [shake, trigger]);
  const translateX = shake.interpolate({ inputRange: [-1, 0, 1], outputRange: [-8, 0, 8] });
  return (
    <Animated.View className={className} style={[style, { transform: [{ translateX }] }]}>
      {children}
    </Animated.View>
  );
}

export function SuccessBurst({
  icon = 'check',
  color = '#10B981',
  bgClassName = 'bg-emerald-50',
}: {
  icon?: string;
  color?: string;
  bgClassName?: string;
}) {
  const pop = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.spring(pop, { toValue: 1, speed: 12, bounciness: 12, useNativeDriver: true }),
      Animated.timing(ring, { toValue: 1, duration: 850, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [pop, ring]);
  const ringScale = ring.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1.8] });
  const ringOpacity = ring.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0.32, 0.18, 0] });
  return (
    <View className="mb-6 w-28 h-28 items-center justify-center">
      <Animated.View
        className={`absolute w-24 h-24 rounded-full ${bgClassName}`}
        style={{ opacity: ringOpacity, transform: [{ scale: ringScale }] }}
      />
      <Animated.View
        className={`w-24 h-24 rounded-full ${bgClassName} items-center justify-center`}
        style={{ transform: [{ scale: pop }] }}
      >
        <Icon name={icon} size={42} color={color} strokeWidth={3} />
      </Animated.View>
      {[0, 1, 2, 3, 4, 5].map((dot) => {
        const angle = (Math.PI * 2 * dot) / 6;
        const distance = ring.interpolate({ inputRange: [0, 1], outputRange: [18, 54] });
        const opacity = ring.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 0] });
        return (
          <Animated.View
            key={dot}
            className="absolute w-2 h-2 rounded-full bg-amber-400"
            style={{
              opacity,
              transform: [
                { translateX: Animated.multiply(distance, Math.cos(angle)) },
                { translateY: Animated.multiply(distance, Math.sin(angle)) },
              ],
            }}
          />
        );
      })}
    </View>
  );
}

function SkeletonBar({ width = '100%', height = 12 }: { width?: number | string; height?: number }) {
  const shimmer = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 820, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 820, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [shimmer]);
  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] });
  return <Animated.View className="rounded-full bg-ink-100" style={{ width: width as any, height, opacity }} />;
}

export function SkeletonCard({ compact }: { compact?: boolean }) {
  return (
    <FadeInView className={`bg-white rounded-card border border-ink-100 p-3 ${compact ? 'flex-row gap-3' : ''}`}>
      <SkeletonBar width={compact ? 92 : '100%'} height={compact ? 92 : 150} />
      <View className="flex-1 gap-2 mt-3">
        <SkeletonBar width="80%" />
        <SkeletonBar width="55%" height={10} />
        <SkeletonBar width="38%" height={14} />
      </View>
    </FadeInView>
  );
}

// ─── PhotoPlaceholder ──────────────────────────────────────────
const PALETTES: [string, string][] = [
  ['#60A5FA', '#3B82F6'],
  ['#34D399', '#10B981'],
  ['#FBBF24', '#F59E0B'],
  ['#F472B6', '#EC4899'],
  ['#A78BFA', '#8B5CF6'],
  ['#FB7185', '#E11D48'],
  ['#22D3EE', '#0891B2'],
  ['#FCA5A5', '#EF4444'],
];

export function PhotoPlaceholder({
  tag,
  height,
  width,
  imageUri,
  className = '',
  children,
  style,
}: {
  tag?: string;
  height?: number;
  width?: number;
  imageUri?: string;
  className?: string;
  children?: React.ReactNode;
  style?: any;
}) {
  const seed = (tag || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const [c1] = PALETTES[seed % PALETTES.length];
  return (
    <View
      className={`relative overflow-hidden ${className}`}
      style={[{ height, width, backgroundColor: c1 }, style]}
    >
      {!!imageUri && <Image source={{ uri: imageUri }} className="absolute inset-0 w-full h-full" resizeMode="cover" />}
      {children}
    </View>
  );
}

export function UserAvatar({
  imageUri,
  label,
  size = 48,
  iconSize = 24,
  bgClassName = 'bg-brand-100',
  iconColor = '#1A6FFF',
  textClassName = 'text-white font-bold',
  className = '',
}: {
  imageUri?: string | null;
  label?: string | null;
  size?: number;
  iconSize?: number;
  bgClassName?: string;
  iconColor?: string;
  textClassName?: string;
  className?: string;
}) {
  const uri = typeof imageUri === 'string' && imageUri.trim() ? imageUri.trim() : null;
  const initial = typeof label === 'string' && label.trim() ? label.trim().slice(0, 1).toUpperCase() : '';

  return (
    <View
      className={`rounded-full overflow-hidden items-center justify-center ${uri ? 'bg-brand-100' : bgClassName} ${className}`}
      style={{ width: size, height: size }}
    >
      {uri ? (
        <Image source={{ uri }} className="w-full h-full" resizeMode="cover" />
      ) : initial ? (
        <Text className={textClassName} style={{ fontSize: Math.max(12, Math.round(size * 0.38)) }}>{initial}</Text>
      ) : (
        <Icon name="user" size={iconSize} color={iconColor} />
      )}
    </View>
  );
}

// ─── Button ────────────────────────────────────────────────────
type BtnVariant = 'primary' | 'outline' | 'ghost' | 'dark' | 'danger' | 'soft';
type BtnSize = 'sm' | 'md' | 'lg';

export function Btn({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  icon,
  iconRight,
  onPress,
  disabled,
}: {
  children: React.ReactNode;
  variant?: BtnVariant;
  size?: BtnSize;
  className?: string;
  icon?: string;
  iconRight?: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const { scale, pressIn, pressOut } = usePressScale(disabled);
  const sizes: Record<BtnSize, string> = {
    sm: 'px-3 min-h-[36px] py-2',
    md: 'px-4 min-h-[52px] py-3.5',
    lg: 'px-5 min-h-[56px] py-4',
  };
  const textSizes: Record<BtnSize, string> = { sm: 'text-sm', md: 'text-[15px]', lg: 'text-base' };
  const textLineHeights: Record<BtnSize, number> = { sm: lineHeightFor(14), md: lineHeightFor(15), lg: lineHeightFor(16) };
  const variants: Record<BtnVariant, { bg: string; text: string }> = {
    primary: { bg: 'bg-brand-600', text: 'text-white' },
    outline: { bg: 'bg-white border border-ink-200', text: 'text-ink-900' },
    ghost: { bg: 'bg-transparent', text: 'text-brand-600' },
    dark: { bg: 'bg-ink-900', text: 'text-white' },
    danger: { bg: 'bg-rose-600', text: 'text-white' },
    soft: { bg: 'bg-brand-50', text: 'text-brand-700' },
  };
  const v = variants[variant];
  const iconColor = variant === 'primary' || variant === 'dark' || variant === 'danger' ? 'white' : '#1A6FFF';
  return (
    <AnimatedPressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={pressIn}
      onPressOut={pressOut}
      className={`flex-row items-center justify-center gap-2 rounded-card ${sizes[size]} ${v.bg} ${disabled ? 'opacity-50' : ''} ${className}`}
      style={{ transform: [{ scale }] }}
    >
      {icon && <Icon name={icon} size={18} color={iconColor} />}
      <Text className={`shrink-0 font-semibold ${textSizes[size]} ${v.text}`} style={{ lineHeight: textLineHeights[size] }}>{children}</Text>
      {iconRight && <Icon name={iconRight} size={18} color={iconColor} />}
    </AnimatedPressable>
  );
}

// ─── TopBar ────────────────────────────────────────────────────
export function TopBar({
  title,
  onBack,
  right,
  sub,
  dark,
  large,
}: {
  title: React.ReactNode;
  onBack?: () => void;
  right?: React.ReactNode;
  sub?: string;
  dark?: boolean;
  large?: boolean;
}) {
  return (
    <View className={`px-4 pt-2 pb-3 flex-row items-center gap-3 ${dark ? '' : ''}`}>
      {onBack && (
        <Pressable onPress={onBack} className="-ml-1 p-2 rounded-full">
          <Icon name="arrow-left" size={22} color={dark ? '#fff' : '#0F172A'} />
        </Pressable>
      )}
      <View className="flex-1 min-w-0 shrink">
        <Text
          className={`${large ? 'text-[22px] font-bold' : 'text-[18px] font-semibold'} tracking-tight ${dark ? 'text-white' : 'text-ink-900'}`}
          style={{ lineHeight: lineHeightFor(large ? 22 : 18) }}
        >
          {title}
        </Text>
        {sub && <Text className={`text-xs ${dark ? 'text-white/70' : 'text-ink-500'}`} style={{ lineHeight: lineHeightFor(12) }}>{sub}</Text>}
      </View>
      {right}
    </View>
  );
}

// ─── Field / Input ─────────────────────────────────────────────
export function Field({
  label,
  children,
  hint,
  required,
}: {
  label?: React.ReactNode;
  children: React.ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <View>
      {label && (
        <Text className="mb-2 text-[13px] font-medium text-ink-700" style={{ lineHeight: lineHeightFor(13) }}>
          {label}
          {required && <Text className="text-rose-500"> *</Text>}
        </Text>
      )}
      {children}
      {hint && <Text className="mt-1.5 text-[11px] text-ink-500" style={{ lineHeight: lineHeightFor(11) }}>{hint}</Text>}
    </View>
  );
}

export function Input({
  icon,
  prefix,
  className = '',
  value,
  onChangeText,
  placeholder,
  keyboardType,
  maxLength,
  secureTextEntry,
  multiline,
  editable = true,
  autoCapitalize,
  autoComplete,
  textContentType,
}: {
  icon?: string;
  prefix?: string;
  className?: string;
  value?: string;
  onChangeText?: (v: string) => void;
  placeholder?: string;
  keyboardType?: TextInputProps['keyboardType'];
  maxLength?: number;
  secureTextEntry?: boolean;
  multiline?: boolean;
  editable?: boolean;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoComplete?: TextInputProps['autoComplete'];
  textContentType?: TextInputProps['textContentType'];
}) {
  const [focused, setFocused] = useState(false);
  const focus = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(focus, {
      toValue: focused ? 1 : 0,
      duration: MOTION.quick,
      useNativeDriver: false,
    }).start();
  }, [focus, focused]);
  const borderColor = focus.interpolate({
    inputRange: [0, 1],
    outputRange: ['#E2E8F0', '#1A6FFF'],
  });
  return (
    <Animated.View
      className={`flex-row items-center gap-2 ${multiline ? 'min-h-[90px] items-start py-3' : 'min-h-[48px] py-2.5'} px-3 bg-white border border-ink-200 rounded-card ${className}`}
      style={{ borderColor }}
    >
      {icon && <Icon name={icon} size={16} color="#94A3B8" />}
      {prefix && <Text className="text-ink-500 text-sm font-medium" style={{ lineHeight: lineHeightFor(14) }}>{prefix}</Text>}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType={keyboardType}
        maxLength={maxLength}
        secureTextEntry={secureTextEntry}
        multiline={multiline}
        editable={editable}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        textContentType={textContentType}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholderTextColor="#94A3B8"
        className="flex-1 text-[14px] text-ink-900"
        style={{
          ...androidInputStyle(14),
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </Animated.View>
  );
}

// ─── Chip / Badge ──────────────────────────────────────────────
export function Chip({
  active,
  children,
  onPress,
  icon,
}: {
  active?: boolean;
  children: React.ReactNode;
  onPress?: () => void;
  icon?: string;
}) {
  const { scale, pressIn, pressOut } = usePressScale();
  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={pressIn}
      onPressOut={pressOut}
      className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border ${active ? 'bg-brand-600 border-brand-600' : 'bg-white border-ink-200'}`}
      style={{ transform: [{ scale }] }}
    >
      {icon && <Icon name={icon} size={12} color={active ? '#fff' : '#334155'} />}
      <Text className={`text-[12px] font-medium ${active ? 'text-white' : 'text-ink-700'}`} style={{ lineHeight: lineHeightFor(12) }}>{children}</Text>
    </AnimatedPressable>
  );
}

const BADGE_MAP: Record<string, string> = {
  brand: 'bg-brand-50 text-brand-700',
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  rose: 'bg-rose-50 text-rose-700',
  ink: 'bg-ink-100 text-ink-700',
};

export function Badge({ color = 'brand', children, icon }: { color?: string; children: React.ReactNode; icon?: string }) {
  const cls = BADGE_MAP[color] || BADGE_MAP.brand;
  const [bg, text] = cls.split(' text-').map((s, i) => (i === 0 ? s : 'text-' + s));
  return (
    <View className={`flex-row items-center gap-1 px-2 py-1 rounded-full ${bg}`}>
      {icon && <Icon name={icon} size={10} />}
      <Text className={`text-[10.5px] font-semibold ${text}`} style={{ lineHeight: lineHeightFor(10.5) }}>{children}</Text>
    </View>
  );
}

// ─── Heart / PropertyCard ──────────────────────────────────────
export function Heart({ active, onPress, size = 16 }: { active?: boolean; onPress?: () => void; size?: number }) {
  const pop = useRef(new Animated.Value(1)).current;
  const handlePress = () => {
    Animated.sequence([
      Animated.spring(pop, { toValue: 1.32, speed: 34, bounciness: 12, useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1, speed: 26, bounciness: 8, useNativeDriver: true }),
    ]).start();
    onPress?.();
  };
  return (
    <AnimatedPressable onPress={handlePress} className={`w-8 h-8 rounded-full items-center justify-center ${active ? 'bg-white' : 'bg-white/90'}`} style={{ transform: [{ scale: pop }] }}>
      <Icon name="heart" size={size} color={active ? '#E11D48' : '#0F172A'} fill={active ? '#E11D48' : 'none'} strokeWidth={active ? 2.4 : 2} />
    </AnimatedPressable>
  );
}

export function PropertyCard({
  p,
  onPress,
  onFav,
  fav,
  variant = 'list',
}: {
  p: Property;
  onPress?: () => void;
  onFav?: () => void;
  fav?: boolean;
  variant?: 'list' | 'compact';
}) {
  const { scale, pressIn, pressOut } = usePressScale();
  if (variant === 'compact') {
    return (
      <AnimatedPressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} className="bg-white rounded-card overflow-hidden border border-ink-200" style={{ transform: [{ scale }] }}>
        <View className="flex-row gap-3 p-2">
          <PhotoPlaceholder tag={p.id} imageUri={p.images?.[0]} className="rounded-lg" width={92} height={92}>
            <View className="absolute top-1.5 left-1.5">
              <Badge color="brand">{formatPropertyTypeLabel(p.type)}</Badge>
            </View>
          </PhotoPlaceholder>
          <View className="flex-1 py-1">
            <View className="flex-row items-start justify-between gap-2">
              <Text className="flex-1 text-[14px] font-semibold text-ink-900" numberOfLines={1}>{p.title}</Text>
              <Heart active={fav} onPress={onFav} />
            </View>
            <View className="flex-row items-center gap-1 mt-0.5">
              <Icon name="map-pin" size={11} color="#64748B" />
              <Text className="text-[11px] text-ink-500">{p.location}, {p.city}</Text>
            </View>
            <Text className="text-[15px] font-bold text-brand-600 mt-1">{formatINR(p.price)}</Text>
            <View className="flex-row gap-3 mt-1">
              {p.bhk > 0 && <Text className="text-[11px] text-ink-500"><Text className="text-ink-700 font-bold">{p.bhk}</Text> BHK</Text>}
              <Text className="text-[11px] text-ink-500"><Text className="text-ink-700 font-bold">{p.area}</Text> sqft</Text>
            </View>
          </View>
        </View>
      </AnimatedPressable>
    );
  }
  return (
    <AnimatedPressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} className="bg-white rounded-card overflow-hidden border border-ink-200" style={{ transform: [{ scale }] }}>
      <PhotoPlaceholder tag={p.id} imageUri={p.images?.[0]} height={200}>
        <View className="absolute top-3 left-3 flex-row gap-1.5">
          <Badge color="brand">{formatPropertyTypeLabel(p.type)}</Badge>
          {p.verified && <Badge color="green" icon="badge-check">Verified</Badge>}
        </View>
        <View className="absolute top-3 right-3">
          <Heart active={fav} onPress={onFav} />
        </View>
      </PhotoPlaceholder>
      <View className="p-3">
        <Text className="text-[15px] font-semibold text-ink-900 leading-display-tight" numberOfLines={1}>{p.title}</Text>
        <Text className="mt-2 text-[18px] font-bold text-brand-600">{formatINR(p.price)}</Text>
        <View className="mt-2 flex-row items-center gap-3">
          {p.bhk > 0 && (
            <View className="flex-row items-center gap-1">
              <Icon name="bed-double" size={12} color="#64748B" />
              <Text className="text-[12px] text-ink-500"><Text className="text-ink-700 font-bold">{p.bhk}</Text> BHK</Text>
            </View>
          )}
          <View className="flex-row items-center gap-1">
            <Icon name="ruler" size={12} color="#64748B" />
            <Text className="text-[12px] text-ink-500"><Text className="text-ink-700 font-bold">{p.area}</Text> sqft</Text>
          </View>
        </View>
        <View className="mt-2 flex-row items-center gap-1">
          <Icon name="map-pin" size={12} color="#1D4ED8" />
          <Text className="text-[12px] text-brand-700 font-medium" numberOfLines={1}>{p.location}, {p.city}</Text>
        </View>
      </View>
    </AnimatedPressable>
  );
}

// ─── BottomNav ─────────────────────────────────────────────────
export const BOTTOM_NAV_HEIGHT = 82;

const BOTTOM_NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'buy', label: 'Explore', icon: 'search' },
  { id: 'sell', label: 'Sell', icon: 'tag' },
  { id: 'profile', label: 'Profile', icon: 'user' },
];

function BottomNavButton({
  item,
  selected,
  profileUri,
  onPress,
}: {
  item: typeof BOTTOM_NAV_ITEMS[number];
  selected: boolean;
  profileUri: string | null;
  onPress: () => void;
}) {
  const activeValue = useRef(new Animated.Value(selected ? 1 : 0)).current;
  const showProfilePhoto = item.id === 'profile' && !!profileUri;

  useEffect(() => {
    Animated.spring(activeValue, {
      toValue: selected ? 1 : 0,
      speed: 16,
      bounciness: 6,
      useNativeDriver: true,
    }).start();
  }, [activeValue, selected]);

  const iconMotion = {
    transform: [
      {
        translateY: activeValue.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -3],
        }),
      },
      {
        scale: activeValue.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.1],
        }),
      },
    ],
  };
  const labelMotion = {
    opacity: activeValue.interpolate({
      inputRange: [0, 1],
      outputRange: [0.86, 1],
    }),
    transform: [
      {
        translateY: activeValue.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 0],
        }),
      },
    ],
  };

  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={`${item.label} tab`}
      accessibilityState={{ selected }}
      hitSlop={8}
      className="flex-1 min-h-[58px] py-1 items-center justify-center rounded-full"
    >
      <Animated.View className="h-8 min-w-10 px-2 rounded-full items-center justify-center" style={iconMotion}>
        {showProfilePhoto ? (
          <UserAvatar imageUri={profileUri} size={26} iconSize={14} className="border border-ink-200" />
        ) : (
          <Icon name={item.icon} size={22} color={selected ? '#1259D4' : '#475569'} strokeWidth={selected ? 2.3 : 2} />
        )}
      </Animated.View>
      <Animated.View style={labelMotion}>
        <Text
          className={`mt-0.5 text-[11px] leading-caption ${selected ? 'text-brand-700 font-bold' : 'text-ink-700 font-medium'}`}
          style={{ lineHeight: lineHeightFor(11) }}
        >
          {item.label}
        </Text>
      </Animated.View>
    </PressableScale>
  );
}

export function BottomNav({ active, onNav, profilePhoto }: { active: string; onNav: (tab: string) => void; profilePhoto?: string | null }) {
  const insets = useSafeAreaInsets();
  const profileUri = typeof profilePhoto === 'string' && profilePhoto.trim() ? profilePhoto.trim() : null;
  const [barWidth, setBarWidth] = useState(0);
  const activeIndex = Math.max(0, BOTTOM_NAV_ITEMS.findIndex((item) => item.id === active));
  const navContentWidth = Math.max(0, barWidth - 12);
  const tabWidth = navContentWidth > 0 ? navContentWidth / BOTTOM_NAV_ITEMS.length : 0;
  const indicator = useRef(new Animated.Value(activeIndex)).current;

  useEffect(() => {
    Animated.spring(indicator, {
      toValue: activeIndex,
      speed: 18,
      bounciness: 7,
      useNativeDriver: true,
    }).start();
  }, [activeIndex, indicator]);

  const indicatorTranslate = indicator.interpolate({
    inputRange: BOTTOM_NAV_ITEMS.map((_, index) => index),
    outputRange: BOTTOM_NAV_ITEMS.map((_, index) => index * tabWidth),
  });
  const indicatorScale = indicator.interpolate({
    inputRange: BOTTOM_NAV_ITEMS.flatMap((_, index) => [index - 0.42, index, index + 0.42]),
    outputRange: BOTTOM_NAV_ITEMS.flatMap(() => [0.92, 1, 0.92]),
  });

  return (
    <View
      className="absolute bottom-0 left-0 right-0 bg-white pt-1"
      pointerEvents="box-none"
      style={{ height: BOTTOM_NAV_HEIGHT + insets.bottom }}
    >
      <View
        onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}
        className="flex-1 flex-row items-center border-t border-ink-100 bg-white px-1.5"
      >
        {tabWidth > 0 && (
          <Animated.View
            pointerEvents="none"
            className="absolute left-1.5 top-2 bottom-2 rounded-full border border-brand-100 bg-brand-50"
            style={{
              width: tabWidth,
              transform: [{ translateX: indicatorTranslate }, { scaleX: indicatorScale }],
            }}
          />
        )}
        {BOTTOM_NAV_ITEMS.map((it) => {
          const on = active === it.id;
          return (
            <BottomNavButton
              key={it.id}
              item={it}
              selected={on}
              profileUri={profileUri}
              onPress={() => onNav(it.id)}
            />
          );
        })}
      </View>
    </View>
  );
}

// ─── Screen ────────────────────────────────────────────────────
export function Screen({
  children,
  dark,
  padBottom,
  fill,
  refreshing,
  onRefresh,
  fixedTop,
}: {
  children: React.ReactNode;
  dark?: boolean;
  padBottom?: boolean;
  fill?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  fixedTop?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const childrenArray = React.Children.toArray(children);
  const isBottomNav = (child: React.ReactNode) => React.isValidElement(child) && child.type === BottomNav;
  const isTopBar = (child: React.ReactNode) => React.isValidElement(child) && child.type === TopBar;
  const isFixedBottomAction = (child: React.ReactNode) => {
    if (!React.isValidElement(child) || child.type === BottomNav) return false;
    const className = (child.props as { className?: unknown }).className;
    return typeof className === 'string' && className.includes('absolute bottom-0 left-0 right-0');
  };
  const topBarChildren = childrenArray.filter(isTopBar);
  const fixedBottomActionChildren = childrenArray.filter(isFixedBottomAction);
  const contentChildren = childrenArray.filter((child) => !isBottomNav(child) && !isTopBar(child) && !isFixedBottomAction(child));
  const fixedChildren = childrenArray.filter(isBottomNav);
  const navPadding = padBottom ? BOTTOM_NAV_HEIGHT + 20 + insets.bottom : 0;
  const actionPadding = fixedBottomActionChildren.length ? 96 + insets.bottom : 0;
  const bottomPadding = Math.max(24, navPadding, actionPadding);

  const contentEntry = useEntryAnimation(0, 6);
  return (
    <SafeAreaView edges={['top']} className={`flex-1 ${dark ? 'bg-ink-900' : 'bg-white'}`}>
      {fixedTop}
      {topBarChildren}
      {fill ? (
        <Animated.View className="flex-1" style={[contentEntry, { paddingBottom: padBottom || fixedBottomActionChildren.length ? bottomPadding : 0 }]}>
          {contentChildren}
        </Animated.View>
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: bottomPadding }}
          showsVerticalScrollIndicator={false}
          refreshControl={onRefresh ? (
            <RefreshControl
              refreshing={!!refreshing}
              onRefresh={onRefresh}
              tintColor="#1A6FFF"
              colors={['#1A6FFF']}
              progressBackgroundColor="#EFF6FF"
            />
          ) : undefined}
        >
          <Animated.View style={contentEntry}>{contentChildren}</Animated.View>
        </ScrollView>
      )}
      {fixedBottomActionChildren}
      {fixedChildren}
    </SafeAreaView>
  );
}

// ─── StepDots / ProgressBar ────────────────────────────────────
export function StepDots({ count, current }: { count: number; current: number }) {
  return (
    <View className="flex-row items-center gap-1.5">
      {Array.from({ length: count }).map((_, i) => (
        <FadeInView key={i} delay={i * 45} distance={3}>
          <View className={`h-1.5 rounded-full ${i === current ? 'w-6 bg-brand-600' : 'w-1.5 bg-ink-200'}`} />
        </FadeInView>
      ))}
    </View>
  );
}

export function ProgressBar({ value }: { value: number }) {
  const width = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(width, {
      toValue: Math.max(0, Math.min(100, value)),
      duration: MOTION.normal,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [value, width]);
  const animatedWidth = width.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });
  return (
    <View className="w-full h-1.5 bg-ink-100 rounded-full overflow-hidden">
      <Animated.View className="h-full bg-brand-500 rounded-full" style={{ width: animatedWidth }} />
    </View>
  );
}

// ─── Toggle ────────────────────────────────────────────────────
export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <Switch
      value={on}
      onValueChange={onChange}
      trackColor={{ false: '#E2E8F0', true: '#1A6FFF' }}
      thumbColor="#fff"
    />
  );
}

// ─── Sheet (bottom modal) ──────────────────────────────────────
export function Sheet({
  children,
  onClose,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title?: string;
}) {
  const slideY = useRef(new Animated.Value(360)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideY, {
        toValue: 0,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(fade, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fade, slideY]);

  return (
    <RNModal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View className="flex-1 justify-end bg-black/45" style={{ opacity: fade }}>
        <Pressable className="absolute inset-0" onPress={onClose} />
        <Animated.View
          className="w-full bg-white rounded-t-3xl p-5 pb-7 shadow-lg"
          style={{ transform: [{ translateY: slideY }] }}
        >
          <View className="w-10 h-1 bg-ink-200 rounded-full self-center mb-4" />
          {title && <Text className="text-[17px] font-bold text-ink-900 mb-3">{title}</Text>}
          {children}
        </Animated.View>
      </Animated.View>
    </RNModal>
  );
}

export function Modal({
  open,
  onClose,
  children,
  title,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  const slideY = useRef(new Animated.Value(36)).current;
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!open) return;
    Animated.parallel([
      Animated.timing(slideY, { toValue: 0, duration: MOTION.normal, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: MOTION.quick, useNativeDriver: true }),
    ]).start();
  }, [fade, open, slideY]);
  if (!open) return null;
  return (
    <RNModal visible transparent animationType="fade" onRequestClose={onClose}>
      <Animated.View className="flex-1 justify-end bg-black/40" style={{ opacity: fade }}>
        <Pressable className="absolute inset-0" onPress={onClose} />
        <Animated.View className="bg-white w-full rounded-t-3xl p-5 pb-8" style={{ transform: [{ translateY: slideY }] }}>
          <View className="w-10 h-1 bg-ink-200 rounded-full self-center mb-3" />
          {title && <Text className="text-lg font-semibold mb-3">{title}</Text>}
          {children}
        </Animated.View>
      </Animated.View>
    </RNModal>
  );
}

// ─── Timeline ──────────────────────────────────────────────────
export type TimelineStep = {
  title: string;
  state: 'done' | 'current' | 'alert' | 'future';
  detail?: string;
  date?: string;
  action?: React.ReactNode;
};

export function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <View>
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        const isDone = s.state === 'done';
        const isCurrent = s.state === 'current';
        const isAlert = s.state === 'alert';
        return (
          <FadeInView key={i} delay={i * 55} distance={8} className="flex-row gap-3">
            <View className="items-center">
              <View
                className={`w-7 h-7 rounded-full items-center justify-center ${
                  isDone ? 'bg-emerald-500' : isCurrent ? 'bg-brand-600' : isAlert ? 'bg-amber-500' : 'bg-ink-200'
                }`}
              >
                {isDone ? (
                  <Icon name="check" size={14} color="white" strokeWidth={3} />
                ) : isCurrent ? (
                  <Icon name="loader-2" size={14} color="white" />
                ) : isAlert ? (
                  <Icon name="triangle-alert" size={13} color="white" />
                ) : (
                  <View className="w-2 h-2 rounded-full bg-white" />
                )}
              </View>
              {!last && <View style={{ width: 2, flex: 1, minHeight: 26 }} className={isDone ? 'bg-emerald-300' : 'bg-ink-200'} />}
            </View>
            <View className="pb-5 flex-1">
              <Text className={`text-[13.5px] font-semibold ${isCurrent || isDone || isAlert ? 'text-ink-900' : 'text-ink-400'}`}>{s.title}</Text>
              {s.detail && <Text className="text-[11.5px] text-ink-500 mt-0.5">{s.detail}</Text>}
              {s.date && <Text className="text-[10.5px] text-ink-400 mt-0.5">{s.date}</Text>}
              {isCurrent && <Text className="text-[10.5px] text-brand-600 font-semibold mt-0.5">● In progress</Text>}
              {s.action}
            </View>
          </FadeInView>
        );
      })}
    </View>
  );
}

// ─── DocCard ───────────────────────────────────────────────────
export function DocCard({
  name,
  meta,
  onView,
  onDownload,
  flagged,
  reason,
  action,
}: {
  name: string;
  meta: string;
  onView?: () => void;
  onDownload?: () => void;
  flagged?: boolean;
  reason?: string | null;
  action?: React.ReactNode;
}) {
  return (
    <View className={`rounded-card border bg-white ${flagged ? 'border-amber-300' : 'border-ink-200'}`}>
      <View className="flex-row items-center gap-3 p-3">
        <View className={`w-11 h-11 rounded-lg items-center justify-center ${flagged ? 'bg-amber-50' : 'bg-rose-50'}`}>
          <Icon name="file-text" size={20} color={flagged ? '#D97706' : '#E11D48'} />
        </View>
        <Pressable onPress={onView} className="flex-1">
          <Text className="text-[13px] font-semibold" numberOfLines={1}>{name}</Text>
          <Text className="text-[11px] text-ink-500">{meta}</Text>
        </Pressable>
        {onDownload && (
          <Pressable onPress={onDownload} className="w-9 h-9 rounded-full bg-ink-100 items-center justify-center">
            <Icon name="download" size={15} color="#334155" />
          </Pressable>
        )}
      </View>
      {flagged && reason && (
        <View className="mx-3 mb-3 px-2.5 py-2 rounded-md bg-amber-50 flex-row items-start gap-1.5">
          <Icon name="triangle-alert" size={12} color="#D97706" />
          <Text className="text-[11.5px] text-amber-800 flex-1">{reason}</Text>
        </View>
      )}
      {action}
    </View>
  );
}

// ─── Toast ─────────────────────────────────────────────────────
export function Toast({ message, icon = 'check-circle', color = '#34D399' }: { message?: string; icon?: string; color?: string }) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(value, {
      toValue: message ? 1 : 0,
      duration: MOTION.normal,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [message, value]);
  if (!message) return null;
  const translateY = value.interpolate({ inputRange: [0, 1], outputRange: [24, 0] });
  return (
    <Animated.View
      pointerEvents="none"
      className="absolute bottom-20 left-4 right-4 bg-ink-900 px-4 py-3 rounded-card flex-row items-center gap-2"
      style={{ opacity: value, transform: [{ translateY }] }}
    >
      <Icon name={icon} size={16} color={color} />
      <Text className="text-white text-[13px] font-medium flex-1">{message}</Text>
    </Animated.View>
  );
}

export function useToast() {
  const [msg, setMsg] = useState('');
  const fire = (m: string, ms = 2500) => {
    setMsg(m);
    setTimeout(() => setMsg(''), ms);
  };
  return { msg, fire };
}

export function Spinner({ color = '#fff', size = 18 }: { color?: string; size?: number }) {
  return <ActivityIndicator color={color} size={size as any} />;
}
