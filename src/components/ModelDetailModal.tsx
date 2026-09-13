import React, { useState, useMemo } from 'react';
import { 
  X, 
  Download, 
  ShoppingCart, 
  CheckCircle2, 
  ShieldCheck, 
  Clock, 
  Layers, 
  Thermometer, 
  Coins, 
  AlertCircle,
  Star,
} from 'lucide-react';
import { ThreeViewport } from './ThreeViewport';
import { MarketplaceModel, AppSettings } from '../types';
import { createProceduralGeometry } from '../utils/geometryGenerator';
import { triggerStlDownload } from '../utils/stlExporter';

interface ModelDetailModalProps {
  model: MarketplaceModel | null;
  onClose: () => void;
  walletBalance: number;
  onPurchaseModel: (model: MarketplaceModel, feeAmount: number, creatorPayout: number) => boolean;
  settings: AppSettings;
  openWalletModal: () => void;
}

export const ModelDetailModal: React.FC<ModelDetailModalProps> = ({
  model,
  onClose,
  walletBalance,
  onPurchaseModel,
  settings,
  openWalletModal,
}) => {
  const [purchaseStatus, setPurchaseStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Hooks must run on every render, so build the geometry before the early return
  const geometryType = model?.geometryType || 'bracket';
  const geometry = useMemo(() => createProceduralGeometry(geometryType), [geometryType]);

  if (!model) return null;

  // Fee calculation engine:
  // Listed Price, Buyer Total, Platform Fee Deducted (12%), Creator Payout (88%)
  const isFree = model.price === 0;
  const platformFeeRate = settings.platformFeePercent / 100;
  const listedPrice = model.price;
  const buyerTotal = listedPrice;
  const platformFeeDeducted = Number((listedPrice * platformFeeRate).toFixed(2));
  const creatorPayout = Number((listedPrice - platformFeeDeducted).toFixed(2));

  const hasEnoughFunds = walletBalance >= buyerTotal || isFree;

  const handleCheckout = () => {
    if (!hasEnoughFunds) {
      setErrorMessage(`Insufficient wallet balance ($${walletBalance.toFixed(2)}). Please add funds.`);
      return;
    }

    setPurchaseStatus('processing');
    setErrorMessage(null);

    setTimeout(() => {
      const success = onPurchaseModel(model, platformFeeDeducted, creatorPayout);
      if (success) {
        setPurchaseStatus('success');
        // Trigger instant STL download as requested
        triggerStlDownload(geometry, `${model.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.stl`);
      } else {
        setPurchaseStatus('error');
        setErrorMessage('Transaction could not be completed.');
      }
    }, 700);
  };

  const handleDownloadOnly = () => {
    triggerStlDownload(geometry, `${model.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.stl`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto animate-fadeIn">
      <div 
        className="relative w-full max-w-4xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden my-auto"
        id="model-detail-modal"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-[#0b0f17]">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800 text-xs font-mono">
              {model.category}
            </span>
            <span className="text-xs text-slate-400 font-mono">
              ID: {model.id}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            id="btn-close-modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Left 3D Viewport, Right Specs & Checkout */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-0">
          
          {/* Left: 3D Viewport (7 cols) */}
          <div className="md:col-span-7 p-4 sm:p-5 bg-slate-950/60 flex flex-col justify-between">
            <div>
              <ThreeViewport
                geometry={geometry}
                filamentType={model.filamentType}
                dimensionsMm={model.dimensionsMm}
                autoRotateDefault={true}
                height="h-[300px] sm:h-[360px]"
              />
            </div>

            {/* Print Guidelines Badges */}
            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-800/80 text-xs font-mono">
              <div className="p-2 bg-slate-900 rounded-lg border border-slate-800">
                <div className="text-slate-400 text-[10px]">Nozzle / Bed Temp</div>
                <div className="text-white font-bold flex items-center gap-1 mt-0.5">
                  <Thermometer className="w-3.5 h-3.5 text-amber-400" />
                  <span>{model.nozzleTemp}° / {model.bedTemp}°C</span>
                </div>
              </div>

              <div className="p-2 bg-slate-900 rounded-lg border border-slate-800">
                <div className="text-slate-400 text-[10px]">Recommended Infill</div>
                <div className="text-white font-bold flex items-center gap-1 mt-0.5">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{model.infillRecommended}% Density</span>
                </div>
              </div>

              <div className="p-2 bg-slate-900 rounded-lg border border-slate-800">
                <div className="text-slate-400 text-[10px]">Print Time / Mass</div>
                <div className="text-white font-bold flex items-center gap-1 mt-0.5">
                  <Clock className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{model.estimatedPrintTimeHours}h • {model.weightGrams}g</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Metadata, Pricing & Monetization Engine (5 cols) */}
          <div className="md:col-span-5 p-5 border-t md:border-t-0 md:border-l border-slate-800 flex flex-col justify-between space-y-5 bg-slate-900/90">
            
            {/* Title & Creator */}
            <div className="space-y-3">
              <div>
                <h2 className="text-lg font-bold text-white tracking-wide">
                  {model.title}
                </h2>
                <div className="flex items-center gap-2 mt-1.5">
                  <img
                    src={model.creator.avatar}
                    alt={model.creator.name}
                    className="w-5 h-5 rounded-full object-cover border border-slate-700"
                  />
                  <span className="text-xs font-medium text-slate-300">
                    {model.creator.name}
                  </span>
                  {model.creator.verified && (
                    <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" aria-label="Verified Creator" />
                  )}
                  <span className="text-xs text-amber-400 font-mono flex items-center gap-0.5 ml-auto">
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    <span>{model.rating.toFixed(2)}</span>
                    <span className="text-slate-500">({model.reviewsCount})</span>
                  </span>
                </div>
              </div>

              {/* Description */}
              <p className="text-xs text-slate-400 leading-relaxed">
                {model.description}
              </p>

              {/* License Badge */}
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono">
                <span className="text-slate-400">License Type:</span>
                <span className={`px-2 py-0.5 rounded font-semibold ${
                  model.license.includes('Commercial')
                    ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800'
                    : 'bg-slate-800 text-slate-300'
                }`}>
                  {model.license}
                </span>
              </div>
            </div>

            {/* Platform Monetization & Fee Calculation Engine */}
            <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-mono text-slate-400 pb-1.5 border-b border-slate-800">
                <span className="flex items-center gap-1 text-slate-300 font-semibold">
                  <Coins className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Fee Calculation Engine</span>
                </span>
                <span className="text-[10px] text-cyan-400">
                  {settings.platformFeePercent}% Commission
                </span>
              </div>

              {/* Explicit Fee Breakdown Breakdown */}
              <div className="space-y-1.5 text-xs font-mono">
                <div className="flex justify-between text-slate-300">
                  <span>Listed Price:</span>
                  <span className="font-semibold">{isFree ? 'FREE ($0.00)' : `$${listedPrice.toFixed(2)}`}</span>
                </div>

                {!isFree && (
                  <>
                    <div className="flex justify-between text-slate-400 text-[11px]">
                      <span>Platform Fee Deducted ({settings.platformFeePercent}%):</span>
                      <span className="text-amber-400/90">-${platformFeeDeducted.toFixed(2)}</span>
                    </div>

                    <div className="flex justify-between text-emerald-400 text-[11px] font-semibold">
                      <span>Creator Net Payout ({(100 - settings.platformFeePercent)}%):</span>
                      <span>+${creatorPayout.toFixed(2)}</span>
                    </div>
                  </>
                )}

                <div className="pt-2 border-t border-slate-800/80 flex justify-between text-sm font-bold text-white">
                  <span>Buyer Total:</span>
                  <span className="text-emerald-400 font-mono">
                    {isFree ? '$0.00' : `$${buyerTotal.toFixed(2)}`}
                  </span>
                </div>
              </div>

              {/* Wallet Status Preview */}
              {!model.isPurchased && !isFree && (
                <div className="pt-1 flex items-center justify-between text-[11px] font-mono">
                  <span className="text-slate-400">Your Wallet Balance:</span>
                  <span className={hasEnoughFunds ? 'text-slate-200' : 'text-red-400 font-bold'}>
                    ${walletBalance.toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            {/* Error / Insufficient Funds Notification */}
            {errorMessage && (
              <div className="p-2.5 bg-red-950/60 border border-red-800 rounded-lg text-xs text-red-300 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={openWalletModal}
                  className="px-2 py-0.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[10px] rounded transition-colors whitespace-nowrap"
                >
                  Add Funds
                </button>
              </div>
            )}

            {/* Checkout / Download Actions */}
            <div>
              {model.isPurchased || isFree ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleDownloadOnly}
                    className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-bold text-sm tracking-wide uppercase transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                    id="btn-download-purchased"
                  >
                    <Download className="w-4 h-4 text-slate-950" />
                    <span>Download .STL File</span>
                  </button>
                  <p className="text-[11px] text-center font-mono text-emerald-400 flex items-center justify-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{isFree ? 'Free community model — instant access' : 'Purchased & added to your local library'}</span>
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleCheckout}
                  disabled={purchaseStatus === 'processing'}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-display font-bold text-sm tracking-wider uppercase transition-all shadow-lg shadow-cyan-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
                  id="btn-confirm-checkout"
                >
                  {purchaseStatus === 'processing' ? (
                    <span>Processing Transaction...</span>
                  ) : (
                    <>
                      <ShoppingCart className="w-4 h-4 text-slate-950" />
                      <span>1-Click Purchase (${buyerTotal.toFixed(2)})</span>
                    </>
                  )}
                </button>
              )}
            </div>

          </div>

        </div>
      </div>
    </div>
  );
};
