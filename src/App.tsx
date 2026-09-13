/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { 
  TabType, 
  MarketplaceModel, 
  TransactionRecord, 
  PayoutRequest, 
  AppSettings,
  PreloadedUploadDraft
} from './types';
import { 
  INITIAL_MODELS, 
  INITIAL_TRANSACTIONS, 
  INITIAL_PAYOUTS, 
  DEFAULT_APP_SETTINGS 
} from './mockData';
import { Navbar } from './components/Navbar';
import { MarketplaceView } from './components/MarketplaceView';
import { AiStudioView } from './components/AiStudioView';
import { CreatorHubView } from './components/CreatorHubView';
import { ModelDetailModal } from './components/ModelDetailModal';
import { WalletModal } from './components/WalletModal';
import { SettingsModal } from './components/SettingsModal';
import { pingBridge } from './utils/bridgeClient';

const STORAGE_KEYS = {
  WALLET: 'printforge_wallet_balance',
  CREATOR_BALANCE: 'printforge_creator_balance',
  MODELS: 'printforge_marketplace_models',
  TRANSACTIONS: 'printforge_transactions',
  PAYOUTS: 'printforge_payouts',
  SETTINGS: 'printforge_settings',
  TAB: 'printforge_active_tab',
};

export default function App() {
  // 1. Navigation Tab State
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.TAB);
      return (saved as TabType) || 'marketplace';
    } catch {
      return 'marketplace';
    }
  });

  // 2. Balances State (Wallet for buyer, Creator balance for seller)
  const [walletBalance, setWalletBalance] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.WALLET);
      return saved ? parseFloat(saved) : 45.00;
    } catch {
      return 45.00;
    }
  });

  const [creatorBalance, setCreatorBalance] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CREATOR_BALANCE);
      return saved ? parseFloat(saved) : 64.80;
    } catch {
      return 64.80;
    }
  });

  // 3. Models State
  const [models, setModels] = useState<MarketplaceModel[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.MODELS);
      return saved ? JSON.parse(saved) : INITIAL_MODELS;
    } catch {
      return INITIAL_MODELS;
    }
  });

  // 4. Transactions Ledger State
  const [transactions, setTransactions] = useState<TransactionRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
      return saved ? JSON.parse(saved) : INITIAL_TRANSACTIONS;
    } catch {
      return INITIAL_TRANSACTIONS;
    }
  });

  // 5. Payout Requests State
  const [payouts, setPayouts] = useState<PayoutRequest[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.PAYOUTS);
      return saved ? JSON.parse(saved) : INITIAL_PAYOUTS;
    } catch {
      return INITIAL_PAYOUTS;
    }
  });

  // 6. Settings State
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      return saved ? JSON.parse(saved) : DEFAULT_APP_SETTINGS;
    } catch {
      return DEFAULT_APP_SETTINGS;
    }
  });

  // Modals
  const [selectedModel, setSelectedModel] = useState<MarketplaceModel | null>(null);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState<boolean>(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [preloadedDraft, setPreloadedDraft] = useState<PreloadedUploadDraft | null>(null);

  // Keep the navbar's bridge indicator accurate on every tab (AI Studio adds detailed logging on top)
  useEffect(() => {
    let cancelled = false;
    const check = () => {
      pingBridge(settings.localRelayUrl)
        .then(() => !cancelled && setSettings((prev) => (prev.isLocalRelayOnline ? prev : { ...prev, isLocalRelayOnline: true })))
        .catch(() => !cancelled && setSettings((prev) => (prev.isLocalRelayOnline ? { ...prev, isLocalRelayOnline: false } : prev)));
    };
    check();
    const timer = setInterval(check, 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [settings.localRelayUrl]);

  // Sync state to LocalStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.TAB, activeTab);
    } catch (e) {
      console.warn('LocalStorage error', e);
    }
  }, [activeTab]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.WALLET, walletBalance.toString());
    } catch (e) {
      console.warn('LocalStorage error', e);
    }
  }, [walletBalance]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.CREATOR_BALANCE, creatorBalance.toString());
    } catch (e) {
      console.warn('LocalStorage error', e);
    }
  }, [creatorBalance]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.MODELS, JSON.stringify(models));
    } catch (e) {
      console.warn('LocalStorage error', e);
    }
  }, [models]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
    } catch (e) {
      console.warn('LocalStorage error', e);
    }
  }, [transactions]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.PAYOUTS, JSON.stringify(payouts));
    } catch (e) {
      console.warn('LocalStorage error', e);
    }
  }, [payouts]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    } catch (e) {
      console.warn('LocalStorage error', e);
    }
  }, [settings]);

  // Handle Add Funds to Wallet
  const handleAddFunds = (amount: number) => {
    setWalletBalance((prev) => prev + amount);
  };

  // Handle 1-Click Purchase of a Model
  const handlePurchaseModel = (
    model: MarketplaceModel,
    feeAmount: number,
    creatorPayout: number
  ): boolean => {
    if (model.price > 0 && walletBalance < model.price) {
      return false;
    }

    // Deduct from buyer wallet
    if (model.price > 0) {
      setWalletBalance((prev) => Math.max(0, prev - model.price));
      // Deposit into creator balance
      setCreatorBalance((prev) => prev + creatorPayout);
    }

    // Record Transaction
    const newTx: TransactionRecord = {
      id: `tx-${Date.now()}`,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16),
      modelId: model.id,
      modelTitle: model.title,
      buyerName: 'You (Current User)',
      listedPrice: model.price,
      platformFee: feeAmount,
      creatorPayout: creatorPayout,
      type: 'sale',
      status: 'completed',
    };

    setTransactions((prev) => [newTx, ...prev]);

    // Mark model as purchased & increment download count
    setModels((prev) =>
      prev.map((m) =>
        m.id === model.id
          ? { ...m, isPurchased: true, downloadsCount: m.downloadsCount + 1 }
          : m
      )
    );

    if (selectedModel && selectedModel.id === model.id) {
      setSelectedModel((prev) => (prev ? { ...prev, isPurchased: true } : null));
    }

    return true;
  };

  // Handle Publishing a new model (from Studio or Creator Hub)
  const handlePublishModel = (newModel: MarketplaceModel) => {
    setModels((prev) => [newModel, ...prev]);
  };

  // Handle Payout Request from Creator
  const handleRequestPayout = (amount: number, method: PayoutRequest['method']): boolean => {
    if (amount <= 0 || amount > creatorBalance) return false;

    setCreatorBalance((prev) => prev - amount);

    const newPayout: PayoutRequest = {
      id: `pay-${Date.now()}`,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 16),
      amount,
      method,
      status: 'Completed',
      referenceCode: `PO_${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
    };

    setPayouts((prev) => [newPayout, ...prev]);
    return true;
  };

  // Send generated model from AI Studio to Creator Hub upload flow
  const handleSendToMarketplace = (draft: PreloadedUploadDraft) => {
    setPreloadedDraft(draft);
    setActiveTab('creator');
  };

  // Reset to Factory Defaults
  const handleResetMockData = () => {
    setWalletBalance(45.00);
    setCreatorBalance(64.80);
    setModels(INITIAL_MODELS);
    setTransactions(INITIAL_TRANSACTIONS);
    setPayouts(INITIAL_PAYOUTS);
    setSettings(DEFAULT_APP_SETTINGS);
    setPreloadedDraft(null);
    localStorage.clear();
  };

  return (
    <div className="min-h-screen bg-[#0b0f17] text-slate-100 flex flex-col selection:bg-emerald-500 selection:text-slate-950 font-sans">
      
      {/* Top Navigation Bar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        walletBalance={walletBalance}
        openWalletModal={() => setIsWalletModalOpen(true)}
        openUploadModal={() => {
          setActiveTab('creator');
        }}
        openSettingsModal={() => setIsSettingsModalOpen(true)}
        settings={settings}
        setSettings={setSettings}
      />

      {/* Main Viewport Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'marketplace' && (
          <MarketplaceView
            models={models}
            onSelectModel={(m) => setSelectedModel(m)}
            openUploadModal={() => setActiveTab('creator')}
          />
        )}

        {activeTab === 'studio' && (
          <AiStudioView
            settings={settings}
            setSettings={setSettings}
            onPublishModel={handlePublishModel}
            openWalletModal={() => setIsWalletModalOpen(true)}
            onSendToMarketplace={handleSendToMarketplace}
          />
        )}

        {activeTab === 'creator' && (
          <CreatorHubView
            models={models}
            transactions={transactions}
            payouts={payouts}
            onUploadModel={handlePublishModel}
            onRequestPayout={handleRequestPayout}
            settings={settings}
            creatorBalance={creatorBalance}
            preloadedDraft={preloadedDraft}
            onClearDraft={() => setPreloadedDraft(null)}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-slate-800/80 bg-[#090d14] py-6 mt-12 text-xs font-mono text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="font-display font-bold text-slate-200">
              PRINT<span className="text-emerald-400">FORGE</span>
            </span>
            <span>•</span>
            <span>Decentralized 3D Print Exchange</span>
          </div>

          <div className="flex items-center gap-4 text-[11px]">
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${settings.isLocalRelayOnline ? 'bg-emerald-400' : 'bg-cyan-400'}`} />
              <span>Bridge: {settings.isLocalRelayOnline ? 'Online (Port 8000)' : 'Virtual Engine'}</span>
            </span>
            <span>•</span>
            <span className="text-slate-400">
              Platform Fee: {settings.platformFeePercent}%
            </span>
          </div>
        </div>
      </footer>

      {/* Interactive Model Detail & Purchase Modal */}
      <ModelDetailModal
        model={selectedModel}
        onClose={() => setSelectedModel(null)}
        walletBalance={walletBalance}
        onPurchaseModel={handlePurchaseModel}
        settings={settings}
        openWalletModal={() => setIsWalletModalOpen(true)}
      />

      {/* User Wallet Modal */}
      <WalletModal
        isOpen={isWalletModalOpen}
        onClose={() => setIsWalletModalOpen(false)}
        walletBalance={walletBalance}
        onAddFunds={handleAddFunds}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={settings}
        setSettings={setSettings}
        onResetMockData={handleResetMockData}
      />

    </div>
  );
}
