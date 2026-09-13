export type TabType = 'marketplace' | 'studio' | 'creator';

export type FilamentType = 'PLA' | 'PETG' | 'TPU' | 'ABS';

export interface FilamentSpec {
  type: FilamentType;
  density: number; // g/cm³
  costPerKg: number; // USD
  defaultNozzleTemp: number; // °C
  defaultBedTemp: number; // °C
  color: string;
  recommendedSpeed: number; // mm/s
}

export type LayerHeightPreset = '0.12' | '0.20' | '0.28';

export interface SlicingParams {
  filament: FilamentType;
  infill: number; // 15 - 100
  layerHeight: LayerHeightPreset;
  infillPattern: 'grid' | 'gyroid' | 'honeycomb' | 'triangles';
  wallCount: number;
  generateSupports: boolean;
  printSpeed: number; // mm/s
}

export type PromptStylePreset = 
  | 'Functional Bracket'
  | 'Tabletop Mini'
  | 'Articulated Dragon'
  | 'Replacement Part';

export type GenerationStage = 
  | 'idle'
  | 'queued'
  | 'comfyui_sdxl'
  | 'meshing'
  | 'slicing'
  | 'completed'
  | 'error';

export interface GenerationProgress {
  stage: GenerationStage;
  progressPercent: number;
  statusText: string;
  stepDetails?: string;
  latencyMs?: number;
  previewImageUrl?: string;
}

export interface MeshMetrics {
  vertexCount: number;
  triangleCount: number;
  dimensionsMm: { x: number; y: number; z: number };
  volumeCm3: number;
  weightGrams: number;
  estimatedPrintTimeMinutes: number;
  materialCostUsd: number;
  filamentLengthMeters: number;
}

export interface GeneratedModelData {
  id: string;
  prompt: string;
  stylePreset: PromptStylePreset;
  slicingParams: SlicingParams;
  metrics: MeshMetrics;
  createdAt: string;
  geometryType: 'bracket' | 'mini' | 'dragon' | 'gear';
}

export interface MarketplaceModel {
  id: string;
  title: string;
  creator: {
    name: string;
    avatar: string;
    verified: boolean;
    rating: number;
  };
  category: 'Functional & Tools' | 'Miniatures & Gaming' | 'Art & Articulated' | 'Gadgets & Tech' | 'Replacement Parts';
  description: string;
  price: number; // in USD (0 for free)
  rating: number;
  reviewsCount: number;
  downloadsCount: number;
  license: 'CC BY-NC 4.0' | 'Commercial Use' | 'GPLv3';
  tags: string[];
  dimensionsMm: { x: number; y: number; z: number };
  estimatedPrintTimeHours: number;
  weightGrams: number;
  filamentType: FilamentType;
  infillRecommended: number;
  nozzleTemp: number;
  bedTemp: number;
  geometryType: 'bracket' | 'mini' | 'dragon' | 'gear' | 'cylinder' | 'cube';
  featuredImage?: string;
  isPurchased?: boolean;
  isCreatorOriginal?: boolean;
  createdAt: string;
}

export interface TransactionRecord {
  id: string;
  timestamp: string;
  modelId: string;
  modelTitle: string;
  buyerName: string;
  listedPrice: number;
  platformFee: number;
  creatorPayout: number;
  type: 'sale' | 'payout' | 'deposit';
  status: 'completed' | 'processing';
}

export interface PayoutRequest {
  id: string;
  timestamp: string;
  amount: number;
  method: 'Stripe Instant' | 'Direct ACH' | 'USDC / Crypto';
  status: 'Completed' | 'Processing';
  referenceCode: string;
}

export interface PreloadedUploadDraft {
  title: string;
  category: MarketplaceModel['category'];
  description: string;
  filamentType: FilamentType;
  infillRecommended: number;
  layerHeight: LayerHeightPreset;
  dimensionsMm: { x: number; y: number; z: number };
  estimatedPrintTimeHours: number;
  weightGrams: number;
  geometryType: MarketplaceModel['geometryType'];
  fileName?: string;
  coverUrl?: string;
}

export interface BridgeJobStatus {
  prompt_id: string;
  status: 'queued' | 'diffusing' | 'meshing' | 'exporting' | 'completed' | 'failed';
  stage_name: string;
  progress_pct: number;
  mesh_url?: string;
  error?: string;
  hardware_metrics?: {
    vram_used_mb?: number;
    gpu_temp_c?: number;
    worker_device?: string;
  };
}

export interface AppSettings {
  localRelayUrl: string;
  isLocalRelayOnline: boolean;
  platformFeePercent: number; // default 12%
  simulatedLatencyMs: number;
}

// 3D Model Modifier Studio Types
export type HolePreset = 'M3' | 'M4' | 'M5' | 'Magnet-6x3' | 'Custom';
export type HoleAxis = 'X' | 'Y' | 'Z';

export interface HolePunchConfig {
  preset: HolePreset;
  diameter: number; // mm
  depth: number; // mm (for blind hole, or ignored if isThrough is true)
  axis: HoleAxis;
  posX: number;
  posY: number;
  posZ: number;
  isThrough: boolean;
}

export interface TextEmbossConfig {
  text: string;
  fontSize: number; // mm
  depth: number; // mm (+ for emboss, - for engrave)
  placement: 'top' | 'front' | 'side';
  posX: number;
  posY: number;
  posZ: number;
  isEngrave: boolean;
}

export interface ScalingConfig {
  uniform: boolean;
  scaleX: number; // multiplier e.g. 1.0 = 100%
  scaleY: number;
  scaleZ: number;
}

// Printability & Overhang Heatmap Inspector Types
export interface PrintabilityAuditResult {
  score: number; // 0 - 100
  safePct: number; // 0° - 45°
  cautionPct: number; // 45° - 60°
  overhangPct: number; // > 60°
  totalTriangles: number;
  overhangTriangles: number;
  estimatedSupportFilamentPct: number; // % of total model
  estimatedSupportWasteGrams: number;
  isWatertight: boolean;
  openEdgeCount: number;
  recommendedOrientation: {
    label: string;
    description: string;
    rotX: number; // in radians
    rotY: number;
    rotZ: number;
    supportReductionPct: number;
  };
}

// Live Hardware Telemetry & WebSocket Progress
export interface BridgeWebSocketMessage {
  type: 'step' | 'progress' | 'status' | 'complete' | 'error';
  step?: number;
  totalSteps?: number;
  samplerName?: string;
  stage?: string;
  percentage?: number;
  progressPercent?: number;
  statusText?: string;
  vramUsedMb?: number;
  gpuTempC?: number;
  iterationRate?: number; // it/s
  etaSeconds?: number;
  meshUrl?: string;
  connectionType?: 'websocket' | 'http_poll' | 'simulated';
}

// Module 1: Build Plate Multi-Model Nesting Types
export interface PlacedModel {
  id: string;
  name: string;
  geometry: any; // THREE.BufferGeometry
  color: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  dimensionsMm: { x: number; y: number; z: number };
  weightGrams: number;
  printTimeMinutes: number;
  triangleCount: number;
  filamentType: FilamentType;
}

export interface PlateNestingConfig {
  clearanceMarginMm: number; // default 10mm
  bedWidthMm: number; // 220mm
  bedDepthMm: number; // 220mm
  allowRotation: boolean;
}

// Module 2: G-Code Toolpath Visualizer (Orca/Bambu Style)
export type ToolpathLineType = 'outer_wall' | 'inner_wall' | 'infill' | 'travel';

export interface ToolpathSegment {
  start: [number, number, number];
  end: [number, number, number];
  type: ToolpathLineType;
  feedrate?: number;
  layerIndex: number;
}

export interface ToolpathLayer {
  layerIndex: number;
  zHeightMm: number;
  segments: ToolpathSegment[];
  seamPoint?: [number, number, number];
  retractionPoints?: [number, number, number][];
  layerPrintTimeSec: number;
  filamentMm: number;
}

export interface ToolpathSimulationState {
  isPlaying: boolean;
  playbackSpeed: 1 | 2 | 5;
  currentLayer: number;
  totalLayers: number;
  animProgress: number; // 0.0 to 1.0 within active layer
  nozzlePos: [number, number, number];
}

// Module 3: High-Res Studio Snapshot & Cover Generator
export type StudioLightingPreset = 'cyber_studio' | 'neutral_sunlight' | 'showcase_turntable';

export interface StudioSnapshotConfig {
  width: number;
  height: number;
  preset: StudioLightingPreset;
  transparentBg: boolean;
  turntableSpin: boolean;
}

// Module 4: IndexedDB Storage Stats
export interface StorageStats {
  totalBytes: number;
  formattedSize: string;
  meshCount: number;
  profileCount: number;
  snapshotCount: number;
}


