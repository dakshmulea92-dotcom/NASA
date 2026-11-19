import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { AlertCircle, Clock, ExternalLink, Radiation, ShieldAlert, Sun, Thermometer } from 'lucide-react';
import { useLunar } from '../context/LunarContext.tsx';
import { LiveEnvironmentStage3D } from '../components/LiveEnvironmentStage3D.tsx';
import { formatCoordPair } from '../utils/coordinateFormat.ts';
import type { NasaDonkiSummary } from '../types/lunar.ts';

/**
 * Radiative equilibrium estimate using Stefan-Boltzmann law for illuminated lunar regolith:
 * T_eq = ((1 - A) * S_0 * sin(el) / (epsilon * sigma))^(1/4)
 * with lunar bond albedo A = 0.12, emissivity epsilon = 0.95, S_0 = 1361 W/m^2.
 * Clearly labeled as a physics-derived estimate, NOT a live LRO Diviner observation.
 */
function estimateRadiativeTempK(solarElevationDeg: number, isShadowed: boolean, absLat: number): {
  tempK: number | null;
  tempC: number | null;
  fluxWm2: number;
  note: string;
} {
  if (isShadowed || solarElevationDeg <= 0) {
    return {
      tempK: null,
      tempC: null,
      fluxWm2: 0,
      note:
        absLat > 84
          ? 'NASA DATA UNAVAILABLE for instantaneous local point; LRO Diviner published PSR/polar night temperatures range ~30 K to 95 K (-243°C to -178°C).'
          : 'NASA DATA UNAVAILABLE for instantaneous local point; LRO Diviner equatorial/mid-latitude nighttime regolith cools to ~95 K to 120 K (-178°C to -153°C).',
    };
  }
  const S0 = 1361;
  const albedo = 0.12;
  const emissivity = 0.95;
  const sigma = 5.670374e-8;
  const sinEl = Math.sin((solarElevationDeg * Math.PI) / 180);
  const absorbedFlux = (1 - albedo) * S0 * sinEl;
  const T = Math.pow(absorbedFlux / (emissivity * sigma), 0.25);
  return {
    tempK: Number(T.toFixed(1)),
    tempC: Number((T - 273.15).toFixed(1)),
    fluxWm2: Number((S0 * sinEl).toFixed(1)),
    note: 'Physics-derived radiative equilibrium T = ((1−A)·S₀·sin(el)/(ε·σ))^0.25 (A=0.12, ε=0.95); not a direct real-time thermometer reading.',
  };
}

export const EnvironmentPage: React.FC = () => {
  const { selectedCoord, assessment, illumination, settings } = useLunar();

  const [playing, setPlaying] = useState(true);
  const [thermalView, setThermalView] = useState(true);
  const [timelineIdx, setTimelineIdx] = useState(0);
  const [liveUtc, setLiveUtc] = useState(() => new Date().toISOString().slice(11, 19));
  const [donki, setDonki] = useState<NasaDonkiSummary | null>(null);
  const [loadingDonki, setLoadingDonki] = useState(false);

  const timeline = illumination?.timeline ?? [];

  // Live UTC wall-clock ticker
  useEffect(() => {
    const id = window.setInterval(() => {
      setLiveUtc(new Date().toISOString().slice(11, 19));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Fetch real NASA DONKI space weather SEP & Solar Flare feed
  useEffect(() => {
    setLoadingDonki(true);
    fetch('/api/space/donki')
      .then((r) => r.json())
      .then((d: NasaDonkiSummary) => {
        setDonki(d);
        setLoadingDonki(false);
      })
      .catch(() => {
        setDonki(null);
        setLoadingDonki(false);
      });
  }, []);

  // Reset timeline scrub index when target changes
  useEffect(() => {
    setTimelineIdx(0);
  }, [selectedCoord.lat, selectedCoord.lon]);

  // Smooth animated progression across 30-day DE421 solar ephemeris timeline
  useEffect(() => {
    if (!playing || timeline.length < 2) return;
    const id = window.setInterval(() => {
      setTimelineIdx((prev) => (prev + 1) % timeline.length);
    }, 320);
    return () => window.clearInterval(id);
  }, [playing, timeline.length]);

  const activePoint =
    timeline.length > 0
      ? timeline[Math.min(timelineIdx, timeline.length - 1)]
      : illumination?.current ?? null;

  const dem = assessment?.dem ?? null;
  const horizon = assessment?.horizon ?? null;

  const radiative = activePoint
    ? estimateRadiativeTempK(
        activePoint.solarElevationDeg,
        !activePoint.isDirectSunlight,
        Math.abs(selectedCoord.lat)
      )
    : null;

  const thermalWavePoints = useMemo(() => {
    if (timeline.length === 0) return [];
    return timeline.map((pt) => {
      const est = estimateRadiativeTempK(
        pt.solarElevationDeg,
        !pt.isDirectSunlight,
        Math.abs(selectedCoord.lat)
      );
      return {
        utcIso: pt.utcIso,
        tempK: est.tempK ?? (Math.abs(selectedCoord.lat) > 84 ? 65 : 105),
        measuredAvailable: est.tempK !== null,
      };
    });
  }, [timeline, selectedCoord.lat]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="max-w-7xl mx-auto space-y-5"
    >
      {/* Live Header & Time Scrub Controls */}
      <section className="bg-[#0B1120] border border-slate-800 rounded-md p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-mono text-cyan-400">
              LIVE LUNAR MICRO-ENVIRONMENT SIMULATOR (DE421 EPHEMERIS + LOLA DEM + DONKI)
            </div>
            <h2 className="text-xl font-display font-bold text-slate-100">
              {selectedCoord.name || 'Selected Lunar Region'} ·{' '}
              {formatCoordPair(selectedCoord, settings.coordinateFormat)}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
            <span className="text-slate-300 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              UTC {liveUtc}
            </span>
            <span className="text-slate-400">Exosphere: ~3×10⁻¹⁵ bar</span>
          </div>
        </div>

        {/* Interactive 30-day Epoch Scrub Slider */}
        {timeline.length > 0 && activePoint && (
          <div className="bg-[#060911] border border-slate-800 rounded p-3 space-y-1.5">
            <div className="flex flex-wrap items-center justify-between text-xs font-mono">
              <span className="text-cyan-300">
                Simulated Solar Epoch: {activePoint.utcIso.slice(0, 16).replace('T', ' ')} UTC
              </span>
              <span className="text-amber-300">
                {activePoint.shadowStatus} · El {activePoint.solarElevationDeg.toFixed(2)}° · Az{' '}
                {activePoint.solarAzimuthDeg.toFixed(1)}°
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(0, timeline.length - 1)}
              value={timelineIdx}
              onChange={(e) => {
                setPlaying(false);
                setTimelineIdx(Number(e.target.value));
              }}
              className="w-full accent-amber-400"
            />
          </div>
        )}
      </section>

      {/* Live Animated 3D Solar Terminator & Thermal IR Stage */}
      <LiveEnvironmentStage3D
        dem={dem}
        solarElevationDeg={activePoint?.solarElevationDeg ?? 8}
        solarAzimuthDeg={activePoint?.solarAzimuthDeg ?? 90}
        isShadowed={activePoint ? !activePoint.isDirectSunlight : false}
        thermalView={thermalView}
        playing={playing}
        onToggleThermal={() => setThermalView((t) => !t)}
        onTogglePlay={() => setPlaying((p) => !p)}
        lightweightMode={settings.lightweightMode}
      />

      {/* Live Radiative Thermal Wave Curve */}
      {thermalWavePoints.length > 0 && (
        <section className="bg-[#0B1120] border border-slate-800 rounded-md p-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-100">
              30-Day Physics-Derived Radiative Temperature Cycle (Click/Scrub Synced)
            </span>
            <span className="font-mono text-slate-400">
              Stefan–Boltzmann Sunlit Equilibrium + LRO Diviner Nighttime Baseline Range
            </span>
          </div>
          <div className="bg-[#060911] border border-slate-800 rounded p-2">
            <svg viewBox="0 0 800 130" className="w-full h-32">
              {(() => {
                const pathD = thermalWavePoints
                  .map((p, i) => {
                    const x = 40 + (i / (thermalWavePoints.length - 1)) * 740;
                    const y = 110 - ((Math.min(400, Math.max(40, p.tempK)) - 40) / 360) * 92;
                    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
                  })
                  .join(' ');
                const curX =
                  40 + (timelineIdx / Math.max(1, thermalWavePoints.length - 1)) * 740;
                const curY =
                  110 -
                  ((Math.min(400, Math.max(40, thermalWavePoints[timelineIdx]?.tempK ?? 100)) - 40) /
                    360) *
                    92;
                return (
                  <>
                    <line x1="40" y1="18" x2="780" y2="18" stroke="#1e293b" strokeDasharray="3 3" />
                    <line x1="40" y1="110" x2="780" y2="110" stroke="#334155" />
                    <path d={pathD} fill="none" stroke="#f97316" strokeWidth="2" />
                    <line x1={curX} y1="10" x2={curX} y2="112" stroke="#22d3ee" strokeWidth="1.5" />
                    <circle cx={curX} cy={curY} r="4" fill="#22d3ee" />
                    <text x="4" y="22" fill="#94a3b8" fontSize="10" fontFamily="monospace">400K</text>
                    <text x="4" y="112" fill="#94a3b8" fontSize="10" fontFamily="monospace">40K</text>
                  </>
                );
              })()}
            </svg>
          </div>
        </section>
      )}

      {/* 4 Domain Breakdown Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* 1. Surface Temperature */}
        <div className="bg-[#0B1120] border border-slate-800 rounded-md p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Thermometer className="w-4 h-4 text-amber-400" />
              1. Surface Temperature (Radiative Regime)
            </h3>
            <span className="text-[11px] font-mono text-slate-400">Derived + LRO Diviner Ref</span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-[#060911] border border-slate-800 rounded p-3">
              <div className="text-slate-400 font-mono text-[11px]">Epoch Equilibrium Estimate</div>
              <div className="text-lg font-mono font-bold text-slate-100 mt-1 tabular-nums">
                {radiative?.tempK !== null && radiative?.tempK !== undefined
                  ? `${radiative.tempK} K (${radiative.tempC}°C)`
                  : 'NASA DATA UNAVAILABLE'}
              </div>
              <div className="text-[11px] font-mono text-amber-300 mt-0.5">
                Solar Flux: {radiative?.fluxWm2 ?? 0} W/m²
              </div>
            </div>
            <div className="bg-[#060911] border border-slate-800 rounded p-3">
              <div className="text-slate-400 font-mono text-[11px]">LRO Diviner Published Bounds</div>
              <div className="text-sm font-mono font-semibold text-slate-200 mt-1">
                {Math.abs(selectedCoord.lat) > 80
                  ? '30 K – 220 K (Polar)'
                  : '95 K – 390 K (Non-Polar)'}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">Williams et al. (2017) LRO Diviner</div>
            </div>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            {radiative?.note || 'Calculating solar incidence for radiative temperature regime...'}
          </p>
        </div>

        {/* 2. Solar Illumination & Shadows */}
        <div className="bg-[#0B1120] border border-slate-800 rounded-md p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Sun className="w-4 h-4 text-amber-400" />
              2. Live Solar Geometry &amp; Shadowing
            </h3>
            <span className="text-[11px] font-mono text-slate-400">DE421 + LOLA Horizon</span>
          </div>

          {activePoint && illumination ? (
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-[#060911] border border-slate-800 rounded p-3">
                <div className="text-slate-400 font-mono text-[11px]">Solar Elevation / Incidence</div>
                <div className="text-lg font-mono font-bold text-amber-300 mt-1 tabular-nums">
                  {activePoint.solarElevationDeg.toFixed(2)}° el
                </div>
                <div className="text-[11px] font-mono text-slate-400">
                  Inc: {activePoint.solarIncidenceDeg.toFixed(2)}° · Az {activePoint.solarAzimuthDeg.toFixed(1)}°
                </div>
              </div>
              <div className="bg-[#060911] border border-slate-800 rounded p-3">
                <div className="text-slate-400 font-mono text-[11px]">Shadow / PSR Status</div>
                <div className="text-sm font-mono font-bold text-slate-100 mt-1">
                  {activePoint.shadowStatus}
                </div>
                <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                  30d Sunlit: {illumination.sunlitPercentage}% · Horizon: {activePoint.terrainHorizonAngleDeg.toFixed(2)}°
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs font-mono text-slate-500">Computing solar geometry...</div>
          )}

          <p className="text-xs text-slate-400 leading-relaxed">
            Polar Permanently Shadowed Regions (PSRs) occur where crater walls exceed the Moon&apos;s maximum ~1.54° axial solar elevation, acting as cryogenic volatile cold traps.
          </p>
        </div>

        {/* 3. Live NASA DONKI Space Weather & Radiation */}
        <div className="bg-[#0B1120] border border-slate-800 rounded-md p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Radiation className="w-4 h-4 text-cyan-400" />
              3. Live NASA DONKI Space Weather &amp; Radiation
            </h3>
            <span className="text-[11px] font-mono text-slate-400">CCMC DONKI + LRO CRaTER</span>
          </div>

          <div className="bg-[#060911] border border-slate-800 rounded p-3 space-y-2 text-xs">
            <div className="flex justify-between font-mono">
              <span className="text-slate-400">Published GCR Baseline (LRO CRaTER)</span>
              <span className="text-slate-200">~1.1 – 1.4 mSv/day</span>
            </div>
            <div className="flex justify-between font-mono">
              <span className="text-slate-400">Live Local Lunar Dosimeter</span>
              <span className="text-amber-400">NASA DATA UNAVAILABLE</span>
            </div>
            <div className="flex justify-between font-mono">
              <span className="text-slate-400">DONKI 30d SEP / Flare Feed</span>
              <span className={donki?.available ? 'text-cyan-300' : 'text-amber-400'}>
                {loadingDonki
                  ? 'Querying NASA DONKI...'
                  : donki?.available
                  ? `${donki.events.length} Solar Events Logged`
                  : 'NASA DATA UNAVAILABLE'}
              </span>
            </div>
          </div>

          {donki?.available && donki.events.length > 0 ? (
            <div className="max-h-32 overflow-y-auto space-y-1.5 text-xs">
              {donki.events.slice(0, 5).map((ev) => (
                <a
                  key={ev.id}
                  href={ev.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between bg-[#060911] border border-slate-800 hover:border-cyan-700 rounded px-2.5 py-1.5 font-mono text-[11px]"
                >
                  <span className="text-slate-200 truncate">
                    [{ev.type}{ev.classType ? ` ${ev.classType}` : ''}] {ev.beginTimeUtc.slice(0, 16)} UTC
                  </span>
                  <ExternalLink className="w-3 h-3 text-cyan-400 shrink-0" />
                </a>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 leading-relaxed">
              {donki?.unavailableReason ||
                'No global magnetosphere shields the lunar surface from GCRs and Solar Particle Events (SPEs). Unverified fluxes are never synthesized.'}
            </p>
          )}
        </div>

        {/* 4. Local Terrain & Electrostatic Regolith Context */}
        <div className="bg-[#0B1120] border border-slate-800 rounded-md p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-cyan-400" />
              4. Local Terrain &amp; Electrostatic Regolith Context
            </h3>
            <span className="text-[11px] font-mono text-slate-400">LOLA PDS3 Measured</span>
          </div>

          {dem?.dataAvailable && horizon ? (
            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="bg-[#060911] border border-slate-800 rounded p-2.5">
                <div className="text-slate-400 text-[11px]">Elevation Range</div>
                <div className="text-slate-100 font-semibold mt-0.5">
                  {dem.minElevationM.toFixed(0)} to {dem.maxElevationM.toFixed(0)} m
                </div>
              </div>
              <div className="bg-[#060911] border border-slate-800 rounded p-2.5">
                <div className="text-slate-400 text-[11px]">RMS Roughness</div>
                <div className="text-slate-100 font-semibold mt-0.5">{dem.rmsRoughnessM.toFixed(1)} m</div>
              </div>
              <div className="bg-[#060911] border border-slate-800 rounded p-2.5">
                <div className="text-slate-400 text-[11px]">Horizon Masking</div>
                <div className="text-slate-100 font-semibold mt-0.5">
                  Max {horizon.maxHorizonAngleDeg}° · Mean {horizon.meanHorizonAngleDeg}°
                </div>
              </div>
              <div className="bg-[#060911] border border-slate-800 rounded p-2.5">
                <div className="text-slate-400 text-[11px]">Polar Regime</div>
                <div className="text-slate-100 font-semibold mt-0.5">
                  {Math.abs(selectedCoord.lat) >= 80 ? 'Polar (Grazing Sun)' : 'Non-Polar'}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs font-mono text-amber-400">NASA DATA UNAVAILABLE</div>
          )}

          <div className="flex items-start gap-2 text-xs text-slate-400 pt-1">
            <AlertCircle className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
            <span>
              Low-angle polar sunlight creates long dynamic shadows and strong lateral thermal gradients across crater rims, increasing regolith electrostatic charging at terminator crossings.
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
