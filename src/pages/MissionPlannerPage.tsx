import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { jsPDF } from 'jspdf';
import { Download, FileText, Pause, Play, Plus, Rocket, Trash2 } from 'lucide-react';
import { useLunar } from '../context/LunarContext.tsx';
import { LAUNCH_FACILITIES } from '../data/lunarCatalog.ts';
import type { MissionPlan } from '../types/lunar.ts';
import { formatCoordPair } from '../utils/coordinateFormat.ts';
import { MissionTimeline } from '../components/MissionTimeline.tsx';

export const MissionPlannerPage: React.FC = () => {
  const {
    selectedCoord,
    setSelectedCoord,
    assessment,
    illumination,
    missions,
    saveMissionPlan,
    removeMissionPlan,
    settings,
    setCoordModalOpen,
  } = useLunar();

  const [name, setName] = useState('ARTEMIS-CLASS SOUTH POLE RECONNAISSANCE');
  const [missionType, setMissionType] = useState<MissionPlan['missionType']>('Robotic Lander');
  const [launchFacilityId, setLaunchFacilityId] = useState(LAUNCH_FACILITIES[0].id);
  const [landingDateUtc, setLandingDateUtc] = useState(() => new Date().toISOString().slice(0, 16));
  const [durationDays, setDurationDays] = useState(14);
  const [spacecraftConfig, setSpacecraftConfig] =
    useState<MissionPlan['spacecraftConfig']>('Medium Cargo Lander (4,500 kg)');
  const [deployRover, setDeployRover] = useState(true);
  const [minSunlitPct, setMinSunlitPct] = useState(50);
  const [objectives, setObjectives] = useState(
    'Characterize regolith slope stability, verify local LOLA elevation models, and assess solar power duty cycles.'
  );
  const [saving, setSaving] = useState(false);
  const [animatingOrbit, setAnimatingOrbit] = useState(true);

  const trajectoryCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Educational orbital mechanics calculations with explicitly documented assumptions
  const orbitalCalc = useMemo(() => {
    const earthMoonMeanDistanceKm = 384400;
    const lunarSurfaceGravityMs2 = 1.622; // NASA Moon Fact Sheet
    const assumedTransitHours = 88; // Standard Hohmann-like 3.6-day TLI trajectory
    const deltaVLeoToTliMs = 3130;
    const deltaVLoiMs = 880;
    const deltaVDescentMs = 1920;
    const totalDeltaVMs = deltaVLeoToTliMs + deltaVLoiMs + deltaVDescentMs;

    return {
      earthMoonMeanDistanceKm,
      assumedTransitHours,
      deltaVLeoToTliMs,
      deltaVLoiMs,
      deltaVDescentMs,
      totalDeltaVMs,
      lunarSurfaceGravityMs2,
      formulasAndAssumptions: [
        'Mean Earth–Moon distance = 384,400 km (NASA Moon Fact Sheet; actual varies 363,104–405,696 km).',
        'Lunar surface gravity g = G·M_moon / R_moon² = 1.622 m/s² (R = 1,737.4 km).',
        'Educational Δv budget assumes 185 km circular LEO departure (Δv_TLI ≈ 3,130 m/s via vis-viva), 100 km LLO capture (Δv_LOI ≈ 880 m/s), and powered descent including gravity/hover loss (Δv_descent ≈ 1,920 m/s).',
        'Does NOT represent proprietary propulsion Isp or specific launch vehicle payload margins.',
      ],
    };
  }, []);

  // Animated Earth–Moon Trans-Lunar Injection (TLI -> Coast -> LOI -> Powered Descent) Visualizer
  useEffect(() => {
    const canvas = trajectoryCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let disposed = false;
    let phase = 0;
    let lastMs = performance.now();

    const draw = (now: number) => {
      if (disposed) return;
      const dt = Math.min(0.05, (now - lastMs) / 1000);
      lastMs = now;
      if (animatingOrbit) {
        phase = (phase + dt * 0.18) % 1;
      }

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#050811';
      ctx.fillRect(0, 0, w, h);

      const earthX = 56;
      const earthY = h * 0.56;
      const moonX = w - 62;
      const moonY = h * 0.44;

      // Subtle star dots
      ctx.fillStyle = 'rgba(203,213,225,0.4)';
      for (let i = 0; i < 24; i++) {
        const sx = ((i * 97) % (w - 20)) + 10;
        const sy = ((i * 53) % (h - 20)) + 10;
        ctx.fillRect(sx, sy, 1.2, 1.2);
      }

      // LEO ring around Earth
      ctx.strokeStyle = 'rgba(56,189,248,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(earthX, earthY, 26, 0, Math.PI * 2);
      ctx.stroke();

      // LLO ring around Moon
      ctx.strokeStyle = 'rgba(251,191,36,0.45)';
      ctx.beginPath();
      ctx.arc(moonX, moonY, 22, 0, Math.PI * 2);
      ctx.stroke();

      // Bezier Free-Return / Hohmann Cislunar Arc
      const cp1x = earthX + (moonX - earthX) * 0.35;
      const cp1y = earthY - 72;
      const cp2x = earthX + (moonX - earthX) * 0.72;
      const cp2y = moonY - 52;

      ctx.strokeStyle = 'rgba(34,211,238,0.42)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(earthX + 24, earthY - 8);
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, moonX - 20, moonY - 8);
      ctx.stroke();
      ctx.setLineDash([]);

      // Earth & Moon bodies
      const earthGrad = ctx.createRadialGradient(earthX - 5, earthY - 5, 3, earthX, earthY, 17);
      earthGrad.addColorStop(0, '#60a5fa');
      earthGrad.addColorStop(0.7, '#1d4ed8');
      earthGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = earthGrad;
      ctx.beginPath();
      ctx.arc(earthX, earthY, 17, 0, Math.PI * 2);
      ctx.fill();

      const moonGrad = ctx.createRadialGradient(moonX - 4, moonY - 4, 2, moonX, moonY, 12);
      moonGrad.addColorStop(0, '#e2e8f0');
      moonGrad.addColorStop(1, '#475569');
      ctx.fillStyle = moonGrad;
      ctx.beginPath();
      ctx.arc(moonX, moonY, 12, 0, Math.PI * 2);
      ctx.fill();

      // Compute spacecraft position along mission timeline (0..0.18 LEO, 0.18..0.75 TLI coast, 0.75..0.9 LOI, 0.9..1.0 Descent)
      let sx = earthX;
      let sy = earthY;
      let phaseLabel = '185 km LEO PARKING';
      if (phase < 0.18) {
        const a = (phase / 0.18) * Math.PI * 1.6;
        sx = earthX + Math.cos(a) * 26;
        sy = earthY + Math.sin(a) * 26;
        phaseLabel = `TLI BURN (+${orbitalCalc.deltaVLeoToTliMs} m/s)`;
      } else if (phase < 0.78) {
        const t = (phase - 0.18) / 0.6;
        const inv = 1 - t;
        const p0x = earthX + 24;
        const p0y = earthY - 8;
        const p3x = moonX - 20;
        const p3y = moonY - 8;
        sx = inv * inv * inv * p0x + 3 * inv * inv * t * cp1x + 3 * inv * t * t * cp2x + t * t * t * p3x;
        sy = inv * inv * inv * p0y + 3 * inv * inv * t * cp1y + 3 * inv * t * t * cp2y + t * t * t * p3y;
        phaseLabel = `TRANSLUNAR COAST (${Math.round(t * 88)}h / 88h)`;
      } else if (phase < 0.9) {
        const t = (phase - 0.78) / 0.12;
        const a = Math.PI + t * Math.PI * 1.4;
        sx = moonX + Math.cos(a) * 22;
        sy = moonY + Math.sin(a) * 22;
        phaseLabel = `LOI CAPTURE (+${orbitalCalc.deltaVLoiMs} m/s)`;
      } else {
        const t = (phase - 0.9) / 0.1;
        sx = moonX + 22 * (1 - t);
        sy = moonY - 6 * (1 - t);
        phaseLabel = `POWERED DESCENT (+${orbitalCalc.deltaVDescentMs} m/s)`;
      }

      // Active spacecraft marker + glow
      ctx.fillStyle = 'rgba(34,211,238,0.28)';
      ctx.beginPath();
      ctx.arc(sx, sy, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#22d3ee';
      ctx.beginPath();
      ctx.arc(sx, sy, 3.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px monospace';
      ctx.fillText('EARTH', earthX - 16, earthY + 38);
      ctx.fillText('MOON', moonX - 14, moonY + 34);
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(phaseLabel, 12, 16);
      ctx.fillStyle = '#fbbf24';
      ctx.fillText(`TOTAL REF Δv: ${orbitalCalc.totalDeltaVMs} m/s`, w - 160, h - 10);

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
    };
  }, [animatingOrbit, orbitalCalc]);

  const buildPlan = (): MissionPlan => ({
    id: `msn-${Date.now()}`,
    createdAt: new Date().toISOString(),
    name: name.trim() || 'Lunar Mission Plan',
    missionType,
    launchFacilityId,
    targetCoordinate: selectedCoord,
    landingDateUtc: new Date(landingDateUtc + ':00Z').toISOString(),
    durationDays,
    spacecraftConfig,
    deployRover,
    minSunlitPctRequired: minSunlitPct,
    objectives,
    calculations: orbitalCalc,
    assessmentSummary: assessment
      ? {
          overallScore: assessment.scores.overallScore,
          classification: assessment.classification,
          meanSlopeDeg: assessment.dem.meanSlopeDeg,
          maxSlopeDeg: assessment.dem.maxSlopeDeg,
          elevationM: assessment.dem.meanElevationM,
          sunlitPercentage: illumination?.sunlitPercentage ?? 0,
        }
      : undefined,
    uncertainties: [
      ...(assessment?.uncertaintyIndicators ?? ['NASA LOLA DEM regional uncertainty applies.']),
      'Orbital Δv estimates use idealized two-body vis-viva / Hohmann assumptions without N-body perturbations.',
    ],
    sources: [
      assessment?.dem.datasetUsed.datasetId || 'NASA LRO LOLA GDR',
      'NASA SPICE/DE421 Analytical Solar Ephemeris',
      'NASA Moon Fact Sheet Physical Constants',
    ],
  });

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveMissionPlan(buildPlan());
    } finally {
      setSaving(false);
    }
  };

  const exportJson = (plan: MissionPlan) => {
    const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${plan.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = (plan: MissionPlan) => {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const facility = LAUNCH_FACILITIES.find((f) => f.id === plan.launchFacilityId);
    let y = 48;
    const addLine = (text: string, size = 10, bold = false) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(text, 500) as string[];
      lines.forEach((ln) => {
        if (y > 770) {
          doc.addPage();
          y = 48;
        }
        doc.text(ln, 48, y);
        y += size + 5;
      });
    };

    addLine('ARC LUNA — LUNASIGHT | SCIENTIFIC MISSION REPORT', 14, true);
    addLine(`Generated: ${new Date().toISOString()}`, 9);
    y += 8;
    addLine(`Mission Name: ${plan.name}`, 11, true);
    addLine(`Type: ${plan.missionType} | Config: ${plan.spacecraftConfig} | Rover: ${plan.deployRover ? 'Yes' : 'No'}`);
    addLine(`Launch Facility: ${facility?.name || plan.launchFacilityId} (${facility?.country || ''})`);
    addLine(
      `Target Lunar Coordinate: ${plan.targetCoordinate.name || 'Custom'} (${plan.targetCoordinate.lat.toFixed(4)}°, ${plan.targetCoordinate.lon.toFixed(4)}°)`
    );
    addLine(`Planned Landing Epoch: ${plan.landingDateUtc} | Surface Duration: ${plan.durationDays} days`);
    y += 8;
    addLine('1. TERRAIN & ILLUMINATION SUMMARY', 11, true);
    if (plan.assessmentSummary) {
      addLine(
        `Suitability Score: ${plan.assessmentSummary.overallScore}/100 (${plan.assessmentSummary.classification})`
      );
      addLine(
        `LOLA Mean Elevation: ${plan.assessmentSummary.elevationM} m | Mean Slope: ${plan.assessmentSummary.meanSlopeDeg}° | Max Slope: ${plan.assessmentSummary.maxSlopeDeg}°`
      );
      addLine(`30-Day Sunlit Availability: ${plan.assessmentSummary.sunlitPercentage}% (Min Required: ${plan.minSunlitPctRequired}%)`);
    } else {
      addLine('Terrain summary pending at time of export.');
    }
    y += 8;
    addLine('2. ORBITAL MECHANICS & ASSUMPTIONS (EDUCATIONAL ESTIMATES)', 11, true);
    addLine(
      `Total Reference Δv: ${plan.calculations.totalDeltaVMs} m/s (TLI ${plan.calculations.deltaVLeoToTliMs} + LOI ${plan.calculations.deltaVLoiMs} + Descent ${plan.calculations.deltaVDescentMs})`
    );
    plan.calculations.formulasAndAssumptions.forEach((f) => addLine(`- ${f}`, 9));
    y += 8;
    addLine('3. SCIENTIFIC SOURCES & IDENTIFIED UNCERTAINTIES', 11, true);
    plan.sources.forEach((s) => addLine(`Source: ${s}`, 9));
    plan.uncertainties.forEach((u) => addLine(`Uncertainty: ${u}`, 9));

    doc.save(`${plan.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`);
  };

  const currentPlan = buildPlan();
  const activeLaunchFacility = useMemo(
    () => LAUNCH_FACILITIES.find((f) => f.id === launchFacilityId) ?? LAUNCH_FACILITIES[0],
    [launchFacilityId]
  );

  const loadMissionToBuilder = (plan: MissionPlan) => {
    setName(plan.name);
    setMissionType(plan.missionType);
    setLaunchFacilityId(plan.launchFacilityId);
    setSelectedCoord(plan.targetCoordinate);
    setLandingDateUtc(plan.landingDateUtc ? plan.landingDateUtc.slice(0, 16) : new Date().toISOString().slice(0, 16));
    setDurationDays(plan.durationDays);
    setSpacecraftConfig(plan.spacecraftConfig);
    setDeployRover(plan.deployRover);
    setMinSunlitPct(plan.minSunlitPctRequired);
    setObjectives(plan.objectives);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-7xl mx-auto space-y-6"
    >
      <MissionTimeline
        missionName={currentPlan.name}
        missionType={missionType}
        spacecraftConfig={spacecraftConfig}
        launchFacility={activeLaunchFacility}
        targetCoordinate={selectedCoord}
        landingDateUtc={landingDateUtc}
        durationDays={durationDays}
        deployRover={deployRover}
        minSunlitPctRequired={minSunlitPct}
        orbitalCalc={orbitalCalc}
        assessment={assessment}
        illumination={illumination}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Mission Builder Form */}
      <form
        onSubmit={handleSave}
        className="lg:col-span-7 bg-[#0B1120] border border-slate-800 rounded-md p-5 space-y-4"
      >
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div>
            <div className="text-xs font-mono text-cyan-400">MISSION ARCHITECTURE &amp; REPORT BUILDER</div>
            <h2 className="text-lg font-display font-bold text-slate-100">Create Lunar Mission Plan</h2>
          </div>
          <button
            type="button"
            onClick={() => setCoordModalOpen(true)}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-cyan-300 rounded font-mono"
          >
            {formatCoordPair(selectedCoord, settings.coordinateFormat)}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <label className="sm:col-span-2 text-slate-300">
            Mission Name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="mt-1 w-full bg-[#060911] border border-slate-700 rounded px-3 py-2 text-slate-100"
            />
          </label>

          <label className="text-slate-300">
            Mission Type
            <select
              value={missionType}
              onChange={(e) => setMissionType(e.target.value as MissionPlan['missionType'])}
              className="mt-1 w-full bg-[#060911] border border-slate-700 rounded px-3 py-2 text-slate-100"
            >
              <option>Robotic Lander</option>
              <option>Crewed Artemis-Class</option>
              <option>Rover Traverse</option>
              <option>Polar Prospecting</option>
            </select>
          </label>

          <label className="text-slate-300">
            Launch Facility
            <select
              value={launchFacilityId}
              onChange={(e) => setLaunchFacilityId(e.target.value)}
              className="mt-1 w-full bg-[#060911] border border-slate-700 rounded px-3 py-2 text-slate-100"
            >
              {LAUNCH_FACILITIES.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-slate-300">
            Planned Landing Date (UTC)
            <input
              type="datetime-local"
              value={landingDateUtc}
              onChange={(e) => setLandingDateUtc(e.target.value)}
              className="mt-1 w-full bg-[#060911] border border-slate-700 rounded px-3 py-2 font-mono text-slate-100"
            />
          </label>

          <label className="text-slate-300">
            Surface Duration (Earth Days)
            <input
              type="number"
              min={1}
              max={365}
              value={durationDays}
              onChange={(e) => setDurationDays(Number(e.target.value))}
              className="mt-1 w-full bg-[#060911] border border-slate-700 rounded px-3 py-2 font-mono text-slate-100"
            />
          </label>

          <label className="text-slate-300">
            Spacecraft Reference Class
            <select
              value={spacecraftConfig}
              onChange={(e) => setSpacecraftConfig(e.target.value as MissionPlan['spacecraftConfig'])}
              className="mt-1 w-full bg-[#060911] border border-slate-700 rounded px-3 py-2 text-slate-100"
            >
              <option>Lightweight Lander (1,500 kg)</option>
              <option>Medium Cargo Lander (4,500 kg)</option>
              <option>Human Landing System Class</option>
            </select>
          </label>

          <label className="text-slate-300">
            Min Solar Illumination Required (%)
            <input
              type="number"
              min={0}
              max={100}
              value={minSunlitPct}
              onChange={(e) => setMinSunlitPct(Number(e.target.value))}
              className="mt-1 w-full bg-[#060911] border border-slate-700 rounded px-3 py-2 font-mono text-slate-100"
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={deployRover}
            onChange={(e) => setDeployRover(e.target.checked)}
            className="accent-cyan-500"
          />
          Include Surface Rover Deployment Payload
        </label>

        <label className="block text-xs text-slate-300">
          Scientific Objectives
          <textarea
            rows={3}
            value={objectives}
            onChange={(e) => setObjectives(e.target.value)}
            className="mt-1 w-full bg-[#060911] border border-slate-700 rounded px-3 py-2 text-slate-100"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2.5 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-semibold text-xs rounded flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            {saving ? 'Saving...' : 'Save Mission Plan'}
          </button>
          <button
            type="button"
            onClick={() => exportPdf(currentPlan)}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded flex items-center gap-1.5"
          >
            <FileText className="w-3.5 h-3.5" />
            Export PDF Report
          </button>
          <button
            type="button"
            onClick={() => exportJson(currentPlan)}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Export JSON
          </button>
        </div>
      </form>

      {/* Orbital Mechanics Visualizer & Saved Missions */}
      <div className="lg:col-span-5 space-y-5">
        <div className="bg-[#0B1120] border border-slate-800 rounded-md p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Rocket className="w-4 h-4 text-cyan-400" />
              Animated Transfer Trajectory &amp; Δv Budget
            </h3>
            <button
              type="button"
              onClick={() => setAnimatingOrbit((a) => !a)}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded flex items-center gap-1"
            >
              {animatingOrbit ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              {animatingOrbit ? 'Pause' : 'Play'}
            </button>
          </div>

          <canvas
            ref={trajectoryCanvasRef}
            width={440}
            height={175}
            className="w-full h-44 rounded border border-slate-800 bg-[#050811] block"
          />

          <div className="grid grid-cols-2 gap-2.5 text-xs font-mono">
            <div className="bg-[#060911] border border-slate-800 rounded p-2.5">
              <div className="text-slate-400 text-[10px]">Earth–Moon Mean Dist</div>
              <div className="text-slate-100 font-semibold">384,400 km</div>
            </div>
            <div className="bg-[#060911] border border-slate-800 rounded p-2.5">
              <div className="text-slate-400 text-[10px]">Assumed Transit Time</div>
              <div className="text-slate-100 font-semibold">{orbitalCalc.assumedTransitHours} hours</div>
            </div>
            <div className="bg-[#060911] border border-slate-800 rounded p-2.5">
              <div className="text-slate-400 text-[10px]">Total Reference Δv</div>
              <div className="text-cyan-300 font-semibold">{orbitalCalc.totalDeltaVMs} m/s</div>
            </div>
            <div className="bg-[#060911] border border-slate-800 rounded p-2.5">
              <div className="text-slate-400 text-[10px]">Target Solar Margin</div>
              <div className="text-amber-300 font-semibold">
                {illumination
                  ? `${illumination.sunlitPercentage}% (Req ${minSunlitPct}%)`
                  : 'Pending'}
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 space-y-1 pt-2 border-t border-slate-800">
            <div className="font-semibold text-slate-300">Documented Reference Assumptions:</div>
            {orbitalCalc.formulasAndAssumptions.map((f, i) => (
              <div key={i}>· {f}</div>
            ))}
          </div>
        </div>

        <div className="bg-[#0B1120] border border-slate-800 rounded-md p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-100">
            Saved Mission Archive ({missions.length})
          </h3>
          {missions.length === 0 ? (
            <div className="text-xs text-slate-500">
              No saved missions yet. Configure parameters on the left and click Save Mission Plan.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {missions.map((m) => (
                <div
                  key={m.id}
                  className="bg-[#060911] border border-slate-800 rounded p-3 space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-100 truncate">{m.name}</span>
                    <button
                      onClick={() => removeMissionPlan(m.id)}
                      className="text-slate-500 hover:text-rose-400"
                      aria-label="Delete mission"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="font-mono text-[11px] text-slate-400">
                    {m.missionType} · {m.targetCoordinate.lat.toFixed(2)}°,{' '}
                    {m.targetCoordinate.lon.toFixed(2)}° · {m.durationDays}d
                  </div>
                  <div className="flex flex-wrap gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => loadMissionToBuilder(m)}
                      className="text-[11px] text-emerald-400 hover:text-emerald-300 font-mono"
                    >
                      Load to Timeline
                    </button>
                    <button
                      type="button"
                      onClick={() => exportPdf(m)}
                      className="text-[11px] text-cyan-400 hover:text-cyan-300 font-mono"
                    >
                      Download PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => exportJson(m)}
                      className="text-[11px] text-slate-400 hover:text-slate-200 font-mono"
                    >
                      Download JSON
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      </div>
    </motion.div>
  );
};
