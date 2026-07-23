import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, View, Text, Pressable, TextInput, PanResponder, AppState, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import Icon from '../components/Icon';
import { BrandLogo } from '../components/BrandLogo';
import { Screen, TopBar, Field, Input, Toggle, Spinner, FadeInView, PressableScale, ShakeView, SuccessBurst } from '../components/shared';
import { useNav } from '../navigation/useNav';
import { nextAuthenticatedRoute } from '../navigation/profileFlow';
import { useAppState } from '../state/AppState';
import { CUSTOMER_API_BASE_URL, CustomerApiError, sendCustomerOtp, sendEmailOtp, resendEmailOtp, uploadCustomerDocument, verifyCustomerOtp, verifyEmailOtp } from '../api/customer';
import { contentBody, contentMetaArray, fallbackPrivacyContent, fallbackTermsContent, useContentItem } from '../content';
import {
  DetectedLocation,
  LocationFetchError,
  fetchCurrentLocation,
  locationDisplayName,
  openDeviceLocationSettings,
} from '../utils/location';
import {
  PermissionId,
  PermissionStatus,
  getPermissionStatus,
  openAppSettings,
  permissionStatusLabel,
  requestPermission,
} from '../utils/devicePermissions';

const splashLogo = require('../../assets/builtglory5.png');
const SPLASH_LOGO_ASPECT_RATIO = 1672 / 941;
const SPLASH_LOGO_MAX_WIDTH_RATIO = 0.84;
const SPLASH_EDGE_PADDING_RATIO = 0.08;

function getSplashLogoWidth(screenWidth: number, screenHeight: number) {
  const shortestSide = Math.min(screenWidth, screenHeight);
  const horizontalPadding = shortestSide * SPLASH_EDGE_PADDING_RATIO * 2;
  const maxWidth = Math.min(screenWidth, shortestSide * SPLASH_LOGO_MAX_WIDTH_RATIO) - horizontalPadding;
  return Math.max(0, maxWidth);
}

const OTP_DIGIT_COUNT = 6;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type LoginMethod = 'phone' | 'email';
type OtpMethod = LoginMethod;

function secondsUntil(isoDate: string | undefined, fallback = 0) {
  if (!isoDate) return fallback;
  return Math.max(0, Math.ceil((new Date(isoDate).getTime() - Date.now()) / 1000));
}

function otpVerifyErrorMessage(error: unknown) {
  if (error instanceof CustomerApiError) {
    const msg = error.message.toLowerCase();
    if (msg.includes('expired')) return 'This OTP has expired. Please request a new one.';
    if (msg.includes('invalid')) return 'Invalid OTP. Please try again.';
    if (msg.includes('locked')) return 'Too many attempts. Please request a new OTP.';
    return error.message;
  }
  return 'Invalid OTP. Please try again.';
}

function formatOtpCountdown(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function isNetworkReachabilityError(error: unknown) {
  if (!(error instanceof Error)) return true;
  const message = error.message.toLowerCase();
  return (
    message.includes('network request failed')
    || message.includes('failed to fetch')
    || message.includes('network error')
    || message.includes('cleartext')
    || message.includes('ecconnrefused')
    || message.includes('timeout')
  );
}

function otpSendErrorMessage(error: unknown) {
  if (error instanceof CustomerApiError) {
    if (error.status === 429 || error.code === 'RATE_LIMITED') {
      return 'Too many OTP requests. Please wait a few minutes and try again.';
    }
    if (error.code === 'SMS_CREDITS_EXHAUSTED' || error.message.toLowerCase().includes('insufficient')) {
      return 'SMS service is temporarily unavailable (provider credits exhausted). Please try email login or contact support.';
    }
    if (error.code === 'SMS_PROVIDER_UNAVAILABLE' || error.code === 'SMS_DELIVERY_FAILED' || error.code === 'SMS_PROVIDER_AUTH_FAILED') {
      return error.message || 'Could not send OTP via SMS. Please try again shortly.';
    }
    if (error.code === 'SMS_CONFIG_MISSING' || error.code === 'SMS_CONFIG_INVALID' || error.code === 'SMS_LOG_MODE_FORBIDDEN') {
      return 'SMS service is not configured correctly. Please contact support or use email login.';
    }
    if (error.status === 409 || error.code === 'CONFLICT') {
      return error.message || 'Please wait before requesting another OTP.';
    }
    if (error.status === 400 || error.status === 422) {
      return error.message || 'Enter a valid 10-digit mobile number.';
    }
    return error.message || 'Failed to send OTP. Please try again.';
  }
  if (isNetworkReachabilityError(error) && CUSTOMER_API_BASE_URL.startsWith('http://')) {
    return `Could not reach the backend at ${CUSTOMER_API_BASE_URL}. Release APKs block plain HTTP unless the app is rebuilt with cleartext traffic enabled (run npx expo prebuild --clean, then rebuild the APK). Expo Go works because it runs in debug mode.`;
  }
  return `Could not reach the backend at ${CUSTOMER_API_BASE_URL}. Set EXPO_PUBLIC_API_URL in Customer-App-V1/.env to your computer's LAN IP (same Wi-Fi as the phone), then restart Expo or rebuild the app.`;
}

function profileSaveErrorMessage(error: unknown) {
  if (error instanceof CustomerApiError) {
    if (error.status === 409 || error.code === 'CONFLICT') {
      return error.message || 'This phone number or email is already registered to another account.';
    }
    if (error.status === 401 || error.code === 'UNAUTHORIZED') {
      return 'Your session expired. Please sign in again and retry.';
    }
    if (error.status === 400 || error.status === 422) {
      return error.message || 'Some profile fields are invalid. Please check and try again.';
    }
    if (error.status >= 500) {
      return error.message && error.message !== 'Unexpected server error.'
        ? error.message
        : 'Could not save your profile due to a server error. Please try again.';
    }
    return error.message || 'Could not save your profile. Please try again.';
  }
  if (error instanceof Error && error.message) return error.message;
  return 'Could not save your profile. Please try again.';
}

type OnboardingSlideConfig = {
  title: string;
  description: string;
  isActive?: boolean;
  order?: number;
};

const fallbackOnboardingConfig = {
  slug: 'onboarding-slides-config',
  section: 'onboarding' as const,
  title: 'Onboarding Slides',
  metadata: { slides: [] },
};
const SPLASH_MIN_DURATION_MS = 2500;

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function FloatingWaterDot({ delay = 0 }: { delay?: number }) {
  const float = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(float, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(float, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    const timer = setTimeout(() => animation.start(), delay);
    return () => {
      clearTimeout(timer);
      animation.stop();
    };
  }, [delay, float]);

  const translateY = float.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [3, -7, 3],
  });
  const scale = float.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [0.82, 1.18, 0.82],
  });
  const opacity = float.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [0.45, 1, 0.45],
  });

  return (
    <Animated.View
      style={{
        width: 10,
        height: 10,
        borderRadius: 999,
        backgroundColor: '#1A6FFF',
        opacity,
        transform: [{ translateY }, { scale }],
      }}
    />
  );
}

// ─── S-01 Splash ─────────────────────────────────────────────
export function SplashScreen() {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const splashLogoWidth = getSplashLogoWidth(screenWidth, screenHeight);
  const { resetTo } = useNav();
  const { validateToken, preloadPrimaryTabResources } = useAppState();
  const [stalled, setStalled] = useState(false);
  const [checking, setChecking] = useState(true);

  const restoreSession = useCallback(async (isMounted: () => boolean = () => true, minDurationMs = 0) => {
    const startedAt = Date.now();
    setChecking(true);
    const user = await validateToken();
    if (user) void preloadPrimaryTabResources();
    const remainingSplashMs = minDurationMs - (Date.now() - startedAt);
    if (remainingSplashMs > 0) await wait(remainingSplashMs);
    if (!isMounted()) return;
    resetTo(user ? nextAuthenticatedRoute(user) : 'login');
  }, [preloadPrimaryTabResources, resetTo, validateToken]);

  useEffect(() => {
    let mounted = true;
    void restoreSession(() => mounted, SPLASH_MIN_DURATION_MS);
    return () => {
      mounted = false;
    };
  }, [restoreSession]);
  useEffect(() => {
    const t = setTimeout(() => {
      setStalled(true);
      setChecking(false);
    }, 5000);
    return () => clearTimeout(t);
  }, []);
  return (
    <View className="flex-1 bg-white items-center justify-center px-6">
      <View className="items-center w-full max-w-[92%]">
        <Image
          source={splashLogo}
          style={{ width: splashLogoWidth, aspectRatio: SPLASH_LOGO_ASPECT_RATIO, maxWidth: '100%' }}
          resizeMode="contain"
          accessibilityLabel="BuiltGlory logo"
        />
        <Text className="text-[13px] text-ink-500 mt-4 font-medium">Find. Flip. Flourish.</Text>
        <View className="mt-10 flex-row items-center gap-2">
          {[0, 1, 2].map((i) => (
            <FloatingWaterDot key={i} delay={i * 180} />
          ))}
        </View>
      </View>
      {stalled && (
        <View className="absolute bottom-24 left-0 right-0 items-center gap-3">
          <Text className="text-[12px] text-ink-400">Taking longer than usual…</Text>
          <Pressable onPress={() => restoreSession()} disabled={checking} className={`px-5 min-h-9 py-2 rounded-full items-center justify-center ${checking ? 'bg-ink-200' : 'bg-brand-600'}`}>
            <Text className={`text-[13px] font-semibold ${checking ? 'text-ink-500' : 'text-white'}`}>
              {checking ? 'Checking…' : 'Retry'}
            </Text>
          </Pressable>
        </View>
      )}
      <Text className="absolute bottom-8 self-center text-[11px] text-ink-400">Powered by Builtglory · v1.0</Text>
    </View>
  );
}

// ─── S-02 Onboarding ─────────────────────────────────────────
export function OnboardingScreen() {
  const { go } = useNav();
  const insets = useSafeAreaInsets();
  const [i, setI] = useState(0);
  const slideIndexRef = useRef(0);
  const fallbackSlides = [
    { icon: 'home', heading: 'Buy Verified Properties', desc: 'Legal verified real estate investment with complete transparency. Site-inspected before listing.' },
    { icon: 'handshake', heading: 'Sell Directly to Builtglory', desc: 'No broker, no hassle. Get fair offers directly from verified buyers.' },
    { icon: 'sparkles', heading: 'AI Powered Real Estate', desc: 'Smart property decisions with AI valuations, legal checks, and instant matching.' },
  ];
  const { item: onboardingConfig } = useContentItem('onboarding-slides-config', fallbackOnboardingConfig);
  const cmsSlides = contentMetaArray<OnboardingSlideConfig>(onboardingConfig, 'slides')
    .filter((slide) => slide.isActive !== false)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const slides = cmsSlides.length
    ? cmsSlides.map((slide, index) => ({
        icon: fallbackSlides[index % fallbackSlides.length].icon,
        heading: slide.title,
        desc: slide.description,
      }))
    : fallbackSlides;
  const s = slides[i];
  const onDone = () => go('login');
  useEffect(() => {
    slideIndexRef.current = i;
  }, [i]);
  useEffect(() => {
    if (i >= slides.length) setI(Math.max(slides.length - 1, 0));
  }, [i, slides.length]);
  const goNext = () => {
    const current = slideIndexRef.current;
    if (current < slides.length - 1) setI(current + 1);
    else onDone();
  };
  const goBack = () => {
    const current = slideIndexRef.current;
    if (current > 0) setI(current - 1);
  };
  const swipeResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => {
        const horizontal = Math.abs(gesture.dx) > 18 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25;
        return horizontal;
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx < -45) goNext();
        if (gesture.dx > 45) goBack();
      },
    })
  ).current;
  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="absolute right-4 z-10" style={{ top: insets.top + 8 }}>
        <Pressable onPress={onDone} className="px-4 py-2 rounded-full">
          <Text className="text-sm font-medium text-ink-500">Skip</Text>
        </Pressable>
      </View>
      <FadeInView key={i} className="flex-1 items-center justify-center px-6 pt-16" {...swipeResponder.panHandlers as any}>
        <View className="w-52 h-52 rounded-3xl items-center justify-center mb-10 bg-brand-50">
          <View className="w-28 h-28 rounded-2xl bg-white items-center justify-center">
            <Icon name={s.icon} size={56} color="#1A6FFF" strokeWidth={1.5} />
          </View>
        </View>
        <Text className="text-[24px] font-bold text-ink-900 text-center leading-display-tight mb-3">{s.heading}</Text>
        <Text className="text-[14px] text-ink-500 text-center leading-relaxed max-w-[280px]">{s.desc}</Text>
      </FadeInView>
      <View className="px-6 pb-10">
        <View className="flex-row items-center justify-center gap-2 mb-6">
          {slides.map((_, idx) => (
            <Pressable key={idx} onPress={() => setI(idx)}>
              <FadeInView distance={2}>
                <View className={`h-1.5 rounded-full ${idx === i ? 'w-6 bg-brand-600' : 'w-2 bg-ink-200'}`} />
              </FadeInView>
            </Pressable>
          ))}
        </View>
        <PressableScale onPress={goNext} className="w-full min-h-12 py-3 bg-brand-600 rounded-xl items-center justify-center">
          <Text className="text-white font-semibold text-[15px]">{i < 2 ? 'Next' : 'Get Started'}</Text>
        </PressableScale>
      </View>
    </SafeAreaView>
  );
}

// ─── S-03 Login ──────────────────────────────────────────────
export function LoginScreen() {
  const { go } = useNav();
  const [method, setMethod] = useState<LoginMethod>('phone');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const phoneValid = phone.length === 10;
  const emailValid = EMAIL_REGEX.test(email.trim());
  const valid = method === 'phone' ? phoneValid : emailValid;

  const handleSend = async () => {
    if (!valid || sending) return;
    setSending(true);
    setSendError(null);
    try {
      if (method === 'phone') {
        const otpRequest = await sendCustomerOtp(phone);
        go('otp', {
          otpMethod: 'phone' as OtpMethod,
          countryCode: '+91',
          phone,
          otpRequestId: otpRequest.requestId,
          otpExpiresInSeconds: otpRequest.expiresInSeconds,
          otpCanResendAt: otpRequest.canResendAt,
        });
      } else {
        const otpRequest = await sendEmailOtp(email);
        go('otp', {
          otpMethod: 'email' as OtpMethod,
          email: otpRequest.email,
          otpRequestId: otpRequest.requestId,
          otpExpiresInSeconds: otpRequest.expiresInSeconds,
          otpCanResendAt: otpRequest.canResendAt,
        });
      }
    } catch (error) {
      setSendError(otpSendErrorMessage(error));
    } finally {
      setSending(false);
    }
  };

  const switchMethod = (next: LoginMethod) => {
    setMethod(next);
    setSendError(null);
  };

  return (
    <Screen>
      <View className="px-6 pt-6">
        <BrandLogo size={72} containerStyle={{ marginBottom: 16 }} />
        <Text className="text-[28px] font-bold text-ink-900 mb-2 leading-display-tight">Welcome to{'\n'}Builtglory</Text>
        <Text className="text-[14px] text-ink-500 mb-6">
          {method === 'phone' ? 'Enter your phone number to continue' : 'Enter your email address to continue'}
        </Text>
        <View className="flex-row p-1 bg-ink-100 rounded-xl mb-6">
          {(['phone', 'email'] as const).map((option) => (
            <Pressable
              key={option}
              onPress={() => switchMethod(option)}
              className={`flex-1 min-h-10 py-2 rounded-lg items-center justify-center ${method === option ? 'bg-white' : ''}`}
            >
              <Text className={`text-[13px] font-semibold ${method === option ? 'text-brand-600' : 'text-ink-500'}`}>
                {option === 'phone' ? 'Phone' : 'Email'}
              </Text>
            </Pressable>
          ))}
        </View>
        {method === 'phone' ? (
          <Field label="Phone Number" required>
            <View className="relative">
              <Input
                icon={undefined}
                prefix="+91"
                keyboardType="numeric"
                maxLength={10}
                value={phone}
                onChangeText={(v) => {
                  setPhone(v.replace(/\D/g, ''));
                  setSendError(null);
                }}
                placeholder="98765 43210"
              />
            </View>
            <Text className="mt-1.5 text-[11px] text-ink-500">We'll send you a 6-digit OTP via SMS</Text>
          </Field>
        ) : (
          <Field label="Email Address" required>
            <Input
              icon="mail"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                setSendError(null);
              }}
              placeholder="you@example.com"
            />
            <Text className="mt-1.5 text-[11px] text-ink-500">We'll send you a 6-digit OTP via email</Text>
          </Field>
        )}
        {sendError && (
          <ShakeView trigger={sendError}>
          <View className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-card flex-row items-center gap-2">
            <Icon name="alert-circle" size={14} color="#E11D48" />
            <Text className="text-[12px] text-rose-700">{sendError}</Text>
          </View>
          </ShakeView>
        )}
        <PressableScale
          onPress={handleSend}
          disabled={!valid || sending}
          className={`w-full min-h-12 py-3 mt-6 rounded-xl items-center justify-center flex-row gap-2 ${valid && !sending ? 'bg-brand-600' : 'bg-ink-100'}`}
        >
          {sending && <Spinner color="#94A3B8" size={16} />}
          <Text className={`font-semibold text-[15px] ${valid && !sending ? 'text-white' : 'text-ink-400'}`}>
            {sending ? 'Sending OTP…' : 'Send OTP'}
          </Text>
        </PressableScale>
        <View className="mt-8 flex-row flex-wrap items-center justify-center px-2">
          <Text className="text-[12px] text-ink-500 leading-5 text-center">By continuing, you agree to our </Text>
          <Pressable onPress={() => go('termsOfUse')} className="border-b border-brand-600 pb-0.5">
            <Text className="text-[12px] text-brand-600 leading-5">Terms of Use</Text>
          </Pressable>
          <Text className="text-[12px] text-ink-500 leading-5 text-center"> and </Text>
          <Pressable onPress={() => go('privacyPolicy')} className="border-b border-brand-600 pb-0.5">
            <Text className="text-[12px] text-brand-600 leading-5">Privacy Policy</Text>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

// ─── S-04 OTP ────────────────────────────────────────────────
export function OTPScreen() {
  const { back, resetTo, ctx } = useNav<{
    otpMethod?: OtpMethod;
    countryCode?: string;
    phone?: string;
    email?: string;
    otpRequestId?: string;
    otpExpiresInSeconds?: number;
    otpCanResendAt?: string;
  }>();
  const { signIn } = useAppState();
  const otpMethod: OtpMethod = ctx.otpMethod ?? (ctx.email ? 'email' : 'phone');
  const [digits, setDigits] = useState(Array(OTP_DIGIT_COUNT).fill(''));
  const [expiresSeconds, setExpiresSeconds] = useState(
    typeof ctx.otpExpiresInSeconds === 'number' ? ctx.otpExpiresInSeconds : 300
  );
  const [resendSeconds, setResendSeconds] = useState(secondsUntil(ctx.otpCanResendAt, 60));
  const [otpState, setOtpState] = useState<'idle' | 'error' | 'success'>('idle');
  const [otpErrorMessage, setOtpErrorMessage] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [requestId, setRequestId] = useState(ctx.otpRequestId);
  const otpInputRef = useRef<TextInput | null>(null);
  const countryCode = ctx.countryCode || '+91';
  const phone = ctx.phone || '';
  const email = ctx.email || '';
  const code = digits.join('');
  const identifierReady = otpMethod === 'email' ? !!email : !!phone;
  const otpExpired = expiresSeconds <= 0;

  useEffect(() => {
    if (expiresSeconds === 0) return;
    const t = setTimeout(() => setExpiresSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [expiresSeconds]);

  useEffect(() => {
    if (resendSeconds === 0) return;
    const t = setTimeout(() => setResendSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendSeconds]);

  useEffect(() => {
    const t = setTimeout(() => otpInputRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, []);

  const setOtpCode = (value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(0, OTP_DIGIT_COUNT);
    setDigits(Array.from({ length: OTP_DIGIT_COUNT }, (_, index) => cleaned[index] || ''));
    setOtpState('idle');
    setOtpErrorMessage(null);
  };
  const filled = digits.every((d) => d);
  const verify = async () => {
    if (!filled || verifying || !identifierReady) return;
    if (otpExpired) {
      setOtpState('error');
      setOtpErrorMessage('This OTP has expired. Please request a new one.');
      return;
    }
    setVerifying(true);
    setOtpState('idle');
    setOtpErrorMessage(null);
    try {
      const session = otpMethod === 'email'
        ? await verifyEmailOtp({ email, otp: code, requestId })
        : await verifyCustomerOtp({ countryCode, phone, otp: code, requestId });
      setOtpState('success');
      setTimeout(async () => {
        try {
          const user = await signIn(session);
          resetTo(nextAuthenticatedRoute(user));
        } catch {
          setOtpState('error');
          setOtpErrorMessage('Could not complete sign in. Please try again.');
          setVerifying(false);
        }
      }, 1200);
    } catch (error) {
      setOtpState('error');
      setOtpErrorMessage(otpVerifyErrorMessage(error));
      setTimeout(() => {
        setDigits(Array(OTP_DIGIT_COUNT).fill(''));
        setOtpState('idle');
        setOtpErrorMessage(null);
        setVerifying(false);
        otpInputRef.current?.focus();
      }, 2000);
    }
  };

  const applyOtpRequest = (otpRequest: {
    requestId: string;
    expiresInSeconds: number;
    canResendAt: string;
  }) => {
    setRequestId(otpRequest.requestId);
    setExpiresSeconds(otpRequest.expiresInSeconds || 300);
    setResendSeconds(secondsUntil(otpRequest.canResendAt, 60));
    setDigits(Array(OTP_DIGIT_COUNT).fill(''));
    setOtpState('idle');
    setOtpErrorMessage(null);
    otpInputRef.current?.focus();
  };

  const resend = async () => {
    if (resendSeconds > 0 || resending || !identifierReady) return;
    setResending(true);
    setOtpState('idle');
    setOtpErrorMessage(null);
    try {
      if (otpMethod === 'email') {
        const otpRequest = await resendEmailOtp(email);
        applyOtpRequest(otpRequest);
      } else {
        const otpRequest = await sendCustomerOtp(phone, countryCode);
        applyOtpRequest(otpRequest);
      }
    } catch (error) {
      setOtpState('error');
      setOtpErrorMessage(otpSendErrorMessage(error));
    } finally {
      setResending(false);
    }
  };

  if (otpState === 'success') {
    return (
      <View className="flex-1 bg-white items-center justify-center gap-4">
        <SuccessBurst />
        <Text className="text-[22px] font-bold text-ink-900">Verified!</Text>
        <Text className="text-ink-500 text-[14px]">Setting up your profile…</Text>
      </View>
    );
  }

  const destinationLabel = otpMethod === 'email'
    ? email || 'your email'
    : `${countryCode} ${phone || 'your phone'}`;

  return (
    <Screen>
      <TopBar onBack={back} title="Verify OTP" />
      <View className="px-6">
        <Text className="text-ink-500 text-[14px] text-center mb-2">
          Enter the 6-digit code sent to{' '}
          <Text className="font-semibold text-ink-900">{destinationLabel}</Text>
        </Text>
        <Text className={`text-[12px] text-center mb-8 ${otpExpired ? 'text-rose-500' : 'text-ink-400'}`}>
          {otpExpired ? 'OTP expired' : `Expires in ${formatOtpCountdown(expiresSeconds)}`}
        </Text>
        <Pressable onPress={() => otpInputRef.current?.focus()} className="flex-row justify-between gap-2 mb-5">
          <TextInput
            ref={otpInputRef}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete={otpMethod === 'email' ? 'one-time-code' : 'sms-otp'}
            importantForAutofill="yes"
            maxLength={OTP_DIGIT_COUNT}
            value={code}
            onChangeText={setOtpCode}
            editable={!verifying && !otpExpired}
            caretHidden
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              zIndex: 1,
              opacity: 0.01,
              color: 'transparent',
              backgroundColor: 'transparent',
            }}
          />
          <ShakeView trigger={otpState === 'error' ? code || 'otp-error' : ''} className="flex-row justify-between gap-2 flex-1">
          {digits.map((d, i) => (
            <View
              key={i}
              className={`w-12 min-h-[60px] py-2.5 rounded-card border-2 items-center justify-center ${
                otpState === 'error' ? 'border-rose-500 bg-rose-50' : d ? 'border-brand-600' : 'border-ink-200'
              }`}
            >
              <Text className={`text-2xl font-bold ${otpState === 'error' ? 'text-rose-600' : 'text-ink-900'}`}>{d}</Text>
            </View>
          ))}
          </ShakeView>
        </Pressable>
        {otpState === 'error' && otpErrorMessage && (
          <Text className="text-rose-500 text-[13px] text-center mb-4">{otpErrorMessage}</Text>
        )}
        <View className="flex-row items-center justify-between mb-6">
          <Text className="text-ink-500 text-[13px]">
            {resendSeconds > 0 ? `Resend in ${formatOtpCountdown(resendSeconds)}` : 'You can resend now'}
          </Text>
          <Pressable
            disabled={resendSeconds > 0 || resending || !identifierReady}
            onPress={resend}
          >
            <Text className={`font-semibold text-[13px] ${resendSeconds > 0 || resending || !identifierReady ? 'text-ink-300' : 'text-brand-600'}`}>
              {resending ? 'Sending...' : 'Resend OTP'}
            </Text>
          </Pressable>
        </View>
        <PressableScale
          onPress={verify}
          disabled={!filled || verifying || !identifierReady || otpExpired}
          className={`w-full min-h-12 py-3 rounded-xl items-center justify-center flex-row gap-2 ${filled && !verifying && identifierReady && !otpExpired ? 'bg-brand-600' : 'bg-ink-100'}`}
        >
          {verifying && <Spinner color="#94A3B8" size={16} />}
          <Text className={`font-semibold text-[15px] ${filled && !verifying && identifierReady && !otpExpired ? 'text-white' : 'text-ink-400'}`}>
            {verifying ? 'Verifying…' : 'Verify OTP'}
          </Text>
        </PressableScale>
      </View>
    </Screen>
  );
}

// ─── S-05 Create Profile ─────────────────────────────────────
export function ProfileSetupScreen() {
  const { go, back } = useNav();
  const { authToken, currentUser, refreshCurrentUser, updateProfile } = useAppState();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarState, setAvatarState] = useState<'empty' | 'uploading' | 'done' | 'error'>('empty');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const verifiedPhone = typeof currentUser?.phone === 'string'
    ? currentUser.phone
    : typeof currentUser?.mobileNumber === 'string'
      ? currentUser.mobileNumber
      : '';
  const hasVerifiedPhone = !!verifiedPhone;
  const hasVerifiedEmail = currentUser?.isEmailVerified === true || (!!currentUser?.email && !hasVerifiedPhone);
  const phoneDigits = phone.replace(/\D/g, '').slice(-10);
  const valid = name.trim().length >= 2 && (hasVerifiedPhone || phoneDigits.length === 10);

  useEffect(() => {
    let mounted = true;
    const loadProfile = async () => {
      setLoadingProfile(true);
      setProfileError(null);
      try {
        const user = currentUser ?? await refreshCurrentUser();
        if (!mounted || !user) return;
        setName(typeof user.name === 'string' ? user.name : '');
        setEmail(typeof user.email === 'string' ? user.email : '');
        setPhone(typeof user.phone === 'string' ? user.phone : typeof user.mobileNumber === 'string' ? user.mobileNumber : '');
        if (typeof user.profilePhoto === 'string' && user.profilePhoto) {
          setAvatarUri(user.profilePhoto);
          setAvatarState('done');
        }
      } catch {
        if (mounted) setProfileError('Could not load your profile. You can still try saving your details.');
      } finally {
        if (mounted) setLoadingProfile(false);
      }
    };

    loadProfile();
    return () => {
      mounted = false;
    };
  }, [currentUser, refreshCurrentUser]);

  const handleAvatarTap = async () => {
    if (avatarState === 'uploading') return;
    if (!authToken || !currentUser) {
      setProfileError('Please sign in again before uploading a profile photo.');
      return;
    }
    setAvatarState('uploading');
    setProfileError(null);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setAvatarState(avatarUri ? 'done' : 'empty');
        setProfileError('Photo library permission is required to upload a profile photo.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]) {
        setAvatarState(avatarUri ? 'done' : 'empty');
        return;
      }
      const asset = result.assets[0];
      const extension = (asset.mimeType || '').split('/')[1] || asset.uri.split('.').pop() || 'jpg';
      const uploaded = await uploadCustomerDocument(authToken, {
        ownerType: 'user',
        ownerId: String(currentUser.id ?? currentUser._id ?? ''),
        purpose: 'property_media',
        documentType: 'profile_photo',
        file: {
          uri: asset.uri,
          name: asset.fileName?.trim() || `profile-photo.${extension}`,
          type: asset.mimeType || `image/${extension}`,
        },
      });
      const nextUri = uploaded.url || asset.uri;
      await updateProfile({ profilePhoto: nextUri });
      setAvatarUri(nextUri);
      setAvatarState('done');
    } catch {
      setAvatarState('error');
      setProfileError('Could not upload your profile photo. Please try again.');
    }
  };
  const handleContinue = async () => {
    if (!valid || savingProfile) return;
    setSavingProfile(true);
    setProfileError(null);
    try {
      const payload: {
        name: string;
        email?: string | null;
        phone?: string | null;
        mobileNumber?: string | null;
        phoneNormalized?: string | null;
      } = {
        name: name.trim(),
      };
      // Never send email:null — Mongo sparse unique indexes treat null as a real value
      // and the second profile save collides with E11000.
      if (!hasVerifiedEmail && email.trim()) {
        payload.email = email.trim().toLowerCase();
      }
      if (!hasVerifiedPhone) {
        payload.phone = phoneDigits;
        payload.mobileNumber = phoneDigits;
        payload.phoneNormalized = `91${phoneDigits}`;
      }
      console.log('[BuiltGlory Profile] saving', {
        apiBaseUrl: CUSTOMER_API_BASE_URL,
        payload,
        hasAuthToken: Boolean(authToken),
      });
      await updateProfile(payload);
      go('locationType');
    } catch (error) {
      console.warn('[BuiltGlory Profile] save failed', {
        apiBaseUrl: CUSTOMER_API_BASE_URL,
        error: error instanceof CustomerApiError
          ? { status: error.status, code: error.code, message: error.message, details: error.details, requestId: error.requestId }
          : error,
      });
      setProfileError(profileSaveErrorMessage(error));
    } finally {
      setSavingProfile(false);
    }
  };
  const avatarBg = { empty: 'bg-ink-100', uploading: 'bg-ink-100', done: 'bg-brand-100', error: 'bg-rose-50' };
  const avatarIconColor = { empty: '#94A3B8', uploading: '#94A3B8', done: '#1A6FFF', error: '#E11D48' };
  const displayEmail = typeof currentUser?.email === 'string' && currentUser.email ? currentUser.email : email;
  return (
    <Screen>
      <TopBar onBack={back} title="Create Profile" />
      <View className="px-6">
        <Text className="text-[13px] text-ink-500 mb-6 text-center">{loadingProfile ? 'Loading your profile...' : 'Set up your basic information'}</Text>
        <View className="items-center mb-6">
          <View className="relative">
            <View className={`w-24 h-24 rounded-full items-center justify-center overflow-hidden ${avatarBg[avatarState]}`}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} className="w-full h-full" resizeMode="cover" />
              ) : (
                <Icon name="user" size={44} color={avatarIconColor[avatarState]} />
              )}
              {avatarState === 'uploading' && (
                <View className="absolute inset-0 rounded-full bg-black/40 items-center justify-center">
                  <Spinner color="white" />
                </View>
              )}
            </View>
            <Pressable
              onPress={handleAvatarTap}
              className={`absolute bottom-0 right-0 w-8 h-8 rounded-full items-center justify-center ${avatarState === 'error' ? 'bg-rose-500' : 'bg-brand-600'}`}
            >
              <Icon name={avatarState === 'error' ? 'rotate-cw' : 'camera'} size={14} color="white" />
            </Pressable>
          </View>
          {avatarState === 'error' && <Text className="mt-2 text-[11.5px] text-rose-500">Upload failed. Tap to retry.</Text>}
        </View>
        <View className="gap-4">
          <Field label="Name" required>
            <Input icon="user" placeholder="Enter your full name" value={name} onChangeText={setName} />
          </Field>
          <Field label="Phone Number" required={!hasVerifiedPhone}>
            {hasVerifiedPhone ? (
              <>
                <View className="flex-row items-center gap-2 min-h-12 py-2.5 px-3 bg-ink-100 border border-ink-200 rounded-card">
                  <Icon name="phone" size={16} color="#94A3B8" />
                  <Text className="flex-1 text-[14px] text-ink-700">{verifiedPhone}</Text>
                  <Icon name="lock" size={14} color="#94A3B8" />
                </View>
                <View className="mt-1.5 flex-row items-center gap-1">
                  <Icon name="check-circle" size={11} color="#10B981" />
                  <Text className="text-[11px] text-emerald-600">Verified</Text>
                </View>
              </>
            ) : (
              <Input
                icon="phone"
                keyboardType="numeric"
                maxLength={10}
                placeholder="98765 43210"
                value={phone}
                onChangeText={(v) => setPhone(v.replace(/\D/g, ''))}
              />
            )}
          </Field>
          <Field label={hasVerifiedEmail ? 'Email' : 'Email (Optional)'}>
            {hasVerifiedEmail ? (
              <>
                <View className="flex-row items-center gap-2 min-h-12 py-2.5 px-3 bg-ink-100 border border-ink-200 rounded-card">
                  <Icon name="mail" size={16} color="#94A3B8" />
                  <Text className="flex-1 text-[14px] text-ink-700">{displayEmail}</Text>
                  <Icon name="lock" size={14} color="#94A3B8" />
                </View>
                <View className="mt-1.5 flex-row items-center gap-1">
                  <Icon name="check-circle" size={11} color="#10B981" />
                  <Text className="text-[11px] text-emerald-600">Verified</Text>
                </View>
              </>
            ) : (
              <Input icon="mail" placeholder="Enter your email" value={email} onChangeText={setEmail} />
            )}
          </Field>
        </View>
        {profileError && (
          <View className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-card flex-row items-center gap-2">
            <Icon name="alert-circle" size={14} color="#E11D48" />
            <Text className="text-[12px] text-rose-700 flex-1">{profileError}</Text>
          </View>
        )}
        <Pressable
          onPress={handleContinue}
          disabled={!valid || savingProfile}
          className={`w-full min-h-12 py-3 mt-6 rounded-xl items-center justify-center flex-row gap-2 ${valid && !savingProfile ? 'bg-brand-600' : 'bg-ink-100'}`}
        >
          {savingProfile && <Spinner color="#94A3B8" size={16} />}
          <Text className={`font-semibold text-[15px] ${valid && !savingProfile ? 'text-white' : 'text-ink-400'}`}>
            {savingProfile ? 'Saving...' : 'Continue'}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

// ─── S-06 Location + User Type ───────────────────────────────
export function LocationUserTypeScreen() {
  const { go, back } = useNav();
  const { updateProfile } = useAppState();
  const [locState, setLocState] = useState<'idle' | 'detecting' | 'granted' | 'failed'>('idle');
  const [detectedLocation, setDetectedLocation] = useState<DetectedLocation | null>(null);
  const [manualCity, setManualCity] = useState('');
  const [type, setType] = useState<'resident' | 'nri' | 'pio'>('resident');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [canOpenSettings, setCanOpenSettings] = useState(false);
  const canContinue = locState === 'granted' || (locState === 'failed' && manualCity.length >= 2);
  const types = [
    { id: 'resident' as const, label: 'Resident', sub: 'Living in India', icon: 'home' },
    { id: 'nri' as const, label: 'NRI', sub: 'Non-Resident Indian', icon: 'plane' },
    { id: 'pio' as const, label: 'PIO', sub: 'Person of Indian Origin', icon: 'globe' },
  ];
  const handleUseCurrentLocation = async () => {
    if (locState === 'detecting') return;
    setLocState('detecting');
    setLocationError(null);
    setCanOpenSettings(false);
    try {
      const location = await fetchCurrentLocation();
      setDetectedLocation(location);
      setLocState('granted');
    } catch (error) {
      setDetectedLocation(null);
      setLocState('failed');
      if (error instanceof LocationFetchError) {
        setLocationError(error.message);
        setCanOpenSettings(error.canOpenSettings);
        return;
      }
      setLocationError('Could not detect your current location. Enter your city manually.');
    }
  };
  const handleOpenSettings = async () => {
    try {
      await openDeviceLocationSettings();
    } catch {
      setLocationError('Unable to open device settings. Enable location for BuiltGlory manually.');
    }
  };
  const handleContinue = async () => {
    if (!canContinue || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateProfile({
        city: locState === 'granted' ? detectedLocation?.city ?? null : manualCity.trim(),
        state: locState === 'granted' ? detectedLocation?.state ?? null : null,
        country: locState === 'granted' ? detectedLocation?.country ?? 'India' : 'India',
        latitude: locState === 'granted' ? detectedLocation?.latitude : undefined,
        longitude: locState === 'granted' ? detectedLocation?.longitude : undefined,
        userType: type,
      });
      go('terms');
    } catch {
      setSaveError('Could not save your location details. Please try again.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <Screen>
      <TopBar onBack={back} title="A few more details" />
      <View className="px-6 gap-5">
        <View>
          <Text className="text-[14px] font-semibold mb-2">Your location</Text>
          {locState !== 'failed' && (
            <Pressable
              onPress={handleUseCurrentLocation}
              disabled={locState === 'detecting'}
              className={`p-4 rounded-card border-2 flex-row items-center gap-3 ${locState === 'granted' ? 'border-brand-600 bg-brand-50' : 'border-dashed border-ink-200'} ${locState === 'detecting' ? 'opacity-70' : ''}`}
            >
              <View className={`w-11 h-11 rounded-full items-center justify-center ${locState === 'granted' ? 'bg-brand-600' : 'bg-ink-100'}`}>
                {locState === 'detecting' ? (
                  <Spinner color="#64748B" size={18} />
                ) : (
                  <Icon name={locState === 'granted' ? 'check' : 'map-pin'} size={18} color={locState === 'granted' ? 'white' : '#64748B'} />
                )}
              </View>
              <View className="flex-1">
                <Text className="text-[14px] font-semibold">{locState === 'detecting' ? 'Detecting your location...' : locationDisplayName(detectedLocation)}</Text>
                <Text className="text-[12px] text-ink-500">
                  {locState === 'granted'
                    ? detectedLocation?.city
                      ? 'Detected via GPS'
                      : `GPS: ${detectedLocation?.latitude.toFixed(5)}, ${detectedLocation?.longitude.toFixed(5)}`
                    : 'Show nearby listings'}
                </Text>
              </View>
            </Pressable>
          )}
          {locState === 'idle' && (
            <Pressable onPress={() => { setDetectedLocation(null); setLocState('failed'); }} className="mt-2">
              <Text className="text-[12px] text-brand-600 font-medium">Enter city manually instead</Text>
            </Pressable>
          )}
          {locState === 'failed' && (
            <View className="gap-2">
              <View className="p-3 bg-amber-50 border border-amber-200 rounded-card flex-row items-start gap-2">
                <Icon name="triangle-alert" size={14} color="#D97706" />
                <Text className="text-[12px] text-amber-800 flex-1">{locationError || "Couldn't detect location. Enter your city manually."}</Text>
              </View>
              {canOpenSettings && (
                <Pressable onPress={handleOpenSettings} className="flex-row items-center gap-1 self-start">
                  <Icon name="settings" size={12} color="#1A6FFF" />
                  <Text className="text-[12px] text-brand-600 font-medium">Open device settings</Text>
                </Pressable>
              )}
              <Input icon="map-pin" placeholder="Type your city…" value={manualCity} onChangeText={setManualCity} />
              <Pressable onPress={() => { setLocState('idle'); setManualCity(''); setDetectedLocation(null); setLocationError(null); setCanOpenSettings(false); }} className="flex-row items-center gap-1">
                <Icon name="arrow-left" size={12} color="#1A6FFF" />
                <Text className="text-[12px] text-brand-600 font-medium">Try GPS again</Text>
              </Pressable>
            </View>
          )}
        </View>
        <View>
          <Text className="text-[14px] font-semibold mb-2">I am a</Text>
          <View className="gap-2">
            {types.map((t) => (
              <Pressable
                key={t.id}
                onPress={() => {
                  setType(t.id);
                  setSaveError(null);
                }}
                className={`p-3 rounded-card border flex-row items-center gap-3 ${type === t.id ? 'border-brand-600 bg-brand-50' : 'border-ink-200'}`}
              >
                <View className={`w-10 h-10 rounded-xl items-center justify-center ${type === t.id ? 'bg-brand-600' : 'bg-ink-100'}`}>
                  <Icon name={t.icon} size={18} color={type === t.id ? 'white' : '#334155'} />
                </View>
                <View className="flex-1">
                  <Text className="text-[14px] font-semibold">{t.label}</Text>
                  <Text className="text-[11.5px] text-ink-500">{t.sub}</Text>
                </View>
                <View className={`w-5 h-5 rounded-full border-2 items-center justify-center ${type === t.id ? 'border-brand-600 bg-brand-600' : 'border-ink-300'}`}>
                  {type === t.id && <View className="w-1.5 h-1.5 rounded-full bg-white" />}
                </View>
              </Pressable>
            ))}
          </View>
        </View>
        {saveError && (
          <View className="p-3 bg-rose-50 border border-rose-200 rounded-card flex-row items-center gap-2">
            <Icon name="alert-circle" size={14} color="#E11D48" />
            <Text className="text-[12px] text-rose-700 flex-1">{saveError}</Text>
          </View>
        )}
        <Pressable
          onPress={handleContinue}
          disabled={!canContinue || saving}
          className={`w-full min-h-12 py-3 rounded-xl items-center justify-center flex-row gap-2 ${canContinue && !saving ? 'bg-brand-600' : 'bg-ink-100'}`}
        >
          {saving && <Spinner color="#94A3B8" size={16} />}
          <Text className={`font-semibold text-[15px] ${canContinue && !saving ? 'text-white' : 'text-ink-400'}`}>
            {saving ? 'Saving...' : 'Continue'}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

// ─── S-07 Terms & Privacy ────────────────────────────────────
export function TermsScreen() {
  const { go, back } = useNav();
  const insets = useSafeAreaInsets();
  const [t1, setT1] = useState(false);
  const [t2, setT2] = useState(false);
  const [t3, setT3] = useState(false);
  const { item: terms, loading: loadingTerms } = useContentItem('terms-of-service', fallbackTermsContent);
  const { item: privacy, loading: loadingPrivacy } = useContentItem('privacy-policy', fallbackPrivacyContent);
  return (
    <Screen>
      <TopBar onBack={back} title="Terms & Privacy" />
      <View className="px-6">
        <View className="bg-ink-50 border border-ink-200 rounded-card p-4">
          <Text className="font-semibold text-ink-900 mb-2 text-[12.5px]">{terms.title}</Text>
          <Text className="text-[12.5px] text-ink-700 leading-relaxed">
            {contentBody(terms)}
            {'\n\n'}{privacy.title}: {contentBody(privacy)}
          </Text>
        </View>
        {(loadingTerms || loadingPrivacy) && <Text className="mt-2 text-[11px] text-ink-500">Loading latest legal copy...</Text>}
        <View className="mt-5 gap-3">
          {[
            [t1, setT1, 'I have read and accept the Terms of Service'],
            [t2, setT2, 'I accept the Privacy Policy and data use'],
            [t3, setT3, 'I consent to receive updates by SMS / Email'],
          ].map(([val, setVal, txt]: any, idx) => (
            <Pressable key={idx} onPress={() => setVal(!val)} className="flex-row items-start gap-3">
              <View className={`mt-0.5 w-5 h-5 rounded-md border-2 items-center justify-center ${val ? 'bg-brand-600 border-brand-600' : 'border-ink-300 bg-white'}`}>
                {val && <Icon name="check" size={12} color="white" strokeWidth={3} />}
              </View>
              <Text className="text-[13px] text-ink-700 flex-1">{txt}</Text>
            </Pressable>
          ))}
        </View>
        <Text className="text-center text-[11px] text-ink-500 mt-4">You must accept Terms and Privacy Policy to proceed.</Text>
      </View>
      <View
        className="absolute bottom-0 left-0 right-0 px-6 pt-3 bg-white border-t border-ink-200"
        style={{ paddingBottom: 12 + insets.bottom }}
      >
        <Pressable
          onPress={() => go('permissions')}
          disabled={!(t1 && t2)}
          className={`w-full min-h-12 py-3 rounded-xl items-center justify-center ${t1 && t2 ? 'bg-brand-600' : 'bg-ink-100'}`}
        >
          <Text className={`font-semibold text-[15px] ${t1 && t2 ? 'text-white' : 'text-ink-400'}`}>Accept & Continue</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

// ─── S-08 App Permissions ────────────────────────────────────
type PermissionRow = {
  id: PermissionId;
  label: string;
  sub: string;
  icon: string;
  required: boolean;
};

const PERMISSION_ROWS: PermissionRow[] = [
  { id: 'loc', label: 'Location', sub: 'Show nearby properties and save your city', icon: 'map-pin', required: true },
  { id: 'cam', label: 'Camera & photos', sub: 'Upload property photos and documents', icon: 'camera', required: true },
  { id: 'noti', label: 'Notifications', sub: 'Get alerts on visits, offers, and updates', icon: 'bell', required: true },
  { id: 'cont', label: 'Contacts', sub: 'Share properties with people from your contacts', icon: 'users', required: false },
];

function permissionStatusColor(status: PermissionStatus) {
  switch (status) {
    case 'granted':
      return 'text-emerald-600';
    case 'blocked':
    case 'denied':
      return 'text-rose-600';
    default:
      return 'text-ink-500';
  }
}

export function PermissionsScreen() {
  const { go, back } = useNav();
  const insets = useSafeAreaInsets();
  const { updateProfile } = useAppState();
  const [statuses, setStatuses] = useState<Record<PermissionId, PermissionStatus>>({
    cam: 'pending',
    loc: 'pending',
    noti: 'pending',
    cont: 'pending',
  });
  const [requesting, setRequesting] = useState<PermissionId | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const refreshStatuses = useCallback(async () => {
    const entries = await Promise.all(
      PERMISSION_ROWS.map(async (permission) => [permission.id, await getPermissionStatus(permission.id)] as const),
    );
    setStatuses(Object.fromEntries(entries) as Record<PermissionId, PermissionStatus>);
  }, []);

  useEffect(() => {
    void refreshStatuses();
  }, [refreshStatuses]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void refreshStatuses();
      }
    });
    return () => subscription.remove();
  }, [refreshStatuses]);

  const requiredHandled = PERMISSION_ROWS
    .filter((permission) => permission.required)
    .every((permission) => statuses[permission.id] !== 'pending');

  const handleAllow = async (id: PermissionId) => {
    if (requesting) return;
    setRequesting(id);
    setSaveError(null);
    try {
      const nextStatus = await requestPermission(id);
      setStatuses((current) => ({ ...current, [id]: nextStatus }));
    } catch {
      setSaveError('Could not request permission. Please try again.');
    } finally {
      setRequesting(null);
    }
  };

  const handleFinish = async () => {
    if (saving || !requiredHandled) return;
    setSaving(true);
    setSaveError(null);
    try {
      const notificationsEnabled = statuses.noti === 'granted';
      await updateProfile({
        notificationPreferences: {
          push: {
            transactional: notificationsEnabled,
            marketing: notificationsEnabled,
          },
        },
      });
      go('home');
    } catch {
      setSaveError('Could not save permission preferences. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <TopBar onBack={back} title="App permissions" />
      <View className="px-6">
        <Text className="text-[13px] text-ink-500 mb-6">
          Allow the required permissions below to finish setup. You can change these anytime in your device settings.
        </Text>
        <View className="gap-3">
          {PERMISSION_ROWS.map((permission) => {
            const status = statuses[permission.id];
            const isRequesting = requesting === permission.id;
            const showAllow = status !== 'granted' && status !== 'blocked';
            const showSettings = status === 'blocked';

            return (
              <View key={permission.id} className="p-3 rounded-card border border-ink-200">
                <View className="flex-row items-center gap-3">
                  <View className="w-11 h-11 rounded-xl bg-brand-50 items-center justify-center">
                    <Icon name={permission.icon} size={20} color="#1A6FFF" />
                  </View>
                  <View className="flex-1 min-w-0">
                    <View className="flex-row items-center gap-1.5 flex-wrap">
                      <Text className="text-[14px] font-semibold">{permission.label}</Text>
                      <View className={`px-1.5 py-0.5 rounded-full ${permission.required ? 'bg-rose-100' : 'bg-ink-100'}`}>
                        <Text className={`text-[9px] font-bold ${permission.required ? 'text-rose-600' : 'text-ink-500'}`}>
                          {permission.required ? 'Required' : 'Optional'}
                        </Text>
                      </View>
                    </View>
                    <Text className="text-[11.5px] text-ink-500 mt-0.5">{permission.sub}</Text>
                    <Text className={`text-[10.5px] font-semibold mt-1 ${permissionStatusColor(status)}`}>
                      {permissionStatusLabel(status)}
                    </Text>
                  </View>
                  {status === 'granted' ? (
                    <View className="w-9 h-9 rounded-full bg-emerald-50 items-center justify-center">
                      <Icon name="check" size={16} color="#059669" strokeWidth={3} />
                    </View>
                  ) : showSettings ? (
                    <Pressable
                      onPress={() => void openAppSettings()}
                      className="px-3 min-h-9 py-2 rounded-lg bg-ink-100 items-center justify-center"
                    >
                      <Text className="text-[11.5px] font-semibold text-ink-700">Settings</Text>
                    </Pressable>
                  ) : showAllow ? (
                    <Pressable
                      onPress={() => void handleAllow(permission.id)}
                      disabled={isRequesting}
                      className={`px-3 min-h-9 py-2 rounded-lg items-center justify-center flex-row gap-1.5 ${isRequesting ? 'bg-brand-100' : 'bg-brand-600'}`}
                    >
                      {isRequesting && <Spinner color="#1A6FFF" size={14} />}
                      <Text className={`text-[11.5px] font-semibold ${isRequesting ? 'text-brand-700' : 'text-white'}`}>
                        {isRequesting ? 'Requesting' : 'Allow'}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
        {saveError && (
          <View className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-card flex-row items-center gap-2">
            <Icon name="alert-circle" size={14} color="#E11D48" />
            <Text className="text-[12px] text-rose-700 flex-1">{saveError}</Text>
          </View>
        )}
        {!requiredHandled && (
          <Text className="text-center text-[11px] text-ink-500 mt-4">
            Tap Allow on each required permission to continue.
          </Text>
        )}
      </View>
      <View
        className="absolute bottom-0 left-0 right-0 px-6 pt-3 bg-white border-t border-ink-200"
        style={{ paddingBottom: 12 + insets.bottom }}
      >
        <Pressable
          onPress={() => void handleFinish()}
          disabled={saving || !requiredHandled}
          className={`w-full min-h-12 py-3 rounded-xl items-center justify-center flex-row gap-2 ${saving || !requiredHandled ? 'bg-ink-100' : 'bg-brand-600'}`}
        >
          {saving && <Spinner color="#94A3B8" size={16} />}
          <Text className={`font-semibold text-[15px] ${saving || !requiredHandled ? 'text-ink-400' : 'text-white'}`}>
            {saving ? 'Saving...' : 'Finish Setup'}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}
