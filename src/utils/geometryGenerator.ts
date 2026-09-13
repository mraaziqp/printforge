import * as THREE from 'three';
import { SlicingParams, MeshMetrics } from '../types';
import { FILAMENT_SPECS } from '../mockData';

export function createProceduralGeometry(type: 'bracket' | 'mini' | 'dragon' | 'gear' | 'cylinder' | 'cube'): THREE.BufferGeometry {
  switch (type) {
    case 'bracket': {
      // Create an engineered L-bracket with corner fillet and mounting holes
      const shape = new THREE.Shape();
      const w = 45; // mm
      const h = 45;
      const t = 8;  // thickness

      shape.moveTo(0, 0);
      shape.lineTo(w, 0);
      shape.lineTo(w, t);
      shape.lineTo(t + 4, t);
      shape.bezierCurveTo(t + 2, t + 2, t, t + 4, t, t + 6);
      shape.lineTo(t, h);
      shape.lineTo(0, h);
      shape.closePath();

      const extrudeSettings: THREE.ExtrudeGeometryOptions = {
        steps: 2,
        depth: 35,
        bevelEnabled: true,
        bevelThickness: 1.5,
        bevelSize: 1.5,
        bevelSegments: 3,
      };

      const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      geo.center();
      // Rotate so it sits flat on print bed
      geo.rotateX(-Math.PI / 2);
      geo.computeVertexNormals();
      return geo;
    }

    case 'gear': {
      // Procedural planetary spur gear with center bore
      const teeth = 18;
      const outerR = 30;
      const rootR = 23;
      const innerBoreR = 7;
      const shape = new THREE.Shape();

      const totalPoints = teeth * 4;
      for (let i = 0; i < totalPoints; i++) {
        const angle = (i / totalPoints) * Math.PI * 2;
        const mod = i % 4;
        let r = outerR;
        if (mod === 0 || mod === 3) {
          r = outerR;
        } else {
          r = rootR;
        }
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      }
      shape.closePath();

      // Center bore hole
      const hole = new THREE.Path();
      hole.absarc(0, 0, innerBoreR, 0, Math.PI * 2, true);
      shape.holes.push(hole);

      // 4 weight reduction holes
      for (let j = 0; j < 4; j++) {
        const hAngle = (j / 4) * Math.PI * 2 + Math.PI / 4;
        const hx = Math.cos(hAngle) * 15;
        const hy = Math.sin(hAngle) * 15;
        const lightHole = new THREE.Path();
        lightHole.absarc(hx, hy, 4, 0, Math.PI * 2, true);
        shape.holes.push(lightHole);
      }

      const extrudeSettings: THREE.ExtrudeGeometryOptions = {
        depth: 14,
        bevelEnabled: true,
        bevelThickness: 1,
        bevelSize: 1,
        bevelSegments: 2,
      };

      const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      geo.center();
      geo.rotateX(Math.PI / 2);
      geo.computeVertexNormals();
      return geo;
    }

    case 'mini': {
      // Stylized Sci-Fi Titan Mech with base, legs, torso, and weapons
      const groupGeos: THREE.BufferGeometry[] = [];

      // Slotted hexagonal base
      const baseGeo = new THREE.CylinderGeometry(26, 28, 4, 6);
      baseGeo.translate(0, 2, 0);
      groupGeos.push(baseGeo);

      // Legs / Pelvis
      const legL = new THREE.BoxGeometry(7, 24, 9);
      legL.translate(-11, 14, 0);
      const legR = new THREE.BoxGeometry(7, 24, 9);
      legR.translate(11, 14, 0);
      groupGeos.push(legL, legR);

      // Torso
      const torso = new THREE.BoxGeometry(26, 20, 18);
      torso.translate(0, 32, 0);
      groupGeos.push(torso);

      // Head visor
      const head = new THREE.BoxGeometry(12, 9, 12);
      head.translate(0, 44, 2);
      groupGeos.push(head);

      // Shoulder Pauldrons / Railguns
      const gunL = new THREE.CylinderGeometry(3, 4, 32, 8);
      gunL.rotateX(Math.PI / 2);
      gunL.translate(-18, 36, 10);
      const gunR = new THREE.CylinderGeometry(3, 4, 32, 8);
      gunR.rotateX(Math.PI / 2);
      gunR.translate(18, 36, 10);
      groupGeos.push(gunL, gunR);

      // Merge manually
      return mergeGeometries(groupGeos);
    }

    case 'dragon': {
      // Articulated Wyrm body segments with vertebrae links
      const segments: THREE.BufferGeometry[] = [];
      const count = 10;
      for (let i = 0; i < count; i++) {
        const factor = 1 - (i / count) * 0.65;
        const xOffset = Math.sin(i * 0.45) * 14;
        const zOffset = (i - count / 2) * 12;

        const bodyPart = new THREE.ConeGeometry(8 * factor, 12 * factor, 5);
        bodyPart.rotateX(Math.PI / 2);
        bodyPart.translate(xOffset, 7 * factor, zOffset);
        segments.push(bodyPart);

        // Spine crest
        const spine = new THREE.TetrahedronGeometry(4 * factor);
        spine.translate(xOffset, 12 * factor, zOffset);
        segments.push(spine);
      }
      return mergeGeometries(segments);
    }

    case 'cylinder': {
      const geo = new THREE.CylinderGeometry(20, 20, 40, 32);
      geo.translate(0, 20, 0);
      return geo;
    }

    case 'cube':
    default: {
      const geo = new THREE.BoxGeometry(30, 30, 30);
      geo.translate(0, 15, 0);
      return geo;
    }
  }
}

/**
 * Merges multiple BufferGeometries into a single BufferGeometry
 */
function mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let totalVertices = 0;
  let totalIndices = 0;

  geos.forEach((g) => {
    totalVertices += g.getAttribute('position').count;
    if (g.getIndex()) {
      totalIndices += g.getIndex()!.count;
    } else {
      totalIndices += g.getAttribute('position').count;
    }
  });

  const mergedPos = new Float32Array(totalVertices * 3);
  const mergedNormals = new Float32Array(totalVertices * 3);
  const mergedIndices = new Uint32Array(totalIndices);

  let vertexOffset = 0;
  let indexOffset = 0;

  geos.forEach((g) => {
    const pos = g.getAttribute('position');
    let norm = g.getAttribute('normal');
    if (!norm) {
      g.computeVertexNormals();
      norm = g.getAttribute('normal');
    }
    const idx = g.getIndex();
    const vCount = pos.count;

    for (let i = 0; i < vCount; i++) {
      mergedPos[(vertexOffset + i) * 3] = pos.getX(i);
      mergedPos[(vertexOffset + i) * 3 + 1] = pos.getY(i);
      mergedPos[(vertexOffset + i) * 3 + 2] = pos.getZ(i);

      if (norm) {
        mergedNormals[(vertexOffset + i) * 3] = norm.getX(i);
        mergedNormals[(vertexOffset + i) * 3 + 1] = norm.getY(i);
        mergedNormals[(vertexOffset + i) * 3 + 2] = norm.getZ(i);
      }
    }

    if (idx) {
      for (let j = 0; j < idx.count; j++) {
        mergedIndices[indexOffset + j] = vertexOffset + idx.getX(j);
      }
      indexOffset += idx.count;
    } else {
      for (let j = 0; j < vCount; j++) {
        mergedIndices[indexOffset + j] = vertexOffset + j;
      }
      indexOffset += vCount;
    }

    vertexOffset += vCount;
  });

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(mergedPos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(mergedNormals, 3));
  merged.setIndex(new THREE.BufferAttribute(mergedIndices, 1));
  merged.computeBoundingBox();
  return merged;
}

/**
 * Calculates physical print & material metrics based on geometry and slicing configuration
 */
export function calculateMeshMetrics(
  geometry: THREE.BufferGeometry,
  slicing: SlicingParams
): MeshMetrics {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox || new THREE.Box3();
  const size = new THREE.Vector3();
  box.getSize(size);

  const dimX = Math.max(1, Math.round(size.x));
  const dimY = Math.max(1, Math.round(size.y));
  const dimZ = Math.max(1, Math.round(size.z));

  const posAttr = geometry.getAttribute('position');
  const indexAttr = geometry.getIndex();
  const vertexCount = posAttr ? posAttr.count : 0;
  const triangleCount = indexAttr ? indexAttr.count / 3 : vertexCount / 3;

  // Approximate solid bounding volume cm³
  const rawVolumeCm3 = (dimX * dimY * dimZ) / 1000;
  // Account for shell walls (wallCount) and infill percentage
  const shellFraction = 0.28 + (slicing.wallCount - 2) * 0.05;
  const infillFraction = (slicing.infill / 100) * (1 - shellFraction);
  const effectiveVolumeCm3 = rawVolumeCm3 * (shellFraction + infillFraction) * 0.45; // 0.45 void packing factor

  const filament = FILAMENT_SPECS[slicing.filament] || FILAMENT_SPECS.PLA;
  const weightGrams = Math.max(8, Number((effectiveVolumeCm3 * filament.density).toFixed(1)));

  // Material cost calculation
  const materialCostUsd = Number(((weightGrams / 1000) * filament.costPerKg).toFixed(2));

  // Filament length (1.75mm diameter filament)
  // Cross section area = PI * (1.75 / 2)^2 = 2.405 mm²
  // Length (m) = Volume (mm³) / Area (mm²) / 1000
  const volumeMm3 = (weightGrams / filament.density) * 1000;
  const filamentLengthMeters = Number((volumeMm3 / 2.405 / 1000).toFixed(1));

  // Estimated print time
  // Depends on layer height (0.12 takes longer than 0.28) and speed
  const layerHeightFactor = slicing.layerHeight === '0.12' ? 1.6 : slicing.layerHeight === '0.28' ? 0.75 : 1.0;
  const speedFactor = 60 / slicing.printSpeed;
  const baseMinutes = (weightGrams * 2.8) * layerHeightFactor * speedFactor;
  const estimatedPrintTimeMinutes = Math.max(25, Math.round(baseMinutes));

  return {
    vertexCount,
    triangleCount: Math.round(triangleCount),
    dimensionsMm: { x: dimX, y: dimY, z: dimZ },
    volumeCm3: Number(effectiveVolumeCm3.toFixed(1)),
    weightGrams,
    estimatedPrintTimeMinutes,
    materialCostUsd,
    filamentLengthMeters,
  };
}
