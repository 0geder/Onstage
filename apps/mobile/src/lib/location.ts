import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GeoPoint } from '@onstage/shared';

/**
 * Location.
 *
 * POPIA position: location is collected only with explicit consent, only while
 * the app is in use, and never in the background. If permission is refused the
 * app keeps working — the user picks a city instead — so refusing is a real
 * option rather than a dead end.
 */

const LAST_KNOWN_KEY = 'onstage:last-location';

export type LocationState =
  | { status: 'granted'; point: GeoPoint }
  | { status: 'denied' }
  | { status: 'unavailable' };

export async function requestLocation(): Promise<LocationState> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return { status: 'denied' };

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const point: GeoPoint = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    };

    await AsyncStorage.setItem(LAST_KNOWN_KEY, JSON.stringify(point)).catch(() => undefined);
    return { status: 'granted', point };
  } catch {
    return { status: 'unavailable' };
  }
}

/** Permission state without prompting — used to decide whether to ask at all. */
export async function currentPermission(): Promise<'granted' | 'denied' | 'undetermined'> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status === 'granted') return 'granted';
    if (status === 'denied') return 'denied';
    return 'undetermined';
  } catch {
    return 'undetermined';
  }
}

/** The last fix we were given, so the feed has a centre before the GPS responds. */
export async function lastKnownLocation(): Promise<GeoPoint | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_KNOWN_KEY);
    return raw ? (JSON.parse(raw) as GeoPoint) : null;
  } catch {
    return null;
  }
}

/** Withdrawn consent means the stored fix goes too, not just that we stop using it. */
export async function forgetLocation(): Promise<void> {
  await AsyncStorage.removeItem(LAST_KNOWN_KEY).catch(() => undefined);
}

/** Fallback centres for people who decline location but still want a feed. */
export const CITY_CENTRES: { name: string; point: GeoPoint }[] = [
  { name: 'Cape Town', point: { lat: -33.9249, lng: 18.4241 } },
  { name: 'Johannesburg', point: { lat: -26.2041, lng: 28.0473 } },
  { name: 'Durban', point: { lat: -29.8587, lng: 31.0218 } },
  { name: 'Pretoria', point: { lat: -25.7479, lng: 28.2293 } },
  { name: 'Gqeberha', point: { lat: -33.9608, lng: 25.6022 } },
  { name: 'Bloemfontein', point: { lat: -29.0852, lng: 26.1596 } },
];
