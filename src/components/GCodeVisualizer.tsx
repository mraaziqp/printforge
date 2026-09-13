import React from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Layers, 
  Clock, 
  Gauge, 
  Eye, 
  Sparkles, 
  Sliders, 
  Check, 
  X 
} from 'lucide-react';
import { ToolpathLayer, ToolpathSimulationState } from '../types';

interface GCodeVisualizerProps {
  isOpen: boolean;
  onClose: () => void;
  layers: ToolpathLayer[];
  currentLayerIndex: number;
  onLayerChange: (layerIndex: number) => void;
  simulationState: ToolpathSimulationState;
  onTogglePlay: () => void;
  onSpeedChange: (speed: 1 | 2 | 5) => void;
  showAllPreviousLayers: boolean;
  onToggleShowPrevious: (val: boolean) => void;
}

export const GCodeVisualizer: React.FC<GCodeVisualizerProps> = ({
  isOpen,
  onClose,
  layers,
  currentLayerIndex,
  onLayerChange,
  simulationState,
  onTogglePlay,
  onSpeedChange,
  showAllPreviousLayers,
  onToggleShowPrevious,
}) => {
  if (!isOpen || layers.length === 0) return null;

  const currentLayer = layers[currentLayerIndex] || layers[0];
  const maxLayer = Math.max(0, layers.length - 1);

  return (
    <div className="absolute bottom-16 left-3 right-3 sm:left-auto sm:right-3 sm:w-96 z-20 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl shadow-2xl p-4 font-mono text-xs space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-orange-500/10 flex items-center justify-center text-orange-400">
            <Layers className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="font-bold text-white text-xs flex items-center gap-1.5">
              <span>G-Code Toolpath Slicer</span>
              <span className="text-[9px] px-1.5 py-0.2 bg-orange-950/80 border border-orange-500/50 text-orange-300 rounded">
                Orca / Bambu Style
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Layer Stats Banner */}
      <div className="grid grid-cols-3 gap-2 bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 text-center">
        <div>
          <div className="text-[10px] text-slate-400">Layer / Height</div>
          <div className="text-white font-bold mt-0.5">
            #{currentLayer.layerIndex + 1}
            <span className="text-[10px] text-slate-500 font-normal"> / {layers.length}</span>
          </div>
          <div className="text-[9px] text-cyan-400">Z = {currentLayer.zHeightMm}mm</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400">Layer Time</div>
          <div className="text-emerald-400 font-bold mt-0.5">
            {currentLayer.layerPrintTimeSec}s
          </div>
          <div className="text-[9px] text-slate-500">50 mm/s speed</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-400">Extrusion</div>
          <div className="text-cyan-300 font-bold mt-0.5">
            {currentLayer.filamentMm}mm
          </div>
          <div className="text-[9px] text-slate-500">0.4mm nozzle</div>
        </div>
      </div>

      {/* Layer Scrubber Slider */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-[10px] text-slate-400">
          <span>Layer Scrubber</span>
          <span className="text-cyan-400 font-bold">
            Layer {currentLayerIndex + 1} of {layers.length}
          </span>
        </div>
        <input
          type="range"
          min="0"
          max={maxLayer}
          value={currentLayerIndex}
          onChange={(e) => onLayerChange(Number(e.target.value))}
          className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-orange-500"
        />
        <div className="flex justify-between text-[9px] text-slate-500">
          <span>Bed (0.2mm)</span>
          <span>Top ({layers[layers.length - 1]?.zHeightMm || 0}mm)</span>
        </div>
      </div>

      {/* Simulation Play / Pause & Speed Controls */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <button
          type="button"
          onClick={onTogglePlay}
          className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 font-bold transition-all ${
            simulationState.isPlaying
              ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
              : 'bg-orange-500 hover:bg-orange-400 text-slate-950 shadow-md shadow-orange-500/20'
          }`}
        >
          {simulationState.isPlaying ? (
            <>
              <Pause className="w-3.5 h-3.5" />
              <span>Pause Sim</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5" />
              <span>Play Toolpath Sim</span>
            </>
          )}
        </button>

        {/* Speed Selector */}
        <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
          {([1, 2, 5] as const).map((spd) => (
            <button
              key={spd}
              type="button"
              onClick={() => onSpeedChange(spd)}
              className={`px-2 py-1 rounded text-[10px] font-bold transition-colors ${
                simulationState.playbackSpeed === spd
                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/60'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {spd}x
            </button>
          ))}
        </div>

        {/* Show Previous Toggle */}
        <button
          type="button"
          onClick={() => onToggleShowPrevious(!showAllPreviousLayers)}
          title="Toggle stacked layer history"
          className={`p-1.5 rounded-lg border transition-colors ${
            showAllPreviousLayers
              ? 'bg-slate-800 border-slate-600 text-slate-200'
              : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Orca/Bambu Style Toolpath Color Legend */}
      <div className="pt-2 border-t border-slate-800 grid grid-cols-3 gap-y-1.5 gap-x-2 text-[10px]">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-orange-500 shrink-0" />
          <span className="text-slate-300 truncate">Outer Wall</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-cyan-500 shrink-0" />
          <span className="text-slate-300 truncate">Inner Wall</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500 shrink-0" />
          <span className="text-slate-300 truncate">Infill</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-purple-400 shrink-0" />
          <span className="text-slate-300 truncate">Travel Move</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-white ring-1 ring-white/50 shrink-0" />
          <span className="text-slate-300 truncate">Z-Seam</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
          <span className="text-slate-300 truncate">Retract</span>
        </div>
      </div>
    </div>
  );
};
