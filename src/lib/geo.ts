import type { PlacePoint } from "@/data/types";

const EARTH_RADIUS_KM = 6371;

export function haversineKm(a: Pick<PlacePoint, "latitude" | "longitude">, b: Pick<PlacePoint, "latitude" | "longitude">): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(value));
}

