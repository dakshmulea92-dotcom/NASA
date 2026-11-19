import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export function createCalibratedRenderer(
  container: HTMLElement,
  lightweightMode: boolean
): { renderer: THREE.WebGLRenderer; isSoftwareGl: boolean } {
  const isSoftwareGl = detectSoftwareWebGL();
  const useLight = isSoftwareGl || lightweightMode;

  const renderer = new THREE.WebGLRenderer({
    antialias: !useLight,
    powerPreference: lightweightMode ? 'low-power' : 'high-performance',
    alpha: false,
    preserveDrawingBuffer: true,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setPixelRatio(useLight ? 1 : Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = !useLight;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const w = Math.max(100, container.clientWidth);
  const h = Math.max(100, container.clientHeight);
  renderer.setSize(w, h);
  return { renderer, isSoftwareGl };
}

export function applyStudioEnvironment(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene
): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  pmrem.dispose();
  return envTex;
}

export function afterWebGLDraw(renderer: THREE.WebGLRenderer, cb: () => void): number {
  const gl = renderer.getContext() as WebGL2RenderingContext;
  if (gl && typeof gl.fenceSync === 'function') {
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        window.setTimeout(cb, 80);
      }
    };
    return window.setTimeout(poll, 5);
  }
  return window.setTimeout(cb, 80);
}

export function latLonToVector3(latDeg: number, lonDeg: number, radius: number): THREE.Vector3 {
  const phi = (90 - latDeg) * (Math.PI / 180);
  const theta = (lonDeg + 180) * (Math.PI / 180);
  // Standard Three.js SphereGeometry / glTF UV sphere mapping:
  // u = 0.5 + lon/360 => +Z at 0 deg lon or -X depending on glTF orientation.
  // We keep consistent conversion & allow model orientation alignment.
  const x = -radius * Math.sin(phi) * Math.cos(theta);
  const y = radius * Math.cos(phi);
  const z = radius * Math.sin(phi) * Math.sin(theta);
  return new THREE.Vector3(x, y, z);
}

export function vector3ToLatLon(vec: THREE.Vector3): { lat: number; lon: number } {
  const n = vec.clone().normalize();
  const lat = 90 - Math.acos(Math.max(-1, Math.min(1, n.y))) * (180 / Math.PI);
  const theta = Math.atan2(n.z, -n.x);
  let lon = theta * (180 / Math.PI) - 180;
  lon = ((lon + 180) % 360 + 360) % 360 - 180;
  return {
    lat: Number(lat.toFixed(3)),
    lon: Number(lon.toFixed(3)),
  };
}
