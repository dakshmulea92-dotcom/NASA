import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Camera, Download, GitCompare, Plus } from 'lucide-react';
import { useLunar } from '../context/LunarContext.tsx';
import { ScientificMapCanvas } from '../components/ScientificMapCanvas.tsx';
import { LiveTerrainViewport3D } from '../components/LiveTerrainViewport3D.tsx';
import { MoonTrekMap } from '../components/MoonTrekMap.tsx';
import { PRESET_LUNAR_SITES } from '../data/lunarCatalog.ts';
import type { LandingSiteAssessment } from '../types/lunar.ts';

export const TerrainPage: React.FC = () => {
  const {
    selectedCoord,
    setSelectedCoord,
    analysisRadiusKm,
    setAnalysisRadiusKm,
    assessment,
    loadingAnalysis,
    settings,
    setCapturedSnapshot,
    setVideoModalOpen,
  } = useLunar();

  const [transectAxis, setTransectAxis] = useState<'WE' | 'NS'>('WE');
  const [probeIndex, setProbeIndex] = useState<number | null>(null);
  const [compareResults, setCompareResults] = useState<LandingSiteAssessment[]>([]);
  const [comparing, setComparing] = useState(false);

  const dem = assessment?.dem ?? null;
  const horizon = assessment?.horizon ?? null;

  const profilePoints = useMemo(() => {
    if (!dem || !dem.dataAvailable || dem.elevationsMeters.length === 0) return [];
    const n = dem.gridSize;
    const mid = Math.floor(n / 2);
    const pts: Array<{ distKm: number; elevM: number; slopeDeg: number }> = [];
    for (let i = 0; i < n; i++) {
      const distKm = -dem.radiusKm + (i / (n - 1)) * (2 * dem.radiusKm);
      const elevM =
        transectAxis === 'WE' ? dem.elevationsMeters[mid][i] : dem.elevationsMeters[i][mid];
      const slopeDeg =
        transectAxis === 'WE' ? dem.slopesDeg[mid]?.[i] ?? 0 : dem.slopesDeg[i]?.[mid] ?? 0;
      pts.push({ distKm: Number(distKm.toFixed(1)), elevM, slopeDeg });
    }
    return pts;
  }, [dem, transectAxis]);

  const transectLine = useMemo(() => {
    if (!dem) return null;
    const mid = Math.floor(dem.gridSize / 2);
    return transectAxis === 'WE'
      ? { r0: mid, c0: 0, r1: mid, c1: dem.gridSize - 1 }
      : { r0: 0, c0: mid, r1: dem.gridSize - 1, c1: mid };
  }, [dem, transectAxis]);

  const probeNorm =
    probeIndex !== null && profilePoints.length > 1
      ? probeIndex / (profilePoints.length - 1)
      : null;

  const activeProbe =
    probeIndex !== null && profilePoints[probeIndex] ? profilePoints[probeIndex] : null;

  const runComparison = async () => {
    setComparing(true);
    try {
      const candidates = [
        selectedCoord,
        ...PRESET_LUNAR_SITES.slice(0, 3).map((s) => ({
          lat: s.lat,
          lon: s.lon,
          name: s.name,
          source: s.source,
        })),
      ].slice(0, 4);

      const res = await fetch('/api/lunar/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sites: candidates,
          radiusKm: analysisRadiusKm,
          fastMode: settings.lightweightMode,
        }),
      });
      const data = (await res.json()) as { comparisons?: LandingSiteAssessment[] };
      if (Array.isArray(data.comparisons)) setCompareResults(data.comparisons);
    } finally {
      setComparing(false);
    }
  };

  const handleAnimateTerrain = () => {
    const canvas = document.querySelector('canvas');
    if (canvas) {
      try {
        setCapturedSnapshot(canvas.toDataURL('image/png'));
      } catch {
        // ignore
      }
    }
    setVideoModalOpen(true);
  };

  const exportTerrainJson = () => {
    if (!assessment) return;
    const blob = new Blob([JSON.stringify(assessment, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lola-terrain-${selectedCoord.lat.toFixed(2)}_${selectedCoord.lon.toFixed(2)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportProfileCsv = () => {
    if (profilePoints.length === 0) return;
    const header = 'distance_km,elevation_m,slope_deg\n';
    const rows = profilePoints.map((p) => `${p.distKm},${p.elevM},${p.slopeDeg}`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lola-transect-${transectAxis}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="max-w-7xl mx-auto space-y-5"
    >
      {/* Controls */}
      <div className="bg-[#0B1120] border border-slate-800 rounded-md p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-mono text-cyan-400">
            LIVE NASA LOLA PDS3 TOPOGRAPHIC ENGINE + MOON TREK WMTS
          </div>
          <h2 className="text-lg font-display font-bold text-slate-100">
            Live Terrain Intelligence &amp; 3D Horizon Analyzer
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-slate-300 flex items-center gap-2">
            Radius:
            <select
              value={analysisRadiusKm}
              onChange={(e) => setAnalysisRadiusKm(Number(e.target.value))}
              className="bg-[#060911] border border-slate-700 rounded px-2.5 py-1.5 font-mono text-xs text-slate-100"
            >
              <option value={10}>10 km</option>
              <option value={20}>20 km</option>
              <option value={35}>35 km</option>
              <option value={60}>60 km</option>
              <option value={100}>100 km</option>
            </select>
          </label>
          <button
            onClick={handleAnimateTerrain}
            className="px-3 py-1.5 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/60 text-xs text-amber-200 rounded flex items-center gap-1.5"
          >
            <Camera className="w-3.5 h-3.5" />
            Animate 3D Relief
          </button>
          <button
            onClick={exportProfileCsv}
            disabled={profilePoints.length === 0}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
          <button
            onClick={exportTerrainJson}
            disabled={!assessment}
            className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-xs font-semibold text-slate-950 rounded flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            JSON
          </button>
        </div>
      </div>

      {/* Live Interactive 3D LOLA Terrain Surface */}
      <LiveTerrainViewport3D
        dem={dem}
        horizon={horizon}
        transectAxis={transectAxis}
        probeNorm={probeNorm}
        lightweightMode={settings.lightweightMode}
      />

      {/* Elevation DEM, Slope DEM, and Live NASA Moon Trek Mosaic */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <ScientificMapCanvas
          dem={dem}
          mode="elevation"
          loading={loadingAnalysis}
          transectLine={transectLine}
          onSelectPoint={(lat, lon) =>
            setSelectedCoord({ lat, lon, name: `DEM Pick (${lat.toFixed(2)}°, ${lon.toFixed(2)}°)` })
          }
        />
        <ScientificMapCanvas
          dem={dem}
          mode="slope"
          loading={loadingAnalysis}
          transectLine={transectLine}
          onSelectPoint={(lat, lon) =>
            setSelectedCoord({ lat, lon, name: `DEM Pick (${lat.toFixed(2)}°, ${lon.toFixed(2)}°)` })
          }
        />
        <MoonTrekMap />
      </div>

      {/* Interactive Synchronized Cross-Section + 360° Horizon Analyzer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 bg-[#0B1120] border border-slate-800 rounded-md p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Interactive Terrain Cross-Section (Synced with 3D Beacon)
              </h3>
              <p className="text-xs font-mono text-slate-400">
                {activeProbe
                  ? `Probe: ${activeProbe.distKm} km · Elev ${activeProbe.elevM.toFixed(1)} m · Slope ${activeProbe.slopeDeg.toFixed(2)}°`
                  : `Move pointer across profile to scrub 3D terrain beacon (${transectAxis === 'WE' ? 'West–East' : 'North–South'})`}
              </p>
            </div>
            <div className="flex items-center gap-1 bg-[#060911] border border-slate-800 rounded p-0.5">
              <button
                onClick={() => setTransectAxis('WE')}
                className={`px-2.5 py-1 text-xs rounded ${
                  transectAxis === 'WE' ? 'bg-cyan-600 text-slate-950 font-semibold' : 'text-slate-300'
                }`}
              >
                West–East
              </button>
              <button
                onClick={() => setTransectAxis('NS')}
                className={`px-2.5 py-1 text-xs rounded ${
                  transectAxis === 'NS' ? 'bg-cyan-600 text-slate-950 font-semibold' : 'text-slate-300'
                }`}
              >
                North–South
              </button>
            </div>
          </div>

          {profilePoints.length > 0 ? (
            <div className="bg-[#060911] border border-slate-800 rounded p-3">
              <svg
                viewBox="0 0 600 220"
                className="w-full h-52 cursor-crosshair"
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const rel = Math.max(0, Math.min(1, ((e.clientX - rect.left) / rect.width - 45 / 600) / (535 / 600)));
                  setProbeIndex(Math.round(rel * (profilePoints.length - 1)));
                }}
                onMouseLeave={() => setProbeIndex(null)}
              >
                {(() => {
                  const minZ = Math.min(...profilePoints.map((p) => p.elevM));
                  const maxZ = Math.max(...profilePoints.map((p) => p.elevM));
                  const spanZ = Math.max(10, maxZ - minZ);
                  const pathD = profilePoints
                    .map((p, i) => {
                      const x = 45 + (i / (profilePoints.length - 1)) * 535;
                      const y = 185 - ((p.elevM - minZ) / spanZ) * 155;
                      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
                    })
                    .join(' ');
                  const areaD = `${pathD} L580,185 L45,185 Z`;
                  const px =
                    probeIndex !== null ? 45 + (probeIndex / (profilePoints.length - 1)) * 535 : null;
                  const py =
                    probeIndex !== null && profilePoints[probeIndex]
                      ? 185 - ((profilePoints[probeIndex].elevM - minZ) / spanZ) * 155
                      : null;

                  return (
                    <>
                      <line x1="45" y1="30" x2="580" y2="30" stroke="#1e293b" strokeDasharray="3 3" />
                      <line x1="45" y1="108" x2="580" y2="108" stroke="#1e293b" strokeDasharray="3 3" />
                      <line x1="45" y1="185" x2="580" y2="185" stroke="#334155" />
                      <line x1="312.5" y1="20" x2="312.5" y2="185" stroke="#334155" strokeDasharray="2 4" />
                      <path d={areaD} fill="rgba(6,182,212,0.16)" />
                      <path d={pathD} fill="none" stroke="#22d3ee" strokeWidth="2.2" />
                      {px !== null && py !== null && (
                        <>
                          <line x1={px} y1="20" x2={px} y2="185" stroke="#fbbf24" strokeDasharray="2 2" />
                          <circle cx={px} cy={py} r="4.5" fill="#fbbf24" stroke="#060911" strokeWidth="1.5" />
                        </>
                      )}
                      <text x="4" y="34" fill="#94a3b8" fontSize="10" fontFamily="monospace">
                        {maxZ.toFixed(0)}m
                      </text>
                      <text x="4" y="185" fill="#94a3b8" fontSize="10" fontFamily="monospace">
                        {minZ.toFixed(0)}m
                      </text>
                      <text x="45" y="205" fill="#94a3b8" fontSize="10" fontFamily="monospace">
                        -{dem?.radiusKm} km
                      </text>
                      <text x="298" y="205" fill="#cbd5e1" fontSize="10" fontFamily="monospace">
                        0 km
                      </text>
                      <text x="540" y="205" fill="#94a3b8" fontSize="10" fontFamily="monospace">
                        +{dem?.radiusKm} km
                      </text>
                    </>
                  );
                })()}
              </svg>
            </div>
          ) : (
            <div className="h-52 flex items-center justify-center text-xs font-mono text-slate-500">
              Awaiting LOLA DEM transect...
            </div>
          )}
        </div>

        <div className="lg:col-span-5 bg-[#0B1120] border border-slate-800 rounded-md p-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Terrain Horizon Analyzer</h3>
            <p className="text-xs font-mono text-slate-400">
              360° ridgeline obstruction angles with lunar curvature d²/(2R)
            </p>
          </div>

          {horizon ? (
            <div className="space-y-3">
              <div className="flex items-center justify-center bg-[#060911] border border-slate-800 rounded p-2">
                <svg viewBox="0 0 240 240" className="w-48 h-48">
                  <circle cx="120" cy="120" r="95" fill="none" stroke="#1e293b" />
                  <circle cx="120" cy="120" r="63" fill="none" stroke="#1e293b" strokeDasharray="3 3" />
                  <circle cx="120" cy="120" r="32" fill="none" stroke="#1e293b" strokeDasharray="3 3" />
                  <text x="116" y="16" fill="#94a3b8" fontSize="10" fontFamily="monospace">N</text>
                  <text x="220" y="124" fill="#94a3b8" fontSize="10" fontFamily="monospace">E</text>
                  <text x="116" y="232" fill="#94a3b8" fontSize="10" fontFamily="monospace">S</text>
                  <text x="10" y="124" fill="#94a3b8" fontSize="10" fontFamily="monospace">W</text>
                  {(() => {
                    const maxScale = Math.max(15, horizon.maxHorizonAngleDeg + 2);
                    const pts = horizon.bins
                      .map((b) => {
                        const rad = ((b.azimuthDeg - 90) * Math.PI) / 180;
                        const r = Math.max(0, Math.min(95, (b.horizonAngleDeg / maxScale) * 95));
                        return `${(120 + r * Math.cos(rad)).toFixed(1)},${(120 + r * Math.sin(rad)).toFixed(1)}`;
                      })
                      .join(' ');
                    return (
                      <polygon
                        points={pts}
                        fill="rgba(245,158,11,0.28)"
                        stroke="#f59e0b"
                        strokeWidth="1.5"
                      />
                    );
                  })()}
                </svg>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="bg-[#060911] border border-slate-800 rounded p-2">
                  <div className="text-slate-400 text-[11px]">Max Horizon Mask</div>
                  <div className="text-amber-300 font-semibold">{horizon.maxHorizonAngleDeg}°</div>
                </div>
                <div className="bg-[#060911] border border-slate-800 rounded p-2">
                  <div className="text-slate-400 text-[11px]">Sky Visibility</div>
                  <div className="text-cyan-300 font-semibold">
                    {(horizon.skyVisibilityFactor * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
              <div className="text-xs text-slate-400">
                <span className="font-semibold text-slate-300">Obstructed Directions (&gt;2°): </span>
                {horizon.obstructedDirections.length > 0
                  ? horizon.obstructedDirections.join(', ')
                  : 'Clear local horizon (<2° obstruction across all azimuths)'}
              </div>
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-xs font-mono text-slate-500">
              Computing horizon ray-march...
            </div>
          )}
        </div>
      </div>

      {/* Multi-Site Candidate Comparison */}
      <div className="bg-[#0B1120] border border-slate-800 rounded-md p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Multi-Site LOLA Comparison</h3>
            <p className="text-xs text-slate-400">
              Compare active target side-by-side against Artemis South Pole candidate regions.
            </p>
          </div>
          <button
            onClick={runComparison}
            disabled={comparing}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-100 rounded flex items-center gap-1.5"
          >
            {comparing ? <Plus className="w-3.5 h-3.5 animate-spin" /> : <GitCompare className="w-3.5 h-3.5" />}
            {comparing ? 'Querying LOLA...' : 'Run Multi-Site Comparison'}
          </button>
        </div>

        {compareResults.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-slate-400 font-mono">
                <tr>
                  <th className="py-2 pr-3">Candidate Site</th>
                  <th className="py-2 pr-3">Mean Elev (m)</th>
                  <th className="py-2 pr-3">Mean Slope (°)</th>
                  <th className="py-2 pr-3">P95 Slope (°)</th>
                  <th className="py-2 pr-3">RMS Rough (m)</th>
                  <th className="py-2 pr-3">Max Horizon (°)</th>
                  <th className="py-2">Score / Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 font-mono">
                {compareResults.map((r, idx) => (
                  <tr key={idx}>
                    <td className="py-2 pr-3 font-sans font-medium text-slate-200">
                      {r.coordinate.name || `${r.coordinate.lat}°, ${r.coordinate.lon}°`}
                    </td>
                    <td className="py-2 pr-3">{r.dem.meanElevationM.toFixed(1)}</td>
                    <td className="py-2 pr-3">{r.dem.meanSlopeDeg.toFixed(2)}</td>
                    <td className="py-2 pr-3">{r.dem.p95SlopeDeg.toFixed(2)}</td>
                    <td className="py-2 pr-3">{r.dem.rmsRoughnessM.toFixed(1)}</td>
                    <td className="py-2 pr-3">{r.horizon.maxHorizonAngleDeg.toFixed(1)}</td>
                    <td className="py-2 text-cyan-300">
                      {r.scores.overallScore.toFixed(1)} · {r.classification}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.div>
  );
};
