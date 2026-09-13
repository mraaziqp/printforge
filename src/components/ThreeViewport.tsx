import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { 
  RotateCcw, 
  Box, 
  Layers, 
  Sliders, 
  Eye, 
  Play, 
  Pause,
  AlertCircle,
  Ruler,
  ArrowDownToLine,
  ShieldCheck,
  Wrench,
  Sparkles,
  Boxes,
  Camera
} from 'lucide-react';
import { FILAMENT_SPECS } from '../mockData';
import { 
  FilamentType, 
  PrintabilityAuditResult, 
  HolePunchConfig, 
  TextEmbossConfig, 
  BridgeWebSocketMessage,
  PlacedModel,
  PlateNestingConfig,
  ToolpathLayer,
  ToolpathSimulationState,
  StudioLightingPreset,
  StudioSnapshotConfig
} from '../types';
import { MeshModifierDrawer } from './MeshModifierDrawer';
import { PrintabilityScoreCard } from './PrintabilityScoreCard';
import { HolographicBedTelemetry } from './HolographicBedTelemetry';
import { BuildPlateManager } from './BuildPlateManager';
import { GCodeVisualizer } from './GCodeVisualizer';
import { StudioSnapshotModal } from './StudioSnapshotModal';
import { 
  createOverhangHeatmapMaterial, 
  auditMeshPrintability 
} from '../utils/printabilityInspector';
import { 
  createHolePreviewGeometry, 
  create3DTextGeometry 
} from '../utils/meshModifier';
import { triggerStlDownload } from '../utils/stlExporter';
import { autoNestPlate, detectPlateCollisions } from '../utils/platePacker';
import { 
  generateToolpathLayers, 
  createToolpathGroup, 
  createVirtualNozzleMesh 
} from '../utils/toolpathGenerator';
import { createProceduralGeometry } from '../utils/geometryGenerator';
import { cacheStudioSnapshot } from '../utils/meshDatabase';

interface ThreeViewportProps {
  geometry: THREE.BufferGeometry;
  meshUrl?: string;
  filamentType?: FilamentType;
  dimensionsMm?: { x: number; y: number; z: number };
  autoRotateDefault?: boolean;
  className?: string;
  showControlsBar?: boolean;
  height?: string;
  onDimensionsChanged?: (newDims: { x: number; y: number; z: number }) => void;
  onGeometryChanged?: (newGeo: THREE.BufferGeometry) => void;
  // Module 3: Live telemetry & generation state
  isGenerating?: boolean;
  telemetry?: BridgeWebSocketMessage | null;
  generationProgress?: number;
  stageStatusText?: string;
  onSetMarketplaceCover?: (dataUrl: string) => void;
}

export const ThreeViewport: React.FC<ThreeViewportProps> = ({
  geometry,
  filamentType = 'PLA',
  dimensionsMm,
  autoRotateDefault = false,
  className = '',
  showControlsBar = true,
  height = 'h-96 md:h-[460px]',
  onDimensionsChanged,
  onGeometryChanged,
  isGenerating = false,
  telemetry = null,
  generationProgress = 0,
  stageStatusText = 'Engine Active',
  onSetMarketplaceCover,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fallbackCanvasRef = useRef<HTMLCanvasElement>(null);

  // Active geometry state (allowing in-browser CAD modifications)
  const [activeGeometry, setActiveGeometry] = useState<THREE.BufferGeometry>(geometry);
  const originalGeometryRef = useRef<THREE.BufferGeometry>(geometry);
  const [isModified, setIsModified] = useState<boolean>(false);

  // Drawer & Inspector UI states
  const [isModifierOpen, setIsModifierOpen] = useState<boolean>(false);
  const [auditMode, setAuditMode] = useState<boolean>(false);
  const [auditResult, setAuditResult] = useState<PrintabilityAuditResult | null>(null);

  // Module 1: Build Plate Multi-Model Nesting States
  const [isPlateManagerOpen, setIsPlateManagerOpen] = useState<boolean>(false);
  const [placedModels, setPlacedModels] = useState<PlacedModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>('primary');
  const [collidingIds, setCollidingIds] = useState<string[]>([]);
  const [bedUtilizationPct, setBedUtilizationPct] = useState<number>(18);

  // Module 2: G-Code Toolpath Slicer Visualizer States
  const [isToolpathMode, setIsToolpathMode] = useState<boolean>(false);
  const [toolpathLayers, setToolpathLayers] = useState<ToolpathLayer[]>([]);
  const [currentToolpathLayer, setCurrentToolpathLayer] = useState<number>(0);
  const [showAllPreviousLayers, setShowAllPreviousLayers] = useState<boolean>(true);
  const [simulationState, setSimulationState] = useState<ToolpathSimulationState>({
    isPlaying: false,
    playbackSpeed: 1,
    currentLayer: 0,
    totalLayers: 1,
    animProgress: 0,
    nozzlePos: [0, 0, 0],
  });

  // Module 3: Studio Snapshot & Cover Generator States
  const [isStudioModalOpen, setIsStudioModalOpen] = useState<boolean>(false);
  const [studioPreset, setStudioPreset] = useState<StudioLightingPreset>('cyber_studio');
  const [turntableActive, setTurntableActive] = useState<boolean>(false);

  // Viewport display states
  const [wireframe, setWireframe] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [showBoundingBox, setShowBoundingBox] = useState(true);
  const [showCalipers, setShowCalipers] = useState(false);
  const [autoRotate, setAutoRotate] = useState(autoRotateDefault);
  const [layerPreviewMode, setLayerPreviewMode] = useState(false);
  const [layerProgress, setLayerProgress] = useState(100);
  const [useFallback, setUseFallback] = useState(false);
  const [webglError, setWebglError] = useState<string | null>(null);
  const [liveDimensions, setLiveDimensions] = useState<{ x: number; y: number; z: number }>(
    dimensionsMm || { x: 45, y: 45, z: 35 }
  );

  // Preview helpers refs
  const previewHoleMeshRef = useRef<THREE.Mesh | null>(null);
  const previewTextMeshRef = useRef<THREE.Mesh | null>(null);
  const heatmapMaterialRef = useRef<THREE.ShaderMaterial | null>(null);
  const standardMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const toolpathGroupRef = useRef<{ group: THREE.Group; disposables: any[] } | null>(null);
  const nozzleMeshRef = useRef<THREE.Mesh | null>(null);
  const nozzleDisposablesRef = useRef<any[]>([]);
  const placedMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const selectionHelperRef = useRef<THREE.BoxHelper | null>(null);

  // Three.js instances ref
  const threeRefs = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    mesh: THREE.Mesh;
    plateGroup: THREE.Group;
    boxHelper: THREE.BoxHelper;
    gridHelper: THREE.GridHelper;
    bedMesh: THREE.Mesh;
    clipPlane: THREE.Plane;
    caliperGroup: THREE.Group;
    holographicRing?: THREE.Mesh;
    ambientLight: THREE.AmbientLight;
    dirLight1: THREE.DirectionalLight;
    dirLight2: THREE.DirectionalLight;
    rimLight: THREE.DirectionalLight;
  } | null>(null);

  const filamentSpec = FILAMENT_SPECS[filamentType] || FILAMENT_SPECS.PLA;
  const meshColor = filamentSpec.color;

  // The render loop is created once per WebGL context, so it reads live UI state through this ref
  // instead of the values captured when the scene was initialized.
  const animStateRef = useRef({ autoRotate, turntableActive, isGenerating, isToolpathMode, simulationState, toolpathLayers });
  animStateRef.current = { autoRotate, turntableActive, isGenerating, isToolpathMode, simulationState, toolpathLayers };

  // Initialize primary placedModel when geometry changes
  useEffect(() => {
    const primary: PlacedModel = {
      id: 'primary',
      name: 'Primary Model',
      geometry: activeGeometry,
      color: meshColor,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      dimensionsMm: liveDimensions,
      weightGrams: 28,
      printTimeMinutes: 75,
      triangleCount: activeGeometry.attributes.position
        ? Math.round(activeGeometry.attributes.position.count / 3)
        : 1200,
      filamentType: (filamentType as FilamentType) || 'PLA',
    };

    setPlacedModels((prev) => {
      if (prev.length === 0) return [primary];
      // Update primary model's geometry
      return prev.map((m) => (m.id === 'primary' ? { ...m, geometry: activeGeometry, dimensionsMm: liveDimensions } : m));
    });
  }, [activeGeometry, liveDimensions, filamentType, meshColor]);

  // Helper to recompute live dimensions & snap to bed
  const updateBoundingAndDimensions = useCallback(() => {
    if (!threeRefs.current) return;
    const { mesh, boxHelper } = threeRefs.current;

    boxHelper.update();
    const box = new THREE.Box3().setFromObject(mesh);
    const size = new THREE.Vector3();
    box.getSize(size);

    const newDims = {
      x: Math.max(1, Math.round(size.x)),
      y: Math.max(1, Math.round(size.z)),
      z: Math.max(1, Math.round(size.y)),
    };
    setLiveDimensions(newDims);
    if (onDimensionsChanged) {
      onDimensionsChanged(newDims);
    }
  }, [onDimensionsChanged]);

  // Snap to Bed: Aligns lowest vertex of mesh to Y=0.05 on the print bed
  const handleSnapToBed = useCallback(() => {
    if (!threeRefs.current) return;
    const { mesh, boxHelper, clipPlane } = threeRefs.current;

    const box = new THREE.Box3().setFromObject(mesh);
    const currentMinY = box.min.y;

    mesh.position.y += 0.05 - currentMinY;
    mesh.updateMatrixWorld();

    boxHelper.setFromObject(mesh);
    updateBoundingAndDimensions();

    const updatedBox = new THREE.Box3().setFromObject(mesh);
    const heightMm = updatedBox.max.y - updatedBox.min.y;
    clipPlane.constant = updatedBox.min.y + (layerProgress / 100) * heightMm;
  }, [layerProgress, updateBoundingAndDimensions]);

  // 90° Axis Rotations (X, Y, Z)
  const handleRotate90 = useCallback(
    (axis: 'x' | 'y' | 'z') => {
      if (!threeRefs.current) return;
      const { mesh } = threeRefs.current;

      if (axis === 'x') {
        mesh.rotateX(Math.PI / 2);
      } else if (axis === 'y') {
        mesh.rotateY(Math.PI / 2);
      } else if (axis === 'z') {
        mesh.rotateZ(Math.PI / 2);
      }

      mesh.updateMatrixWorld();
      setTimeout(() => {
        handleSnapToBed();
        if (auditMode) {
          const res = auditMeshPrintability(mesh.geometry, 45, mesh.matrixWorld);
          setAuditResult(res);
        }
      }, 30);
    },
    [handleSnapToBed, auditMode]
  );

  // Toggle Printability Audit & Overhang Heatmap Shader
  const handleToggleAudit = useCallback(() => {
    if (!threeRefs.current) return;
    const { mesh } = threeRefs.current;
    const nextMode = !auditMode;
    setAuditMode(nextMode);

    if (nextMode) {
      if (!heatmapMaterialRef.current) {
        heatmapMaterialRef.current = createOverhangHeatmapMaterial();
      }
      mesh.material = heatmapMaterialRef.current;
      mesh.material.needsUpdate = true;

      const result = auditMeshPrintability(mesh.geometry, 45, mesh.matrixWorld);
      setAuditResult(result);
    } else {
      if (standardMaterialRef.current) {
        mesh.material = standardMaterialRef.current;
        mesh.material.needsUpdate = true;
      }
      setAuditResult(null);
    }
  }, [auditMode]);

  // Auto-Orient for Least Supports
  const handleAutoOrient = useCallback(
    (orientation: { rotX: number; rotY: number; rotZ: number }) => {
      if (!threeRefs.current) return;
      const { mesh } = threeRefs.current;

      mesh.rotation.set(orientation.rotX, orientation.rotY, orientation.rotZ);
      mesh.updateMatrixWorld();
      handleSnapToBed();

      const newAudit = auditMeshPrintability(mesh.geometry, 45, mesh.matrixWorld);
      setAuditResult(newAudit);
    },
    [handleSnapToBed]
  );

  // Apply modified geometry from Drawer
  const handleApplyModifiedGeometry = useCallback(
    (newGeo: THREE.BufferGeometry, _actionLabel: string) => {
      if (!threeRefs.current) return;
      const { mesh, boxHelper } = threeRefs.current;

      mesh.geometry.dispose();
      mesh.geometry = newGeo.clone();
      mesh.updateMatrixWorld();
      boxHelper.setFromObject(mesh);
      handleSnapToBed();

      setActiveGeometry(newGeo);
      setIsModified(true);

      if (onGeometryChanged) {
        onGeometryChanged(newGeo);
      }

      if (auditMode) {
        const newAudit = auditMeshPrintability(newGeo, 45, mesh.matrixWorld);
        setAuditResult(newAudit);
      }
    },
    [handleSnapToBed, onGeometryChanged, auditMode]
  );

  // Revert all modifications to original geometry
  const handleResetGeometry = useCallback(() => {
    if (!threeRefs.current) return;
    const { mesh, boxHelper } = threeRefs.current;
    const orig = originalGeometryRef.current;

    mesh.geometry.dispose();
    mesh.geometry = orig.clone();
    mesh.updateMatrixWorld();
    boxHelper.setFromObject(mesh);
    handleSnapToBed();

    setActiveGeometry(orig);
    setIsModified(false);

    if (onGeometryChanged) {
      onGeometryChanged(orig);
    }

    if (auditMode) {
      const newAudit = auditMeshPrintability(orig, 45, mesh.matrixWorld);
      setAuditResult(newAudit);
    }
  }, [handleSnapToBed, onGeometryChanged, auditMode]);

  // Export Modified STL directly from viewport
  const handleExportModifiedStl = useCallback(() => {
    if (!threeRefs.current) return;
    const { mesh } = threeRefs.current;
    mesh.geometry.computeVertexNormals();
    triggerStlDownload(mesh.geometry, 'printforge_modified.stl');
  }, []);

  // Update Live Hole Preview in 3D scene
  const handleUpdatePreviewHole = useCallback((config: HolePunchConfig | null) => {
    if (!threeRefs.current) return;
    const { scene } = threeRefs.current;

    if (previewHoleMeshRef.current) {
      scene.remove(previewHoleMeshRef.current);
      previewHoleMeshRef.current.geometry.dispose();
      (previewHoleMeshRef.current.material as THREE.Material).dispose();
      previewHoleMeshRef.current = null;
    }

    if (config) {
      const geo = createHolePreviewGeometry(config);
      const mat = new THREE.MeshBasicMaterial({
        color: 0x06b6d4,
        transparent: true,
        opacity: 0.65,
        wireframe: false,
        depthWrite: false,
      });
      const holeMesh = new THREE.Mesh(geo, mat);

      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo),
        new THREE.LineBasicMaterial({ color: 0x22d3ee, linewidth: 2 })
      );
      holeMesh.add(edges);

      scene.add(holeMesh);
      previewHoleMeshRef.current = holeMesh;
    }
  }, []);

  // Update Live Text Preview in 3D scene
  const handleUpdatePreviewText = useCallback((config: TextEmbossConfig | null) => {
    if (!threeRefs.current) return;
    const { scene } = threeRefs.current;

    if (previewTextMeshRef.current) {
      scene.remove(previewTextMeshRef.current);
      previewTextMeshRef.current.geometry.dispose();
      (previewTextMeshRef.current.material as THREE.Material).dispose();
      previewTextMeshRef.current = null;
    }

    if (config && config.text.trim().length > 0) {
      const textGeo = create3DTextGeometry(
        config.text,
        config.fontSize,
        Math.max(0.6, Math.abs(config.depth))
      );

      if (config.placement === 'top') {
        textGeo.rotateX(-Math.PI / 2);
      } else if (config.placement === 'side') {
        textGeo.rotateY(Math.PI / 2);
      }
      textGeo.translate(config.posX, config.posY, config.posZ);

      const mat = new THREE.MeshBasicMaterial({
        color: config.isEngrave ? 0xf59e0b : 0x10b981,
        transparent: true,
        opacity: 0.75,
        wireframe: false,
        depthWrite: false,
      });
      const tMesh = new THREE.Mesh(textGeo, mat);
      scene.add(tMesh);
      previewTextMeshRef.current = tMesh;
    }
  }, []);

  // Build 3D Caliper Overlay Lines
  const updateCaliperOverlay = useCallback(() => {
    if (!threeRefs.current) return;
    const { caliperGroup, mesh } = threeRefs.current;

    while (caliperGroup.children.length > 0) {
      const child = caliperGroup.children[0];
      caliperGroup.remove(child);
      if ((child as any).geometry) (child as any).geometry.dispose();
      if ((child as any).material) (child as any).material.dispose();
    }

    if (!showCalipers) return;

    const box = new THREE.Box3().setFromObject(mesh);
    const { min, max } = box;

    const caliperMat = new THREE.LineBasicMaterial({
      color: 0x06b6d4,
      linewidth: 2,
    });

    const createGuideLine = (start: THREE.Vector3, end: THREE.Vector3) => {
      const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
      return new THREE.Line(geo, caliperMat);
    };

    const xStart = new THREE.Vector3(min.x, min.y, max.z + 6);
    const xEnd = new THREE.Vector3(max.x, min.y, max.z + 6);
    caliperGroup.add(createGuideLine(xStart, xEnd));
    caliperGroup.add(
      createGuideLine(new THREE.Vector3(min.x, min.y, max.z + 3), new THREE.Vector3(min.x, min.y, max.z + 9))
    );
    caliperGroup.add(
      createGuideLine(new THREE.Vector3(max.x, min.y, max.z + 3), new THREE.Vector3(max.x, min.y, max.z + 9))
    );

    const zStart = new THREE.Vector3(max.x + 6, min.y, min.z);
    const zEnd = new THREE.Vector3(max.x + 6, min.y, max.z);
    caliperGroup.add(createGuideLine(zStart, zEnd));
    caliperGroup.add(
      createGuideLine(new THREE.Vector3(max.x + 3, min.y, min.z), new THREE.Vector3(max.x + 9, min.y, min.z))
    );
    caliperGroup.add(
      createGuideLine(new THREE.Vector3(max.x + 3, min.y, max.z), new THREE.Vector3(max.x + 9, min.y, max.z))
    );

    const yStart = new THREE.Vector3(min.x - 6, min.y, min.z);
    const yEnd = new THREE.Vector3(min.x - 6, max.y, min.z);
    caliperGroup.add(createGuideLine(yStart, yEnd));
    caliperGroup.add(
      createGuideLine(new THREE.Vector3(min.x - 9, min.y, min.z), new THREE.Vector3(min.x - 3, min.y, min.z))
    );
    caliperGroup.add(
      createGuideLine(new THREE.Vector3(min.x - 9, max.y, min.z), new THREE.Vector3(min.x - 3, max.y, min.z))
    );
  }, [showCalipers]);

  // Apply Lighting Preset dynamically
  const applyLightingPreset = useCallback((preset: StudioLightingPreset) => {
    if (!threeRefs.current) return;
    const { scene, ambientLight, dirLight1, dirLight2, rimLight } = threeRefs.current;

    if (preset === 'cyber_studio') {
      scene.background = new THREE.Color(0x0a0e17);
      scene.fog = new THREE.FogExp2(0x0a0e17, 0.0035);
      ambientLight.color.setHex(0xffffff);
      ambientLight.intensity = 0.95;
      dirLight1.color.setHex(0x22d3ee);
      dirLight1.intensity = 1.4;
      dirLight2.color.setHex(0x10b981);
      dirLight2.intensity = 1.1;
      rimLight.color.setHex(0xec4899);
      rimLight.intensity = 0.6;
    } else if (preset === 'neutral_sunlight') {
      scene.background = new THREE.Color(0x1e293b);
      scene.fog = null;
      ambientLight.color.setHex(0xffffff);
      ambientLight.intensity = 1.35;
      dirLight1.color.setHex(0xfffbeb); // warm key
      dirLight1.intensity = 1.8;
      dirLight2.color.setHex(0x94a3b8);
      dirLight2.intensity = 0.9;
      rimLight.color.setHex(0x64748b);
      rimLight.intensity = 0.4;
    } else if (preset === 'showcase_turntable') {
      scene.background = new THREE.Color(0x030712);
      scene.fog = new THREE.FogExp2(0x030712, 0.004);
      ambientLight.color.setHex(0xffffff);
      ambientLight.intensity = 0.7;
      dirLight1.color.setHex(0xffffff);
      dirLight1.intensity = 2.2;
      dirLight2.color.setHex(0x38bdf8);
      dirLight2.intensity = 1.4;
      rimLight.color.setHex(0xf59e0b);
      rimLight.intensity = 1.2;
    }
  }, []);

  // Update Studio Preset
  useEffect(() => {
    applyLightingPreset(studioPreset);
  }, [studioPreset, applyLightingPreset]);

  // Capture High-Res Snapshot function
  const handleCaptureSnapshot = useCallback(
    async (config: StudioSnapshotConfig): Promise<string | null> => {
      if (!threeRefs.current) return null;
      const { renderer, scene, camera } = threeRefs.current;

      // Switch to target snapshot resolution
      renderer.setSize(config.width, config.height, false);
      camera.aspect = config.width / config.height;
      camera.updateProjectionMatrix();

      // Background setting
      const prevBg = scene.background;
      if (config.transparentBg) {
        scene.background = null;
      }

      // Hide temporary UI helpers for clean capture
      if (threeRefs.current.boxHelper) threeRefs.current.boxHelper.visible = false;
      if (selectionHelperRef.current) selectionHelperRef.current.visible = false;
      if (nozzleMeshRef.current) nozzleMeshRef.current.visible = false;

      renderer.render(scene, camera);
      const dataUrl = renderer.domElement.toDataURL('image/png');

      // Restore scene
      scene.background = prevBg;
      if (threeRefs.current.boxHelper) threeRefs.current.boxHelper.visible = showBoundingBox;
      if (selectionHelperRef.current) selectionHelperRef.current.visible = true;
      if (nozzleMeshRef.current) nozzleMeshRef.current.visible = isToolpathMode;

      renderer.setSize(containerRef.current?.clientWidth || 400, containerRef.current?.clientHeight || 360, true);
      camera.aspect = (containerRef.current?.clientWidth || 400) / (containerRef.current?.clientHeight || 360);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);

      // Cache to IndexedDB
      await cacheStudioSnapshot(`snapshot_${Date.now()}`, dataUrl, config.preset);

      return dataUrl;
    },
    [showBoundingBox, isToolpathMode]
  );

  // Initialize WebGL Scene
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas || useFallback) return;

    try {
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) {
        setUseFallback(true);
        setWebglError('WebGL not available in environment. Using HTML5 Canvas fallback.');
        return;
      }
    } catch {
      setUseFallback(true);
      return;
    }

    const width = container.clientWidth || 400;
    const heightPx = container.clientHeight || 360;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0e17);
    scene.fog = new THREE.FogExp2(0x0a0e17, 0.0035);

    const camera = new THREE.PerspectiveCamera(45, width / heightPx, 0.1, 1000);
    camera.position.set(115, 115, 145);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      });
    } catch (e) {
      console.warn('WebGL Renderer error:', e);
      setUseFallback(true);
      return;
    }

    renderer.setSize(width, heightPx);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.localClippingEnabled = true;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.minDistance = 25;
    controls.maxDistance = 450;
    controls.target.set(0, 20, 0);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0x22d3ee, 1.4);
    dirLight1.position.set(100, 160, 90);
    dirLight1.castShadow = true;
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x10b981, 1.1);
    dirLight2.position.set(-100, 120, -90);
    scene.add(dirLight2);

    const rimLight = new THREE.DirectionalLight(0xec4899, 0.6);
    rimLight.position.set(0, -50, 120);
    scene.add(rimLight);

    // Bed 220 x 220 mm
    const bedGeo = new THREE.PlaneGeometry(220, 220);
    const bedMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.85,
      metalness: 0.2,
      side: THREE.DoubleSide,
    });
    const bedMesh = new THREE.Mesh(bedGeo, bedMat);
    bedMesh.rotation.x = -Math.PI / 2;
    bedMesh.position.y = -0.1;
    bedMesh.receiveShadow = true;
    scene.add(bedMesh);

    // Bed border
    const bedBorderGeo = new THREE.EdgesGeometry(bedGeo);
    const bedBorderMat = new THREE.LineBasicMaterial({ color: 0x10b981, linewidth: 2 });
    const bedBorder = new THREE.LineSegments(bedBorderGeo, bedBorderMat);
    bedBorder.rotation.x = -Math.PI / 2;
    scene.add(bedBorder);

    // Grid (220mm)
    const gridHelper = new THREE.GridHelper(220, 22, 0x10b981, 0x1f293d);
    gridHelper.position.y = 0.05;
    scene.add(gridHelper);

    // Caliper group
    const caliperGroup = new THREE.Group();
    scene.add(caliperGroup);

    // Multi-model plate group
    const plateGroup = new THREE.Group();
    scene.add(plateGroup);

    // Holographic ring mesh on the bed for generation animation
    const holoRingGeo = new THREE.TorusGeometry(36, 0.6, 8, 48);
    const holoRingMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.8,
    });
    const holoRing = new THREE.Mesh(holoRingGeo, holoRingMat);
    holoRing.rotation.x = Math.PI / 2;
    holoRing.position.y = 0.8;
    holoRing.visible = false;
    scene.add(holoRing);

    // Slicer clipping plane along Y-axis
    const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 100);

    // Standard material
    const standardMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(meshColor),
      roughness: 0.25,
      metalness: 0.35,
      wireframe: wireframe,
      clippingPlanes: layerPreviewMode ? [clipPlane] : [],
      clipShadows: true,
    });
    standardMaterialRef.current = standardMaterial;

    const mesh = new THREE.Mesh(activeGeometry.clone(), standardMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    // Align to bed
    activeGeometry.computeBoundingBox();
    const bBox = activeGeometry.boundingBox || new THREE.Box3();
    const minY = bBox.min.y;
    mesh.position.y = -minY + 0.1;

    // Bounding Box Helper
    const boxHelper = new THREE.BoxHelper(mesh, new THREE.Color(0x22d3ee));
    boxHelper.visible = showBoundingBox;
    scene.add(boxHelper);

    threeRefs.current = {
      scene,
      camera,
      renderer,
      controls,
      mesh,
      plateGroup,
      boxHelper,
      gridHelper,
      bedMesh,
      clipPlane,
      caliperGroup,
      holographicRing: holoRing,
      ambientLight,
      dirLight1,
      dirLight2,
      rimLight,
    };

    updateBoundingAndDimensions();

    // Animation Loop
    let animId: number;
    let simTimer = 0;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (threeRefs.current) {
        const anim = animStateRef.current;

        // Auto-rotation or Turntable Spin
        if (anim.autoRotate || anim.turntableActive) {
          threeRefs.current.mesh.rotation.y += 0.008;
          threeRefs.current.plateGroup.rotation.y += 0.008;
          threeRefs.current.boxHelper.update();
        }

        // Holographic Progress Ring
        if (threeRefs.current.holographicRing && anim.isGenerating) {
          threeRefs.current.holographicRing.visible = true;
          threeRefs.current.holographicRing.rotation.z += 0.04;
        } else if (threeRefs.current.holographicRing) {
          threeRefs.current.holographicRing.visible = false;
        }

        // Toolpath simulation playback logic
        const layers = anim.toolpathLayers;
        if (anim.isToolpathMode && anim.simulationState.isPlaying && layers.length > 0) {
          simTimer += 1;
          const stepInterval = Math.max(1, Math.round(6 / anim.simulationState.playbackSpeed));

          if (simTimer % stepInterval === 0) {
            setSimulationState((prev) => {
              const currentL = layers[prev.currentLayer];
              if (!currentL || currentL.segments.length === 0) return prev;

              let nextProg = prev.animProgress + 0.035 * prev.playbackSpeed;
              let nextLayer = prev.currentLayer;

              if (nextProg >= 1.0) {
                nextProg = 0;
                nextLayer = (prev.currentLayer + 1) % layers.length;
                setCurrentToolpathLayer(nextLayer);
              }

              // Interpolate nozzle position along current layer segments
              const segIdx = Math.min(
                currentL.segments.length - 1,
                Math.floor(nextProg * currentL.segments.length)
              );
              const activeSeg = currentL.segments[segIdx];
              const segT = (nextProg * currentL.segments.length) % 1;

              const nx = activeSeg.start[0] + (activeSeg.end[0] - activeSeg.start[0]) * segT;
              const ny = activeSeg.start[1];
              const nz = activeSeg.start[2] + (activeSeg.end[2] - activeSeg.start[2]) * segT;

              if (nozzleMeshRef.current) {
                nozzleMeshRef.current.position.set(nx, ny, nz);
              }

              return {
                ...prev,
                currentLayer: nextLayer,
                animProgress: nextProg,
                nozzlePos: [nx, ny, nz],
              };
            });
          }
        }

        threeRefs.current.controls.update();
        threeRefs.current.renderer.render(threeRefs.current.scene, threeRefs.current.camera);
      }
    };
    animate();

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: newW, height: newH } = entry.contentRect;
        if (newW > 0 && newH > 0 && threeRefs.current) {
          threeRefs.current.camera.aspect = newW / newH;
          threeRefs.current.camera.updateProjectionMatrix();
          threeRefs.current.renderer.setSize(newW, newH);
        }
      }
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      controls.dispose();
      // Everything still attached to the scene: bed, grid, helpers, the model clone, calipers,
      // plate copies, hole/text previews, toolpath lines and the nozzle.
      scene.traverse((obj) => {
        const node = obj as THREE.Mesh;
        if (node.geometry) node.geometry.dispose();
        const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
        materials.forEach((m) => m.dispose());
      });
      standardMaterial.dispose();
      if (heatmapMaterialRef.current) {
        heatmapMaterialRef.current.dispose();
        heatmapMaterialRef.current = null;
      }
      // Drop refs to objects of the disposed scene so a remount (StrictMode, 2D/3D toggle) rebuilds them
      toolpathGroupRef.current = null;
      nozzleMeshRef.current = null;
      nozzleDisposablesRef.current = [];
      previewHoleMeshRef.current = null;
      previewTextMeshRef.current = null;
      placedMeshesRef.current.clear();
      renderer.dispose();
      threeRefs.current = null;
    };
  }, [useFallback]);

  // Sync prop geometry updates
  useEffect(() => {
    setActiveGeometry(geometry);
    originalGeometryRef.current = geometry;
    setIsModified(false);

    if (!threeRefs.current) return;
    const { mesh, boxHelper, clipPlane } = threeRefs.current;

    mesh.geometry.dispose();
    mesh.geometry = geometry.clone();
    mesh.rotation.set(0, 0, 0);

    mesh.geometry.computeBoundingBox();
    const bBox = mesh.geometry.boundingBox || new THREE.Box3();
    const minY = bBox.min.y;
    mesh.position.set(0, -minY + 0.1, 0);
    mesh.updateMatrixWorld();

    boxHelper.setFromObject(mesh);
    updateBoundingAndDimensions();

    const heightMm = bBox.max.y - bBox.min.y;
    clipPlane.constant = mesh.position.y + bBox.min.y + (layerProgress / 100) * heightMm;

    if (auditMode) {
      const res = auditMeshPrintability(mesh.geometry, 45, mesh.matrixWorld);
      setAuditResult(res);
    }
  }, [geometry, updateBoundingAndDimensions]);

  // Update Material / Wireframe / Slicer Clipping
  useEffect(() => {
    if (!threeRefs.current) return;
    const { mesh, clipPlane } = threeRefs.current;

    if (!auditMode && standardMaterialRef.current) {
      standardMaterialRef.current.color.set(meshColor);
      standardMaterialRef.current.wireframe = wireframe;
      standardMaterialRef.current.clippingPlanes = layerPreviewMode ? [clipPlane] : [];
      standardMaterialRef.current.needsUpdate = true;
    } else if (auditMode && heatmapMaterialRef.current) {
      heatmapMaterialRef.current.wireframe = wireframe;
      heatmapMaterialRef.current.needsUpdate = true;
    }

    const box = new THREE.Box3().setFromObject(mesh);
    const heightMm = Math.max(10, box.max.y - box.min.y);
    const cutY = box.min.y + (layerProgress / 100) * heightMm;
    clipPlane.constant = cutY;

    updateCaliperOverlay();
  }, [meshColor, wireframe, layerPreviewMode, layerProgress, showCalipers, auditMode, updateCaliperOverlay]);

  // Update Bounding Box & Grid visibility
  useEffect(() => {
    if (!threeRefs.current) return;
    threeRefs.current.boxHelper.visible = showBoundingBox;
    threeRefs.current.gridHelper.visible = showGrid;
    threeRefs.current.bedMesh.visible = showGrid;
  }, [showBoundingBox, showGrid]);

  // Sync Placed Models on PlateGroup (Multi-Mesh Staging)
  useEffect(() => {
    if (!threeRefs.current) return;
    const { plateGroup } = threeRefs.current;

    // Clear old extra meshes
    while (plateGroup.children.length > 0) {
      const child = plateGroup.children[0] as THREE.Mesh;
      plateGroup.remove(child);
      if (child.geometry && child.geometry !== activeGeometry) {
        child.geometry.dispose();
      }
      if (child.material) {
        (child.material as THREE.Material).dispose();
      }
    }
    placedMeshesRef.current.clear();

    // Re-create meshes for non-primary placed models
    placedModels.forEach((model) => {
      if (model.id === 'primary') {
        // Update primary mesh transform
        threeRefs.current!.mesh.position.set(model.position.x, model.position.y + 0.1, model.position.z);
        threeRefs.current!.mesh.rotation.set(model.rotation.x, model.rotation.y, model.rotation.z);
        threeRefs.current!.mesh.scale.set(model.scale.x, model.scale.y, model.scale.z);
        threeRefs.current!.mesh.updateMatrixWorld();
        threeRefs.current!.boxHelper.update();
        placedMeshesRef.current.set('primary', threeRefs.current!.mesh);
      } else {
        const mat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(model.color || 0x22d3ee),
          roughness: 0.3,
          metalness: 0.35,
          wireframe,
        });
        const extraMesh = new THREE.Mesh(model.geometry.clone(), mat);
        extraMesh.castShadow = true;
        extraMesh.receiveShadow = true;
        extraMesh.position.set(model.position.x, model.position.y + 0.1, model.position.z);
        extraMesh.rotation.set(model.rotation.x, model.rotation.y, model.rotation.z);
        extraMesh.scale.set(model.scale.x, model.scale.y, model.scale.z);
        extraMesh.updateMatrixWorld();

        plateGroup.add(extraMesh);
        placedMeshesRef.current.set(model.id, extraMesh);
      }
    });

    // Check collisions
    const collisions = Array.from(detectPlateCollisions(placedModels, 2));
    setCollidingIds(collisions);
  }, [placedModels, wireframe, activeGeometry]);

  // Sync Toolpath Slicer Visualizer Layers
  useEffect(() => {
    if (!threeRefs.current) return;
    const { scene } = threeRefs.current;

    if (!isToolpathMode) {
      // Remove toolpath group if present
      if (toolpathGroupRef.current) {
        scene.remove(toolpathGroupRef.current.group);
        toolpathGroupRef.current.disposables.forEach((d) => {
          d.geometry.dispose();
          d.material.dispose();
        });
        toolpathGroupRef.current = null;
      }
      if (nozzleMeshRef.current) {
        scene.remove(nozzleMeshRef.current);
        nozzleDisposablesRef.current.forEach((d) => {
          d.geometry.dispose();
          d.material.dispose();
        });
        nozzleMeshRef.current = null;
        nozzleDisposablesRef.current = [];
      }
      if (standardMaterialRef.current) {
        standardMaterialRef.current.opacity = 1.0;
        standardMaterialRef.current.transparent = false;
      }
      return;
    }

    // Generate layers if not generated yet
    let layers = toolpathLayers;
    if (layers.length === 0) {
      layers = generateToolpathLayers(activeGeometry, 0.2, 20);
      setToolpathLayers(layers);
      setSimulationState((prev) => ({
        ...prev,
        totalLayers: layers.length,
        currentLayer: 0,
      }));
    }

    // Semi-transparent solid mesh to emphasize neon toolpaths
    if (standardMaterialRef.current) {
      standardMaterialRef.current.opacity = 0.22;
      standardMaterialRef.current.transparent = true;
      standardMaterialRef.current.needsUpdate = true;
    }

    // Remove previous toolpath group
    if (toolpathGroupRef.current) {
      scene.remove(toolpathGroupRef.current.group);
      toolpathGroupRef.current.disposables.forEach((d) => {
        d.geometry.dispose();
        d.material.dispose();
      });
      toolpathGroupRef.current = null;
    }

    // Build new toolpath lines group
    const { group, disposables } = createToolpathGroup(
      layers,
      currentToolpathLayer,
      showAllPreviousLayers
    );
    scene.add(group);
    toolpathGroupRef.current = { group, disposables };

    // Create virtual nozzle mesh if needed
    if (!nozzleMeshRef.current) {
      const { mesh: nMesh, disposables: nDisp } = createVirtualNozzleMesh();
      scene.add(nMesh);
      nozzleMeshRef.current = nMesh;
      nozzleDisposablesRef.current = nDisp;
    }

    // Set nozzle initial position
    const activeL = layers[currentToolpathLayer];
    if (activeL && activeL.segments.length > 0 && nozzleMeshRef.current) {
      const pt = activeL.segments[0].start;
      nozzleMeshRef.current.position.set(pt[0], pt[1], pt[2]);
    }
  }, [isToolpathMode, toolpathLayers, currentToolpathLayer, showAllPreviousLayers, activeGeometry]);

  // Click on Canvas to Select Placed Model
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!threeRefs.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), threeRefs.current.camera);

    const meshes = Array.from(placedMeshesRef.current.values());
    const hits = raycaster.intersectObjects(meshes as THREE.Object3D[], false);

    if (hits.length > 0) {
      const hitObj = hits[0].object as THREE.Mesh;
      for (const [id, m] of placedMeshesRef.current.entries()) {
        if (m === hitObj) {
          setSelectedModelId(id);
          break;
        }
      }
    }
  };

  // Plate Manager Actions
  const handleAutoNest = useCallback((config: PlateNestingConfig) => {
    const result = autoNestPlate(placedModels, config);
    setPlacedModels(result.packedModels);
    setCollidingIds(result.collisions);
    setBedUtilizationPct(result.bedUtilizationPct);
  }, [placedModels]);

  const handleAddModelToPlate = useCallback((presetKey: string) => {
    const geo = createProceduralGeometry(presetKey as any);
    geo.computeBoundingBox();
    const bBox = geo.boundingBox || new THREE.Box3();
    const size = new THREE.Vector3();
    bBox.getSize(size);

    const newId = `model_${presetKey}_${Date.now()}`;
    const newModel: PlacedModel = {
      id: newId,
      name: `${presetKey.charAt(0).toUpperCase() + presetKey.slice(1)} Part`,
      geometry: geo,
      color: presetKey === 'dragon' ? '#ec4899' : presetKey === 'gear' ? '#f59e0b' : '#10b981',
      position: { x: Math.round((Math.random() - 0.5) * 60), y: 0, z: Math.round((Math.random() - 0.5) * 60) },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      dimensionsMm: { x: Math.round(size.x), y: Math.round(size.z), z: Math.round(size.y) },
      weightGrams: presetKey === 'dragon' ? 42 : presetKey === 'gear' ? 22 : 18,
      printTimeMinutes: presetKey === 'dragon' ? 110 : 55,
      triangleCount: geo.attributes.position ? Math.round(geo.attributes.position.count / 3) : 1000,
      filamentType: 'PLA',
    };

    setPlacedModels((prev) => [...prev, newModel]);
    setSelectedModelId(newId);
  }, []);

  const handleDuplicateModel = useCallback((id: string) => {
    const source = placedModels.find((m) => m.id === id);
    if (!source) return;

    const dupId = `dup_${Date.now()}`;
    const duplicate: PlacedModel = {
      ...source,
      id: dupId,
      name: `${source.name} (Copy)`,
      position: { x: Math.min(90, source.position.x + 15), y: source.position.y, z: Math.min(90, source.position.z + 15) },
    };

    setPlacedModels((prev) => [...prev, duplicate]);
    setSelectedModelId(dupId);
  }, [placedModels]);

  const handleRemoveModel = useCallback((id: string) => {
    if (placedModels.length <= 1) return;
    setPlacedModels((prev) => prev.filter((m) => m.id !== id));
    setSelectedModelId('primary');
  }, [placedModels.length]);

  const handleUpdateModelTransform = useCallback(
    (id: string, pos: { x: number; y: number; z: number }, rot: { x: number; y: number; z: number }) => {
      setPlacedModels((prev) =>
        prev.map((m) => (m.id === id ? { ...m, position: pos, rotation: rot } : m))
      );
    },
    []
  );

  // Reset Camera View
  const handleResetCamera = useCallback(() => {
    if (!threeRefs.current) return;
    threeRefs.current.camera.position.set(115, 115, 145);
    threeRefs.current.controls.target.set(0, 20, 0);
    threeRefs.current.mesh.rotation.set(0, 0, 0);
    handleSnapToBed();
  }, [handleSnapToBed]);

  // HTML5 Canvas Fallback Renderer
  useEffect(() => {
    if (!useFallback || !fallbackCanvasRef.current) return;
    const canvas = fallbackCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let angle = 0;
    let animId: number;

    const render2d = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#0b0f17';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const cx = canvas.width / 2;
      const cy = canvas.height / 2 + 50;

      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      for (let i = -5; i <= 5; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + i * 20 - 100, cy + i * 10);
        ctx.lineTo(cx + i * 20 + 100, cy + i * 10 - 50);
        ctx.stroke();
      }

      ctx.save();
      ctx.translate(cx, cy - 40);
      angle += 0.02;

      ctx.strokeStyle = meshColor;
      ctx.lineWidth = 2;
      const size = 60;
      const cos = Math.cos(angle);

      ctx.beginPath();
      ctx.rect(-size * cos, -size / 2, size * cos * 2, size);
      ctx.stroke();

      ctx.strokeStyle = '#22d3ee';
      ctx.beginPath();
      ctx.arc(0, -size / 2, 25, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px monospace';
      ctx.fillText('HTML5 Canvas Fallback Viewport (2D Wireframe)', 20, 30);
      ctx.fillText(
        `Dimensions: ${liveDimensions.x}mm x ${liveDimensions.y}mm x ${liveDimensions.z}mm`,
        20,
        50
      );

      animId = requestAnimationFrame(render2d);
    };

    render2d();
    return () => cancelAnimationFrame(animId);
  }, [useFallback, meshColor, liveDimensions]);

  const totalLayers = Math.max(1, Math.round(liveDimensions.z / 0.2));
  const currentLayer = Math.max(1, Math.round((layerProgress / 100) * totalLayers));
  const currentHeightCutMm = Number(((layerProgress / 100) * liveDimensions.z).toFixed(1));

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${height} rounded-xl overflow-hidden border border-slate-800 bg-[#0a0e17] shadow-2xl flex flex-col justify-between select-none ${className}`}
      id="three-viewport-container"
    >
      {/* 3D WebGL Canvas or Fallback */}
      {!useFallback ? (
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing"
          id="webgl-canvas"
        />
      ) : (
        <canvas
          ref={fallbackCanvasRef}
          width={600}
          height={400}
          className="absolute inset-0 w-full h-full"
          id="html5-fallback-canvas"
        />
      )}

      {/* In-Bed Holographic Telemetry Progress Ring (Active while generating) */}
      <HolographicBedTelemetry
        isGenerating={isGenerating}
        telemetry={telemetry}
        progressPercent={generationProgress}
        stageText={stageStatusText}
      />

      {/* Top Floating Badges & Action Toolbar */}
      <div className="relative z-20 p-3 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Left Badges */}
        <div className="flex items-center flex-wrap gap-2 pointer-events-auto">
          {/* Bed dimension tag */}
          <div className="px-2.5 py-1 bg-slate-900/85 backdrop-blur border border-slate-700/80 rounded-md text-xs font-mono text-emerald-400 flex items-center gap-1.5 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Bed: 220×220 mm</span>
          </div>

          {/* Model Dimensions Tag */}
          <div className="px-2.5 py-1 bg-slate-900/85 backdrop-blur border border-slate-700/80 rounded-md text-xs font-mono text-cyan-400 flex items-center gap-1.5 shadow-sm">
            <Box className="w-3.5 h-3.5 text-cyan-400" />
            <span>
              {liveDimensions.x} × {liveDimensions.y} × {liveDimensions.z} mm
            </span>
          </div>

          {/* Filament Type */}
          <div className="px-2.5 py-1 bg-slate-900/85 backdrop-blur border border-slate-700/80 rounded-md text-xs font-mono text-slate-300 flex items-center gap-1.5 shadow-sm">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: meshColor }} />
            <span>{filamentType}</span>
          </div>

          {/* Modified badge */}
          {isModified && (
            <div className="px-2 py-1 bg-cyan-500/20 border border-cyan-500/50 rounded-md text-xs font-mono text-cyan-300 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-cyan-400" />
              <span>Modified</span>
            </div>
          )}

          {/* Multi-Model Staged Badge */}
          {placedModels.length > 1 && (
            <div className="px-2 py-1 bg-emerald-950/80 border border-emerald-500/50 rounded-md text-xs font-mono text-emerald-300 flex items-center gap-1">
              <Boxes className="w-3 h-3 text-emerald-400" />
              <span>{placedModels.length} Parts Staged</span>
            </div>
          )}
        </div>

        {/* Right Floating Primary HUD Controls */}
        <div className="pointer-events-auto flex items-center flex-wrap gap-1 bg-slate-900/90 backdrop-blur border border-slate-700/80 p-1 rounded-lg shadow-xl">
          {/* Module 1: Build Plate Manager Toggle */}
          <button
            type="button"
            onClick={() => setIsPlateManagerOpen(!isPlateManagerOpen)}
            className={`px-2 py-1 text-[11px] font-mono rounded transition-all flex items-center gap-1.5 ${
              isPlateManagerOpen
                ? 'bg-emerald-500/30 text-emerald-200 border border-emerald-500/60 font-bold'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
            title="Open Build Plate Multi-Model Nesting & Auto-Packing"
            id="btn-plate-manager"
          >
            <Boxes className={`w-3.5 h-3.5 ${isPlateManagerOpen ? 'text-emerald-400' : 'text-slate-400'}`} />
            <span>Plate</span>
          </button>

          {/* Module 2: G-Code Toolpath Visualizer Toggle */}
          <button
            type="button"
            onClick={() => setIsToolpathMode(!isToolpathMode)}
            className={`px-2 py-1 text-[11px] font-mono rounded transition-all flex items-center gap-1.5 ${
              isToolpathMode
                ? 'bg-orange-500/30 text-orange-200 border border-orange-500/60 font-bold'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
            title="Toggle Orca/Bambu Style G-Code Toolpath Visualizer"
            id="btn-toolpath-visualizer"
          >
            <Layers className={`w-3.5 h-3.5 ${isToolpathMode ? 'text-orange-400' : 'text-slate-400'}`} />
            <span>Toolpath</span>
          </button>

          {/* Module 3: Studio Snapshot & Cover Generator */}
          <button
            type="button"
            onClick={() => setIsStudioModalOpen(true)}
            className="px-2 py-1 text-[11px] font-mono text-cyan-300 hover:text-white bg-cyan-950/60 hover:bg-cyan-900/80 border border-cyan-700/60 rounded transition-all flex items-center gap-1"
            title="Capture High-Res Studio Snapshot for Marketplace Cover"
            id="btn-capture-snapshot"
          >
            <Camera className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Studio Shot</span>
          </button>

          <div className="w-[1px] h-4 bg-slate-700 mx-0.5" />

          {/* Printability Audit Toggle */}
          <button
            type="button"
            onClick={handleToggleAudit}
            className={`px-2 py-1 text-[11px] font-mono rounded transition-all flex items-center gap-1.5 ${
              auditMode
                ? 'bg-rose-500/30 text-rose-200 border border-rose-500/60 font-bold'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
            title="Toggle Overhang Heatmap & Health Score Audit"
            id="btn-toggle-audit"
          >
            <ShieldCheck className={`w-3.5 h-3.5 ${auditMode ? 'text-rose-400' : 'text-slate-400'}`} />
            <span>Audit</span>
          </button>

          {/* Modify Model Drawer Toggle */}
          <button
            type="button"
            onClick={() => setIsModifierOpen(!isModifierOpen)}
            className={`px-2 py-1 text-[11px] font-mono rounded transition-all flex items-center gap-1.5 ${
              isModifierOpen
                ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-500/60 font-bold'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
            title="Open In-Browser 3D Model Modifier Studio"
            id="btn-modify-model"
          >
            <Wrench className={`w-3.5 h-3.5 ${isModifierOpen ? 'text-cyan-400' : 'text-slate-400'}`} />
            <span>Modify</span>
          </button>

          <div className="w-[1px] h-4 bg-slate-700 mx-0.5" />

          {/* Snap to Bed Button */}
          <button
            type="button"
            onClick={handleSnapToBed}
            className="px-2 py-1 text-[11px] font-mono text-emerald-300 hover:text-white bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-700/60 rounded transition-all flex items-center gap-1"
            title="Auto-align bottom face to Z=0 on print bed"
            id="btn-snap-to-bed"
          >
            <ArrowDownToLine className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Snap Bed</span>
          </button>

          {/* 90° Axis Rotation Buttons */}
          <button
            type="button"
            onClick={() => handleRotate90('x')}
            className="px-1.5 py-1 text-[11px] font-mono text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
            title="Rotate 90° around X axis"
            id="btn-rotate-90-x"
          >
            +90°X
          </button>
          <button
            type="button"
            onClick={() => handleRotate90('y')}
            className="px-1.5 py-1 text-[11px] font-mono text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
            title="Rotate 90° around Y axis"
            id="btn-rotate-90-y"
          >
            +90°Y
          </button>
          <button
            type="button"
            onClick={() => handleRotate90('z')}
            className="px-1.5 py-1 text-[11px] font-mono text-slate-300 hover:text-white hover:bg-slate-800 rounded transition-colors"
            title="Rotate 90° around Z axis"
            id="btn-rotate-90-z"
          >
            +90°Z
          </button>

          <div className="w-[1px] h-4 bg-slate-700 mx-0.5" />

          {/* Fallback Switcher */}
          <button
            type="button"
            onClick={() => setUseFallback(!useFallback)}
            className="px-1.5 py-1 text-[10px] font-mono text-slate-400 hover:text-slate-200 rounded transition-colors"
          >
            {useFallback ? '3D' : '2D'}
          </button>
        </div>
      </div>

      {/* WebGL Error Warning if any */}
      {webglError && (
        <div className="relative z-20 mx-3 p-2 bg-amber-950/80 border border-amber-800/80 rounded text-xs text-amber-200 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{webglError}</span>
        </div>
      )}

      {/* Module 1: Build Plate Manager Drawer */}
      <BuildPlateManager
        isOpen={isPlateManagerOpen}
        onClose={() => setIsPlateManagerOpen(false)}
        placedModels={placedModels}
        selectedModelId={selectedModelId}
        onSelectModel={setSelectedModelId}
        onAutoNest={handleAutoNest}
        onAddModel={handleAddModelToPlate}
        onDuplicateModel={handleDuplicateModel}
        onRemoveModel={handleRemoveModel}
        onUpdateModelTransform={handleUpdateModelTransform}
        collidingIds={collidingIds}
        bedUtilizationPct={bedUtilizationPct}
      />

      {/* Module 2: G-Code Toolpath Visualizer HUD */}
      <GCodeVisualizer
        isOpen={isToolpathMode}
        onClose={() => setIsToolpathMode(false)}
        layers={toolpathLayers}
        currentLayerIndex={currentToolpathLayer}
        onLayerChange={setCurrentToolpathLayer}
        simulationState={simulationState}
        onTogglePlay={() =>
          setSimulationState((prev) => ({ ...prev, isPlaying: !prev.isPlaying }))
        }
        onSpeedChange={(speed) =>
          setSimulationState((prev) => ({ ...prev, playbackSpeed: speed }))
        }
        showAllPreviousLayers={showAllPreviousLayers}
        onToggleShowPrevious={setShowAllPreviousLayers}
      />

      {/* Module 3: Studio Snapshot & Cover Generator Modal */}
      <StudioSnapshotModal
        isOpen={isStudioModalOpen}
        onClose={() => setIsStudioModalOpen(false)}
        currentPreset={studioPreset}
        onSelectPreset={setStudioPreset}
        turntableActive={turntableActive}
        onToggleTurntable={() => setTurntableActive(!turntableActive)}
        onCaptureSnapshot={handleCaptureSnapshot}
        onSetAsMarketplaceCover={onSetMarketplaceCover}
      />

      {/* Modifier Drawer */}
      <MeshModifierDrawer
        isOpen={isModifierOpen}
        onClose={() => setIsModifierOpen(false)}
        baseGeometry={activeGeometry}
        currentDimensions={liveDimensions}
        onApplyModifiedGeometry={handleApplyModifiedGeometry}
        onResetGeometry={handleResetGeometry}
        onExportStl={handleExportModifiedStl}
        onUpdatePreviewHole={handleUpdatePreviewHole}
        onUpdatePreviewText={handleUpdatePreviewText}
        isModified={isModified}
      />

      {/* Printability Health Score Card */}
      <PrintabilityScoreCard
        audit={auditResult}
        isActive={auditMode}
        onClose={() => handleToggleAudit()}
        onAutoOrient={handleAutoOrient}
      />

      {/* Right-Side Vertical Slicer Slider (Standard clipping mode) */}
      {layerPreviewMode && !isToolpathMode && (
        <div className="absolute right-3 top-16 bottom-16 z-20 w-12 bg-slate-900/90 backdrop-blur border border-cyan-500/50 rounded-xl p-2 flex flex-col items-center justify-between shadow-2xl">
          <div className="text-[10px] font-mono text-cyan-400 font-bold text-center">
            {currentLayer}
            <span className="text-[8px] text-slate-400 block font-normal">LAYER</span>
          </div>

          <div className="flex-1 flex items-center justify-center my-2">
            <input
              type="range"
              min="2"
              max="100"
              value={layerProgress}
              onChange={(e) => setLayerProgress(Number(e.target.value))}
              className="accent-cyan-400 cursor-pointer w-28 -rotate-90 appearance-none bg-slate-800 h-1.5 rounded-lg"
              title="Drag to slice layer cross-section"
              id="slider-vertical-slicer"
            />
          </div>

          <div className="text-[10px] font-mono text-cyan-300 text-center">
            {currentHeightCutMm}
            <span className="text-[8px] text-slate-400 block font-normal">mm</span>
          </div>
        </div>
      )}

      {/* Virtual Caliper Dimensions HUD Overlay */}
      {showCalipers && (
        <div className="absolute left-3 top-16 z-20 bg-slate-900/90 backdrop-blur border border-cyan-500/50 rounded-xl p-3 text-xs font-mono text-cyan-300 shadow-2xl space-y-1.5 pointer-events-auto">
          <div className="flex items-center gap-1.5 text-cyan-400 font-bold text-[11px] pb-1 border-b border-slate-800">
            <Ruler className="w-3.5 h-3.5" />
            <span>Virtual Caliper Gauge</span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
            <span className="text-slate-400">Width (X):</span>
            <span className="text-white font-bold">{liveDimensions.x} mm</span>

            <span className="text-slate-400">Depth (Y):</span>
            <span className="text-white font-bold">{liveDimensions.y} mm</span>

            <span className="text-slate-400">Height (Z):</span>
            <span className="text-white font-bold">{liveDimensions.z} mm</span>

            <span className="text-slate-400">Vol. Est:</span>
            <span className="text-emerald-400 font-bold">
              {((liveDimensions.x * liveDimensions.y * liveDimensions.z) / 1000).toFixed(1)} cm³
            </span>
          </div>
        </div>
      )}

      {/* Bottom Floating Controls Bar */}
      {showControlsBar && (
        <div className="relative z-20 p-3 flex items-center justify-between pointer-events-none">
          <div className="flex items-center gap-1.5 p-1 bg-slate-900/90 backdrop-blur border border-slate-700/80 rounded-lg shadow-xl pointer-events-auto">
            {/* Auto Rotate Toggle */}
            <button
              type="button"
              onClick={() => setAutoRotate(!autoRotate)}
              className={`p-1.5 rounded-md transition-all ${
                autoRotate
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
              title={autoRotate ? 'Pause Rotation' : 'Auto-Rotate Mesh'}
              id="btn-viewport-autorotate"
            >
              {autoRotate ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>

            {/* Shading: Wireframe vs Solid */}
            <button
              type="button"
              onClick={() => setWireframe(!wireframe)}
              className={`p-1.5 rounded-md transition-all ${
                wireframe
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
              title={wireframe ? 'Switch to Solid Shading' : 'Switch to Wireframe Mode'}
              id="btn-viewport-wireframe"
            >
              <Box className="w-4 h-4" />
            </button>

            {/* Virtual Caliper Overlay Toggle */}
            <button
              type="button"
              onClick={() => setShowCalipers(!showCalipers)}
              className={`p-1.5 rounded-md transition-all ${
                showCalipers
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
              title="Toggle Virtual Caliper Measurements (X, Y, Z mm)"
              id="btn-viewport-calipers"
            >
              <Ruler className="w-4 h-4" />
            </button>

            {/* Slicer Preview Mode Toggle */}
            <button
              type="button"
              onClick={() => setLayerPreviewMode(!layerPreviewMode)}
              className={`p-1.5 rounded-md transition-all ${
                layerPreviewMode
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
              title="Toggle Vertical Build Layer Slicer Cross-Section"
              id="btn-viewport-layers"
            >
              <Layers className="w-4 h-4" />
            </button>

            {/* Bounding Box Toggle */}
            <button
              type="button"
              onClick={() => setShowBoundingBox(!showBoundingBox)}
              className={`p-1.5 rounded-md transition-all ${
                showBoundingBox
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
              title="Toggle Bounding Box Enclosure"
              id="btn-viewport-bbox"
            >
              <Sliders className="w-4 h-4" />
            </button>

            {/* Print Bed Grid Toggle */}
            <button
              type="button"
              onClick={() => setShowGrid(!showGrid)}
              className={`p-1.5 rounded-md transition-all ${
                showGrid
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
              title="Toggle 220x220mm Print Bed Grid"
              id="btn-viewport-grid"
            >
              <Eye className="w-4 h-4" />
            </button>

            {/* Reset Camera View */}
            <button
              type="button"
              onClick={handleResetCamera}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors"
              title="Reset View to Default Perspective"
              id="btn-viewport-reset-cam"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          <div className="text-[11px] font-mono text-slate-400 hidden sm:flex items-center gap-2 pointer-events-auto bg-slate-900/80 backdrop-blur px-2.5 py-1 rounded-md border border-slate-800">
            <span>Left: Orbit / Click to Select</span>
            <span className="text-slate-600">•</span>
            <span>Right: Pan</span>
            <span className="text-slate-600">•</span>
            <span>Scroll: Zoom</span>
          </div>
        </div>
      )}
    </div>
  );
};
