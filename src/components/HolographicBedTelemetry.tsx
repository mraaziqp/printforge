import React from 'react';
import { Cpu, Zap, Flame, Clock, Radio } from 'lucide-react';
import { BridgeWebSocketMessage } from '../types';

interface HolographicBedTelemetryProps {
  isGenerating: boolean;
  telemetry: BridgeWebSocketMessage | null;
  progressPercent: number;
  stageText: string;
}

export const HolographicBedTelemetry: React.FC<HolographicBedTelemetryProps> = ({
  isGenerating,
  telemetry,
  progressPercent,
  stageText,
}) => {
  if (!isGenerating) return null;

  const currentStep = telemetry?.step || Math.max(1, Math.round((progressPercent / 100) * 25));
  const totalSteps = telemetry?.totalSteps || 25;
  const samplerName = telemetry?.samplerName || 'ComfyUI';
  // Show only readings the bridge actually reported; missing values render as "--"
  const vramMb = telemetry?.vramUsedMb;
  const gpuTemp = telemetry?.gpuTempC;
  const itRate = telemetry?.iterationRate;
  const etaSec = telemetry?.etaSeconds;

  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progressPercent / 100) * circumference;

  return (
    <div className="absolute inset-0 z-25 pointer-events-none flex flex-col items-center justify-center">
      {/* Holographic Projection Base Ripple */}
      <div className="relative flex flex-col items-center">
        {/* Glow Ring backdrop */}
        <div className="absolute -inset-10 rounded-full bg-cyan-500/10 blur-2xl animate-pulse" />

        {/* Animated SVG Circular Progress Ring */}
        <div className="relative w-44 h-44 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 140 140">
            {/* Background Track */}
            <circle
              cx="70"
              cy="70"
              r={radius}
              className="text-slate-800/80 stroke-current"
              strokeWidth="6"
              fill="transparent"
            />
            {/* Outer Rotating Dash Marker Ring */}
            <circle
              cx="70"
              cy="70"
              r={radius + 8}
              className="text-cyan-500/30 stroke-current animate-spin"
              strokeWidth="1.5"
              strokeDasharray="4 8"
              fill="transparent"
              style={{ animationDuration: '12s' }}
            />
            {/* Progress Stroke */}
            <circle
              cx="70"
              cy="70"
              r={radius}
              className="text-cyan-400 stroke-current transition-all duration-300 ease-out"
              strokeWidth="6"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
              style={{ filter: 'drop-shadow(0 0 6px rgba(34, 211, 238, 0.7))' }}
            />
          </svg>

          {/* Center Content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center font-mono">
            <span className="text-[10px] text-cyan-300 font-bold uppercase tracking-wider flex items-center gap-1">
              <Radio className="w-2.5 h-2.5 text-cyan-400 animate-ping" />
              {telemetry?.connectionType === 'websocket' ? 'WS STREAM' : 'BRIDGE'}
            </span>
            <span className="text-3xl font-black text-white tracking-tight drop-shadow-[0_0_12px_rgba(34,211,238,0.8)]">
              {Math.round(progressPercent)}%
            </span>
            <span className="text-[10px] text-slate-300 font-bold mt-0.5">
              Step {currentStep}/{totalSteps}
            </span>
            <span className="text-[9px] text-cyan-400/90 font-mono">
              {samplerName}
            </span>
          </div>
        </div>

        {/* Live Hardware Telemetry Banner Below Ring */}
        <div className="mt-2 bg-slate-950/90 backdrop-blur-md border border-cyan-500/50 rounded-xl px-3 py-1.5 shadow-2xl flex items-center gap-3 text-xs font-mono text-slate-300 pointer-events-auto">
          {/* ETA */}
          <div className="flex items-center gap-1 text-cyan-300">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span>ETA {etaSec == null ? '--' : `${etaSec < 10 ? `0${etaSec}` : etaSec}s`}</span>
          </div>

          <span className="text-slate-700">|</span>

          {/* Speed */}
          <div className="flex items-center gap-1 text-emerald-300">
            <Zap className="w-3.5 h-3.5 text-emerald-400" />
            <span>{itRate == null ? '--' : itRate.toFixed(1)} it/s</span>
          </div>

          <span className="text-slate-700 hidden sm:inline">|</span>

          {/* VRAM */}
          <div className="hidden sm:flex items-center gap-1 text-slate-300">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span>{vramMb == null ? '--' : (vramMb / 1024).toFixed(1)} GB</span>
          </div>

          <span className="text-slate-700 hidden sm:inline">|</span>

          {/* GPU Temp */}
          <div className="hidden sm:flex items-center gap-1 text-amber-300">
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span>{gpuTemp == null ? '--' : gpuTemp}°C</span>
          </div>
        </div>

        {/* Stage Status Subtitle */}
        <div className="mt-1.5 px-3 py-0.5 rounded-full bg-cyan-950/70 border border-cyan-800 text-[10px] font-mono text-cyan-200">
          {stageText}
        </div>
      </div>
    </div>
  );
};
