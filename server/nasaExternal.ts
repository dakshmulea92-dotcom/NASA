import fs from 'fs';
import path from 'path';
import type {
  DatasetMetadata,
  NasaDonkiEvent,
  NasaDonkiSummary,
  NasaEonetEvent,
  NasaEonetResponse,
  NasaPowerWeather,
} from '../src/types/lunar.ts';
import { LAUNCH_FACILITIES, NASA_DATASETS_CATALOG } from '../src/data/lunarCatalog.ts';

const CACHE_DIR = path.resolve(process.cwd(), 'data', 'nasa', 'cache');
const TILE_CACHE_DIR = path.join(CACHE_DIR, 'tiles');

function ensureDirs() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  if (!fs.existsSync(TILE_CACHE_DIR)) fs.mkdirSync(TILE_CACHE_DIR, { recursive: true });
}

function formatYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function formatIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Queries official NASA POWER Daily API (MERRA-2 / CERES reanalysis).
 * Explicitly labels data as historical/reanalysis climatology, NOT live operational weather forecast.
 */
export async function fetchNasaPowerForFacility(facilityId: string): Promise<NasaPowerWeather> {
  ensureDirs();
  const facility = LAUNCH_FACILITIES.find((f) => f.id === facilityId);
  if (!facility) {
    return {
      facilityId,
      available: false,
      unavailableReason: 'Unknown launch facility ID.',
      source: 'NASA Langley POWER API',
      datasetId: 'NASA-POWER-DAILY-RE',
      sourceUrl: 'https://power.larc.nasa.gov/',
      observationWindow: 'N/A',
      isHistoricalClimatology: true,
      limitationNotice: 'NASA POWER provides reanalysis/historical data, not live operational launch weather.',
      latestDate: null,
      metrics: {
        tempC: null,
        tempMaxC: null,
        tempMinC: null,
        windSpeed10mMs: null,
        windSpeed50mMs: null,
        precipitationMmDay: null,
        solarIrradianceKwhM2: null,
        clearSkyIrradianceKwhM2: null,
        relHumidityPct: null,
        surfacePressureKpa: null,
      },
      dailySeries: [],
    };
  }

  // NASA POWER MERRA-2 reanalysis has ~5-10 day processing latency.
  const now = new Date();
  const safeAnchor =
    now.getUTCFullYear() > 2025
      ? new Date('2025-11-10T00:00:00Z')
      : new Date(now.getTime() - 14 * 86400000);
  const endDt = safeAnchor;
  const startDt = new Date(endDt.getTime() - 13 * 86400000);
  const startStr = formatYmd(startDt);
  const endStr = formatYmd(endDt);

  const cacheFile = path.join(CACHE_DIR, `power_v2_${facility.id}_${startStr}_${endStr}.json`);
  if (fs.existsSync(cacheFile)) {
    try {
      return JSON.parse(fs.readFileSync(cacheFile, 'utf-8')) as NasaPowerWeather;
    } catch {
      // ignore corrupted cache
    }
  }

  const url =
    `https://power.larc.nasa.gov/api/temporal/daily/point?` +
    `parameters=T2M,T2M_MAX,T2M_MIN,WS10M,WS50M,PRECTOTCORR,ALLSKY_SFC_SW_DWN,CLRSKY_SFC_SW_DWN,RH2M,PS` +
    `&community=RE&longitude=${facility.lon}&latitude=${facility.lat}` +
    `&start=${startStr}&end=${endStr}&format=JSON`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const json = (await res.json()) as {
      properties?: {
        parameter?: Record<string, Record<string, number>>;
      };
    };

    const params = json.properties?.parameter;
    if (!params || !params.T2M) {
      throw new Error('Missing POWER parameter block');
    }

    const dates = Object.keys(params.T2M).sort();
    const cleanVal = (v: number | undefined): number | null =>
      v === undefined || v <= -900 ? null : Number(v.toFixed(2));

    const dailySeries = dates.map((dt) => ({
      date: `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`,
      tempC: cleanVal(params.T2M?.[dt]),
      windMs: cleanVal(params.WS10M?.[dt]),
      wind50mMs: cleanVal(params.WS50M?.[dt]),
      precipMm: cleanVal(params.PRECTOTCORR?.[dt]),
      irradiance: cleanVal(params.ALLSKY_SFC_SW_DWN?.[dt]),
      clearSkyIrradiance: cleanVal(params.CLRSKY_SFC_SW_DWN?.[dt]),
    }));

    const validDates = [...dates].reverse();
    const latestKey =
      validDates.find((d) => cleanVal(params.T2M?.[d]) !== null) ?? dates[dates.length - 1];

    const payload: NasaPowerWeather = {
      facilityId: facility.id,
      available: true,
      source: 'NASA Langley Research Center (POWER MERRA-2 / CERES SYN1DEG)',
      datasetId: 'NASA-POWER-DAILY-RE',
      sourceUrl: 'https://power.larc.nasa.gov/docs/services/api/',
      observationWindow: `${startStr.slice(0, 4)}-${startStr.slice(4, 6)}-${startStr.slice(6, 8)} to ${endStr.slice(0, 4)}-${endStr.slice(4, 6)}-${endStr.slice(6, 8)}`,
      isHistoricalClimatology: true,
      limitationNotice:
        'NASA POWER provides satellite/MERRA-2 reanalysis atmospheric observations (not live launch-pad Doppler radar or operational launch-day weather forecasts).',
      latestDate: latestKey
        ? `${latestKey.slice(0, 4)}-${latestKey.slice(4, 6)}-${latestKey.slice(6, 8)}`
        : null,
      metrics: {
        tempC: latestKey ? cleanVal(params.T2M?.[latestKey]) : null,
        tempMaxC: latestKey ? cleanVal(params.T2M_MAX?.[latestKey]) : null,
        tempMinC: latestKey ? cleanVal(params.T2M_MIN?.[latestKey]) : null,
        windSpeed10mMs: latestKey ? cleanVal(params.WS10M?.[latestKey]) : null,
        windSpeed50mMs: latestKey ? cleanVal(params.WS50M?.[latestKey]) : null,
        precipitationMmDay: latestKey ? cleanVal(params.PRECTOTCORR?.[latestKey]) : null,
        solarIrradianceKwhM2: latestKey ? cleanVal(params.ALLSKY_SFC_SW_DWN?.[latestKey]) : null,
        clearSkyIrradianceKwhM2: latestKey ? cleanVal(params.CLRSKY_SFC_SW_DWN?.[latestKey]) : null,
        relHumidityPct: latestKey ? cleanVal(params.RH2M?.[latestKey]) : null,
        surfacePressureKpa: latestKey ? cleanVal(params.PS?.[latestKey]) : null,
      },
      dailySeries,
    };

    try {
      fs.writeFileSync(cacheFile, JSON.stringify(payload));
    } catch {
      // ignore
    }
    return payload;
  } catch (err) {
    return {
      facilityId: facility.id,
      available: false,
      unavailableReason: `NASA DATA UNAVAILABLE (${err instanceof Error ? err.message : 'Network error'})`,
      source: 'NASA Langley Research Center (POWER Project)',
      datasetId: 'NASA-POWER-DAILY-RE',
      sourceUrl: 'https://power.larc.nasa.gov/',
      observationWindow: `${startStr} to ${endStr}`,
      isHistoricalClimatology: true,
      limitationNotice:
        'NASA POWER could not be reached or returned incomplete reanalysis data. No simulated weather values substituted.',
      latestDate: null,
      metrics: {
        tempC: null,
        tempMaxC: null,
        tempMinC: null,
        windSpeed10mMs: null,
        windSpeed50mMs: null,
        precipitationMmDay: null,
        solarIrradianceKwhM2: null,
        clearSkyIrradianceKwhM2: null,
        relHumidityPct: null,
        surfacePressureKpa: null,
      },
      dailySeries: [],
    };
  }
}

/**
 * Fetches live active Earth natural events from NASA Earth Observatory Natural Event Tracker (EONET v3).
 */
export async function fetchNasaEonetEvents(): Promise<NasaEonetResponse> {
  ensureDirs();
  const cacheFile = path.join(CACHE_DIR, 'eonet_open_v1.json');
  if (fs.existsSync(cacheFile)) {
    try {
      const stat = fs.statSync(cacheFile);
      if (Date.now() - stat.mtimeMs < 15 * 60 * 1000) {
        return JSON.parse(fs.readFileSync(cacheFile, 'utf-8')) as NasaEonetResponse;
      }
    } catch {
      // ignore
    }
  }

  const url = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=25';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7500);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const raw = (await res.json()) as {
      events?: Array<{
        id: string;
        title: string;
        link?: string;
        categories?: Array<{ title: string }>;
        geometry?: Array<{
          date: string;
          type: string;
          coordinates: unknown;
          magnitudeValue?: number | null;
          magnitudeUnit?: string | null;
        }>;
      }>;
    };

    const events: NasaEonetEvent[] = [];
    for (const ev of raw.events ?? []) {
      const geomList = ev.geometry ?? [];
      const latest = geomList[geomList.length - 1];
      if (!latest || !Array.isArray(latest.coordinates)) continue;

      let lon: number | null = null;
      let lat: number | null = null;
      if (latest.type === 'Point' && typeof latest.coordinates[0] === 'number') {
        lon = Number(latest.coordinates[0]);
        lat = Number(latest.coordinates[1]);
      } else if (
        latest.type === 'Polygon' &&
        Array.isArray(latest.coordinates[0]) &&
        Array.isArray(latest.coordinates[0][0])
      ) {
        lon = Number(latest.coordinates[0][0][0]);
        lat = Number(latest.coordinates[0][0][1]);
      }

      if (lat === null || lon === null || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      events.push({
        id: ev.id,
        title: ev.title,
        category: ev.categories?.[0]?.title || 'Earth Event',
        dateUtc: latest.date || '',
        lat,
        lon,
        link: ev.link || `https://eonet.gsfc.nasa.gov/api/v3/events/${ev.id}`,
        magnitudeValue: latest.magnitudeValue ?? null,
        magnitudeUnit: latest.magnitudeUnit ?? null,
      });
    }

    const payload: NasaEonetResponse = {
      available: true,
      source: 'NASA Earth Observatory Natural Event Tracker (EONET v3)',
      datasetId: 'NASA-EONET-V3-OPEN',
      sourceUrl: 'https://eonet.gsfc.nasa.gov/api/v3/events',
      fetchedUtc: new Date().toISOString(),
      events,
    };

    try {
      fs.writeFileSync(cacheFile, JSON.stringify(payload));
    } catch {
      // ignore
    }
    return payload;
  } catch (err) {
    return {
      available: false,
      source: 'NASA Earth Observatory Natural Event Tracker (EONET v3)',
      datasetId: 'NASA-EONET-V3-OPEN',
      sourceUrl: 'https://eonet.gsfc.nasa.gov/',
      fetchedUtc: new Date().toISOString(),
      events: [],
      unavailableReason: `NASA DATA UNAVAILABLE (${err instanceof Error ? err.message : 'EONET fetch failed'})`,
    };
  }
}

/**
 * Queries official NASA DONKI Space Weather API (Solar Energetic Particles & Flares).
 * Never fabricates space weather events if unreachable.
 */
export async function fetchNasaDonkiEvents(): Promise<NasaDonkiSummary> {
  ensureDirs();
  const endDt = new Date();
  const startDt = new Date(endDt.getTime() - 30 * 86400000);
  const startStr = formatIsoDate(startDt);
  const endStr = formatIsoDate(endDt);

  const cacheFile = path.join(CACHE_DIR, `donki_${startStr}_${endStr}.json`);
  if (fs.existsSync(cacheFile)) {
    try {
      const stat = fs.statSync(cacheFile);
      if (Date.now() - stat.mtimeMs < 30 * 60 * 1000) {
        return JSON.parse(fs.readFileSync(cacheFile, 'utf-8')) as NasaDonkiSummary;
      }
    } catch {
      // ignore
    }
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const [sepRes, flrRes] = await Promise.all([
      fetch(
        `https://api.nasa.gov/DONKI/SEP?startDate=${startStr}&endDate=${endStr}&api_key=DEMO_KEY`,
        { signal: controller.signal }
      ),
      fetch(
        `https://api.nasa.gov/DONKI/FLR?startDate=${startStr}&endDate=${endStr}&api_key=DEMO_KEY`,
        { signal: controller.signal }
      ),
    ]);
    clearTimeout(timeout);

    if (!sepRes.ok && !flrRes.ok) {
      throw new Error(`HTTP ${sepRes.status}/${flrRes.status}`);
    }

    const events: NasaDonkiEvent[] = [];
    if (sepRes.ok) {
      const sepJson = (await sepRes.json()) as Array<{
        sepID: string;
        eventTime: string;
        instruments?: Array<{ displayName: string }>;
        link?: string;
      }>;
      if (Array.isArray(sepJson)) {
        for (const s of sepJson.slice(0, 8)) {
          events.push({
            id: s.sepID,
            type: 'SEP',
            beginTimeUtc: s.eventTime,
            instruments: (s.instruments ?? []).map((i) => i.displayName),
            link: s.link || 'https://kauai.ccmc.gsfc.nasa.gov/DONKI/',
          });
        }
      }
    }

    if (flrRes.ok) {
      const flrJson = (await flrRes.json()) as Array<{
        flrID: string;
        beginTime: string;
        peakTime?: string;
        classType?: string;
        instruments?: Array<{ displayName: string }>;
        link?: string;
      }>;
      if (Array.isArray(flrJson)) {
        for (const f of flrJson.slice(0, 12)) {
          events.push({
            id: f.flrID,
            type: 'FLR',
            beginTimeUtc: f.beginTime,
            peakTimeUtc: f.peakTime ?? null,
            classType: f.classType ?? null,
            instruments: (f.instruments ?? []).map((i) => i.displayName),
            link: f.link || 'https://kauai.ccmc.gsfc.nasa.gov/DONKI/',
          });
        }
      }
    }

    events.sort((a, b) => (b.beginTimeUtc || '').localeCompare(a.beginTimeUtc || ''));

    const payload: NasaDonkiSummary = {
      available: true,
      source: 'NASA CCMC DONKI Space Weather Database',
      datasetId: 'NASA-DONKI-SEP-FLR',
      sourceUrl: 'https://ccmc.gsfc.nasa.gov/tools/DONKI/',
      observationWindow: `${startStr} to ${endStr}`,
      events,
    };

    try {
      fs.writeFileSync(cacheFile, JSON.stringify(payload));
    } catch {
      // ignore
    }
    return payload;
  } catch (err) {
    return {
      available: false,
      source: 'NASA CCMC DONKI Space Weather Database',
      datasetId: 'NASA-DONKI-SEP-FLR',
      sourceUrl: 'https://ccmc.gsfc.nasa.gov/tools/DONKI/',
      observationWindow: `${startStr} to ${endStr}`,
      events: [],
      unavailableReason: `NASA DATA UNAVAILABLE (${err instanceof Error ? err.message : 'DONKI unreachable'})`,
    };
  }
}

export async function proxyMoonTrekTile(
  layer: string,
  z: string,
  y: string,
  x: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  ensureDirs();
  const allowed: Record<string, { url: string; ext: string; mime: string }> = {
    wac: {
      url: `https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/${z}/${y}/${x}.jpg`,
      ext: 'jpg',
      mime: 'image/jpeg',
    },
    lola_shade: {
      url: `https://trek.nasa.gov/tiles/Moon/EQ/LRO_LOLA_ClrShade_Global_128ppd_v04/1.0.0/default/default028mm/${z}/${y}/${x}.png`,
      ext: 'png',
      mime: 'image/png',
    },
    minirf_s1: {
      url: `https://trek.nasa.gov/tiles/Moon/EQ/LRO_MiniRF_S1_Gray_Global_128ppd/1.0.0/default/default028mm/${z}/${y}/${x}.png`,
      ext: 'png',
      mime: 'image/png',
    },
    minirf_cpr: {
      url: `https://trek.nasa.gov/tiles/Moon/EQ/LRO_MiniRF_CPR_Gray_Global_128ppd/1.0.0/default/default028mm/${z}/${y}/${x}.png`,
      ext: 'png',
      mime: 'image/png',
    },
    diviner_temp: {
      url: `https://trek.nasa.gov/tiles/Moon/EQ/LRO_DIVINER_ClrRockFreeSurfaceTemp_Global_128ppd/1.0.0/default/default028mm/${z}/${y}/${x}.png`,
      ext: 'png',
      mime: 'image/png',
    },
    lola_slope: {
      url: `https://trek.nasa.gov/tiles/Moon/EQ/LRO_LOLA_ClrSlope_Global_16ppd/1.0.0/default/default028mm/${z}/${y}/${x}.png`,
      ext: 'png',
      mime: 'image/png',
    },
  };

  const cfg = allowed[layer];
  if (!cfg) return null;

  const tilePath = path.join(TILE_CACHE_DIR, `${layer}_${z}_${y}_${x}.${cfg.ext}`);
  if (fs.existsSync(tilePath)) {
    return { buffer: fs.readFileSync(tilePath), contentType: cfg.mime };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(cfg.url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    try {
      fs.writeFileSync(tilePath, buf);
    } catch {
      // ignore
    }
    return { buffer: buf, contentType: cfg.mime };
  } catch {
    return null;
  }
}

export function getDatasetsStatus(): {
  datasets: DatasetMetadata[];
  cacheStats: {
    cachedDemWindows: number;
    cachedTiles: number;
    cachedWeatherFiles: number;
    totalCacheSizeKb: number;
  };
} {
  ensureDirs();
  let cachedDemWindows = 0;
  let cachedWeatherFiles = 0;
  let totalBytes = 0;

  for (const entry of fs.readdirSync(CACHE_DIR)) {
    const full = path.join(CACHE_DIR, entry);
    const stat = fs.statSync(full);
    if (stat.isFile()) {
      totalBytes += stat.size;
      if (entry.startsWith('power_')) cachedWeatherFiles++;
      else if (entry.endsWith('.json')) cachedDemWindows++;
    }
  }

  let cachedTiles = 0;
  if (fs.existsSync(TILE_CACHE_DIR)) {
    for (const entry of fs.readdirSync(TILE_CACHE_DIR)) {
      const full = path.join(TILE_CACHE_DIR, entry);
      const stat = fs.statSync(full);
      if (stat.isFile()) {
        totalBytes += stat.size;
        cachedTiles++;
      }
    }
  }

  const datasets = NASA_DATASETS_CATALOG.map((ds) => {
    if (ds.localPath) {
      const exists = fs.existsSync(path.resolve(process.cwd(), ds.localPath));
      return {
        ...ds,
        status: exists ? ('cached' as const) : ('unavailable' as const),
        processingStatus: exists ? ('ready' as const) : ('idle' as const),
      };
    }
    if (ds.id === 'nasa-power-merra2' && cachedWeatherFiles > 0) {
      return { ...ds, status: 'cached' as const, processingStatus: 'ready' as const };
    }
    if (
      (ds.id === 'moon-trek-wac' ||
        ds.id === 'moon-trek-clrshade' ||
        ds.id === 'moon-trek-minirf-s1' ||
        ds.id === 'moon-trek-minirf-cpr') &&
      cachedTiles > 0
    ) {
      return { ...ds, status: 'cached' as const, processingStatus: 'ready' as const };
    }
    if (
      cachedDemWindows > 0 &&
      (ds.id === 'lola-gdr-16ppd' || ds.id === 'lola-gdr-64ppd' || ds.id === 'lola-polar-80m')
    ) {
      return { ...ds, status: 'partial' as const, processingStatus: 'ready' as const };
    }
    return ds;
  });

  return {
    datasets,
    cacheStats: {
      cachedDemWindows,
      cachedTiles,
      cachedWeatherFiles,
      totalCacheSizeKb: Number((totalBytes / 1024).toFixed(1)),
    },
  };
}

export function clearNasaCache(): { deletedFiles: number } {
  ensureDirs();
  let deleted = 0;
  for (const entry of fs.readdirSync(CACHE_DIR)) {
    const full = path.join(CACHE_DIR, entry);
    if (fs.statSync(full).isFile()) {
      fs.unlinkSync(full);
      deleted++;
    }
  }
  if (fs.existsSync(TILE_CACHE_DIR)) {
    for (const entry of fs.readdirSync(TILE_CACHE_DIR)) {
      const full = path.join(TILE_CACHE_DIR, entry);
      if (fs.statSync(full).isFile()) {
        fs.unlinkSync(full);
        deleted++;
      }
    }
  }
  return { deletedFiles: deleted };
}
