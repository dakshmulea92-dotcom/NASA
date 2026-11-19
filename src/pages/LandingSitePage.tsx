import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, CheckCircle2, SlidersHorizontal, XCircle } from 'lucide-react';
import { useLunar } from '../context/LunarContext.tsx';
import { PRESET_LUNAR_SITES } from '../data/lunarCatalog.ts';
import { ScientificMapCanvas } from '../components/ScientificMapCanvas.tsx';
import { formatCoordPair } from '../utils/coordinateFormat.ts';

export const LandingSitePage: React.FC = () => {
  const {
    selectedCoord,
    setSelectedCoord,
    analysisRadiusKm,
    setAnalysisRadiusKm,
    assessment,
    loadingAnalysis,
    settings,
    updateWeights,
    setCoordModalOpen,
  } = useLunar();

  const [showWeights, setShowWeights] = useState(false);
  const profileCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const dem = assessment?.dem;
  const scores = assessment?.scores;
  const weights = settings.suitabilityWeights;

  // Render live LOLA center-row cross-section elevation profile & crater highlight
  useEffect(() => {
    const canvas = profileCanvasRef.current;
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
      ctx.font = '11px monospace';
      ctx.fillText('LOLA PROFILE PENDING OR UNAVAILABLE', 18, h / 2);
      return;
    }

    const midRow = Math.floor(dem.gridSize / 2);
    const row = dem.elevationsMeters[midRow] || [];
    const slopeRow = dem.slopesDeg[midRow] || [];
    const minE = Math.min(...row);
    const maxE = Math.max(...row);
    const span = Math.max(15, maxE - minE);

    // Reference grid lines
    ctx.strokeStyle = 'rgba(51,65,85,0.45)';
    ctx.lineWidth = 1;
    for (let gy = 20; gy < h - 18; gy += 28) {
      ctx.beginPath();
      ctx.moveTo(10, gy);
      ctx.lineTo(w - 10, gy);
      ctx.stroke();
    }

    // Area gradient under elevation transect
    const grad = ctx.createLinearGradient(0, 14, 0, h - 18);
    grad.addColorStop(0, 'rgba(34,211,238,0.34)');
    grad.addColorStop(1, 'rgba(34,211,238,0.02)');

    ctx.beginPath();
    row.forEach((el, c) => {
      const x = 14 + (c / Math.max(1, row.length - 1)) * (w - 28);
      const y = h - 22 - ((el - minE) / span) * (h - 44);
      if (c === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(w - 14, h - 20);
    ctx.lineTo(14, h - 20);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Transect line colored per local hazard slope
    for (let c = 1; c < row.length; c++) {
      const x0 = 14 + ((c - 1) / Math.max(1, row.length - 1)) * (w - 28);
      const y0 = h - 22 - ((row[c - 1] - minE) / span) * (h - 44);
      const x1 = 14 + (c / Math.max(1, row.length - 1)) * (w - 28);
      const y1 = h - 22 - ((row[c] - minE) / span) * (h - 44);
      const sl = slopeRow[c] ?? 0;
      ctx.strokeStyle = sl > 15 ? '#f43f5e' : sl > 8 ? '#fbbf24' : '#22d3ee';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }

    // Center target crosshair
    const cx = w / 2;
    ctx.strokeStyle = 'rgba(248,250,252,0.5)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(cx, 12);
    ctx.lineTo(cx, h - 20);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px monospace';
    ctx.fillText(`W–E LOLA TRANSECT (${dem.radiusKm * 2} km)`, 14, 14);
    ctx.fillText(`Min ${minE.toFixed(0)}m · Max ${maxE.toFixed(0)}m`, w - 165, 14);
  }, [dem]);

  const badgeTone =
    assessment?.classification === 'SUITABLE'
      ? 'text-emerald-300 border-emerald-700/60 bg-emerald-950/40'
      : assessment?.classification === 'CONDITIONAL'
      ? 'text-amber-300 border-amber-700/60 bg-amber-950/40'
      : 'text-rose-300 border-rose-700/60 bg-rose-950/40';

  const overall = scores?.overallScore ?? 0;
  const ringR = 32;
  const ringCirc = 2 * Math.PI * ringR;
  const ringOff = ringCirc * (1 - Math.max(0, Math.min(100, overall)) / 100);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Control Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#0B1120] border border-slate-800 rounded-md p-4 flex flex-wrap items-center justify-between gap-4"
      >
        <div>
          <div className="text-xs font-mono text-cyan-400">LANDING SITE SUITABILITY ENGINE</div>
          <h2 className="text-lg font-display font-bold text-slate-100">
            {selectedCoord.name || 'Custom Target'} · {formatCoordPair(selectedCoord, settings.coordinateFormat)}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <span>Radius:</span>
            <select
              value={analysisRadiusKm}
              onChange={(e) => setAnalysisRadiusKm(Number(e.target.value))}
              className="bg-[#060911] border border-slate-700 rounded px-2.5 py-1.5 font-mono text-xs text-slate-100"
            >
              <option value={10}>10 km</option>
              <option value={20}>20 km</option>
              <option value={35}>35 km</option>
              <option value={60}>60 km</option>
            </select>
          </label>

          <button
            onClick={() => setShowWeights((w) => !w)}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded flex items-center gap-1.5"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Configure Weights
          </button>

          <button
            onClick={() => setCoordModalOpen(true)}
            className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-semibold text-xs rounded"
          >
            Select Location
          </button>
        </div>
      </motion.div>

      {/* Preset Quick Bar */}
      <div className="flex flex-wrap gap-1.5">
        {PRESET_LUNAR_SITES.map((s) => {
          const active =
            Math.abs(s.lat - selectedCoord.lat) < 0.01 &&
            Math.abs(s.lon - selectedCoord.lon) < 0.01;
          return (
            <button
              key={s.id}
              onClick={() =>
                setSelectedCoord({
                  lat: s.lat,
                  lon: s.lon,
                  name: s.name,
                  regionType: s.regionType,
                  source: s.source,
                })
              }
              className={`px-3 py-1.5 rounded text-xs border transition-colors ${
                active
                  ? 'bg-cyan-600/20 border-cyan-500 text-cyan-200 font-medium'
                  : 'bg-[#0B1120] border-slate-800 text-slate-300 hover:border-slate-600'
              }`}
            >
              {(s.name ?? s.id).split('(')[0].trim()}
            </button>
          );
        })}
      </div>

      {/* Configurable Weights Drawer */}
      {showWeights && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="bg-[#0B1120] border border-slate-700 rounded-md p-4 space-y-3 overflow-hidden"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
              Configurable Landing Suitability Scoring Weights
            </h3>
            <span className="text-[11px] font-mono text-slate-400">
              Normalized weighted sum across 5 NASA LOLA parameters
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 text-xs">
            {[
              { key: 'slope' as const, label: 'Terrain Slope' },
              { key: 'roughness' as const, label: 'Surface Roughness' },
              { key: 'craterClearance' as const, label: 'Crater Clearance' },
              { key: 'elevationStability' as const, label: 'Elevation Relief' },
              { key: 'dataCoverage' as const, label: 'Data Confidence' },
            ].map((item) => (
              <label key={item.key} className="space-y-1">
                <div className="flex justify-between font-mono">
                  <span className="text-slate-300">{item.label}</span>
                  <span className="text-cyan-300">{Math.round(weights[item.key] * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={0.6}
                  step={0.05}
                  value={weights[item.key]}
                  onChange={(e) => updateWeights({ [item.key]: Number(e.target.value) })}
                  className="w-full accent-cyan-500"
                />
              </label>
            ))}
          </div>
        </motion.div>
      )}

      {/* Overall Score & Classification */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06 }}
        className="grid grid-cols-1 lg:grid-cols-3 gap-5"
      >
        <div className="bg-[#0B1120] border border-slate-800 rounded-md p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-slate-400">OVERALL SUITABILITY</span>
            <span className={`text-xs font-mono px-2.5 py-1 rounded border ${badgeTone}`}>
              {assessment?.classification || 'ANALYZING'}
            </span>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-mono font-bold text-slate-100 tabular-nums">
                {loadingAnalysis ? '---' : scores ? scores.overallScore.toFixed(1) : '0.0'}
              </span>
              <span className="text-sm font-mono text-slate-400">/ 100</span>
            </div>
            <svg viewBox="0 0 80 80" className="w-20 h-20 shrink-0 -rotate-90">
              <circle cx="40" cy="40" r={ringR} fill="none" stroke="#1e293b" strokeWidth="7" />
              <motion.circle
                cx="40"
                cy="40"
                r={ringR}
                fill="none"
                stroke={
                  assessment?.classification === 'SUITABLE'
                    ? '#34d399'
                    : assessment?.classification === 'CONDITIONAL'
                    ? '#fbbf24'
                    : '#f43f5e'
                }
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={ringCirc}
                initial={{ strokeDashoffset: ringCirc }}
                animate={{ strokeDashoffset: loadingAnalysis ? ringCirc : ringOff }}
                transition={{ duration: 0.65, ease: 'easeOut' }}
              />
            </svg>
          </div>

          {/* Individual Parameter Bars */}
          {scores && (
            <div className="space-y-2.5 pt-2 border-t border-slate-800 text-xs">
              {[
                { label: 'B. Slope Suitability', val: scores.slopeScore },
                { label: 'C. Surface Roughness', val: scores.roughnessScore },
                { label: 'D. Crater Clearance', val: scores.craterSafetyScore },
                { label: 'A. Elevation Stability', val: scores.elevationScore },
                { label: 'E. Data Confidence & Coverage', val: scores.dataConfidenceScore },
              ].map((row) => (
                <div key={row.label} className="space-y-1">
                  <div className="flex justify-between font-mono">
                    <span className="text-slate-300">{row.label}</span>
                    <span className="text-slate-100 tabular-nums">{row.val.toFixed(1)}</span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded overflow-hidden">
                    <motion.div
                      className="h-full bg-cyan-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(2, Math.min(100, row.val))}%` }}
                      transition={{ duration: 0.55, ease: 'easeOut' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Scientific Reasoning, Rejection Reasons & Uncertainties */}
        <div className="lg:col-span-2 bg-[#0B1120] border border-slate-800 rounded-md p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-100">
            Scientific Assessment, Rejection Criteria &amp; Uncertainty
          </h3>

          {assessment && (
            <div className="space-y-3 text-xs">
              {assessment.rejectionReasons.length > 0 ? (
                <div className="bg-rose-950/30 border border-rose-800/60 rounded p-3 space-y-1.5">
                  <div className="font-semibold text-rose-300 flex items-center gap-1.5">
                    <XCircle className="w-4 h-4" />
                    Identified Safety Concerns / Rejection Factors
                  </div>
                  <ul className="list-disc list-inside text-slate-200 space-y-1">
                    {assessment.rejectionReasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="bg-emerald-950/30 border border-emerald-800/60 rounded p-3 flex items-center gap-2 text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    No regional macro-slope or ridge-obstruction thresholds breached at{' '}
                    {dem?.datasetUsed.spatialResolution}.
                  </span>
                </div>
              )}

              <div className="space-y-1.5">
                <div className="font-semibold text-slate-300">Measured LOLA Findings</div>
                <ul className="list-disc list-inside text-slate-400 space-y-1">
                  {assessment.scientificReasoning.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>

              <div className="bg-amber-950/20 border border-amber-800/50 rounded p-3 space-y-1.5">
                <div className="font-semibold text-amber-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4" />
                  Data Coverage &amp; Resolution Uncertainties
                </div>
                <ul className="list-disc list-inside text-slate-300 space-y-1">
                  {assessment.uncertaintyIndicators.map((u, i) => (
                    <li key={i}>{u}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Maps & Crater Cross-Section Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ScientificMapCanvas
          dem={dem ?? null}
          mode="slope"
          loading={loadingAnalysis}
          title="B. Slope Distribution & Hazard Map"
          onSelectPoint={(lat, lon) =>
            setSelectedCoord({ lat, lon, name: `Sampled (${lat.toFixed(2)}°, ${lon.toFixed(2)}°)` })
          }
        />

        {/* C & D. Surface Roughness, LOLA Cross-Section & Nearby Crater Analysis */}
        <div className="bg-[#0B1120] border border-slate-800 rounded-md p-4 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              C &amp; D. Surface Roughness, Transect &amp; Nearby Craters
            </h3>
            <p className="text-xs text-slate-400">
              Visualizes center-line LOLA elevation profile (cyan = &lt;8° slope, amber = 8–15°, rose = &gt;15°) and catalog craters.
            </p>
          </div>

          <canvas
            ref={profileCanvasRef}
            width={520}
            height={128}
            className="w-full h-32 rounded border border-slate-800 bg-[#050811] block"
          />

          {dem && dem.dataAvailable && (
            <div className="grid grid-cols-3 gap-2.5 text-xs">
              <div className="bg-[#060911] border border-slate-800 rounded p-2.5">
                <div className="text-slate-400 font-mono text-[11px]">RMS Roughness</div>
                <div className="text-base font-mono font-semibold text-slate-100 mt-0.5 tabular-nums">
                  {dem.rmsRoughnessM.toFixed(1)} m
                </div>
              </div>
              <div className="bg-[#060911] border border-slate-800 rounded p-2.5">
                <div className="text-slate-400 font-mono text-[11px]">TRI Index</div>
                <div className="text-base font-mono font-semibold text-slate-100 mt-0.5 tabular-nums">
                  {dem.triMeters.toFixed(1)} m
                </div>
              </div>
              <div className="bg-[#060911] border border-slate-800 rounded p-2.5">
                <div className="text-slate-400 font-mono text-[11px]">Relief Span</div>
                <div className="text-base font-mono font-semibold text-slate-100 mt-0.5 tabular-nums">
                  {dem.elevationRangeM.toFixed(0)} m
                </div>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-slate-400 font-mono">
                <tr>
                  <th className="py-2 pr-2">Feature / Crater</th>
                  <th className="py-2 pr-2">Dia (km)</th>
                  <th className="py-2 pr-2">Dist (km)</th>
                  <th className="py-2">Depth &amp; Provenance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {dem?.detectedCraters.length ? (
                  dem.detectedCraters.map((c, idx) => (
                    <tr key={`${c.name}-${idx}`}>
                      <td className="py-2 pr-2 font-medium text-slate-200">{c.name}</td>
                      <td className="py-2 pr-2 font-mono text-slate-300">{c.diameterKm}</td>
                      <td className="py-2 pr-2 font-mono text-slate-300">{c.distanceFromTargetKm}</td>
                      <td className="py-2 text-slate-400">
                        {c.measuredDepthM !== null ? (
                          <span className="font-mono text-cyan-300">{c.measuredDepthM} m</span>
                        ) : (
                          <span className="text-amber-400">NASA DATA UNAVAILABLE</span>
                        )}
                        <div className="text-[11px] text-slate-500">{c.depthNote}</div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-slate-500">
                      No major catalog craters or depressions above detection threshold in this window.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
