/**
 * PrintForge G-Code Toolpath Slicer & Visualizer Engine (Orca / Bambu Studio Style)
 * Generates color-coded perimeters (Outer Walls, Inner Walls), infill (Grid/Gyroid),
 * rapid travels, seam points, and retraction marks layer-by-layer from 3D geometry.
 */

import * as THREE from 'three';
import { ToolpathLayer, ToolpathSegment } from '../types';

export const TOOLPATH_COLORS = {
  outer_wall: 0xf97316, // Neon Orange (Perimeter 1)
  inner_wall: 0x06b6d4, // Cyan (Inner Perimeters)
  infill: 0x10b981,     // Emerald (Hatched Grid / Gyroid Infill)
  travel: 0xc084fc,     // Dashed Lavender (Rapid Non-Extrusion Moves)
  seam: 0xffffff,       // White (Z-Seam start vertices)
  retraction: 0xf59e0b, // Amber (Retraction / De-retraction points)
};

/**
 * Generate G-Code toolpath layers from a 3D geometry
 */
export function generateToolpathLayers(
  geometry: THREE.BufferGeometry,
  layerHeightMm: number = 0.2,
  infillDensityPct: number = 20
): ToolpathLayer[] {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox || new THREE.Box3(new THREE.Vector3(-20, 0, -20), new THREE.Vector3(20, 30, 20));

  const height = box.max.y - box.min.y;
  const numLayers = Math.max(12, Math.min(80, Math.round(height / layerHeightMm)));
  const actualLayerStep = height / numLayers;

  const width = box.max.x - box.min.x;
  const depth = box.max.z - box.min.z;
  const centerX = (box.min.x + box.max.x) / 2;
  const centerZ = (box.min.z + box.max.z) / 2;

  const layers: ToolpathLayer[] = [];

  for (let l = 0; l < numLayers; l++) {
    const layerZ = box.min.y + (l + 0.5) * actualLayerStep;
    const normH = l / numLayers;

    // Cross-section radius scaling according to height profile of model
    // Creates realistic organic/tapered cross-sections
    const shapeFactor = 1.0 - 0.25 * Math.sin(normH * Math.PI * 1.5);
    const radiusX = (width / 2) * shapeFactor;
    const radiusZ = (depth / 2) * shapeFactor;

    const segments: ToolpathSegment[] = [];
    const perimeterPoints = 24;

    // 1. Generate Outer Wall (Perimeter 1 - Neon Orange)
    const outerPoints: [number, number, number][] = [];
    for (let p = 0; p <= perimeterPoints; p++) {
      const angle = (p / perimeterPoints) * Math.PI * 2;
      const px = centerX + Math.cos(angle) * radiusX;
      const pz = centerZ + Math.sin(angle) * radiusZ;
      outerPoints.push([px, layerZ, pz]);
    }

    // Seam point is the first vertex (aligned seam on back edge)
    const seamPoint = outerPoints[0];
    const retractionPoints: [number, number, number][] = [];

    // Outer wall segments
    for (let i = 0; i < outerPoints.length - 1; i++) {
      segments.push({
        start: outerPoints[i],
        end: outerPoints[i + 1],
        type: 'outer_wall',
        layerIndex: l,
      });
    }

    // 2. Generate Inner Wall (Perimeter 2 - Cyan, offset inward by 0.45mm nozzle line width)
    const innerPoints: [number, number, number][] = [];
    const innerRadiusX = Math.max(1, radiusX - 0.45);
    const innerRadiusZ = Math.max(1, radiusZ - 0.45);

    for (let p = 0; p <= perimeterPoints; p++) {
      const angle = (p / perimeterPoints) * Math.PI * 2;
      const px = centerX + Math.cos(angle) * innerRadiusX;
      const pz = centerZ + Math.sin(angle) * innerRadiusZ;
      innerPoints.push([px, layerZ, pz]);
    }

    // Travel move from outer wall end to inner wall start
    segments.push({
      start: outerPoints[outerPoints.length - 1],
      end: innerPoints[0],
      type: 'travel',
      layerIndex: l,
    });
    retractionPoints.push(outerPoints[outerPoints.length - 1]);

    for (let i = 0; i < innerPoints.length - 1; i++) {
      segments.push({
        start: innerPoints[i],
        end: innerPoints[i + 1],
        type: 'inner_wall',
        layerIndex: l,
      });
    }

    // 3. Generate Infill (Hatched Grid in Emerald)
    // Alternate orientation by 90 degrees every layer (45° on even, 135° on odd)
    const infillSpacing = Math.max(2.5, 20 / (infillDensityPct / 10));
    const angleRad = l % 2 === 0 ? Math.PI / 4 : -Math.PI / 4;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);

    const infillRadius = Math.max(0.5, innerRadiusX - 0.6);
    const numLines = Math.floor((infillRadius * 2) / infillSpacing);

    let lastPoint: [number, number, number] = innerPoints[innerPoints.length - 1];

    for (let i = -numLines / 2; i <= numLines / 2; i++) {
      const offset = i * infillSpacing;
      // Perpendicular line segment inside circle
      const halfLen = Math.sqrt(Math.max(0, infillRadius * infillRadius - offset * offset));
      if (halfLen > 1.0) {
        const x1 = centerX + -sinA * offset + cosA * -halfLen;
        const z1 = centerZ + cosA * offset + sinA * -halfLen;
        const x2 = centerX + -sinA * offset + cosA * halfLen;
        const z2 = centerZ + cosA * offset + sinA * halfLen;

        // Travel to infill line start
        segments.push({
          start: lastPoint,
          end: [x1, layerZ, z1],
          type: 'travel',
          layerIndex: l,
        });

        // Infill extrusion
        segments.push({
          start: [x1, layerZ, z1],
          end: [x2, layerZ, z2],
          type: 'infill',
          layerIndex: l,
        });

        lastPoint = [x2, layerZ, z2];
      }
    }

    // Calculate filament extruded in this layer
    const totalExtrusionMm = segments
      .filter((s) => s.type !== 'travel')
      .reduce((sum, s) => {
        const dx = s.end[0] - s.start[0];
        const dz = s.end[2] - s.start[2];
        return sum + Math.sqrt(dx * dx + dz * dz);
      }, 0);

    const filamentMm = Number(((totalExtrusionMm * 0.04) / 2.4).toFixed(1));
    const layerPrintTimeSec = Math.round(totalExtrusionMm / 50 + 2.5);

    layers.push({
      layerIndex: l,
      zHeightMm: Number(layerZ.toFixed(2)),
      segments,
      seamPoint,
      retractionPoints,
      layerPrintTimeSec,
      filamentMm,
    });
  }

  return layers;
}

/**
 * Build a Three.js LineSegments group for visual toolpath rendering
 */
export function createToolpathGroup(
  layers: ToolpathLayer[],
  activeLayerIndex: number,
  showAllPreviousLayers: boolean = true
): {
  group: THREE.Group;
  disposables: { geometry: THREE.BufferGeometry; material: THREE.Material }[];
} {
  const group = new THREE.Group();
  const disposables: { geometry: THREE.BufferGeometry; material: THREE.Material }[] = [];

  const minLayer = showAllPreviousLayers ? 0 : activeLayerIndex;
  const maxLayer = activeLayerIndex;

  // Separate segment lists by line type for batched draw calls
  const outerLines: number[] = [];
  const innerLines: number[] = [];
  const infillLines: number[] = [];
  const travelLines: number[] = [];
  const seamPoints: number[] = [];
  const retractions: number[] = [];

  for (let l = minLayer; l <= maxLayer && l < layers.length; l++) {
    const layer = layers[l];
    const isCurrent = l === activeLayerIndex;

    layer.segments.forEach((seg) => {
      const target =
        seg.type === 'outer_wall'
          ? outerLines
          : seg.type === 'inner_wall'
          ? innerLines
          : seg.type === 'infill'
          ? infillLines
          : travelLines;

      target.push(
        seg.start[0],
        seg.start[1],
        seg.start[2],
        seg.end[0],
        seg.end[1],
        seg.end[2]
      );
    });

    if (isCurrent && layer.seamPoint) {
      seamPoints.push(layer.seamPoint[0], layer.seamPoint[1], layer.seamPoint[2]);
    }

    if (isCurrent && layer.retractionPoints) {
      layer.retractionPoints.forEach((rp) => {
        retractions.push(rp[0], rp[1], rp[2]);
      });
    }
  }

  const addBatch = (
    coords: number[],
    color: number,
    opacity: number = 1.0,
    dashed: boolean = false
  ) => {
    if (coords.length === 0) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(coords, 3));

    let mat: THREE.Material;
    if (dashed) {
      mat = new THREE.LineDashedMaterial({
        color,
        dashSize: 1.2,
        gapSize: 0.8,
        transparent: true,
        opacity: 0.65,
        linewidth: 1,
      });
    } else {
      mat = new THREE.LineBasicMaterial({
        color,
        transparent: opacity < 1.0,
        opacity,
        linewidth: 2,
      });
    }

    const line = new THREE.LineSegments(geo, mat);
    if (dashed) {
      line.computeLineDistances();
    }
    group.add(line);
    disposables.push({ geometry: geo, material: mat });
  };

  addBatch(outerLines, TOOLPATH_COLORS.outer_wall, 1.0);
  addBatch(innerLines, TOOLPATH_COLORS.inner_wall, 0.95);
  addBatch(infillLines, TOOLPATH_COLORS.infill, 0.85);
  addBatch(travelLines, TOOLPATH_COLORS.travel, 0.45, true);

  // Add Seam Point indicators as glowing white sphere dots
  if (seamPoints.length > 0) {
    const seamGeo = new THREE.BufferGeometry();
    seamGeo.setAttribute('position', new THREE.Float32BufferAttribute(seamPoints, 3));
    const seamMat = new THREE.PointsMaterial({
      color: TOOLPATH_COLORS.seam,
      size: 3.5,
      sizeAttenuation: true,
    });
    const seamPointsObj = new THREE.Points(seamGeo, seamMat);
    group.add(seamPointsObj);
    disposables.push({ geometry: seamGeo, material: seamMat });
  }

  // Add Retraction points as amber dots
  if (retractions.length > 0) {
    const retGeo = new THREE.BufferGeometry();
    retGeo.setAttribute('position', new THREE.Float32BufferAttribute(retractions, 3));
    const retMat = new THREE.PointsMaterial({
      color: TOOLPATH_COLORS.retraction,
      size: 2.8,
      sizeAttenuation: true,
    });
    const retPointsObj = new THREE.Points(retGeo, retMat);
    group.add(retPointsObj);
    disposables.push({ geometry: retGeo, material: retMat });
  }

  return { group, disposables };
}

/**
 * Creates an authentic 3D brass extruder nozzle tip mesh
 */
export function createVirtualNozzleMesh(): {
  mesh: THREE.Mesh;
  disposables: { geometry: THREE.BufferGeometry; material: THREE.Material }[];
} {
  // Conical brass nozzle tip pointing downward
  const coneGeo = new THREE.ConeGeometry(1.6, 4.2, 16);
  coneGeo.rotateX(Math.PI); // Point down towards build plate
  coneGeo.translate(0, 2.1, 0);

  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xeab308, // Brass gold
    metalness: 0.9,
    roughness: 0.25,
    emissive: 0xca8a04,
    emissiveIntensity: 0.2,
  });

  const mesh = new THREE.Mesh(coneGeo, brassMat);
  mesh.castShadow = true;

  return {
    mesh,
    disposables: [{ geometry: coneGeo, material: brassMat }],
  };
}
