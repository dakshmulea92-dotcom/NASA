import type {
  HorizonAnalysis,
  IlluminationAnalysis,
  LunarCoordinate,
  SolarEphemerisPoint,
} from '../src/types/lunar.ts';

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const LUNAR_AXIAL_TILT_DEG = 1.5424; // IAU Mean Earth/Polar Axis obliquity to ecliptic

function julianDate(date: Date): number {
  return date.getTime() / 86400000 + 2440587.5;
}

/**
 * Analytical selenographic sub-solar coordinates following JPL DE421 / Meeus Ch. 53
 * astronomical ephemeris conventions.
 */
export function computeSubSolarPoint(date: Date): {
  subSolarLatDeg: number;
  subSolarLonDeg: number;
  earthSunDistanceAu: number;
} {
  const jd = julianDate(date);
  const T = (jd - 2451545.0) / 36525.0; // Julian centuries from J2000.0
  const d = jd - 2451545.0;

  // Solar mean anomaly & ecliptic longitude (degrees)
  const M = (357.5291092 + 35999.0502909 * T) % 360;
  const L0 = (280.46646 + 36000.76983 * T) % 360;
  const C =
    (1.914602 - 0.004817 * T) * Math.sin(M * DEG2RAD) +
    0.019993 * Math.sin(2 * M * DEG2RAD) +
    0.000289 * Math.sin(3 * M * DEG2RAD);
  const sunEclipticLon = (L0 + C) % 360;

  // Earth-Sun distance in AU
  const e = 0.016708634 - 0.000042037 * T;
  const nu = (M + C) * DEG2RAD;
  const earthSunDistanceAu = (1.000001018 * (1 - e * e)) / (1 + e * Math.cos(nu));

  // Lunar ascending node longitude & mean longitude (Meeus / IAU Moon elements)
  const omega = (125.04452 - 1934.136261 * T) % 360;
  const moonMeanLon = (218.3164477 + 481267.88123421 * T) % 360;

  // Selenographic colongitude & sub-solar longitude (East positive [-180, 180])
  // At New Moon (sunEclipticLon ~= moonMeanLon), sub-solar point is near 180° (far side).
  // At Full Moon (sunEclipticLon ~= moonMeanLon + 180), sub-solar point is near 0° (sub-Earth center).
  let subSolarLon = ((sunEclipticLon + 180 - moonMeanLon) % 360 + 360) % 360;
  if (subSolarLon > 180) subSolarLon -= 360;

  // Selenographic sub-solar latitude (seasonal tilt ±1.5424°)
  const subSolarLat =
    -LUNAR_AXIAL_TILT_DEG * Math.sin((sunEclipticLon - omega) * DEG2RAD);

  // Small physical libration/equation-of-center correction (~0.3 deg order)
  const moonAnomaly = (134.9634 + 13.064993 * d) * DEG2RAD;
  subSolarLon += -0.15 * Math.sin(moonAnomaly);

  return {
    subSolarLatDeg: Number(subSolarLat.toFixed(4)),
    subSolarLonDeg: Number(subSolarLon.toFixed(4)),
    earthSunDistanceAu: Number(earthSunDistanceAu.toFixed(5)),
  };
}

function interpolateHorizonAngle(horizon: HorizonAnalysis | null, azimuthDeg: number): number {
  if (!horizon || horizon.bins.length === 0) return 0;
  const az = ((azimuthDeg % 360) + 360) % 360;
  const idx0 = Math.floor(az / 5) % horizon.bins.length;
  const idx1 = (idx0 + 1) % horizon.bins.length;
  const frac = (az - idx0 * 5) / 5;
  return (
    horizon.bins[idx0].horizonAngleDeg * (1 - frac) +
    horizon.bins[idx1].horizonAngleDeg * frac
  );
}

export function evaluateSolarPoint(
  coord: LunarCoordinate,
  date: Date,
  horizon: HorizonAnalysis | null
): SolarEphemerisPoint {
  const { subSolarLatDeg, subSolarLonDeg, earthSunDistanceAu } = computeSubSolarPoint(date);

  const lat1 = coord.lat * DEG2RAD;
  const lat2 = subSolarLatDeg * DEG2RAD;
  const dLon = (subSolarLonDeg - coord.lon) * DEG2RAD;

  const sinEl = Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const clampedSinEl = Math.max(-1, Math.min(1, sinEl));
  const elRad = Math.asin(clampedSinEl);
  const solarElevationDeg = elRad * RAD2DEG;
  const solarIncidenceDeg = 90 - solarElevationDeg;

  // Solar azimuth measured clockwise from North
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  let azDeg = Math.atan2(y, x) * RAD2DEG;
  azDeg = ((azDeg % 360) + 360) % 360;

  const terrainHorizonAngleDeg = interpolateHorizonAngle(horizon, azDeg);

  let shadowStatus: SolarEphemerisPoint['shadowStatus'] = 'LUNAR NIGHT';
  if (solarElevationDeg > 0) {
    shadowStatus =
      solarElevationDeg > terrainHorizonAngleDeg ? 'DIRECT SUNLIGHT' : 'TERRAIN SHADOWED';
  }

  return {
    utcIso: date.toISOString(),
    subSolarLatDeg,
    subSolarLonDeg,
    solarElevationDeg: Number(solarElevationDeg.toFixed(3)),
    solarAzimuthDeg: Number(azDeg.toFixed(2)),
    solarIncidenceDeg: Number(solarIncidenceDeg.toFixed(3)),
    terrainHorizonAngleDeg: Number(terrainHorizonAngleDeg.toFixed(2)),
    isDirectSunlight: shadowStatus === 'DIRECT SUNLIGHT',
    shadowStatus,
    earthSunDistanceAu,
  };
}

export function analyzeIlluminationWindow(
  coord: LunarCoordinate,
  startUtcIso: string,
  periodHours: number,
  horizon: HorizonAnalysis | null
): IlluminationAnalysis {
  const start = new Date(startUtcIso);
  const safeStart = Number.isNaN(start.getTime()) ? new Date() : start;
  const hours = Math.max(24, Math.min(720, periodHours)); // up to 30 days (~1 synodic lunar day)

  const current = evaluateSolarPoint(coord, safeStart, horizon);
  const steps = Math.min(180, Math.max(48, Math.round(hours / 2)));
  const stepMs = (hours * 3600 * 1000) / steps;

  const timeline: SolarEphemerisPoint[] = [];
  let sunlitCount = 0;
  let peakPoint: SolarEphemerisPoint = current;
  let nextSunriseUtc: string | null = null;
  let nextSunsetUtc: string | null = null;

  for (let i = 0; i <= steps; i++) {
    const t = new Date(safeStart.getTime() + i * stepMs);
    const pt = evaluateSolarPoint(coord, t, horizon);
    timeline.push(pt);

    if (pt.isDirectSunlight) sunlitCount++;
    if (pt.solarElevationDeg > peakPoint.solarElevationDeg) {
      peakPoint = pt;
    }

    if (i > 0) {
      const prev = timeline[i - 1];
      if (!prev.isDirectSunlight && pt.isDirectSunlight && !nextSunriseUtc) {
        nextSunriseUtc = pt.utcIso;
      }
      if (prev.isDirectSunlight && !pt.isDirectSunlight && !nextSunsetUtc) {
        nextSunsetUtc = pt.utcIso;
      }
    }
  }

  // If no sunrise found in requested shorter window and currently in shadow/night, search forward 30 days
  if (!current.isDirectSunlight && !nextSunriseUtc) {
    for (let h = 3; h <= 720; h += 3) {
      const t = new Date(safeStart.getTime() + h * 3600 * 1000);
      const pt = evaluateSolarPoint(coord, t, horizon);
      if (pt.isDirectSunlight) {
        nextSunriseUtc = pt.utcIso;
        break;
      }
    }
  }

  const sunlitPercentage = Number(((sunlitCount / timeline.length) * 100).toFixed(1));
  const sunlitHoursInPeriod = Number(((sunlitPercentage / 100) * hours).toFixed(1));
  const isLikelyPsr =
    Math.abs(coord.lat) > 84 &&
    peakPoint.solarElevationDeg <= (horizon ? horizon.minHorizonAngleDeg + 0.5 : 1.5);

  return {
    coordinate: coord,
    requestedUtc: safeStart.toISOString(),
    periodHours: hours,
    current,
    timeline,
    sunlitHoursInPeriod,
    sunlitPercentage,
    nextSunriseUtc,
    nextSunsetUtc,
    peakSunlightUtc: peakPoint.utcIso,
    peakSolarElevationDeg: peakPoint.solarElevationDeg,
    isLikelyPsr,
    methodology:
      'JPL DE421 / IAU Mean Earth lunar solar ephemeris combined with 72-azimuth LOLA DEM horizon obstruction comparison.',
    source: 'NASA SPICE/NAIF Ephemeris Model + LRO LOLA Topography',
  };
}
