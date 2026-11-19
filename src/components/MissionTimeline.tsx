import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Compass,
  Flame,
  Flag,
  Orbit,
  Pause,
  Play,
  Rocket,
  RotateCcw,
  Satellite,
  ShieldAlert,
  Sun,
  Truck,
} from 'lucide-react';
import type {
  IlluminationAnalysis,
  LandingSiteAssessment,
  LaunchFacility,
  LunarCoordinate,
  MissionPlan,
} from '../types/lunar.ts';

export interface MissionTimelineProps {
  missionName: string;
  missionType: MissionPlan['missionType'];
  spacecraftConfig: MissionPlan['spacecraftConfig'];
  launchFacility?: LaunchFacility;
  targetCoordinate: LunarCoordinate;
  landingDateUtc: string; // e.g. "2026-11-18T16:15" or ISO
  durationDays: number;
  deployRover: boolean;
  minSunlitPctRequired: number;
  orbitalCalc: MissionPlan['calculations'];
  assessment: LandingSiteAssessment | null;
  illumination: IlluminationAnalysis | null;
}

interface TimelineMilestone {
  id: string;
  code: string;
  title: string;
  phase: 'LAUNCH' | 'TRANSLUNAR' | 'LUNAR ORBIT' | 'DESCENT' | 'SURFACE OPS' | 'EOM';
  offsetHours: number; // Relative to landingDateUtc (T=0)
  metLabel: string;
  scheduledUtcIso: string | null;
  deltaVStepMs: number;
  cumulativeDeltaVMs: number;
  summary: string;
  engineeringCheck: string;
  statusFlag: 'NOMINAL' | 'CAUTION' | 'UNVERIFIED';
  positionPct: number; // 0..100 visual position along track
}

function parseUtcAnchor(raw: string): Date | null {
  if (!raw) return null;
  const normalized = raw.endsWith('Z') || raw.includes('+') ? raw : `${raw}:00Z`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    const fallback = new Date(raw);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  return parsed;
}

function formatUtcTimestamp(iso: string | null): string {
  if (!iso) return 'INVALID EPOCH';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'INVALID EPOCH';
  return d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

function formatMet(offsetHours: number): string {
  if (offsetHours === 0) return 'T+00h (TOUCHDOWN)';
  const sign = offsetHours < 0 ? '-' : '+';
  const absH = Math.abs(offsetHours);
  if (absH >= 48 && absH % 24 === 0) {
    return `T${sign}${absH}h (${absH / 24}d)`;
  }
  return `T${sign}${String(absH).padStart(2, '0')}h`;
}

function getMilestoneIcon(phase: TimelineMilestone['phase'], deployRover: boolean) {
  switch (phase) {
    case 'LAUNCH':
      return Rocket;
    case 'TRANSLUNAR':
      return Orbit;
    case 'LUNAR ORBIT':
      return Satellite;
    case 'DESCENT':
      return Flame;
    case 'SURFACE OPS':
      return deployRover ? Truck : Sun;
    case 'EOM':
      return Flag;
  }
}

export const MissionTimeline: React.FC<MissionTimelineProps> = ({
  missionName,
  missionType,
  spacecraftConfig,
  launchFacility,
  targetCoordinate,
  landingDateUtc,
  durationDays,
  deployRover,
  minSunlitPctRequired,
  orbitalCalc,
  assessment,
  illumination,
}) => {
  const [progressPct, setProgressPct] = useState<number>(66.7); // Default focused near touchdown
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 2 | 4>(1);

  const safeDurationDays = Math.max(1, Math.min(365, Number.isFinite(durationDays) ? durationDays : 14));

  const milestones: TimelineMilestone[] = useMemo(() => {
    const anchor = parseUtcAnchor(landingDateUtc);
    const transitH = orbitalCalc.assumedTransitHours; // 88h
    const leoHours = transitH + 2; // L-90h: LEO insertion + checkout before TLI
    const midCourseH = Math.round(transitH / 2); // L-44h
    const loiHours = 4; // L-04h lunar orbit capture prior to powered descent
    const surfaceInitH = 6; // T+06h post-landing checkout / rover egress
    const eomHours = safeDurationDays * 24;

    const addOffset = (h: number) => {
      if (!anchor) return null;
      return new Date(anchor.getTime() + h * 3600 * 1000).toISOString();
    };

    const facilityLabel = launchFacility
      ? `${launchFacility.name} (${launchFacility.country})`
      : 'Selected Launch Complex';

    const terrainReady = assessment
      ? assessment.classification === 'SUITABLE'
        ? 'NOMINAL'
        : assessment.classification === 'CONDITIONAL'
          ? 'CAUTION'
          : 'UNVERIFIED'
      : 'UNVERIFIED';

    const solarOk = illumination
      ? illumination.sunlitPercentage >= minSunlitPctRequired
        ? 'NOMINAL'
        : 'CAUTION'
      : 'UNVERIFIED';

    const siteText = targetCoordinate.name || `${targetCoordinate.lat.toFixed(2)}°, ${targetCoordinate.lon.toFixed(2)}°`;

    const raw: Omit<TimelineMilestone, 'positionPct'>[] = [
      {
        id: 'launch-leo',
        code: 'M-01',
        title: 'Liftoff & 185 km LEO Parking',
        phase: 'LAUNCH',
        offsetHours: -leoHours,
        metLabel: formatMet(-leoHours),
        scheduledUtcIso: addOffset(-leoHours),
        deltaVStepMs: 0,
        cumulativeDeltaVMs: 0,
        summary: `Planned ascent from ${facilityLabel} into a 185 km circular Earth parking orbit for ${spacecraftConfig} systems checkout.`,
        engineeringCheck: launchFacility
          ? `Supported launch azimuths: ${launchFacility.supportedAzimuths} · Elevation ${launchFacility.elevationM} m.`
          : 'Launch facility parameters active in mission builder.',
        statusFlag: 'NOMINAL',
      },
      {
        id: 'tli-burn',
        code: 'M-02',
        title: 'Trans-Lunar Injection (TLI)',
        phase: 'TRANSLUNAR',
        offsetHours: -transitH,
        metLabel: formatMet(-transitH),
        scheduledUtcIso: addOffset(-transitH),
        deltaVStepMs: orbitalCalc.deltaVLeoToTliMs,
        cumulativeDeltaVMs: orbitalCalc.deltaVLeoToTliMs,
        summary: `Prograde vis-viva departure burn (+${orbitalCalc.deltaVLeoToTliMs} m/s ref) initiating the ${transitH}-hour transfer toward 384,400 km mean lunar distance.`,
        engineeringCheck: 'Educational two-body Hohmann-like transfer estimate; real trajectory depends on epoch lunar declination.',
        statusFlag: 'NOMINAL',
      },
      {
        id: 'cislunar-tcm',
        code: 'M-03',
        title: 'Cislunar Mid-Course Navigation',
        phase: 'TRANSLUNAR',
        offsetHours: -midCourseH,
        metLabel: formatMet(-midCourseH),
        scheduledUtcIso: addOffset(-midCourseH),
        deltaVStepMs: 0,
        cumulativeDeltaVMs: orbitalCalc.deltaVLeoToTliMs,
        summary: `Deep-space optical/DSN star-tracker alignment and thermal roll conditioning halfway across the ${orbitalCalc.earthMoonMeanDistanceKm.toLocaleString()} km mean cislunar corridor.`,
        engineeringCheck: `Mission profile: ${missionType}. Trajectory correction reserve is excluded from baseline 3-burn Δv sum.`,
        statusFlag: 'NOMINAL',
      },
      {
        id: 'loi-capture',
        code: 'M-04',
        title: 'Lunar Orbit Insertion (100 km LLO)',
        phase: 'LUNAR ORBIT',
        offsetHours: -loiHours,
        metLabel: formatMet(-loiHours),
        scheduledUtcIso: addOffset(-loiHours),
        deltaVStepMs: orbitalCalc.deltaVLoiMs,
        cumulativeDeltaVMs: orbitalCalc.deltaVLeoToTliMs + orbitalCalc.deltaVLoiMs,
        summary: `Retrograde perilune capture burn (+${orbitalCalc.deltaVLoiMs} m/s ref) establishing 100 km Low Lunar Orbit (R = 1,737.4 km, g = ${orbitalCalc.lunarSurfaceGravityMs2} m/s²).`,
        engineeringCheck: assessment
          ? `LOLA DEM target coverage: ${assessment.dem.coveragePercent}% · Mean elevation ${assessment.dem.meanElevationM} m.`
          : 'LOLA DEM regional telemetry pending assessment.',
        statusFlag: assessment ? 'NOMINAL' : 'UNVERIFIED',
      },
      {
        id: 'pdi-landing',
        code: 'M-05',
        title: 'Powered Descent & Touchdown',
        phase: 'DESCENT',
        offsetHours: 0,
        metLabel: formatMet(0),
        scheduledUtcIso: addOffset(0),
        deltaVStepMs: orbitalCalc.deltaVDescentMs,
        cumulativeDeltaVMs: orbitalCalc.totalDeltaVMs,
        summary: `Terminal powered descent (+${orbitalCalc.deltaVDescentMs} m/s ref incl. hover/gravity loss) to ${siteText}.`,
        engineeringCheck: assessment
          ? `NASA LOLA terrain check: ${assessment.classification} (${assessment.scores.overallScore}/100) · Mean slope ${assessment.dem.meanSlopeDeg}° / Max ${assessment.dem.maxSlopeDeg}°. `
          : 'NASA LOLA terrain suitability not yet loaded for target.',
        statusFlag: terrainReady,
      },
      {
        id: 'surface-ops',
        code: 'M-06',
        title: deployRover ? 'Rover Egress & Surface Ops' : 'Surface Payload Activation',
        phase: 'SURFACE OPS',
        offsetHours: surfaceInitH,
        metLabel: formatMet(surfaceInitH),
        scheduledUtcIso: addOffset(surfaceInitH),
        deltaVStepMs: 0,
        cumulativeDeltaVMs: orbitalCalc.totalDeltaVMs,
        summary: deployRover
          ? `Lander ramp deployment and rover checkout across ${siteText} to begin regolith & slope verification.`
          : `Static lander solar array lock, thermal radiator equilibrium, and primary surface instrument activation.`,
        engineeringCheck: illumination
          ? `30-day DE421 solar availability: ${illumination.sunlitPercentage}% (Mission min required: ${minSunlitPctRequired}%).`
          : 'NASA SPICE/DE421 solar illumination calculation pending.',
        statusFlag: solarOk,
      },
      {
        id: 'eom-window',
        code: 'M-07',
        title: `End of ${safeDurationDays}-Day Science Phase`,
        phase: 'EOM',
        offsetHours: eomHours,
        metLabel: formatMet(eomHours),
        scheduledUtcIso: addOffset(eomHours),
        deltaVStepMs: 0,
        cumulativeDeltaVMs: orbitalCalc.totalDeltaVMs,
        summary: `Nominal completion of the ${safeDurationDays}-Earth-day primary lunar surface window and final science archive downlink.`,
        engineeringCheck:
          illumination?.nextSunsetUtc
            ? `Next computed local sunset at site: ${formatUtcTimestamp(illumination.nextSunsetUtc)}.`
            : 'Lunar day/night boundary depends on local horizon relief.',
        statusFlag: solarOk === 'CAUTION' ? 'CAUTION' : 'NOMINAL',
      },
    ];

    const count = raw.length;
    return raw.map((m, idx) => ({
      ...m,
      positionPct: count === 1 ? 0 : (idx / (count - 1)) * 100,
    }));
  }, [
    assessment,
    deployRover,
    illumination,
    landingDateUtc,
    launchFacility,
    minSunlitPctRequired,
    missionType,
    orbitalCalc,
    safeDurationDays,
    spacecraftConfig,
    targetCoordinate,
  ]);

  // Animate progress indicator during playback
  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      setProgressPct((prev) => {
        const next = prev + dt * 8.5 * playbackSpeed;
        if (next >= 100) {
          setIsPlaying(false);
          return 100;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, playbackSpeed]);

  // Nearest or most recently passed milestone for inspector highlight
  const activeIndex = useMemo(() => {
    let bestIdx = 0;
    let bestDist = Infinity;
    milestones.forEach((m, idx) => {
      const dist = Math.abs(m.positionPct - progressPct);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = idx;
      }
    });
    return bestIdx;
  }, [milestones, progressPct]);

  const activeMilestone = milestones[activeIndex] ?? milestones[0];
  const ActiveIcon = getMilestoneIcon(activeMilestone.phase, deployRover);

  const selectMilestone = (idx: number) => {
    const clamped = Math.max(0, Math.min(milestones.length - 1, idx));
    setIsPlaying(false);
    setProgressPct(milestones[clamped].positionPct);
  };

  const handlePlayToggle = () => {
    if (!isPlaying && progressPct >= 99.5) {
      setProgressPct(0);
    }
    setIsPlaying((p) => !p);
  };

  const cumulativeDvRatio =
    orbitalCalc.totalDeltaVMs > 0
      ? Math.round((activeMilestone.cumulativeDeltaVMs / orbitalCalc.totalDeltaVMs) * 100)
      : 0;

  return (
    <section
      aria-label="Interactive Mission Timeline"
      className="bg-[#0B1120] border border-slate-800 rounded-md p-5 space-y-5"
    >
      {/* Header + Playback Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
            <span className="text-cyan-400">INTERACTIVE MISSION TIMELINE</span>
            <span className="text-slate-600">·</span>
            <span className="text-slate-300 truncate max-w-md">{missionName || 'Lunar Mission Plan'}</span>
            <span className="px-1.5 py-0.5 rounded bg-slate-800/90 border border-slate-700 text-[10px] text-amber-300">
              PLANNED SCHEDULE &amp; REF Δv
            </span>
          </div>
          <h2 className="text-base sm:text-lg font-display font-bold text-slate-100">
            End-to-End Mission Milestones ({milestones[0].metLabel} → {milestones[milestones.length - 1].metLabel})
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => selectMilestone(activeIndex - 1)}
            disabled={activeIndex === 0}
            className="px-2.5 py-1.5 bg-[#060911] border border-slate-700 hover:border-cyan-500/60 disabled:opacity-40 text-xs text-slate-200 rounded flex items-center gap-1 transition-colors"
            title="Previous milestone"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Prev
          </button>

          <button
            type="button"
            onClick={handlePlayToggle}
            className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-semibold text-xs rounded flex items-center gap-1.5 transition-colors"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {isPlaying ? 'Pause Timeline' : progressPct >= 99.5 ? 'Replay Sequence' : 'Animate Sequence'}
          </button>

          <button
            type="button"
            onClick={() => selectMilestone(activeIndex + 1)}
            disabled={activeIndex === milestones.length - 1}
            className="px-2.5 py-1.5 bg-[#060911] border border-slate-700 hover:border-cyan-500/60 disabled:opacity-40 text-xs text-slate-200 rounded flex items-center gap-1 transition-colors"
            title="Next milestone"
          >
            Next
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          <div className="flex items-center bg-[#060911] border border-slate-800 rounded p-0.5 text-[11px] font-mono">
            {([1, 2, 4] as const).map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => setPlaybackSpeed(spd)}
                className={`px-2 py-1 rounded transition-colors ${
                  playbackSpeed === spd
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setIsPlaying(false);
              setProgressPct(0);
            }}
            className="p-1.5 bg-[#060911] border border-slate-700 hover:border-slate-500 text-slate-300 rounded transition-colors"
            title="Reset timeline to liftoff"
            aria-label="Reset timeline"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Horizontal Milestone Track with Animated Progress Indicator */}
      <div className="overflow-x-auto pb-2">
        <div className="min-w-[760px] px-4 pt-6 pb-3 relative">
          {/* Base rail */}
          <div className="relative h-2 bg-[#060911] border border-slate-800 rounded-full">
            {/* Animated cyan gradient fill */}
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-sky-500 via-cyan-400 to-emerald-400"
              animate={{ width: `${progressPct}%` }}
              transition={isPlaying ? { duration: 0.06, ease: 'linear' } : { type: 'spring', stiffness: 260, damping: 28 }}
            />

            {/* Animated Spacecraft Progression Pip */}
            <motion.div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 pointer-events-none"
              animate={{ left: `${progressPct}%` }}
              transition={isPlaying ? { duration: 0.06, ease: 'linear' } : { type: 'spring', stiffness: 260, damping: 28 }}
            >
              <div className="relative flex items-center justify-center">
                <motion.span
                  className="absolute w-7 h-7 rounded-full bg-cyan-400/25 border border-cyan-400/50"
                  animate={{ scale: [1, 1.35, 1], opacity: [0.7, 0.2, 0.7] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                />
                <span className="w-3.5 h-3.5 rounded-full bg-cyan-300 border-2 border-[#060911] shadow-[0_0_12px_rgba(34,211,238,0.9)]" />
              </div>
            </motion.div>
          </div>

          {/* Milestone Nodes */}
          <div className="relative flex justify-between items-start -mt-5">
            {milestones.map((m, idx) => {
              const Icon = getMilestoneIcon(m.phase, deployRover);
              const isCompleted = progressPct > m.positionPct + 2;
              const isActive = idx === activeIndex;

              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => selectMilestone(idx)}
                  className="group flex flex-col items-center text-center w-24 focus:outline-none"
                >
                  <div className="relative flex items-center justify-center mb-2">
                    {isActive && (
                      <motion.span
                        layoutId="active-milestone-ring"
                        className="absolute -inset-1.5 rounded-full border border-cyan-400/70 bg-cyan-500/10"
                        transition={{ type: 'spring', stiffness: 320, damping: 26 }}
                      />
                    )}
                    <div
                      className={`relative z-10 w-8 h-8 rounded-full border flex items-center justify-center transition-all ${
                        isActive
                          ? 'bg-cyan-500 text-slate-950 border-cyan-300 shadow-[0_0_14px_rgba(34,211,238,0.45)]'
                          : isCompleted
                            ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/60 group-hover:border-emerald-400'
                            : 'bg-[#060911] text-slate-400 border-slate-700 group-hover:border-cyan-500/60 group-hover:text-cyan-300'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                  </div>

                  <span
                    className={`font-mono text-[10px] tabular-nums transition-colors ${
                      isActive ? 'text-cyan-300 font-semibold' : isCompleted ? 'text-emerald-400' : 'text-slate-400'
                    }`}
                  >
                    {m.metLabel}
                  </span>
                  <span
                    className={`mt-0.5 text-[11px] leading-tight line-clamp-2 transition-colors ${
                      isActive ? 'text-slate-100 font-semibold' : 'text-slate-400 group-hover:text-slate-200'
                    }`}
                  >
                    {m.title}
                  </span>
                  {m.deltaVStepMs > 0 && (
                    <span className="mt-1 px-1.5 py-0.5 rounded bg-[#060911] border border-slate-800 font-mono text-[9px] text-amber-300 tabular-nums">
                      Δv +{m.deltaVStepMs} m/s
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Interactive Timeline Scrubber */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-[#060911] border border-slate-800 rounded px-3.5 py-2.5">
        <span className="text-[11px] font-mono text-slate-400 whitespace-nowrap">
          SEQUENCE SCRUBBER
        </span>
        <input
          type="range"
          min={0}
          max={100}
          step={0.5}
          value={progressPct}
          onChange={(e) => {
            setIsPlaying(false);
            setProgressPct(Number(e.target.value));
          }}
          aria-label="Mission timeline progress scrubber"
          className="w-full accent-cyan-400 cursor-pointer h-1.5"
        />
        <span className="text-[11px] font-mono text-cyan-300 tabular-nums whitespace-nowrap text-right min-w-[68px]">
          {Math.round(progressPct)}% ({activeMilestone.code})
        </span>
      </div>

      {/* Selected Milestone Detail & Animated Δv Budget Card */}
      <motion.div
        key={activeMilestone.id}
        initial={{ opacity: 0.4, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="grid grid-cols-1 lg:grid-cols-12 gap-4 bg-[#060911] border border-slate-800 rounded-md p-4"
      >
        <div className="lg:col-span-7 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/40 text-[11px] font-mono text-cyan-300">
              <ActiveIcon className="w-3 h-3" />
              {activeMilestone.code} · {activeMilestone.phase}
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-mono text-slate-300 tabular-nums">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              {formatUtcTimestamp(activeMilestone.scheduledUtcIso)}
            </span>
            <span
              className={`ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border ${
                activeMilestone.statusFlag === 'NOMINAL'
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40'
                  : activeMilestone.statusFlag === 'CAUTION'
                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/40'
                    : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              {activeMilestone.statusFlag === 'NOMINAL' ? (
                <CheckCircle2 className="w-3 h-3" />
              ) : (
                <ShieldAlert className="w-3 h-3" />
              )}
              {activeMilestone.statusFlag}
            </span>
          </div>

          <h3 className="text-sm sm:text-base font-semibold text-slate-100">
            {activeMilestone.title}
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed">{activeMilestone.summary}</p>

          <div className="flex items-start gap-2 pt-1 text-[11px] text-slate-400">
            <Compass className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
            <span>{activeMilestone.engineeringCheck}</span>
          </div>
        </div>

        {/* Animated Δv Progress & Phase Breakdown */}
        <div className="lg:col-span-5 flex flex-col justify-between gap-3 border-t lg:border-t-0 lg:border-l border-slate-800 pt-3 lg:pt-0 lg:pl-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400">CUMULATIVE REFERENCE Δv</span>
              <span className="text-cyan-300 font-semibold tabular-nums">
                {activeMilestone.cumulativeDeltaVMs.toLocaleString()} / {orbitalCalc.totalDeltaVMs.toLocaleString()} m/s ({cumulativeDvRatio}%)
              </span>
            </div>

            <div className="h-2.5 bg-[#0B1120] border border-slate-800 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-cyan-500 to-amber-400"
                initial={false}
                animate={{ width: `${cumulativeDvRatio}%` }}
                transition={{ type: 'spring', stiffness: 220, damping: 26 }}
              />
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1 text-[10px] font-mono">
              <div className="bg-[#0B1120] border border-slate-800 rounded p-2">
                <div className="text-slate-400">TLI BURN</div>
                <div className="text-slate-100 font-semibold tabular-nums">
                  {orbitalCalc.deltaVLeoToTliMs} m/s
                </div>
              </div>
              <div className="bg-[#0B1120] border border-slate-800 rounded p-2">
                <div className="text-slate-400">LOI CAPTURE</div>
                <div className="text-slate-100 font-semibold tabular-nums">
                  {orbitalCalc.deltaVLoiMs} m/s
                </div>
              </div>
              <div className="bg-[#0B1120] border border-slate-800 rounded p-2">
                <div className="text-slate-400">DESCENT</div>
                <div className="text-slate-100 font-semibold tabular-nums">
                  {orbitalCalc.deltaVDescentMs} m/s
                </div>
              </div>
            </div>
          </div>

          <div className="text-[10px] text-slate-500 leading-snug">
            Timestamps anchor to planned landing epoch ({formatUtcTimestamp(milestones[4].scheduledUtcIso)}).
            Δv figures are idealized two-body estimates; terrain &amp; sun checks use NASA LOLA GDR and DE421.
          </div>
        </div>
      </motion.div>
    </section>
  );
};
