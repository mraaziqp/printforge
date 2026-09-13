import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  Sparkles, 
  Cpu, 
  Layers, 
  Download, 
  RefreshCw, 
  Clock, 
  Scale, 
  Coins, 
  Share2, 
  Terminal, 
  Zap, 
  CheckCircle2, 
  AlertTriangle,
  Play,
  X,
  Code,
  Copy,
  Check
} from 'lucide-react';
import * as THREE from 'three';
import { ThreeViewport } from './ThreeViewport';
import { 
  FilamentType, 
  LayerHeightPreset, 
  SlicingParams, 
  PromptStylePreset, 
  GenerationProgress, 
  MeshMetrics, 
  MarketplaceModel, 
  AppSettings,
  PreloadedUploadDraft,
  BridgeHealth,
  BridgeJobStatus,
  BridgeWebSocketMessage
} from '../types';
import { FILAMENT_SPECS } from '../mockData';
import { createProceduralGeometry, calculateMeshMetrics } from '../utils/geometryGenerator';
import { triggerStlDownload } from '../utils/stlExporter';
import { cacheMeshBinary } from '../utils/meshDatabase';
import {
  BRIDGE_JOB_TIMEOUT_SEC,
  BRIDGE_STATUS_STEP,
  MESH_TARGET_SIZE_MM,
  bridgeBaseUrl,
  bridgeWebSocketUrl,
  describeBridgeHealth,
  describeTelemetry,
  errorMessage,
  fetchMeshFromUrl,
  pingBridge,
  resolveBridgeUrl,
  submitBridgeJob,
  telemetryFromStatus,
} from '../utils/bridgeClient';

interface AiStudioViewProps {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  onPublishModel: (model: MarketplaceModel) => void;
  openWalletModal: () => void;
  onSendToMarketplace?: (draft: PreloadedUploadDraft) => void;
}

const STYLE_CHIPS: { label: PromptStylePreset; prompt: string; type: 'bracket' | 'mini' | 'dragon' | 'gear' }[] = [
  {
    label: 'Functional Bracket',
    prompt: 'Reinforced 90-degree corner gusset bracket with 5mm bolt holes and load-distributing web ribbing',
    type: 'bracket',
  },
  {
    label: 'Tabletop Mini',
    prompt: 'Futuristic mechanized cyber titan warrior with heavy particle shoulder cannon and detailed hexagonal base',
    type: 'mini',
  },
  {
    label: 'Articulated Dragon',
    prompt: 'Print-in-place articulated cyber-serpent with segmented interlocking vertebral scales and crest',
    type: 'dragon',
  },
  {
    label: 'Replacement Part',
    prompt: 'High-torque 18-tooth planetary spur gear with keyway shaft bore and lightweight relief cutouts',
    type: 'gear',
  },
];

interface BridgeDiagnosticError {
  endpoint: string;
  reason: string;
  details: string[];
}

export const AiStudioView: React.FC<AiStudioViewProps> = ({
  settings,
  setSettings,
  onPublishModel,
  onSendToMarketplace,
}) => {
  // Prompt Composer State
  const [prompt, setPrompt] = useState<string>(
    'Reinforced 90-degree corner gusset bracket with 5mm bolt holes and load-distributing web ribbing'
  );
  const [activeChip, setActiveChip] = useState<PromptStylePreset>('Functional Bracket');
  const [seed, setSeed] = useState<number>(428901);
  const [geometryType, setGeometryType] = useState<'bracket' | 'mini' | 'dragon' | 'gear'>('bracket');

  // Slicing parameters
  const [slicingParams, setSlicingParams] = useState<SlicingParams>({
    filament: 'PLA',
    infill: 30,
    layerHeight: '0.20',
    infillPattern: 'gyroid',
    wallCount: 3,
    generateSupports: false,
    printSpeed: 60,
  });

  // Local relay endpoint
  const [endpointUrl, setEndpointUrl] = useState<string>(settings.localRelayUrl);
  const [isRelayTesting, setIsRelayTesting] = useState<boolean>(false);

  // Polling & Diagnostics State
  const [pollingStep, setPollingStep] = useState<number>(0);
  const [bridgeError, setBridgeError] = useState<BridgeDiagnosticError | null>(null);
  const [showCodeSnippetModal, setShowCodeSnippetModal] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingStartTimeRef = useRef<number>(0);
  const wsRef = useRef<WebSocket | null>(null);
  // prompt_id of the bridge job in flight; cleared once the socket or the poller settles it so they can't both finish it
  const activeJobRef = useRef<string | null>(null);
  const [liveTelemetry, setLiveTelemetry] = useState<BridgeWebSocketMessage | null>(null);

  // Generation progress state
  const [generation, setGeneration] = useState<GenerationProgress>({
    stage: 'idle',
    progressPercent: 0,
    statusText: 'Engine Ready',
  });
  const [logs, setLogs] = useState<string[]>([
    '[INIT] Hardware Bridge Client initialized.',
    '[READY] Select a prompt, or start the local ComfyUI bridge (npm run bridge) for real generation.',
  ]);

  // Active 3D Geometry
  const [activeGeometry, setActiveGeometry] = useState<THREE.BufferGeometry>(() =>
    createProceduralGeometry('bracket')
  );

  // Publish notifications
  const [publishedSuccess, setPublishedSuccess] = useState<boolean>(false);
  const [customCoverUrl, setCustomCoverUrl] = useState<string | null>(null);

  // Calculate physical metrics based on geometry and slicing parameters
  const metrics: MeshMetrics = useMemo(() => {
    return calculateMeshMetrics(activeGeometry, slicingParams);
  }, [activeGeometry, slicingParams]);

  // Helper to add log
  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev.slice(-14), `[${timestamp}] ${msg}`]);
  };

  // Clear polling & websocket
  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    if (wsRef.current) {
      const ws = wsRef.current;
      wsRef.current = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      try {
        ws.close();
      } catch {}
    }
  };

  // Clean up polling interval & socket on unmount
  useEffect(() => {
    return () => {
      activeJobRef.current = null;
      stopPolling();
    };
  }, []);

  const applyBridgeHealth = (health: BridgeHealth) => {
    setSettings((prev) => ({ ...prev, isLocalRelayOnline: true }));
    addLog(`[BRIDGE OK] ${describeBridgeHealth(health)}`);
    if (!health.comfyui.reachable) {
      addLog(`[WARN] ComfyUI is not reachable at ${health.comfyui.url}. Start ComfyUI before generating.`);
    }
    if (health.workflow_error) addLog(`[WARN] ${health.workflow_error}`);
    health.missing_nodes.forEach((node) => addLog(`[WARN] ComfyUI node not installed: ${node}`));
    health.missing_models.forEach((model) => addLog(`[WARN] Missing model: ${model}`));
  };

  // Watch the bridge continuously so starting or stopping the local stack is picked up without pressing Ping.
  // Only changes in its state are logged.
  const bridgeStateRef = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const check = () => {
      pingBridge(settings.localRelayUrl)
        .then((health) => {
          if (cancelled) return;
          const state = `online:${health.comfyui.reachable}:${health.missing_models.length + health.missing_nodes.length}`;
          if (bridgeStateRef.current !== state) applyBridgeHealth(health);
          bridgeStateRef.current = state;
        })
        .catch(() => {
          if (cancelled || activeJobRef.current) return;
          if (bridgeStateRef.current?.startsWith('online')) {
            addLog('[BRIDGE] Lost the local bridge. Using the simulator until it is back.');
          }
          bridgeStateRef.current = 'offline';
          setSettings((prev) => (prev.isLocalRelayOnline ? { ...prev, isLocalRelayOnline: false } : prev));
        });
    };
    check();
    const timer = setInterval(check, 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [settings.localRelayUrl]);

  // Ping test local relay endpoint
  const handleTestRelay = async () => {
    setIsRelayTesting(true);
    addLog(`Pinging bridge: ${bridgeBaseUrl(endpointUrl)}/health ...`);
    try {
      applyBridgeHealth(await pingBridge(endpointUrl));
    } catch (err) {
      setSettings((prev) => ({ ...prev, isLocalRelayOnline: false }));
      addLog(`[BRIDGE] ${errorMessage(err)}. Virtual engine fallback active.`);
    } finally {
      setIsRelayTesting(false);
    }
  };

  const failBridgeJob = (reason: string, details: string[]) => {
    activeJobRef.current = null;
    stopPolling();
    setLiveTelemetry(null);
    setBridgeError({ endpoint: bridgeBaseUrl(endpointUrl), reason, details });
    setGeneration({
      stage: 'error',
      progressPercent: 0,
      statusText: 'Bridge Generation Failed',
      stepDetails: reason,
    });
    addLog(`[ERROR] ${reason}`);
  };

  const applyBridgeProgress = (
    status: BridgeJobStatus['status'],
    percent: number,
    statusText: string,
    details?: string
  ) => {
    const step = BRIDGE_STATUS_STEP[status] || 1;
    setPollingStep(step);
    setGeneration({
      stage: status === 'queued' ? 'queued' : status === 'diffusing' ? 'comfyui_sdxl' : 'meshing',
      progressPercent: Math.round(percent),
      statusText: `Stage ${step}: ${statusText}`,
      stepDetails: details,
    });
  };

  const completeBridgeJob = async (promptId: string, meshUrl?: string | null) => {
    if (activeJobRef.current !== promptId) return;
    activeJobRef.current = null;
    stopPolling();

    if (!meshUrl) {
      failBridgeJob('ComfyUI finished but reported no mesh file', [
        'Make sure the workflow ends in a SaveGLB node titled PF_SAVE_MESH',
      ]);
      return;
    }

    const url = resolveBridgeUrl(endpointUrl, meshUrl);
    setPollingStep(4);
    setGeneration({
      stage: 'slicing',
      progressPercent: 97,
      statusText: 'Stage 4: Downloading generated mesh...',
      stepDetails: `GET ${url}`,
    });

    try {
      const loaded = await fetchMeshFromUrl(url);
      setActiveGeometry(loaded.geometry);
      void cacheMeshBinary(promptId, loaded.fileName, loaded.buffer, loaded.triangleCount, slicingParams.filament, {
        prompt,
        seed,
        source: 'comfyui-bridge',
      });
      setLiveTelemetry(null);
      setGeneration({
        stage: 'completed',
        progressPercent: 100,
        statusText: 'Generation Complete! Real 3D model loaded.',
        stepDetails: `${loaded.fileName} • ${loaded.triangleCount.toLocaleString()} triangles • scaled to ${MESH_TARGET_SIZE_MM}mm. Export .STL to print.`,
      });
      addLog(
        `[SUCCESS] Loaded ${loaded.format.toUpperCase()} from ComfyUI: ${loaded.triangleCount.toLocaleString()} triangles.`
      );
    } catch (err) {
      failBridgeJob(`Mesh download failed: ${errorMessage(err)}`, [
        `Try opening ${url} directly`,
        'Check the bridge terminal for errors',
      ]);
    }
  };

  const connectTelemetrySocket = (promptId: string) => {
    const wsUrl = bridgeWebSocketUrl(endpointUrl);
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      addLog('[WS] Telemetry socket could not be opened; using HTTP polling only.');
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ action: 'subscribe', prompt_id: promptId }));
      addLog(`[WS] Live telemetry connected (${wsUrl}).`);
    };

    ws.onmessage = (event) => {
      let data: BridgeWebSocketMessage;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (data.promptId !== promptId || activeJobRef.current !== promptId) return;

      if (data.type === 'complete') {
        void completeBridgeJob(promptId, data.meshUrl);
        return;
      }
      if (data.type === 'error') {
        failBridgeJob(data.error || 'ComfyUI reported an execution error', [
          'Check the ComfyUI console for the full traceback',
          'RTX 3060 Ti (8GB): close other GPU-heavy apps if you hit CUDA out-of-memory',
          'Click Ping to list missing models or nodes',
        ]);
        return;
      }
      setLiveTelemetry({ ...data, connectionType: 'websocket' });
      applyBridgeProgress(data.status ?? 'diffusing', data.percentage ?? 0, data.statusText ?? 'Generating', describeTelemetry(data));
    };

    ws.onerror = () => addLog('[WS] Telemetry socket unavailable; continuing with HTTP polling.');
    ws.onclose = () => {
      if (wsRef.current === ws) wsRef.current = null;
    };
  };

  // /status polling is the source of truth for completion; the socket only makes progress live
  const startStatusPolling = (promptId: string) => {
    if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
    const statusUrl = `${bridgeBaseUrl(endpointUrl)}/status/${encodeURIComponent(promptId)}`;
    let inFlight = false;

    pollingIntervalRef.current = setInterval(async () => {
      if (activeJobRef.current !== promptId || inFlight) return;

      const elapsedSec = Math.round((Date.now() - pollingStartTimeRef.current) / 1000);
      if (elapsedSec > BRIDGE_JOB_TIMEOUT_SEC) {
        failBridgeJob(`Generation timed out after ${Math.round(BRIDGE_JOB_TIMEOUT_SEC / 60)} minutes`, [
          'Check the ComfyUI console for a stuck queue or CUDA out-of-memory',
          `The job may still finish in ComfyUI (prompt_id ${promptId})`,
        ]);
        return;
      }

      inFlight = true;
      try {
        const res = await fetch(statusUrl, { headers: { Accept: 'application/json' } });
        if (!res.ok) {
          if (res.status !== 404) addLog(`[POLL] Status HTTP ${res.status}, retrying...`);
          return;
        }
        const status: BridgeJobStatus = await res.json();
        if (activeJobRef.current !== promptId) return;

        if (status.status === 'completed') {
          await completeBridgeJob(promptId, status.mesh_url);
        } else if (status.status === 'failed') {
          failBridgeJob(status.error || 'ComfyUI reported an execution error', [
            'Check the ComfyUI console for the full traceback',
            'Click Ping to list missing models or nodes',
          ]);
        } else if (wsRef.current?.readyState !== WebSocket.OPEN) {
          const telemetry = telemetryFromStatus(status);
          setLiveTelemetry(telemetry);
          applyBridgeProgress(status.status, status.progress_pct, status.stage_name, describeTelemetry(telemetry));
        }
      } catch {
        // Bridge briefly unreachable; keep polling until the timeout
      } finally {
        inFlight = false;
      }
    }, 2000);
  };

  // Execute Simulated 4-Stage Stepper with Live Holographic Telemetry
  const runSimulatedPipeline = async (targetType: 'bracket' | 'mini' | 'dragon' | 'gear') => {
    setBridgeError(null);

    // Stage 1: Submitting to local ComfyUI queue...
    setPollingStep(1);
    setLiveTelemetry({
      type: 'progress',
      step: 1,
      totalSteps: 25,
      stage: 'queued',
      percentage: 12,
      samplerName: 'Euler Ancestral',
      vramUsedMb: 5180,
      gpuTempC: 61,
      iterationRate: 7.1,
      etaSeconds: 15,
      connectionType: 'websocket',
    });
    setGeneration({
      stage: 'queued',
      progressPercent: 12,
      statusText: 'Stage 1: Submitting to local ComfyUI queue...',
      stepDetails: 'GPU slot allocated: RTX 3060 Ti / TensorRT engine initialized',
    });
    addLog(
      '[BRIDGE] Stage 1: Submitting to local ComfyUI queue (Job ID: pf_' +
        Math.random().toString(36).substring(2, 8) +
        ')'
    );

    await new Promise((r) => setTimeout(r, 600));

    // Stage 2: Diffusing image on RTX 3060 Ti (simulate KSampler steps)
    setPollingStep(2);
    for (let s = 4; s <= 16; s += 4) {
      const pct = Math.round((s / 25) * 60);
      setLiveTelemetry({
        type: 'progress',
        step: s,
        totalSteps: 25,
        stage: 'diffusion',
        percentage: pct,
        samplerName: 'KSampler (Euler a)',
        vramUsedMb: 5420 + s * 14,
        gpuTempC: 64,
        iterationRate: 7.4,
        etaSeconds: Math.max(1, Math.round((25 - s) * 0.45)),
        connectionType: 'websocket',
      });
      setGeneration({
        stage: 'comfyui_sdxl',
        progressPercent: pct,
        statusText: `Stage 2: Diffusing image on RTX 3060 Ti (Step ${s}/25)...`,
        stepDetails: `KSampler step ${s}/25 @ 7.4 it/s • Latent multiview diffusion`,
      });
      await new Promise((r) => setTimeout(r, 450));
    }
    addLog('[BRIDGE] Stage 2: Multi-view projection diffusion complete (25/25 steps)');

    // Stage 3: Synthesizing 3D mesh (SF3D / TripoSR)...
    setPollingStep(3);
    for (let s = 18; s <= 24; s += 3) {
      const pct = 60 + Math.round(((s - 16) / 9) * 32);
      setLiveTelemetry({
        type: 'progress',
        step: s,
        totalSteps: 25,
        stage: 'meshing',
        percentage: pct,
        samplerName: 'TripoSR / SF3D Mesher',
        vramUsedMb: 5890,
        gpuTempC: 66,
        iterationRate: 8.2,
        etaSeconds: Math.max(1, Math.round((25 - s) * 0.3)),
        connectionType: 'websocket',
      });
      setGeneration({
        stage: 'meshing',
        progressPercent: pct,
        statusText: 'Stage 3: Synthesizing 3D mesh (SF3D / TripoSR)...',
        stepDetails: 'Marching tetrahedra mesh extraction & watertight manifold check',
      });
      await new Promise((r) => setTimeout(r, 450));
    }
    addLog('[BRIDGE] Stage 3: Neural meshing complete. Facet count: 3,420');

    // Stage 4: Downloading generated .STL / .GLB asset...
    setLiveTelemetry({
      type: 'progress',
      step: 25,
      totalSteps: 25,
      stage: 'download',
      percentage: 98,
      samplerName: 'Binary STL Encoder',
      vramUsedMb: 5310,
      gpuTempC: 63,
      iterationRate: 12.0,
      etaSeconds: 0,
      connectionType: 'websocket',
    });
    setPollingStep(4);
    setGeneration({
      stage: 'slicing',
      progressPercent: 96,
      statusText: 'Stage 4: Downloading generated .STL / .GLB asset...',
      stepDetails: 'Streaming binary STL blob to client Three.js viewport...',
    });
    addLog('[BRIDGE] Stage 4: Asset stream verified. Loading into WebGL viewport.');

    await new Promise((r) => setTimeout(r, 550));

    // Compile geometry and update viewport
    const newGeo = createProceduralGeometry(targetType);
    setActiveGeometry(newGeo);

    setLiveTelemetry(null);
    setGeneration({
      stage: 'completed',
      progressPercent: 100,
      statusText: 'Generation Complete! 3D Model loaded in viewport.',
      stepDetails: 'Model ready for slicer preview, .STL export, or marketplace publishing.',
    });
    addLog('[SUCCESS] 3D mesh compiled and mounted to print bed.');
  };

  // Real hardware bridge: queue the ComfyUI workflow, stream telemetry over WebSocket, poll /status for the result
  const startRealBridgeGeneration = async (targetType: 'bracket' | 'mini' | 'dragon' | 'gear') => {
    setBridgeError(null);
    activeJobRef.current = null;
    stopPolling();
    pollingStartTimeRef.current = Date.now();
    setPollingStep(1);
    setLiveTelemetry(null);

    const base = bridgeBaseUrl(endpointUrl);
    setGeneration({
      stage: 'queued',
      progressPercent: 2,
      statusText: 'Stage 1: Submitting workflow to local ComfyUI...',
      stepDetails: `POST ${base}/generate`,
    });
    addLog(`[BRIDGE] Dispatching POST ${base}/generate ...`);

    let promptId: string;
    try {
      promptId = await submitBridgeJob(endpointUrl, {
        prompt,
        seed,
        infill: slicingParams.infill,
        filament: slicingParams.filament,
        layer_height: Number(slicingParams.layerHeight),
        slicingParams,
        geometryType: targetType,
      });
    } catch (err) {
      failBridgeJob(errorMessage(err), [
        'Start the bridge in a terminal: npm run bridge',
        'Start ComfyUI (Comfy Desktop) so it listens on http://127.0.0.1:8188',
        'Click Ping to list missing models or custom nodes',
        'Or switch to Simulation Mode to preview without the GPU pipeline',
      ]);
      return;
    }

    activeJobRef.current = promptId;
    addLog(`[BRIDGE] Job accepted by ComfyUI: prompt_id=${promptId}`);
    applyBridgeProgress('queued', 4, 'Queued in ComfyUI', `prompt_id ${promptId}`);
    connectTelemetrySocket(promptId);
    startStatusPolling(promptId);
  };

  // Main Generation Trigger
  const handleGenerate = () => {
    if (generation.stage !== 'idle' && generation.stage !== 'completed' && generation.stage !== 'error') {
      return;
    }

    setPublishedSuccess(false);

    // Determine target geometry type from prompt keywords
    let targetType: 'bracket' | 'mini' | 'dragon' | 'gear' = geometryType;
    const lowerP = prompt.toLowerCase();
    if (lowerP.includes('dragon') || lowerP.includes('wyrm') || lowerP.includes('serpent')) {
      targetType = 'dragon';
    } else if (lowerP.includes('mini') || lowerP.includes('mech') || lowerP.includes('titan') || lowerP.includes('warrior')) {
      targetType = 'mini';
    } else if (lowerP.includes('gear') || lowerP.includes('spur') || lowerP.includes('planetary')) {
      targetType = 'gear';
    } else if (lowerP.includes('bracket') || lowerP.includes('corner') || lowerP.includes('mount')) {
      targetType = 'bracket';
    }
    setGeometryType(targetType);

    if (settings.isLocalRelayOnline) {
      startRealBridgeGeneration(targetType);
    } else {
      runSimulatedPipeline(targetType);
    }
  };

  // Style chip selector
  const handleSelectChip = (chip: typeof STYLE_CHIPS[0]) => {
    setActiveChip(chip.label);
    setPrompt(chip.prompt);
    setGeometryType(chip.type);
    setSeed(Math.floor(100000 + Math.random() * 900000));
    const geo = createProceduralGeometry(chip.type);
    setActiveGeometry(geo);
    addLog(`Applied style preset: ${chip.label}`);
  };

  // Export STL Download
  const handleDownloadStl = () => {
    const filename = `${activeChip.toLowerCase().replace(/\s+/g, '_')}_${slicingParams.filament.toLowerCase()}.stl`;
    triggerStlDownload(activeGeometry, filename);
    addLog(`[EXPORT] Downloaded STL: ${filename}`);
  };

  // Send to Marketplace Flow
  const handleSendToMarketplace = () => {
    const draft: PreloadedUploadDraft = {
      title: `${activeChip}: ${prompt.slice(0, 35)}...`,
      category: activeChip === 'Functional Bracket' || activeChip === 'Replacement Part' ? 'Functional & Tools' : 'Miniatures & Gaming',
      description: `Synthesized via PrintForge Local AI Hardware Bridge with prompt: "${prompt}". Sliced for ${slicingParams.filament} at ${slicingParams.layerHeight}mm layer height.`,
      filamentType: slicingParams.filament,
      infillRecommended: slicingParams.infill,
      layerHeight: slicingParams.layerHeight,
      dimensionsMm: metrics.dimensionsMm,
      estimatedPrintTimeHours: Number((metrics.estimatedPrintTimeMinutes / 60).toFixed(1)),
      weightGrams: metrics.weightGrams,
      geometryType: geometryType,
      fileName: `${activeChip.toLowerCase().replace(/\s+/g, '_')}_${slicingParams.filament.toLowerCase()}.stl`,
      coverUrl: customCoverUrl || undefined,
    };

    if (onSendToMarketplace) {
      onSendToMarketplace(draft);
      addLog('[MARKETPLACE] Pre-filled upload modal and opened Creator Hub.');
    } else {
      // Fallback: direct publish
      const newModel: MarketplaceModel = {
        id: `pf-gen-${Date.now()}`,
        title: draft.title,
        creator: {
          name: 'You (AI Forge)',
          avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80',
          verified: true,
          rating: 5.0,
        },
        category: draft.category,
        description: draft.description,
        price: 3.50,
        rating: 5.0,
        reviewsCount: 1,
        downloadsCount: 0,
        license: 'Commercial Use',
        tags: ['AI Generated', activeChip, slicingParams.filament, `${slicingParams.infill}% Infill`],
        dimensionsMm: metrics.dimensionsMm,
        estimatedPrintTimeHours: draft.estimatedPrintTimeHours,
        weightGrams: metrics.weightGrams,
        filamentType: slicingParams.filament,
        infillRecommended: slicingParams.infill,
        nozzleTemp: FILAMENT_SPECS[slicingParams.filament].defaultNozzleTemp,
        bedTemp: FILAMENT_SPECS[slicingParams.filament].defaultBedTemp,
        geometryType: geometryType,
        isCreatorOriginal: true,
        createdAt: new Date().toISOString().split('T')[0],
      };
      onPublishModel(newModel);
      setPublishedSuccess(true);
    }
  };

  const formatTime = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const copySnippet = () => {
    navigator.clipboard.writeText(BRIDGE_SETUP_SNIPPET);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1800);
  };

  const isGenerating = generation.stage !== 'idle' && generation.stage !== 'completed' && generation.stage !== 'error';

  return (
    <div className="space-y-6">
      {/* Studio Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-950 p-5 rounded-2xl border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Cpu className="w-5 h-5" />
            </span>
            <h1 className="text-xl sm:text-2xl font-display font-bold text-white tracking-wide">
              AI Generation Studio <span className="text-cyan-400 font-mono text-sm font-normal">[Hardware Bridge]</span>
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
            Real-time long-polling against local ComfyUI, TripoSR, or SF3D hardware daemons with live slicer telemetry, 3D calibration HUD, and direct marketplace publishing.
          </p>
        </div>

        {/* Local Relay Quick Config Bar */}
        <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-2.5 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-mono text-slate-400 px-1">
            <span className={`w-2 h-2 rounded-full ${settings.isLocalRelayOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span className="text-[11px] font-semibold">{settings.isLocalRelayOnline ? 'Bridge Online' : 'Simulator'}</span>
          </div>
          <input
            type="text"
            value={endpointUrl}
            onChange={(e) => {
              setEndpointUrl(e.target.value);
              setSettings((prev) => ({ ...prev, localRelayUrl: e.target.value }));
            }}
            placeholder="http://localhost:8000/generate"
            className="bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-500 min-w-[210px]"
            id="input-local-relay-url"
          />
          <div className="flex gap-1">
            <button
              type="button"
              onClick={handleTestRelay}
              disabled={isRelayTesting}
              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono rounded border border-slate-700 transition-colors flex items-center justify-center gap-1 shrink-0"
              id="btn-test-relay"
              title="Test HTTP connection to bridge"
            >
              {isRelayTesting ? <RefreshCw className="w-3 h-3 animate-spin text-cyan-400" /> : <Zap className="w-3 h-3 text-cyan-400" />}
              <span>Ping</span>
            </button>
            <button
              type="button"
              onClick={() => setShowCodeSnippetModal(true)}
              className="p-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-cyan-300 rounded border border-slate-700"
              title="View Local Python Bridge Server Code"
            >
              <Code className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Bridge Diagnostics Error Boundary Alert if Connection Fails */}
      {bridgeError && (
        <div className="bg-amber-950/60 border border-amber-500/60 rounded-xl p-4 shadow-xl space-y-3 animate-fadeIn">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              <span>Bridge Hardware Diagnostics: {bridgeError.reason}</span>
            </div>
            <button
              type="button"
              onClick={() => setBridgeError(null)}
              className="text-slate-400 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="text-xs font-mono text-slate-300">
            Target Endpoint: <span className="text-cyan-300 underline">{bridgeError.endpoint}</span>
          </div>

          <div className="bg-slate-950/80 rounded-lg p-3 border border-slate-800/80 space-y-1 text-xs font-mono">
            <div className="text-slate-400 font-bold mb-1">Recommended Troubleshooting Steps:</div>
            {bridgeError.details.map((step, idx) => (
              <div key={idx} className="text-slate-300 flex items-center gap-2">
                <span className="text-amber-400">•</span>
                <span>{step}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                setSettings((prev) => ({ ...prev, isLocalRelayOnline: false }));
                setBridgeError(null);
                runSimulatedPipeline(geometryType);
              }}
              className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs font-mono rounded-lg transition-colors flex items-center gap-1.5 shadow-md shadow-emerald-500/20"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Switch to Simulation Mode & Generate</span>
            </button>

            <button
              type="button"
              onClick={() => setShowCodeSnippetModal(true)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 font-mono text-xs rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5"
            >
              <Code className="w-3.5 h-3.5" />
              <span>View Sample Python Bridge Daemon</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Studio Grid: Left Controls, Right Viewport + Telemetry */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Prompt Composer & Slicer Selectors (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          
          {/* 1. Prompt Composer Card */}
          <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-xl p-4 sm:p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono uppercase text-slate-300 tracking-wider flex items-center gap-1.5 font-semibold">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>Prompt Composer</span>
              </label>
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400">
                <span>Seed:</span>
                <input
                  type="number"
                  value={seed}
                  onChange={(e) => setSeed(Number(e.target.value))}
                  className="w-20 bg-slate-950 border border-slate-700 rounded px-1.5 py-0.5 text-right text-emerald-400 font-mono text-xs focus:outline-none"
                />
              </div>
            </div>

            {/* Style Chips */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-mono text-slate-400">Pre-set Style Archetypes:</span>
              <div className="grid grid-cols-2 gap-2">
                {STYLE_CHIPS.map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => handleSelectChip(chip)}
                    className={`px-2.5 py-2 rounded-lg text-left text-xs font-medium border transition-all flex flex-col justify-between gap-1 ${
                      activeChip === chip.label
                        ? 'bg-cyan-500/15 border-cyan-500 text-cyan-300 shadow-sm'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{chip.label}</span>
                      {activeChip === chip.label && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />}
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono uppercase">
                      {chip.type}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Prompt Textarea */}
            <div className="space-y-1">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                placeholder="Describe your 3D component geometry, mechanical constraints, or aesthetic features..."
                className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-lg p-3 text-xs sm:text-sm text-slate-100 placeholder-slate-500 resize-none font-sans focus:outline-none transition-colors"
                id="textarea-prompt-composer"
              />
            </div>
          </div>

          {/* 2. Slicing / Print Target Selectors Card */}
          <div className="bg-slate-900/70 backdrop-blur border border-slate-800 rounded-xl p-4 sm:p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono uppercase text-slate-300 tracking-wider flex items-center gap-1.5 font-semibold">
                <Layers className="w-3.5 h-3.5 text-emerald-400" />
                <span>Slicing & Print Profile</span>
              </label>
              <span className="text-[11px] font-mono text-emerald-400">
                Ender 3 / Prusa MK4 Spec
              </span>
            </div>

            {/* Filament Type Selector */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-400">Filament Material:</span>
                <span className="text-emerald-400 font-semibold">
                  ${FILAMENT_SPECS[slicingParams.filament].costPerKg}/kg • {FILAMENT_SPECS[slicingParams.filament].density} g/cm³
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {(['PLA', 'PETG', 'TPU', 'ABS'] as FilamentType[]).map((f) => {
                  const spec = FILAMENT_SPECS[f];
                  const isSelected = slicingParams.filament === f;
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setSlicingParams((prev) => ({ ...prev, filament: f }))}
                      className={`py-2 px-1 rounded-lg border text-center text-xs font-mono transition-all flex flex-col items-center justify-center gap-0.5 ${
                        isSelected
                          ? 'bg-slate-800 border-emerald-400 text-white font-bold shadow-sm'
                          : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: spec.color }} />
                        <span>{f}</span>
                      </div>
                      <span className="text-[9px] text-slate-400">{spec.defaultNozzleTemp}°C</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Infill Density Slider */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-400">Infill Density:</span>
                <span className="text-cyan-400 font-bold">{slicingParams.infill}%</span>
              </div>
              <input
                type="range"
                min="15"
                max="100"
                step="5"
                value={slicingParams.infill}
                onChange={(e) =>
                  setSlicingParams((prev) => ({ ...prev, infill: Number(e.target.value) }))
                }
                className="w-full accent-cyan-400 cursor-pointer h-2 bg-slate-950 rounded-lg appearance-none"
                id="slider-infill-density"
              />
              <div className="flex justify-between text-[10px] font-mono text-slate-400 px-0.5">
                <span>15% (Light)</span>
                <span>40% (Structural)</span>
                <span>100% (Solid)</span>
              </div>
            </div>

            {/* Layer Height Preset Chips */}
            <div className="space-y-1.5">
              <span className="text-xs font-mono text-slate-400">Layer Height Resolution:</span>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: '0.12', label: '0.12mm', sub: 'High Detail' },
                  { value: '0.20', label: '0.20mm', sub: 'Standard' },
                  { value: '0.28', label: '0.28mm', sub: 'Draft Fast' },
                ].map((preset) => {
                  const isSelected = slicingParams.layerHeight === preset.value;
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() =>
                        setSlicingParams((prev) => ({
                          ...prev,
                          layerHeight: preset.value as LayerHeightPreset,
                        }))
                      }
                      className={`p-2 rounded-lg border text-center transition-all ${
                        isSelected
                          ? 'bg-cyan-950/40 border-cyan-400 text-cyan-300'
                          : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className="font-mono text-xs font-bold">{preset.label}</div>
                      <div className="text-[10px] text-slate-400">{preset.sub}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Wall count & Infill Pattern */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-[11px] font-mono text-slate-400 block mb-1">
                  Perimeter Walls:
                </label>
                <select
                  value={slicingParams.wallCount}
                  onChange={(e) =>
                    setSlicingParams((prev) => ({ ...prev, wallCount: Number(e.target.value) }))
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value={2}>2 Walls (Standard)</option>
                  <option value={3}>3 Walls (Rigid)</option>
                  <option value={4}>4 Walls (Heavy-Duty)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-mono text-slate-400 block mb-1">
                  Infill Pattern:
                </label>
                <select
                  value={slicingParams.infillPattern}
                  onChange={(e) =>
                    setSlicingParams((prev) => ({
                      ...prev,
                      infillPattern: e.target.value as SlicingParams['infillPattern'],
                    }))
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="gyroid">Gyroid (Isotropic)</option>
                  <option value="grid">Grid (Fast)</option>
                  <option value="honeycomb">Honeycomb (High Strength)</option>
                </select>
              </div>
            </div>

            {/* Generate Action Button */}
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-display font-bold text-sm tracking-wider uppercase transition-all shadow-lg shadow-cyan-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
              id="btn-generate-3d-model"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                  <span>Synthesizing Geometry (Stage {pollingStep}/4)...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-slate-950" />
                  <span>Generate 3D Model</span>
                </>
              )}
            </button>
          </div>

          {/* End-to-End 4-Stage Visual Progress Stepper */}
          {generation.stage !== 'idle' && (
            <div className="bg-slate-900/90 border border-cyan-500/40 rounded-xl p-4 space-y-3 shadow-xl">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-cyan-400 font-semibold uppercase flex items-center gap-1.5">
                  <RefreshCw className={`w-3.5 h-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
                  <span>{generation.statusText}</span>
                </span>
                <span className="text-emerald-400 font-bold">{generation.progressPercent}%</span>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-300 rounded-full"
                  style={{ width: `${generation.progressPercent}%` }}
                />
              </div>

              {/* 4-Stage Visual Stepper Indicators */}
              <div className="grid grid-cols-4 gap-1.5 pt-1">
                {[
                  { step: 1, label: 'Queue' },
                  { step: 2, label: 'Diffusion' },
                  { step: 3, label: '3D Mesh' },
                  { step: 4, label: 'Download' },
                ].map((s) => {
                  const isDone = pollingStep > s.step || generation.stage === 'completed';
                  const isCurrent = pollingStep === s.step && isGenerating;
                  return (
                    <div
                      key={s.step}
                      className={`p-1.5 rounded text-center text-[10px] font-mono border transition-all ${
                        isDone
                          ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-300'
                          : isCurrent
                          ? 'bg-cyan-950/60 border-cyan-400 text-cyan-200 animate-pulse'
                          : 'bg-slate-950/60 border-slate-800 text-slate-500'
                      }`}
                    >
                      <div className="font-bold">
                        {isDone ? '✓ ' : ''}Stage {s.step}
                      </div>
                      <div className="truncate">{s.label}</div>
                    </div>
                  );
                })}
              </div>

              {generation.stepDetails && (
                <div className="text-[11px] font-mono text-slate-400 bg-slate-950/80 p-2 rounded border border-slate-800/80">
                  &gt; {generation.stepDetails}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Right Column: Interactive 3D Canvas & Mesh Stats Readout (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          
          {/* 3D Canvas Viewport with Caliper & Slicer HUD */}
          <div className="relative">
            <ThreeViewport
              geometry={activeGeometry}
              filamentType={slicingParams.filament}
              dimensionsMm={metrics.dimensionsMm}
              autoRotateDefault={false}
              height="h-[390px] sm:h-[440px]"
              onGeometryChanged={(newGeo) => {
                setActiveGeometry(newGeo);
                addLog('[STUDIO] Mesh modified and updated in 3D viewport.');
              }}
              isGenerating={isGenerating}
              telemetry={liveTelemetry}
              generationProgress={generation.progressPercent}
              stageStatusText={generation.statusText}
              onSetMarketplaceCover={(coverUrl) => {
                setCustomCoverUrl(coverUrl);
                addLog('[STUDIO] Studio snapshot linked as marketplace cover photo!');
              }}
            />
          </div>

          {/* Mesh Stats Readout Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Vertex & Face count */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 shadow-sm">
              <div className="flex items-center gap-1.5 text-slate-400 text-xs font-mono mb-1">
                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                <span>Complexity</span>
              </div>
              <div className="text-lg font-mono font-bold text-white">
                {metrics.vertexCount.toLocaleString()}
              </div>
              <div className="text-[10px] font-mono text-slate-400">
                {metrics.triangleCount.toLocaleString()} triangles
              </div>
            </div>

            {/* Estimated Print Time */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 shadow-sm">
              <div className="flex items-center gap-1.5 text-slate-400 text-xs font-mono mb-1">
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                <span>Print Time</span>
              </div>
              <div className="text-lg font-mono font-bold text-emerald-400">
                {formatTime(metrics.estimatedPrintTimeMinutes)}
              </div>
              <div className="text-[10px] font-mono text-slate-400">
                @{slicingParams.layerHeight}mm • {slicingParams.printSpeed} mm/s
              </div>
            </div>

            {/* Material Mass & Length */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 shadow-sm">
              <div className="flex items-center gap-1.5 text-slate-400 text-xs font-mono mb-1">
                <Scale className="w-3.5 h-3.5 text-amber-400" />
                <span>Filament Mass</span>
              </div>
              <div className="text-lg font-mono font-bold text-white">
                {metrics.weightGrams} <span className="text-xs font-normal text-slate-400">grams</span>
              </div>
              <div className="text-[10px] font-mono text-slate-400">
                ~{metrics.filamentLengthMeters}m of 1.75mm
              </div>
            </div>

            {/* Material Raw Cost */}
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 shadow-sm">
              <div className="flex items-center gap-1.5 text-slate-400 text-xs font-mono mb-1">
                <Coins className="w-3.5 h-3.5 text-emerald-400" />
                <span>Material Cost</span>
              </div>
              <div className="text-lg font-mono font-bold text-emerald-400">
                ${metrics.materialCostUsd.toFixed(2)}
              </div>
              <div className="text-[10px] font-mono text-slate-400">
                {slicingParams.filament} @ ${FILAMENT_SPECS[slicingParams.filament].costPerKg}/kg
              </div>
            </div>
          </div>

          {/* Studio Cover Banner if set from Studio Snapshot */}
          {customCoverUrl && (
            <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-2.5 flex items-center justify-between gap-3 text-xs font-mono">
              <div className="flex items-center gap-2.5">
                <img
                  src={customCoverUrl}
                  alt="Marketplace Cover Preview"
                  className="w-12 h-8 object-cover rounded border border-emerald-500/50"
                />
                <div>
                  <span className="text-emerald-400 font-bold block">Marketplace Cover Attached</span>
                  <span className="text-[10px] text-slate-400">High-Res Studio Snapshot will be used for marketplace listing</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCustomCoverUrl(null)}
                className="text-[10px] text-slate-500 hover:text-slate-300"
              >
                Clear
              </button>
            </div>
          )}

          {/* Action Toolbar: Download .STL & Send to Marketplace */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleDownloadStl}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-semibold text-xs font-mono rounded-lg transition-all flex items-center gap-2 shadow-md shadow-cyan-500/20"
                id="btn-download-stl"
              >
                <Download className="w-4 h-4 text-slate-950" />
                <span>Export .STL File</span>
              </button>

              <button
                type="button"
                onClick={handleSendToMarketplace}
                className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs font-mono rounded-lg transition-all flex items-center gap-2 shadow-md shadow-emerald-500/20"
                id="btn-send-to-marketplace"
              >
                <Share2 className="w-4 h-4 text-slate-950" />
                <span>Send to Marketplace</span>
              </button>
            </div>

            {publishedSuccess && (
              <div className="flex items-center gap-1.5 text-xs font-mono text-emerald-400 bg-emerald-950/60 px-2.5 py-1 rounded border border-emerald-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Listed in Marketplace Feed!</span>
              </div>
            )}
          </div>

          {/* Telemetry Logs Panel */}
          <div className="bg-slate-950 border border-slate-800/90 rounded-xl p-3 font-mono text-[11px] text-slate-400 shadow-inner">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/80 text-xs">
              <span className="flex items-center gap-1.5 text-slate-300 font-semibold">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                <span>Hardware Bridge Telemetry</span>
              </span>
              <span className="text-[10px] text-slate-400">
                Relay: {settings.isLocalRelayOnline ? 'ONLINE' : 'SIMULATION'}
              </span>
            </div>
            <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
              {logs.map((log, idx) => (
                <div key={idx} className="leading-relaxed">
                  {log.includes('SUCCESS') || log.includes('OK') ? (
                    <span className="text-emerald-400">{log}</span>
                  ) : log.includes('Stage') || log.includes('POLL') ? (
                    <span className="text-cyan-300">{log}</span>
                  ) : log.includes('ERROR') || log.includes('WARN') ? (
                    <span className="text-amber-400">{log}</span>
                  ) : (
                    log
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

      {/* Python Bridge Server Helper Modal */}
      {showCodeSnippetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Code className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-white text-base">Local Python Relay Server (FastAPI)</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCodeSnippetModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 font-mono">
              PrintForge reaches your GPU through <code className="text-cyan-300">server/bridge.py</code>, a FastAPI relay that queues <code className="text-cyan-300">server/workflow_api.json</code> in ComfyUI and streams progress back here:
            </p>

            <div className="relative">
              <pre className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 font-mono text-[11px] text-emerald-300 overflow-x-auto max-h-64">
                {BRIDGE_SETUP_SNIPPET}
              </pre>
              <button
                type="button"
                onClick={copySnippet}
                className="absolute right-3 top-3 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-xs font-mono text-slate-200 rounded border border-slate-700 flex items-center gap-1.5 transition-colors"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCode ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>

            <div className="text-[11px] font-mono text-slate-400">
              Health check: <code className="text-cyan-300 bg-slate-950 px-1.5 py-0.5 rounded">{bridgeBaseUrl(endpointUrl)}/health</code>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowCodeSnippetModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const BRIDGE_SETUP_SNIPPET = `# 1. One-time bridge setup (run in the PrintForge folder)
npm run bridge:setup

# 2. Start ComfyUI (Comfy Desktop) -> http://127.0.0.1:8188

# 3. Start the bridge and keep this terminal open
npm run bridge            # -> http://127.0.0.1:8000

# 4. In a second terminal, start the web app
npm run dev               # -> http://localhost:5173

# Models the default workflow (server/workflow_api.json) needs:
#   ComfyUI/models/checkpoints/sd_xl_base_1.0.safetensors
#   ComfyUI/models/checkpoints/hunyuan3d-dit-v2_fp16.safetensors
#   ComfyUI/models/background_removal/birefnet.safetensors
`;
