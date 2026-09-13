import React, { useState } from 'react';
import { 
  Boxes, 
  Sparkles, 
  Plus, 
  Trash2, 
  Copy, 
  RotateCw, 
  Move, 
  AlertTriangle, 
  Scale, 
  Clock, 
  Layers, 
  X, 
  ChevronDown, 
  Check, 
  Grid
} from 'lucide-react';
import { PlacedModel, PlateNestingConfig } from '../types';
import { calculateBatchPlateMetrics } from '../utils/platePacker';

interface BuildPlateManagerProps {
  isOpen: boolean;
  onClose: () => void;
  placedModels: PlacedModel[];
  selectedModelId: string | null;
  onSelectModel: (id: string) => void;
  onAutoNest: (config: PlateNestingConfig) => void;
  onAddModel: (presetKey: string) => void;
  onDuplicateModel: (id: string) => void;
  onRemoveModel: (id: string) => void;
  onUpdateModelTransform: (
    id: string,
    pos: { x: number; y: number; z: number },
    rot: { x: number; y: number; z: number }
  ) => void;
  collidingIds: string[];
  bedUtilizationPct: number;
}

export const BuildPlateManager: React.FC<BuildPlateManagerProps> = ({
  isOpen,
  onClose,
  placedModels,
  selectedModelId,
  onSelectModel,
  onAutoNest,
  onAddModel,
  onDuplicateModel,
  onRemoveModel,
  onUpdateModelTransform,
  collidingIds,
  bedUtilizationPct,
}) => {
  const [clearanceMargin, setClearanceMargin] = useState<number>(10);
  const [allowRotation, setAllowRotation] = useState<boolean>(true);
  const [showAddMenu, setShowAddMenu] = useState<boolean>(false);

  if (!isOpen) return null;

  const selectedModel = placedModels.find((m) => m.id === selectedModelId) || placedModels[0];
  const batchMetrics = calculateBatchPlateMetrics(placedModels);

  const presets = [
    { key: 'bracket', label: 'Functional Bracket', desc: '40x25x20mm / 14g' },
    { key: 'mini', label: 'Tabletop Mini', desc: '32x32x45mm / 18g' },
    { key: 'dragon', label: 'Cyber Dragon', desc: '75x50x40mm / 42g' },
    { key: 'gear', label: 'Planetary Gear', desc: '50x50x15mm / 22g' },
  ];

  return (
    <div className="absolute top-3 left-3 z-30 w-80 max-h-[90%] overflow-y-auto bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl shadow-2xl p-4 text-xs font-mono space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
            <Boxes className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-bold text-white text-sm">Build Plate Manager</h4>
            <span className="text-[10px] text-slate-400">220x220mm Auto-Packing</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Batch Stats Banner */}
      <div className="bg-slate-950/80 rounded-xl p-3 border border-slate-800 grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-[10px] text-slate-400 flex items-center justify-center gap-1">
            <Layers className="w-3 h-3 text-cyan-400" />
            <span>Parts</span>
          </div>
          <div className="text-sm font-bold text-white mt-0.5">{placedModels.length}</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400 flex items-center justify-center gap-1">
            <Scale className="w-3 h-3 text-emerald-400" />
            <span>Mass</span>
          </div>
          <div className="text-sm font-bold text-emerald-400 mt-0.5">
            {batchMetrics.totalMassGrams}g
          </div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400 flex items-center justify-center gap-1">
            <Clock className="w-3 h-3 text-amber-400" />
            <span>Time</span>
          </div>
          <div className="text-sm font-bold text-amber-300 mt-0.5">
            {batchMetrics.formattedTime}
          </div>
        </div>
      </div>

      {/* Collision Alert if applicable */}
      {collidingIds.length > 0 && (
        <div className="p-2.5 bg-rose-950/70 border border-rose-600/50 rounded-lg text-[11px] text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>
            {collidingIds.length} part(s) overlapping or out of bed boundary. Click Auto-Nest to fix!
          </span>
        </div>
      )}

      {/* Auto-Nest Actions */}
      <div className="space-y-2 bg-slate-950/50 p-2.5 rounded-xl border border-slate-800">
        <div className="flex items-center justify-between text-[11px] text-slate-300">
          <span className="flex items-center gap-1">
            <Grid className="w-3.5 h-3.5 text-cyan-400" />
            <span>Clearance Margin:</span>
          </span>
          <div className="flex items-center gap-1">
            {[5, 10, 15].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setClearanceMargin(m)}
                className={`px-2 py-0.5 rounded text-[10px] border transition-colors ${
                  clearanceMargin === m
                    ? 'bg-cyan-950 border-cyan-400 text-cyan-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {m}mm
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() =>
            onAutoNest({
              clearanceMarginMm: clearanceMargin,
              bedWidthMm: 220,
              bedDepthMm: 220,
              allowRotation,
            })
          }
          className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-500/20"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Auto-Nest Plate (2D Bin Pack)</span>
        </button>

        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
          <span>Bed Footprint: {bedUtilizationPct}%</span>
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={allowRotation}
              onChange={(e) => setAllowRotation(e.target.checked)}
              className="rounded accent-emerald-500"
            />
            <span>Allow 90° Rotations</span>
          </label>
        </div>
      </div>

      {/* Model List */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-300">
          <span>Placed Models ({placedModels.length})</span>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowAddMenu(!showAddMenu)}
              className="px-2 py-1 bg-cyan-950/80 hover:bg-cyan-900/80 border border-cyan-500/50 text-cyan-300 rounded flex items-center gap-1 transition-colors text-[10px]"
            >
              <Plus className="w-3 h-3" />
              <span>Add Part</span>
              <ChevronDown className="w-3 h-3 ml-0.5" />
            </button>

            {showAddMenu && (
              <div className="absolute right-0 mt-1 w-48 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 overflow-hidden py-1">
                {presets.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => {
                      onAddModel(p.key);
                      setShowAddMenu(false);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-slate-800 transition-colors"
                  >
                    <div className="text-white font-medium">{p.label}</div>
                    <div className="text-[9px] text-slate-400">{p.desc}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
          {placedModels.map((m) => {
            const isSelected = m.id === selectedModelId;
            const isColliding = collidingIds.includes(m.id);

            return (
              <div
                key={m.id}
                onClick={() => onSelectModel(m.id)}
                className={`p-2 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${
                  isSelected
                    ? 'bg-cyan-950/60 border-cyan-400 text-white shadow-sm'
                    : isColliding
                    ? 'bg-rose-950/40 border-rose-500/50 text-slate-300'
                    : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 text-slate-400'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <div
                    className="w-3 h-3 rounded-full shrink-0 border border-slate-700"
                    style={{ backgroundColor: m.color || '#22d3ee' }}
                  />
                  <div className="truncate">
                    <div className="truncate font-semibold text-slate-200">{m.name}</div>
                    <div className="text-[10px] text-slate-500">
                      {m.dimensionsMm.x}x{m.dimensionsMm.y}x{m.dimensionsMm.z}mm • {m.weightGrams}g
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <button
                    type="button"
                    title="Duplicate on plate"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDuplicateModel(m.id);
                    }}
                    className="p-1 hover:text-cyan-300 hover:bg-slate-800 rounded transition-colors"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  {placedModels.length > 1 && (
                    <button
                      type="button"
                      title="Remove from plate"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveModel(m.id);
                      }}
                      className="p-1 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Model Nudge & Transform Controls */}
      {selectedModel && (
        <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 space-y-2">
          <div className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Move className="w-3.5 h-3.5 text-cyan-400" />
              <span>Nudge Position (X / Z)</span>
            </span>
            <span className="text-cyan-400 text-[10px]">
              X: {selectedModel.position.x}mm | Z: {selectedModel.position.z}mm
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1">
            <button
              type="button"
              onClick={() =>
                onUpdateModelTransform(
                  selectedModel.id,
                  {
                    x: Math.max(-100, selectedModel.position.x - 5),
                    y: selectedModel.position.y,
                    z: selectedModel.position.z,
                  },
                  selectedModel.rotation
                )
              }
              className="py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-center text-slate-300"
            >
              -X (5mm)
            </button>
            <button
              type="button"
              onClick={() =>
                onUpdateModelTransform(
                  selectedModel.id,
                  {
                    x: Math.min(100, selectedModel.position.x + 5),
                    y: selectedModel.position.y,
                    z: selectedModel.position.z,
                  },
                  selectedModel.rotation
                )
              }
              className="py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-center text-slate-300"
            >
              +X (5mm)
            </button>
            <button
              type="button"
              onClick={() =>
                onUpdateModelTransform(
                  selectedModel.id,
                  {
                    x: selectedModel.position.x,
                    y: selectedModel.position.y,
                    z: Math.max(-100, selectedModel.position.z - 5),
                  },
                  selectedModel.rotation
                )
              }
              className="py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-center text-slate-300"
            >
              -Z (5mm)
            </button>
            <button
              type="button"
              onClick={() =>
                onUpdateModelTransform(
                  selectedModel.id,
                  {
                    x: selectedModel.position.x,
                    y: selectedModel.position.y,
                    z: Math.min(100, selectedModel.position.z + 5),
                  },
                  selectedModel.rotation
                )
              }
              className="py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded text-center text-slate-300"
            >
              +Z (5mm)
            </button>
          </div>

          <div className="pt-1 flex items-center justify-between">
            <span className="text-[10px] text-slate-400">Rotate Yaw:</span>
            <button
              type="button"
              onClick={() =>
                onUpdateModelTransform(selectedModel.id, selectedModel.position, {
                  ...selectedModel.rotation,
                  y: selectedModel.rotation.y + Math.PI / 2,
                })
              }
              className="px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded flex items-center gap-1 text-[10px]"
            >
              <RotateCw className="w-3 h-3 text-cyan-400" />
              <span>Rotate 90° (Yaw)</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
