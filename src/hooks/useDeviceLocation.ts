import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { LocationSubscription } from 'expo-location';
import {
  DetectedLocation,
  LocationFetchError,
  LocationPermissionUiState,
  LocationServicesUiState,
  fetchCurrentLocation,
  getLocationPermissionState,
  getLocationServicesState,
  openDeviceLocationSettings,
  openLocationServicesSettings,
  requestLocationPermission,
  reverseGeocodeCoordinates,
  watchDeviceLocation,
} from '../utils/location';

type UseDeviceLocationOptions = {
  autoDetect?: boolean;
  watch?: boolean;
};

export function useDeviceLocation(options: UseDeviceLocationOptions = {}) {
  const { autoDetect = true, watch = false } = options;
  const [permission, setPermission] = useState<LocationPermissionUiState>('not_requested');
  const [services, setServices] = useState<LocationServicesUiState>('unknown');
  const [location, setLocation] = useState<DetectedLocation | null>(null);
  const [loading, setLoading] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorReason, setErrorReason] = useState<LocationFetchError['reason'] | null>(null);
  const [canOpenSettings, setCanOpenSettings] = useState(false);
  const watchSubRef = useRef<LocationSubscription | null>(null);
  const mountedRef = useRef(true);
  const loadingRef = useRef(false);
  const reverseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyError = useCallback((err: unknown) => {
    if (err instanceof LocationFetchError) {
      setError(err.message);
      setErrorReason(err.reason);
      setCanOpenSettings(err.canOpenSettings);
      return;
    }
    setError('Could not detect your current location.');
    setErrorReason('unavailable');
    setCanOpenSettings(false);
  }, []);

  const refreshStatus = useCallback(async () => {
    const [nextPermission, nextServices] = await Promise.all([
      getLocationPermissionState(),
      getLocationServicesState(),
    ]);
    if (!mountedRef.current) return { permission: nextPermission, services: nextServices };
    setPermission(nextPermission);
    setServices(nextServices);
    return { permission: nextPermission, services: nextServices };
  }, []);

  const detect = useCallback(async () => {
    if (loadingRef.current) return null;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    setErrorReason(null);
    setCanOpenSettings(false);
    try {
      await refreshStatus();
      const next = await fetchCurrentLocation();
      if (!mountedRef.current) return next;
      setLocation(next);
      setPermission('granted');
      setServices('enabled');
      return next;
    } catch (err) {
      if (mountedRef.current) {
        applyError(err);
        await refreshStatus();
      }
      return null;
    } finally {
      loadingRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }, [applyError, refreshStatus]);

  const stopTracking = useCallback(() => {
    if (reverseTimerRef.current) {
      clearTimeout(reverseTimerRef.current);
      reverseTimerRef.current = null;
    }
    watchSubRef.current?.remove();
    watchSubRef.current = null;
    setTracking(false);
  }, []);

  const startTracking = useCallback(async () => {
    if (watchSubRef.current) return;
    try {
      const subscription = await watchDeviceLocation(
        (position) => {
          if (!mountedRef.current) return;
          const latitude = position.coords.latitude;
          const longitude = position.coords.longitude;
          setLocation((current) => ({
            latitude,
            longitude,
            city: current?.city ?? null,
            state: current?.state ?? null,
            country: current?.country ?? 'India',
            street: current?.street ?? null,
            locality: current?.locality ?? null,
            postalCode: current?.postalCode ?? null,
            formattedAddress: current?.formattedAddress ?? null,
          }));
          if (reverseTimerRef.current) clearTimeout(reverseTimerRef.current);
          reverseTimerRef.current = setTimeout(() => {
            reverseGeocodeCoordinates(latitude, longitude)
              .then((resolved) => {
                if (mountedRef.current) setLocation(resolved);
              })
              .catch(() => undefined);
          }, 900);
        },
        (err) => {
          if (mountedRef.current) applyError(err);
        },
      );
      if (!mountedRef.current) {
        subscription.remove();
        return;
      }
      watchSubRef.current = subscription;
      setTracking(true);
      setPermission('granted');
      setServices('enabled');
      setError(null);
    } catch (err) {
      applyError(err);
      await refreshStatus();
    }
  }, [applyError, refreshStatus]);

  const requestPermission = useCallback(async () => {
    const next = await requestLocationPermission();
    if (mountedRef.current) setPermission(next);
    return next;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    const bootstrap = async () => {
      await refreshStatus();
      if (cancelled || !autoDetect) return;
      await detect();
      if (cancelled || !watch) return;
      await startTracking();
    };

    bootstrap().catch(() => undefined);

    const onAppState = (state: AppStateStatus) => {
      if (state === 'active') refreshStatus().catch(() => undefined);
    };
    const appSub = AppState.addEventListener('change', onAppState);

    return () => {
      cancelled = true;
      mountedRef.current = false;
      appSub.remove();
      stopTracking();
    };
    // Bootstrap once on mount; detect/startTracking are stable enough for this screen lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoDetect, watch]);

  return {
    permission,
    services,
    location,
    loading,
    tracking,
    error,
    errorReason,
    canOpenSettings,
    detect,
    startTracking,
    stopTracking,
    requestPermission,
    refreshStatus,
    setLocation,
    openSettings: openDeviceLocationSettings,
    openLocationSettings: openLocationServicesSettings,
  };
}
