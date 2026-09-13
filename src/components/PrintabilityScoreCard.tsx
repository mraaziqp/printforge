import React from 'react';
import { 
  ShieldCheck, 
  AlertTriangle, 
  Rotate3d, 
  Sparkles, 
  CheckCircle2, 
  Layers, 
  Activity, 
  Info,
  X,
  Compass
} from 'lucide-react';
import { PrintabilityAuditResult } from '../types';

interface PrintabilityScoreCardProps {
  audit: PrintabilityAuditResult | null;
  isActive: boolean;
  onClose: () => void;
  onAutoOrient: (orientation: { rotX: number; rotY: number; rotZ: number }) => void;
}

export const PrintabilityScoreCard: React.FC<PrintabilityScoreCardProps> = ({
  audit,
  isActive,
  onClose,
  onAutoOrient,
}) => {
  if (!isActive || !audit) return null;

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-emerald-400 border-emerald-500/50 bg-emerald-500/10';
    if (score >= 65) return 'text-amber-400 border-amber-500/50 bg-amber-500/10';
    return 'text-rose-400 border-rose-500/50 bg-rose-500/10';
  };

  const getScoreGrade = (score: number) => {
    if (score >= 90) return 'A+ Ready to Print';
    if (score >= 80) return 'A Slicer Approved';
    if (score >= 65) return 'B Supports Needed';
    if (score >= 50) return 'C Heavy Supports';
    return 'D Slicing Warning';
  };

  return (
    <div className="absolute top-16 left-3 z-30 w-80 sm:w-88 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl p-3.5 shadow-2xl space-y-3 pointer-events-auto text-slate-200 text-xs font-mono">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-1 bg-gradient-to-tr from-emerald-500 to-cyan-500 rounded-md text-slate-950 font-bold">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-bold text-white text-[13px] leading-tight">Printability Health Audit</h4>
            <span className="text-[10px] text-slate-400">Overhang & Manifold Inspector</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
          title="Dismiss Inspector Card"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Main Score Block */}
      <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
        <div className={`w-14 h-14 rounded-full border-2 flex flex-col items-center justify-center shrink-0 ${getScoreColor(audit.score)}`}>
          <span className="text-xl font-bold font-mono leading-none">{audit.score}</span>
          <span className="text-[8px] uppercase tracking-wider text-slate-400 mt-0.5">/ 100</span>
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-xs font-bold text-white block">{getScoreGrade(audit.score)}</span>
          <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
            <span>{audit.totalTriangles.toLocaleString()} facets analyzed</span>
          </div>
        </div>
      </div>

      {/* Overhang Distribution Bars */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-[11px]">
          <span className="text-slate-300 font-bold">Overhang Angle Distribution</span>
        </div>

        {/* 3-Color Segmented Progress Bar */}
        <div className="h-2 w-full rounded-full bg-slate-800 flex overflow-hidden">
          <div 
            style={{ width: `${audit.safePct}%` }} 
            className="bg-emerald-400 h-full transition-all"
            title={`Safe: ${audit.safePct}%`}
          />
          <div 
            style={{ width: `${audit.cautionPct}%` }} 
            className="bg-amber-400 h-full transition-all"
            title={`Caution: ${audit.cautionPct}%`}
          />
          <div 
            style={{ width: `${audit.overhangPct}%` }} 
            className="bg-rose-500 h-full transition-all"
            title={`Critical Overhang: ${audit.overhangPct}%`}
          />
        </div>

        {/* Legend */}
        <div className="grid grid-cols-3 gap-1 text-[10px] pt-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
            <span className="text-slate-300">0°–45° Safe:</span>
            <span className="font-bold text-emerald-400 ml-auto">{audit.safePct}%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
            <span className="text-slate-300">45°–60°:</span>
            <span className="font-bold text-amber-400 ml-auto">{audit.cautionPct}%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
            <span className="text-slate-300">&gt;60° Need:</span>
            <span className="font-bold text-rose-400 ml-auto">{audit.overhangPct}%</span>
          </div>
        </div>
      </div>

      {/* Key Diagnostic Metrics */}
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        {/* Support Filament Waste */}
        <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
          <span className="text-slate-400 text-[10px] block">Support Waste Est.</span>
          <span className="text-rose-400 font-bold text-sm block">
            ~{audit.estimatedSupportFilamentPct}% 
            <span className="text-[10px] font-normal text-slate-400 ml-1">
              ({audit.estimatedSupportWasteGrams}g)
            </span>
          </span>
        </div>

        {/* Watertight / Manifold Check */}
        <div className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
          <span className="text-slate-400 text-[10px] block">Watertight Check</span>
          {audit.isWatertight ? (
            <div className="flex items-center gap-1 text-emerald-400 font-bold text-[11px] mt-0.5">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>Closed Manifold</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-amber-400 font-bold text-[11px] mt-0.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{audit.openEdgeCount} Open Edges</span>
            </div>
          )}
        </div>
      </div>

      {/* Auto-Orientation Recommendation */}
      <div className="p-2.5 rounded-xl bg-gradient-to-br from-slate-950 to-slate-900 border border-cyan-500/40 space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-cyan-300 font-bold flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Optimal Bed Orientation</span>
          </span>
          {audit.recommendedOrientation.supportReductionPct > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-bold border border-emerald-500/30">
              -{audit.recommendedOrientation.supportReductionPct}% Waste
            </span>
          )}
        </div>

        <p className="text-[10px] text-slate-400 leading-snug">
          {audit.recommendedOrientation.description}
        </p>

        <button
          type="button"
          onClick={() => onAutoOrient(audit.recommendedOrientation)}
          className="w-full mt-1 py-1.5 px-2.5 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/60 text-cyan-200 hover:text-cyan-100 font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all text-xs shadow-sm"
          id="btn-auto-orient-supports"
        >
          <Rotate3d className="w-3.5 h-3.5 text-cyan-400" />
          <span>Auto-Orient for Least Supports</span>
        </button>
      </div>
    </div>
  );
};
