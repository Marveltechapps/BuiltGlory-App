import { Linking, Platform } from 'react-native';
import * as Location from 'expo-location';

export type DetectedLocation = {
  latitude: number;
  longitude: number;
  city: string | null;
  state: string | null;
  country: string | null;
};

export type LocationFetchFailureReason =
  | 'permission_denied'
  | 'permission_blocked'
  | 'services_disabled'
  | 'timeout'
  | 'unavailable';

export class LocationFetchError extends Error {
  readonly reason: LocationFetchFailureReason;
  readonly canOpenSettings: boolean;

  constructor(reason: LocationFetchFailureReason, message: string, canOpenSettings = false) {
    super(message);
    this.name = 'LocationFetchError';
    this.reason = reason;
    this.canOpenSettings = canOpenSettings;
  }
}

const LOCATION_TIMEOUT_MS = 20_000;
const LAST_KNOWN_MAX_AGE_MS = 120_000;
const LAST_KNOWN_REQUIRED_ACCURACY_M = 1_000;

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => LocationFetchError): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(onTimeout()), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function ensureForegroundPermission(): Promise<void> {
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return;

  const requested = await Location.requestForegroundPermissionsAsync();
  if (requested.granted) return;

  if (requested.canAskAgain === false) {
    throw new LocationFetchError(
      'permission_blocked',
      'Location access is blocked. Open Settings and allow location for BuiltGlory.',
      true,
    );
  }

  throw new LocationFetchError(
    'permission_denied',
    'Location permission is required to use your current location.',
  );
}

async function ensureLocationServicesReady(): Promise<void> {
  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) {
    throw new LocationFetchError(
      'services_disabled',
      'Location services are turned off. Enable GPS or device location and try again.',
      true,
    );
  }

  if (Platform.OS !== 'android') return;

  const providerStatus = await Location.getProviderStatusAsync();
  if (!providerStatus.locationServicesEnabled) {
    throw new LocationFetchError(
      'services_disabled',
      'Location services are turned off. Enable GPS or device location and try again.',
      true,
    );
  }

  if (!providerStatus.gpsAvailable && !providerStatus.networkAvailable) {
    try {
      await Location.enableNetworkProviderAsync();
    } catch {
      throw new LocationFetchError(
        'services_disabled',
        'No location providers are available. Turn on GPS or high-accuracy location mode and try again.',
        true,
      );
    }
  }
}

async function readDevicePosition(): Promise<Location.LocationObject> {
  const lastKnown = await Location.getLastKnownPositionAsync({
    maxAge: LAST_KNOWN_MAX_AGE_MS,
    requiredAccuracy: LAST_KNOWN_REQUIRED_ACCURACY_M,
  });
  if (lastKnown) return lastKnown;

  return withTimeout(
    Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
      mayShowUserSettingsDialog: true,
      timeInterval: 1_000,
    }),
    LOCATION_TIMEOUT_MS,
    () =>
      new LocationFetchError(
        'timeout',
        'Location detection timed out. Move to an open area with GPS signal or enter your city manually.',
      ),
  );
}

function addressFromGeocode(address?: Location.LocationGeocodedAddress | null) {
  return {
    city: address?.city || address?.district || address?.subregion || address?.name || null,
    state: address?.region || null,
    country: address?.country || 'India',
  };
}

export function locationDisplayName(location: DetectedLocation | null) {
  if (!location) return 'Use my current location';
  const address = [location.city, location.state].filter(Boolean).join(', ');
  if (address) return address;
  return `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`;
}

export async function openDeviceLocationSettings() {
  await Linking.openSettings();
}

export async function fetchCurrentLocation(): Promise<DetectedLocation> {
  await ensureForegroundPermission();
  await ensureLocationServicesReady();

  let position: Location.LocationObject;
  try {
    position = await readDevicePosition();
  } catch (error) {
    if (error instanceof LocationFetchError) throw error;

    const servicesEnabled = await Location.hasServicesEnabledAsync();
    if (!servicesEnabled) {
      throw new LocationFetchError(
        'services_disabled',
        'Location services are turned off. Enable GPS or device location and try again.',
        true,
      );
    }

    throw new LocationFetchError(
      'unavailable',
      'Could not detect your current location. Try again or enter your city manually.',
    );
  }

  const coords = {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  };

  const [address] = await Location.reverseGeocodeAsync(coords).catch(() => []);
  const parsed = addressFromGeocode(address);

  return {
    ...coords,
    city: parsed.city,
    state: parsed.state,
    country: parsed.country,
  };
}
