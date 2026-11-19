import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Eye, Layers, Pause, Play, RotateCcw } from 'lucide-react';
import type { DemGridResult, HorizonAnalysis } from '../types/lunar.ts';
import {
  afterWebGLDraw,
  applyStudioEnvironment,
  createCalibratedRenderer,
} from '../utils/threeSetup.ts';

interface LiveTerrainViewport3DProps {
  dem: DemGridResult | null;
  horizon: HorizonAnalysis | null;
  transectAxis: 'WE' | 'NS';
  probeNorm: number | null; // 0..1 position along transect
  lightweightMode: boolean;
}

type ShaderMode = 'elevation' | 'slope' | 'solar';

function rampElev(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t));
  if (x < 0.25) {
    const k = x / 0.25;
    return [0.06 + k * 0.08, 0.16 + k * 0.34, 0.38 + k * 0.32];
  }
  if (x < 0.5) {
    const k = (x - 0.25) / 0.25;
    return [0.14 + k * 0.18, 0.5 + k * 0.24, 0.7 - k * 0.16];
  }
  if (x < 0.75) {
    const k = (x - 0.5) / 0.25;
    return [0.32 + k * 0.58, 0.74 - k * 0.1, 0.54 - k * 0.36];
  }
  const k = (x - 0.75) / 0.25;
  return [0.9 + k * 0.1, 0.64 + k * 0.32, 0.18 + k * 0.72];
}

function rampSlope(deg: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, deg / 26));
  if (x < 0.25) {
    const k = x / 0.25;
    return [0.05 + k * 0.06, 0.35 + k * 0.32, 0.45 + k * 0.12];
  }
  if (x < 0.58) {
    const k = (x - 0.25) / 0.33;
    return [0.11 + k * 0.82, 0.67 - k * 0.08, 0.57 - k * 0.45];
  }
  const k = (x - 0.58) / 0.42;
  return [0.93, 0.59 - k * 0.44, 0.12 + k * 0.12];
}

export const LiveTerrainViewport3D: React.FC<LiveTerrainViewport3DProps> = ({
  dem,
  horizon,
  transectAxis,
  probeNorm,
  lightweightMode,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [shaderMode, setShaderMode] = useState<ShaderMode>('elevation');
  const [exaggeration, setExaggeration] = useState<number>(3.0);
  const [autoOrbit, setAutoOrbit] = useState<boolean>(true);
  const [showHorizonRays, setShowHorizonRays] = useState<boolean>(true);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);

  const probeRef = useRef<number | null>(probeNorm);
  const autoOrbitRef = useRef<boolean>(autoOrbit);
  const showHorizonRef = useRef<boolean>(showHorizonRays);
  const resetCamRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    probeRef.current = probeNorm;
  }, [probeNorm]);
  useEffect(() => {
    autoOrbitRef.current = autoOrbit;
  }, [autoOrbit]);
  useEffect(() => {
    showHorizonRef.current = showHorizonRays;
  }, [showHorizonRays]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const { renderer, isSoftwareGl } = createCalibratedRenderer(container, lightweightMode);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x03060d);
    const envTex = applyStudioEnvironment(renderer, scene);

    const camera = new THREE.PerspectiveCamera(
      44,
      Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
      0.1,
      200
    );
    camera.position.set(17, 13.5, 19);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl && !lightweightMode;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.minDistance = 8;
    controls.maxDistance = 42;

    resetCamRef.current = () => {
      camera.position.set(17, 13.5, 19);
      controls.target.set(0, 1.2, 0);
      controls.update();
    };

    scene.add(new THREE.HemisphereLight(0x93c5fd, 0x090d16, 0.48));
    const dirLight = new THREE.DirectionalLight(0xfff5e4, 2.3);
    dirLight.position.set(22, 16, 12);
    scene.add(dirLight);

    const n = dem?.dataAvailable ? Math.min(61, dem.gridSize) : 31;
    const sizeUnits = 24;
    const planeGeo = new THREE.PlaneGeometry(sizeUnits, sizeUnits, n - 1, n - 1);
    planeGeo.rotateX(-Math.PI / 2);

    const posAttr = planeGeo.attributes.position;
    const colors = new Float32Array(posAttr.count * 3);
    const minE = dem?.minElevationM ?? -500;
    const spanE = Math.max(80, (dem?.maxElevationM ?? 500) - minE);
    const heightScale = exaggeration * 1.15;

    const getSample = (r: number, c: number) => {
      if (!dem?.dataAvailable || dem.elevationsMeters.length === 0) {
        return { elev: 0, slope: 2 };
      }
      const sr = Math.min(
        dem.gridSize - 1,
        Math.round((r / Math.max(1, n - 1)) * (dem.gridSize - 1))
      );
      const sc = Math.min(
        dem.gridSize - 1,
        Math.round((c / Math.max(1, n - 1)) * (dem.gridSize - 1))
      );
      return {
        elev: dem.elevationsMeters[sr]?.[sc] ?? minE,
        slope: dem.slopesDeg[sr]?.[sc] ?? 0,
      };
    };

    for (let i = 0; i < posAttr.count; i++) {
      const r = Math.floor(i / n);
      const c = i % n;
      const { elev, slope } = getSample(r, c);
      const normH = (elev - minE) / spanE;
      posAttr.setY(i, normH * heightScale);

      let rgb: [number, number, number];
      if (shaderMode === 'elevation') {
        rgb = rampElev(normH);
      } else if (shaderMode === 'slope') {
        rgb = rampSlope(slope);
      } else {
        const regolith = 0.36 + normH * 0.34;
        rgb = [regolith, regolith * 1.02, regolith * 1.06];
      }
      colors[i * 3] = rgb[0];
      colors[i * 3 + 1] = rgb[1];
      colors[i * 3 + 2] = rgb[2];
    }
    planeGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    planeGeo.computeVertexNormals();

    // Inject animated contour-band shader pulse on top of MeshStandardMaterial
    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.04,
    });
    terrainMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.uniforms.uHeightScale = { value: heightScale };
      terrainMat.userData.shader = shader;

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           varying float vWorldY;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           vWorldY = transformed.y;`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uTime;
           uniform float uHeightScale;
           varying float vWorldY;`
        )
        .replace(
          '#include <dithering_fragment>',
          `
           float normY = clamp(vWorldY / max(0.2, uHeightScale), 0.0, 1.0);
           float contour = abs(fract(normY * 10.0) - 0.5);
           float lineMask = 1.0 - smoothstep(0.0, 0.055, contour);
           float sweepWave = exp(-pow((normY - fract(uTime * 0.14)) * 12.0, 2.0));
           gl_FragColor.rgb += vec3(0.06, 0.32, 0.42) * lineMask * 0.35;
           gl_FragColor.rgb += vec3(0.13, 0.82, 0.93) * sweepWave * 0.24;
           #include <dithering_fragment>
          `
        );
    };

    const terrainMesh = new THREE.Mesh(planeGeo, terrainMat);
    scene.add(terrainMesh);

    // Subtle elevation pedestal grid beneath DEM
    const gridHelper = new THREE.GridHelper(sizeUnits, 12, 0x1e293b, 0x0f172a);
    gridHelper.position.y = -0.05;
    scene.add(gridHelper);

    // Animated Cross-Section Laser Transect Line + Probe Beacon
    const mid = Math.floor(n / 2);
    const transectPts: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const r = transectAxis === 'WE' ? mid : i;
      const c = transectAxis === 'WE' ? i : mid;
      const { elev } = getSample(r, c);
      const normH = (elev - minE) / spanE;
      const x = (c / Math.max(1, n - 1) - 0.5) * sizeUnits;
      const z = (r / Math.max(1, n - 1) - 0.5) * sizeUnits;
      transectPts.push(new THREE.Vector3(x, normH * heightScale + 0.14, z));
    }
    const transectGeo = new THREE.BufferGeometry().setFromPoints(transectPts);
    const transectMat = new THREE.LineBasicMaterial({ color: 0x22d3ee });
    scene.add(new THREE.Line(transectGeo, transectMat));

    const beaconGroup = new THREE.Group();
    const beaconPin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 2.0, 8),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee })
    );
    beaconPin.position.y = 1.0;
    const beaconOrb = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 14, 14),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    beaconOrb.position.y = 2.0;
    beaconGroup.add(beaconPin, beaconOrb);
    scene.add(beaconGroup);

    // 3D Horizon Obstruction Rays
    const horizonGroup = new THREE.Group();
    if (horizon && horizon.bins.length > 0) {
      const centerSample = getSample(mid, mid);
      const centerY = ((centerSample.elev - minE) / spanE) * heightScale + 0.3;
      horizon.bins.forEach((b, idx) => {
        if (idx % 2 !== 0) return;
        const azRad = ((b.azimuthDeg - 90) * Math.PI) / 180;
        const elRad = (b.horizonAngleDeg * Math.PI) / 180;
        const rayLen = 11.2;
        const endX = Math.cos(azRad) * rayLen;
        const endZ = Math.sin(azRad) * rayLen;
        const endY = centerY + Math.tan(Math.max(0, elRad)) * rayLen * 1.4;
        const g = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, centerY, 0),
          new THREE.Vector3(endX, endY, endZ),
        ]);
        const m = new THREE.LineBasicMaterial({
          color: b.obstructed ? 0xf59e0b : 0x334155,
          transparent: true,
          opacity: b.obstructed ? 0.85 : 0.45,
        });
        horizonGroup.add(new THREE.Line(g, m));
      });
    }
    scene.add(horizonGroup);

    let disposed = false;
    let frameId = 0;
    let lastTime = performance.now();
    let elapsed = 0;

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min(0.08, (now - lastTime) / 1000);
      lastTime = now;
      elapsed += dt;

      if (terrainMat.userData.shader) {
        terrainMat.userData.shader.uniforms.uTime.value = elapsed;
      }

      if (shaderMode === 'solar') {
        const sunAng = elapsed * 0.35;
        dirLight.position.set(Math.cos(sunAng) * 24, 9 + Math.sin(sunAng * 0.5) * 4, Math.sin(sunAng) * 24);
      }

      // Update transect probe beacon (tracks cursor or gently sweeps transect)
      const activeT =
        probeRef.current !== null ? probeRef.current : (Math.sin(elapsed * 0.65) + 1) * 0.5;
      const ptIdx = Math.min(
        transectPts.length - 1,
        Math.max(0, Math.round(activeT * (transectPts.length - 1)))
      );
      if (transectPts[ptIdx]) {
        beaconGroup.position.lerp(transectPts[ptIdx], 1 - Math.exp(-10 * dt));
      }

      horizonGroup.visible = showHorizonRef.current;

      if (autoOrbitRef.current) {
        const radius = Math.hypot(camera.position.x, camera.position.z);
        const angle = Math.atan2(camera.position.z, camera.position.x) + dt * 0.14;
        camera.position.x = Math.cos(angle) * radius;
        camera.position.z = Math.sin(angle) * radius;
      }

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
      transectGeo.dispose();
      transectMat.dispose();
      envTex.dispose();
      renderer.dispose();
    };
  }, [dem, horizon, transectAxis, shaderMode, exaggeration, lightweightMode]);

  return (
    <div className="relative bg-[#03060d] border border-slate-800 rounded-md overflow-hidden h-[460px]">
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      {/* Top-left NASA Data Stamp (max 2 elements) */}
      <div className="absolute top-3 left-3 bg-[#060911]/90 border border-slate-800 rounded px-3 py-1.5 text-xs pointer-events-none">
        <div className="font-semibold text-slate-100 flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-cyan-400" />
          Live 3D LOLA Topographic Relief ({exaggeration.toFixed(1)}× Vertical Scale)
        </div>
        <div className="font-mono text-[11px] text-slate-400">
          {dem?.dataAvailable
            ? `${dem.datasetUsed.datasetId} · Contour Sweep & ${transectAxis === 'WE' ? 'W–E' : 'N–S'} Laser Probe`
            : 'Awaiting NASA LOLA DEM...'}
        </div>
      </div>

      {/* Collapsible Bottom Control Dock (<=15% height, no backdrop-filter over WebGL) */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[min(96%,720px)] flex flex-col items-center">
        <button
          onClick={() => setDockCollapsed((v) => !v)}
          className="mb-1 px-2.5 py-0.5 bg-[#0B1120] border border-slate-700 rounded text-[10px] font-mono text-slate-300 hover:text-white"
        >
          {dockCollapsed ? 'Show 3D Terrain Controls' : 'Hide Controls'}
        </button>

        {!dockCollapsed && (
          <div className="w-full bg-[#0B1120] border border-slate-700 rounded-md px-3 py-2 flex flex-wrap items-center justify-center gap-2 text-xs">
            {(
              [
                { id: 'elevation', label: 'Elevation' },
                { id: 'slope', label: 'Slope Hazard' },
                { id: 'solar', label: 'Solar Relief' },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                onClick={() => setShaderMode(m.id)}
                className={`px-2.5 py-1 rounded border ${
                  shaderMode === m.id
                    ? 'bg-cyan-600/25 border-cyan-500 text-cyan-200 font-semibold'
                    : 'bg-[#060911] border-slate-700 text-slate-300'
                }`}
              >
                {m.label}
              </button>
            ))}

            <label className="flex items-center gap-1.5 text-[11px] font-mono text-slate-300 px-2">
              Z-Scale: {exaggeration.toFixed(1)}×
              <input
                type="range"
                min={1}
                max={6}
                step={0.5}
                value={exaggeration}
                onChange={(e) => setExaggeration(Number(e.target.value))}
                className="w-20 accent-cyan-500"
              />
            </label>

            <button
              onClick={() => setShowHorizonRays((s) => !s)}
              className={`px-2.5 py-1 rounded border flex items-center gap-1 ${
                showHorizonRays
                  ? 'bg-amber-600/20 border-amber-500 text-amber-200'
                  : 'bg-[#060911] border-slate-700 text-slate-300'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              Horizon Rays
            </button>

            <button
              onClick={() => setAutoOrbit((a) => !a)}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-200 flex items-center gap-1"
            >
              {autoOrbit ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              {autoOrbit ? 'Pause Orbit' : 'Orbit'}
            </button>

            <button
              onClick={() => resetCamRef.current?.()}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-200"
              aria-label="Reset 3D Terrain Camera"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
