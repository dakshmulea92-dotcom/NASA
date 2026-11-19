import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import {
  analyzeLolaDem,
  assessLandingSite,
  computeTerrainHorizon,
  sampleLdem4Elevation,
} from './server/lolaEngine.ts';
import { analyzeIlluminationWindow } from './server/ephemerisEngine.ts';
import {
  clearNasaCache,
  fetchNasaDonkiEvents,
  fetchNasaEonetEvents,
  fetchNasaPowerForFacility,
  getDatasetsStatus,
  proxyMoonTrekTile,
} from './server/nasaExternal.ts';
import {
  deleteMission,
  loadMissions,
  loadSavedLocations,
  saveLocationList,
  saveMission,
} from './server/missionsStore.ts';
import { getAiProvider, type AiChatMessage, type AiContextPayload } from './server/lunaAi.ts';
import { generateVideoFromImage } from './server/videoGen.ts';
import type { LunarCoordinate, MissionPlan, SuitabilityWeights } from './src/types/lunar.ts';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '15mb' }));

  // Serve public assets (official NASA GLB models in /models/*.glb)
  app.use(express.static(path.resolve(process.cwd(), 'public')));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'ARC LUNA — LUNASIGHT', port: PORT });
  });

  app.get('/api/maps/config', (_req, res) => {
    const apiKey =
      process.env.VITE_GOOGLE_MAPS_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      '';
    res.json({
      hasKey: Boolean(apiKey && !apiKey.startsWith('MY_')),
      apiKey: apiKey && !apiKey.startsWith('MY_') ? apiKey : '',
    });
  });

  app.get('/api/lunar/elevation', (req, res) => {
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90) {
      res.status(400).json({ error: 'Invalid lat/lon coordinates.' });
      return;
    }
    const elev = sampleLdem4Elevation(lat, lon);
    if (elev === null) {
      res.status(503).json({ error: 'NASA DATA UNAVAILABLE' });
      return;
    }
    res.json({
      lat,
      lon,
      elevationMeters: Number(elev.toFixed(1)),
      referenceSphereKm: 1737.4,
      source: 'NASA LRO LOLA LDEM_4.IMG (LRO-L-LOLA-4-GDR-V1.0)',
    });
  });

  app.post('/api/lunar/analyze', async (req, res) => {
    try {
      const { coordinate, radiusKm = 20, weights, fastMode = false } = req.body as {
        coordinate: LunarCoordinate;
        radiusKm?: number;
        weights?: Partial<SuitabilityWeights>;
        fastMode?: boolean;
      };

      if (
        !coordinate ||
        !Number.isFinite(coordinate.lat) ||
        !Number.isFinite(coordinate.lon) ||
        coordinate.lat < -90 ||
        coordinate.lat > 90
      ) {
        res.status(400).json({ error: 'Valid lunar latitude [-90, 90] and longitude are required.' });
        return;
      }

      const assessment = await assessLandingSite(coordinate, radiusKm, weights, fastMode);
      res.json(assessment);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'LOLA terrain analysis failed.',
      });
    }
  });

  app.post('/api/lunar/compare', async (req, res) => {
    try {
      const { sites, radiusKm = 20, fastMode = false } = req.body as {
        sites: LunarCoordinate[];
        radiusKm?: number;
        fastMode?: boolean;
      };
      if (!Array.isArray(sites) || sites.length === 0) {
        res.status(400).json({ error: 'Provide at least one lunar coordinate.' });
        return;
      }
      const assessments = await Promise.all(
        sites.slice(0, 4).map((s) => assessLandingSite(s, radiusKm, undefined, fastMode))
      );
      res.json({ comparisons: assessments });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Comparison failed.',
      });
    }
  });

  app.post('/api/lunar/illumination', async (req, res) => {
    try {
      const { coordinate, dateUtc, periodHours = 720, fastMode = false } = req.body as {
        coordinate: LunarCoordinate;
        dateUtc?: string;
        periodHours?: number;
        fastMode?: boolean;
      };
      if (!coordinate || !Number.isFinite(coordinate.lat) || !Number.isFinite(coordinate.lon)) {
        res.status(400).json({ error: 'Valid lunar coordinate required.' });
        return;
      }

      const dem = await analyzeLolaDem(coordinate.lat, coordinate.lon, 25, 31, fastMode);
      const horizon = computeTerrainHorizon(coordinate.lat, coordinate.lon, dem.dataAvailable ? dem : undefined);
      const result = analyzeIlluminationWindow(
        coordinate,
        dateUtc || new Date().toISOString(),
        periodHours,
        horizon
      );
      res.json({ illumination: result, horizon });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Illumination calculation failed.',
      });
    }
  });

  app.get('/api/earth/power/:facilityId', async (req, res) => {
    const data = await fetchNasaPowerForFacility(req.params.facilityId);
    res.json(data);
  });

  app.get('/api/earth/eonet', async (_req, res) => {
    const data = await fetchNasaEonetEvents();
    res.json(data);
  });

  app.get('/api/space/donki', async (_req, res) => {
    const data = await fetchNasaDonkiEvents();
    res.json(data);
  });

  app.get('/api/tiles/moon/:layer/:z/:y/:x', async (req, res) => {
    const { layer, z, y, x } = req.params;
    const tile = await proxyMoonTrekTile(layer, z, y, x);
    if (!tile) {
      res.status(404).send('Tile unavailable');
      return;
    }
    res.setHeader('Content-Type', tile.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(tile.buffer);
  });

  app.get('/api/datasets', (_req, res) => {
    res.json(getDatasetsStatus());
  });

  app.post('/api/datasets/clear-cache', (_req, res) => {
    res.json(clearNasaCache());
  });

  app.get('/api/missions', (_req, res) => {
    res.json({ missions: loadMissions() });
  });

  app.post('/api/missions', (req, res) => {
    const plan = req.body as MissionPlan;
    if (!plan || !plan.id || !plan.name) {
      res.status(400).json({ error: 'Invalid mission payload.' });
      return;
    }
    const missions = saveMission(plan);
    res.json({ missions });
  });

  app.delete('/api/missions/:id', (req, res) => {
    const missions = deleteMission(req.params.id);
    res.json({ missions });
  });

  app.get('/api/locations', (_req, res) => {
    res.json({ locations: loadSavedLocations() });
  });

  app.post('/api/locations', (req, res) => {
    const { locations } = req.body as { locations: LunarCoordinate[] };
    if (!Array.isArray(locations)) {
      res.status(400).json({ error: 'locations array required.' });
      return;
    }
    res.json({ locations: saveLocationList(locations) });
  });

  app.post('/api/ai/chat', async (req, res) => {
    try {
      const { messages, context } = req.body as {
        messages: AiChatMessage[];
        context: AiContextPayload;
      };
      if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({ error: 'Messages array is required.' });
        return;
      }
      const provider = getAiProvider();
      const reply = await provider.generateReply(messages, context || { activePage: 'unknown' });
      res.json({ reply, provider: provider.name });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI request failed.';
      res.status(502).json({ error: msg });
    }
  });

  app.post('/api/ai/video', async (req, res) => {
    try {
      const { imageBase64, mimeType, prompt, aspectRatio, duration } = req.body as {
        imageBase64: string;
        mimeType?: string;
        prompt?: string;
        aspectRatio?: '16:9' | '9:16';
        duration?: '5s' | '8s' | '10s';
      };
      if (!imageBase64) {
        res.status(400).json({ error: 'imageBase64 photo input is required.' });
        return;
      }
      const result = await generateVideoFromImage({
        imageBase64,
        mimeType: mimeType || 'image/png',
        prompt: prompt || '',
        aspectRatio: aspectRatio === '9:16' ? '9:16' : '16:9',
        duration: duration || '5s',
      });
      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Video generation failed.';
      const status = /paid|billing|permission|403|not configured/i.test(msg) ? 402 : 502;
      res.status(status).json({ error: msg });
    }
  });

  // Vite middleware in dev; static dist/ in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ARC LUNA — LUNASIGHT server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
