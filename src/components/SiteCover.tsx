import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Compass,
  Cpu,
  Database,
  Globe,
  Layers,
  Navigation,
  Rocket,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { useLunar } from '../context/LunarContext.tsx';
import { PRESET_LUNAR_SITES } from '../data/lunarCatalog.ts';
import type { PageId } from '../types/lunar.ts';

interface SiteCoverProps {
  onEnterWorkspace: (targetPage?: PageId) => void;
}

const COVER_HERO_IMG = '/src/assets/images/cover_lunar_south_pole_1795019065705.jpg';
const COVER_LOLA_IMG = '/src/assets/images/cover_lola_elevation_model_1795019066302.jpg';
const COVER_LANDER_IMG = '/src/assets/images/cover_lander_descent_1795019066498.jpg';

const WORKFLOW_STEPS = [
  {
    step: '01',
    title: '01. Surface & Elevation Ingestion',
    lead: 'Sample official NASA LRO planetary grids at any coordinate.',
    detail:
      'Pick an Artemis south-pole ridge, an Apollo landing site, or click anywhere on the interactive 3D Moon. LUNASIGHT immediately queries NASA PDS3 LOLA digital elevation rasters, LROC optical mosaics, and Mini-RF 2.38 GHz S-band radar backscatter.',
    image: COVER_LOLA_IMG,
    imageAlt: '3D hypsometric lunar crater elevation model generated from LRO LOLA data',
    metrics: [
      { label: 'Altimeter Source', value: 'NASA PDS3 LOLA GDR' },
      { label: 'Radar Layer', value: 'Mini-RF S-Band 2.38 GHz' },
      { label: 'Optical Layer', value: 'LROC WAC 303 ppd' },
    ],
  },
  {
    step: '02',
    title: '02. Multi-Factor Terrain & Solar Modeling',
    lead: 'Compute slope hazards, 360° ridge shadows, and thermal swings.',
    detail:
      'Using Horn 3×3 spatial gradients, the terrain engine derives local slope, P95 extremes, RMS roughness, and Terrain Ruggedness Index (TRI). Analytical DE421 solar ephemeris and 360° horizon elevation masking calculate sunlit availability and Stefan-Boltzmann radiative temperatures.',
    image: COVER_HERO_IMG,
    imageAlt: 'Grazing sunlight illuminating south polar lunar crater rims with Earth on the horizon',
    metrics: [
      { label: 'Gradient Method', value: 'Horn 3×3 Kernel' },
      { label: 'Solar Geometry', value: 'SPICE / DE421 Ephemeris' },
      { label: 'Thermal Model', value: 'Stefan-Boltzmann IR' },
    ],
  },
  {
    step: '03',
    title: '03. Autonomous Descent & Mission Synthesis',
    lead: 'Simulate landing, plan Δv milestones, and validate launch windows.',
    detail:
      'Verified terrain hazards and illumination duty cycles feed directly into the 3D Autonomous Landing Simulator, interactive Mission Timeline, Rover Traverse Explorer, Earth launch-site weather feeds (NASA POWER & EONET), and a grounded AI Mission Analyst.',
    image: COVER_LANDER_IMG,
    imageAlt: 'Robotic lunar lander firing amber descent thrusters above sunlit crater terrain',
    metrics: [
      { label: 'Reference Δv', value: '5,930 m/s Two-Body' },
      { label: 'Launch Weather', value: 'NASA POWER MERRA-2' },
      { label: 'Provenance Rule', value: 'Zero Fabricated Data' },
    ],
  },
];

const FEATURED_COVER_SITES = [
  {
    site: PRESET_LUNAR_SITES[0], // Shackleton Rim
    elevationNote: 'Artemis III Polar Ridge',
    orbitInclination: '89.7° Polar',
  },
  {
    site: PRESET_LUNAR_SITES[3], // Apollo 11
    elevationNote: 'Smooth Basaltic Mare',
    orbitInclination: '0.7° Equatorial',
  },
  {
    site: PRESET_LUNAR_SITES[2], // Malapert Massif
    elevationNote: 'Direct Earth Line-of-Sight',
    orbitInclination: '86.0° South Massif',
  },
];

export const SiteCover: React.FC<SiteCoverProps> = ({ onEnterWorkspace }) => {
  const { selectedCoord, setSelectedCoord, assessment, illumination } = useLunar();
  const [activeStepIdx, setActiveStepIdx] = useState<number>(0);
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  const activeStep = WORKFLOW_STEPS[activeStepIdx] ?? WORKFLOW_STEPS[0];

  const handleSelectPreviewSite = (siteIndex: number) => {
    const picked = FEATURED_COVER_SITES[siteIndex]?.site;
    if (!picked) return;
    setSelectedCoord({
      lat: picked.lat,
      lon: picked.lon,
      name: picked.name,
      regionType: picked.regionType,
      source: picked.source,
    });
  };

  return (
    <div className="min-h-screen bg-[#070514] text-slate-100 relative overflow-x-clip">
      {/* Ambient Vibrant Cosmic Lighting Fields (Pure CSS atmospheric gradient) */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden z-0"
      >
        <motion.div
          animate={{ opacity: [0.35, 0.55, 0.35], scale: [1, 1.06, 1] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-44 -left-32 w-[560px] h-[560px] rounded-full bg-violet-600/20 blur-[120px]"
        />
        <motion.div
          animate={{ opacity: [0.3, 0.5, 0.3], scale: [1.04, 0.98, 1.04] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-12 -right-32 w-[520px] h-[520px] rounded-full bg-amber-500/20 blur-[120px]"
        />
        <div className="absolute bottom-0 left-1/3 w-[620px] h-[360px] rounded-full bg-teal-500/10 blur-[130px]" />
      </div>

      {/* Strict 3-Zone Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-[#070514]/85 backdrop-blur-md border-b border-indigo-900/60">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="font-display font-bold text-lg tracking-tight text-white whitespace-nowrap shrink-0 text-left focus-visible:outline-2 focus-visible:outline-amber-400 rounded"
          >
            ARC LUNA — LUNASIGHT
          </button>

          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-300">
            <a
              href="#about-model"
              className="hover:text-amber-300 transition-colors whitespace-nowrap shrink-0"
            >
              About Model
            </a>
            <a
              href="#how-it-works"
              className="hover:text-amber-300 transition-colors whitespace-nowrap shrink-0"
            >
              How It Works
            </a>
            <a
              href="#why-helpful"
              className="hover:text-amber-300 transition-colors whitespace-nowrap shrink-0"
            >
              Why Helpful
            </a>
            <button
              type="button"
              onClick={() => onEnterWorkspace('data-center')}
              className="hover:text-teal-300 transition-colors whitespace-nowrap shrink-0"
            >
              NASA Datasets
            </button>
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => onEnterWorkspace('command-center')}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:from-amber-400 hover:via-orange-400 hover:to-rose-400 text-slate-950 font-semibold text-xs sm:text-sm transition-all shadow-lg shadow-orange-500/20 whitespace-nowrap shrink-0 flex items-center gap-1.5"
            >
              <span>Command Center</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        {/* HERO SECTION — Animated Cover with Live Lunar Horizon Motion */}
        <section className="max-w-7xl mx-auto px-6 pt-10 pb-16 lg:pt-14 lg:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            {/* Left Editorial & Action Column */}
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              className="lg:col-span-6 flex flex-col justify-center space-y-6"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-amber-300 tracking-wide">
                <span>NASA LRO / LOLA</span>
                <span aria-hidden="true" className="text-indigo-500">·</span>
                <span>DE421 Ephemeris</span>
                <span aria-hidden="true" className="text-indigo-500">·</span>
                <span className="text-teal-300">Autonomous Descent &amp; Earth Ops</span>
              </div>

              <h1
                className="font-display font-extrabold tracking-tight text-white leading-[1.06] text-balance"
                style={{ fontSize: 'clamp(2.35rem, 4.3vw, 3.85rem)' }}
              >
                Navigate the Moon with{' '}
                <span className="bg-gradient-to-r from-amber-300 via-orange-400 to-fuchsia-400 bg-clip-text text-transparent">
                  Real NASA Science.
                </span>
              </h1>

              <p className="text-base sm:text-lg text-slate-300 leading-relaxed max-w-xl">
                ARC LUNA — LUNASIGHT is an interactive lunar navigation, terrain intelligence, and
                mission simulation platform. Explore 3D LOLA topography, verify solar illumination
                windows, inspect Earth launch corridors, and test autonomous landings built strictly
                from official NASA datasets.
              </p>

              {/* Primary CTA & Secondary Guide Anchor */}
              <div className="flex flex-wrap items-center gap-4 pt-1">
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => onEnterWorkspace('command-center')}
                  className="px-6 py-3.5 rounded-lg bg-gradient-to-r from-amber-500 via-orange-500 to-fuchsia-500 hover:brightness-110 text-slate-950 font-display font-bold text-sm sm:text-base shadow-xl shadow-orange-500/25 flex items-center gap-2.5 transition-all whitespace-nowrap shrink-0"
                >
                  <span>Enter Command Center</span>
                  <ArrowRight className="w-4 h-4" />
                </motion.button>

                <a
                  href="#how-it-works"
                  className="px-5 py-3.5 rounded-lg bg-[#0E0A24] hover:bg-[#161038] border border-indigo-800/80 text-slate-100 font-medium text-sm transition-colors whitespace-nowrap shrink-0"
                >
                  See How Our Model Works
                </a>
              </div>

              {/* Interactive Target Selector on Cover (Directly updates live Mission Context) */}
              <div className="pt-4 border-t border-indigo-900/70 space-y-2.5">
                <div className="text-xs font-mono text-slate-400">
                  Preview Active Mission Target Before Launching
                </div>
                <div className="flex flex-wrap gap-2">
                  {FEATURED_COVER_SITES.map((item, idx) => {
                    const isSelected =
                      Math.abs(selectedCoord.lat - item.site.lat) < 0.05 &&
                      Math.abs(selectedCoord.lon - item.site.lon) < 0.05;
                    return (
                      <button
                        key={item.site.id}
                        type="button"
                        onClick={() => handleSelectPreviewSite(idx)}
                        className={`px-3 py-2 rounded-md text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                          isSelected
                            ? 'bg-violet-600/25 border-amber-400/70 text-amber-200'
                            : 'bg-[#0E0A24]/90 border-indigo-900/70 text-slate-300 hover:border-violet-500/60 hover:text-white'
                        }`}
                      >
                        {(item.site.name ?? 'Lunar Target').split('(')[0].split('—')[0].trim()}
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>

            {/* Right Animated Orbital Viewport Cover Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
              className="lg:col-span-6 relative rounded-xl overflow-hidden border border-indigo-800/80 bg-[#0E0A24] min-h-[420px] lg:min-h-[480px] flex flex-col justify-between"
            >
              {/* High-resolution Lunar South Pole background with gentle cosmic pan */}
              {!heroImgFailed ? (
                <motion.img
                  src={COVER_HERO_IMG}
                  alt="Lunar South Pole sunlit crater ridges with glowing crescent Earth"
                  referrerPolicy="no-referrer"
                  onError={() => setHeroImgFailed(true)}
                  animate={{ scale: [1.02, 1.07, 1.02] }}
                  transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-violet-950 to-[#070514]" />
              )}

              {/* Measured Scrim ensuring high contrast for telemetry overlays */}
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-[#070514] via-[#070514]/35 to-[#070514]/65"
              />

              {/* Animated Orbital Vector Overlay (SVG rotating trajectory rings & LRO sweep) */}
              <div
                aria-hidden="true"
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
              >
                <motion.svg
                  viewBox="0 0 400 400"
                  className="w-[340px] h-[340px] sm:w-[400px] sm:h-[400px] opacity-80"
                >
                  <motion.circle
                    cx="200"
                    cy="200"
                    r="142"
                    fill="none"
                    stroke="rgba(251, 191, 36, 0.38)"
                    strokeWidth="1.2"
                    strokeDasharray="6 8"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 48, repeat: Infinity, ease: 'linear' }}
                    style={{ originX: '200px', originY: '200px' }}
                  />
                  <motion.ellipse
                    cx="200"
                    cy="200"
                    rx="172"
                    ry="72"
                    fill="none"
                    stroke="rgba(45, 212, 191, 0.48)"
                    strokeWidth="1.4"
                    transform="rotate(-22 200 200)"
                  />
                  <motion.ellipse
                    cx="200"
                    cy="200"
                    rx="124"
                    ry="165"
                    fill="none"
                    stroke="rgba(168, 85, 247, 0.36)"
                    strokeWidth="1"
                    strokeDasharray="3 6"
                    animate={{ rotate: -360 }}
                    transition={{ duration: 64, repeat: Infinity, ease: 'linear' }}
                    style={{ originX: '200px', originY: '200px' }}
                  />
                </motion.svg>
              </div>

              {/* Top Target Bar inside Cover Viewport */}
              <div className="relative z-10 p-5 flex items-center justify-between gap-4 border-b border-white/10">
                <div>
                  <div className="text-[11px] font-mono text-amber-300">
                    Active Telemetry Preview
                  </div>
                  <div className="text-sm font-display font-bold text-white truncate max-w-[260px]">
                    {selectedCoord.name || 'Custom Target'}
                  </div>
                </div>
                <div className="text-right font-mono text-xs text-teal-300 tabular-nums">
                  {selectedCoord.lat.toFixed(2)}°, {selectedCoord.lon.toFixed(2)}°
                </div>
              </div>

              {/* Bottom Live Readout Strip */}
              <div className="relative z-10 p-5 space-y-4">
                <div className="grid grid-cols-3 gap-3 bg-[#070514]/85 border border-indigo-800/70 rounded-lg p-3.5 backdrop-blur-sm">
                  <div>
                    <div className="text-[11px] font-mono text-slate-400">LOLA Elevation</div>
                    <div className="text-base sm:text-lg font-mono font-semibold text-white tabular-nums mt-0.5">
                      {assessment?.dem.dataAvailable
                        ? `${assessment.dem.meanElevationM.toFixed(0)} m`
                        : 'Pending'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-mono text-slate-400">Mean Slope</div>
                    <div className="text-base sm:text-lg font-mono font-semibold text-amber-300 tabular-nums mt-0.5">
                      {assessment?.dem.dataAvailable
                        ? `${assessment.dem.meanSlopeDeg.toFixed(2)}°`
                        : 'Pending'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-mono text-slate-400">30d Sunlit</div>
                    <div className="text-base sm:text-lg font-mono font-semibold text-teal-300 tabular-nums mt-0.5">
                      {illumination ? `${illumination.sunlitPercentage.toFixed(1)}%` : 'Pending'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>Source: {assessment?.dem.datasetUsed.datasetId || 'NASA LRO LOLA GDR'}</span>
                  <button
                    type="button"
                    onClick={() => onEnterWorkspace('lunar-explorer')}
                    className="font-semibold text-amber-300 hover:text-amber-200 flex items-center gap-1 transition-colors"
                  >
                    <span>Inspect 3D Moon</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>

          {/* 4-Column Quantitative Capabilities Strip below Hero */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.16 }}
            className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            {[
              {
                title: '13 Mission Modules',
                desc: 'Command center, 3D globe, terrain intelligence, descent sim, rover ops & Earth launch feeds.',
                accent: 'text-amber-300',
              },
              {
                title: 'Horn 3×3 & Horizon Raycast',
                desc: 'Calculates slope gradients, roughness, crater clearance, and 360° terrain solar occlusion.',
                accent: 'text-violet-300',
              },
              {
                title: 'Official NASA Assets Only',
                desc: 'PDS3 LOLA, LROC optical, Mini-RF radar, SPICE DE421, POWER weather, DONKI & EONET.',
                accent: 'text-teal-300',
              },
              {
                title: 'Strict Data Honesty',
                desc: 'Measured values stay separate from educational estimates; missing feeds report NASA DATA UNAVAILABLE.',
                accent: 'text-emerald-300',
              },
            ].map((kpi) => (
              <div
                key={kpi.title}
                className="bg-[#0E0A24]/90 border border-indigo-900/60 rounded-lg p-4 space-y-1.5"
              >
                <div className={`font-display font-bold text-base ${kpi.accent}`}>{kpi.title}</div>
                <p className="text-xs text-slate-300 leading-relaxed">{kpi.desc}</p>
              </div>
            ))}
          </motion.div>
        </section>

        {/* SECTION 1 — ABOUT OUR MODEL */}
        <section
          id="about-model"
          className="border-t border-indigo-900/60 bg-[#0B081D]/80 py-16 lg:py-20"
        >
          <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <motion.div
              initial={{ opacity: 0, x: -16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.45 }}
              className="lg:col-span-6 rounded-xl overflow-hidden border border-indigo-800/70 bg-[#070514]"
            >
              <img
                src={COVER_LOLA_IMG}
                alt="3D Lunar Crater Topography LRO LOLA Elevation Visualization"
                referrerPolicy="no-referrer"
                className="w-full h-72 sm:h-96 object-cover"
              />
              <div className="px-5 py-3.5 border-t border-indigo-900/70 flex items-center justify-between text-xs font-mono text-slate-300">
                <span>LRO LOLA Hypsometric Relief Representation</span>
                <span className="text-amber-300">1,737.4 km Sphere Datum</span>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.45 }}
              className="lg:col-span-6 space-y-5"
            >
              <div className="text-xs font-mono text-violet-300 tracking-wide">
                About Our Scientific Model
              </div>
              <h2 className="font-display font-bold text-2xl sm:text-4xl text-white text-balance">
                Built on Verified Orbital Telemetry, Not Synthetic Assumptions
              </h2>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                Most space visualizers render static artistic spheres with invented numbers.
                ARC LUNA — LUNASIGHT runs an end-to-end planetary analysis pipeline anchored to
                published NASA Lunar Reconnaissance Orbiter datasets and physical constants.
              </p>

              <div className="space-y-4 pt-2">
                <div className="flex items-start gap-3.5">
                  <div className="p-2.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 shrink-0">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-display font-semibold text-sm sm:text-base text-white">
                      True Elevation &amp; Radar Backscatter
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-300 mt-0.5 leading-relaxed">
                      Combines NASA PDS3 LOLA digital elevation grids with live Moon Trek optical
                      photography (LROC WAC) and Mini-RF 2.38 GHz radar imagery so surface
                      roughness and subsurface ice candidates stay visible side-by-side.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="p-2.5 rounded-lg bg-violet-500/15 border border-violet-500/30 text-violet-300 shrink-0">
                    <Sun className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-display font-semibold text-sm sm:text-base text-white">
                      Ephemeris-Driven Sunlight &amp; Thermal Physics
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-300 mt-0.5 leading-relaxed">
                      Determines solar azimuth, elevation, and local terrain ridge occlusion across
                      30-day lunar cycles, deriving equilibrium surface temperatures with explicit
                      Stefan-Boltzmann radiation physics.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="p-2.5 rounded-lg bg-teal-500/15 border border-teal-500/30 text-teal-300 shrink-0">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-display font-semibold text-sm sm:text-base text-white">
                      Transparent Uncertainty &amp; Citation Provenance
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-300 mt-0.5 leading-relaxed">
                      Every score, elevation band, and weather reading states its original dataset
                      ID, spatial resolution, and observation window—never mixing simulated test
                      burns with real spacecraft records.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* SECTION 2 — HOW IT WORKS (Interactive Animated Stepper) */}
        <section id="how-it-works" className="max-w-7xl mx-auto px-6 py-16 lg:py-22 space-y-10">
          <div className="max-w-2xl space-y-3">
            <div className="text-xs font-mono text-teal-300">How LUNASIGHT Works</div>
            <h2 className="font-display font-bold text-2xl sm:text-4xl text-white text-balance">
              Three Connected Stages from Raw Orbit Data to Mission Readiness
            </h2>
            <p className="text-sm sm:text-base text-slate-300">
              Select a stage below to inspect how coordinates, terrain metrics, solar cycles, and
              flight simulations flow together across the console.
            </p>
          </div>

          {/* Interactive Step Tabs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {WORKFLOW_STEPS.map((item, idx) => {
              const isActive = activeStepIdx === idx;
              return (
                <button
                  key={item.step}
                  type="button"
                  onClick={() => setActiveStepIdx(idx)}
                  className={`relative text-left p-4 rounded-lg border transition-colors ${
                    isActive
                      ? 'bg-[#151034] border-amber-400/70 text-white'
                      : 'bg-[#0E0A24] border-indigo-900/60 text-slate-300 hover:border-violet-500/60'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="cover-step-indicator"
                      className="absolute inset-x-4 top-0 h-0.5 bg-gradient-to-r from-amber-400 via-orange-400 to-fuchsia-400 rounded-full"
                      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                    />
                  )}
                  <div className="text-xs font-mono text-amber-300">Stage {item.step}</div>
                  <div className="font-display font-bold text-base mt-1">{item.title}</div>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">{item.lead}</p>
                </button>
              );
            })}
          </div>

          {/* Active Stage Showcase Card */}
          <motion.div
            key={activeStep.step}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch bg-[#0E0A24] border border-indigo-800/70 rounded-xl overflow-hidden"
          >
            <div className="lg:col-span-6 p-6 sm:p-8 flex flex-col justify-between space-y-6">
              <div className="space-y-3">
                <div className="text-xs font-mono text-violet-300">
                  Stage {activeStep.step} Pipeline Details
                </div>
                <h3 className="font-display font-bold text-2xl text-white">{activeStep.title}</h3>
                <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                  {activeStep.detail}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-indigo-900/60">
                {activeStep.metrics.map((m) => (
                  <div key={m.label} className="bg-[#070514] border border-indigo-900/60 rounded-lg p-3">
                    <div className="text-[11px] font-mono text-slate-400">{m.label}</div>
                    <div className="text-xs sm:text-sm font-mono font-semibold text-teal-300 mt-1">
                      {m.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-6 relative min-h-[260px] lg:min-h-[340px]">
              <img
                src={activeStep.image}
                alt={activeStep.imageAlt}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-[#070514]/80 via-transparent to-transparent"
              />
            </div>
          </motion.div>
        </section>

        {/* SECTION 3 — WHY IT IS HELPFUL + QUICK MODULE LAUNCH */}
        <section
          id="why-helpful"
          className="border-t border-indigo-900/60 bg-[#0B081D]/80 py-16 lg:py-20"
        >
          <div className="max-w-7xl mx-auto px-6 space-y-10">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div className="max-w-2xl space-y-3">
                <div className="text-xs font-mono text-amber-300">Why LUNASIGHT Matters</div>
                <h2 className="font-display font-bold text-2xl sm:text-4xl text-white text-balance">
                  Built for Mission Planners, Planetary Scientists &amp; Aerospace Teams
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onEnterWorkspace('command-center')}
                className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-teal-400 to-cyan-400 hover:brightness-110 text-slate-950 font-semibold text-xs sm:text-sm flex items-center gap-2 whitespace-nowrap shrink-0"
              >
                <span>Open Full Mission Console</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
              {/* Large Asymmetric Card */}
              <motion.div
                whileHover={{ y: -3 }}
                transition={{ duration: 0.18 }}
                className="md:col-span-7 bg-[#0E0A24] border border-indigo-800/70 rounded-xl p-6 flex flex-col justify-between gap-6"
              >
                <div className="space-y-3">
                  <div className="text-xs font-mono text-amber-300">01. Hazard &amp; Site Filtering</div>
                  <h3 className="font-display font-bold text-xl text-white">
                    Spot Steep Crater Walls and Shadow Traps Before Committing a Lander
                  </h3>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Instead of switching across disjointed PDS catalogs and GIS desktops, inspect
                    LOLA relief meshes, P95 terrain slopes, Mini-RF radar roughness, and 30-day
                    solar illumination margins side-by-side at any latitude from Shackleton Rim to
                    Apollo 11.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => onEnterWorkspace('landing-site')}
                    className="px-4 py-2 rounded-lg bg-[#181242] hover:bg-violet-600/30 border border-indigo-700/70 text-xs font-semibold text-amber-300 flex items-center gap-1.5 transition-colors"
                  >
                    <Compass className="w-3.5 h-3.5" />
                    <span>Launch Site Intelligence</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onEnterWorkspace('terrain')}
                    className="px-4 py-2 rounded-lg bg-[#181242] hover:bg-violet-600/30 border border-indigo-700/70 text-xs font-semibold text-teal-300 flex items-center gap-1.5 transition-colors"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Launch Terrain Intelligence</span>
                  </button>
                </div>
              </motion.div>

              <motion.div
                whileHover={{ y: -3 }}
                transition={{ duration: 0.18 }}
                className="md:col-span-5 bg-[#0E0A24] border border-indigo-800/70 rounded-xl p-6 flex flex-col justify-between gap-6"
              >
                <div className="space-y-3">
                  <div className="text-xs font-mono text-violet-300">02. End-to-End Flight Continuity</div>
                  <h3 className="font-display font-bold text-xl text-white">
                    Connect Earth Launchpads to Lunar Touchdown Timelines
                  </h3>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Check NASA POWER meteorology &amp; EONET natural hazards at global launch
                    complexes, map TLI-to-touchdown Δv schedules, and fly an interactive 3D landing
                    over real LOLA terrain.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => onEnterWorkspace('mission-planner')}
                    className="px-4 py-2 rounded-lg bg-[#181242] hover:bg-violet-600/30 border border-indigo-700/70 text-xs font-semibold text-violet-300 flex items-center gap-1.5 transition-colors"
                  >
                    <Rocket className="w-3.5 h-3.5" />
                    <span>Open Mission Planner</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onEnterWorkspace('simulator')}
                    className="px-4 py-2 rounded-lg bg-[#181242] hover:bg-violet-600/30 border border-indigo-700/70 text-xs font-semibold text-orange-300 flex items-center gap-1.5 transition-colors"
                  >
                    <Cpu className="w-3.5 h-3.5" />
                    <span>Run Landing Sim</span>
                  </button>
                </div>
              </motion.div>

              <motion.div
                whileHover={{ y: -3 }}
                transition={{ duration: 0.18 }}
                className="md:col-span-4 bg-[#0E0A24] border border-indigo-800/70 rounded-xl p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="text-xs font-mono text-teal-300">03. 3D Globe &amp; Surface Imagery</div>
                  <h4 className="font-display font-bold text-lg text-white">Click Any Crater</h4>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                    Click anywhere on the NASA 3D Moon to retrieve true LROC WAC optical photos,
                    Mini-RF radio-frequency SAR scans, and elevation transects.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onEnterWorkspace('lunar-explorer')}
                  className="text-xs font-semibold text-teal-300 hover:text-teal-200 flex items-center gap-1.5"
                >
                  <Globe className="w-3.5 h-3.5" />
                  <span>Open 3D Lunar Explorer</span>
                </button>
              </motion.div>

              <motion.div
                whileHover={{ y: -3 }}
                transition={{ duration: 0.18 }}
                className="md:col-span-4 bg-[#0E0A24] border border-indigo-800/70 rounded-xl p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="text-xs font-mono text-amber-300">04. Mobility &amp; Power</div>
                  <h4 className="font-display font-bold text-lg text-white">Rover Traverse Safety</h4>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                    Plan surface paths across real DEM slopes while checking thermal limits, slope
                    thresholds, and continuous sunlight windows.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onEnterWorkspace('rover')}
                  className="text-xs font-semibold text-amber-300 hover:text-amber-200 flex items-center gap-1.5"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  <span>Open Rover Explorer</span>
                </button>
              </motion.div>

              <motion.div
                whileHover={{ y: -3 }}
                transition={{ duration: 0.18 }}
                className="md:col-span-4 bg-[#0E0A24] border border-indigo-800/70 rounded-xl p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="text-xs font-mono text-fuchsia-300">05. Auditable Archives</div>
                  <h4 className="font-display font-bold text-lg text-white">Verified Data Center</h4>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                    Inspect original NASA dataset URLs, spatial resolutions, coordinate frames, and
                    observation periods across every calculation.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onEnterWorkspace('data-center')}
                  className="text-xs font-semibold text-fuchsia-300 hover:text-fuchsia-200 flex items-center gap-1.5"
                >
                  <Database className="w-3.5 h-3.5" />
                  <span>Inspect Data Center</span>
                </button>
              </motion.div>
            </div>
          </div>
        </section>

        {/* FINAL CTA BANNER */}
        <section className="max-w-7xl mx-auto px-6 py-16">
          <div className="rounded-2xl bg-gradient-to-r from-[#1A1042] via-[#1B123A] to-[#261431] border border-violet-700/50 p-8 sm:p-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="text-xs font-mono text-amber-300">Ready for Mission Operations</div>
              <h2 className="font-display font-bold text-2xl sm:text-3xl text-white">
                Step Inside the ARC LUNA — LUNASIGHT Command Center
              </h2>
              <p className="text-sm text-slate-300">
                All terrain grids, solar ephemeris timelines, and 3D lunar globes are synchronized
                to your active target coordinate.
              </p>
            </div>
            <motion.button
              type="button"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onEnterWorkspace('command-center')}
              className="px-7 py-4 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-slate-950 font-display font-bold text-base shadow-xl shadow-orange-500/25 flex items-center gap-2.5 whitespace-nowrap shrink-0"
            >
              <span>Enter Command Center</span>
              <ArrowRight className="w-5 h-5" />
            </motion.button>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-indigo-900/60 py-6 px-6 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>ARC LUNA — LUNASIGHT · Scientific Data Policy: NASA PDS / LRO / SVS / POWER / EONET / DONKI</span>
          <button
            type="button"
            onClick={() => onEnterWorkspace('command-center')}
            className="text-amber-300 hover:text-amber-200 font-medium"
          >
            Go to Command Center →
          </button>
        </div>
      </footer>
    </div>
  );
};
