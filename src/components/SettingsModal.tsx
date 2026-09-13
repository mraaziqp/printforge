import React, { useState, useEffect } from 'react';
import { 
  X, 
  Settings as SettingsIcon, 
  Radio, 
  Percent, 
  RefreshCw, 
  CheckCircle2, 
  Cpu, 
  Sliders,
  RotateCcw,
  HardDrive,
  Trash2,
  Database
} from 'lucide-react';
import { AppSettings, StorageStats } from '../types';
import { getStorageStats, clearIndexedDatabase } from '../utils/meshDatabase';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
  onResetMockData: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  setSettings,
  onResetMockData,
}) => {
  const [savedNotice, setSavedNotice] = useState(false);
  const [storageStats, setStorageStats] = useState<StorageStats>({
    totalBytes: 0,
    formattedSize: '0 B',
    meshCount: 0,
    profileCount: 0,
    snapshotCount: 0,
  });
  const [isPurging, setIsPurging] = useState(false);
  const [purgeNotice, setPurgeNotice] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadStorageStats();
    }
  }, [isOpen]);

  const loadStorageStats = async () => {
    const stats = await getStorageStats();
    setStorageStats(stats);
  };

  const handlePurgeStorage = async () => {
    setIsPurging(true);
    await clearIndexedDatabase();
    await loadStorageStats();
    setIsPurging(false);
    setPurgeNotice('Cached assets purged from IndexedDB!');
    setTimeout(() => setPurgeNotice(null), 2500);
  };

  if (!isOpen) return null;

  const handleSave = () => {
    setSavedNotice(true);
    setTimeout(() => {
      setSavedNotice(false);
      onClose();
    }, 900);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div 
        className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-6 space-y-5"
        id="settings-modal"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400">
              <SettingsIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Engine & Platform Settings</h3>
              <p className="text-[11px] font-mono text-slate-400">Hardware Bridge & Monetization Engine</p>
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

        <div className="space-y-4">
          
          {/* Local Relay URL */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono text-slate-300 flex items-center gap-1.5 font-semibold">
              <Cpu className="w-3.5 h-3.5 text-cyan-400" />
              <span>Local Hardware Relay URL</span>
            </label>
            <input
              type="text"
              value={settings.localRelayUrl}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, localRelayUrl: e.target.value }))
              }
              placeholder="http://localhost:8000/generate"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-500"
            />
            <p className="text-[11px] text-slate-400 font-mono">
              Accepts local Python server, ComfyUI API endpoint, or secure tunneling URL (ngrok / Cloudflare).
            </p>
          </div>

          {/* Bridge Mode Toggle */}
          <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-xs font-mono text-slate-200 font-semibold flex items-center gap-1.5">
                <Radio className={`w-3.5 h-3.5 ${settings.isLocalRelayOnline ? 'text-emerald-400' : 'text-slate-500'}`} />
                <span>Simulated Fallback Mode</span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                {settings.isLocalRelayOnline
                  ? 'Real POST calls sent to endpoint first.'
                  : 'Embedded high-fidelity ComfyUI & slicer simulator active.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setSettings((prev) => ({
                  ...prev,
                  isLocalRelayOnline: !prev.isLocalRelayOnline,
                }))
              }
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all border ${
                settings.isLocalRelayOnline
                  ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300'
                  : 'bg-slate-800 border-slate-700 text-slate-300'
              }`}
            >
              {settings.isLocalRelayOnline ? 'Online (Real)' : 'Simulated (Safe)'}
            </button>
          </div>

          {/* Platform Commission Fee Percentage */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-mono">
              <span className="text-slate-300 flex items-center gap-1 font-semibold">
                <Percent className="w-3.5 h-3.5 text-emerald-400" />
                <span>Platform Commission Rate:</span>
              </span>
              <span className="text-emerald-400 font-bold">{settings.platformFeePercent}%</span>
            </div>
            <input
              type="range"
              min="5"
              max="25"
              step="1"
              value={settings.platformFeePercent}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  platformFeePercent: Number(e.target.value),
                }))
              }
              className="w-full accent-emerald-400 cursor-pointer h-2 bg-slate-950 rounded-lg appearance-none"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-400">
              <span>5% (Low fee)</span>
              <span>12% (Standard)</span>
              <span>25% (High fee)</span>
            </div>
          </div>

          {/* App Storage Manager (IndexedDB Persistence) */}
          <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-mono text-slate-200 font-semibold">
                <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
                <span>App Storage Manager (IndexedDB)</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/50 text-cyan-300 font-bold">
                {storageStats.formattedSize} Used
              </span>
            </div>

            <p className="text-[11px] text-slate-400 font-mono">
              High-poly STL meshes, slice profiles, and studio covers are cached locally in browser IndexedDB for instant offline loading.
            </p>

            <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-mono bg-slate-900/60 p-2 rounded-lg border border-slate-800">
              <div>
                <span className="text-slate-400">Meshes:</span>
                <div className="font-bold text-white mt-0.5">{storageStats.meshCount}</div>
              </div>
              <div>
                <span className="text-slate-400">Slice Profiles:</span>
                <div className="font-bold text-white mt-0.5">{storageStats.profileCount}</div>
              </div>
              <div>
                <span className="text-slate-400">Snapshots:</span>
                <div className="font-bold text-white mt-0.5">{storageStats.snapshotCount}</div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-slate-500 font-mono">
                Persistent offline PWA storage
              </span>
              <button
                type="button"
                onClick={handlePurgeStorage}
                disabled={isPurging || (storageStats.meshCount === 0 && storageStats.snapshotCount === 0)}
                className="px-2.5 py-1 bg-rose-950/50 hover:bg-rose-900/60 border border-rose-600/50 text-rose-300 rounded text-[10px] font-mono flex items-center gap-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-3 h-3" />
                <span>{isPurging ? 'Purging...' : 'Purge Cached Assets'}</span>
              </button>
            </div>

            {purgeNotice && (
              <div className="text-[10px] text-emerald-400 font-mono flex items-center gap-1 pt-1">
                <CheckCircle2 className="w-3 h-3" />
                <span>{purgeNotice}</span>
              </div>
            )}
          </div>

          {/* Reset Demo Data Button */}
          <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
            <button
              type="button"
              onClick={() => {
                onResetMockData();
                setSavedNotice(true);
                setTimeout(() => setSavedNotice(false), 1200);
              }}
              className="text-xs font-mono text-slate-400 hover:text-amber-400 flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Marketplace & Balance</span>
            </button>
          </div>

        </div>

        {/* Saved notice */}
        {savedNotice && (
          <div className="p-2 bg-emerald-950/90 border border-emerald-800 rounded-lg text-xs font-mono text-emerald-400 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>Settings saved successfully!</span>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-mono font-bold rounded-lg transition-all shadow-md shadow-cyan-500/20"
          >
            Apply Settings
          </button>
        </div>
      </div>
    </div>
  );
};
