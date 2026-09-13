import React from 'react';
import { 
  Box, 
  Sparkles, 
  Upload, 
  Wallet, 
  Radio, 
  Settings as SettingsIcon, 
  Store, 
  Layers, 
  Plus
} from 'lucide-react';
import { TabType, AppSettings } from '../types';

interface NavbarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  walletBalance: number;
  openWalletModal: () => void;
  openUploadModal: () => void;
  openSettingsModal: () => void;
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  walletBalance,
  openWalletModal,
  openUploadModal,
  openSettingsModal,
  settings,
  setSettings,
}) => {
  const toggleLocalEngineStatus = () => {
    setSettings((prev) => ({
      ...prev,
      isLocalRelayOnline: !prev.isLocalRelayOnline,
    }));
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-[#0b0f17]/90 backdrop-blur-md border-b border-slate-800 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        
        {/* Left: Branding & Tagline */}
        <div className="flex items-center gap-6">
          <div 
            onClick={() => setActiveTab('marketplace')}
            className="flex items-center gap-2.5 cursor-pointer group"
            id="brand-logo"
          >
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-500 p-0.5 shadow-lg shadow-emerald-500/20 group-hover:shadow-cyan-500/40 transition-all">
              <div className="w-full h-full bg-slate-950 rounded-[7px] flex items-center justify-center">
                <Box className="w-5 h-5 text-emerald-400 group-hover:rotate-12 transition-transform duration-300" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-display text-lg font-bold tracking-wider text-white">
                  PRINT<span className="text-emerald-400">FORGE</span>
                </span>
                <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                  v2.4
                </span>
              </div>
              <p className="text-[10px] font-mono text-slate-400 -mt-0.5 hidden sm:block">
                3D Marketplace & Local AI Engine
              </p>
            </div>
          </div>

          {/* Navigation Tab Pills (Desktop) */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-900/90 p-1 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('marketplace')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === 'marketplace'
                  ? 'bg-emerald-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
              id="nav-tab-marketplace"
            >
              <Store className="w-3.5 h-3.5" />
              <span>Marketplace</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('studio')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === 'studio'
                  ? 'bg-cyan-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
              id="nav-tab-studio"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Studio</span>
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse ml-0.5" />
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('creator')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === 'creator'
                  ? 'bg-slate-200 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
              id="nav-tab-creator"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Inventory & Sales</span>
            </button>
          </nav>
        </div>

        {/* Right Side: Local Bridge, Wallet, Quick Actions, Settings */}
        <div className="flex items-center gap-2.5 sm:gap-3">
          
          {/* Local Engine Bridge Status Badge / Toggle */}
          <div 
            onClick={toggleLocalEngineStatus}
            className={`cursor-pointer px-2.5 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-2 transition-all select-none shadow-sm ${
              settings.isLocalRelayOnline
                ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300 hover:border-emerald-400'
                : 'bg-slate-900/80 border-slate-700/80 text-slate-400 hover:border-slate-600'
            }`}
            title="Click to toggle Local Engine Bridge status (Online / Offline simulator)"
            id="bridge-status-toggle"
          >
            <div className="relative flex items-center justify-center">
              <Radio className={`w-3.5 h-3.5 ${settings.isLocalRelayOnline ? 'text-emerald-400' : 'text-slate-500'}`} />
              {settings.isLocalRelayOnline && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-ping opacity-75" />
              )}
            </div>
            <div className="hidden lg:flex flex-col text-left leading-tight">
              <span className="text-[10px] uppercase font-semibold">
                {settings.isLocalRelayOnline ? 'Bridge: Online' : 'Bridge: Standby'}
              </span>
              <span className="text-[9px] text-slate-500 truncate max-w-[90px]">
                {settings.isLocalRelayOnline ? '127.0.0.1:8000' : 'Simulated fallback'}
              </span>
            </div>
            <div className="lg:hidden text-[11px] font-semibold">
              {settings.isLocalRelayOnline ? 'Online' : 'Offline'}
            </div>
          </div>

          {/* User Wallet Balance Pill */}
          <button
            type="button"
            onClick={openWalletModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700/90 hover:border-emerald-500/60 text-slate-100 transition-all group shadow-sm"
            id="wallet-balance-pill"
            title="View Wallet & Add Funds"
          >
            <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
              <Wallet className="w-3 h-3" />
            </div>
            <div className="flex items-center gap-1 font-mono text-xs">
              <span className="font-semibold text-emerald-400">
                ${walletBalance.toFixed(2)}
              </span>
              <Plus className="w-3 h-3 text-slate-400 group-hover:text-emerald-400 transition-colors" />
            </div>
          </button>

          {/* Quick Action: Upload Model */}
          <button
            type="button"
            onClick={openUploadModal}
            className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-100 border border-slate-700 transition-all shadow-sm"
            id="btn-quick-upload"
          >
            <Upload className="w-3.5 h-3.5 text-cyan-400" />
            <span>Upload</span>
          </button>

          {/* Quick Action: Studio (Mobile only if tab bar is hidden) */}
          <button
            type="button"
            onClick={() => setActiveTab('studio')}
            className="sm:hidden p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400"
            title="Open Studio"
          >
            <Sparkles className="w-4 h-4" />
          </button>

          {/* Settings Modal Button */}
          <button
            type="button"
            onClick={openSettingsModal}
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors"
            title="Bridge & Platform Settings"
            id="btn-settings-modal"
          >
            <SettingsIcon className="w-4 h-4" />
          </button>
        </div>

      </div>

      {/* Mobile Tab Strip */}
      <div className="md:hidden flex items-center border-t border-slate-800/80 px-2 py-1.5 bg-[#0b0f17]">
        <button
          type="button"
          onClick={() => setActiveTab('marketplace')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-medium ${
            activeTab === 'marketplace'
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Store className="w-3.5 h-3.5" />
          <span>Market</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('studio')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-medium ${
            activeTab === 'studio'
              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>AI Studio</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('creator')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded text-xs font-medium ${
            activeTab === 'creator'
              ? 'bg-slate-700/50 text-slate-200 border border-slate-600'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Inventory</span>
        </button>
      </div>
    </header>
  );
};
