import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Clock, Pause, Play, RotateCcw, Sun } from 'lucide-react';
import { useLunar } from '../context/LunarContext.tsx';
import { LAUNCH_FACILITIES } from '../data/lunarCatalog.ts';
import { formatCoordPair, formatInEarthTimezone } from '../utils/coordinateFormat.ts';

export const IlluminationPage: React.FC = () => {
  const {
    selectedCoord,
    analysisDateUtc,
    setAnalysisDateUtc,
    illumination,
    loadingIllumination,
    settings,
  } = useLunar();

  const [selectedCityId, setSelectedCityId] = useState(LAUNCH_FACILITIES[0].id);
  const [timelineIdx, setTimelineIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const skyDomeRef = useRef<HTMLCanvasElement | null>(null);

  const facility = LAUNCH_FACILITIES.find((f) => f.id === selectedCityId) || LAUNCH_FACILITIES[0];
  const timeline = illumination?.timeline ?? [];

  useEffect(() => {
    setTimelineIdx(0);
  }, [illumination?.timeline]);

  // Smooth epoch playback over the 30-day DE421 illumination steps
  useEffect(() => {
    if (!playing || timeline.length < 2) return;
    const id = window.setInterval(() => {
      setTimelineIdx((i) => (i + 1) % timeline.length);
    }, 180);
    return () => window.clearInterval(id);
  }, [playing, timeline.length]);

  const activePoint = timeline[Math.min(timelineIdx, Math.max(0, timeline.length - 1))] || illumination?.current;

  // Interactive Polar Sky-Dome Solar Azimuth / Elevation & LOLA Horizon Mask Canvas
  useEffect(() => {
    const canvas = skyDomeRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const maxR = Math.min(w, h) * 0.41;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#050811';
    ctx.fillRect(0, 0, w, h);

    // Elevation altitude rings (0 deg horizon, +30, +60, +90 zenith)
    for (const deg of [0, 30, 60]) {
      const r = maxR * ((90 - deg) / 90);
      ctx.strokeStyle = deg === 0 ? '#475569' : 'rgba(51,65,85,0.5)';
      ctx.lineWidth = deg === 0 ? 1.5 : 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Cardinal lines (N, E, S, W)
    ctx.strokeStyle = 'rgba(51,65,85,0.45)';
    ctx.beginPath();
    ctx.moveTo(cx - maxR, cy);
    ctx.lineTo(cx + maxR, cy);
    ctx.moveTo(cx, cy - maxR);
    ctx.lineTo(cx, cy + maxR);
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px monospace';
    ctx.fillText('N', cx - 3, cy - maxR - 6);
    ctx.fillText('S', cx - 3, cy + maxR + 13);
    ctx.fillText('E', cx + maxR + 6, cy + 4);
    ctx.fillText('W', cx - maxR - 14, cy + 4);

    // Plot LOLA Terrain Horizon Obstruction Mask Ring
    if (activePoint) {
      const horizonDeg = Math.max(0, activePoint.terrainHorizonAngleDeg);
      const maskR = maxR * ((90 - horizonDeg) / 90);
      ctx.fillStyle = 'rgba(34,211,238,0.12)';
      ctx.beginPath();
      ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
      ctx.arc(cx, cy, maskR, 0, Math.PI * 2, true);
      ctx.fill();

      ctx.strokeStyle = '#22d3ee';
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(cx, cy, maskR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Plot entire 30-day solar path
    if (timeline.length > 1) {
      ctx.strokeStyle = 'rgba(251,191,36,0.35)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      timeline.forEach((pt, idx) => {
        const clampedEl = Math.max(-10, Math.min(90, pt.solarElevationDeg));
        const r = maxR * ((90 - clampedEl) / 90);
        const rad = ((pt.solarAzimuthDeg - 90) * Math.PI) / 180;
        const px = cx + Math.cos(rad) * r;
        const py = cy + Math.sin(rad) * r;
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }

    // Plot active sun marker
    if (activePoint) {
      const clampedEl = Math.max(-10, Math.min(90, activePoint.solarElevationDeg));
      const r = maxR * ((90 - clampedEl) / 90);
      const rad = ((activePoint.solarAzimuthDeg - 90) * Math.PI) / 180;
      const sx = cx + Math.cos(rad) * r;
      const sy = cy + Math.sin(rad) * r;

      const glow = ctx.createRadialGradient(sx, sy, 2, sx, sy, 18);
      glow.addColorStop(
        0,
        activePoint.isDirectSunlight ? 'rgba(251,191,36,0.95)' : 'rgba(100,116,139,0.7)'
      );
      glow.addColorStop(1, 'rgba(251,191,36,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(sx, sy, 18, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = activePoint.isDirectSunlight ? '#fbbf24' : '#94a3b8';
      ctx.beginPath();
      ctx.arc(sx, sy, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }, [activePoint, timeline]);

  const earthTimeCurrent = formatInEarthTimezone(
    activePoint?.utcIso || analysisDateUtc,
    facility.timezone
  );
  const earthTimePeak = illumination?.peakSunlightUtc
    ? formatInEarthTimezone(illumination.peakSunlightUtc, facility.timezone)
    : null;
  const earthTimeSunrise = illumination?.nextSunriseUtc
    ? formatInEarthTimezone(illumination.nextSunriseUtc, facility.timezone)
    : null;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Configuration Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#0B1120] border border-slate-800 rounded-md p-4 flex flex-wrap items-center justify-between gap-4"
      >
        <div>
          <div className="text-xs font-mono text-amber-400">
            SPICE / DE421 SOLAR EPHEMERIS + LOLA HORIZON MASKING
          </div>
          <h2 className="text-lg font-display font-bold text-slate-100">
            Sunlight &amp; Illumination Analyzer · {selectedCoord.name || 'Target'}
          </h2>
          <div className="text-xs font-mono text-slate-400">
            {formatCoordPair(selectedCoord, settings.coordinateFormat)}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs text-slate-300 flex items-center gap-2">
            Start Epoch (UTC):
            <input
              type="datetime-local"
              value={analysisDateUtc.slice(0, 16)}
              onChange={(e) => {
                if (e.target.value) setAnalysisDateUtc(new Date(e.target.value + ':00Z').toISOString());
              }}
              className="bg-[#060911] border border-slate-700 rounded px-2.5 py-1.5 font-mono text-xs text-slate-100"
            />
          </label>
          <button
            onClick={() => setAnalysisDateUtc(new Date().toISOString())}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded"
          >
            Set Now (UTC)
          </button>
        </div>
      </motion.div>

      {/* Primary Solar Metrics (live-updated from active timeline frame) */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
      >
        <div className="bg-[#0B1120] border border-slate-800 rounded-md p-4">
          <div className="text-xs font-mono text-slate-400">ACTIVE FRAME ILLUMINATION</div>
          <div className="mt-1.5 text-lg font-mono font-bold text-amber-300">
            {loadingIllumination ? 'COMPUTING...' : activePoint?.shadowStatus || 'N/A'}
          </div>
          <div className="mt-1 text-xs font-mono text-slate-400">
            Terrain Horizon Mask: {activePoint ? `${activePoint.terrainHorizonAngleDeg.toFixed(2)}°` : '---'}
          </div>
        </div>

        <div className="bg-[#0B1120] border border-slate-800 rounded-md p-4">
          <div className="text-xs font-mono text-slate-400">SUN ELEVATION / INCIDENCE</div>
          <div className="mt-1.5 text-lg font-mono font-bold text-slate-100 tabular-nums">
            {activePoint ? `${activePoint.solarElevationDeg.toFixed(2)}° / ${activePoint.solarIncidenceDeg.toFixed(2)}°` : '---'}
          </div>
          <div className="mt-1 text-xs font-mono text-slate-400">
            Sun Azimuth: {activePoint ? `${activePoint.solarAzimuthDeg.toFixed(1)}°` : '---'}
          </div>
        </div>

        <div className="bg-[#0B1120] border border-slate-800 rounded-md p-4">
          <div className="text-xs font-mono text-slate-400">30-DAY SUNLIT DURATION</div>
          <div className="mt-1.5 text-lg font-mono font-bold text-cyan-300 tabular-nums">
            {illumination ? `${illumination.sunlitPercentage}% (${illumination.sunlitHoursInPeriod} h)` : '---'}
          </div>
          <div className="mt-1 text-xs font-mono text-slate-400">
            Peak Sun El: {illumination ? `${illumination.peakSolarElevationDeg.toFixed(2)}°` : '---'}
          </div>
        </div>

        <div className="bg-[#0B1120] border border-slate-800 rounded-md p-4">
          <div className="text-xs font-mono text-slate-400">NEXT SUNRISE / PSR FLAG</div>
          <div className="mt-1.5 text-sm font-mono font-semibold text-slate-100">
            {illumination?.isLikelyPsr
              ? 'Permanently Shadowed Candidate'
              : illumination?.nextSunriseUtc
              ? illumination.nextSunriseUtc.slice(0, 16).replace('T', ' ') + ' UTC'
              : activePoint?.isDirectSunlight
              ? 'Sunlit at Epoch'
              : 'None within 30-day window'}
          </div>
          <div className="mt-1 text-xs font-mono text-slate-400">
            Next Sunset: {illumination?.nextSunsetUtc ? illumination.nextSunsetUtc.slice(0, 16).replace('T', ' ') + ' UTC' : 'N/A'}
          </div>
        </div>
      </motion.div>

      {/* Interactive Sky-Dome Dial + 30-Day Synodic Playback Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Polar Sky-Dome Dial */}
        <div className="lg:col-span-4 bg-[#0B1120] border border-slate-800 rounded-md p-4 flex flex-col justify-between space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Solar Sky-Dome &amp; Horizon Mask</h3>
            <p className="text-[11px] font-mono text-slate-400">
              Outer ring = 0° astronomical horizon · Cyan dashed = LOLA terrain mask
            </p>
          </div>
          <canvas
            ref={skyDomeRef}
            width={280}
            height={260}
            className="w-full max-w-[280px] mx-auto rounded border border-slate-800 bg-[#050811]"
          />
          <div className="text-[11px] font-mono text-slate-300 bg-[#060911] border border-slate-800 rounded px-3 py-2 flex justify-between">
            <span>Frame UTC:</span>
            <span className="text-cyan-300">
              {activePoint ? activePoint.utcIso.slice(0, 16).replace('T', ' ') : '---'}
            </span>
          </div>
        </div>

        {/* Interactive 30-Day Illumination Timeline + Play/Scrub Controls */}
        <div className="lg:col-span-8 bg-[#0B1120] border border-slate-800 rounded-md p-5 space-y-3 flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Sun className="w-4 h-4 text-amber-400" />
                30-Day Synodic Solar Elevation &amp; Terrain Horizon Playback
              </h3>
              <p className="text-xs font-mono text-slate-400">
                Solid amber = Solar elevation (°) · Dashed cyan = LOLA local terrain horizon obstruction (°)
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPlaying((p) => !p)}
                className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-semibold text-xs rounded flex items-center gap-1"
              >
                {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {playing ? 'Pause' : 'Play'}
              </button>
              <button
                onClick={() => {
                  setPlaying(false);
                  setTimelineIdx(0);
                }}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded"
                aria-label="Reset epoch scrubber"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {timeline.length > 0 ? (
            <div className="space-y-3">
              <div className="bg-[#060911] border border-slate-800 rounded p-3">
                <svg viewBox="0 0 800 240" className="w-full h-56">
                  {(() => {
                    const pts = timeline;
                    const allVals = pts.flatMap((p) => [p.solarElevationDeg, p.terrainHorizonAngleDeg]);
                    const minV = Math.min(-25, ...allVals);
                    const maxV = Math.max(25, ...allVals);
                    const span = Math.max(10, maxV - minV);
                    const yFor = (v: number) => 205 - ((v - minV) / span) * 180;
                    const xFor = (i: number) => 48 + (i / Math.max(1, pts.length - 1)) * 735;
                    const zeroY = yFor(0);

                    const sunPath = pts
                      .map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)},${yFor(p.solarElevationDeg).toFixed(1)}`)
                      .join(' ');

                    const horizonPath = pts
                      .map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)},${yFor(p.terrainHorizonAngleDeg).toFixed(1)}`)
                      .join(' ');

                    const curX = xFor(Math.min(timelineIdx, pts.length - 1));
                    const curPt = pts[Math.min(timelineIdx, pts.length - 1)];
                    const curY = yFor(curPt.solarElevationDeg);

                    return (
                      <>
                        <line x1="48" y1={zeroY} x2="783" y2={zeroY} stroke="#475569" strokeWidth="1" />
                        <path d={horizonPath} fill="none" stroke="#22d3ee" strokeWidth="1.5" strokeDasharray="4 4" />
                        <path d={sunPath} fill="none" stroke="#f59e0b" strokeWidth="2.2" />
                        <line x1={curX} y1="18" x2={curX} y2="212" stroke="#38bdf8" strokeWidth="1.4" strokeDasharray="2 2" />
                        <circle
                          cx={curX}
                          cy={curY}
                          r="5.5"
                          fill={curPt.isDirectSunlight ? '#fbbf24' : '#64748b'}
                          stroke="#ffffff"
                          strokeWidth="1.5"
                        />
                        <text x="6" y={yFor(maxV) + 8} fill="#94a3b8" fontSize="10" fontFamily="monospace">
                          +{maxV.toFixed(0)}°
                        </text>
                        <text x="6" y={zeroY + 4} fill="#cbd5e1" fontSize="10" fontFamily="monospace">
                          0°
                        </text>
                        <text x="6" y={yFor(minV)} fill="#94a3b8" fontSize="10" fontFamily="monospace">
                          {minV.toFixed(0)}°
                        </text>
                        <text x="48" y="230" fill="#94a3b8" fontSize="10" fontFamily="monospace">
                          Day 0 ({pts[0].utcIso.slice(0, 10)})
                        </text>
                        <text x="400" y="230" fill="#94a3b8" fontSize="10" fontFamily="monospace">
                          +15 Days
                        </text>
                        <text x="715" y="230" fill="#94a3b8" fontSize="10" fontFamily="monospace">
                          +30 Days
                        </text>
                      </>
                    );
                  })()}
                </svg>
              </div>

              <label className="flex items-center gap-3 text-xs font-mono text-slate-300">
                <span>Scrub 30-Day Epoch:</span>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, timeline.length - 1)}
                  value={timelineIdx}
                  onChange={(e) => {
                    setPlaying(false);
                    setTimelineIdx(Number(e.target.value));
                  }}
                  className="flex-1 accent-amber-400"
                />
                <span className="text-amber-300 tabular-nums w-20 text-right">
                  Step {timelineIdx + 1}/{timeline.length}
                </span>
              </label>
            </div>
          ) : (
            <div className="h-56 flex items-center justify-center text-xs font-mono text-slate-500">
              Computing 30-day solar ephemeris...
            </div>
          )}
        </div>
      </div>

      {/* Earth Launch-Pad Local Time Conversion */}
      <div className="bg-[#0B1120] border border-slate-800 rounded-md p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              Earth Launch-Pad Local Time Conversion
            </h3>
            <p className="text-xs text-slate-400">
              Converts active lunar illumination UTC frame timestamps into Earth launch-city local timezones. Earth local clock time is distinct from lunar local solar time.
            </p>
          </div>
          <select
            value={selectedCityId}
            onChange={(e) => setSelectedCityId(e.target.value)}
            className="bg-[#060911] border border-slate-700 rounded px-3 py-2 text-xs text-slate-100"
          >
            {LAUNCH_FACILITIES.map((f) => (
              <option key={f.id} value={f.id}>
                {f.cityLabel} ({f.name.split('(')[0].trim()})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="bg-[#060911] border border-slate-800 rounded p-3.5 space-y-1">
            <div className="text-slate-400 font-mono text-[11px]">ACTIVE EPOCH FRAME</div>
            <div className="font-mono text-sm font-semibold text-slate-100">
              {earthTimeCurrent.localFormatted} ({earthTimeCurrent.tzAbbr})
            </div>
            <div className="font-mono text-[11px] text-slate-400">
              {earthTimeCurrent.utcFormatted} · TZ: {facility.timezone}
            </div>
          </div>

          <div className="bg-[#060911] border border-slate-800 rounded p-3.5 space-y-1">
            <div className="text-slate-400 font-mono text-[11px]">LUNAR PEAK SUNLIGHT EVENT</div>
            <div className="font-mono text-sm font-semibold text-amber-300">
              {earthTimePeak ? `${earthTimePeak.localFormatted} (${earthTimePeak.tzAbbr})` : 'N/A'}
            </div>
            <div className="font-mono text-[11px] text-slate-400">
              {earthTimePeak ? earthTimePeak.utcFormatted : '---'}
            </div>
          </div>

          <div className="bg-[#060911] border border-slate-800 rounded p-3.5 space-y-1">
            <div className="text-slate-400 font-mono text-[11px]">NEXT LUNAR SUNRISE WINDOW</div>
            <div className="font-mono text-sm font-semibold text-cyan-300">
              {earthTimeSunrise
                ? `${earthTimeSunrise.localFormatted} (${earthTimeSunrise.tzAbbr})`
                : activePoint?.isDirectSunlight
                ? 'Target Illuminated'
                : 'No Sunrise in 30d Window'}
            </div>
            <div className="font-mono text-[11px] text-slate-400">
              {earthTimeSunrise ? earthTimeSunrise.utcFormatted : 'Moon Illumination ≠ Earth Launch Time'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
