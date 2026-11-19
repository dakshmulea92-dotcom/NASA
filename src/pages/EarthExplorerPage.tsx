/// <reference types="google.maps" />
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useMap,
} from '@vis.gl/react-google-maps';
import {
  AlertTriangle,
  Building2,
  ChevronLeft,
  ChevronRight,
  CloudRain,
  Compass,
  ExternalLink,
  Flame,
  Globe,
  MapPin,
  Pause,
  Play,
  Wind,
} from 'lucide-react';
import { LAUNCH_FACILITIES } from '../data/lunarCatalog.ts';
import type { LaunchFacility, NasaEonetResponse, NasaPowerWeather } from '../types/lunar.ts';
import { useLunar } from '../context/LunarContext.tsx';
import {
  applyStudioEnvironment,
  createCalibratedRenderer,
  latLonToVector3,
} from '../utils/threeSetup.ts';
import { formatInEarthTimezone } from '../utils/coordinateFormat.ts';

interface FacilityStory {
  headline: string;
  era: string;
  narrative: string;
  azimuthDeg: number;
}

const FACILITY_STORIES: Record<string, FacilityStory> = {
  ksc: {
    headline: 'Chapter 1 · Apollo & Artemis Deep-Space Gateway',
    era: '1967 – Present',
    narrative:
      'Pad 39A and 39B launched Apollo 11 to the Moon and now anchor NASA Artemis SLS missions over the Atlantic corridor.',
    azimuthDeg: 90,
  },
  ccsf: {
    headline: 'Chapter 2 · Commercial Lunar Payload Range',
    era: '1950 – Present',
    narrative:
      'Eastern Range pads support CLPS robotic lunar landers and deep-space transfer trajectories eastward across the Atlantic.',
    azimuthDeg: 95,
  },
  vandenberg: {
    headline: 'Chapter 3 · Western Range Polar Orbit Corridor',
    era: '1958 – Present',
    narrative:
      'Coastal terrain permits southward polar and sun-synchronous trajectories over the Pacific without overflying populated land.',
    azimuthDeg: 175,
  },
  wallops: {
    headline: 'Chapter 4 · Mid-Atlantic Lunar Reconnaissance Gate',
    era: '1945 – Present',
    narrative:
      'NASA Goddard’s Wallops Island facility launched LADEE directly into lunar orbit to sample the Moon’s tenuous exosphere.',
    azimuthDeg: 112,
  },
  sdsc: {
    headline: 'Chapter 5 · Bay of Bengal Lunar Port (ISRO)',
    era: '1971 – Present (Non-NASA)',
    narrative:
      'Sriharikota barrier island hosted Chandrayaan-1, 2, and 3—delivering the first soft landing near the lunar south polar region.',
    azimuthDeg: 108,
  },
  csg: {
    headline: 'Chapter 6 · Equatorial Velocity Advantage (ESA/CNES)',
    era: '1968 – Present (Non-NASA)',
    narrative:
      'At 5.2°N latitude, Kourou captures +463 m/s of Earth rotational velocity boost for deep-space and trans-lunar injections.',
    azimuthDeg: 75,
  },
  baikonur: {
    headline: 'Chapter 7 · Historic Steppe Lunar Heritage',
    era: '1957 – Present (Non-NASA)',
    narrative:
      'Site of the first artificial satellite and early Luna probes; inland downrange corridors dictate higher 51.6°+ inclinations.',
    azimuthDeg: 65,
  },
  tanegashima: {
    headline: 'Chapter 8 · Precision Lunar Landing Corridor (JAXA)',
    era: '1969 – Present (Non-NASA)',
    narrative:
      'Southern Kyushu island spaceport that launched Kaguya (SELENE) and the pinpoint SLIM lunar lander.',
    azimuthDeg: 110,
  },
};

function haversineEarthKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function destinationPoint(lat: number, lon: number, bearingDeg: number, distKm: number) {
  const R = 6371;
  const brng = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const d = distKm / R;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng)
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );
  return {
    lat: (lat2 * 180) / Math.PI,
    lng: (((lon2 * 180) / Math.PI + 540) % 360) - 180,
  };
}

/**
 * Renders an imperative Launch Corridor Polyline and smooth camera fly-to inside <GoogleMap>.
 */
const MapStoryController: React.FC<{
  facility: LaunchFacility;
  azimuthDeg: number;
}> = ({ facility, azimuthDeg }) => {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    map.panTo({ lat: facility.lat, lng: facility.lon });
  }, [map, facility.id, facility.lat, facility.lon]);

  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps) return;
    const endPt = destinationPoint(facility.lat, facility.lon, azimuthDeg, 350);
    const midPt = destinationPoint(facility.lat, facility.lon, azimuthDeg, 175);
    const line = new google.maps.Polyline({
      path: [{ lat: facility.lat, lng: facility.lon }, midPt, endPt],
      geodesic: true,
      strokeColor: facility.isNasaFacility ? '#22d3ee' : '#f59e0b',
      strokeOpacity: 0.9,
      strokeWeight: 3,
      map,
    });
    return () => {
      line.setMap(null);
    };
  }, [map, facility.lat, facility.lon, facility.isNasaFacility, azimuthDeg]);

  return null;
};

const FacilityAdvancedMarker: React.FC<{
  facility: LaunchFacility;
  selected: boolean;
  onSelect: (fac: LaunchFacility, marker: google.maps.marker.AdvancedMarkerElement | null) => void;
}> = ({ facility, selected, onSelect }) => {
  const [markerRef, marker] = useAdvancedMarkerRef();
  return (
    <AdvancedMarker
      ref={markerRef}
      position={{ lat: facility.lat, lng: facility.lon }}
      zIndex={selected ? 1000 : facility.isNasaFacility ? 200 : 100}
      onClick={() => onSelect(facility, marker)}
      title={facility.name}
    >
      <Pin
        background={selected ? '#22d3ee' : facility.isNasaFacility ? '#0284c7' : '#d97706'}
        borderColor="#060911"
        glyphColor="#060911"
        scale={selected ? 1.25 : 0.95}
      />
    </AdvancedMarker>
  );
};

export const EarthExplorerPage: React.FC = () => {
  const { settings } = useLunar();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const cameraTargetRef = useRef<((lat: number, lon: number) => void) | null>(null);

  const [chapterIdx, setChapterIdx] = useState(0);
  const [storyPlaying, setStoryPlaying] = useState(false);
  const [viewLayout, setViewLayout] = useState<'split' | 'maps' | 'globe'>('split');
  const [mapTypeId, setMapTypeId] = useState<'hybrid' | 'satellite' | 'terrain'>('hybrid');

  const [mapsApiKey, setMapsApiKey] = useState<string>(
    () => (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || ''
  );
  const [mapsKeyChecked, setMapsKeyChecked] = useState(false);
  const [infoAnchor, setInfoAnchor] =
    useState<google.maps.marker.AdvancedMarkerElement | null>(null);
  const [infoFacility, setInfoFacility] = useState<LaunchFacility | null>(null);

  const [powerData, setPowerData] = useState<NasaPowerWeather | null>(null);
  const [loadingPower, setLoadingPower] = useState(false);
  const [eonetData, setEonetData] = useState<NasaEonetResponse | null>(null);
  const [earthLoaded, setEarthLoaded] = useState(false);

  const selectedFacility = LAUNCH_FACILITIES[chapterIdx] || LAUNCH_FACILITIES[0];
  const story = FACILITY_STORIES[selectedFacility.id] || {
    headline: selectedFacility.name,
    era: 'Active Launch Complex',
    narrative: selectedFacility.description,
    azimuthDeg: 90,
  };

  // Resolve Google Maps API Key cleanly from env or server config
  useEffect(() => {
    if (mapsApiKey && !mapsApiKey.startsWith('MY_')) {
      setMapsKeyChecked(true);
      return;
    }
    fetch('/api/maps/config')
      .then((r) => r.json())
      .then((d: { hasKey?: boolean; apiKey?: string }) => {
        if (d.hasKey && d.apiKey) setMapsApiKey(d.apiKey);
        setMapsKeyChecked(true);
      })
      .catch(() => setMapsKeyChecked(true));
  }, [mapsApiKey]);

  // Fetch NASA EONET live Earth Observatory active natural events
  useEffect(() => {
    fetch('/api/earth/eonet')
      .then((r) => r.json())
      .then((d: NasaEonetResponse) => setEonetData(d))
      .catch(() => setEonetData(null));
  }, []);

  // Fetch NASA POWER reanalysis meteorology for selected facility
  useEffect(() => {
    setLoadingPower(true);
    fetch(`/api/earth/power/${encodeURIComponent(selectedFacility.id)}`)
      .then((r) => r.json())
      .then((d: NasaPowerWeather) => {
        setPowerData(d);
        setLoadingPower(false);
      })
      .catch(() => {
        setPowerData(null);
        setLoadingPower(false);
      });
    cameraTargetRef.current?.(selectedFacility.lat, selectedFacility.lon);
  }, [selectedFacility.id, selectedFacility.lat, selectedFacility.lon]);

  // Guided Story Tour auto-advance
  useEffect(() => {
    if (!storyPlaying) return;
    const id = window.setInterval(() => {
      setChapterIdx((prev) => (prev + 1) % LAUNCH_FACILITIES.length);
    }, 6500);
    return () => window.clearInterval(id);
  }, [storyPlaying]);

  // Nearest active NASA EONET Earth Observatory events to current launch pad
  const nearestEonetEvents = useMemo(() => {
    if (!eonetData?.available || !eonetData.events.length) return [];
    return [...eonetData.events]
      .map((ev) => ({
        ...ev,
        distKm: Math.round(
          haversineEarthKm(selectedFacility.lat, selectedFacility.lon, ev.lat, ev.lon)
        ),
      }))
      .sort((a, b) => a.distKm - b.distKm)
      .slice(0, 4);
  }, [eonetData, selectedFacility.lat, selectedFacility.lon]);

  // Mount 3D NASA Earth GLB (/models/earth_nasa.glb) with orbital launch arc
  useEffect(() => {
    const container = mountRef.current;
    if (!container || viewLayout === 'maps') return;

    const { renderer, isSoftwareGl } = createCalibratedRenderer(container, settings.lightweightMode);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04070e);
    const envTex = applyStudioEnvironment(renderer, scene);

    const camera = new THREE.PerspectiveCamera(
      40,
      Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight),
      0.05,
      100
    );
    camera.position.set(1.8, 1.0, 2.4);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl && !settings.lightweightMode;
    controls.minDistance = 1.45;
    controls.maxDistance = 6.5;
    controls.enablePan = false;

    scene.add(new THREE.HemisphereLight(0xa5d8ff, 0x0b1120, 0.55));
    const sunLight = new THREE.DirectionalLight(0xfff8eb, 2.3);
    sunLight.position.set(5, 2, 4);
    scene.add(sunLight);

    const markersGroup = new THREE.Group();
    scene.add(markersGroup);
    const arcGroup = new THREE.Group();
    scene.add(arcGroup);

    let disposed = false;
    let frameId = 0;
    let camTarget: THREE.Vector3 | null = null;
    let satAngle = 0;

    const rebuildArc = (fac: LaunchFacility) => {
      while (arcGroup.children.length > 0) {
        const ch = arcGroup.children[0] as THREE.Object3D;
        arcGroup.remove(ch);
      }
      const p0 = latLonToVector3(fac.lat, fac.lon, 1.02);
      const down = destinationPoint(fac.lat, fac.lon, FACILITY_STORIES[fac.id]?.azimuthDeg ?? 90, 2800);
      const p2 = latLonToVector3(down.lat, down.lng, 1.24);
      const pMid = p0.clone().add(p2).multiplyScalar(0.5).normalize().multiplyScalar(1.25);
      const curve = new THREE.QuadraticBezierCurve3(p0, pMid, p2);
      const pts = curve.getPoints(36);
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const lineMat = new THREE.LineBasicMaterial({
        color: fac.isNasaFacility ? 0x22d3ee : 0xf59e0b,
      });
      arcGroup.add(new THREE.Line(lineGeo, lineMat));
    };

    cameraTargetRef.current = (lat: number, lon: number) => {
      camTarget = latLonToVector3(lat, lon, 2.55);
      const match = LAUNCH_FACILITIES.find(
        (f) => Math.abs(f.lat - lat) < 0.01 && Math.abs(f.lon - lon) < 0.01
      );
      if (match) rebuildArc(match);
    };

    const loader = new GLTFLoader();
    loader.load('/models/earth_nasa.glb', (gltf) => {
      if (disposed) return;
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const s = 2.0 / maxDim;
      model.position.sub(center.multiplyScalar(s));
      model.scale.setScalar(s);
      scene.add(model);

      const pinGeo = new THREE.SphereGeometry(0.025, 14, 14);
      LAUNCH_FACILITIES.forEach((fac, idx) => {
        const mat = new THREE.MeshBasicMaterial({
          color: fac.isNasaFacility ? 0x22d3ee : 0xf59e0b,
        });
        const pin = new THREE.Mesh(pinGeo, mat);
        pin.position.copy(latLonToVector3(fac.lat, fac.lon, 1.02));
        pin.userData.facilityIdx = idx;
        markersGroup.add(pin);
      });

      rebuildArc(selectedFacility);
      setEarthLoaded(true);
      camTarget = latLonToVector3(selectedFacility.lat, selectedFacility.lon, 2.55);
    });

    const satDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    scene.add(satDot);

    let lastTime = performance.now();
    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min(0.08, (now - lastTime) / 1000);
      lastTime = now;

      if (camTarget) {
        const alpha = 1 - Math.exp(-5.5 * dt);
        camera.position.lerp(camTarget, alpha);
        camera.lookAt(0, 0, 0);
        if (camera.position.distanceTo(camTarget) < 0.02) {
          camera.position.copy(camTarget);
          camTarget = null;
        }
      }

      // Orbiting telemetry relay indicator
      satAngle += dt * 0.45;
      satDot.position.set(Math.cos(satAngle) * 1.18, Math.sin(satAngle * 0.7) * 0.45, Math.sin(satAngle) * 1.18);

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        frameId = window.setTimeout(() => requestAnimationFrame(tick), 75);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };
    tick();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const onPointerUp = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(markersGroup.children, false);
      if (hits.length > 0 && typeof hits[0].object.userData.facilityIdx === 'number') {
        setChapterIdx(hits[0].object.userData.facilityIdx);
      }
    };
    renderer.domElement.addEventListener('pointerup', onPointerUp);

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
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      controls.dispose();
      envTex.dispose();
      renderer.dispose();
    };
  }, [settings.lightweightMode, viewLayout]);

  const handleMarkerClick = useCallback(
    (fac: LaunchFacility, marker: google.maps.marker.AdvancedMarkerElement | null) => {
      const idx = LAUNCH_FACILITIES.findIndex((f) => f.id === fac.id);
      if (idx >= 0) setChapterIdx(idx);
      setInfoFacility(fac);
      setInfoAnchor(marker);
    },
    []
  );

  const localNow = formatInEarthTimezone(new Date().toISOString(), selectedFacility.timezone);

  return (
    <div className="max-w-[1540px] mx-auto space-y-5">
      {/* Earth Location Story Tour Header */}
      <section className="bg-[#0B1120] border border-slate-800 rounded-md p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="text-xs font-mono text-cyan-400">
            EARTH LOCATION STORY VIEW · GOOGLE MAPS PLATFORM + NASA 3D EARTH + POWER + EONET
          </div>
          <h2 className="text-lg font-display font-bold text-slate-100">{story.headline}</h2>
          <p className="text-xs text-slate-300 max-w-3xl">{story.narrative}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={() =>
              setChapterIdx((i) => (i - 1 + LAUNCH_FACILITIES.length) % LAUNCH_FACILITIES.length)
            }
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded text-slate-200"
            aria-label="Previous Story Chapter"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setStoryPlaying((p) => !p)}
            className="px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-semibold text-xs rounded flex items-center gap-1.5"
          >
            {storyPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {storyPlaying ? 'Pause Story Tour' : 'Play Story Tour'}
          </button>
          <button
            onClick={() => setChapterIdx((i) => (i + 1) % LAUNCH_FACILITIES.length)}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded text-slate-200"
            aria-label="Next Story Chapter"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <div className="flex items-center bg-[#060911] border border-slate-800 rounded p-0.5 text-xs ml-1">
            {(
              [
                { id: 'split', label: 'Split Story' },
                { id: 'maps', label: 'Google Maps' },
                { id: 'globe', label: '3D NASA Earth' },
              ] as const
            ).map((v) => (
              <button
                key={v.id}
                onClick={() => setViewLayout(v.id)}
                className={`px-2.5 py-1 rounded ${
                  viewLayout === v.id ? 'bg-slate-700 text-white font-semibold' : 'text-slate-400'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Main Synchronized Dual Viewports + Telemetry Panel */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Left Viewports: Google Maps Platform Satellite + NASA 3D Earth */}
        <div
          className={`xl:col-span-7 grid gap-4 ${
            viewLayout === 'split' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'
          }`}
        >
          {/* Google Maps Platform Interactive Launchpad & EONET Map */}
          {viewLayout !== 'globe' && (
            <div className="relative bg-[#04070e] border border-slate-800 rounded-md overflow-hidden h-[480px]">
              {mapsApiKey ? (
                <APIProvider
                  apiKey={mapsApiKey}
                  libraries={['marker']}
                  language="en"
                  region="US"
                >
                  <GoogleMap
                    mapId="DEMO_MAP_ID"
                    defaultCenter={{ lat: selectedFacility.lat, lng: selectedFacility.lon }}
                    defaultZoom={8}
                    mapTypeId={mapTypeId}
                    gestureHandling="greedy"
                    internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                    style={{ width: '100%', height: '100%' }}
                  >
                    <MapStoryController
                      facility={selectedFacility}
                      azimuthDeg={story.azimuthDeg}
                    />

                    {LAUNCH_FACILITIES.map((fac) => (
                      <FacilityAdvancedMarker
                        key={fac.id}
                        facility={fac}
                        selected={fac.id === selectedFacility.id}
                        onSelect={handleMarkerClick}
                      />
                    ))}

                    {eonetData?.available &&
                      eonetData.events.slice(0, 15).map((ev) => (
                        <AdvancedMarker
                          key={ev.id}
                          position={{ lat: ev.lat, lng: ev.lon }}
                          title={`NASA EONET: ${ev.title} (${ev.category})`}
                        >
                          <div className="w-3.5 h-3.5 rounded-full bg-rose-500 border-2 border-white shadow" />
                        </AdvancedMarker>
                      ))}

                    {infoFacility && infoAnchor && (
                      <InfoWindow
                        anchor={infoAnchor}
                        onCloseClick={() => setInfoAnchor(null)}
                      >
                        <div className="text-slate-900 p-1 max-w-[230px] space-y-1">
                          <div className="font-bold text-xs">{infoFacility.name}</div>
                          <div className="text-[11px] text-slate-600">{infoFacility.operator}</div>
                          <div className="text-[11px] font-mono">
                            {infoFacility.lat.toFixed(3)}°, {infoFacility.lon.toFixed(3)}° · Az{' '}
                            {infoFacility.supportedAzimuths}
                          </div>
                        </div>
                      </InfoWindow>
                    )}
                  </GoogleMap>
                </APIProvider>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-xs text-slate-400 space-y-2">
                  <MapPin className="w-6 h-6 text-cyan-400" />
                  <div className="font-semibold text-slate-200">
                    {mapsKeyChecked
                      ? 'Google Maps Key Pending Runtime Reload'
                      : 'Loading Google Maps Platform...'}
                  </div>
                  <p className="max-w-xs">
                    Ensure VITE_GOOGLE_MAPS_API_KEY is available in the applet environment to view live Google Maps satellite terrain.
                  </p>
                </div>
              )}

              <div className="absolute top-3 left-3 bg-[#060911]/90 border border-slate-700 rounded px-2.5 py-1.5 text-[11px] flex items-center gap-2 z-10">
                <span className="font-semibold text-slate-100">Google Maps Launch Range</span>
                <select
                  value={mapTypeId}
                  onChange={(e) => setMapTypeId(e.target.value as 'hybrid' | 'satellite' | 'terrain')}
                  className="bg-[#0B1120] border border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-cyan-300"
                >
                  <option value="hybrid">Hybrid</option>
                  <option value="satellite">Satellite</option>
                  <option value="terrain">Terrain</option>
                </select>
              </div>
            </div>
          )}

          {/* NASA 3D Earth GLB Viewport */}
          {viewLayout !== 'maps' && (
            <div className="relative bg-[#04070e] border border-slate-800 rounded-md overflow-hidden h-[480px]">
              <div ref={mountRef} className="w-full h-full" />
              <div className="absolute top-3 left-3 bg-[#060911]/90 border border-slate-800 rounded px-3 py-1.5 text-xs pointer-events-none">
                <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-cyan-400" />
                  NASA 3D Earth (Earth_1_12756.glb)
                </div>
                <div className="text-[10px] font-mono text-slate-400">
                  Arc = Downrange Azimuth {story.azimuthDeg}° · Orbiting Relay
                </div>
              </div>
              {!earthLoaded && (
                <div className="absolute inset-0 bg-[#04070e]/90 flex items-center justify-center text-xs font-mono text-cyan-300">
                  Loading Official NASA Earth 3D GLB...
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Telemetry Stack: Chapter Picker + Live NASA POWER + Live NASA EONET */}
        <div className="xl:col-span-5 space-y-4">
          {/* Facility Selector */}
          <div className="bg-[#0B1120] border border-slate-800 rounded-md p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-cyan-400" />
                Launch Facilities ({chapterIdx + 1}/{LAUNCH_FACILITIES.length})
              </h3>
              <span className="text-[11px] font-mono text-slate-400">{story.era}</span>
            </div>

            <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto pr-1">
              {LAUNCH_FACILITIES.map((fac, idx) => {
                const active = idx === chapterIdx;
                return (
                  <button
                    key={fac.id}
                    onClick={() => {
                      setStoryPlaying(false);
                      setChapterIdx(idx);
                    }}
                    className={`text-left p-2 rounded border text-xs transition-colors ${
                      active
                        ? 'bg-cyan-950/45 border-cyan-500 text-slate-100'
                        : 'bg-[#060911] border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="font-semibold truncate">{fac.name.split('(')[0].trim()}</div>
                    <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                      {fac.country} · {fac.isNasaFacility ? 'NASA' : 'Non-NASA'}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="pt-2.5 border-t border-slate-800 space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-100">{selectedFacility.name}</span>
                <span
                  className={`font-mono text-[11px] ${
                    selectedFacility.isNasaFacility ? 'text-cyan-300' : 'text-amber-300'
                  }`}
                >
                  {selectedFacility.isNasaFacility ? 'NASA Facility' : 'Non-NASA Spaceport'}
                </span>
              </div>
              <div className="font-mono text-[11px] text-slate-400 flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-cyan-400" />
                {selectedFacility.lat.toFixed(4)}°, {selectedFacility.lon.toFixed(4)}° · Elev{' '}
                {selectedFacility.elevationM} m · Azimuth {selectedFacility.supportedAzimuths}
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                Local Time: {localNow.localFormatted} ({localNow.tzAbbr}) · Source:{' '}
                {selectedFacility.officialSource}
              </div>
            </div>
          </div>

          {/* NASA POWER Reanalysis Environmental Panel */}
          <div className="bg-[#0B1120] border border-slate-800 rounded-md p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Wind className="w-4 h-4 text-cyan-400" />
                NASA POWER Atmospheric Telemetry
              </h3>
              <span className="text-[11px] font-mono text-slate-400">MERRA-2 / CERES</span>
            </div>

            <div className="bg-amber-950/25 border border-amber-800/50 rounded p-2 text-[11px] text-amber-200 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                {powerData?.limitationNotice ||
                  'NASA POWER provides historical MERRA-2 reanalysis atmospheric observations, NOT live launch-pad weather forecasts.'}
              </span>
            </div>

            {loadingPower ? (
              <div className="py-4 text-center text-xs font-mono text-cyan-300">
                Querying NASA Langley POWER API...
              </div>
            ) : powerData && powerData.available ? (
              <div className="space-y-2.5">
                <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                  <div className="bg-[#060911] border border-slate-800 rounded p-2">
                    <div className="text-slate-400 text-[10px]">2m Air Temp</div>
                    <div className="text-slate-100 font-semibold">
                      {powerData.metrics.tempC !== null ? `${powerData.metrics.tempC} °C` : 'N/A'}
                    </div>
                  </div>
                  <div className="bg-[#060911] border border-slate-800 rounded p-2">
                    <div className="text-slate-400 text-[10px]">10m / 50m Wind</div>
                    <div className="text-slate-100 font-semibold">
                      {powerData.metrics.windSpeed10mMs ?? 'N/A'} /{' '}
                      {powerData.metrics.windSpeed50mMs ?? 'N/A'} m/s
                    </div>
                  </div>
                  <div className="bg-[#060911] border border-slate-800 rounded p-2">
                    <div className="text-slate-400 text-[10px]">Precipitation</div>
                    <div className="text-slate-100 font-semibold">
                      {powerData.metrics.precipitationMmDay ?? 'N/A'} mm/d
                    </div>
                  </div>
                  <div className="bg-[#060911] border border-slate-800 rounded p-2">
                    <div className="text-slate-400 text-[10px]">Rel Humidity</div>
                    <div className="text-slate-100 font-semibold">
                      {powerData.metrics.relHumidityPct ?? 'N/A'}%
                    </div>
                  </div>
                  <div className="bg-[#060911] border border-slate-800 rounded p-2">
                    <div className="text-slate-400 text-[10px]">Pressure</div>
                    <div className="text-slate-100 font-semibold">
                      {powerData.metrics.surfacePressureKpa ?? 'N/A'} kPa
                    </div>
                  </div>
                  <div className="bg-[#060911] border border-slate-800 rounded p-2">
                    <div className="text-slate-400 text-[10px]">All/Clr Sky SW</div>
                    <div className="text-slate-100 font-semibold">
                      {powerData.metrics.solarIrradianceKwhM2 ?? 'N/A'} /{' '}
                      {powerData.metrics.clearSkyIrradianceKwhM2 ?? 'N/A'}
                    </div>
                  </div>
                </div>

                {/* 14-day Temperature & Wind Mini Trend Sparkline */}
                {powerData.dailySeries.length > 1 && (
                  <div className="bg-[#060911] border border-slate-800 rounded p-2">
                    <div className="flex justify-between text-[10px] font-mono text-slate-400 mb-1">
                      <span>14-Day Reanalysis Wind 50m (m/s)</span>
                      <span>Latest: {powerData.latestDate}</span>
                    </div>
                    <svg viewBox="0 0 360 48" className="w-full h-11">
                      {(() => {
                        const vals = powerData.dailySeries.map((d) => d.wind50mMs ?? d.windMs ?? 0);
                        const maxV = Math.max(10, ...vals);
                        const pathD = vals
                          .map((v, i) => {
                            const x = 6 + (i / (vals.length - 1)) * 348;
                            const y = 42 - (v / maxV) * 34;
                            return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
                          })
                          .join(' ');
                        return <path d={pathD} fill="none" stroke="#22d3ee" strokeWidth="1.8" />;
                      })()}
                    </svg>
                  </div>
                )}

                <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1.5">
                  <CloudRain className="w-3.5 h-3.5" />
                  Live Doppler Lightning / Ceiling: NASA DATA UNAVAILABLE in POWER Daily.
                </div>
              </div>
            ) : (
              <div className="p-3 bg-[#060911] border border-slate-800 rounded text-xs font-mono text-amber-400">
                {powerData?.unavailableReason || 'NASA DATA UNAVAILABLE'}
              </div>
            )}
          </div>

          {/* Live NASA EONET Earth Observatory Events */}
          <div className="bg-[#0B1120] border border-slate-800 rounded-md p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Flame className="w-4 h-4 text-rose-400" />
                Live NASA EONET Earth Observatory Events
              </h3>
              <span className="text-[11px] font-mono text-slate-400">
                {eonetData?.available ? `${eonetData.events.length} Open` : 'Status'}
              </span>
            </div>

            {eonetData?.available && nearestEonetEvents.length > 0 ? (
              <div className="space-y-1.5 text-xs">
                {nearestEonetEvents.map((ev) => (
                  <a
                    key={ev.id}
                    href={ev.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between bg-[#060911] border border-slate-800 hover:border-cyan-700 rounded px-2.5 py-1.5"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="text-slate-200 truncate font-medium">{ev.title}</div>
                      <div className="text-[10px] font-mono text-slate-400">
                        {ev.category} · {ev.distKm.toLocaleString()} km from pad ·{' '}
                        {ev.dateUtc.slice(0, 10)}
                      </div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  </a>
                ))}
              </div>
            ) : (
              <div className="text-xs font-mono text-amber-400">
                {eonetData?.unavailableReason || 'Querying NASA EONET v3...'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
