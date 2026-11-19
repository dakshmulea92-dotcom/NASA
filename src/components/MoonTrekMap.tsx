import React, { useMemo, useState } from 'react';
import { Layers, ZoomIn, ZoomOut } from 'lucide-react';
import { useLunar } from '../context/LunarContext.tsx';

/**
 * Live NASA Moon Trek OGC WMTS Tile Mosaic Viewer
 * Streams genuine NASA LRO_WAC_Mosaic_Global_303ppd_v02 and LRO_LOLA_ClrShade_Global_128ppd_v04
 * equirectangular tiles via /api/tiles/moon/:layer/:z/:y/:x.
 */
export const MoonTrekMap: React.FC = () => {
  const { selectedCoord, setSelectedCoord } = useLunar();
  const [layer, setLayer] = useState<'wac' | 'lola_shade' | 'minirf_s1' | 'minirf_cpr'>('wac');
  const [zoom, setZoom] = useState<number>(3);

  const maxZoomForLayer = layer === 'wac' ? 6 : 5;

  // Moon Trek EQ WMTS Matrix: cols = 2^(z+1), rows = 2^z
  const cols = Math.pow(2, zoom + 1);
  const rows = Math.pow(2, zoom);

  const centerTile = useMemo(() => {
    const lonNorm = ((selectedCoord.lon + 180) % 360 + 360) % 360;
    const latNorm = 90 - Math.max(-90, Math.min(90, selectedCoord.lat));
    const exactX = (lonNorm / 360) * cols;
    const exactY = (latNorm / 180) * rows;
    return {
      cx: Math.floor(exactX),
      cy: Math.floor(exactY),
      fracX: exactX - Math.floor(exactX),
      fracY: exactY - Math.floor(exactY),
    };
  }, [selectedCoord.lat, selectedCoord.lon, cols, rows]);

  const tileOffsets = [-1, 0, 1];

  const handleTileClick = (
    e: React.MouseEvent<HTMLDivElement>,
    tx: number,
    ty: number
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    const lon = Number((((tx + fx) / cols) * 360 - 180).toFixed(3));
    const lat = Number((90 - ((ty + fy) / rows) * 180).toFixed(3));
    setSelectedCoord({
      lat: Math.max(-90, Math.min(90, lat)),
      lon,
      name: `Moon Trek Pick (${lat.toFixed(2)}°, ${lon.toFixed(2)}°)`,
      source:
        layer === 'wac'
          ? 'NASA LRO WAC Mosaic WMTS'
          : layer === 'lola_shade'
          ? 'NASA LOLA Color Shaded WMTS'
          : 'NASA LRO Mini-RF S-Band Radar WMTS',
    });
  };

  return (
    <div className="bg-[#0B1120] border border-slate-800 rounded-md p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            Live NASA Moon Trek WMTS Mosaic Stream
          </h3>
          <p className="text-xs font-mono text-slate-400">
            {layer === 'wac'
              ? 'LRO_WAC_Mosaic_Global_303ppd_v02 (Optical 100 m/px)'
              : layer === 'lola_shade'
              ? 'LRO_LOLA_ClrShade_Global_128ppd_v04 (Relief 237 m/px)'
              : layer === 'minirf_s1'
              ? 'LRO_MiniRF_S1_Gray_Global_128ppd (2.38 GHz SAR S1)'
              : 'LRO_MiniRF_CPR_Gray_Global_128ppd (2.38 GHz SAR CPR)'}{' '}
            · Z{zoom}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setLayer('wac')}
            className={`px-2 py-1 text-xs rounded border ${
              layer === 'wac'
                ? 'bg-cyan-600/20 border-cyan-500 text-cyan-200 font-semibold'
                : 'bg-[#060911] border-slate-700 text-slate-300'
            }`}
          >
            LROC WAC
          </button>
          <button
            onClick={() => {
              setLayer('lola_shade');
              setZoom((z) => Math.min(5, z));
            }}
            className={`px-2 py-1 text-xs rounded border ${
              layer === 'lola_shade'
                ? 'bg-cyan-600/20 border-cyan-500 text-cyan-200 font-semibold'
                : 'bg-[#060911] border-slate-700 text-slate-300'
            }`}
          >
            LOLA Relief
          </button>
          <button
            onClick={() => {
              setLayer('minirf_s1');
              setZoom((z) => Math.min(5, z));
            }}
            className={`px-2 py-1 text-xs rounded border ${
              layer === 'minirf_s1'
                ? 'bg-amber-600/20 border-amber-500 text-amber-200 font-semibold'
                : 'bg-[#060911] border-slate-700 text-slate-300'
            }`}
          >
            Mini-RF S1
          </button>
          <button
            onClick={() => {
              setLayer('minirf_cpr');
              setZoom((z) => Math.min(5, z));
            }}
            className={`px-2 py-1 text-xs rounded border ${
              layer === 'minirf_cpr'
                ? 'bg-amber-600/20 border-amber-500 text-amber-200 font-semibold'
                : 'bg-[#060911] border-slate-700 text-slate-300'
            }`}
          >
            Mini-RF CPR
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(1, z - 1))}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-200"
            aria-label="Zoom out Moon Trek"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setZoom((z) => Math.min(maxZoomForLayer, z + 1))}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded text-slate-200"
            aria-label="Zoom in Moon Trek"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="relative w-full aspect-square max-w-[440px] mx-auto bg-[#04070e] border border-slate-800 rounded overflow-hidden">
        <div className="grid grid-cols-3 grid-rows-3 w-full h-full">
          {tileOffsets.map((dy) =>
            tileOffsets.map((dx) => {
              const rawY = centerTile.cy + dy;
              const tx = ((centerTile.cx + dx) % cols + cols) % cols;
              const validY = rawY >= 0 && rawY < rows;
              return (
                <div
                  key={`${dx}_${dy}`}
                  onClick={(e) => validY && handleTileClick(e, tx, rawY)}
                  className="relative w-full h-full bg-[#060911] cursor-crosshair overflow-hidden"
                >
                  {validY ? (
                    <img
                      src={`/api/tiles/moon/${layer}/${zoom}/${rawY}/${tx}`}
                      alt={`NASA Moon Trek tile ${zoom}/${rawY}/${tx}`}
                      className="w-full h-full object-cover block select-none"
                      draggable={false}
                    />
                  ) : (
                    <div className="w-full h-full bg-[#04070e] flex items-center justify-center text-[10px] font-mono text-slate-700">
                      POLE BOUND
                    </div>
                  )}
                  {dx === 0 && dy === 0 && (
                    <div
                      className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2"
                      style={{
                        left: `${centerTile.fracX * 100}%`,
                        top: `${centerTile.fracY * 100}%`,
                      }}
                    >
                      <div className="w-6 h-6 rounded-full border-2 border-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.85)] flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-cyan-300" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        <div className="absolute bottom-2 left-2 bg-[#060911]/90 border border-slate-700 px-2 py-1 rounded text-[11px] font-mono text-slate-200 pointer-events-none">
          Click anywhere on NASA Moon Trek imagery to retarget LOLA DEM
        </div>
      </div>
    </div>
  );
};
