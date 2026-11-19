import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { motion } from 'motion/react';
import { AlertTriangle, Camera, Film, Play, RotateCcw, ShieldAlert, Square } from 'lucide-react';
import { useLunar } from '../context/LunarContext.tsx';
import { createCalibratedRenderer, applyStudioEnvironment, afterWebGLDraw } from '../utils/threeSetup.ts';

type SimMode = 'manual' | 'assisted' | 'autonomous' | 'apollo11';

interface TelemetryState {
  altitudeM: number;
  vx: number;
  vz: number;
  vy: number;
  accMs2: number;
  xM: number;
  zM: number;
  fuelPct: number;
  phase: string;
  outcome: 'RUNNING' | 'LANDED SAFE' | 'HARD LANDING' | 'ABORTED';
  divertReason: string | null;
  targetSlopeDeg: number;
}

const APOLLO11_TIMELINE = [
  { t: '00:00 (PDI)', label: 'Powered Descent Initiation (~15.2 km alt, historical Apollo 11 record)' },
  { t: '04:00 (1202)', label: 'Program Alarm 1202 (AGC executive overflow; Go given by Flight Control)' },
  { t: '08:20 (P64)', label: 'High-Gate Pitchover (~2.3 km alt) — crew visual assessment of West Crater boulder field' },
  { t: '10:30 (P66)', label: 'Manual Attitude Hold & Lateral Diversion past West Crater (~60 m/s -> 0 m/s)' },
  { t: '12:36 (Contact)', label: 'Tranquility Base Touchdown (0.67408°N, 23.47297°E) — ~25s hover propellant remaining' },
];

function buildLunarLanderGroup(): THREE.Group {
  const group = new THREE.Group();

  const foilMat = new THREE.MeshStandardMaterial({
    color: 0xd99b26,
    metalness: 0.85,
    roughness: 0.28,
  });
  const darkMetal = new THREE.MeshStandardMaterial({
    color: 0x334155,
    metalness: 0.75,
    roughness: 0.45,
  });
  const cabinMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    metalness: 0.35,
    roughness: 0.55,
  });

  const descentBody = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.7, 0.45, 8), foilMat);
  descentBody.position.y = 0.45;
  group.add(descentBody);

  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.28, 0.35, 16, 1, true), darkMetal);
  nozzle.position.y = 0.18;
  group.add(nozzle);

  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2 + Math.PI / 4;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.78, 8), darkMetal);
    leg.position.set(Math.cos(angle) * 0.72, 0.25, Math.sin(angle) * 0.72);
    leg.rotation.z = Math.cos(angle) * 0.55;
    leg.rotation.x = -Math.sin(angle) * 0.55;
    group.add(leg);

    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.04, 12), foilMat);
    pad.position.set(Math.cos(angle) * 0.96, 0.02, Math.sin(angle) * 0.96);
    group.add(pad);
  }

  const ascent = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.55, 0.7), cabinMat);
  ascent.position.y = 0.95;
  group.add(ascent);

  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.04, 0.08, 12), cabinMat);
  dish.position.set(0.35, 1.32, 0.15);
  dish.rotation.x = 0.6;
  group.add(dish);

  const plumeMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.7,
  });
  const plume = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.95, 12), plumeMat);
  plume.name = 'thrusterPlume';
  plume.rotation.x = Math.PI;
  plume.position.y = -0.35;
  group.add(plume);

  return group;
}

export const SimulatorPage: React.FC = () => {
  const {
    selectedCoord,
    setSelectedCoord,
    assessment,
    settings,
    setCapturedSnapshot,
    setVideoModalOpen,
  } = useLunar();

  const mountRef = useRef<HTMLDivElement | null>(null);
  const camCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const snapshotFnRef = useRef<(() => string | null) | null>(null);

  const [mode, setMode] = useState<SimMode>('autonomous');
  const [apolloAutopilot, setApolloAutopilot] = useState(true);
  const [running, setRunning] = useState(false);
  const [manualThrust, setManualThrust] = useState(1.62);
  const [manualPitchX, setManualPitchX] = useState(0);
  const [manualPitchZ, setManualPitchZ] = useState(0);
  const [sampleImgOverlay, setSampleImgOverlay] = useState(false);

  const [telemetry, setTelemetry] = useState<TelemetryState>({
    altitudeM: 600,
    vx: 14,
    vz: -8,
    vy: -16,
    accMs2: 1.8,
    xM: -180,
    zM: 120,
    fuelPct: 100,
    phase: 'READY — PRE-DESCENT CHECK',
    outcome: 'RUNNING',
    divertReason: null,
    targetSlopeDeg: assessment?.dem.meanSlopeDeg ?? 0,
  });

  const simRef = useRef<TelemetryState>(telemetry);
  const runningRef = useRef(running);
  const modeRef = useRef(mode);
  const apolloAutopilotRef = useRef(apolloAutopilot);
  const manualCtrlRef = useRef({ thrust: manualThrust, px: manualPitchX, pz: manualPitchZ });

  useEffect(() => {
    runningRef.current = running;
  }, [running]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    apolloAutopilotRef.current = apolloAutopilot;
  }, [apolloAutopilot]);
  useEffect(() => {
    manualCtrlRef.current = { thrust: manualThrust, px: manualPitchX, pz: manualPitchZ };
  }, [manualThrust, manualPitchX, manualPitchZ]);

  const dem = assessment?.dem;

  const activateApollo11 = () => {
    setMode('apollo11');
    if (Math.abs(selectedCoord.lat - 0.67408) > 0.05) {
      setSelectedCoord({
        lat: 0.67408,
        lon: 23.47297,
        name: 'Apollo 11 — Mare Tranquillitatis',
        regionType: 'Basaltic Mare Plain',
        source: 'NASA Apollo Lunar Surface Journal',
      });
    }
    resetSim();
  };

  const resetSim = () => {
    setRunning(false);
    const initial: TelemetryState = {
      altitudeM: 600,
      vx: 14,
      vz: -8,
      vy: -16,
      accMs2: 0,
      xM: -180,
      zM: 120,
      fuelPct: 100,
      phase: 'READY — PRE-DESCENT CHECK',
      outcome: 'RUNNING',
      divertReason: null,
      targetSlopeDeg: dem?.meanSlopeDeg ?? 0,
    };
    simRef.current = initial;
    setTelemetry(initial);
  };

  const bestLandingTarget = React.useMemo(() => {
    if (!dem || !dem.dataAvailable || dem.slopesDeg.length === 0) {
      return { xM: 0, zM: 0, slope: 99, safe: false };
    }
    const n = dem.gridSize;
    const mid = Math.floor(n / 2);
    const centerSlope = dem.slopesDeg[mid][mid];
    let bestR = mid;
    let bestC = mid;
    let bestSlope = centerSlope;

    if (centerSlope > 12) {
      for (let r = 2; r < n - 2; r++) {
        for (let c = 2; c < n - 2; c++) {
          const s = dem.slopesDeg[r][c];
          if (s < bestSlope) {
            bestSlope = s;
            bestR = r;
            bestC = c;
          }
        }
      }
    }

    const scaleM = 400 / Math.max(1, n / 2);
    return {
      xM: (bestC - mid) * scaleM,
      zM: (bestR - mid) * scaleM,
      slope: bestSlope,
      safe: bestSlope <= 15,
    };
  }, [dem]);

  const startSimulation = () => {
    if (!dem || !dem.dataAvailable) {
      const aborted: TelemetryState = {
        ...simRef.current,
        phase: 'ABORTED — NASA LOLA DATA UNAVAILABLE',
        outcome: 'ABORTED',
        divertReason: 'Autopilot refuses blind descent without verified LOLA terrain data.',
      };
      simRef.current = aborted;
      setTelemetry(aborted);
      return;
    }

    if (mode === 'autonomous' && !bestLandingTarget.safe) {
      const aborted: TelemetryState = {
        ...simRef.current,
        phase: 'AUTOPILOT ABORT — NO SAFE ZONE (<15° SLOPE)',
        outcome: 'ABORTED',
        divertReason: `Minimum terrain slope in region is ${bestLandingTarget.slope.toFixed(1)}°, exceeding 15° lander stability limit.`,
        targetSlopeDeg: bestLandingTarget.slope,
      };
      simRef.current = aborted;
      setTelemetry(aborted);
      return;
    }

    const startState: TelemetryState = {
      altitudeM: 600,
      vx: 14,
      vz: -8,
      vy: -16,
      accMs2: 1.8,
      xM: -180,
      zM: 120,
      fuelPct: 100,
      phase:
        mode === 'apollo11'
          ? apolloAutopilot
            ? 'APOLLO 11 + AUTOPILOT P64 APPROACH'
            : 'APOLLO 11 RECONSTRUCTION APPROACH'
          : 'POWERED DESCENT — APPROACH',
      outcome: 'RUNNING',
      divertReason:
        (mode === 'autonomous' || (mode === 'apollo11' && apolloAutopilot)) &&
        (Math.abs(bestLandingTarget.xM) > 10 || Math.abs(bestLandingTarget.zM) > 10)
          ? `Hazard Avoidance Divert to (${bestLandingTarget.xM.toFixed(0)}m, ${bestLandingTarget.zM.toFixed(0)}m) @ ${bestLandingTarget.slope.toFixed(1)}° slope`
          : null,
      targetSlopeDeg: bestLandingTarget.slope,
    };
    simRef.current = startState;
    setTelemetry(startState);
    setRunning(true);
  };

  // Three.js 3D Landing Scene + Camera Feed Renderer
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const { renderer, isSoftwareGl } = createCalibratedRenderer(container, settings.lightweightMode);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x03050a);
    scene.fog = new THREE.FogExp2(0x03050a, 0.012);
    const envTex = applyStudioEnvironment(renderer, scene);

    const camera = new THREE.PerspectiveCamera(
      48,
      Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
      0.2,
      200
    );
    camera.position.set(16, 14, 18);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl && !settings.lightweightMode;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;

    scene.add(new THREE.HemisphereLight(0x94a3b8, 0x0f172a, 0.45));
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
    sun.position.set(25, 18, 12);
    scene.add(sun);

    const gridN = dem?.dataAvailable ? Math.min(41, dem.gridSize) : 25;
    const planeGeo = new THREE.PlaneGeometry(40, 40, gridN - 1, gridN - 1);
    planeGeo.rotateX(-Math.PI / 2);

    const posAttr = planeGeo.attributes.position;
    const colors = new Float32Array(posAttr.count * 3);
    const minE = dem?.minElevationM ?? -500;
    const spanE = Math.max(100, (dem?.maxElevationM ?? 500) - minE);

    for (let i = 0; i < posAttr.count; i++) {
      const r = Math.floor(i / gridN);
      const c = i % gridN;
      let h = 0;
      let slope = 2;
      if (dem?.dataAvailable && dem.elevationsMeters[r]?.[c] !== undefined) {
        h = ((dem.elevationsMeters[r][c] - minE) / spanE) * 3.2;
        slope = dem.slopesDeg[r]?.[c] ?? 2;
      }
      posAttr.setY(i, h);

      const base = 0.38 + (h / 3.2) * 0.25;
      if (slope > 15) {
        colors[i * 3] = Math.min(1, base + 0.32);
        colors[i * 3 + 1] = base * 0.65;
        colors[i * 3 + 2] = base * 0.65;
      } else {
        colors[i * 3] = base;
        colors[i * 3 + 1] = base * 1.02;
        colors[i * 3 + 2] = base * 1.05;
      }
    }
    planeGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    planeGeo.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.94,
      metalness: 0.02,
    });
    const terrainMesh = new THREE.Mesh(planeGeo, terrainMat);
    scene.add(terrainMesh);

    // Animated pulsing radar target ring + ground dust plume ring near touchdown
    const ringGeo = new THREE.RingGeometry(0.65, 0.88, 28);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const targetRing = new THREE.Mesh(ringGeo, ringMat);
    targetRing.position.set(bestLandingTarget.xM / 25, 2.2, bestLandingTarget.zM / 25);
    scene.add(targetRing);

    const dustGeo = new THREE.RingGeometry(0.7, 1.5, 28);
    dustGeo.rotateX(-Math.PI / 2);
    const dustMat = new THREE.MeshBasicMaterial({
      color: 0x94a3b8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.0,
    });
    const dustRing = new THREE.Mesh(dustGeo, dustMat);
    dustRing.position.set(bestLandingTarget.xM / 25, 1.65, bestLandingTarget.zM / 25);
    scene.add(dustRing);

    const lander = buildLunarLanderGroup();
    scene.add(lander);

    snapshotFnRef.current = () => {
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL('image/png');
    };

    let disposed = false;
    let frameId = 0;
    let lastTime = performance.now();

    const drawOnboardCamera = (st: TelemetryState) => {
      const c = camCanvasRef.current;
      if (!c) return;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      c.width = 320;
      c.height = 200;

      ctx.fillStyle = '#070b14';
      ctx.fillRect(0, 0, 320, 200);

      if (dem?.dataAvailable && dem.slopesDeg.length > 0) {
        const n = dem.gridSize;
        const cw = 320 / n;
        const ch = 200 / n;
        for (let r = 0; r < n; r++) {
          for (let col = 0; col < n; col++) {
            const sl = dem.slopesDeg[r][col];
            const el = ((dem.elevationsMeters[r][col] - minE) / spanE) * 140 + 40;
            if (sl > 15) {
              ctx.fillStyle = 'rgba(239,68,68,0.65)';
            } else {
              const g = Math.round(el);
              ctx.fillStyle = `rgb(${g},${g},${Math.min(255, g + 12)})`;
            }
            ctx.fillRect(col * cw, r * ch, Math.ceil(cw), Math.ceil(ch));
          }
        }
      }

      if (sampleImgOverlay) {
        ctx.strokeStyle = 'rgba(251,191,36,0.65)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(95, 80, 26, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = '#fbbf24';
        ctx.font = '10px monospace';
        ctx.fillText('HAZARD: CRATER RIM', 58, 48);
      }

      const tx = 160 + (bestLandingTarget.xM / 400) * 120;
      const ty = 100 + (bestLandingTarget.zM / 400) * 80;
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(tx - 16, ty - 16, 32, 32);
      ctx.fillStyle = '#22d3ee';
      ctx.font = '10px monospace';
      ctx.fillText(`TGT LOCK (${bestLandingTarget.slope.toFixed(1)}°)`, tx - 38, ty - 22);

      ctx.fillStyle = 'rgba(6,9,17,0.82)';
      ctx.fillRect(4, 174, 312, 22);
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '10px monospace';
      ctx.fillText(
        `SIM CAM · ALT ${st.altitudeM.toFixed(0)}m · Vz ${st.vy.toFixed(1)}m/s · ${st.phase.slice(0, 22)}`,
        10,
        189
      );
    };

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min(0.08, (now - lastTime) / 1000);
      lastTime = now;

      const st = { ...simRef.current };
      const plume = lander.getObjectByName('thrusterPlume') as THREE.Mesh | undefined;

      if (runningRef.current && st.outcome === 'RUNNING') {
        const gMoon = 1.622;
        let thrust = manualCtrlRef.current.thrust;
        let ax = manualCtrlRef.current.px;
        let az = manualCtrlRef.current.pz;

        const useAutopilot =
          modeRef.current === 'autonomous' ||
          modeRef.current === 'assisted' ||
          (modeRef.current === 'apollo11' && apolloAutopilotRef.current);

        if (useAutopilot && st.fuelPct > 0) {
          const dx = bestLandingTarget.xM - st.xM;
          const dz = bestLandingTarget.zM - st.zM;
          if (modeRef.current !== 'assisted') {
            ax = THREE.MathUtils.clamp(dx * 0.08 - st.vx * 0.45, -2.5, 2.5);
            az = THREE.MathUtils.clamp(dz * 0.08 - st.vz * 0.45, -2.5, 2.5);
          }
          const targetVy = st.altitudeM > 120 ? -14 : st.altitudeM > 25 ? -5.0 : -1.4;
          const reqAy = gMoon + (targetVy - st.vy) * 1.4;
          thrust = THREE.MathUtils.clamp(reqAy, 0.2, 4.8);
        }

        if (st.fuelPct <= 0) {
          thrust = 0;
          ax = 0;
          az = 0;
        }

        const netAy = thrust - gMoon;
        st.vy += netAy * dt;
        st.vx += ax * dt;
        st.vz += az * dt;
        st.xM += st.vx * dt;
        st.zM += st.vz * dt;
        st.altitudeM = Math.max(0, st.altitudeM + st.vy * dt);
        st.accMs2 = Number(Math.sqrt(thrust * thrust + ax * ax + az * az).toFixed(2));
        st.fuelPct = Math.max(0, st.fuelPct - thrust * 0.32 * dt);

        if (st.altitudeM > 180) st.phase = 'BRAKING & HAZARD ASSESSMENT';
        else if (st.altitudeM > 35) st.phase = 'APPROACH & DIVERSION';
        else if (st.altitudeM > 0.2) st.phase = 'TERMINAL VERTICAL DESCENT';

        if (st.altitudeM <= 0.05) {
          st.altitudeM = 0;
          const touchSpeed = Math.abs(st.vy);
          const hSpeed = Math.hypot(st.vx, st.vz);
          if (touchSpeed <= 3.2 && hSpeed <= 2.5) {
            st.outcome = 'LANDED SAFE';
            st.phase = `TOUCHDOWN CONFIRMED (V_vert ${touchSpeed.toFixed(1)} m/s)`;
          } else {
            st.outcome = 'HARD LANDING';
            st.phase = `EXCESS TOUCHDOWN VELOCITY (${touchSpeed.toFixed(1)} m/s)`;
          }
          runningRef.current = false;
          setRunning(false);
        }

        simRef.current = st;
        setTelemetry(st);
      }

      // Position 3D lander + thruster flicker + pulsing target radar ring + regolith blowback dust ring
      lander.position.set(st.xM / 25, 1.5 + st.altitudeM / 35, st.zM / 25);
      lander.rotation.z = THREE.MathUtils.clamp(-st.vx * 0.03, -0.35, 0.35);
      lander.rotation.x = THREE.MathUtils.clamp(st.vz * 0.03, -0.35, 0.35);

      if (plume) {
        plume.visible = runningRef.current && st.fuelPct > 0;
        const flicker = 0.85 + Math.sin(now * 0.045) * 0.22;
        plume.scale.set(1, flicker, 1);
      }

      const ringPulse = 1 + Math.sin(now * 0.004) * 0.14;
      targetRing.scale.set(ringPulse, 1, ringPulse);
      targetRing.rotation.y += dt * 0.5;

      // Ground dust kickup intensifies below 50m AGL while engine burns
      if (runningRef.current && st.altitudeM < 55 && st.fuelPct > 0) {
        const intensity = Math.max(0, 1 - st.altitudeM / 55);
        dustRing.position.set(st.xM / 25, 1.68, st.zM / 25);
        const expand = 0.7 + ((now * 0.0025) % 1.4);
        dustRing.scale.set(expand, 1, expand);
        dustMat.opacity = intensity * (1 - (expand - 0.7) / 1.4) * 0.45;
      } else {
        dustMat.opacity = 0;
      }

      controls.update();
      renderer.render(scene, camera);
      drawOnboardCamera(st);

      if (isSoftwareGl) {
        frameId = afterWebGLDraw(renderer, tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    tick();

    const onResize = () => {
      if (!container || disposed) return;
      const w = Math.max(100, container.clientWidth);
      const h = Math.max(100, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', onResize);
      controls.dispose();
      planeGeo.dispose();
      terrainMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      dustGeo.dispose();
      dustMat.dispose();
      envTex.dispose();
      renderer.dispose();
    };
  }, [dem, bestLandingTarget, settings.lightweightMode, sampleImgOverlay]);

  const handleAnimateScene = () => {
    const url = snapshotFnRef.current?.();
    if (url) setCapturedSnapshot(url);
    setVideoModalOpen(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-[1500px] mx-auto space-y-5"
    >
      {/* Mode Selector & Safety Isolation Notice */}
      <div className="bg-[#0B1120] border border-slate-800 rounded-md p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-mono text-amber-400">
            RESEARCH SIMULATION ENVIRONMENT (ISOLATED FROM FLIGHT HARDWARE)
          </div>
          <h2 className="text-lg font-display font-bold text-slate-100">
            Autonomous Landing &amp; Apollo 11 Historical Simulator
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'manual', label: 'Manual Sim' },
              { id: 'assisted', label: 'Assisted Sim' },
              { id: 'autonomous', label: 'Autonomous Autopilot' },
              { id: 'apollo11', label: 'Apollo 11 Historical' },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              onClick={() => (m.id === 'apollo11' ? activateApollo11() : setMode(m.id))}
              className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                mode === m.id
                  ? 'bg-cyan-600 border-cyan-500 text-slate-950 font-semibold'
                  : 'bg-[#060911] border-slate-700 text-slate-300 hover:border-slate-500'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main 3D Descent Viewport + Telemetry & Camera Feed */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-8 relative bg-[#03050a] border border-slate-800 rounded-md overflow-hidden min-h-[480px] h-[540px]">
          <div ref={mountRef} className="w-full h-full" />

          <div className="absolute top-3 left-3 bg-[#060911]/90 border border-slate-800 rounded px-3 py-2 text-xs pointer-events-none space-y-0.5">
            <div className="font-mono text-cyan-300 font-semibold">{telemetry.phase}</div>
            <div className="font-mono text-[11px] text-slate-400">
              Site: {selectedCoord.name} · Target Slope: {bestLandingTarget.slope.toFixed(1)}°
            </div>
          </div>

          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-[#0B1120]/95 border border-slate-700 rounded-md px-3 py-2 flex flex-wrap items-center gap-2">
            <button
              onClick={startSimulation}
              disabled={running}
              className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-slate-950 font-semibold text-xs rounded flex items-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5" />
              Start Descent
            </button>
            <button
              onClick={() => setRunning(false)}
              disabled={!running}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs rounded flex items-center gap-1.5"
            >
              <Square className="w-3.5 h-3.5" />
              Pause
            </button>
            <button
              onClick={resetSim}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
            <button
              onClick={handleAnimateScene}
              className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/60 text-amber-300 text-xs font-semibold rounded flex items-center gap-1.5"
            >
              <Film className="w-3.5 h-3.5" />
              Animate Scene
            </button>
          </div>
        </div>

        {/* Right Telemetry + Simulated Camera Feed */}
        <div className="xl:col-span-4 space-y-4">
          <div className="bg-[#0B1120] border border-slate-800 rounded-md p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">Simulated Descent Telemetry</h3>
              <span
                className={`text-xs font-mono font-semibold ${
                  telemetry.outcome === 'LANDED SAFE'
                    ? 'text-emerald-400'
                    : telemetry.outcome === 'ABORTED' || telemetry.outcome === 'HARD LANDING'
                    ? 'text-rose-400'
                    : 'text-cyan-300'
                }`}
              >
                {telemetry.outcome}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="bg-[#060911] border border-slate-800 rounded p-2">
                <div className="text-slate-400 text-[10px]">Altitude (AGL)</div>
                <div className="text-slate-100 font-semibold text-sm tabular-nums">{telemetry.altitudeM.toFixed(1)} m</div>
              </div>
              <div className="bg-[#060911] border border-slate-800 rounded p-2">
                <div className="text-slate-400 text-[10px]">Vertical Vel</div>
                <div className="text-slate-100 font-semibold text-sm tabular-nums">{telemetry.vy.toFixed(2)} m/s</div>
              </div>
              <div className="bg-[#060911] border border-slate-800 rounded p-2">
                <div className="text-slate-400 text-[10px]">Horizontal Vel</div>
                <div className="text-slate-100 font-semibold text-sm tabular-nums">
                  {Math.hypot(telemetry.vx, telemetry.vz).toFixed(2)} m/s
                </div>
              </div>
              <div className="bg-[#060911] border border-slate-800 rounded p-2">
                <div className="text-slate-400 text-[10px]">Propellant Rem</div>
                <div className="text-amber-300 font-semibold text-sm tabular-nums">{telemetry.fuelPct.toFixed(1)}%</div>
              </div>
            </div>

            {/* Animated altitude progress bar */}
            <div className="space-y-1 text-[11px] font-mono">
              <div className="flex justify-between text-slate-400">
                <span>Descent Altitude Progress</span>
                <span>{Math.round(((600 - telemetry.altitudeM) / 600) * 100)}%</span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded overflow-hidden">
                <div
                  className="h-full bg-cyan-500 transition-all duration-100"
                  style={{ width: `${Math.max(2, Math.min(100, ((600 - telemetry.altitudeM) / 600) * 100))}%` }}
                />
              </div>
            </div>

            {telemetry.divertReason && (
              <div className="bg-amber-950/30 border border-amber-800/60 rounded p-2.5 text-xs text-amber-200 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{telemetry.divertReason}</span>
              </div>
            )}

            {(mode === 'manual' || mode === 'assisted') && (
              <div className="pt-2 border-t border-slate-800 space-y-2 text-xs">
                <label className="block">
                  <div className="flex justify-between font-mono text-slate-300">
                    <span>Engine Thrust Accel</span>
                    <span>{manualThrust.toFixed(2)} m/s²</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={4.5}
                    step={0.05}
                    value={manualThrust}
                    onChange={(e) => setManualThrust(Number(e.target.value))}
                    className="w-full accent-cyan-500"
                  />
                </label>
                {mode === 'manual' && (
                  <div className="grid grid-cols-2 gap-2">
                    <label>
                      <span className="font-mono text-slate-400">Lat Pitch X: {manualPitchX}</span>
                      <input
                        type="range"
                        min={-2}
                        max={2}
                        step={0.2}
                        value={manualPitchX}
                        onChange={(e) => setManualPitchX(Number(e.target.value))}
                        className="w-full accent-cyan-500"
                      />
                    </label>
                    <label>
                      <span className="font-mono text-slate-400">Lat Pitch Z: {manualPitchZ}</span>
                      <input
                        type="range"
                        min={-2}
                        max={2}
                        step={0.2}
                        value={manualPitchZ}
                        onChange={(e) => setManualPitchZ(Number(e.target.value))}
                        className="w-full accent-cyan-500"
                      />
                    </label>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Camera-Integrated Landing Simulation */}
          <div className="bg-[#0B1120] border border-slate-800 rounded-md p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-cyan-400" />
                Simulated Optical Hazard Camera
              </h3>
              <button
                onClick={() => setSampleImgOverlay((s) => !s)}
                className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300"
              >
                {sampleImgOverlay ? 'Hide Sample Hazard' : 'Test Sample Hazard'}
              </button>
            </div>
            <canvas
              ref={camCanvasRef}
              className="w-full h-44 bg-[#060911] border border-slate-800 rounded block"
            />
            <p className="text-[11px] text-slate-400">
              Simulated nadir optical-vs-LOLA-DEM hazard comparison. Does not connect to live spacecraft camera hardware.
            </p>
          </div>
        </div>
      </div>

      {/* Apollo 11 Historical Mission Context */}
      {mode === 'apollo11' && (
        <div className="bg-[#0B1120] border border-slate-800 rounded-md p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                Apollo 11 Historical Mission Timeline &amp; Virtual Autopilot Comparison
              </h3>
              <p className="text-xs text-slate-400">
                Distinguishes historical NASA mission events (July 20, 1969) from the simplified virtual simulation above.
              </p>
            </div>
            <label className="flex items-center gap-2 text-xs text-cyan-300 font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={apolloAutopilot}
                onChange={(e) => setApolloAutopilot(e.target.checked)}
                className="accent-cyan-500"
              />
              Simulate Apollo 11 Landing with Autopilot
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5 text-xs">
            {APOLLO11_TIMELINE.map((ev) => (
              <div key={ev.t} className="bg-[#060911] border border-slate-800 rounded p-2.5 space-y-1">
                <div className="font-mono text-cyan-400 font-semibold">{ev.t}</div>
                <div className="text-slate-300 leading-snug">{ev.label}</div>
              </div>
            ))}
          </div>

          <div className="flex items-start gap-2 text-xs text-slate-400 pt-1">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              Historical Fact: Commander Neil Armstrong took manual P66 control to fly past boulder-strewn West Crater and landed safely at Tranquility Base. The 3D physics above is a simplified educational reconstruction, not exact Apollo Guidance Computer telemetry.
            </span>
          </div>
        </div>
      )}
    </motion.div>
  );
};
