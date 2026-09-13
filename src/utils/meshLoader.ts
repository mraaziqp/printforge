import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

export interface LoadedMeshResult {
  geometry: THREE.BufferGeometry;
  vertexCount: number;
  triangleCount: number;
  dimensionsMm: { x: number; y: number; z: number };
  estimatedVolumeCm3: number;
}

/**
 * Parses an STL ArrayBuffer into a THREE.BufferGeometry with physical metrics
 */
export function parseStlBuffer(buffer: ArrayBuffer): LoadedMeshResult {
  const loader = new STLLoader();
  const geometry = loader.parse(buffer);

  geometry.computeVertexNormals();
  geometry.computeBoundingBox();

  const box = geometry.boundingBox || new THREE.Box3();
  const size = new THREE.Vector3();
  box.getSize(size);

  const dimX = Math.max(1, Math.round(size.x));
  const dimY = Math.max(1, Math.round(size.y));
  const dimZ = Math.max(1, Math.round(size.z));

  const posAttr = geometry.getAttribute('position');
  const vertexCount = posAttr ? posAttr.count : 0;
  const triangleCount = Math.round(vertexCount / 3);

  // Approximate volume in cm³
  const estimatedVolumeCm3 = Number(((dimX * dimY * dimZ) / 1000 * 0.42).toFixed(1));

  return {
    geometry,
    vertexCount,
    triangleCount,
    dimensionsMm: { x: dimX, y: dimY, z: dimZ },
    estimatedVolumeCm3,
  };
}

/**
 * Loads an STL from a URL (blob: or http:)
 */
export async function loadStlFromUrl(url: string): Promise<LoadedMeshResult> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch STL from URL: ${response.status} ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  return parseStlBuffer(buffer);
}
