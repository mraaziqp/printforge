import React, { useState } from 'react';
import { 
  X, 
  Wallet, 
  Plus, 
  CreditCard, 
  CheckCircle2, 
  Sparkles,
  ShieldCheck
} from 'lucide-react';

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletBalance: number;
  onAddFunds: (amount: number) => void;
}

export const WalletModal: React.FC<WalletModalProps> = ({
  isOpen,
  onClose,
  walletBalance,
  onAddFunds,
}) => {
  const [customAmount, setCustomAmount] = useState<string>('20');
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDeposit = (amount: number) => {
    if (amount <= 0) return;
    onAddFunds(amount);
    setSuccessNotice(`Added $${amount.toFixed(2)} to your balance!`);
    setTimeout(() => setSuccessNotice(null), 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div 
        className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-6 space-y-5"
        id="wallet-modal"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">User Wallet</h3>
              <p className="text-[11px] font-mono text-slate-400">PrintForge Escrow Balance</p>
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

        {/* Current Balance Display */}
        <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-950/40 via-slate-950 to-slate-950 border border-emerald-500/30 flex items-center justify-between">
          <div>
            <span className="text-xs font-mono text-slate-400">Active Balance</span>
            <div className="text-3xl font-mono font-bold text-emerald-400 mt-0.5">
              ${walletBalance.toFixed(2)}
            </div>
          </div>
          <div className="px-2.5 py-1 rounded bg-emerald-950 border border-emerald-800 text-emerald-300 text-[11px] font-mono flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Instant Settle</span>
          </div>
        </div>

        {/* Quick Add Presets */}
        <div className="space-y-2">
          <label className="text-xs font-mono text-slate-300">Quick Deposit Presets:</label>
          <div className="grid grid-cols-3 gap-2">
            {[10, 25, 50].map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => handleDeposit(amt)}
                className="py-2.5 px-3 rounded-lg bg-slate-950 border border-slate-800 hover:border-emerald-500 hover:bg-slate-800 text-slate-200 hover:text-emerald-400 font-mono text-xs font-bold transition-all flex items-center justify-center gap-1"
              >
                <Plus className="w-3.5 h-3.5 text-emerald-400" />
                <span>+${amt}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Custom Amount Form */}
        <div className="space-y-2">
          <label className="text-xs font-mono text-slate-300">Custom Amount ($):</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono">$</span>
              <input
                type="number"
                min="1"
                step="5"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <button
              type="button"
              onClick={() => handleDeposit(Number(customAmount) || 0)}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs font-mono rounded-lg transition-colors flex items-center gap-1"
              id="btn-add-custom-funds"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Add Funds</span>
            </button>
          </div>
        </div>

        {/* Success Notice */}
        {successNotice && (
          <div className="p-2.5 bg-emerald-950/80 border border-emerald-800 rounded-lg text-xs font-mono text-emerald-400 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>{successNotice}</span>
          </div>
        )}

        <div className="text-[11px] text-slate-500 font-mono text-center pt-1">
          Demo sandbox: instant 1-click simulation for checkout and testing.
        </div>
      </div>
    </div>
  );
};
