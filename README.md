# ARC LUNA — LUNASIGHT

**Advanced Lunar Navigation, Intelligence & Mission Simulation Platform**

ARC LUNA — LUNASIGHT is a full-stack scientific lunar exploration, terrain intelligence, and mission simulation platform built with React, TypeScript, Express, Three.js, and official NASA planetary data and 3D assets.

## Architecture

- **Frontend (`src/`)**: React 19 + TypeScript + Tailwind CSS v4 + Three.js WebGL scenes.
  - Synchronized global state (`LunarContext`) keeps the active lunar coordinate `(lat, lon)`, LOLA DEM assessment, DE421 solar illumination, saved missions, and lightweight rendering preferences aligned across all 13 pages.
- **Backend (`server.ts` & `server/`)**: Express server integrating Vite middleware in development and serving static builds in production (`PORT=3000` by default).
  - `server/lolaEngine.ts`: Parses NASA PDS3 `.LBL` metadata (`LDEM_4`, `LDEM_16`, `LDEM_64`, `LDEM_80S_80M`, `LDEM_80N_80M`), samples local `LDEM_4.IMG`, and performs HTTP Byte-Range regional scanline cropping with local disk caching (`data/nasa/cache/`) to compute Horn 3×3 slopes, RMS roughness, Terrain Ruggedness Index (TRI), local depression detection, and 72-azimuth curvature-corrected horizon angles.
  - `server/ephemerisEngine.ts`: Computes analytical JPL DE421-compatible selenographic sub-solar coordinates, solar elevation/azimuth/incidence, and LOLA-horizon-masked illumination timelines.
  - `server/nasaExternal.ts`: Queries the NASA Langley POWER API (`MERRA-2` reanalysis), proxies/caches NASA Moon Trek WMTS tiles, and reports Scientific Data Center cache statistics.
  - `server/lunaAi.ts`: Modular server-side `@google/genai` (`gemini-4-hydrogen`) provider grounded exclusively in active application telemetry.

## Official NASA Data Sources & 3D Assets

1. **NASA SVS #14959 — Moon 3D Models**: `public/models/moon_nasa_lro.glb` & `moon_nasa_grid.glb` (LRO imagery & grid glTF 2.0 assets).
2. **NASA Solar System Exploration (`gltf_embed/2393`) — Earth 3D Model**: `public/models/earth_nasa.glb`.
3. **NASA Science Heliophysics — Sun 3D Model**: `public/models/sun_nasa.glb`.
4. **NASA LRO LOLA PDS3 Gridded Data Records (`LRO-L-LOLA-4-GDR-V1.0`)**:
   - Local baseline: `data/nasa/LDEM_4.IMG` + `LDEM_4.LBL` (`4 ppd`, `7,580.84 m/px`).
   - On-demand byte-range cropped rasters: `LDEM_16.IMG` (`1,895.21 m/px`), `LDEM_64.IMG` (`473.80 m/px`), and Polar Stereographic `LDEM_80S_80M.IMG` / `LDEM_80N_80M.IMG` (`80 m/px`).
5. **NASA Moon Trek OGC WMTS**: `LRO_WAC_Mosaic_Global_303ppd_v02` & `LRO_LOLA_ClrShade_Global_128ppd_v04`.
6. **NASA Langley POWER API**: Daily `MERRA-2` / `CERES` reanalysis meteorology for global launch facilities (explicitly labeled as reanalysis, never live operational weather forecasts).

## Environment Configuration

Configure environment variables in `.env` (see `.env.example`):

- `GEMINI_API_KEY`: Server-side Gemini API key for LUNA AI (`/api/ai/chat`). Never exposed to browser code.
- `PORT`: Server port (defaults to `3000`).

## Running Locally

```bash
npm install
npm run dev
```

For production build and start:

```bash
npm run build
npm start
```
