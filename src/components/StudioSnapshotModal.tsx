import React, { useState } from 'react';
import { 
  Camera, 
  Sun, 
  Zap, 
  Disc, 
  Download, 
  Check, 
  X, 
  Sparkles, 
  Image as ImageIcon,
  RotateCw
} from 'lucide-react';
import { StudioLightingPreset, StudioSnapshotConfig } from '../types';

interface StudioSnapshotModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPreset: StudioLightingPreset;
  onSelectPreset: (preset: StudioLightingPreset) => void;
  turntableActive: boolean;
  onToggleTurntable: () => void;
  onCaptureSnapshot: (config: StudioSnapshotConfig) => Promise<string | null>;
  onSetAsMarketplaceCover?: (dataUrl: string) => void;
}

export const StudioSnapshotModal: React.FC<StudioSnapshotModalProps> = ({
  isOpen,
  onClose,
  currentPreset,
  onSelectPreset,
  turntableActive,
  onToggleTurntable,
  onCaptureSnapshot,
  onSetAsMarketplaceCover,
}) => {
  const [resolution, setResolution] = useState<{ width: number; height: number }>({
    width: 1200,
    height: 800,
  });
  const [transparentBg, setTransparentBg] = useState<boolean>(false);
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const presets: Array<{
    key: StudioLightingPreset;
    label: string;
    description: string;
    icon: React.ComponentType<any>;
    colorClass: string;
  }> = [
    {
      key: 'cyber_studio',
      label: 'Cyber Studio',
      description: 'Deep charcoal background, neon cyan & emerald rim lights',
      icon: Zap,
      colorClass: 'text-cyan-400 border-cyan-500/50 bg-cyan-950/20',
    },
    {
      key: 'neutral_sunlight',
      label: 'Neutral Sunlight',
      description: 'Clean 5500K bright daylight studio with soft floor bounce',
      icon: Sun,
      colorClass: 'text-amber-400 border-amber-500/50 bg-amber-950/20',
    },
    {
      key: 'showcase_turntable',
      label: 'Showcase Turntable',
      description: '3-point showroom key lights with hot specular gloss highlights',
      icon: Disc,
      colorClass: 'text-emerald-400 border-emerald-500/50 bg-emerald-950/20',
    },
  ];

  const handleCapture = async () => {
    setIsCapturing(true);
    try {
      const dataUrl = await onCaptureSnapshot({
        width: resolution.width,
        height: resolution.height,
        preset: currentPreset,
        transparentBg,
        turntableSpin: turntableActive,
      });

      if (dataUrl) {
        setCapturedPreview(dataUrl);
      }
    } catch (err) {
      console.error('Failed to capture snapshot:', err);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleDownload = () => {
    if (!capturedPreview) return;
    const a = document.createElement('a');
    a.href = capturedPreview;
    a.download = `printforge_studio_${currentPreset}_${resolution.width}x${resolution.height}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setSavedSuccess('Snapshot downloaded successfully!');
    setTimeout(() => setSavedSuccess(null), 2500);
  };

  const handleApplyAsCover = () => {
    if (!capturedPreview) return;
    if (onSetAsMarketplaceCover) {
      onSetAsMarketplaceCover(capturedPreview);
    }
    setSavedSuccess('Attached as Marketplace Cover Photo!');
    setTimeout(() => {
      setSavedSuccess(null);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-6 font-mono text-xs space-y-4">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Studio Snapshot & Cover Generator</h3>
              <p className="text-[11px] text-slate-400">High-Res Render Engine & Marketplace Thumbnails</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Studio Presets Grid */}
        <div className="space-y-1.5">
          <label className="text-slate-300 font-semibold flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Studio Lighting Preset:</span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {presets.map((p) => {
              const isSelected = currentPreset === p.key;
              const Icon = p.icon;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => onSelectPreset(p.key)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    isSelected
                      ? `${p.colorClass} ring-1 ring-cyan-400 shadow-md`
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-slate-200">
                    <Icon className="w-4 h-4" />
                    <span className="truncate">{p.label}</span>
                  </div>
                  <div className="text-[9px] text-slate-400 mt-1 line-clamp-2">
                    {p.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Controls: Turntable Spin + Resolution + Transparent Background */}
        <div className="grid grid-cols-2 gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
          {/* 360° Turntable */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-slate-300">
              <RotateCw className={`w-3.5 h-3.5 ${turntableActive ? 'text-cyan-400 animate-spin' : 'text-slate-500'}`} />
              <span>360° Auto-Turntable</span>
            </div>
            <button
              type="button"
              onClick={onToggleTurntable}
              className={`px-2.5 py-1 rounded-md text-[10px] font-bold border transition-colors ${
                turntableActive
                  ? 'bg-cyan-950 border-cyan-400 text-cyan-200'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {turntableActive ? 'Active' : 'Off'}
            </button>
          </div>

          {/* Transparent BG Toggle */}
          <div className="flex items-center justify-between">
            <span className="text-slate-300">Transparent Background</span>
            <input
              type="checkbox"
              checked={transparentBg}
              onChange={(e) => setTransparentBg(e.target.checked)}
              className="rounded accent-cyan-500 cursor-pointer"
            />
          </div>
        </div>

        {/* Resolution Options */}
        <div className="flex items-center justify-between text-[11px] text-slate-300 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
          <span>Snapshot Dimensions:</span>
          <div className="flex items-center gap-1.5">
            {[
              { w: 1200, h: 800, label: '1200x800 (Marketplace)' },
              { w: 1920, h: 1080, label: '1080p FHD' },
              { w: 800, h: 800, label: '1:1 Square' },
            ].map((res) => (
              <button
                key={res.label}
                type="button"
                onClick={() => setResolution({ width: res.w, height: res.h })}
                className={`px-2.5 py-1 rounded text-[10px] border transition-colors ${
                  resolution.width === res.w && resolution.height === res.h
                    ? 'bg-cyan-950 border-cyan-400 text-cyan-200'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {res.label}
              </button>
            ))}
          </div>
        </div>

        {/* Preview / Trigger Area */}
        <div className="space-y-2">
          {capturedPreview ? (
            <div className="space-y-2">
              <div className="relative aspect-[3/2] w-full max-h-52 rounded-xl overflow-hidden border border-slate-700 bg-slate-950 flex items-center justify-center">
                <img
                  src={capturedPreview}
                  alt="Studio Render Preview"
                  className="w-full h-full object-contain"
                />
                <div className="absolute top-2 right-2 px-2 py-0.5 bg-slate-900/80 backdrop-blur-md rounded text-[9px] text-cyan-300 border border-slate-700">
                  {resolution.width} x {resolution.height} PNG
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCapture}
                  disabled={isCapturing}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <Camera className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Re-Take</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex-1 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-md shadow-cyan-500/20"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Snapshot PNG</span>
                </button>
                {onSetAsMarketplaceCover && (
                  <button
                    type="button"
                    onClick={handleApplyAsCover}
                    className="flex-1 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg flex items-center justify-center gap-1.5 transition-all shadow-md shadow-emerald-500/20"
                  >
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>Set as Marketplace Cover</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleCapture}
              disabled={isCapturing}
              className="w-full py-3 bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-cyan-500/20 cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>
                {isCapturing ? 'Rendering Studio Buffer...' : 'Capture Marketplace Snapshot (1200x800)'}
              </span>
            </button>
          )}
        </div>

        {/* Success Notice */}
        {savedSuccess && (
          <div className="p-2.5 bg-emerald-950/80 border border-emerald-600/60 rounded-xl text-emerald-300 flex items-center gap-2 text-[11px]">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{savedSuccess}</span>
          </div>
        )}
      </div>
    </div>
  );
};
