import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Flame, Pause, Play, RotateCcw, Sun } from 'lucide-react';
import type { DemGridResult } from '../types/lunar.ts';
import {
  afterWebGLDraw,
  applyStudioEnvironment,
  createCalibratedRenderer,
} from '../utils/threeSetup.ts';

interface LiveEnvironmentStage3DProps {
  dem: DemGridResult | null;
  solarElevationDeg: number;
  solarAzimuthDeg: number;
  isShadowed: boolean;
  thermalView: boolean;
  playing: boolean;
  onToggleThermal: () => void;
  onTogglePlay: () => void;
  lightweightMode: boolean;
}

function buildEnvironmentalStation(): THREE.Group {
  const g = new THREE.Group();
  const foilMat = new THREE.MeshStandardMaterial({ color: 0xe0a124, metalness: 0.85, roughness: 0.28 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.65, roughness: 0.38 });
  const solarMat = new THREE.MeshStandardMaterial({ color: 0x0f2d56, metalness: 0.45, roughness: 0.2 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.6, roughness: 0.5 });

  // Octagonal thermal lander bus
  const bus = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.52, 0.42, 8), foilMat);
  bus.position.y = 0.48;
  bus.castShadow = true;
  g.add(bus);

  // 4 landing struts
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.62, 8), darkMat);
    leg.position.set(Math.cos(a) * 0.56, 0.25, Math.sin(a) * 0.56);
    leg.rotation.z = Math.cos(a) * 0.55;
    leg.rotation.x = -Math.sin(a) * 0.55;
    leg.castShadow = true;
    g.add(leg);

    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.04, 10), foilMat);
    pad.position.set(Math.cos(a) * 0.76, 0.02, Math.sin(a) * 0.76);
    g.add(pad);
  }

  // Diviner IR radiometer mast + CRaTER dosimeter dome
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.85, 8), frameMat);
  mast.position.set(0, 1.05, 0.18);
  mast.castShadow = true;
  g.add(mast);

  const sensorHead = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.16), frameMat);
  sensorHead.position.set(0, 1.48, 0.2);
  g.add(sensorHead);

  const craterDome = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 12), frameMat);
  craterDome.position.set(-0.22, 0.76, -0.18);
  g.add(craterDome);

  // Dual articulated solar wings
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.03, 0.36), solarMat);
    wing.position.set(side * 0.98, 0.62, 0);
    wing.rotation.x = 0.25;
    wing.castShadow = true;
    g.add(wing);
  }

  return g;
}

/**
 * Thermal color ramp from cryogenic PSR indigo (40 K) -> neutral slate (200 K) -> hot sunlit orange (395 K)
 */
function thermalRgb(tempK: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, (tempK - 40) / 355));
  if (t < 0.35) {
    const k = t / 0.35;
    return [0.08 + k * 0.12, 0.12 + k * 0.28, 0.45 + k * 0.38];
  }
  if (t < 0.7) {
    const k = (t - 0.35) / 0.35;
    return [0.2 + k * 0.68, 0.4 + k * 0.25, 0.83 - k * 0.63];
  }
  const k = (t - 0.7) / 0.3;
  return [0.88 + k * 0.12, 0.65 - k * 0.42, 0.2 - k * 0.12];
}

export const LiveEnvironmentStage3D: React.FC<LiveEnvironmentStage3DProps> = ({
  dem,
  solarElevationDeg,
  solarAzimuthDeg,
  isShadowed,
  thermalView,
  playing,
  onToggleThermal,
  onTogglePlay,
  lightweightMode,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const solarStateRef = useRef({ el: solarElevationDeg, az: solarAzimuthDeg, shadowed: isShadowed, thermal: thermalView });
  const resetCamRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    solarStateRef.current = {
      el: solarElevationDeg,
      az: solarAzimuthDeg,
      shadowed: isShadowed,
      thermal: thermalView,
    };
  }, [solarElevationDeg, solarAzimuthDeg, isShadowed, thermalView]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const { renderer, isSoftwareGl } = createCalibratedRenderer(container, lightweightMode);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x03050b);
    const envTex = applyStudioEnvironment(renderer, scene);

    const camera = new THREE.PerspectiveCamera(
      44,
      Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
      0.1,
      200
    );
    camera.position.set(13.5, 9.5, 14.5);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl && !lightweightMode;
    controls.dampingFactor = 0.06;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.minDistance = 6;
    controls.maxDistance = 32;

    resetCamRef.current = () => {
      camera.position.set(13.5, 9.5, 14.5);
      controls.target.set(0, 0.8, 0);
      controls.update();
    };

    // Subtle cosmic fill so shadowed crater interiors remain legible
    scene.add(new THREE.HemisphereLight(0x475569, 0x050811, 0.25));

    const sunLight = new THREE.DirectionalLight(0xfff6e5, 2.6);
    sunLight.castShadow = !isSoftwareGl && !lightweightMode;
    sunLight.shadow.mapSize.set(1024, 1024);
    sunLight.shadow.camera.near = 2;
    sunLight.shadow.camera.far = 60;
    const d = 14;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    scene.add(sunLight);

    // Visible glowing Sun orb on sky dome
    const sunOrb = new THREE.Mesh(
      new THREE.SphereGeometry(0.65, 18, 18),
      new THREE.MeshBasicMaterial({ color: 0xfef08a })
    );
    scene.add(sunOrb);

    // Build LOLA DEM relief surface
    const n = dem?.dataAvailable ? Math.min(49, dem.gridSize) : 29;
    const planeGeo = new THREE.PlaneGeometry(22, 22, n - 1, n - 1);
    planeGeo.rotateX(-Math.PI / 2);
    const posAttr = planeGeo.attributes.position;
    const minE = dem?.minElevationM ?? -400;
    const spanE = Math.max(80, (dem?.maxElevationM ?? 400) - minE);

    const sampleH = (r: number, c: number) => {
      if (!dem?.dataAvailable) return 0;
      const sr = Math.min(dem.gridSize - 1, Math.round((r / Math.max(1, n - 1)) * (dem.gridSize - 1)));
      const sc = Math.min(dem.gridSize - 1, Math.round((c / Math.max(1, n - 1)) * (dem.gridSize - 1)));
      const el = dem.elevationsMeters[sr]?.[sc] ?? minE;
      return ((el - minE) / spanE) * 2.8;
    };

    for (let i = 0; i < posAttr.count; i++) {
      const r = Math.floor(i / n);
      const c = i % n;
      posAttr.setY(i, sampleH(r, c));
    }
    planeGeo.computeVertexNormals();

    const normAttr = planeGeo.attributes.normal;
    const colors = new Float32Array(posAttr.count * 3);
    planeGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.93,
      metalness: 0.02,
    });
    const terrainMesh = new THREE.Mesh(planeGeo, terrainMat);
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);

    const station = buildEnvironmentalStation();
    const mid = Math.floor(n / 2);
    station.position.set(0, sampleH(mid, mid), 0);
    scene.add(station);

    const sunVec = new THREE.Vector3();
    const vNorm = new THREE.Vector3();

    const updateDynamicLightingAndThermal = () => {
      const { el, az, shadowed, thermal } = solarStateRef.current;
      const elRad = (Math.max(-15, el) * Math.PI) / 180;
      const azRad = ((az - 90) * Math.PI) / 180;
      const rSky = 22;

      const sx = rSky * Math.cos(elRad) * Math.cos(azRad);
      const sy = rSky * Math.sin(elRad);
      const sz = rSky * Math.cos(elRad) * Math.sin(azRad);

      sunOrb.position.set(sx, sy, sz);
      sunOrb.visible = el > -6;
      sunLight.position.set(sx, Math.max(0.4, sy), sz);
      sunLight.intensity = el <= 0 || shadowed ? 0.25 : 2.6;

      sunVec.set(sx, sy, sz).normalize();

      const colAttr = planeGeo.attributes.color as THREE.BufferAttribute;
      for (let i = 0; i < posAttr.count; i++) {
        vNorm.set(normAttr.getX(i), normAttr.getY(i), normAttr.getZ(i)).normalize();
        const cosInc = el > 0 ? Math.max(0, vNorm.dot(sunVec)) : 0;

        if (thermal) {
          // Physics-derived Stefan-Boltzmann vertex temperature estimate
          const tempK = cosInc > 0.01 ? Math.pow((0.88 * 1361 * cosInc) / (0.95 * 5.670374e-8), 0.25) : 68;
          const [r, g, b] = thermalRgb(tempK);
          colAttr.setXYZ(i, r, g, b);
        } else {
          const base = 0.34 + (posAttr.getY(i) / 2.8) * 0.25;
          colAttr.setXYZ(i, base, base * 1.01, base * 1.04);
        }
      }
      colAttr.needsUpdate = true;
    };

    let disposed = false;
    let frameId = 0;

    const tick = () => {
      if (disposed) return;
      updateDynamicLightingAndThermal();
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
      envTex.dispose();
      renderer.dispose();
    };
  }, [dem, lightweightMode]);

  return (
    <div className="relative bg-[#03050b] border border-slate-800 rounded-md overflow-hidden h-[430px]">
      <div ref={mountRef} className="w-full h-full cursor-grab active:cursor-grabbing" />

      <div className="absolute top-3 left-3 bg-[#060911]/90 border border-slate-800 rounded px-3 py-1.5 text-xs pointer-events-none">
        <div className="font-semibold text-slate-100 flex items-center gap-1.5">
          <Sun className="w-3.5 h-3.5 text-amber-400" />
          Live 3D Solar Terminator &amp; Radiative Regolith Stage
        </div>
        <div className="font-mono text-[11px] text-slate-400">
          Sun El {solarElevationDeg.toFixed(2)}° · Az {solarAzimuthDeg.toFixed(1)}° ·{' '}
          {thermalView ? 'Thermal IR Emission Overlay' : 'Natural Albedo + Shadows'}
        </div>
      </div>

      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-[#0B1120] border border-slate-700 rounded-md px-3 py-1.5 flex items-center gap-2 text-xs">
        <button
          onClick={onTogglePlay}
          className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-semibold rounded flex items-center gap-1"
        >
          {playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          {playing ? 'Pause Cycle' : 'Animate Sun Cycle'}
        </button>
        <button
          onClick={onToggleThermal}
          className={`px-2.5 py-1 rounded border flex items-center gap-1 ${
            thermalView
              ? 'bg-amber-600/25 border-amber-500 text-amber-200 font-semibold'
              : 'bg-[#060911] border-slate-700 text-slate-300'
          }`}
        >
          <Flame className="w-3.5 h-3.5" />
          {thermalView ? 'Thermal IR: ON' : 'Thermal IR View'}
        </button>
        <button
          onClick={() => resetCamRef.current?.()}
          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-200"
          aria-label="Reset Environment Camera"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
