import React, { useEffect, useRef, useState } from 'react';
import type { DemGridResult, LunarCoordinate } from '../types/lunar.ts';

interface ScientificMapCanvasProps {
  dem: DemGridResult | null;
  mode: 'elevation' | 'slope';
  loading?: boolean;
  onSelectPoint?: (lat: number, lon: number) => void;
  routePoints?: Array<{ row: number; col: number }>;
  transectLine?: { r0: number; c0: number; r1: number; c1: number } | null;
  title?: string;
}

const MOON_RADIUS_M = 1737400;

function colorRampElevation(t: number): [number, number, number] {
  // Perceptual hypsometric blue -> cyan -> slate -> amber -> white
  const x = Math.max(0, Math.min(1, t));
  if (x < 0.25) {
    const k = x / 0.25;
    return [Math.round(14 + k * 14), Math.round(35 + k * 85), Math.round(92 + k * 88)];
  }
  if (x < 0.5) {
    const k = (x - 0.25) / 0.25;
    return [Math.round(28 + k * 46), Math.round(120 + k * 65), Math.round(180 - k * 40)];
  }
  if (x < 0.75) {
    const k = (x - 0.5) / 0.25;
    return [Math.round(74 + k * 155), Math.round(185 - k * 25), Math.round(140 - k * 95)];
  }
  const k = (x - 0.75) / 0.25;
  return [Math.round(229 + k * 26), Math.round(160 + k * 85), Math.round(45 + k * 195)];
}

function colorRampSlope(deg: number): [number, number, number] {
  // 0-5 deg safe teal, 5-12 deg caution amber, >15 deg hazard crimson
  const x = Math.max(0, Math.min(1, deg / 28));
  if (x < 0.25) {
    const k = x / 0.25;
    return [Math.round(12 + k * 12), Math.round(80 + k * 90), Math.round(105 + k * 35)];
  }
  if (x < 0.55) {
    const k = (x - 0.25) / 0.3;
    return [Math.round(24 + k * 215), Math.round(170 - k * 15), Math.round(140 - k * 110)];
  }
  const k = (x - 0.55) / 0.45;
  return [Math.round(239), Math.round(155 - k * 115), Math.round(30 + k * 28)];
}

export const ScientificMapCanvas: React.FC<ScientificMapCanvasProps> = ({
  dem,
  mode,
  loading = false,
  onSelectPoint,
  routePoints,
  transectLine,
  title,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{
    lat: number;
    lon: number;
    elevM: number;
    slopeDeg: number;
  } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !dem || !dem.dataAvailable || dem.elevationsMeters.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 420;
    canvas.width = size;
    canvas.height = size;

    const n = dem.gridSize;
    const cellPx = size / n;
    const elevRange = Math.max(1, dem.maxElevationM - dem.minElevationM);

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const val =
          mode === 'elevation' ? dem.elevationsMeters[r][c] : dem.slopesDeg[r]?.[c] ?? 0;
        const [rr, gg, bb] =
          mode === 'elevation'
            ? colorRampElevation((val - dem.minElevationM) / elevRange)
            : colorRampSlope(val);
        ctx.fillStyle = `rgb(${rr},${gg},${bb})`;
        ctx.fillRect(c * cellPx, r * cellPx, Math.ceil(cellPx), Math.ceil(cellPx));
      }
    }

    // Subtle coordinate grid overlay
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const p = (size * i) / 4;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(size, p);
      ctx.stroke();
    }

    // Center target crosshair
    const cx = size / 2;
    const cy = size / 2;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.moveTo(cx - 14, cy);
    ctx.lineTo(cx - 4, cy);
    ctx.moveTo(cx + 4, cy);
    ctx.lineTo(cx + 14, cy);
    ctx.moveTo(cx, cy - 14);
    ctx.lineTo(cx, cy - 4);
    ctx.moveTo(cx, cy + 4);
    ctx.lineTo(cx, cy + 14);
    ctx.stroke();

    // Optional transect line
    if (transectLine) {
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo((transectLine.c0 + 0.5) * cellPx, (transectLine.r0 + 0.5) * cellPx);
      ctx.lineTo((transectLine.c1 + 0.5) * cellPx, (transectLine.r1 + 0.5) * cellPx);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Optional rover route
    if (routePoints && routePoints.length > 1) {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      routePoints.forEach((pt, idx) => {
        const px = (pt.col + 0.5) * cellPx;
        const py = (pt.row + 0.5) * cellPx;
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }
  }, [dem, mode, routePoints, transectLine]);

  const handlePointer = (e: React.MouseEvent<HTMLCanvasElement>, isClick: boolean) => {
    if (!dem || !dem.dataAvailable || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const n = dem.gridSize;
    const c = Math.min(n - 1, Math.floor(nx * n));
    const r = Math.min(n - 1, Math.floor(ny * n));

    const spanM = dem.radiusKm * 1000;
    const dxM = -spanM + (c / (n - 1)) * (2 * spanM);
    const dyM = spanM - (r / (n - 1)) * (2 * spanM);
    const cosLat = Math.max(0.05, Math.cos((dem.centerLat * Math.PI) / 180));
    const lat = Number((dem.centerLat + (dyM / MOON_RADIUS_M) * (180 / Math.PI)).toFixed(4));
    const lon = Number(
      (dem.centerLon + (dxM / (MOON_RADIUS_M * cosLat)) * (180 / Math.PI)).toFixed(4)
    );

    setHoverInfo({
      lat,
      lon,
      elevM: dem.elevationsMeters[r]?.[c] ?? 0,
      slopeDeg: dem.slopesDeg[r]?.[c] ?? 0,
    });

    if (isClick && onSelectPoint) {
      onSelectPoint(lat, lon);
    }
  };

  return (
    <div className="bg-[#0B1120] border border-slate-800 rounded-md p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">
            {title || (mode === 'elevation' ? 'LOLA Elevation Digital Model' : 'Horn 3x3 Slope Distribution Map')}
          </h3>
          <p className="text-xs text-slate-400 font-mono">
            {dem ? `${dem.datasetUsed.datasetId} · ${dem.datasetUsed.spatialResolution}` : 'Awaiting LOLA DEM'}
          </p>
        </div>
        {dem && (
          <div className="text-right text-xs font-mono text-slate-400">
            <div>Radius: {dem.radiusKm} km</div>
            <div>Grid: {Math.round(dem.cellSizeMeters)} m/cell</div>
          </div>
        )}
      </div>

      <div className="relative aspect-square w-full max-w-[440px] mx-auto bg-[#060911] border border-slate-800 rounded overflow-hidden">
        {loading && (
          <div className="absolute inset-0 z-10 bg-[#060911]/85 flex flex-col items-center justify-center gap-2 text-xs font-mono text-cyan-300">
            <span>Querying NASA LOLA PDS3 Raster...</span>
          </div>
        )}
        {!loading && (!dem || !dem.dataAvailable) && (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs font-mono text-amber-400">
            {dem?.unavailableReason || 'NASA DATA UNAVAILABLE'}
          </div>
        )}
        <canvas
          ref={canvasRef}
          onMouseMove={(e) => handlePointer(e, false)}
          onMouseLeave={() => setHoverInfo(null)}
          onClick={(e) => handlePointer(e, true)}
          className="w-full h-full cursor-crosshair block"
        />

        {/* Scale bar overlay */}
        {dem && dem.dataAvailable && (
          <div className="absolute bottom-2 left-2 bg-[#060911]/90 border border-slate-700 px-2 py-1 rounded text-[11px] font-mono text-slate-200 pointer-events-none">
            <div className="flex items-center gap-2">
              <span className="inline-block w-12 h-1 bg-slate-200" />
              <span>{Math.round(dem.radiusKm / 2)} km</span>
            </div>
          </div>
        )}

        {/* Hover telemetry */}
        {hoverInfo && (
          <div className="absolute top-2 right-2 bg-[#060911]/95 border border-slate-700 px-2.5 py-1.5 rounded text-[11px] font-mono text-slate-200 pointer-events-none">
            <div>
              {hoverInfo.lat.toFixed(3)}°, {hoverInfo.lon.toFixed(3)}°
            </div>
            <div className="text-cyan-300">
              Elev: {hoverInfo.elevM.toFixed(1)} m · Slope: {hoverInfo.slopeDeg.toFixed(2)}°
            </div>
          </div>
        )}
      </div>

      {/* Legend & provenance */}
      {dem && dem.dataAvailable && (
        <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>
              {mode === 'elevation'
                ? `${dem.minElevationM.toFixed(0)} m`
                : '0.0° (Flat)'}
            </span>
            <span className="text-slate-300">
              {mode === 'elevation' ? 'Elevation vs. 1737.4 km Sphere (m)' : 'Terrain Slope (deg)'}
            </span>
            <span>
              {mode === 'elevation'
                ? `${dem.maxElevationM.toFixed(0)} m`
                : `${Math.max(25, Math.round(dem.maxSlopeDeg))}°+ (Steep)`}
            </span>
          </div>
          <div
            className="h-2 w-full rounded-sm"
            style={{
              background:
                mode === 'elevation'
                  ? 'linear-gradient(90deg, rgb(14,35,92), rgb(28,120,180), rgb(74,185,140), rgb(229,160,45), rgb(255,245,240))'
                  : 'linear-gradient(90deg, rgb(12,80,105), rgb(24,170,140), rgb(239,155,30), rgb(239,40,58))',
            }}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 font-mono">
            <span>CRS: {dem.datasetUsed.crs}</span>
            <span>Source: {dem.datasetUsed.source}</span>
          </div>
        </div>
      )}
    </div>
  );
};
