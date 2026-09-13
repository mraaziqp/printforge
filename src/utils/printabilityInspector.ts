import * as THREE from 'three';
import { PrintabilityAuditResult } from '../types';

/**
 * Creates custom WebGL ShaderMaterial that renders real-time overhang heatmaps:
 * - Green (0°–45°): Self-supporting, safe
 * - Yellow (45°–60°): Bridging / caution
 * - Red (>60°): Critical overhang, requires supports
 */
export function createOverhangHeatmapMaterial(): THREE.ShaderMaterial {
  const vertexShader = `
    varying vec3 vWorldNormal;
    varying vec3 vViewPosition;

    void main() {
      // Normal transformed to world coordinates relative to build plate
      vWorldNormal = normalize(mat3(modelMatrix) * normal);
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vec4 mvPosition = viewMatrix * worldPosition;
      vViewPosition = -mvPosition.xyz;
      gl_Position = projectionMatrix * mvPosition;
    }
  `;

  const fragmentShader = `
    varying vec3 vWorldNormal;
    varying vec3 vViewPosition;

    void main() {
      vec3 n = normalize(vWorldNormal);
      // In Three.js, +Y is vertical build height, -Y points toward bed
      float ny = n.y;
      vec3 heatColor;

      if (ny >= 0.0) {
        // Facing up: completely safe & self-supporting
        heatColor = vec3(0.18, 0.85, 0.44); // Neon Green
      } else {
        // Facing down towards bed: measure angle from vertical wall
        // ny = 0.0 -> 0° overhang
        // ny = -1.0 -> 90° overhang (horizontal ceiling)
        float angleDeg = asin(clamp(-ny, 0.0, 1.0)) * 57.2957795;

        if (angleDeg <= 45.0) {
          // 0° - 45°: Safe
          heatColor = vec3(0.18, 0.85, 0.44);
        } else if (angleDeg <= 60.0) {
          // 45° - 60°: Bridging / Caution
          float factor = (angleDeg - 45.0) / 15.0;
          heatColor = mix(vec3(0.96, 0.77, 0.19), vec3(0.98, 0.52, 0.15), factor);
        } else {
          // > 60°: Critical overhang requiring support
          heatColor = vec3(0.95, 0.22, 0.22); // Vivid Red
        }
      }

      // Studio key lighting
      vec3 light1 = normalize(vec3(0.4, 0.8, 0.6));
      vec3 light2 = normalize(vec3(-0.4, -0.2, -0.6));
      float diff = max(dot(n, light1), 0.0) * 0.35 + max(dot(n, light2), 0.0) * 0.15 + 0.55;

      // Rim Fresnel for depth
      vec3 viewDir = normalize(vViewPosition);
      float rim = 1.0 - max(dot(viewDir, n), 0.0);
      rim = pow(rim, 3.5) * 0.25;

      gl_FragColor = vec4(heatColor * diff + rim, 1.0);
    }
  `;

  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
  });
}

/**
 * Performs a rigorous 3D printability audit on a mesh geometry:
 * - Overhang angles analysis (<45°, 45°-60°, >60°)
 * - Watertight / manifold check (edge sharing)
 * - Support waste estimation
 * - Multi-axis orientation optimization
 */
export function auditMeshPrintability(
  geometry: THREE.BufferGeometry,
  modelWeightGrams = 45,
  currentWorldMatrix?: THREE.Matrix4
): PrintabilityAuditResult {
  const posAttr = geometry.getAttribute('position');
  if (!posAttr) {
    return {
      score: 100,
      safePct: 100,
      cautionPct: 0,
      overhangPct: 0,
      totalTriangles: 0,
      overhangTriangles: 0,
      estimatedSupportFilamentPct: 0,
      estimatedSupportWasteGrams: 0,
      isWatertight: true,
      openEdgeCount: 0,
      recommendedOrientation: {
        label: 'Optimal',
        description: 'Current orientation is already optimal for minimal supports.',
        rotX: 0,
        rotY: 0,
        rotZ: 0,
        supportReductionPct: 0,
      },
    };
  }

  const index = geometry.getIndex();
  const numTriangles = index ? index.count / 3 : posAttr.count / 3;

  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  const edge1 = new THREE.Vector3();
  const edge2 = new THREE.Vector3();
  const normal = new THREE.Vector3();

  // Edge map for watertight / 2-manifold check
  const edgeUsage = new Map<string, number>();

  const quantizeKey = (x: number, y: number, z: number): string => {
    return `${Math.round(x * 100)},${Math.round(y * 100)},${Math.round(z * 100)}`;
  };

  const getVertex = (i: number, target: THREE.Vector3) => {
    target.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i));
    if (currentWorldMatrix) {
      target.applyMatrix4(currentWorldMatrix);
    }
  };

  let totalArea = 0;
  let safeArea = 0;
  let cautionArea = 0;
  let overhangArea = 0;
  let overhangTriangles = 0;

  for (let t = 0; t < numTriangles; t++) {
    const iA = index ? index.getX(t * 3) : t * 3;
    const iB = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const iC = index ? index.getX(t * 3 + 2) : t * 3 + 2;

    getVertex(iA, vA);
    getVertex(iB, vB);
    getVertex(iC, vC);

    // Compute face normal & triangle area
    edge1.subVectors(vB, vA);
    edge2.subVectors(vC, vA);
    normal.crossVectors(edge1, edge2);
    const area = normal.length() * 0.5;
    normal.normalize();

    if (area > 0.0001) {
      totalArea += area;

      // In Three.js, +Y is vertical build height, -Y faces print bed
      const ny = normal.y;
      if (ny >= 0) {
        safeArea += area;
      } else {
        const angleDeg = Math.asin(Math.min(1, Math.max(0, -ny))) * (180 / Math.PI);
        if (angleDeg <= 45) {
          safeArea += area;
        } else if (angleDeg <= 60) {
          cautionArea += area;
        } else {
          overhangArea += area;
          overhangTriangles++;
        }
      }
    }

    // Watertight check edge registering
    const kA = quantizeKey(vA.x, vA.y, vA.z);
    const kB = quantizeKey(vB.x, vB.y, vB.z);
    const kC = quantizeKey(vC.x, vC.y, vC.z);

    const addEdge = (p1: string, p2: string) => {
      const eKey = p1 < p2 ? `${p1}|${p2}` : `${p2}|${p1}`;
      edgeUsage.set(eKey, (edgeUsage.get(eKey) || 0) + 1);
    };

    addEdge(kA, kB);
    addEdge(kB, kC);
    addEdge(kC, kA);
  }

  // Check open edges
  let openEdges = 0;
  edgeUsage.forEach((count) => {
    if (count !== 2) {
      openEdges++;
    }
  });

  const safePct = totalArea > 0 ? Math.round((safeArea / totalArea) * 100) : 100;
  const cautionPct = totalArea > 0 ? Math.round((cautionArea / totalArea) * 100) : 0;
  const overhangPct = totalArea > 0 ? Math.round((overhangArea / totalArea) * 100) : 0;

  // Printability Score (0 - 100)
  const penalty = overhangPct * 1.35 + cautionPct * 0.35 + (openEdges > 0 ? 12 : 0);
  const score = Math.max(15, Math.min(100, Math.round(100 - penalty)));

  // Estimated support filament waste
  const estimatedSupportFilamentPct = Math.round(overhangPct * 0.55);
  const estimatedSupportWasteGrams = Number(
    (modelWeightGrams * (estimatedSupportFilamentPct / 100)).toFixed(1)
  );

  // Auto-Orientation Optimizer
  // Test canonical 90-degree rotations to find the orientation with minimal overhang
  const orientationCandidates = [
    { label: 'Current Orientation', desc: 'Default alignment', rotX: 0, rotY: 0, rotZ: 0 },
    { label: 'Inverted (Flip 180°)', desc: 'Flips top and bottom', rotX: Math.PI, rotY: 0, rotZ: 0 },
    { label: 'Pitch Forward 90°', desc: 'Rests on front face', rotX: Math.PI / 2, rotY: 0, rotZ: 0 },
    { label: 'Pitch Backward 90°', desc: 'Rests on back face', rotX: -Math.PI / 2, rotY: 0, rotZ: 0 },
    { label: 'Roll Right 90°', desc: 'Rests on right side', rotX: 0, rotY: 0, rotZ: Math.PI / 2 },
    { label: 'Roll Left 90°', desc: 'Rests on left side', rotX: 0, rotY: 0, rotZ: -Math.PI / 2 },
  ];

  let bestCandidate = orientationCandidates[0];
  let minCandidateOverhang = overhangArea;

  for (let c = 1; c < orientationCandidates.length; c++) {
    const cand = orientationCandidates[c];
    const euler = new THREE.Euler(cand.rotX, cand.rotY, cand.rotZ, 'XYZ');
    const rotMat = new THREE.Matrix4().makeRotationFromEuler(euler);

    let candOverhang = 0;
    for (let t = 0; t < numTriangles; t++) {
      const iA = index ? index.getX(t * 3) : t * 3;
      const iB = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const iC = index ? index.getX(t * 3 + 2) : t * 3 + 2;

      getVertex(iA, vA);
      getVertex(iB, vB);
      getVertex(iC, vC);

      edge1.subVectors(vB, vA);
      edge2.subVectors(vC, vA);
      normal.crossVectors(edge1, edge2);
      const a = normal.length() * 0.5;
      normal.normalize();

      normal.applyMatrix4(rotMat);

      if (a > 0.0001 && normal.y < 0) {
        const ang = Math.asin(Math.min(1, Math.max(0, -normal.y))) * (180 / Math.PI);
        if (ang > 60) {
          candOverhang += a;
        }
      }
    }

    if (candOverhang < minCandidateOverhang - 0.01) {
      minCandidateOverhang = candOverhang;
      bestCandidate = cand;
    }
  }

  const reduction = overhangArea > 0
    ? Math.max(0, Math.round(((overhangArea - minCandidateOverhang) / overhangArea) * 100))
    : 0;

  return {
    score,
    safePct,
    cautionPct,
    overhangPct,
    totalTriangles: Math.round(numTriangles),
    overhangTriangles,
    estimatedSupportFilamentPct,
    estimatedSupportWasteGrams,
    isWatertight: openEdges === 0,
    openEdgeCount: openEdges,
    recommendedOrientation: {
      label: bestCandidate.label,
      description: reduction > 0 
        ? `${bestCandidate.desc} — reduces support waste by ${reduction}%`
        : 'Current orientation is optimal with minimal overhangs.',
      rotX: bestCandidate.rotX,
      rotY: bestCandidate.rotY,
      rotZ: bestCandidate.rotZ,
      supportReductionPct: reduction,
    },
  };
}
