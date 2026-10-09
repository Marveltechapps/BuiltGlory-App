import { Linking, Platform } from 'react-native';
import * as Location from 'expo-location';
import { getGoogleMapsApiKey } from '../config/maps';

export type DetectedLocation = {
  latitude: number;
  longitude: number;
  city: string | null;
  state: string | null;
  country: string | null;
  street?: string | null;
  locality?: string | null;
  postalCode?: string | null;
  formattedAddress?: string | null;
};

export type LocationPermissionUiState =
  | 'not_requested'
  | 'granted'
  | 'denied'
  | 'permanently_denied';

export type LocationServicesUiState = 'unknown' | 'enabled' | 'disabled';

export type LocationFetchFailureReason =
  | 'permission_denied'
  | 'permission_blocked'
  | 'services_disabled'
  | 'timeout'
  | 'unavailable'
  | 'no_signal'
  | 'invalid_coordinates'
  | 'network'
  | 'geocode_failed';

export type PlaceSuggestion = {
  id: string;
  title: string;
  subtitle: string;
  latitude?: number;
  longitude?: number;
  placeId?: string;
};

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
const SEARCH_TIMEOUT_MS = 12_000;
const DEFAULT_CAMERA_DELTA = 0.012;

/** Camera-only fallback while GPS is resolving. Never treated as the user's location. */
export const FALLBACK_CAMERA_REGION = {
  latitude: 20.5937,
  longitude: 78.9629,
  latitudeDelta: 18,
  longitudeDelta: 18,
};

export function isValidCoordinate(latitude?: number | null, longitude?: number | null) {
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    !(latitude === 0 && longitude === 0)
  );
}

export function regionFromCoordinate(
  latitude: number,
  longitude: number,
  delta = DEFAULT_CAMERA_DELTA,
) {
  return {
    latitude,
    longitude,
    latitudeDelta: delta,
    longitudeDelta: delta,
  };
}

export function formatCoordinates(latitude: number, longitude: number) {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

export function distanceMeters(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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

function isNetworkFailure(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || '').toLowerCase();
  return (
    message.includes('network') ||
    message.includes('internet') ||
    message.includes('offline') ||
    message.includes('failed to fetch') ||
    message.includes('timeout')
  );
}

export async function getLocationPermissionState(): Promise<LocationPermissionUiState> {
  try {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.granted) return 'granted';
    if (current.status === Location.PermissionStatus.UNDETERMINED) return 'not_requested';
    if (current.canAskAgain === false) return 'permanently_denied';
    return 'denied';
  } catch {
    return 'not_requested';
  }
}

export async function requestLocationPermission(): Promise<LocationPermissionUiState> {
  try {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.granted) return 'granted';

    const requested = await Location.requestForegroundPermissionsAsync();
    if (requested.granted) return 'granted';
    if (requested.status === Location.PermissionStatus.UNDETERMINED) return 'not_requested';
    if (requested.canAskAgain === false) return 'permanently_denied';
    return 'denied';
  } catch {
    return 'denied';
  }
}

export async function getLocationServicesState(): Promise<LocationServicesUiState> {
  try {
    const servicesEnabled = await Location.hasServicesEnabledAsync();
    if (!servicesEnabled) return 'disabled';

    if (Platform.OS === 'android') {
      const providerStatus = await Location.getProviderStatusAsync();
      if (!providerStatus.locationServicesEnabled) return 'disabled';
      if (!providerStatus.gpsAvailable && !providerStatus.networkAvailable) return 'disabled';
    }

    return 'enabled';
  } catch {
    return 'unknown';
  }
}

export function permissionMessage(state: LocationPermissionUiState) {
  switch (state) {
    case 'not_requested':
      return 'Allow location access so BuiltGlory can show your position on the map.';
    case 'denied':
      return 'Location permission is required to use your current location.';
    case 'permanently_denied':
      return 'Location access is blocked. Open Settings and allow location for BuiltGlory.';
    default:
      return '';
  }
}

export function servicesDisabledMessage() {
  return 'Location services are turned off. Enable GPS or device location and try again.';
}

async function ensureForegroundPermission(): Promise<void> {
  const state = await requestLocationPermission();
  if (state === 'granted') return;

  if (state === 'permanently_denied') {
    throw new LocationFetchError(
      'permission_blocked',
      permissionMessage(state),
      true,
    );
  }

  throw new LocationFetchError(
    'permission_denied',
    permissionMessage(state),
    state === 'denied',
  );
}

async function ensureLocationServicesReady(): Promise<void> {
  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) {
    throw new LocationFetchError('services_disabled', servicesDisabledMessage(), true);
  }

  if (Platform.OS !== 'android') return;

  const providerStatus = await Location.getProviderStatusAsync();
  if (!providerStatus.locationServicesEnabled) {
    throw new LocationFetchError('services_disabled', servicesDisabledMessage(), true);
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
  if (lastKnown && isValidCoordinate(lastKnown.coords.latitude, lastKnown.coords.longitude)) {
    return lastKnown;
  }

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
        'Location detection timed out. Move to an open area with GPS signal or enter the address manually.',
      ),
  );
}

function compactAddress(parts: Array<string | null | undefined>) {
  return parts.map((part) => part?.trim()).filter(Boolean).join(', ');
}

function addressFromGeocode(address?: Location.LocationGeocodedAddress | null): Omit<DetectedLocation, 'latitude' | 'longitude'> {
  const street = compactAddress([address?.streetNumber, address?.street]) || address?.name || null;
  const locality = address?.district || address?.subregion || address?.city || null;
  const city = address?.city || address?.district || address?.subregion || address?.name || null;
  const state = address?.region || null;
  const country = address?.country || 'India';
  const postalCode = address?.postalCode || null;
  const formattedAddress =
    compactAddress([street, locality, city, state, postalCode, country]) || null;

  return {
    street,
    locality,
    city,
    state,
    country,
    postalCode,
    formattedAddress,
  };
}

function addressFromGoogleComponents(result: {
  formatted_address?: string;
  address_components?: Array<{ long_name?: string; types?: string[] }>;
}): Omit<DetectedLocation, 'latitude' | 'longitude'> {
  const components = result.address_components ?? [];
  const find = (...types: string[]) =>
    components.find((component) => types.some((type) => component.types?.includes(type)))?.long_name || null;

  const streetNumber = find('street_number');
  const route = find('route');
  const street = compactAddress([streetNumber, route]) || find('premise') || find('establishment');
  const locality =
    find('sublocality_level_1', 'sublocality', 'neighborhood') ||
    find('locality');
  const city = find('locality', 'administrative_area_level_2', 'postal_town') || locality;
  const state = find('administrative_area_level_1');
  const country = find('country') || 'India';
  const postalCode = find('postal_code');

  return {
    street,
    locality,
    city,
    state,
    country,
    postalCode,
    formattedAddress: result.formatted_address || compactAddress([street, locality, city, state, postalCode, country]),
  };
}

async function reverseGeocodeWithGoogle(latitude: number, longitude: number): Promise<Omit<DetectedLocation, 'latitude' | 'longitude'> | null> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) return null;

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(`${latitude},${longitude}`)}&key=${encodeURIComponent(apiKey)}`;
    const response = await withTimeout(
      fetch(url),
      SEARCH_TIMEOUT_MS,
      () => new LocationFetchError('timeout', 'Address lookup timed out.'),
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      status?: string;
      results?: Array<{ formatted_address?: string; address_components?: Array<{ long_name?: string; types?: string[] }> }>;
    };
    if (payload.status !== 'OK' || !payload.results?.[0]) return null;
    return addressFromGoogleComponents(payload.results[0]);
  } catch {
    return null;
  }
}

export async function reverseGeocodeCoordinates(latitude: number, longitude: number): Promise<DetectedLocation> {
  if (!isValidCoordinate(latitude, longitude)) {
    throw new LocationFetchError('invalid_coordinates', 'The selected map coordinates are invalid.');
  }

  const coords = { latitude, longitude };
  let parsed: Omit<DetectedLocation, 'latitude' | 'longitude'> | null = null;

  try {
    const [address] = await Location.reverseGeocodeAsync(coords);
    parsed = addressFromGeocode(address);
  } catch (error) {
    if (isNetworkFailure(error)) {
      parsed = await reverseGeocodeWithGoogle(latitude, longitude);
      if (!parsed) {
        return {
          ...coords,
          city: null,
          state: null,
          country: 'India',
          street: null,
          locality: null,
          postalCode: null,
          formattedAddress: formatCoordinates(latitude, longitude),
        };
      }
    }
  }

  if (!parsed?.formattedAddress || !parsed.city) {
    const googleParsed = await reverseGeocodeWithGoogle(latitude, longitude);
    if (googleParsed) {
      parsed = {
        street: parsed?.street || googleParsed.street,
        locality: parsed?.locality || googleParsed.locality,
        city: parsed?.city || googleParsed.city,
        state: parsed?.state || googleParsed.state,
        country: parsed?.country || googleParsed.country,
        postalCode: parsed?.postalCode || googleParsed.postalCode,
        formattedAddress: parsed?.formattedAddress || googleParsed.formattedAddress,
      };
    }
  }

  return {
    ...coords,
    city: parsed?.city ?? null,
    state: parsed?.state ?? null,
    country: parsed?.country ?? 'India',
    street: parsed?.street ?? null,
    locality: parsed?.locality ?? null,
    postalCode: parsed?.postalCode ?? null,
    formattedAddress: parsed?.formattedAddress || formatCoordinates(latitude, longitude),
  };
}

export function locationDisplayName(location: DetectedLocation | null) {
  if (!location) return 'Use my current location';
  const address = location.formattedAddress || compactAddress([location.locality, location.city, location.state]);
  if (address) return address;
  return formatCoordinates(location.latitude, location.longitude);
}

export async function openDeviceLocationSettings() {
  await Linking.openSettings();
}

export async function openLocationServicesSettings() {
  try {
    if (Platform.OS === 'android') {
      await Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS');
      return;
    }
  } catch {
    // Fall through to app settings.
  }
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

    const servicesEnabled = await Location.hasServicesEnabledAsync().catch(() => false);
    if (!servicesEnabled) {
      throw new LocationFetchError('services_disabled', servicesDisabledMessage(), true);
    }

    throw new LocationFetchError(
      'no_signal',
      'Could not get a GPS signal. Move to an open area and try again, or pick a location on the map.',
    );
  }

  const latitude = position.coords.latitude;
  const longitude = position.coords.longitude;
  if (!isValidCoordinate(latitude, longitude)) {
    throw new LocationFetchError('invalid_coordinates', 'The device returned invalid GPS coordinates. Try again.');
  }

  try {
    return await reverseGeocodeCoordinates(latitude, longitude);
  } catch (error) {
    if (error instanceof LocationFetchError && error.reason === 'geocode_failed') {
      return {
        latitude,
        longitude,
        city: null,
        state: null,
        country: 'India',
        formattedAddress: formatCoordinates(latitude, longitude),
      };
    }
    return {
      latitude,
      longitude,
      city: null,
      state: null,
      country: 'India',
      formattedAddress: formatCoordinates(latitude, longitude),
    };
  }
}

export async function watchDeviceLocation(
  onLocation: (location: Location.LocationObject) => void,
  onError?: (error: LocationFetchError) => void,
): Promise<Location.LocationSubscription> {
  await ensureForegroundPermission();
  await ensureLocationServicesReady();

  return Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 3_000,
      distanceInterval: 8,
      mayShowUserSettingsDialog: true,
    },
    (position) => {
      if (!isValidCoordinate(position.coords.latitude, position.coords.longitude)) {
        onError?.(new LocationFetchError('invalid_coordinates', 'Received invalid GPS coordinates.'));
        return;
      }
      onLocation(position);
    },
  );
}

async function searchPlacesWithGoogle(query: string): Promise<PlaceSuggestion[]> {
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) return [];

  const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&key=${encodeURIComponent(apiKey)}&language=en&components=country:in`;
  const response = await withTimeout(
    fetch(url),
    SEARCH_TIMEOUT_MS,
    () => new LocationFetchError('timeout', 'Place search timed out.'),
  );
  if (!response.ok) return [];
  const payload = (await response.json()) as {
    status?: string;
    predictions?: Array<{ place_id?: string; description?: string; structured_formatting?: { main_text?: string; secondary_text?: string } }>;
  };
  if (payload.status !== 'OK' && payload.status !== 'ZERO_RESULTS') return [];
  return (payload.predictions ?? [])
    .filter((prediction) => prediction.place_id && prediction.description)
    .slice(0, 6)
    .map((prediction) => ({
      id: prediction.place_id as string,
      placeId: prediction.place_id,
      title: prediction.structured_formatting?.main_text || prediction.description || 'Place',
      subtitle: prediction.structured_formatting?.secondary_text || prediction.description || '',
    }));
}

async function searchPlacesWithGeocoder(query: string): Promise<PlaceSuggestion[]> {
  const results = await Location.geocodeAsync(query);
  return results
    .filter((result) => isValidCoordinate(result.latitude, result.longitude))
    .slice(0, 5)
    .map((result, index) => ({
      id: `geocode-${index}-${result.latitude}-${result.longitude}`,
      title: query.trim(),
      subtitle: formatCoordinates(result.latitude, result.longitude),
      latitude: result.latitude,
      longitude: result.longitude,
    }));
}

export async function searchPlaces(query: string): Promise<PlaceSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  try {
    const googleResults = await searchPlacesWithGoogle(trimmed);
    if (googleResults.length) return googleResults;
  } catch {
    // Fall through to the device geocoder.
  }

  try {
    return await searchPlacesWithGeocoder(trimmed);
  } catch (error) {
    if (isNetworkFailure(error)) {
      throw new LocationFetchError(
        'network',
        'Place search needs an internet connection. Check your network and try again.',
      );
    }
    throw new LocationFetchError('unavailable', 'Could not search for that place. Try a different query.');
  }
}

export async function resolvePlaceSuggestion(suggestion: PlaceSuggestion): Promise<DetectedLocation> {
  if (isValidCoordinate(suggestion.latitude, suggestion.longitude)) {
    return reverseGeocodeCoordinates(suggestion.latitude as number, suggestion.longitude as number);
  }

  const apiKey = getGoogleMapsApiKey();
  if (suggestion.placeId && apiKey) {
    try {
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(suggestion.placeId)}&fields=geometry,formatted_address,address_component,name&key=${encodeURIComponent(apiKey)}`;
      const response = await withTimeout(
        fetch(url),
        SEARCH_TIMEOUT_MS,
        () => new LocationFetchError('timeout', 'Could not load that place. Try again.'),
      );
      if (response.ok) {
        const payload = (await response.json()) as {
          status?: string;
          result?: {
            formatted_address?: string;
            address_components?: Array<{ long_name?: string; types?: string[] }>;
            geometry?: { location?: { lat?: number; lng?: number } };
          };
        };
        const latitude = payload.result?.geometry?.location?.lat;
        const longitude = payload.result?.geometry?.location?.lng;
        if (payload.status === 'OK' && isValidCoordinate(latitude, longitude)) {
          const parsed = addressFromGoogleComponents(payload.result || {});
          return {
            latitude: latitude as number,
            longitude: longitude as number,
            ...parsed,
            formattedAddress: parsed.formattedAddress || suggestion.title,
          };
        }
      }
    } catch {
      // Fall through to geocoding the suggestion title.
    }
  }

  const [result] = await Location.geocodeAsync(suggestion.subtitle ? `${suggestion.title}, ${suggestion.subtitle}` : suggestion.title);
  if (!result || !isValidCoordinate(result.latitude, result.longitude)) {
    throw new LocationFetchError('unavailable', 'Could not find coordinates for that place.');
  }
  return reverseGeocodeCoordinates(result.latitude, result.longitude);
}
