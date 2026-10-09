import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, Text, TextInput, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { useFocusEffect } from '@react-navigation/native';
import Icon from './Icon';
import { Spinner } from './shared';
import { isGoogleMapsConfigured } from '../config/maps';
import { androidInputStyle } from '../setup/androidText';
import {
  DetectedLocation,
  FALLBACK_CAMERA_REGION,
  LocationFetchError,
  LocationPermissionUiState,
  PlaceSuggestion,
  formatCoordinates,
  isValidCoordinate,
  locationDisplayName,
  openDeviceLocationSettings,
  openLocationServicesSettings,
  permissionMessage,
  regionFromCoordinate,
  resolvePlaceSuggestion,
  reverseGeocodeCoordinates,
  searchPlaces,
  servicesDisabledMessage,
} from '../utils/location';
import { useDeviceLocation } from '../hooks/useDeviceLocation';

type LocationPickerMapProps = {
  initialCoordinate?: { latitude: number; longitude: number } | null;
  selectable?: boolean;
  autoDetect?: boolean;
  autoTrack?: boolean;
  showSearch?: boolean;
  showTrackingToggle?: boolean;
  height?: number;
  onLocationChange?: (location: DetectedLocation | null) => void;
};

export function LocationPickerMap({
  initialCoordinate,
  selectable = true,
  autoDetect = true,
  autoTrack = true,
  showSearch = true,
  showTrackingToggle = true,
  height = 280,
  onLocationChange,
}: LocationPickerMapProps) {
  const hasSavedCoordinate = Boolean(
    initialCoordinate && isValidCoordinate(initialCoordinate.latitude, initialCoordinate.longitude),
  );
  const mapRef = useRef<MapView | null>(null);
  const followCameraRef = useRef(!hasSavedCoordinate);
  const userPanningRef = useRef(false);
  const lastEmittedRef = useRef<string>('');
  const reverseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapsReadyRef = useRef(false);
  const initialAppliedRef = useRef(false);
  const selectedRef = useRef<DetectedLocation | null>(null);

  const device = useDeviceLocation({ autoDetect, watch: false });
  const [selected, setSelected] = useState<DetectedLocation | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [resolvingPlace, setResolvingPlace] = useState(false);
  const mapsConfigured = isGoogleMapsConfigured();

  const emitLocation = useCallback(
    (location: DetectedLocation | null) => {
      const key = location
        ? `${location.latitude.toFixed(6)},${location.longitude.toFixed(6)},${location.formattedAddress || ''}`
        : '';
      if (key === lastEmittedRef.current) return;
      lastEmittedRef.current = key;
      onLocationChange?.(location);
    },
    [onLocationChange],
  );

  const animateTo = useCallback((latitude: number, longitude: number, force = false, delta = 0.01) => {
    if (!force && !followCameraRef.current) return;
    if (!force && userPanningRef.current) return;
    mapRef.current?.animateToRegion(regionFromCoordinate(latitude, longitude, delta), 650);
  }, []);

  const applySelected = useCallback(
    (location: DetectedLocation, moveCamera: boolean) => {
      selectedRef.current = location;
      setSelected(location);
      setGeocodeError(null);
      emitLocation(location);
      if (moveCamera) animateTo(location.latitude, location.longitude, true);
    },
    [animateTo, emitLocation],
  );

  const geocodeAndSelect = useCallback(
    async (latitude: number, longitude: number, moveCamera: boolean) => {
      if (!isValidCoordinate(latitude, longitude)) {
        setGeocodeError('The selected map coordinates are invalid.');
        return;
      }
      setSelected((current) => ({
        latitude,
        longitude,
        city: current?.city ?? null,
        state: current?.state ?? null,
        country: current?.country ?? 'India',
        street: current?.street ?? null,
        locality: current?.locality ?? null,
        postalCode: current?.postalCode ?? null,
        formattedAddress: current?.formattedAddress ?? formatCoordinates(latitude, longitude),
      }));
      try {
        const resolved = await reverseGeocodeCoordinates(latitude, longitude);
        applySelected(resolved, moveCamera);
      } catch {
        setGeocodeError('Could not look up the address for this point. Coordinates are still saved.');
        applySelected(
          {
            latitude,
            longitude,
            city: null,
            state: null,
            country: 'India',
            formattedAddress: formatCoordinates(latitude, longitude),
          },
          moveCamera,
        );
      }
    },
    [applySelected],
  );

  useEffect(() => {
    if (initialAppliedRef.current || !hasSavedCoordinate || !initialCoordinate) return;
    initialAppliedRef.current = true;
    geocodeAndSelect(initialCoordinate.latitude, initialCoordinate.longitude, true).catch(() => undefined);
  }, [geocodeAndSelect, hasSavedCoordinate, initialCoordinate]);

  useEffect(() => {
    if (!device.location) return;
    if (!selectedRef.current && !hasSavedCoordinate) {
      applySelected(device.location, true);
      return;
    }
    if (followCameraRef.current) applySelected(device.location, true);
  }, [applySelected, device.location, hasSavedCoordinate]);

  useFocusEffect(
    useCallback(() => {
      if (!autoTrack) return undefined;
      device.startTracking().catch(() => undefined);
      return () => device.stopTracking();
    }, [autoTrack, device.startTracking, device.stopTracking]),
  );

  useEffect(() => {
    return () => {
      if (reverseTimerRef.current) clearTimeout(reverseTimerRef.current);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  const permission: LocationPermissionUiState = device.permission;
  const permissionBlocked = permission === 'denied' || permission === 'permanently_denied';
  const servicesDisabled = device.services === 'disabled';
  const statusMessage = servicesDisabled
    ? servicesDisabledMessage()
    : permission !== 'granted'
      ? permissionMessage(permission)
      : device.error;
  const canOpenAppSettings = permission === 'permanently_denied' || device.canOpenSettings;
  const canOpenGpsSettings = servicesDisabled;

  const handleMapPress = (coordinate: { latitude: number; longitude: number }) => {
    if (!selectable) return;
    followCameraRef.current = false;
    geocodeAndSelect(coordinate.latitude, coordinate.longitude, false).catch(() => undefined);
  };

  const handleMarkerDrag = (coordinate: { latitude: number; longitude: number }) => {
    followCameraRef.current = false;
    if (reverseTimerRef.current) clearTimeout(reverseTimerRef.current);
    setSelected((current) =>
      current
        ? { ...current, latitude: coordinate.latitude, longitude: coordinate.longitude }
        : {
            latitude: coordinate.latitude,
            longitude: coordinate.longitude,
            city: null,
            state: null,
            country: 'India',
            formattedAddress: formatCoordinates(coordinate.latitude, coordinate.longitude),
          },
    );
    reverseTimerRef.current = setTimeout(() => {
      geocodeAndSelect(coordinate.latitude, coordinate.longitude, false).catch(() => undefined);
    }, 400);
  };

  const goToMyLocation = async () => {
    followCameraRef.current = true;
    const next = device.location || (await device.detect());
    if (next) applySelected(next, true);
    if (!device.tracking) await device.startTracking();
  };

  const toggleTracking = async () => {
    if (device.tracking) {
      device.stopTracking();
      followCameraRef.current = false;
      return;
    }
    followCameraRef.current = true;
    await device.startTracking();
    const next = device.location || (await device.detect());
    if (next) applySelected(next, true);
  };

  const runSearch = (value: string) => {
    setSearchQuery(value);
    setSearchError(null);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (value.trim().length < 2) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const next = await searchPlaces(value);
        setSuggestions(next);
        if (!next.length) setSearchError('No matching places found.');
      } catch (error) {
        setSuggestions([]);
        setSearchError(error instanceof LocationFetchError ? error.message : 'Place search failed. Try again.');
      } finally {
        setSearching(false);
      }
    }, 350);
  };

  const selectSuggestion = async (suggestion: PlaceSuggestion) => {
    Keyboard.dismiss();
    setResolvingPlace(true);
    setSearchError(null);
    try {
      const resolved = await resolvePlaceSuggestion(suggestion);
      setSearchQuery(resolved.formattedAddress || suggestion.title);
      setSuggestions([]);
      followCameraRef.current = false;
      applySelected(resolved, true);
    } catch (error) {
      setSearchError(error instanceof LocationFetchError ? error.message : 'Could not open that place.');
    } finally {
      setResolvingPlace(false);
    }
  };

  const cameraRegion: Region = selected
    ? regionFromCoordinate(selected.latitude, selected.longitude)
    : device.location
      ? regionFromCoordinate(device.location.latitude, device.location.longitude)
      : initialCoordinate && isValidCoordinate(initialCoordinate.latitude, initialCoordinate.longitude)
        ? regionFromCoordinate(initialCoordinate.latitude, initialCoordinate.longitude)
        : FALLBACK_CAMERA_REGION;

  const markerCoordinate = selected
    ? { latitude: selected.latitude, longitude: selected.longitude }
    : device.location
      ? { latitude: device.location.latitude, longitude: device.location.longitude }
      : null;

  return (
    <View>
      {showSearch && (
        <View className="mb-2">
          <View className="flex-row items-center bg-white border border-ink-200 rounded-card px-3 min-h-12">
            <Icon name="search" size={16} color="#64748B" />
            <TextInput
              value={searchQuery}
              onChangeText={runSearch}
              placeholder="Search area, landmark or city"
              placeholderTextColor="#94A3B8"
              className="flex-1 ml-2 py-2 text-[14px] text-ink-900"
              style={androidInputStyle(14)}
              autoCorrect={false}
              autoCapitalize="words"
              returnKeyType="search"
            />
            {(searching || resolvingPlace) && <Spinner color="#64748B" size={16} />}
            {!!searchQuery && !searching && (
              <Pressable
                onPress={() => {
                  setSearchQuery('');
                  setSuggestions([]);
                  setSearchError(null);
                }}
                hitSlop={8}
                className="ml-1"
              >
                <Icon name="x" size={16} color="#94A3B8" />
              </Pressable>
            )}
          </View>
          {(suggestions.length > 0 || searchError) && (
            <View className="mt-1 bg-white border border-ink-200 rounded-card overflow-hidden">
              {searchError && !suggestions.length ? (
                <Text className="px-3 py-2 text-[12px] text-ink-500">{searchError}</Text>
              ) : (
                suggestions.map((suggestion) => (
                  <Pressable
                    key={suggestion.id}
                    onPress={() => selectSuggestion(suggestion)}
                    className="px-3 py-2.5 border-b border-ink-100 flex-row items-start gap-2"
                  >
                    <Icon name="map-pin" size={14} color="#1A6FFF" />
                    <View className="flex-1">
                      <Text className="text-[13px] font-semibold text-ink-900">{suggestion.title}</Text>
                      {!!suggestion.subtitle && (
                        <Text className="text-[11px] text-ink-500 mt-0.5">{suggestion.subtitle}</Text>
                      )}
                    </View>
                  </Pressable>
                ))
              )}
            </View>
          )}
        </View>
      )}

      <View className="rounded-card border border-ink-200 overflow-hidden bg-ink-100" style={{ height }}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={{ flex: 1 }}
          initialRegion={cameraRegion}
          showsUserLocation={permission === 'granted'}
          showsMyLocationButton={false}
          showsCompass
          zoomEnabled
          zoomControlEnabled={Platform.OS === 'android'}
          scrollEnabled
          rotateEnabled
          pitchEnabled
          nestedScrollEnabled
          toolbarEnabled={false}
          onMapReady={() => {
            mapsReadyRef.current = true;
            setMapError(null);
            if (markerCoordinate) animateTo(markerCoordinate.latitude, markerCoordinate.longitude, true);
          }}
          onPanDrag={() => {
            userPanningRef.current = true;
            followCameraRef.current = false;
          }}
          onRegionChangeComplete={() => {
            userPanningRef.current = false;
          }}
          onPress={(event) => handleMapPress(event.nativeEvent.coordinate)}
          onPoiClick={(event) => handleMapPress(event.nativeEvent.coordinate)}
        >
          {markerCoordinate && (
            <Marker
              coordinate={markerCoordinate}
              draggable={selectable}
              title={selected ? 'Selected location' : 'Current location'}
              description={selected ? locationDisplayName(selected) : undefined}
              onDragEnd={(event) => handleMarkerDrag(event.nativeEvent.coordinate)}
            />
          )}
        </MapView>

        <View className="absolute right-3 top-3 gap-2">
          <Pressable
            onPress={() => goToMyLocation().catch(() => undefined)}
            className="w-10 h-10 rounded-full bg-white items-center justify-center border border-ink-200"
            accessibilityLabel="Go to my location"
          >
            <Icon name="locate-fixed" size={16} color="#1A6FFF" />
          </Pressable>
          {showTrackingToggle && (
            <Pressable
              onPress={() => toggleTracking().catch(() => undefined)}
              className={`w-10 h-10 rounded-full items-center justify-center border ${device.tracking ? 'bg-brand-600 border-brand-600' : 'bg-white border-ink-200'}`}
              accessibilityLabel={device.tracking ? 'Stop live tracking' : 'Start live tracking'}
            >
              <Icon name="navigation" size={15} color={device.tracking ? 'white' : '#334155'} />
            </Pressable>
          )}
        </View>

        {(device.loading || !mapsConfigured) && (
          <View className="absolute left-3 right-3 top-3">
            <View className="bg-white/95 px-3 py-2 rounded-xl flex-row items-center gap-2">
              {device.loading ? <Spinner color="#1A6FFF" size={14} /> : <Icon name="map" size={14} color="#D97706" />}
              <Text className="text-[11.5px] text-ink-700 flex-1">
                {device.loading
                  ? 'Detecting your GPS location...'
                  : 'Google Maps API key is missing. Add EXPO_PUBLIC_GOOGLE_MAPS_API_KEY and rebuild the app.'}
              </Text>
            </View>
          </View>
        )}

        {!!(statusMessage || mapError) && !device.loading && (
          <View className="absolute left-3 right-3 bottom-3">
            <View className="bg-white/95 px-3 py-2 rounded-xl">
              <Text className="text-[11.5px] text-ink-700">{mapError || statusMessage}</Text>
              <View className="flex-row gap-3 mt-1.5">
                {permission === 'not_requested' || permission === 'denied' ? (
                  <Pressable onPress={() => device.detect().catch(() => undefined)}>
                    <Text className="text-[11px] font-semibold text-brand-600">Allow location</Text>
                  </Pressable>
                ) : null}
                {canOpenAppSettings ? (
                  <Pressable onPress={() => openDeviceLocationSettings().catch(() => undefined)}>
                    <Text className="text-[11px] font-semibold text-brand-600">Open app settings</Text>
                  </Pressable>
                ) : null}
                {canOpenGpsSettings ? (
                  <Pressable onPress={() => openLocationServicesSettings().catch(() => undefined)}>
                    <Text className="text-[11px] font-semibold text-brand-600">Enable GPS</Text>
                  </Pressable>
                ) : null}
                {permissionBlocked || servicesDisabled ? (
                  <Pressable onPress={() => device.detect().catch(() => undefined)}>
                    <Text className="text-[11px] font-semibold text-brand-600">Try again</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        )}
      </View>

      <View className="mt-2 p-3 rounded-card border border-ink-200 bg-ink-50">
        <Text className="text-[12px] font-semibold text-ink-900" numberOfLines={2}>
          {selected ? locationDisplayName(selected) : 'Waiting for GPS location'}
        </Text>
        {selected ? (
          <>
            <Text className="text-[11px] text-ink-500 mt-1">
              {[selected.city, selected.state, selected.country, selected.postalCode].filter(Boolean).join(' · ') || 'Address details will appear after reverse geocoding.'}
            </Text>
            <Text className="text-[11px] text-brand-700 mt-1 font-medium">
              GPS: {formatCoordinates(selected.latitude, selected.longitude)}
            </Text>
          </>
        ) : (
          <Text className="text-[11px] text-ink-500 mt-1">
            Grant location permission to show your real coordinates on Google Maps.
          </Text>
        )}
        {!!geocodeError && <Text className="text-[11px] text-amber-700 mt-1">{geocodeError}</Text>}
        {device.tracking && (
          <Text className="text-[10.5px] text-emerald-700 mt-1">Live tracking on — marker updates as you move.</Text>
        )}
      </View>
    </View>
  );
}
