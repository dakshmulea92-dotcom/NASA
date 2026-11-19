import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { motion } from 'motion/react';
import { Film, Navigation, Play, RotateCcw, Square } from 'lucide-react';
import { useLunar } from '../context/LunarContext.tsx';
import { ScientificMapCanvas } from '../components/ScientificMapCanvas.tsx';
import { createCalibratedRenderer, applyStudioEnvironment, afterWebGLDraw } from '../utils/threeSetup.ts';
import { haversineMoonKm } from '../utils/coordinateFormat.ts';

interface GridCell {
  row: number;
  col: number;
}

function buildCompositeRover(): { group: THREE.Group; wheels: THREE.Mesh[] } {
  const g = new THREE.Group();
  const wheels: THREE.Mesh[] = [];
  const goldBody = new THREE.MeshStandardMaterial({ color: 0xeab308, metalness: 0.75, roughness: 0.25 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.7, roughness: 0.4 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.25, roughness: 0.8 });
  const solarMat = new THREE.MeshStandardMaterial({ color: 0x0f294a, metalness: 0.4, roughness: 0.25 });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.35, 1.15), goldBody);
  chassis.position.y = 0.42;
  g.add(chassis);

  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.04, 1.25), solarMat);
  deck.position.y = 0.62;
  g.add(deck);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.65, 8), frameMat);
  mast.position.set(0, 0.92, 0.4);
  g.add(mast);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.12, 0.14), frameMat);
  head.position.set(0, 1.25, 0.42);
  g.add(head);

  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.04, 0.08, 12), frameMat);
  dish.position.set(-0.26, 0.84, -0.35);
  dish.rotation.x = -0.5;
  g.add(dish);

  for (const side of [-0.52, 0.52]) {
    for (const zOff of [-0.46, 0, 0.46]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 14), wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(side, 0.16, zOff);
      g.add(wheel);
      wheels.push(wheel);

      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.28, 6), frameMat);
      strut.position.set(side * 0.82, 0.28, zOff);
      strut.rotation.z = side > 0 ? -0.45 : 0.45;
      g.add(strut);
    }
  }

  return { group: g, wheels };
}

function planSlopeSafeRoute(
  slopes: number[][],
  start: GridCell,
  goal: GridCell
): GridCell[] {
  const n = slopes.length;
  if (n === 0) return [start, goal];

  const key = (r: number, c: number) => `${r},${c}`;
  const open: Array<{ r: number; c: number; f: number; g: number }> = [
    { r: start.row, c: start.col, f: 0, g: 0 },
  ];
  const gScore = new Map<string, number>([[key(start.row, start.col), 0]]);
  const cameFrom = new Map<string, GridCell>();
  const closed = new Set<string>();

  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];

  while (open.length > 0) {
    open.sort((a, b) => a.f - b.f);
    const cur = open.shift()!;
    const cKey = key(cur.r, cur.c);
    if (cur.r === goal.row && cur.c === goal.col) {
      const path: GridCell[] = [{ row: goal.row, col: goal.col }];
      let k = cKey;
      while (cameFrom.has(k)) {
        const prev = cameFrom.get(k)!;
        path.unshift(prev);
        k = key(prev.row, prev.col);
      }
      return path;
    }
    closed.add(cKey);

    for (const [dr, dc] of dirs) {
      const nr = cur.r + dr;
      const nc = cur.c + dc;
      if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
      const nKey = key(nr, nc);
      if (closed.has(nKey)) continue;

      const stepDist = dr !== 0 && dc !== 0 ? 1.414 : 1.0;
      const slope = slopes[nr][nc] ?? 0;
      const slopePenalty = slope > 18 ? 120 : slope > 12 ? 12 : slope * 0.25;
      const tentativeG = cur.g + stepDist + slopePenalty;

      if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
        cameFrom.set(nKey, { row: cur.r, col: cur.c });
        gScore.set(nKey, tentativeG);
        const h = Math.hypot(goal.row - nr, goal.col - nc);
        open.push({ r: nr, c: nc, g: tentativeG, f: tentativeG + h });
      }
    }
  }
  return [start, goal];
}

export const RoverPage: React.FC = () => {
  const {
    assessment,
    illumination,
    loadingAnalysis,
    settings,
    setCapturedSnapshot,
    setVideoModalOpen,
  } = useLunar();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const snapshotFnRef = useRef<(() => string | null) | null>(null);

  const dem = assessment?.dem ?? null;
  const gridN = dem?.gridSize ?? 41;

  const [startCell, setStartCell] = useState<GridCell>({ row: 8, col: 8 });
  const [goalCell, setGoalCell] = useState<GridCell>({ row: 30, col: 32 });
  const [pickMode, setPickMode] = useState<'start' | 'goal'>('goal');
  const [driving, setDriving] = useState(false);
  const [progressIdx, setProgressIdx] = useState(0);

  const route = useMemo(() => {
    if (!dem || !dem.dataAvailable) return [];
    const s = {
      row: Math.min(gridN - 1, startCell.row),
      col: Math.min(gridN - 1, startCell.col),
    };
    const g = {
      row: Math.min(gridN - 1, goalCell.row),
      col: Math.min(gridN - 1, goalCell.col),
    };
    return planSlopeSafeRoute(dem.slopesDeg, s, g);
  }, [dem, gridN, startCell, goalCell]);

  const routeMetrics = useMemo(() => {
    if (!dem || route.length < 2) return { totalKm: 0, maxSlope: 0, meanSlope: 0 };
    let distM = 0;
    let maxSlope = 0;
    let slopeSum = 0;
    for (let i = 0; i < route.length; i++) {
      const s = dem.slopesDeg[route[i].row]?.[route[i].col] ?? 0;
      if (s > maxSlope) maxSlope = s;
      slopeSum += s;
      if (i > 0) {
        const dr = route[i].row - route[i - 1].row;
        const dc = route[i].col - route[i - 1].col;
        distM += Math.hypot(dr, dc) * dem.cellSizeMeters;
      }
    }
    return {
      totalKm: Number((distM / 1000).toFixed(2)),
      maxSlope: Number(maxSlope.toFixed(1)),
      meanSlope: Number((slopeSum / route.length).toFixed(1)),
    };
  }, [dem, route]);

  const drivingRef = useRef(driving);
  const progressRef = useRef(progressIdx);
  useEffect(() => {
    drivingRef.current = driving;
  }, [driving]);
  useEffect(() => {
    progressRef.current = progressIdx;
  }, [progressIdx]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const { renderer, isSoftwareGl } = createCalibratedRenderer(container, settings.lightweightMode);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04070e);
    const envTex = applyStudioEnvironment(renderer, scene);

    const camera = new THREE.PerspectiveCamera(
      45,
      Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
      0.2,
      200
    );
    camera.position.set(14, 12, 16);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl && !settings.lightweightMode;
    controls.maxPolarAngle = Math.PI / 2 - 0.05;

    scene.add(new THREE.HemisphereLight(0x94a3b8, 0x0f172a, 0.45));
    const sun = new THREE.DirectionalLight(0xfff5e4, 2.1);
    sun.position.set(20, 16, 10);
    scene.add(sun);

    const n = dem?.dataAvailable ? dem.gridSize : 25;
    const planeGeo = new THREE.PlaneGeometry(32, 32, n - 1, n - 1);
    planeGeo.rotateX(-Math.PI / 2);

    const posAttr = planeGeo.attributes.position;
    const minE = dem?.minElevationM ?? 0;
    const spanE = Math.max(100, (dem?.maxElevationM ?? 100) - minE);

    const heightAt = (r: number, c: number) => {
      if (!dem?.dataAvailable) return 0;
      const el = dem.elevationsMeters[Math.min(n - 1, Math.max(0, r))]?.[Math.min(n - 1, Math.max(0, c))] ?? minE;
      return ((el - minE) / spanE) * 3.0;
    };

    for (let i = 0; i < posAttr.count; i++) {
      const r = Math.floor(i / n);
      const c = i % n;
      posAttr.setY(i, heightAt(r, c));
    }
    planeGeo.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.92,
      metalness: 0.04,
      flatShading: false,
    });
    scene.add(new THREE.Mesh(planeGeo, terrainMat));

    if (route.length > 1) {
      const pts = route.map((cell) => {
        const x = ((cell.col / (n - 1)) - 0.5) * 32;
        const z = ((cell.row / (n - 1)) - 0.5) * 32;
        return new THREE.Vector3(x, heightAt(cell.row, cell.col) + 0.12, z);
      });
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const lineMat = new THREE.LineBasicMaterial({ color: 0xfbbf24 });
      scene.add(new THREE.Line(lineGeo, lineMat));
    }

    const { group: rover, wheels } = buildCompositeRover();
    scene.add(rover);

    // Destination beacon ring
    const goalCellActual = route[route.length - 1] || goalCell;
    const gx = ((goalCellActual.col / Math.max(1, n - 1)) - 0.5) * 32;
    const gz = ((goalCellActual.row / Math.max(1, n - 1)) - 0.5) * 32;
    const beaconGeo = new THREE.RingGeometry(0.45, 0.65, 24);
    beaconGeo.rotateX(-Math.PI / 2);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee, side: THREE.DoubleSide });
    const beaconRing = new THREE.Mesh(beaconGeo, beaconMat);
    beaconRing.position.set(gx, heightAt(goalCellActual.row, goalCellActual.col) + 0.08, gz);
    scene.add(beaconRing);

    snapshotFnRef.current = () => {
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL('image/png');
    };

    let disposed = false;
    let frameId = 0;
    let accum = 0;
    let lastTime = performance.now();

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      if (drivingRef.current && route.length > 1) {
        accum += dt;
        // Spin 6 rocker-bogie wheels during traverse
        wheels.forEach((w) => {
          w.rotation.x += dt * 4.2;
        });
        if (accum > 0.24) {
          accum = 0;
          const next = progressRef.current + 1;
          if (next >= route.length) {
            drivingRef.current = false;
            setDriving(false);
          } else {
            progressRef.current = next;
            setProgressIdx(next);
          }
        }
      }

      const cell = route[Math.min(progressRef.current, Math.max(0, route.length - 1))] || startCell;
      const rx = ((cell.col / Math.max(1, n - 1)) - 0.5) * 32;
      const rz = ((cell.row / Math.max(1, n - 1)) - 0.5) * 32;
      const ry = heightAt(cell.row, cell.col);
      const dampAlpha = 1 - Math.exp(-8 * dt);
      rover.position.lerp(new THREE.Vector3(rx, ry, rz), dampAlpha);

      if (progressRef.current + 1 < route.length) {
        const nxt = route[progressRef.current + 1];
        const nx = ((nxt.col / Math.max(1, n - 1)) - 0.5) * 32;
        const nz = ((nxt.row / Math.max(1, n - 1)) - 0.5) * 32;
        rover.lookAt(nx, ry, nz);
      }

      const beaconPulse = 1 + Math.sin(now * 0.005) * 0.2;
      beaconRing.scale.set(beaconPulse, 1, beaconPulse);

      controls.update();
      renderer.render(scene, camera);

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
      beaconGeo.dispose();
      beaconMat.dispose();
      envTex.dispose();
      renderer.dispose();
    };
  }, [dem, route, settings.lightweightMode]);

  const currentCell = route[Math.min(progressIdx, Math.max(0, route.length - 1))] || startCell;
  const currentSlope = dem?.slopesDeg[currentCell.row]?.[currentCell.col] ?? 0;
  const pctComplete = route.length > 1 ? Math.round((progressIdx / (route.length - 1)) * 100) : 0;
  const distanceTravelledKm = Number(((pctComplete / 100) * routeMetrics.totalKm).toFixed(2));

  const handleMapSelect = (lat: number, lon: number) => {
    if (!dem) return;
    const distKm = haversineMoonKm(dem.centerLat, dem.centerLon, lat, lon);
    const cosLat = Math.max(0.05, Math.cos((dem.centerLat * Math.PI) / 180));
    const dxKm = ((lon - dem.centerLon) * Math.PI / 180) * 1737.4 * cosLat;
    const dyKm = ((lat - dem.centerLat) * Math.PI / 180) * 1737.4;
    const c = Math.max(
      0,
      Math.min(gridN - 1, Math.round(((dxKm + dem.radiusKm) / (2 * dem.radiusKm)) * (gridN - 1)))
    );
    const r = Math.max(
      0,
      Math.min(gridN - 1, Math.round(((dem.radiusKm - dyKm) / (2 * dem.radiusKm)) * (gridN - 1)))
    );
    if (distKm <= dem.radiusKm * 1.5) {
      if (pickMode === 'start') setStartCell({ row: r, col: c });
      else setGoalCell({ row: r, col: c });
      setProgressIdx(0);
      setDriving(false);
    }
  };

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
      <div className="bg-[#0B1120] border border-slate-800 rounded-md p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-mono text-cyan-400">
            LUNAR ROVER TRAVERSE SIMULATION (NOT REAL ROVER TELEMETRY)
          </div>
          <h2 className="text-lg font-display font-bold text-slate-100">
            Rover Explorer &amp; Slope-Safe Path Planner
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setPickMode('start')}
            className={`px-3 py-1.5 rounded text-xs border ${
              pickMode === 'start'
                ? 'bg-cyan-600/20 border-cyan-500 text-cyan-200'
                : 'bg-[#060911] border-slate-700 text-slate-300'
            }`}
          >
            Click Map: Set Start
          </button>
          <button
            onClick={() => setPickMode('goal')}
            className={`px-3 py-1.5 rounded text-xs border ${
              pickMode === 'goal'
                ? 'bg-amber-600/20 border-amber-500 text-amber-200'
                : 'bg-[#060911] border-slate-700 text-slate-300'
            }`}
          >
            Click Map: Set Destination
          </button>
          <button
            onClick={() => {
              if (progressIdx >= route.length - 1) setProgressIdx(0);
              setDriving(true);
            }}
            disabled={driving || route.length < 2}
            className="px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-slate-950 font-semibold text-xs rounded flex items-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5" />
            Drive Route
          </button>
          <button
            onClick={() => setDriving(false)}
            disabled={!driving}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs text-slate-200 rounded flex items-center gap-1.5"
          >
            <Square className="w-3.5 h-3.5" />
            Pause
          </button>
          <button
            onClick={() => {
              setDriving(false);
              setProgressIdx(0);
            }}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
          <button
            onClick={handleAnimateScene}
            className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/60 text-amber-300 font-semibold text-xs rounded flex items-center gap-1.5"
          >
            <Film className="w-3.5 h-3.5" />
            Animate Traverse
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <div className="xl:col-span-7 bg-[#04070e] border border-slate-800 rounded-md overflow-hidden min-h-[440px] h-[480px] relative">
          <div ref={mountRef} className="w-full h-full" />
          <div className="absolute top-3 left-3 bg-[#060911]/90 border border-slate-800 rounded px-3 py-1.5 text-xs font-mono text-slate-200 pointer-events-none">
            3D Rover on LOLA DEM · Progress: {pctComplete}% · Dist: {distanceTravelledKm} / {routeMetrics.totalKm} km
          </div>
          <div className="absolute bottom-3 left-3 right-3 bg-[#060911]/90 border border-slate-800 rounded px-3 py-2 pointer-events-none">
            <div className="flex justify-between text-[11px] font-mono text-slate-300 mb-1">
              <span>Traverse Grade: {currentSlope.toFixed(1)}°</span>
              <span>{pctComplete}% Complete</span>
            </div>
            <div className="h-1.5 bg-slate-800 rounded overflow-hidden">
              <div
                className="h-full bg-amber-400 transition-all duration-150"
                style={{ width: `${Math.max(2, pctComplete)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="xl:col-span-5 space-y-4">
          <ScientificMapCanvas
            dem={dem}
            mode="slope"
            loading={loadingAnalysis}
            routePoints={route}
            title="Traverse Route on LOLA Slope Map (Click to Place Waypoint)"
            onSelectPoint={handleMapSelect}
          />

          <div className="bg-[#0B1120] border border-slate-800 rounded-md p-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-mono">
            <div className="bg-[#060911] border border-slate-800 rounded p-2">
              <div className="text-slate-400 text-[10px]">Route Length</div>
              <div className="text-slate-100 font-semibold tabular-nums">{routeMetrics.totalKm} km</div>
            </div>
            <div className="bg-[#060911] border border-slate-800 rounded p-2">
              <div className="text-slate-400 text-[10px]">Local Grade</div>
              <div className="text-cyan-300 font-semibold tabular-nums">{currentSlope.toFixed(1)}°</div>
            </div>
            <div className="bg-[#060911] border border-slate-800 rounded p-2">
              <div className="text-slate-400 text-[10px]">Max Route Slope</div>
              <div className="text-amber-300 font-semibold tabular-nums">{routeMetrics.maxSlope}°</div>
            </div>
            <div className="bg-[#060911] border border-slate-800 rounded p-2">
              <div className="text-slate-400 text-[10px]">Solar Status</div>
              <div className="text-slate-100 font-semibold flex items-center gap-1">
                <Navigation className="w-3 h-3 text-cyan-400" />
                {illumination?.current.isDirectSunlight ? 'Sunlit' : 'Shadow'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
