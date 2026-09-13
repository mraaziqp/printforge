import React, { useState, useEffect } from 'react';
import { 
  Wrench, 
  Type, 
  CircleDot, 
  Maximize2, 
  Download, 
  RotateCcw, 
  Check, 
  X, 
  Sliders, 
  ArrowUpDown,
  Magnet,
  Layers,
  Sparkles
} from 'lucide-react';
import * as THREE from 'three';
import { 
  HolePunchConfig, 
  TextEmbossConfig, 
  ScalingConfig, 
  HolePreset, 
  HoleAxis 
} from '../types';
import { 
  punchHole, 
  embossTextOnMesh, 
  scaleMeshGeometry, 
  HOLE_PRESET_SPECS 
} from '../utils/meshModifier';

interface MeshModifierDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  baseGeometry: THREE.BufferGeometry;
  onApplyModifiedGeometry: (newGeo: THREE.BufferGeometry, actionLabel: string) => void;
  onResetGeometry: () => void;
  isModified: boolean;
  currentDimensions: { x: number; y: number; z: number };
  onUpdatePreviewHole: (config: HolePunchConfig | null) => void;
  onUpdatePreviewText: (config: TextEmbossConfig | null) => void;
  onExportStl: () => void;
}

export const MeshModifierDrawer: React.FC<MeshModifierDrawerProps> = ({
  isOpen,
  onClose,
  baseGeometry,
  onApplyModifiedGeometry,
  onResetGeometry,
  isModified,
  currentDimensions,
  onUpdatePreviewHole,
  onUpdatePreviewText,
  onExportStl,
}) => {
  const [activeTab, setActiveTab] = useState<'hole' | 'text' | 'scale'>('hole');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Hole Puncher State
  const [holePreset, setHolePreset] = useState<HolePreset>('M3');
  const [customDiameter, setCustomDiameter] = useState<number>(3.2);
  const [holeDepth, setHoleDepth] = useState<number>(15);
  const [holeAxis, setHoleAxis] = useState<HoleAxis>('Y');
  const [holePosX, setHolePosX] = useState<number>(0);
  const [holePosY, setHolePosY] = useState<number>(15);
  const [holePosZ, setHolePosZ] = useState<number>(0);
  const [isThroughHole, setIsThroughHole] = useState<boolean>(true);

  // Text Emboss / Engrave State
  const [embossText, setEmbossText] = useState<string>('PRINTFORGE');
  const [fontSize, setFontSize] = useState<number>(8);
  const [textDepth, setTextDepth] = useState<number>(1.5);
  const [isEngrave, setIsEngrave] = useState<boolean>(false);
  const [textPlacement, setTextPlacement] = useState<'top' | 'front' | 'side'>('top');
  const [textPosX, setTextPosX] = useState<number>(0);
  const [textPosY, setTextPosY] = useState<number>(30);
  const [textPosZ, setTextPosZ] = useState<number>(0);

  // Scaling State
  const [uniformScale, setUniformScale] = useState<boolean>(true);
  const [scaleFactorX, setScaleFactorX] = useState<number>(100); // 100%
  const [scaleFactorY, setScaleFactorY] = useState<number>(100);
  const [scaleFactorZ, setScaleFactorZ] = useState<number>(100);

  // Initialize positions based on geometry bounding box
  useEffect(() => {
    baseGeometry.computeBoundingBox();
    const box = baseGeometry.boundingBox || new THREE.Box3();
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);

    setHolePosX(Math.round(center.x));
    setHolePosY(Math.round(center.y));
    setHolePosZ(Math.round(center.z));

    if (textPlacement === 'top') {
      setTextPosX(Math.round(center.x));
      setTextPosY(Math.round(box.max.y));
      setTextPosZ(Math.round(center.z));
    } else if (textPlacement === 'front') {
      setTextPosX(Math.round(center.x));
      setTextPosY(Math.round(center.y));
      setTextPosZ(Math.round(box.max.z));
    } else {
      setTextPosX(Math.round(box.max.x));
      setTextPosY(Math.round(center.y));
      setTextPosZ(Math.round(center.z));
    }
  }, [baseGeometry, textPlacement]);

  // Update Hole Preview in Three.js scene
  useEffect(() => {
    if (!isOpen || activeTab !== 'hole') {
      onUpdatePreviewHole(null);
      return;
    }

    const dia = holePreset === 'Custom' ? customDiameter : HOLE_PRESET_SPECS[holePreset].diameter;
    onUpdatePreviewHole({
      preset: holePreset,
      diameter: dia,
      depth: holeDepth,
      axis: holeAxis,
      posX: holePosX,
      posY: holePosY,
      posZ: holePosZ,
      isThrough: isThroughHole,
    });
  }, [
    isOpen,
    activeTab,
    holePreset,
    customDiameter,
    holeDepth,
    holeAxis,
    holePosX,
    holePosY,
    holePosZ,
    isThroughHole,
    onUpdatePreviewHole,
  ]);

  // Update Text Preview in Three.js scene
  useEffect(() => {
    if (!isOpen || activeTab !== 'text') {
      onUpdatePreviewText(null);
      return;
    }

    onUpdatePreviewText({
      text: embossText,
      fontSize,
      depth: isEngrave ? -Math.abs(textDepth) : Math.abs(textDepth),
      placement: textPlacement,
      posX: textPosX,
      posY: textPosY,
      posZ: textPosZ,
      isEngrave,
    });
  }, [
    isOpen,
    activeTab,
    embossText,
    fontSize,
    textDepth,
    isEngrave,
    textPlacement,
    textPosX,
    textPosY,
    textPosZ,
    onUpdatePreviewText,
  ]);

  if (!isOpen) return null;

  // Execute Hole Punch operation
  const handleExecutePunchHole = async () => {
    setIsProcessing(true);
    setActionNotice(null);

    // Yield to render frame
    await new Promise((r) => setTimeout(r, 20));

    try {
      const dia = holePreset === 'Custom' ? customDiameter : HOLE_PRESET_SPECS[holePreset].diameter;
      const config: HolePunchConfig = {
        preset: holePreset,
        diameter: dia,
        depth: holeDepth,
        axis: holeAxis,
        posX: holePosX,
        posY: holePosY,
        posZ: holePosZ,
        isThrough: isThroughHole,
      };

      const resultGeo = punchHole(baseGeometry, config);
      onApplyModifiedGeometry(
        resultGeo,
        `Punched ${holePreset} (${dia}mm) hole along ${holeAxis}-axis`
      );
      setActionNotice(`✓ Subtracted ${dia}mm hole successfully.`);
    } catch (err: any) {
      console.error('Punch hole error:', err);
      setActionNotice('Error executing CSG hole subtraction. Check geometry manifold.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Execute Text Emboss / Engrave
  const handleExecuteEmbossText = async () => {
    if (!embossText.trim()) return;
    setIsProcessing(true);
    setActionNotice(null);

    await new Promise((r) => setTimeout(r, 20));

    try {
      const config: TextEmbossConfig = {
        text: embossText,
        fontSize,
        depth: isEngrave ? -Math.abs(textDepth) : Math.abs(textDepth),
        placement: textPlacement,
        posX: textPosX,
        posY: textPosY,
        posZ: textPosZ,
        isEngrave,
      };

      const resultGeo = embossTextOnMesh(baseGeometry, config);
      const actionType = isEngrave ? 'Engraved' : 'Embossed';
      onApplyModifiedGeometry(
        resultGeo,
        `${actionType} "${embossText}" (${fontSize}mm, ${textDepth}mm depth)`
      );
      setActionNotice(`✓ ${actionType} text applied to mesh.`);
    } catch (err: any) {
      console.error('Emboss text error:', err);
      setActionNotice('Error applying 3D text. Try adjusting font size or position.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Execute Scaling
  const handleExecuteScale = () => {
    setIsProcessing(true);
    try {
      const sx = scaleFactorX / 100;
      const sy = scaleFactorY / 100;
      const sz = scaleFactorZ / 100;

      const resultGeo = scaleMeshGeometry(baseGeometry, sx, sy, sz);
      onApplyModifiedGeometry(
        resultGeo,
        `Scaled mesh [${scaleFactorX}%, ${scaleFactorY}%, ${scaleFactorZ}%]`
      );
      setActionNotice(`✓ Applied scale: ${scaleFactorX}%, ${scaleFactorY}%, ${scaleFactorZ}%.`);
      setScaleFactorX(100);
      setScaleFactorY(100);
      setScaleFactorZ(100);
    } catch (err: any) {
      console.error('Scale error:', err);
      setActionNotice('Error applying scale operation.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="absolute top-0 right-0 bottom-0 z-30 w-80 sm:w-96 bg-slate-900/95 backdrop-blur-md border-l border-slate-700/80 shadow-2xl flex flex-col pointer-events-auto text-slate-200">
      {/* Header */}
      <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-cyan-500/20 text-cyan-400 rounded-md">
            <Wrench className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">3D Mesh Modifier</h3>
            <p className="text-[10px] text-slate-400 font-mono">In-Browser Parametric CAD</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-white rounded-md hover:bg-slate-800 transition-colors"
          title="Close Modifier Panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 bg-slate-950/30 text-xs font-mono">
        <button
          type="button"
          onClick={() => setActiveTab('hole')}
          className={`flex-1 py-2.5 px-2 flex items-center justify-center gap-1.5 border-b-2 transition-all ${
            activeTab === 'hole'
              ? 'border-cyan-400 text-cyan-300 bg-cyan-500/10 font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <CircleDot className="w-3.5 h-3.5" />
          <span>Holes</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('text')}
          className={`flex-1 py-2.5 px-2 flex items-center justify-center gap-1.5 border-b-2 transition-all ${
            activeTab === 'text'
              ? 'border-cyan-400 text-cyan-300 bg-cyan-500/10 font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Type className="w-3.5 h-3.5" />
          <span>Emboss</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('scale')}
          className={`flex-1 py-2.5 px-2 flex items-center justify-center gap-1.5 border-b-2 transition-all ${
            activeTab === 'scale'
              ? 'border-cyan-400 text-cyan-300 bg-cyan-500/10 font-bold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Maximize2 className="w-3.5 h-3.5" />
          <span>Scale</span>
        </button>
      </div>

      {/* Main Drawer Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs font-mono">
        {/* TAB 1: HOLE PUNCHER */}
        {activeTab === 'hole' && (
          <div className="space-y-3.5">
            <div>
              <label className="text-slate-300 font-bold block mb-1.5 flex items-center gap-1.5">
                <CircleDot className="w-3.5 h-3.5 text-cyan-400" />
                <span>Standard Hardware Preset</span>
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {(['M3', 'M4', 'M5', 'Magnet-6x3'] as HolePreset[]).map((preset) => {
                  const spec = HOLE_PRESET_SPECS[preset];
                  const isSel = holePreset === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setHolePreset(preset);
                        if (preset === 'Magnet-6x3') {
                          setIsThroughHole(false);
                          setHoleDepth(3.2);
                        }
                      }}
                      className={`p-2 rounded-lg border text-left transition-all ${
                        isSel
                          ? 'bg-cyan-500/20 border-cyan-500 text-cyan-200 font-bold shadow-sm'
                          : 'bg-slate-800/60 border-slate-700 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{preset === 'Magnet-6x3' ? 'Magnet 6×3' : preset}</span>
                        {preset === 'Magnet-6x3' && <Magnet className="w-3 h-3 text-cyan-400" />}
                      </div>
                      <span className="text-[10px] text-slate-400 block font-normal">
                        Ø {spec.diameter}mm
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Axis Selector */}
            <div>
              <label className="text-slate-300 font-bold block mb-1.5">Drill Axis Orientation</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['Y', 'X', 'Z'] as HoleAxis[]).map((axis) => (
                  <button
                    key={axis}
                    type="button"
                    onClick={() => setHoleAxis(axis)}
                    className={`py-1.5 px-2 rounded-md border text-center transition-all ${
                      holeAxis === axis
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold'
                        : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    {axis === 'Y' ? 'Vertical (Y)' : axis === 'X' ? 'Side (X)' : 'Depth (Z)'}
                  </button>
                ))}
              </div>
            </div>

            {/* Through vs Blind Hole */}
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/40 border border-slate-700/60">
              <span className="text-slate-300">Through-Hole Drill</span>
              <button
                type="button"
                onClick={() => setIsThroughHole(!isThroughHole)}
                className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
                  isThroughHole
                    ? 'bg-cyan-500 text-slate-950 shadow-sm'
                    : 'bg-slate-700 text-slate-300'
                }`}
              >
                {isThroughHole ? 'Through Entire Mesh' : 'Blind Depth'}
              </button>
            </div>

            {!isThroughHole && (
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">Blind Hole Depth</span>
                  <span className="text-cyan-300 font-bold">{holeDepth} mm</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="60"
                  value={holeDepth}
                  onChange={(e) => setHoleDepth(Number(e.target.value))}
                  className="w-full accent-cyan-400"
                />
              </div>
            )}

            {/* Position Sliders */}
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2">
              <span className="text-slate-400 font-bold block text-[11px]">Cutter Position (mm)</span>
              
              <div>
                <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                  <span>X Position</span>
                  <span className="text-cyan-300">{holePosX} mm</span>
                </div>
                <input
                  type="range"
                  min={-Math.round(currentDimensions.x / 2) - 10}
                  max={Math.round(currentDimensions.x / 2) + 10}
                  value={holePosX}
                  onChange={(e) => setHolePosX(Number(e.target.value))}
                  className="w-full accent-cyan-400 h-1 bg-slate-800 rounded"
                />
              </div>

              <div>
                <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                  <span>Y Height (Build)</span>
                  <span className="text-cyan-300">{holePosY} mm</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.round(currentDimensions.z) + 10}
                  value={holePosY}
                  onChange={(e) => setHolePosY(Number(e.target.value))}
                  className="w-full accent-cyan-400 h-1 bg-slate-800 rounded"
                />
              </div>

              <div>
                <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                  <span>Z Depth</span>
                  <span className="text-cyan-300">{holePosZ} mm</span>
                </div>
                <input
                  type="range"
                  min={-Math.round(currentDimensions.y / 2) - 10}
                  max={Math.round(currentDimensions.y / 2) + 10}
                  value={holePosZ}
                  onChange={(e) => setHolePosZ(Number(e.target.value))}
                  className="w-full accent-cyan-400 h-1 bg-slate-800 rounded"
                />
              </div>
            </div>

            {/* Execute Button */}
            <button
              type="button"
              disabled={isProcessing}
              onClick={handleExecutePunchHole}
              className="w-full py-2.5 px-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              <CircleDot className="w-4 h-4" />
              <span>{isProcessing ? 'Subtracting CSG Hole...' : 'Punch Hole Through Mesh'}</span>
            </button>
          </div>
        )}

        {/* TAB 2: TEXT EMBOSS / ENGRAVE */}
        {activeTab === 'text' && (
          <div className="space-y-3.5">
            <div>
              <label className="text-slate-300 font-bold block mb-1">Custom Text Label</label>
              <input
                type="text"
                value={embossText}
                maxLength={24}
                onChange={(e) => setEmbossText(e.target.value)}
                placeholder="e.g., PRINTFORGE, V2.0"
                className="w-full px-3 py-2 bg-slate-800/80 border border-slate-700 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
              />
            </div>

            {/* Mode: Emboss vs Engrave */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsEngrave(false)}
                className={`py-2 px-2 rounded-lg border text-center transition-all ${
                  !isEngrave
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 font-bold'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400'
                }`}
              >
                Emboss (+Raised)
              </button>
              <button
                type="button"
                onClick={() => setIsEngrave(true)}
                className={`py-2 px-2 rounded-lg border text-center transition-all ${
                  isEngrave
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold'
                    : 'bg-slate-800/60 border-slate-700 text-slate-400'
                }`}
              >
                Engrave (-Recessed)
              </button>
            </div>

            {/* Placement Face */}
            <div>
              <label className="text-slate-300 font-bold block mb-1">Placement Face</label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['top', 'front', 'side'] as const).map((face) => (
                  <button
                    key={face}
                    type="button"
                    onClick={() => setTextPlacement(face)}
                    className={`py-1.5 px-2 rounded-md border text-center capitalize transition-all ${
                      textPlacement === face
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold'
                        : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    {face} Face
                  </button>
                ))}
              </div>
            </div>

            {/* Font Size & Depth Sliders */}
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-400">Font Height</span>
                <span className="text-cyan-300 font-bold">{fontSize} mm</span>
              </div>
              <input
                type="range"
                min="4"
                max="24"
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-full accent-cyan-400"
              />
            </div>

            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-400">Extrusion Depth</span>
                <span className="text-cyan-300 font-bold">{textDepth} mm</span>
              </div>
              <input
                type="range"
                min="0.4"
                max="4.0"
                step="0.2"
                value={textDepth}
                onChange={(e) => setTextDepth(Number(e.target.value))}
                className="w-full accent-cyan-400"
              />
            </div>

            {/* Position Adjustment */}
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 space-y-2">
              <span className="text-slate-400 font-bold block text-[11px]">Position Fine-Tune (mm)</span>
              <div>
                <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                  <span>Horizontal (X)</span>
                  <span className="text-cyan-300">{textPosX} mm</span>
                </div>
                <input
                  type="range"
                  min={-Math.round(currentDimensions.x / 2) - 5}
                  max={Math.round(currentDimensions.x / 2) + 5}
                  value={textPosX}
                  onChange={(e) => setTextPosX(Number(e.target.value))}
                  className="w-full accent-cyan-400 h-1 bg-slate-800 rounded"
                />
              </div>
            </div>

            {/* Apply Button */}
            <button
              type="button"
              disabled={isProcessing || !embossText.trim()}
              onClick={handleExecuteEmbossText}
              className="w-full py-2.5 px-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              <Type className="w-4 h-4" />
              <span>{isProcessing ? 'Generating 3D CSG Text...' : `Apply 3D ${isEngrave ? 'Engraving' : 'Embossing'}`}</span>
            </button>
          </div>
        )}

        {/* TAB 3: SCALING */}
        {activeTab === 'scale' && (
          <div className="space-y-3.5">
            <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/40 border border-slate-700/60">
              <span className="text-slate-300">Uniform Aspect Lock</span>
              <button
                type="button"
                onClick={() => setUniformScale(!uniformScale)}
                className={`px-2.5 py-1 rounded text-[11px] font-bold transition-all ${
                  uniformScale
                    ? 'bg-cyan-500 text-slate-950'
                    : 'bg-slate-700 text-slate-300'
                }`}
              >
                {uniformScale ? 'Locked (1:1:1)' : 'Free Independent'}
              </button>
            </div>

            {/* X Scale */}
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-400">Scale X (Width): {Math.round(currentDimensions.x * (scaleFactorX / 100))}mm</span>
                <span className="text-cyan-300 font-bold">{scaleFactorX}%</span>
              </div>
              <input
                type="range"
                min="25"
                max="300"
                value={scaleFactorX}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setScaleFactorX(val);
                  if (uniformScale) {
                    setScaleFactorY(val);
                    setScaleFactorZ(val);
                  }
                }}
                className="w-full accent-cyan-400"
              />
            </div>

            {/* Y Scale */}
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-400">Scale Y (Depth): {Math.round(currentDimensions.y * (scaleFactorY / 100))}mm</span>
                <span className="text-cyan-300 font-bold">{scaleFactorY}%</span>
              </div>
              <input
                type="range"
                min="25"
                max="300"
                disabled={uniformScale}
                value={scaleFactorY}
                onChange={(e) => setScaleFactorY(Number(e.target.value))}
                className="w-full accent-cyan-400 disabled:opacity-50"
              />
            </div>

            {/* Z Scale */}
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-slate-400">Scale Z (Height): {Math.round(currentDimensions.z * (scaleFactorZ / 100))}mm</span>
                <span className="text-cyan-300 font-bold">{scaleFactorZ}%</span>
              </div>
              <input
                type="range"
                min="25"
                max="300"
                disabled={uniformScale}
                value={scaleFactorZ}
                onChange={(e) => setScaleFactorZ(Number(e.target.value))}
                className="w-full accent-cyan-400 disabled:opacity-50"
              />
            </div>

            <button
              type="button"
              disabled={isProcessing}
              onClick={handleExecuteScale}
              className="w-full py-2.5 px-3 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white font-bold rounded-lg shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              <Maximize2 className="w-4 h-4" />
              <span>Apply Dimensional Scale</span>
            </button>
          </div>
        )}

        {/* Action Notice */}
        {actionNotice && (
          <div className="p-2.5 rounded-lg bg-cyan-950/80 border border-cyan-800 text-[11px] text-cyan-200">
            {actionNotice}
          </div>
        )}
      </div>

      {/* Footer Controls: Export Modified STL & Reset */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/80 space-y-2">
        <button
          type="button"
          onClick={onExportStl}
          className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 text-cyan-300 hover:text-cyan-200 border border-cyan-500/40 rounded-lg flex items-center justify-center gap-2 text-xs font-mono font-bold transition-all shadow-md"
        >
          <Download className="w-4 h-4" />
          <span>Export Modified .STL</span>
        </button>

        {isModified && (
          <button
            type="button"
            onClick={onResetGeometry}
            className="w-full py-1.5 px-3 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded-lg flex items-center justify-center gap-1.5 text-[11px] font-mono transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Revert All Modifications</span>
          </button>
        )}
      </div>
    </div>
  );
};
