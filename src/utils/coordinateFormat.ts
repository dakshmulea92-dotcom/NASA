import type { AppSettings, LunarCoordinate } from '../types/lunar.ts';

export const MOON_RADIUS_KM = 1737.4;

export function formatLat(lat: number): string {
  const abs = Math.abs(lat).toFixed(3);
  return `${abs}° ${lat >= 0 ? 'N' : 'S'}`;
}

export function formatLon(lon: number, format: AppSettings['coordinateFormat'] = 'signed'): string {
  if (format === 'east360') {
    const e = ((lon % 360) + 360) % 360;
    return `${e.toFixed(3)}° E`;
  }
  const abs = Math.abs(lon).toFixed(3);
  return `${abs}° ${lon >= 0 ? 'E' : 'W'}`;
}

export function formatCoordPair(
  coord: LunarCoordinate,
  format: AppSettings['coordinateFormat'] = 'signed'
): string {
  return `${formatLat(coord.lat)}, ${formatLon(coord.lon, format)}`;
}

export function normalizeLongitudeSigned(lon: number): number {
  let l = ((lon + 180) % 360 + 360) % 360 - 180;
  if (l === -180 && lon > 0) l = 180;
  return Number(l.toFixed(5));
}

export function validateLunarCoordinate(lat: number, lon: number): {
  valid: boolean;
  error?: string;
  normalized?: { lat: number; lon: number };
} {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { valid: false, error: 'Latitude and longitude must be finite numbers.' };
  }
  if (lat < -90 || lat > 90) {
    return { valid: false, error: 'Lunar latitude must be between -90° and +90°.' };
  }
  if (lon < -180 || lon > 360) {
    return { valid: false, error: 'Longitude must be in [-180°, +180°] or [0°, 360°].' };
  }
  return {
    valid: true,
    normalized: {
      lat: Number(lat.toFixed(5)),
      lon: normalizeLongitudeSigned(lon),
    },
  };
}

export function haversineMoonKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return MOON_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatInEarthTimezone(utcIso: string, timeZone: string): {
  localFormatted: string;
  utcFormatted: string;
  tzAbbr: string;
} {
  const date = new Date(utcIso);
  if (Number.isNaN(date.getTime())) {
    return { localFormatted: 'Invalid Date', utcFormatted: 'Invalid Date', tzAbbr: 'N/A' };
  }

  const localFormatted = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);

  const tzParts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'short',
  }).formatToParts(date);
  const tzAbbr = tzParts.find((p) => p.type === 'timeZoneName')?.value ?? timeZone;

  const utcFormatted = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);

  return { localFormatted, utcFormatted: `${utcFormatted} UTC`, tzAbbr };
}
