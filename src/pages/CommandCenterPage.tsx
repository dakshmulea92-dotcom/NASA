import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Compass, Film, Globe, Layers, Rocket, Sun, Thermometer } from 'lucide-react';
import { useLunar } from '../context/LunarContext.tsx';
import { PRESET_LUNAR_SITES } from '../data/lunarCatalog.ts';
import { formatCoordPair } from '../utils/coordinateFormat.ts';

export const CommandCenterPage: React.FC = () => {
  const {
    selectedCoord,
    setSelectedCoord,
    assessment,
    illumination,
    loadingAnalysis,
    missions,
    settings,
    setActivePage,
    setCoordModalOpen,
    setVideoModalOpen,
  } = useLunar();

  const ephemerisCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [utcClock, setUtcClock] = useState(() => new Date().toISOString().slice(11, 19));

  useEffect(() => {
    const id = window.setInterval(() => {
      setUtcClock(new Date().toISOString().slice(11, 19));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Animated Earth-Moon-Sun Ephemeris & Solar Vector Telemetry Canvas
  useEffect(() => {
    const canvas = ephemerisCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let disposed = false;

    const draw = (tMs: number) => {
      if (disposed) return;
      const w = canvas.width;
      const h = canvas.height;
      const t = tMs * 0.001;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#070514';
      ctx.fillRect(0, 0, w, h);

      const cx = w * 0.5;
      const cy = h * 0.54;

      // Concentric range rings
      ctx.strokeStyle = 'rgba(139,92,246,0.32)';
      ctx.lineWidth = 1;
      for (const r of [34, 62, 90]) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Crosshairs
      ctx.strokeStyle = 'rgba(99,102,241,0.28)';
      ctx.beginPath();
      ctx.moveTo(cx - 98, cy);
      ctx.lineTo(cx + 98, cy);
      ctx.moveTo(cx, cy - 98);
      ctx.lineTo(cx, cy + 98);
      ctx.stroke();

      // Sun illumination vector from live DE421 azimuth
      const azDeg = illumination?.current.solarAzimuthDeg ?? 45;
      const elDeg = illumination?.current.solarElevationDeg ?? 10;
      const sunRad = ((azDeg - 90) * Math.PI) / 180;
      const sx = cx + Math.cos(sunRad) * 86;
      const sy = cy + Math.sin(sunRad) * 86;

      // Solar beam gradient cone
      const beamGrad = ctx.createLinearGradient(sx, sy, cx, cy);
      beamGrad.addColorStop(0, 'rgba(249,115,22,0.48)');
      beamGrad.addColorStop(1, 'rgba(249,115,22,0.04)');
      ctx.fillStyle = beamGrad;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(cx + Math.cos(sunRad + 0.45) * 32, cy + Math.sin(sunRad + 0.45) * 32);
      ctx.lineTo(cx + Math.cos(sunRad - 0.45) * 32, cy + Math.sin(sunRad - 0.45) * 32);
      ctx.closePath();
      ctx.fill();

      // Moon disc at center with terminator shading aligned to Sun angle
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, 24, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#1e1b4b';
      ctx.fillRect(cx - 26, cy - 26, 52, 52);

      const litOffset = illumination?.current.isDirectSunlight ? 8 : -6;
      const moonGrad = ctx.createRadialGradient(
        cx + Math.cos(sunRad) * litOffset,
        cy + Math.sin(sunRad) * litOffset,
        3,
        cx,
        cy,
        26
      );
      moonGrad.addColorStop(0, '#fef3c7');
      moonGrad.addColorStop(0.55, '#94a3b8');
      moonGrad.addColorStop(1, '#1e1b4b');
      ctx.fillStyle = moonGrad;
      ctx.fillRect(cx - 26, cy - 26, 52, 52);
      ctx.restore();

      // Moon border
      ctx.strokeStyle = 'rgba(251,191,36,0.6)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(cx, cy, 24, 0, Math.PI * 2);
      ctx.stroke();

      // Animated LRO orbiter tracking ring
      const orbAngle = t * 0.85;
      const ox = cx + Math.cos(orbAngle) * 44;
      const oy = cy + Math.sin(orbAngle) * 18;
      ctx.strokeStyle = 'rgba(45,212,191,0.55)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 44, 18, 0.25, 0, Math.PI * 2);
      ctx.stroke();

      // Rotated orbiter blip
      const cosR = Math.cos(0.25);
      const sinR = Math.sin(0.25);
      const rx = cx + (ox - cx) * cosR - (oy - cy) * sinR;
      const ry = cy + (ox - cx) * sinR + (oy - cy) * cosR;
      ctx.fillStyle = '#2dd4bf';
      ctx.beginPath();
      ctx.arc(rx, ry, 3.4, 0, Math.PI * 2);
      ctx.fill();

      // Sun marker on outer ring
      ctx.fillStyle = '#fb923c';
      ctx.beginPath();
      ctx.arc(sx, sy, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '10px monospace';
      ctx.fillStyle = '#fed7aa';
      ctx.fillText(`SUN ${azDeg.toFixed(0)}°`, Math.min(w - 58, Math.max(6, sx - 20)), Math.max(14, sy - 9));

      // Header telemetry overlay
      ctx.fillStyle = '#c4b5fd';
      ctx.font = '10px monospace';
      ctx.fillText(`DE421 EL: ${elDeg.toFixed(1)}°`, 8, 15);
      ctx.fillStyle = illumination?.current.isDirectSunlight ? '#34d399' : '#2dd4bf';
      ctx.fillText(illumination?.current.shadowStatus || 'EPHEMERIS SYNC', 8, h - 8);

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
    };
  }, [illumination]);

  const dem = assessment?.dem;
  const score = assessment?.scores.overallScore ?? 0;
  const gaugeCircumference = 2 * Math.PI * 26;
  const gaugeOffset = gaugeCircumference * (1 - Math.max(0, Math.min(100, score)) / 100);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Executive Header */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
        className="bg-gradient-to-r from-[#0E0A24] via-[#130E30] to-[#1A1036] border border-indigo-800/70 rounded-lg p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
      >
        <div className="space-y-1">
          <div className="text-xs font-mono text-amber-300 flex flex-wrap items-center gap-2">
            <span>ACTIVE TARGET · CRS: MEAN EARTH/POLAR AXIS DE421</span>
            <span className="text-indigo-500">|</span>
            <span className="text-teal-300 tabular-nums">UTC {utcClock}</span>
          </div>
          <h2 className="text-2xl font-display font-bold text-white">
            {selectedCoord.name || 'Custom Lunar Coordinate'}
          </h2>
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-slate-300">
            <span>{formatCoordPair(selectedCoord, settings.coordinateFormat)}</span>
            <span aria-hidden="true">·</span>
            <span>{selectedCoord.regionType || 'Lunar Surface Region'}</span>
            <span aria-hidden="true">·</span>
            <span>Source: {dem?.datasetUsed.datasetId || 'NASA LRO LOLA'}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setCoordModalOpen(true)}
            className="px-4 py-2 bg-[#181242] hover:bg-[#231A5E] border border-indigo-700/70 text-xs font-medium text-slate-100 rounded-md transition-colors"
          >
            Change Target
          </button>
          <button
            onClick={() => setVideoModalOpen(true)}
            className="px-4 py-2 bg-[#181242] hover:bg-[#231A5E] border border-indigo-700/70 text-xs font-medium text-amber-300 rounded-md transition-colors flex items-center gap-1.5"
          >
            <Film className="w-3.5 h-3.5" />
            Photo → Video Studio
          </button>
          <button
            onClick={() => setActivePage('lunar-explorer')}
            className="px-4 py-2 bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:brightness-110 text-xs font-semibold text-slate-950 rounded-md transition-all flex items-center gap-1.5 shadow-lg shadow-orange-500/20"
          >
            <Globe className="w-3.5 h-3.5" />
            Open 3D Moon
          </button>
        </div>
      </motion.section>

      {/* Primary Calibrated KPI Strip + Live Solar/Orbital Radar */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, delay: 0.05 }}
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4"
      >
        <div className="bg-[#0E0A24] border border-indigo-900/70 rounded-lg p-4 flex flex-col justify-between">
          <div className="text-xs text-violet-300/80 font-mono">MEAN LOLA ELEVATION</div>
          <div className="mt-2 flex items-baseline">
            <span className="text-2xl font-mono font-bold text-white tabular-nums">
              {loadingAnalysis ? '---' : dem?.dataAvailable ? dem.meanElevationM.toFixed(1) : 'N/A'}
            </span>
            <span className="text-xs font-mono text-slate-400 ml-1.5">m</span>
          </div>
          <div className="mt-2 text-xs font-mono text-slate-400">
            {dem?.dataAvailable
              ? `Span: ${dem.minElevationM.toFixed(0)} to ${dem.maxElevationM.toFixed(0)} m`
              : 'NASA DATA UNAVAILABLE'}
          </div>
        </div>

        <div className="bg-[#0E0A24] border border-indigo-900/70 rounded-lg p-4 flex flex-col justify-between">
          <div className="text-xs text-teal-300/80 font-mono">HORN 3x3 MEAN / P95 SLOPE</div>
          <div className="mt-2 flex items-baseline">
            <span className="text-2xl font-mono font-bold text-white tabular-nums">
              {loadingAnalysis ? '---' : dem?.dataAvailable ? dem.meanSlopeDeg.toFixed(2) : 'N/A'}
            </span>
            <span className="text-xs font-mono text-slate-400 ml-1.5">deg</span>
          </div>
          <div className="mt-2 text-xs font-mono text-slate-400">
            {dem?.dataAvailable
              ? `P95: ${dem.p95SlopeDeg.toFixed(2)}° · Max: ${dem.maxSlopeDeg.toFixed(2)}°`
              : 'NASA DATA UNAVAILABLE'}
          </div>
        </div>

        {/* Animated Suitability Dial Card */}
        <div className="bg-[#0E0A24] border border-indigo-900/70 rounded-lg p-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-amber-300/80 font-mono">LANDING SUITABILITY</div>
            <div className="mt-1.5 flex items-baseline">
              <span className="text-2xl font-mono font-bold text-amber-300 tabular-nums">
                {loadingAnalysis ? '---' : assessment ? score.toFixed(1) : 'N/A'}
              </span>
              <span className="text-xs font-mono text-slate-400 ml-1">/100</span>
            </div>
            <div className="mt-1.5 text-xs font-mono text-slate-200">
              {assessment?.classification || 'Pending'}
            </div>
          </div>
          <svg viewBox="0 0 68 68" className="w-16 h-16 shrink-0 -rotate-90">
            <circle cx="34" cy="34" r="26" fill="none" stroke="#1e1b4b" strokeWidth="6" />
            <motion.circle
              cx="34"
              cy="34"
              r="26"
              fill="none"
              stroke={
                assessment?.classification === 'SUITABLE'
                  ? '#34d399'
                  : assessment?.classification === 'CONDITIONAL'
                  ? '#fb923c'
                  : '#2dd4bf'
              }
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={gaugeCircumference}
              initial={{ strokeDashoffset: gaugeCircumference }}
              animate={{ strokeDashoffset: loadingAnalysis ? gaugeCircumference : gaugeOffset }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
            />
          </svg>
        </div>

        <div className="bg-[#0E0A24] border border-indigo-900/70 rounded-lg p-4 flex flex-col justify-between">
          <div className="text-xs text-orange-300/80 font-mono">30-DAY SOLAR ILLUMINATION</div>
          <div className="mt-2 flex items-baseline">
            <span className="text-2xl font-mono font-bold text-orange-300 tabular-nums">
              {illumination ? `${illumination.sunlitPercentage.toFixed(1)}%` : '---'}
            </span>
            <span className="text-xs font-mono text-slate-400 ml-1.5">sunlit</span>
          </div>
          <div className="mt-2 text-xs font-mono text-slate-400">
            {illumination
              ? `Now: ${illumination.current.shadowStatus} (${illumination.current.solarElevationDeg.toFixed(1)}°)`
              : 'Computing DE421 ephemeris...'}
          </div>
        </div>

        {/* Live DE421 Solar Vector & LRO Orbiter Radar */}
        <div className="bg-[#0E0A24] border border-indigo-900/70 rounded-lg p-2 flex flex-col items-center justify-center">
          <canvas
            ref={ephemerisCanvasRef}
            width={220}
            height={130}
            className="w-full h-[118px] rounded border border-indigo-900/60 block"
          />
        </div>
      </motion.section>

      {/* Module Workspaces & Quick Target Switcher */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.34, delay: 0.1 }}
        className="grid grid-cols-1 lg:grid-cols-3 gap-6"
      >
        {/* Core Scientific Modules */}
        <div className="lg:col-span-2 bg-[#0E0A24] border border-indigo-900/70 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Live Mission Operations Modules</h3>
            <span className="text-[11px] font-mono text-teal-300">Interactive 3D &amp; NASA Feeds</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              {
                id: 'terrain' as const,
                title: 'Live Terrain Intelligence (3D LOLA)',
                desc: 'Interactive 3D LOLA DEM relief mesh, animated elevation sweep, cross-sections & NASA Moon Trek WMTS.',
                icon: Layers,
                accent: 'text-teal-300',
              },
              {
                id: 'environment' as const,
                title: 'Live Lunar Environmental Explorer',
                desc: 'Real-time 3D solar terminator & Stefan-Boltzmann thermal stage, 30-day playback & live NASA DONKI.',
                icon: Thermometer,
                accent: 'text-orange-300',
              },
              {
                id: 'earth-explorer' as const,
                title: 'Earth Location Story & NASA Live',
                desc: 'Google Maps launch pads, official 3D NASA Earth, 8-chapter Story Tour, POWER weather & EONET events.',
                icon: Globe,
                accent: 'text-sky-300',
              },
              {
                id: 'landing-site' as const,
                title: 'Landing Site Intelligence',
                desc: 'Configurable LOLA slope, roughness, crater cross-section analysis, and uncertainty assessment.',
                icon: Compass,
                accent: 'text-amber-300',
              },
              {
                id: 'illumination' as const,
                title: 'Sunlight & Illumination Sky-Dome',
                desc: 'Animated polar sky-dome solar compass, LOLA horizon masking & Earth launch-city time conversion.',
                icon: Sun,
                accent: 'text-yellow-300',
              },
              {
                id: 'simulator' as const,
                title: 'Autonomous Landing Simulator',
                desc: '3D LOLA terrain descent simulation, dynamic hazard camera feed, and Apollo 11 reconstruction.',
                icon: Rocket,
                accent: 'text-violet-300',
              },
            ].map((mod) => {
              const Icon = mod.icon;
              return (
                <motion.button
                  key={mod.id}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => setActivePage(mod.id)}
                  className="text-left p-3.5 bg-[#070514] hover:bg-[#141033] border border-indigo-900/70 hover:border-amber-400/60 rounded-md transition-colors flex flex-col justify-between gap-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white flex items-center gap-2">
                      <Icon className={`w-4 h-4 ${mod.accent}`} />
                      {mod.title}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-indigo-400" />
                  </div>
                  <p className="text-xs text-slate-300/90 leading-relaxed">{mod.desc}</p>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Preset Sites & Saved Missions */}
        <div className="bg-[#0E0A24] border border-indigo-900/70 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Quick Reference Sites</h3>
            <span className="text-xs font-mono text-amber-300">NASA LRO / Apollo</span>
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {PRESET_LUNAR_SITES.slice(0, 6).map((site) => {
              const isCurrent =
                Math.abs(site.lat - selectedCoord.lat) < 0.01 &&
                Math.abs(site.lon - selectedCoord.lon) < 0.01;
              return (
                <button
                  key={site.id}
                  onClick={() =>
                    setSelectedCoord({
                      lat: site.lat,
                      lon: site.lon,
                      name: site.name,
                      regionType: site.regionType,
                      source: site.source,
                    })
                  }
                  className={`w-full text-left px-3 py-2 rounded-md border text-xs transition-colors ${
                    isCurrent
                      ? 'bg-gradient-to-r from-amber-500/20 to-violet-500/15 border-amber-400/60 text-amber-200'
                      : 'bg-[#070514] border-indigo-900/70 hover:border-violet-500/50 text-slate-300'
                  }`}
                >
                  <div className="font-medium truncate">{site.name}</div>
                  <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                    {formatCoordPair(site, settings.coordinateFormat)} · {site.category}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="pt-3 border-t border-indigo-900/60">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-slate-200">Saved Missions ({missions.length})</h4>
              <button
                onClick={() => setActivePage('mission-planner')}
                className="text-xs text-amber-300 hover:text-amber-200 font-medium"
              >
                New Plan
              </button>
            </div>
            {missions.length === 0 ? (
              <p className="text-xs text-slate-400">
                No custom mission plans saved yet. Create one in Mission Planner.
              </p>
            ) : (
              <div className="space-y-1.5">
                {missions.slice(0, 3).map((m) => (
                  <div
                    key={m.id}
                    className="bg-[#070514] border border-indigo-900/70 rounded px-2.5 py-2 text-xs"
                  >
                    <div className="font-medium text-slate-100 truncate">{m.name}</div>
                    <div className="text-[11px] font-mono text-teal-300/90">
                      {m.missionType} · Δv {m.calculations.totalDeltaVMs} m/s
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Provenance Footer Notice */}
      <section className="bg-[#0E0A24] border border-indigo-900/70 rounded-lg p-4 text-xs text-slate-300 flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="font-semibold text-white">Data Provenance Policy: </span>
          All elevation, slope, and relief metrics derive from official NASA PDS3 LOLA GDR rasters (LRO-L-LOLA-4-GDR-V1.0). Unmeasured sub-pixel hazards and live telemetry are never fabricated.
        </div>
        <button
          onClick={() => setActivePage('data-center')}
          className="text-amber-300 hover:text-amber-200 font-mono whitespace-nowrap"
        >
          Inspect NASA Datasets
        </button>
      </section>
    </div>
  );
};
