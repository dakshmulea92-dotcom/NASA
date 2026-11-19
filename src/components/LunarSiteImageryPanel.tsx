import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Compass, Layers, Radio, ShieldCheck, Sun, ZoomIn, ZoomOut } from 'lucide-react';
import { useLunar } from '../context/LunarContext.tsx';
import { formatCoordPair } from '../utils/coordinateFormat.ts';

type RfLayer = 'minirf_s1' | 'minirf_cpr';
type ExtraLayer = 'lola_shade' | 'diviner_temp';

interface CenteredTileViewportProps {
  layer: 'wac' | 'minirf_s1' | 'minirf_cpr' | 'lola_shade' | 'diviner_temp';
  zoom: number;
  lat: number;
  lon: number;
  label: string;
  badge: string;
  accentColor: string;
  onClickPick?: (newLat: number, newLon: number) => void;
}

/**
 * Renders a 3x3 NASA Moon Trek WMTS mosaic translated so the exact (lat, lon) coordinate
 * sits dead-center beneath the target reticle with zero tile-boundary clipping.
 */
const CenteredTileViewport: React.FC<CenteredTileViewportProps> = ({
  layer,
  zoom,
  lat,
  lon,
  label,
  badge,
  accentColor,
  onClickPick,
}) => {
  const cols = Math.pow(2, zoom + 1);
  const rows = Math.pow(2, zoom);

  const pos = useMemo(() => {
    const lonNorm = ((lon + 180) % 360 + 360) % 360;
    const latNorm = 90 - Math.max(-90, Math.min(90, lat));
    const exactX = (lonNorm / 360) * cols;
    const exactY = (latNorm / 180) * rows;
    const cx = Math.min(cols - 1, Math.max(0, Math.floor(exactX)));
    const cy = Math.min(rows - 1, Math.max(0, Math.floor(exactY)));
    return {
      cx,
      cy,
      fracX: exactX - cx,
      fracY: exactY - cy,
    };
  }, [lat, lon, cols, rows]);

  const txPct = -((0.5 + pos.fracX) / 3) * 100;
  const tyPct = -((0.5 + pos.fracY) / 3) * 100;

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onClickPick) return;
    const rect = e.currentTarget.getBoundingClientRect();
    // Delta from viewport center in tile units (each tile = 100% of viewport)
    const dxTile = (e.clientX - rect.left) / rect.width - 0.5;
    const dyTile = (e.clientY - rect.top) / rect.height - 0.5;
    const clickedX = pos.cx + pos.fracX + dxTile;
    const clickedY = pos.cy + pos.fracY + dyTile;
    const pickedLon = Number((((((clickedX / cols) * 360 - 180 + 540) % 360) - 180)).toFixed(3));
    const pickedLat = Number(Math.max(-90, Math.min(90, 90 - (clickedY / rows) * 180)).toFixed(3));
    onClickPick(pickedLat, pickedLon);
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-semibold text-slate-200 truncate">{label}</span>
        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">
          {badge}
        </span>
      </div>
      <div
        onClick={handleClick}
        className="relative aspect-square w-full bg-[#04070e] border border-slate-700/90 rounded overflow-hidden cursor-crosshair select-none"
      >
        <div
          className="grid grid-cols-3 grid-rows-3 w-[300%] h-[300%]"
          style={{ transform: `translate(${txPct.toFixed(4)}%, ${tyPct.toFixed(4)}%)` }}
        >
          {[-1, 0, 1].map((dy) =>
            [-1, 0, 1].map((dx) => {
              const rawY = pos.cy + dy;
              const tileX = ((pos.cx + dx) % cols + cols) % cols;
              const validY = rawY >= 0 && rawY < rows;
              return (
                <div key={`${dx}_${dy}`} className="w-full h-full bg-[#04070e]">
                  {validY ? (
                    <img
                      src={`/api/tiles/moon/${layer}/${zoom}/${rawY}/${tileX}`}
                      alt={`${label} Z${zoom}/${rawY}/${tileX}`}
                      className="w-full h-full object-cover block pointer-events-none"
                      draggable={false}
                    />
                  ) : (
                    <div className="w-full h-full bg-[#03050a] flex items-center justify-center text-[10px] font-mono text-slate-600">
                      POLE BOUND
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Center Target Crosshair */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div
            className="w-7 h-7 rounded-full border-2 flex items-center justify-center"
            style={{
              borderColor: accentColor,
              boxShadow: `0 0 10px ${accentColor}`,
            }}
          >
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accentColor }} />
          </div>
          <div className="absolute inset-x-0 top-1/2 h-px bg-white/15" />
          <div className="absolute inset-y-0 left-1/2 w-px bg-white/15" />
        </div>
      </div>
    </div>
  );
};

export const LunarSiteImageryPanel: React.FC = () => {
  const {
    selectedCoord,
    setSelectedCoord,
    assessment,
    illumination,
    loadingAnalysis,
    settings,
    setActivePage,
  } = useLunar();

  const [zoom, setZoom] = useState<number>(4);
  const [rfMode, setRfMode] = useState<RfLayer>('minirf_s1');
  const [extraLayer, setExtraLayer] = useState<ExtraLayer>('lola_shade');
  const [showExtraStrip, setShowExtraStrip] = useState<boolean>(false);

  const transectCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dem = assessment?.dem;
  const scores = assessment?.scores;

  // Draw mini W-E LOLA elevation transect right inside the side panel
  useEffect(() => {
    const canvas = transectCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#050811';
    ctx.fillRect(0, 0, w, h);

    if (!dem || !dem.dataAvailable || dem.elevationsMeters.length === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '10px monospace';
      ctx.fillText(loadingAnalysis ? 'Sampling LOLA GDR...' : 'NASA DATA UNAVAILABLE', 12, h / 2 + 3);
      return;
    }

    const midRow = Math.floor(dem.gridSize / 2);
    const row = dem.elevationsMeters[midRow] || [];
    const slopes = dem.slopesDeg[midRow] || [];
    const minE = Math.min(...row);
    const maxE = Math.max(...row);
    const span = Math.max(15, maxE - minE);

    const grad = ctx.createLinearGradient(0, 8, 0, h - 8);
    grad.addColorStop(0, 'rgba(34,211,238,0.32)');
    grad.addColorStop(1, 'rgba(34,211,238,0.02)');

    ctx.beginPath();
    row.forEach((el, c) => {
      const x = 6 + (c / Math.max(1, row.length - 1)) * (w - 12);
      const y = h - 10 - ((el - minE) / span) * (h - 22);
      if (c === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(w - 6, h - 8);
    ctx.lineTo(6, h - 8);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    for (let c = 1; c < row.length; c++) {
      const x0 = 6 + ((c - 1) / Math.max(1, row.length - 1)) * (w - 12);
      const y0 = h - 10 - ((row[c - 1] - minE) / span) * (h - 22);
      const x1 = 6 + (c / Math.max(1, row.length - 1)) * (w - 12);
      const y1 = h - 10 - ((row[c] - minE) / span) * (h - 22);
      const sl = slopes[c] ?? 0;
      ctx.strokeStyle = sl > 15 ? '#f43f5e' : sl > 8 ? '#fbbf24' : '#22d3ee';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(w / 2, 4);
    ctx.lineTo(w / 2, h - 6);
    ctx.stroke();
    ctx.setLineDash([]);
  }, [dem, loadingAnalysis]);

  const badgeTone =
    assessment?.classification === 'SUITABLE'
      ? 'text-emerald-300 border-emerald-700/60 bg-emerald-950/50'
      : assessment?.classification === 'CONDITIONAL'
      ? 'text-amber-300 border-amber-700/60 bg-amber-950/50'
      : 'text-rose-300 border-rose-700/60 bg-rose-950/50';

  const handleTilePick = (lat: number, lon: number) => {
    setSelectedCoord({
      lat,
      lon,
      name: `Lunar Target (${lat.toFixed(2)}°, ${lon.toFixed(2)}°)`,
      regionType: Math.abs(lat) > 80 ? 'Polar Terrain' : 'Lunar Surface',
      source: 'NASA LRO WAC / Mini-RF / LOLA',
    });
  };

  return (
    <div className="bg-[#0B1120] border border-slate-800 rounded-md p-4 space-y-3.5">
      {/* Header & Target Coordinate */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-mono text-cyan-400 flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 shrink-0" />
            <span>SYNCHRONIZED SITE IMAGERY &amp; TELEMETRY</span>
          </div>
          <h2 className="text-base font-display font-bold text-slate-100 truncate mt-0.5">
            {selectedCoord.name || 'Selected Lunar Location'}
          </h2>
          <div className="text-xs font-mono text-cyan-300">
            {formatCoordPair(selectedCoord, settings.coordinateFormat)} ·{' '}
            <span className="text-slate-400">{selectedCoord.regionType || 'Lunar Surface'}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setZoom((z) => Math.max(2, z - 1))}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-200"
            title="Zoom Out Imagery"
            aria-label="Zoom out site imagery"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[11px] font-mono text-slate-300 px-1.5">Z{zoom}</span>
          <button
            onClick={() => setZoom((z) => Math.min(5, z + 1))}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-200"
            title="Zoom In Imagery"
            aria-label="Zoom in site imagery"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Dual Real NASA Photograph + Radio Frequency Radar Image */}
      <div className="grid grid-cols-2 gap-3">
        <CenteredTileViewport
          layer="wac"
          zoom={zoom}
          lat={selectedCoord.lat}
          lon={selectedCoord.lon}
          label="Real Photo (LROC WAC)"
          badge="OPTICAL 100m/px"
          accentColor="#22d3ee"
          onClickPick={handleTilePick}
        />

        <CenteredTileViewport
          layer={rfMode}
          zoom={zoom}
          lat={selectedCoord.lat}
          lon={selectedCoord.lon}
          label={rfMode === 'minirf_s1' ? 'Radio Freq (Mini-RF S1)' : 'Radio Freq (Mini-RF CPR)'}
          badge="2.38 GHz SAR"
          accentColor="#f59e0b"
          onClickPick={handleTilePick}
        />
      </div>

      {/* Radio Frequency & Secondary Relief/Thermal Layer Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] pt-0.5">
        <div className="flex items-center gap-1">
          <Radio className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-slate-400 mr-1">RF Band:</span>
          <button
            onClick={() => setRfMode('minirf_s1')}
            className={`px-2 py-0.5 rounded border font-mono ${
              rfMode === 'minirf_s1'
                ? 'bg-amber-500/20 border-amber-500 text-amber-200'
                : 'bg-[#060911] border-slate-700 text-slate-400'
            }`}
          >
            S1 Backscatter
          </button>
          <button
            onClick={() => setRfMode('minirf_cpr')}
            className={`px-2 py-0.5 rounded border font-mono ${
              rfMode === 'minirf_cpr'
                ? 'bg-amber-500/20 border-amber-500 text-amber-200'
                : 'bg-[#060911] border-slate-700 text-slate-400'
            }`}
          >
            CPR Polarization
          </button>
        </div>

        <button
          onClick={() => setShowExtraStrip((s) => !s)}
          className="px-2 py-0.5 rounded border border-slate-700 bg-[#060911] text-cyan-300 hover:border-cyan-600 flex items-center gap-1 font-mono"
        >
          <Layers className="w-3 h-3" />
          {showExtraStrip ? 'Hide Relief/IR' : '+ LOLA Relief / Diviner'}
        </button>
      </div>

      {showExtraStrip && (
        <div className="bg-[#060911] border border-slate-800 rounded p-2.5 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-300 font-semibold flex items-center gap-1">
              <Camera className="w-3.5 h-3.5 text-cyan-400" />
              Additional NASA Orbital Map
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setExtraLayer('lola_shade')}
                className={`px-2 py-0.5 rounded border font-mono ${
                  extraLayer === 'lola_shade'
                    ? 'bg-cyan-600/20 border-cyan-500 text-cyan-200'
                    : 'bg-slate-900 border-slate-700 text-slate-400'
                }`}
              >
                LOLA Shaded Relief
              </button>
              <button
                onClick={() => setExtraLayer('diviner_temp')}
                className={`px-2 py-0.5 rounded border font-mono ${
                  extraLayer === 'diviner_temp'
                    ? 'bg-rose-600/20 border-rose-500 text-rose-200'
                    : 'bg-slate-900 border-slate-700 text-slate-400'
                }`}
              >
                Diviner IR Temp
              </button>
            </div>
          </div>
          <div className="max-w-[230px] mx-auto">
            <CenteredTileViewport
              layer={extraLayer}
              zoom={zoom}
              lat={selectedCoord.lat}
              lon={selectedCoord.lon}
              label={extraLayer === 'lola_shade' ? 'NASA LOLA Elevation Relief' : 'NASA Diviner Rock-Free Temp'}
              badge={extraLayer === 'lola_shade' ? 'LOLA 128ppd' : 'DLRE 128ppd'}
              accentColor="#34d399"
              onClickPick={handleTilePick}
            />
          </div>
        </div>
      )}

      {/* Terrain & Elevation Telemetry + Profile */}
      <div className="pt-2 border-t border-slate-800 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono text-slate-400">
            LOLA TERRAIN, ELEVATION &amp; TRANSECT
          </span>
          <span className="text-[11px] font-mono text-slate-400">
            {dem?.dataAvailable ? `${dem.detectedCraters.length} catalog craters` : '---'}
          </span>
        </div>

        <canvas
          ref={transectCanvasRef}
          width={380}
          height={64}
          className="w-full h-16 rounded border border-slate-800 bg-[#050811] block"
        />

        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-[#060911] border border-slate-800 rounded p-2">
            <div className="text-slate-400 font-mono text-[10px]">Mean Elevation</div>
            <div className="font-mono font-semibold text-slate-100 tabular-nums mt-0.5">
              {loadingAnalysis ? '...' : dem?.dataAvailable ? `${dem.meanElevationM.toFixed(0)} m` : 'N/A'}
            </div>
            <div className="text-[10px] font-mono text-slate-500 truncate">
              {dem?.dataAvailable ? `${dem.minElevationM.toFixed(0)}..${dem.maxElevationM.toFixed(0)}m` : '---'}
            </div>
          </div>

          <div className="bg-[#060911] border border-slate-800 rounded p-2">
            <div className="text-slate-400 font-mono text-[10px]">Slope (Mean/P95)</div>
            <div className="font-mono font-semibold text-slate-100 tabular-nums mt-0.5">
              {loadingAnalysis
                ? '...'
                : dem?.dataAvailable
                ? `${dem.meanSlopeDeg.toFixed(1)}° / ${dem.p95SlopeDeg.toFixed(1)}°`
                : 'N/A'}
            </div>
            <div className="text-[10px] font-mono text-slate-500">
              Max: {dem?.dataAvailable ? `${dem.maxSlopeDeg.toFixed(1)}°` : '---'}
            </div>
          </div>

          <div className="bg-[#060911] border border-slate-800 rounded p-2">
            <div className="text-slate-400 font-mono text-[10px]">Roughness / TRI</div>
            <div className="font-mono font-semibold text-slate-100 tabular-nums mt-0.5">
              {loadingAnalysis ? '...' : dem?.dataAvailable ? `${dem.rmsRoughnessM.toFixed(0)} m` : 'N/A'}
            </div>
            <div className="text-[10px] font-mono text-slate-500">
              TRI: {dem?.dataAvailable ? `${dem.triMeters.toFixed(0)}m` : '---'}
            </div>
          </div>
        </div>
      </div>

      {/* Landing Suitability & Illumination Summary */}
      <div className="pt-2 border-t border-slate-800 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-300">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            <span>LANDING SUITABILITY</span>
          </div>
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${badgeTone}`}>
            {assessment?.classification || 'ANALYZING'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-[#060911] border border-slate-800 rounded p-2.5 flex items-center justify-between">
            <div>
              <div className="text-[10px] font-mono text-slate-400">Safety Index</div>
              <div className="text-base font-mono font-bold text-cyan-300 tabular-nums">
                {scores ? `${scores.overallScore.toFixed(1)} / 100` : '---'}
              </div>
            </div>
            <div className="text-[10px] font-mono text-slate-400 text-right">
              <div>Slope: {scores ? scores.slopeScore.toFixed(0) : '--'}</div>
              <div>Crater: {scores ? scores.craterSafetyScore.toFixed(0) : '--'}</div>
            </div>
          </div>

          <div className="bg-[#060911] border border-slate-800 rounded p-2.5">
            <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
              <Sun className="w-3 h-3 text-amber-400" />
              30d Sunlight
            </div>
            <div className="text-base font-mono font-bold text-amber-300 tabular-nums">
              {illumination ? `${illumination.sunlitPercentage.toFixed(1)}%` : '---'}
            </div>
            <div className="text-[10px] font-mono text-slate-500 truncate">
              {illumination?.current.shadowStatus || 'Computing DE421'}
            </div>
          </div>
        </div>

        {assessment && (
          <div className="text-[11px] text-slate-300 bg-[#060911] border border-slate-800 rounded px-2.5 py-2 leading-snug">
            {assessment.rejectionReasons.length > 0
              ? `Caution: ${assessment.rejectionReasons[0]}`
              : assessment.scientificReasoning[0] ||
                'Regional terrain relief falls within macro-slope engineering bounds.'}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-0.5">
          <button
            onClick={() => setActivePage('landing-site')}
            className="px-2.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-semibold text-xs rounded"
          >
            Full Landing Report
          </button>
          <button
            onClick={() => setActivePage('terrain')}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded"
          >
            3D LOLA Terrain
          </button>
          <button
            onClick={() => setActivePage('simulator')}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs rounded"
          >
            Simulate Landing
          </button>
        </div>
      </div>
    </div>
  );
};
