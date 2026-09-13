import React, { useState, useEffect } from 'react';
import { 
  Upload, 
  DollarSign, 
  TrendingUp, 
  Layers, 
  CreditCard, 
  ArrowUpRight, 
  CheckCircle2, 
  FileCode,
  Coins,
  Receipt,
  FileDown,
  Sparkles,
  Box,
  Cpu
} from 'lucide-react';
import { 
  MarketplaceModel, 
  TransactionRecord, 
  PayoutRequest, 
  AppSettings, 
  FilamentType,
  PreloadedUploadDraft
} from '../types';
import { exportSalesLedgerCsv } from '../utils/csvExporter';
import { parseStlBuffer, LoadedMeshResult } from '../utils/meshLoader';

interface CreatorHubViewProps {
  models: MarketplaceModel[];
  transactions: TransactionRecord[];
  payouts: PayoutRequest[];
  onUploadModel: (newModel: MarketplaceModel) => void;
  onRequestPayout: (amount: number, method: PayoutRequest['method']) => boolean;
  settings: AppSettings;
  creatorBalance: number;
  preloadedDraft?: PreloadedUploadDraft | null;
  onClearDraft?: () => void;
}

export const CreatorHubView: React.FC<CreatorHubViewProps> = ({
  models,
  transactions,
  payouts,
  onUploadModel,
  onRequestPayout,
  settings,
  creatorBalance,
  preloadedDraft,
  onClearDraft,
}) => {
  // Active subtab: 'analytics' | 'upload'
  const [activeSubtab, setActiveSubtab] = useState<'analytics' | 'upload'>(
    preloadedDraft ? 'upload' : 'analytics'
  );

  // Payout request modal state
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [payoutAmount, setPayoutAmount] = useState<number>(Math.max(10, Math.floor(creatorBalance)));
  const [payoutMethod, setPayoutMethod] = useState<PayoutRequest['method']>('Stripe Instant');
  const [payoutSuccessMsg, setPayoutSuccessMsg] = useState<string | null>(null);

  // Upload Form State
  const [uploadTitle, setUploadTitle] = useState(preloadedDraft?.title || '');
  const [uploadDesc, setUploadDesc] = useState(preloadedDraft?.description || '');
  const [uploadCategory, setUploadCategory] = useState<MarketplaceModel['category']>(
    preloadedDraft?.category || 'Functional & Tools'
  );
  const [uploadPrice, setUploadPrice] = useState<number>(4.99);
  const [uploadNozzleTemp, setUploadNozzleTemp] = useState<number>(215);
  const [uploadBedTemp, setUploadBedTemp] = useState<number>(60);
  const [uploadInfill, setUploadInfill] = useState<number>(preloadedDraft?.infillRecommended || 30);
  const [uploadFilament, setUploadFilament] = useState<FilamentType>(preloadedDraft?.filamentType || 'PETG');
  const [commercialRights, setCommercialRights] = useState<boolean>(true);
  const [dragActive, setDragActive] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(
    preloadedDraft?.fileName || 'hex_extruder_mount_v2.stl'
  );
  const [uploadStatusMsg, setUploadStatusMsg] = useState<string | null>(null);

  // Parsed mesh metrics state for uploaded file
  const [parsedMetrics, setParsedMetrics] = useState<LoadedMeshResult | null>(null);
  const [isParsingFile, setIsParsingFile] = useState(false);

  // When a preloaded draft is received from AI Studio, pre-fill the form
  useEffect(() => {
    if (preloadedDraft) {
      setUploadTitle(preloadedDraft.title);
      setUploadDesc(preloadedDraft.description);
      setUploadCategory(preloadedDraft.category);
      setUploadInfill(preloadedDraft.infillRecommended);
      setUploadFilament(preloadedDraft.filamentType);
      if (preloadedDraft.fileName) {
        setUploadedFileName(preloadedDraft.fileName);
      }
      setActiveSubtab('upload');
    }
  }, [preloadedDraft]);

  // Analytics aggregation
  const totalGrossSales = transactions.reduce((acc, t) => acc + (t.listedPrice || 0), 0);
  const totalFeesPaid = transactions.reduce((acc, t) => acc + (t.platformFee || 0), 0);
  const totalNetRevenue = transactions.reduce((acc, t) => acc + (t.creatorPayout || 0), 0);
  const myOriginalModels = models.filter((m) => m.isCreatorOriginal);

  // Handle client-side file inspection (.stl)
  const processUploadedFile = (file: File) => {
    setUploadedFileName(file.name);
    setIsParsingFile(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        if (buffer && file.name.toLowerCase().endsWith('.stl')) {
          const parsed = parseStlBuffer(buffer);
          setParsedMetrics(parsed);
        } else {
          // Fallback approximate metrics for non-stl
          setParsedMetrics({
            geometry: null as any,
            vertexCount: 8420,
            triangleCount: 2806,
            dimensionsMm: { x: 50, y: 50, z: 35 },
            estimatedVolumeCm3: 24.5,
          });
        }
      } catch (err) {
        console.warn('Could not parse STL mesh:', err);
      } finally {
        setIsParsingFile(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Handle Payout submission
  const handleConfirmPayout = () => {
    if (payoutAmount <= 0 || payoutAmount > creatorBalance) return;
    const success = onRequestPayout(payoutAmount, payoutMethod);
    if (success) {
      setPayoutSuccessMsg(`Payout request of $${payoutAmount.toFixed(2)} sent via ${payoutMethod}!`);
      setTimeout(() => {
        setShowPayoutModal(false);
        setPayoutSuccessMsg(null);
      }, 1500);
    }
  };

  // Handle Model Upload submission
  const handlePublishUploadedModel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadTitle.trim()) return;

    // Use parsed dimensions if available, or preloaded draft dimensions, or fallback
    const dims = parsedMetrics?.dimensionsMm || preloadedDraft?.dimensionsMm || { x: 55, y: 55, z: 35 };
    const printTimeHours = preloadedDraft?.estimatedPrintTimeHours || 2.4;
    const weight = preloadedDraft?.weightGrams || Math.round((dims.x * dims.y * dims.z) / 1000 * 1.25 * (uploadInfill / 100 + 0.3));

    const newModel: MarketplaceModel = {
      id: `pf-up-${Date.now()}`,
      title: uploadTitle,
      creator: {
        name: 'You (Creator)',
        avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80',
        verified: true,
        rating: 5.0,
      },
      category: uploadCategory,
      description: uploadDesc || 'User uploaded 3D printing asset verified for production.',
      price: Number(uploadPrice) || 0,
      rating: 5.0,
      reviewsCount: 0,
      downloadsCount: 0,
      license: commercialRights ? 'Commercial Use' : 'CC BY-NC 4.0',
      tags: ['Creator Upload', uploadCategory, uploadFilament, `${uploadInfill}% Infill`],
      dimensionsMm: dims,
      estimatedPrintTimeHours: printTimeHours,
      weightGrams: weight,
      filamentType: uploadFilament,
      infillRecommended: uploadInfill,
      nozzleTemp: uploadNozzleTemp,
      bedTemp: uploadBedTemp,
      geometryType: preloadedDraft?.geometryType || 'bracket',
      featuredImage: preloadedDraft?.coverUrl || undefined,
      isCreatorOriginal: true,
      createdAt: new Date().toISOString().split('T')[0],
    };

    onUploadModel(newModel);
    if (onClearDraft) onClearDraft();
    setUploadStatusMsg(`Model "${uploadTitle}" published directly to the marketplace!`);
    setTimeout(() => {
      setUploadStatusMsg(null);
      setActiveSubtab('analytics');
    }, 1200);
  };

  return (
    <div className="space-y-6">
      {/* Hub Top Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-950 p-6 rounded-2xl border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <TrendingUp className="w-5 h-5" />
            </span>
            <h1 className="text-xl sm:text-2xl font-display font-bold text-white tracking-wide">
              Creator Hub & <span className="text-emerald-400">Sales Dashboard</span>
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-xl">
            Track gross earnings, platform commission cuts ({settings.platformFeePercent}%), request instant payouts, and publish new 3D assets to the marketplace.
          </p>
        </div>

        {/* Subtab Toggle Buttons */}
        <div className="flex items-center gap-2 bg-slate-950/80 p-1.5 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveSubtab('analytics')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium font-mono transition-all ${
              activeSubtab === 'analytics'
                ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Analytics & Sales
          </button>
          <button
            type="button"
            onClick={() => setActiveSubtab('upload')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium font-mono transition-all flex items-center gap-1.5 ${
              activeSubtab === 'upload'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload Model</span>
            {preloadedDraft && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
          </button>
        </div>
      </div>

      {activeSubtab === 'analytics' ? (
        <>
          {/* Analytics Summary Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Total Gross Sales */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-lg space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
                <span>Total Gross Sales</span>
                <DollarSign className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-white">
                ${totalGrossSales.toFixed(2)}
              </div>
              <div className="text-[11px] text-slate-400">
                {transactions.length} total customer sales
              </div>
            </div>

            {/* Platform Fees Paid */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-lg space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
                <span>Platform Fees Paid</span>
                <Coins className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-amber-400">
                -${totalFeesPaid.toFixed(2)}
              </div>
              <div className="text-[11px] text-slate-400">
                {settings.platformFeePercent}% platform infrastructure fee
              </div>
            </div>

            {/* Net Revenue */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-lg space-y-1">
              <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
                <span>Net Creator Revenue</span>
                <TrendingUp className="w-4 h-4 text-cyan-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-cyan-400">
                ${totalNetRevenue.toFixed(2)}
              </div>
              <div className="text-[11px] text-slate-400">
                {100 - settings.platformFeePercent}% direct creator share
              </div>
            </div>

            {/* Available Creator Balance & Payout CTA */}
            <div className="bg-gradient-to-br from-emerald-950/40 to-slate-900 border border-emerald-500/40 rounded-xl p-4 shadow-lg space-y-2 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-emerald-400 text-xs font-mono font-semibold">
                  <span>Available Balance</span>
                  <CreditCard className="w-4 h-4" />
                </div>
                <div className="text-2xl font-bold font-mono text-emerald-300">
                  ${creatorBalance.toFixed(2)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPayoutModal(true)}
                disabled={creatorBalance <= 0}
                className="w-full py-1.5 px-3 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 text-xs font-mono font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5"
                id="btn-request-payout-open"
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>Request Payout</span>
              </button>
            </div>

          </div>

          {/* Sales Transactions & Payouts Table */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            
            {/* Recent Sales Ledger (8 cols) */}
            <div className="lg:col-span-8 bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-lg space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-sm font-bold font-mono uppercase text-slate-200 tracking-wider">
                    Sales Breakdown Ledger
                  </h2>
                  <span className="text-xs font-mono text-slate-400">
                    ({transactions.length} entries)
                  </span>
                </div>

                {/* Export Sales Ledger Button */}
                <button
                  type="button"
                  onClick={() => exportSalesLedgerCsv(transactions, settings.platformFeePercent)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-300 hover:text-white border border-slate-700 rounded-lg text-xs font-mono transition-all flex items-center gap-1.5 shadow-sm"
                  id="btn-export-sales-ledger"
                  title="Download formatted CSV file with all transactions and payout splits"
                >
                  <FileDown className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Export Sales Ledger (.CSV)</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                      <th className="pb-2 font-medium">Model / Buyer</th>
                      <th className="pb-2 font-medium">Date</th>
                      <th className="pb-2 font-medium text-right">Listed</th>
                      <th className="pb-2 font-medium text-right">Fee ({settings.platformFeePercent}%)</th>
                      <th className="pb-2 font-medium text-right">Net Payout</th>
                      <th className="pb-2 font-medium text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {transactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 pr-2">
                          <div className="font-semibold text-white truncate max-w-[200px]">
                            {tx.modelTitle}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            Buyer: {tx.buyerName}
                          </div>
                        </td>
                        <td className="py-3 text-slate-400 whitespace-nowrap">
                          {tx.timestamp}
                        </td>
                        <td className="py-3 text-right text-slate-300 font-semibold">
                          ${tx.listedPrice.toFixed(2)}
                        </td>
                        <td className="py-3 text-right text-amber-400">
                          -${tx.platformFee.toFixed(2)}
                        </td>
                        <td className="py-3 text-right text-emerald-400 font-bold">
                          +${tx.creatorPayout.toFixed(2)}
                        </td>
                        <td className="py-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-950/60 text-emerald-400 border border-emerald-800">
                            {tx.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent Payout Requests & Models list (4 cols) */}
            <div className="lg:col-span-4 space-y-4">
              
              {/* Recent Payouts */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-lg space-y-3">
                <h3 className="text-xs font-bold font-mono uppercase text-slate-300 tracking-wider flex items-center justify-between">
                  <span>Recent Payouts</span>
                  <CreditCard className="w-3.5 h-3.5 text-cyan-400" />
                </h3>

                <div className="space-y-2">
                  {payouts.map((po) => (
                    <div
                      key={po.id}
                      className="p-2.5 bg-slate-950 rounded-lg border border-slate-800/80 text-xs font-mono flex items-center justify-between"
                    >
                      <div>
                        <div className="text-slate-200 font-bold">
                          ${po.amount.toFixed(2)} • {po.method}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {po.timestamp} • {po.referenceCode}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800">
                        {po.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* My Published Models Summary */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-lg space-y-3">
                <h3 className="text-xs font-bold font-mono uppercase text-slate-300 tracking-wider flex items-center justify-between">
                  <span>My Published Listings</span>
                  <span className="text-emerald-400">{myOriginalModels.length} Active</span>
                </h3>

                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {myOriginalModels.map((m) => (
                    <div
                      key={m.id}
                      className="p-2 bg-slate-950 rounded-lg border border-slate-800 text-xs flex items-center justify-between"
                    >
                      <div className="truncate pr-2">
                        <div className="font-semibold text-slate-200 truncate max-w-[140px]">
                          {m.title}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400">
                          {m.downloadsCount} downloads • {m.rating}★
                        </div>
                      </div>
                      <span className="font-mono text-emerald-400 font-bold text-xs shrink-0">
                        {m.price === 0 ? 'FREE' : `$${m.price.toFixed(2)}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

            </div>

          </div>
        </>
      ) : (
        /* Model Upload Subtab Form */
        <div className="max-w-3xl mx-auto bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
          <div className="border-b border-slate-800 pb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Upload className="w-5 h-5 text-cyan-400" />
                <span>Publish 3D Print File (.STL / .OBJ / .3MF)</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                {preloadedDraft
                  ? 'Pre-filled from your recent AI Studio generation. Review parameters and publish.'
                  : 'Add your custom slice recommendations, pricing, and license terms to list directly on the marketplace.'}
              </p>
            </div>
            {preloadedDraft && (
              <div className="px-2.5 py-1 rounded bg-cyan-950 border border-cyan-700 text-cyan-300 text-xs font-mono flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>AI Draft Loaded</span>
              </div>
            )}
          </div>

          <form onSubmit={handlePublishUploadedModel} className="space-y-5">
            {/* Drag & Drop File Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                if (e.dataTransfer.files?.[0]) {
                  processUploadedFile(e.dataTransfer.files[0]);
                }
              }}
              className={`p-6 border-2 border-dashed rounded-xl text-center transition-all cursor-pointer ${
                dragActive
                  ? 'border-cyan-400 bg-cyan-950/20'
                  : 'border-slate-700 hover:border-slate-600 bg-slate-950/60'
              }`}
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.stl,.3mf,.obj';
                input.onchange = (ev: any) => {
                  if (ev.target?.files?.[0]) {
                    processUploadedFile(ev.target.files[0]);
                  }
                };
                input.click();
              }}
            >
              <FileCode className="w-10 h-10 text-cyan-400 mx-auto mb-2" />
              <div className="text-xs sm:text-sm font-semibold text-slate-200">
                {isParsingFile ? (
                  <span className="text-cyan-400 font-mono flex items-center justify-center gap-2">
                    <span className="animate-spin">⌛</span> Inspecting mesh manifold & geometry...
                  </span>
                ) : uploadedFileName ? (
                  <span className="text-emerald-400 font-mono flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Loaded: {uploadedFileName}</span>
                  </span>
                ) : (
                  'Drag and drop your .STL, .3MF, or .OBJ file here, or click to browse'
                )}
              </div>
              <div className="text-[11px] font-mono text-slate-400 mt-1">
                Client-side Three.js manifold verification enabled
              </div>

              {/* Client-Side Parsed Mesh Readout */}
              {parsedMetrics && (
                <div className="mt-3 p-2.5 bg-slate-900 border border-cyan-500/40 rounded-lg text-xs font-mono text-cyan-300 flex flex-wrap items-center justify-center gap-4">
                  <span className="flex items-center gap-1">
                    <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                    {parsedMetrics.triangleCount.toLocaleString()} Triangles
                  </span>
                  <span className="flex items-center gap-1">
                    <Box className="w-3.5 h-3.5 text-emerald-400" />
                    {parsedMetrics.dimensionsMm.x} × {parsedMetrics.dimensionsMm.y} × {parsedMetrics.dimensionsMm.z} mm
                  </span>
                  <span className="text-slate-300">
                    ~{parsedMetrics.estimatedVolumeCm3} cm³ Volume
                  </span>
                </div>
              )}
            </div>

            {/* Studio Cover Preview if attached from AI Studio Snapshot */}
            {preloadedDraft?.coverUrl && (
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between gap-3 font-mono text-xs">
                <div className="flex items-center gap-3">
                  <img
                    src={preloadedDraft.coverUrl}
                    alt="Studio Cover"
                    className="w-16 h-12 object-cover rounded-lg border border-slate-700"
                  />
                  <div>
                    <div className="text-emerald-400 font-bold flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Studio Snapshot Attached</span>
                    </div>
                    <div className="text-[10px] text-slate-400">
                      High-res 1200x800 marketplace cover image ready
                    </div>
                  </div>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/50 text-emerald-300">
                  Cover Ready
                </span>
              </div>
            )}

            {/* Title & Category */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-mono text-slate-300">Model Title *</label>
                <input
                  type="text"
                  required
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  placeholder="e.g. Hexagonal Direct Drive Extruder Mount"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-mono text-slate-300">Category</label>
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="Functional & Tools">Functional & Tools</option>
                  <option value="Miniatures & Gaming">Miniatures & Gaming</option>
                  <option value="Art & Articulated">Art & Articulated</option>
                  <option value="Gadgets & Tech">Gadgets & Tech</option>
                  <option value="Replacement Parts">Replacement Parts</option>
                </select>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1">
              <label className="text-xs font-mono text-slate-300">Model Description</label>
              <textarea
                rows={3}
                value={uploadDesc}
                onChange={(e) => setUploadDesc(e.target.value)}
                placeholder="Include printer compatibility, hardware requirements (screws, bearings), and print suggestions..."
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-cyan-500 resize-none"
              />
            </div>

            {/* Slicing Recommendations Grid */}
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
              <div className="text-xs font-mono uppercase text-slate-300 font-semibold flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-emerald-400" />
                <span>Recommended Slicing Parameters</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-[11px] font-mono text-slate-400">Filament</label>
                  <select
                    value={uploadFilament}
                    onChange={(e) => setUploadFilament(e.target.value as any)}
                    className="w-full mt-1 bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs font-mono text-slate-200"
                  >
                    <option value="PLA">PLA</option>
                    <option value="PETG">PETG</option>
                    <option value="TPU">TPU</option>
                    <option value="ABS">ABS</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-mono text-slate-400">Nozzle Temp (°C)</label>
                  <input
                    type="number"
                    value={uploadNozzleTemp}
                    onChange={(e) => setUploadNozzleTemp(Number(e.target.value))}
                    className="w-full mt-1 bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs font-mono text-slate-200"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-mono text-slate-400">Bed Temp (°C)</label>
                  <input
                    type="number"
                    value={uploadBedTemp}
                    onChange={(e) => setUploadBedTemp(Number(e.target.value))}
                    className="w-full mt-1 bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs font-mono text-slate-200"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-mono text-slate-400">Infill %</label>
                  <input
                    type="number"
                    min="10"
                    max="100"
                    value={uploadInfill}
                    onChange={(e) => setUploadInfill(Number(e.target.value))}
                    className="w-full mt-1 bg-slate-900 border border-slate-800 rounded px-2 py-1.5 text-xs font-mono text-slate-200"
                  />
                </div>
              </div>
            </div>

            {/* Price & Commercial Rights */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-mono text-slate-300">
                  Listing Price ($0.00 for Free community file)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-slate-500">$</span>
                  <input
                    type="number"
                    step="0.50"
                    min="0"
                    value={uploadPrice}
                    onChange={(e) => setUploadPrice(Number(e.target.value))}
                    className="w-full pl-8 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-emerald-400 font-bold focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div className="text-[10px] font-mono text-slate-400">
                  You earn: ${(uploadPrice * (1 - settings.platformFeePercent / 100)).toFixed(2)} ({100 - settings.platformFeePercent}% creator payout)
                </div>
              </div>

              <div className="flex items-center gap-3 pt-4">
                <input
                  type="checkbox"
                  id="commercial-toggle"
                  checked={commercialRights}
                  onChange={(e) => setCommercialRights(e.target.checked)}
                  className="w-4 h-4 accent-emerald-400 cursor-pointer rounded"
                />
                <label htmlFor="commercial-toggle" className="text-xs text-slate-300 cursor-pointer select-none">
                  <span className="font-semibold block">Grant Commercial Rights</span>
                  <span className="text-[11px] text-slate-400 block">
                    Allows buyers to sell physical 3D prints made from this model
                  </span>
                </label>
              </div>
            </div>

            {/* Status confirmation */}
            {uploadStatusMsg && (
              <div className="p-3 bg-emerald-950/80 border border-emerald-800 rounded-lg text-xs font-mono text-emerald-400 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                <span>{uploadStatusMsg}</span>
              </div>
            )}

            {/* Submit Button */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  if (onClearDraft) onClearDraft();
                  setActiveSubtab('analytics');
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono rounded-lg transition-colors"
              >
                Cancel
              </button>

              <button
                type="submit"
                className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-bold text-xs font-mono uppercase tracking-wider rounded-lg transition-all shadow-lg shadow-cyan-500/20"
                id="btn-submit-upload-model"
              >
                Publish to Community Marketplace
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Payout Modal Simulator */}
      {showPayoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-400" />
                <span>Request Creator Payout</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowPayoutModal(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-center text-xs font-mono">
                <span className="text-slate-400">Available to Withdraw:</span>
                <span className="text-emerald-400 font-bold text-sm">
                  ${creatorBalance.toFixed(2)}
                </span>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-mono text-slate-300">Withdrawal Amount ($)</label>
                <input
                  type="number"
                  min="5"
                  max={creatorBalance}
                  value={payoutAmount}
                  onChange={(e) => setPayoutAmount(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-emerald-400 font-mono font-bold text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-mono text-slate-300">Payout Rail</label>
                <select
                  value={payoutMethod}
                  onChange={(e) => setPayoutMethod(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200"
                >
                  <option value="Stripe Instant">Stripe Instant (Visa Direct / Mastercard Send)</option>
                  <option value="Direct ACH">Direct ACH Bank Transfer (1-2 days)</option>
                  <option value="USDC / Crypto">USDC / Solana or Polygon Settlement</option>
                </select>
              </div>

              {payoutSuccessMsg && (
                <div className="p-2.5 bg-emerald-950 border border-emerald-800 rounded-lg text-xs font-mono text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{payoutSuccessMsg}</span>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPayoutModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPayout}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-mono font-bold rounded-lg transition-all shadow-md shadow-emerald-500/20"
                id="btn-confirm-payout"
              >
                Confirm Payout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
