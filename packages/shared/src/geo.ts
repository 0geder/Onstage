import type { GeoPoint } from './types';

const EARTH_RADIUS_KM = 6371;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Great-circle distance in kilometres.
 *
 * The API uses PostGIS for radius queries; this exists for client-side display
 * and for the ingestion deduplicator, which runs before anything reaches the DB.
 */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isValidLatLng(point: Partial<GeoPoint>): point is GeoPoint {
  return (
    typeof point.lat === 'number' &&
    typeof point.lng === 'number' &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    point.lat >= -90 &&
    point.lat <= 90 &&
    point.lng >= -180 &&
    point.lng <= 180
  );
}

/** South African cities and large towns, for naming a venue's city from its coordinates. */
export const SA_CITIES: { name: string; point: GeoPoint }[] = [
  { name: 'Cape Town', point: { lat: -33.9249, lng: 18.4241 } },
  { name: 'Stellenbosch', point: { lat: -33.9321, lng: 18.8602 } },
  { name: 'Johannesburg', point: { lat: -26.2041, lng: 28.0473 } },
  { name: 'Pretoria', point: { lat: -25.7479, lng: 28.2293 } },
  { name: 'Durban', point: { lat: -29.8587, lng: 31.0218 } },
  { name: 'Pietermaritzburg', point: { lat: -29.6006, lng: 30.3794 } },
  { name: 'Gqeberha', point: { lat: -33.9608, lng: 25.6022 } },
  { name: 'East London', point: { lat: -33.0153, lng: 27.9116 } },
  { name: 'Bloemfontein', point: { lat: -29.0852, lng: 26.1596 } },
  { name: 'Polokwane', point: { lat: -23.9045, lng: 29.4689 } },
  { name: 'Mbombela', point: { lat: -25.4753, lng: 30.9694 } },
  { name: 'Rustenburg', point: { lat: -25.6544, lng: 27.2559 } },
  { name: 'Kimberley', point: { lat: -28.7282, lng: 24.7499 } },
  { name: 'George', point: { lat: -33.963, lng: 22.4617 } },
];

/**
 * The nearest listed city within `maxKm`, or null. For sources that give a
 * venue's coordinates but no city — the feed and search group venues by city.
 */
export function nearestCity(point: GeoPoint, maxKm = 60): string | null {
  let best: { name: string; km: number } | null = null;
  for (const city of SA_CITIES) {
    const km = haversineKm(point, city.point);
    if (km <= maxKm && (!best || km < best.km)) best = { name: city.name, km };
  }
  return best?.name ?? null;
}
