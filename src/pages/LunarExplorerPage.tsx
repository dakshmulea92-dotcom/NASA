import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { motion } from 'motion/react';
import { Eye, EyeOff, Film, Orbit, Pause, Play, RotateCcw, Sun } from 'lucide-react';
import { useLunar } from '../context/LunarContext.tsx';
import { PRESET_LUNAR_SITES } from '../data/lunarCatalog.ts';
import { LunarSiteImageryPanel } from '../components/LunarSiteImageryPanel.tsx';
import {
  applyStudioEnvironment,
  createCalibratedRenderer,
  latLonToVector3,
  vector3ToLatLon,
} from '../utils/threeSetup.ts';
import { validateLunarCoordinate } from '../utils/coordinateFormat.ts';

export const LunarExplorerPage: React.FC = () => {
  const {
    selectedCoord,
    setSelectedCoord,
    settings,
    setCapturedSnapshot,
    setVideoModalOpen,
  } = useLunar();

  const mountRef = useRef<HTMLDivElement | null>(null);
  const [useGridModel, setUseGridModel] = useState(false);
  const [showPins, setShowPins] = useState(true);
  const [showSunModel, setShowSunModel] = useState(true);
  const [liveOrbit, setLiveOrbit] = useState(true);
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [webglLost, setWebglLost] = useState(false);
  const [dockCollapsed, setDockCollapsed] = useState(false);

  const [manualLat, setManualLat] = useState(String(selectedCoord.lat));
  const [manualLon, setManualLon] = useState(String(selectedCoord.lon));
  const [coordError, setCoordError] = useState<string | null>(null);

  const cameraPresetRef = useRef<((lat: number, lon: number, dist?: number) => void) | null>(null);
  const targetMarkerRef = useRef<THREE.Mesh | null>(null);
  const moonRadiusRef = useRef<number>(1.0);
  const requestRenderRef = useRef<(() => void) | null>(null);
  const pinsGroupRef = useRef<THREE.Group | null>(null);
  const sunGroupRef = useRef<THREE.Group | null>(null);
  const liveOrbitRef = useRef<boolean>(true);
  const snapshotFnRef = useRef<(() => string | null) | null>(null);

  useEffect(() => {
    setManualLat(String(selectedCoord.lat));
    setManualLon(String(selectedCoord.lon));
  }, [selectedCoord.lat, selectedCoord.lon]);

  useEffect(() => {
    liveOrbitRef.current = liveOrbit;
    if (liveOrbit) requestRenderRef.current?.();
  }, [liveOrbit]);

  // Update target marker position whenever selectedCoord changes
  useEffect(() => {
    if (targetMarkerRef.current) {
      const r = moonRadiusRef.current * 1.018;
      targetMarkerRef.current.position.copy(latLonToVector3(selectedCoord.lat, selectedCoord.lon, r));
      requestRenderRef.current?.();
    }
  }, [selectedCoord]);

  useEffect(() => {
    if (pinsGroupRef.current) {
      pinsGroupRef.current.visible = showPins;
      requestRenderRef.current?.();
    }
  }, [showPins]);

  useEffect(() => {
    if (sunGroupRef.current) {
      sunGroupRef.current.visible = showSunModel;
      requestRenderRef.current?.();
    }
  }, [showSunModel]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    setModelStatus('loading');
    const { renderer, isSoftwareGl } = createCalibratedRenderer(container, settings.lightweightMode);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglLost(true);
    };
    const onContextRestored = () => setWebglLost(false);
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04070e);
    const envTex = applyStudioEnvironment(renderer, scene);

    const camera = new THREE.PerspectiveCamera(
      42,
      Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
      0.05,
      100
    );
    camera.position.set(0, 0.5, 3.2);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl && !settings.lightweightMode;
    controls.dampingFactor = 0.06;
    controls.minDistance = 1.35;
    controls.maxDistance = 8.0;
    controls.enablePan = false;

    const hemi = new THREE.HemisphereLight(0x8bb4e8, 0x0b1120, 0.35);
    scene.add(hemi);

    const sunLight = new THREE.DirectionalLight(0xfff6e5, 2.45);
    sunLight.position.set(6, 1.5, 5);
    scene.add(sunLight);

    // Starfield
    const starPositions = new Float32Array(700 * 3);
    for (let i = 0; i < 700; i++) {
      const r = 28 + (i % 7) * 2;
      const theta = i * 2.39996;
      const phi = Math.acos(1 - (2 * (i + 0.5)) / 700);
      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.cos(phi);
      starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xcbd5e1, size: 0.08, sizeAttenuation: true });
    scene.add(new THREE.Points(starGeo, starMat));

    const moonRoot = new THREE.Group();
    scene.add(moonRoot);

    const pinsGroup = new THREE.Group();
    pinsGroup.visible = showPins;
    pinsGroupRef.current = pinsGroup;
    scene.add(pinsGroup);

    const sunGroup = new THREE.Group();
    sunGroup.visible = showSunModel;
    sunGroupRef.current = sunGroup;
    scene.add(sunGroup);

    // Animated LRO polar orbital ring & reconnaissance spacecraft blip
    const orbitRingPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      orbitRingPts.push(new THREE.Vector3(Math.cos(a) * 1.16, Math.sin(a) * 1.16, 0));
    }
    const orbitRingGeo = new THREE.BufferGeometry().setFromPoints(orbitRingPts);
    const orbitRingMat = new THREE.LineBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.38,
    });
    const orbitRing = new THREE.LineLoop(orbitRingGeo, orbitRingMat);
    orbitRing.rotation.y = 0.4;
    scene.add(orbitRing);

    const lroGeo = new THREE.OctahedronGeometry(0.022, 0);
    const lroMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const lroProbe = new THREE.Mesh(lroGeo, lroMat);
    scene.add(lroProbe);

    // Target marker + pulsing orbital halo
    const targetGeo = new THREE.SphereGeometry(0.024, 16, 16);
    const targetMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
    const targetMesh = new THREE.Mesh(targetGeo, targetMat);
    targetMarkerRef.current = targetMesh;
    scene.add(targetMesh);

    const haloGeo = new THREE.RingGeometry(0.032, 0.044, 24);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const targetHalo = new THREE.Mesh(haloGeo, haloMat);
    targetMesh.add(targetHalo);

    const clickableMeshes: THREE.Object3D[] = [];
    let disposed = false;
    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let cameraTargetPos: THREE.Vector3 | null = null;
    let lastPerf = performance.now();
    let orbPhase = 0;
    let sunOrbitPhase = 0.68;

    const requestRender = () => {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame((now) => {
        if (disposed) return;
        renderDirty = false;

        const dt = Math.min(0.08, Math.max(0.001, (now - lastPerf) / 1000));
        lastPerf = now;

        let needsMore = false;
        if (cameraTargetPos) {
          const alpha = 1 - Math.exp(-5.5 * dt);
          camera.position.lerp(cameraTargetPos, alpha);
          camera.lookAt(0, 0, 0);
          if (camera.position.distanceTo(cameraTargetPos) < 0.015) {
            camera.position.copy(cameraTargetPos);
            cameraTargetPos = null;
          } else {
            needsMore = true;
          }
        }

        if (liveOrbitRef.current && !isSoftwareGl) {
          orbPhase += dt * 0.55;
          sunOrbitPhase += dt * 0.08;
          // Move LRO spacecraft around polar orbit ring
          const localVec = new THREE.Vector3(
            Math.cos(orbPhase) * 1.16,
            Math.sin(orbPhase) * 1.16,
            0
          ).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.4);
          lroProbe.position.copy(localVec);
          lroProbe.rotation.y += dt * 1.5;

          // Subtle live solar illumination sweep
          const sx = Math.cos(sunOrbitPhase) * 7.2;
          const sz = Math.sin(sunOrbitPhase) * 7.2;
          sunLight.position.set(sx, 1.4, sz);
          sunGroup.position.set(sx * 0.85, 1.2, sz * 0.85);
          sunGroup.rotation.y += dt * 0.25;

          // Pulse halo facing outward
          targetHalo.lookAt(targetMesh.position.clone().multiplyScalar(2));
          const pulse = 1 + Math.sin(now * 0.005) * 0.25;
          targetHalo.scale.setScalar(pulse);
          needsMore = true;
        } else {
          targetHalo.lookAt(targetMesh.position.clone().multiplyScalar(2));
        }

        if (controls.update()) {
          needsMore = true;
        }
        renderer.render(scene, camera);

        const finish = () => {
          renderBusy = false;
          if (renderDirty || needsMore) requestRender();
        };

        if (isSoftwareGl) {
          window.setTimeout(finish, 80);
        } else {
          finish();
        }
      });
    };
    requestRenderRef.current = requestRender;

    snapshotFnRef.current = () => {
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL('image/png');
    };

    controls.addEventListener('change', requestRender);
    controls.addEventListener('start', () => {
      cameraTargetPos = null;
    });

    cameraPresetRef.current = (lat: number, lon: number, dist = 2.65) => {
      cameraTargetPos = latLonToVector3(lat, lon, dist);
      requestRender();
    };

    const loader = new GLTFLoader();
    const moonUrl = useGridModel ? '/models/moon_nasa_grid.glb' : '/models/moon_nasa_lro.glb';

    loader.load(
      moonUrl,
      (gltf) => {
        if (disposed) return;
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const normScale = 2.0 / maxDim;

        model.position.sub(center.multiplyScalar(normScale));
        model.scale.setScalar(normScale);

        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const m = child as THREE.Mesh;
            clickableMeshes.push(m);
            if (m.material && !Array.isArray(m.material)) {
              const std = m.material as THREE.MeshStandardMaterial;
              std.roughness = 0.92;
              std.metalness = 0.02;
              std.envMapIntensity = 0.25;
            }
          }
        });

        moonRoot.add(model);
        moonRadiusRef.current = 1.0;

        targetMesh.position.copy(latLonToVector3(selectedCoord.lat, selectedCoord.lon, 1.018));

        const pinGeo = new THREE.SphereGeometry(0.016, 12, 12);
        PRESET_LUNAR_SITES.forEach((site) => {
          const pinMat = new THREE.MeshBasicMaterial({
            color:
              site.category === 'South Pole' || site.category === 'North Pole'
                ? 0xf59e0b
                : site.category === 'Historical Apollo'
                ? 0x38bdf8
                : 0xe2e8f0,
          });
          const pin = new THREE.Mesh(pinGeo, pinMat);
          pin.position.copy(latLonToVector3(site.lat, site.lon, 1.014));
          pin.userData.site = site;
          pinsGroup.add(pin);
        });

        setModelStatus('ready');
        requestRender();
      },
      undefined,
      () => {
        if (!disposed) setModelStatus('error');
      }
    );

    loader.load('/models/sun_nasa.glb', (gltf) => {
      if (disposed) return;
      const sunModel = gltf.scene;
      const box = new THREE.Box3().setFromObject(sunModel);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      sunModel.scale.setScalar(0.55 / maxDim);
      sunGroup.position.set(5.5, 1.2, 4.6);
      sunGroup.add(sunModel);
      requestRender();
    });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downX = 0;
    let downY = 0;

    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      if (pinsGroup.visible) {
        const pinHits = raycaster.intersectObjects(pinsGroup.children, false);
        if (pinHits.length > 0 && pinHits[0].object.userData.site) {
          const s = pinHits[0].object.userData.site;
          setSelectedCoord({
            lat: s.lat,
            lon: s.lon,
            name: s.name,
            regionType: s.regionType,
            source: s.source,
          });
          return;
        }
      }

      const moonHits = raycaster.intersectObjects(clickableMeshes, false);
      if (moonHits.length > 0) {
        const pt = moonHits[0].point;
        const { lat, lon } = vector3ToLatLon(pt);
        setSelectedCoord({
          lat,
          lon,
          name: `3D Globe Pick (${lat.toFixed(2)}°, ${lon.toFixed(2)}°)`,
          regionType: Math.abs(lat) > 80 ? 'Polar Terrain' : 'Lunar Surface',
          source: 'NASA SVS 14959 LRO 3D Globe',
        });
      }
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);

    const onResize = () => {
      if (!container || disposed) return;
      const w = Math.max(100, container.clientWidth);
      const h = Math.max(100, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    };
    window.addEventListener('resize', onResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);
      controls.dispose();
      envTex.dispose();
      starGeo.dispose();
      starMat.dispose();
      orbitRingGeo.dispose();
      orbitRingMat.dispose();
      lroGeo.dispose();
      lroMat.dispose();
      haloGeo.dispose();
      haloMat.dispose();
      targetGeo.dispose();
      targetMat.dispose();
      renderer.dispose();
    };
  }, [useGridModel, settings.lightweightMode]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const check = validateLunarCoordinate(Number(manualLat), Number(manualLon));
    if (!check.valid || !check.normalized) {
      setCoordError(check.error || 'Invalid coordinate');
      return;
    }
    setCoordError(null);
    setSelectedCoord({
      lat: check.normalized.lat,
      lon: check.normalized.lon,
      name: `Custom Target (${check.normalized.lat.toFixed(2)}°, ${check.normalized.lon.toFixed(2)}°)`,
      source: 'Manual Coordinate Entry',
    });
    cameraPresetRef.current?.(check.normalized.lat, check.normalized.lon, 2.65);
  };

  const handleSnapshotToVideo = () => {
    const dataUrl = snapshotFnRef.current?.();
    if (dataUrl) setCapturedSnapshot(dataUrl);
    setVideoModalOpen(true);
  };

  return (
    <div className="max-w-[1500px] mx-auto grid grid-cols-1 xl:grid-cols-12 gap-5">
      {/* 3D Globe Viewport */}
      <div className="xl:col-span-7 relative bg-[#04070e] border border-slate-800 rounded-md overflow-hidden min-h-[540px] h-[calc(100vh-140px)]">
        <div ref={mountRef} className="w-full h-full cursor-crosshair" />

        {/* Top-left NASA asset attribution */}
        <div className="absolute top-3 left-3 bg-[#060911]/90 border border-slate-800 rounded px-3 py-2 text-xs pointer-events-none">
          <div className="font-semibold text-slate-100 flex items-center gap-2">
            <span>
              NASA SVS 14959 LRO 3D Moon {useGridModel ? '(Coordinate Grid)' : '(Color Mosaic)'}
            </span>
          </div>
          <div className="text-[11px] font-mono text-slate-400">
            Click anywhere on lunar surface · Animated LRO Polar Orbit &amp; Solar Sweep
          </div>
        </div>

        {modelStatus === 'loading' && (
          <div className="absolute inset-0 bg-[#04070e]/90 flex items-center justify-center text-xs font-mono text-cyan-300">
            Loading Official NASA SVS 14959 Moon GLB &amp; Sun GLB...
          </div>
        )}
        {(modelStatus === 'error' || webglLost) && (
          <div className="absolute inset-0 bg-[#04070e]/95 flex flex-col items-center justify-center p-6 text-center gap-2">
            <div className="text-sm font-semibold text-amber-300">3D WebGL Context Interrupted</div>
            <p className="text-xs text-slate-400 max-w-md">
              Enable Lightweight Render Mode in Settings or inspect 2D LOLA elevation maps in Terrain Intelligence.
            </p>
          </div>
        )}

        {/* Unified Bottom Control Dock */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[min(95%,820px)] flex flex-col items-center">
          <button
            onClick={() => setDockCollapsed((c) => !c)}
            className="mb-1 px-3 py-1 bg-[#0B1120] border border-slate-700 rounded text-[11px] font-mono text-slate-300 hover:text-white"
          >
            {dockCollapsed ? 'Show Controls' : 'Hide Controls'}
          </button>

          {!dockCollapsed && (
            <div className="w-full bg-[#0B1120]/95 border border-slate-700 rounded-md px-3 py-2 flex flex-wrap items-center justify-center gap-1.5">
              <button
                onClick={() => cameraPresetRef.current?.(-89.5, 0, 2.4)}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-200 whitespace-nowrap"
              >
                South Pole
              </button>
              <button
                onClick={() => cameraPresetRef.current?.(89.5, 0, 2.4)}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-200 whitespace-nowrap"
              >
                North Pole
              </button>
              <button
                onClick={() => cameraPresetRef.current?.(0, 0, 2.8)}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-200 whitespace-nowrap"
              >
                Near Side
              </button>
              <button
                onClick={() => cameraPresetRef.current?.(0, 180, 2.8)}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-200 whitespace-nowrap"
              >
                Far Side
              </button>
              <button
                onClick={() => setLiveOrbit((o) => !o)}
                className={`px-2.5 py-1.5 rounded text-xs whitespace-nowrap border flex items-center gap-1 ${
                  liveOrbit
                    ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                    : 'bg-slate-800 border-slate-700 text-slate-200'
                }`}
              >
                {liveOrbit ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                <Orbit className="w-3.5 h-3.5" />
                Live Orbit
              </button>
              <button
                onClick={() => setUseGridModel((g) => !g)}
                className={`px-2.5 py-1.5 rounded text-xs whitespace-nowrap border ${
                  useGridModel
                    ? 'bg-cyan-600/20 border-cyan-500 text-cyan-300'
                    : 'bg-slate-800 border-slate-700 text-slate-200'
                }`}
              >
                {useGridModel ? 'Grid: On' : 'Grid: Off'}
              </button>
              <button
                onClick={() => setShowPins((p) => !p)}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-200 flex items-center gap-1 whitespace-nowrap"
              >
                {showPins ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                Sites
              </button>
              <button
                onClick={() => setShowSunModel((s) => !s)}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-200 flex items-center gap-1 whitespace-nowrap"
              >
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                Sun
              </button>
              <button
                onClick={() => cameraPresetRef.current?.(selectedCoord.lat, selectedCoord.lon, 2.4)}
                className="px-2.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 rounded text-xs font-semibold text-slate-950 flex items-center gap-1 whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Focus Target
              </button>
              <button
                onClick={handleSnapshotToVideo}
                className="px-2.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/60 rounded text-xs font-semibold text-amber-300 flex items-center gap-1 whitespace-nowrap"
              >
                <Film className="w-3.5 h-3.5" />
                Animate Frame
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Synchronized Scientific Imagery & Telemetry Panel */}
      <motion.div
        initial={{ opacity: 0, x: 10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.28 }}
        className="xl:col-span-5 space-y-4"
      >
        <LunarSiteImageryPanel />

        {/* Custom Coordinate Entry */}
        <div className="bg-[#0B1120] border border-slate-800 rounded-md p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Jump to Coordinates
          </h3>
          <form onSubmit={handleManualSubmit} className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2.5">
              <label className="text-xs text-slate-400">
                Lat (°)
                <input
                  type="number"
                  step="0.001"
                  value={manualLat}
                  onChange={(e) => setManualLat(e.target.value)}
                  className="mt-1 w-full bg-[#060911] border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono text-slate-100"
                />
              </label>
              <label className="text-xs text-slate-400">
                Lon (°)
                <input
                  type="number"
                  step="0.001"
                  value={manualLon}
                  onChange={(e) => setManualLon(e.target.value)}
                  className="mt-1 w-full bg-[#060911] border border-slate-700 rounded px-2.5 py-1.5 text-xs font-mono text-slate-100"
                />
              </label>
            </div>
            {coordError && <div className="text-xs text-rose-400">{coordError}</div>}
            <button
              type="submit"
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-100 rounded"
            >
              Navigate Globe &amp; Update Imagery / Telemetry
            </button>
          </form>
        </div>

        {/* NASA Asset Provenance */}
        <div className="bg-[#0B1120] border border-slate-800 rounded-md p-4 space-y-1.5 text-xs text-slate-400">
          <div className="font-semibold text-slate-200">Integrated NASA Assets &amp; Sensors</div>
          <div>Optical Photo: NASA LRO WAC Global Mosaic (303 ppd, 100 m/px)</div>
          <div>Radio Frequency: NASA LRO Mini-RF 2.38 GHz S-Band SAR (S1 &amp; CPR)</div>
          <div>3D Globe &amp; Sun: NASA SVS #14959 Moon GLB &amp; Science Sun GLB</div>
          <div className="text-[11px] font-mono text-slate-500">
            Pins: Amber = Polar · Cyan = Apollo · White = Major Craters
          </div>
        </div>
      </motion.div>
    </div>
  );
};
