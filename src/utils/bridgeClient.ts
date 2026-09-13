/**
 * Client for the local PrintForge bridge (server/bridge.py), which relays jobs to ComfyUI.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { parseStlBuffer } from './meshLoader';
import { BridgeHealth, BridgeJobStatus, BridgeWebSocketMessage, SlicingParams } from '../types';

/** Generated meshes come out in arbitrary units; scale their largest side to this many mm. */
export const MESH_TARGET_SIZE_MM = 80;

/** First run loads SDXL + Hunyuan3D-2 from disk, which can take several minutes on its own. */
export const BRIDGE_JOB_TIMEOUT_SEC = 15 * 60;

export const BRIDGE_STATUS_STEP: Record<BridgeJobStatus['status'], number> = {
  queued: 1,
  diffusing: 2,
  meshing: 3,
  exporting: 3,
  completed: 4,
  failed: 0,
};

/** Accepts either the bridge root or the legacy ".../generate" endpoint setting. */
export function bridgeBaseUrl(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, '').replace(/\/(generate|health)$/, '');
}

export function resolveBridgeUrl(endpoint: string, url: string): string {
  return new URL(url, `${bridgeBaseUrl(endpoint)}/`).toString();
}

export function bridgeWebSocketUrl(endpoint: string): string {
  const url = new URL(`${bridgeBaseUrl(endpoint)}/ws`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.name === 'AbortError' ? 'Request timed out' : err.message;
  return String(err);
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function pingBridge(endpoint: string): Promise<BridgeHealth> {
  const base = bridgeBaseUrl(endpoint);
  let res: Response;
  try {
    res = await fetchWithTimeout(`${base}/health`, { headers: { Accept: 'application/json' } }, 6000);
  } catch {
    throw new Error(`No bridge reachable at ${base}`);
  }
  const data = await res.json().catch(() => null);
  if (!data || data.service !== 'printforge-bridge') {
    throw new Error(`${base} answered, but it is not the PrintForge bridge (another app is using that port)`);
  }
  return data as BridgeHealth;
}

export function describeBridgeHealth(health: BridgeHealth): string {
  const device = health.comfyui.devices?.[0]?.name?.replace(/^cuda:\d+\s*/, '').replace(/\s*:.*$/, '');
  const comfy = health.comfyui.reachable
    ? `ComfyUI ${health.comfyui.version ?? ''}${device ? ` on ${device}` : ''}`.trim()
    : 'ComfyUI offline';
  const models = !health.models_checked
    ? 'workflow not checked'
    : health.missing_models.length || health.missing_nodes.length
    ? `${health.missing_models.length + health.missing_nodes.length} workflow requirement(s) missing`
    : 'all workflow models present';
  return `Bridge v${health.version} • ${comfy} • ${models}`;
}

export interface BridgeGenerateRequest {
  prompt: string;
  seed: number;
  infill: number;
  filament: string;
  layer_height: number;
  slicingParams: SlicingParams;
  geometryType: string;
}

export async function submitBridgeJob(endpoint: string, body: BridgeGenerateRequest): Promise<string> {
  const url = `${bridgeBaseUrl(endpoint)}/generate`;
  let res: Response;
  try {
    res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      },
      20000
    );
  } catch (err) {
    throw new Error(`Bridge not reachable at ${url} (${errorMessage(err)})`);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = data?.detail;
    if (typeof detail === 'string') throw new Error(detail);
    if (detail?.message) throw new Error([detail.message, ...(detail.errors ?? [])].join(' — '));
    if (Array.isArray(detail)) throw new Error(detail.map((d: { msg?: string }) => d.msg).join('; '));
    throw new Error(`Bridge returned HTTP ${res.status}`);
  }
  if (typeof data?.prompt_id !== 'string') throw new Error('Bridge response did not include a prompt_id');
  return data.prompt_id;
}

export function telemetryFromStatus(status: BridgeJobStatus): BridgeWebSocketMessage {
  return {
    type: 'progress',
    promptId: status.prompt_id,
    status: status.status,
    statusText: status.stage_name,
    percentage: status.progress_pct,
    step: status.step ?? undefined,
    totalSteps: status.total_steps ?? undefined,
    samplerName: status.node_label ?? undefined,
    iterationRate: status.iteration_rate ?? undefined,
    etaSeconds: status.eta_seconds ?? undefined,
    vramUsedMb: status.hardware_metrics?.vram_used_mb,
    gpuTempC: status.hardware_metrics?.gpu_temp_c,
    connectionType: 'http_poll',
  };
}

export function describeTelemetry(t: BridgeWebSocketMessage): string {
  const parts = [t.samplerName || 'ComfyUI'];
  if (t.step && t.totalSteps) parts.push(`step ${t.step}/${t.totalSteps}`);
  if (t.iterationRate) parts.push(`${t.iterationRate.toFixed(2)} it/s`);
  if (t.vramUsedMb) parts.push(`VRAM ${(t.vramUsedMb / 1024).toFixed(1)} GB`);
  if (t.gpuTempC) parts.push(`${t.gpuTempC}°C`);
  return parts.join(' • ');
}

export interface LoadedBridgeMesh {
  geometry: THREE.BufferGeometry;
  triangleCount: number;
  format: 'glb' | 'stl';
  buffer: ArrayBuffer;
  fileName: string;
}

/** Downloads a GLB or STL from the bridge and returns a non-indexed, bed-ready geometry in mm. */
export async function fetchMeshFromUrl(url: string): Promise<LoadedBridgeMesh> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mesh download failed: HTTP ${res.status}`);
  const buffer = await res.arrayBuffer();
  const isGlb = buffer.byteLength >= 4 && new TextDecoder().decode(new Uint8Array(buffer, 0, 4)) === 'glTF';
  // STL from a slicer-style source is Z-up; the viewport is Y-up.
  const raw = isGlb ? await parseGlbGeometry(buffer) : parseStlBuffer(buffer).geometry.rotateX(-Math.PI / 2);
  const geometry = normalizeForPrintBed(raw, MESH_TARGET_SIZE_MM);
  return {
    geometry,
    triangleCount: Math.round(geometry.getAttribute('position').count / 3),
    format: isGlb ? 'glb' : 'stl',
    buffer,
    fileName: decodeURIComponent(new URL(url).pathname.split('/').pop() || 'mesh'),
  };
}

async function parseGlbGeometry(buffer: ArrayBuffer): Promise<THREE.BufferGeometry> {
  const gltf = await new GLTFLoader().parseAsync(buffer, '');
  gltf.scene.updateMatrixWorld(true);

  const parts: THREE.BufferGeometry[] = [];
  gltf.scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry.getAttribute('position')) return;
    const part = new THREE.BufferGeometry();
    part.setAttribute('position', mesh.geometry.getAttribute('position').clone());
    if (mesh.geometry.index) part.setIndex(mesh.geometry.index.clone());
    part.applyMatrix4(mesh.matrixWorld);
    if (part.index) {
      // The slicer, printability audit and STL exporter all read triangles straight from the position buffer
      parts.push(part.toNonIndexed());
      part.dispose();
    } else {
      parts.push(part);
    }
  });
  disposeObject(gltf.scene);

  if (parts.length === 0) throw new Error('GLB file contains no meshes');
  if (parts.length === 1) return parts[0];
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  if (!merged) throw new Error('Could not merge GLB mesh parts');
  return merged;
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => {
      Object.values(material).forEach((value) => {
        if (value instanceof THREE.Texture) value.dispose();
      });
      material.dispose();
    });
  });
}

function normalizeForPrintBed(geometry: THREE.BufferGeometry, targetMm: number): THREE.BufferGeometry {
  geometry.computeBoundingBox();
  const size = new THREE.Vector3();
  geometry.boundingBox!.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim > 0) geometry.scale(targetMm / maxDim, targetMm / maxDim, targetMm / maxDim);

  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.computeVertexNormals();
  return geometry;
}
