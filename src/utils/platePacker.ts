/**
 * PrintForge 2D Bin Packing & Plate Nesting Engine
 * Arranges multiple 3D models on a 220x220mm build bed with clearance margins,
 * collision detection, and combined batch slicing metrics.
 */

import { PlacedModel, PlateNestingConfig } from '../types';

export interface BoundingFootprint {
  id: string;
  width: number;  // X span in mm
  depth: number;  // Z span in mm
  height: number; // Y span in mm
  rotated: boolean;
}

export interface PackResult {
  success: boolean;
  packedModels: PlacedModel[];
  collisions: string[]; // IDs of colliding models (if any)
  bedUtilizationPct: number;
}

/**
 * Check for 2D footprint collisions on the X-Z print bed plane
 */
export function detectPlateCollisions(
  models: PlacedModel[],
  clearanceMarginMm: number = 2
): Set<string> {
  const collidingIds = new Set<string>();

  for (let i = 0; i < models.length; i++) {
    const a = models[i];
    const halfWA = (a.dimensionsMm.x * a.scale.x) / 2 + clearanceMarginMm / 2;
    const halfDA = (a.dimensionsMm.y * a.scale.z) / 2 + clearanceMarginMm / 2;

    const minXA = a.position.x - halfWA;
    const maxXA = a.position.x + halfWA;
    const minZA = a.position.z - halfDA;
    const maxZA = a.position.z + halfDA;

    for (let j = i + 1; j < models.length; j++) {
      const b = models[j];
      const halfWB = (b.dimensionsMm.x * b.scale.x) / 2 + clearanceMarginMm / 2;
      const halfDB = (b.dimensionsMm.y * b.scale.z) / 2 + clearanceMarginMm / 2;

      const minXB = b.position.x - halfWB;
      const maxXB = b.position.x + halfWB;
      const minZB = b.position.z - halfDB;
      const maxZB = b.position.z + halfDB;

      // Check AABB overlap on X-Z bed plane
      const overlapsX = minXA < maxXB && maxXA > minXB;
      const overlapsZ = minZA < maxZB && maxZA > minZB;

      if (overlapsX && overlapsZ) {
        collidingIds.add(a.id);
        collidingIds.add(b.id);
      }
    }

    // Check boundary out of bed (-110 to +110 mm)
    const bedLimit = 108;
    if (
      Math.abs(a.position.x) + halfWA > bedLimit ||
      Math.abs(a.position.z) + halfDA > bedLimit
    ) {
      collidingIds.add(a.id);
    }
  }

  return collidingIds;
}

/**
 * Auto-Nest models on the 220x220mm build plate
 * Uses sorted shelf packing with collision resolution and centering.
 */
export function autoNestPlate(
  models: PlacedModel[],
  config: PlateNestingConfig = {
    clearanceMarginMm: 10,
    bedWidthMm: 220,
    bedDepthMm: 220,
    allowRotation: true,
  }
): PackResult {
  if (models.length === 0) {
    return {
      success: true,
      packedModels: [],
      collisions: [],
      bedUtilizationPct: 0,
    };
  }

  // Usable print area inside the bed with safety border
  const usableWidth = config.bedWidthMm - 20; // 200mm
  const usableDepth = config.bedDepthMm - 20; // 200mm
  const margin = Math.max(4, config.clearanceMarginMm);

  // Clone models and calculate effective footprints
  const items: Array<{
    model: PlacedModel;
    origIndex: number;
    width: number;
    depth: number;
    height: number;
    area: number;
  }> = models.map((m, idx) => {
    const w = Math.max(10, m.dimensionsMm.x * m.scale.x);
    const d = Math.max(10, m.dimensionsMm.y * m.scale.z);
    const h = Math.max(5, m.dimensionsMm.z * m.scale.y);
    return {
      model: { ...m },
      origIndex: idx,
      width: w,
      depth: d,
      height: h,
      area: w * d,
    };
  });

  // Sort by footprint area (largest parts placed first)
  items.sort((a, b) => b.area - a.area);

  // Track placed rectangles on bed: { minX, maxX, minZ, maxZ }
  interface PlacedRect {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  }
  const placedRects: PlacedRect[] = [];

  const startX = -usableWidth / 2;
  const startZ = -usableDepth / 2;
  let currentX = startX;
  let currentZ = startZ;
  let currentShelfDepth = 0;

  const results: PlacedModel[] = [];

  for (const item of items) {
    let w = item.width;
    let d = item.depth;
    let rotated = false;

    // If allowed rotation and rotating 90° fits better on current shelf
    if (config.allowRotation) {
      if (currentX + w > usableWidth / 2 && currentX + d <= usableWidth / 2) {
        // Swap dimensions
        const temp = w;
        w = d;
        d = temp;
        rotated = true;
      }
    }

    // Check if item exceeds current row/shelf width
    if (currentX + w > usableWidth / 2 && currentX > startX) {
      // Start a new row on the Z-axis
      currentX = startX;
      currentZ += currentShelfDepth + margin;
      currentShelfDepth = 0;
    }

    // Check if exceeds bed depth
    let placedX = currentX + w / 2;
    let placedZ = currentZ + d / 2;

    if (currentZ + d > usableDepth / 2) {
      // Fallback: spiral or find first non-overlapping coordinate
      let foundSpot = false;
      for (let zCand = startZ; zCand <= usableDepth / 2 - d; zCand += 10) {
        for (let xCand = startX; xCand <= usableWidth / 2 - w; xCand += 10) {
          const testMinX = xCand - margin / 2;
          const testMaxX = xCand + w + margin / 2;
          const testMinZ = zCand - margin / 2;
          const testMaxZ = zCand + d + margin / 2;

          const hasCollision = placedRects.some(
            (r) =>
              testMinX < r.maxX &&
              testMaxX > r.minX &&
              testMinZ < r.maxZ &&
              testMaxZ > r.minZ
          );

          if (!hasCollision) {
            placedX = xCand + w / 2;
            placedZ = zCand + d / 2;
            foundSpot = true;
            break;
          }
        }
        if (foundSpot) break;
      }
    }

    // Register placed rectangle
    placedRects.push({
      minX: placedX - w / 2 - margin / 2,
      maxX: placedX + w / 2 + margin / 2,
      minZ: placedZ - d / 2 - margin / 2,
      maxZ: placedZ + d / 2 + margin / 2,
    });

    currentX += w + margin;
    if (d > currentShelfDepth) {
      currentShelfDepth = d;
    }

    const newRotation = { ...item.model.rotation };
    if (rotated) {
      newRotation.y += Math.PI / 2;
    }

    results.push({
      ...item.model,
      position: {
        x: Math.round(placedX),
        y: item.model.position.y,
        z: Math.round(placedZ),
      },
      rotation: newRotation,
    });
  }

  // Center all placed models together on the build bed
  if (results.length > 0) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    results.forEach((m) => {
      const halfW = (m.dimensionsMm.x * m.scale.x) / 2;
      const halfD = (m.dimensionsMm.y * m.scale.z) / 2;
      minX = Math.min(minX, m.position.x - halfW);
      maxX = Math.max(maxX, m.position.x + halfW);
      minZ = Math.min(minZ, m.position.z - halfD);
      maxZ = Math.max(maxZ, m.position.z + halfD);
    });

    const shiftX = Math.round(-(minX + maxX) / 2);
    const shiftZ = Math.round(-(minZ + maxZ) / 2);

    results.forEach((m) => {
      m.position.x += shiftX;
      m.position.z += shiftZ;
    });
  }

  // Calculate bed area utilization
  const totalModelFootprint = items.reduce((acc, it) => acc + it.area, 0);
  const totalBedArea = config.bedWidthMm * config.bedDepthMm;
  const utilization = Math.min(100, Math.round((totalModelFootprint / totalBedArea) * 100));

  const collisions = Array.from(detectPlateCollisions(results, 2));

  return {
    success: collisions.length === 0,
    packedModels: results,
    collisions,
    bedUtilizationPct: utilization,
  };
}

/**
 * Calculate combined batch statistics for all models on the plate
 */
export function calculateBatchPlateMetrics(models: PlacedModel[]): {
  totalMassGrams: number;
  totalPrintTimeMinutes: number;
  totalTriangles: number;
  totalFilamentMeters: number;
  formattedTime: string;
} {
  const totalMassGrams = Math.round(
    models.reduce((sum, m) => sum + (m.weightGrams || 15), 0)
  );

  // Combined print time: each model takes time, plus batch transition overhead (approx 4 mins per part)
  const baseMinutes = models.reduce((sum, m) => sum + (m.printTimeMinutes || 45), 0);
  const overhead = Math.max(0, (models.length - 1) * 4);
  const totalPrintTimeMinutes = baseMinutes + overhead;

  const totalTriangles = models.reduce((sum, m) => sum + (m.triangleCount || 1000), 0);
  const totalFilamentMeters = Number(((totalMassGrams / 3.0) * 1.0).toFixed(1));

  const hours = Math.floor(totalPrintTimeMinutes / 60);
  const mins = totalPrintTimeMinutes % 60;
  const formattedTime = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  return {
    totalMassGrams,
    totalPrintTimeMinutes,
    totalTriangles,
    totalFilamentMeters,
    formattedTime,
  };
}
