import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Filter, 
  SlidersHorizontal, 
  Star, 
  Download, 
  ShieldCheck, 
  Clock, 
  Scale, 
  Box, 
  ExternalLink,
  Eye,
  Tag,
  ArrowUpDown,
  CheckCircle2
} from 'lucide-react';
import { MarketplaceModel, FilamentType } from '../types';
import { FILAMENT_SPECS } from '../mockData';

interface MarketplaceViewProps {
  models: MarketplaceModel[];
  onSelectModel: (model: MarketplaceModel) => void;
  openUploadModal: () => void;
}

const CATEGORIES = [
  'All',
  'Functional & Tools',
  'Miniatures & Gaming',
  'Art & Articulated',
  'Gadgets & Tech',
  'Replacement Parts',
] as const;

type SortOption = 'trending' | 'price-asc' | 'price-desc' | 'downloads' | 'rating';

export const MarketplaceView: React.FC<MarketplaceViewProps> = ({
  models,
  onSelectModel,
  openUploadModal,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedLicense, setSelectedLicense] = useState<string>('All');
  const [sortBy, setSortBy] = useState<SortOption>('trending');

  // Filtered & Sorted Models
  const filteredModels = useMemo(() => {
    let list = [...models];

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q) ||
          m.creator.name.toLowerCase().includes(q) ||
          m.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    // Category filter
    if (selectedCategory !== 'All') {
      list = list.filter((m) => m.category === selectedCategory);
    }

    // License filter
    if (selectedLicense !== 'All') {
      if (selectedLicense === 'Commercial') {
        list = list.filter((m) => m.license.includes('Commercial'));
      } else if (selectedLicense === 'Non-Commercial') {
        list = list.filter((m) => m.license.includes('NC'));
      }
    }

    // Sorting
    list.sort((a, b) => {
      switch (sortBy) {
        case 'price-asc':
          return a.price - b.price;
        case 'price-desc':
          return b.price - a.price;
        case 'downloads':
          return b.downloadsCount - a.downloadsCount;
        case 'rating':
          return b.rating - a.rating;
        case 'trending':
        default:
          return b.downloadsCount * 0.7 + b.rating * 100 - (a.downloadsCount * 0.7 + a.rating * 100);
      }
    });

    return list;
  }, [models, searchQuery, selectedCategory, selectedLicense, sortBy]);

  return (
    <div className="space-y-6">
      {/* Top Banner / Marketplace Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/95 to-slate-950 border border-slate-800 p-6 sm:p-8 shadow-xl">
        <div className="relative z-10 max-w-3xl space-y-2">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-950/70 border border-emerald-500/40 text-xs font-mono text-emerald-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Maker Verified 3D Meshes • Instant .STL Download</span>
          </div>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-display font-bold text-white tracking-wide">
            Community <span className="text-emerald-400">Marketplace</span>
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm max-w-2xl leading-relaxed">
            Discover peer-reviewed FDM and SLA models with verified print profiles, direct creator revenue sharing (88% net payout), and instant interactive 3D inspection.
          </p>
        </div>

        {/* Decorative Grid Pattern Overlay */}
        <div 
          className="absolute inset-0 opacity-10 pointer-events-none"
          style={{
            backgroundImage: `radial-gradient(#10b981 1px, transparent 1px)`,
            backgroundSize: '24px 24px',
          }}
        />
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-slate-900/80 backdrop-blur border border-slate-800 rounded-xl p-4 shadow-lg space-y-3.5">
        
        {/* Search row with sort selector */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by model name, creator, nozzle spec, or tags..."
              className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
              id="input-marketplace-search"
            />
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-400 flex items-center gap-1">
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sort:</span>
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500"
              id="select-marketplace-sort"
            >
              <option value="trending">🔥 Trending</option>
              <option value="price-asc">Price: Low-to-High</option>
              <option value="price-desc">Price: High-to-Low</option>
              <option value="downloads">Most Downloaded</option>
              <option value="rating">Highest Rated</option>
            </select>
          </div>

        </div>

        {/* Category Pills & License Filter */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
          <div className="flex flex-wrap items-center gap-1.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  selectedCategory === cat
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-slate-500 hidden sm:inline">License:</span>
            <select
              value={selectedLicense}
              onChange={(e) => setSelectedLicense(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs font-mono text-slate-300 focus:outline-none"
            >
              <option value="All">All Licenses</option>
              <option value="Commercial">Commercial Use</option>
              <option value="Non-Commercial">Non-Commercial (NC)</option>
            </select>
          </div>
        </div>

      </div>

      {/* Model Grid */}
      {filteredModels.length === 0 ? (
        <div className="text-center py-16 bg-slate-900/40 border border-slate-800 rounded-2xl p-6">
          <Box className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-300">No matching models found</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Try adjusting your search terms or clearing category filters.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('All');
              setSelectedLicense('All');
            }}
            className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono rounded-lg transition-colors"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredModels.map((model) => {
            const isFree = model.price === 0;
            const filamentSpec = FILAMENT_SPECS[model.filamentType] || FILAMENT_SPECS.PLA;

            return (
              <div
                key={model.id}
                onClick={() => onSelectModel(model)}
                className="group bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-xl overflow-hidden shadow-lg transition-all duration-200 flex flex-col justify-between cursor-pointer"
                id={`model-card-${model.id}`}
              >
                {/* 3D Visual Preview Thumbnail Box */}
                <div className="relative w-full h-48 bg-[#0a0e17] border-b border-slate-800 flex items-center justify-center overflow-hidden">
                  
                  {/* Subtle isometric bed lines */}
                  <div 
                    className="absolute inset-0 opacity-20"
                    style={{
                      backgroundImage: `linear-gradient(#1e293b 1px, transparent 1px), linear-gradient(to right, #1e293b 1px, transparent 1px)`,
                      backgroundSize: '20px 20px',
                    }}
                  />

                  {/* Visual 3D Representation Element with glowing cyber theme */}
                  <div className="relative z-10 flex flex-col items-center justify-center group-hover:scale-105 transition-transform duration-300">
                    <div 
                      className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-2xl relative"
                      style={{
                        background: `radial-gradient(circle, ${filamentSpec.color}22 0%, rgba(15,23,42,0.8) 80%)`,
                        border: `1px solid ${filamentSpec.color}66`,
                      }}
                    >
                      <Box className="w-10 h-10" style={{ color: filamentSpec.color }} />
                      <span className="absolute -bottom-2 px-2 py-0.5 rounded text-[10px] font-mono bg-slate-950 border border-slate-800 text-slate-300">
                        {model.geometryType}
                      </span>
                    </div>
                  </div>

                  {/* Price Tag Pill */}
                  <div className="absolute top-3 right-3 z-20">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold shadow-md ${
                      isFree
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-slate-950/90 text-emerald-400 border border-emerald-500/40'
                    }`}>
                      {isFree ? 'FREE' : `$${model.price.toFixed(2)}`}
                    </span>
                  </div>

                  {/* License Badge */}
                  <div className="absolute top-3 left-3 z-20">
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-950/80 text-slate-300 border border-slate-800">
                      {model.license.includes('Commercial') ? 'Commercial' : 'CC BY-NC'}
                    </span>
                  </div>

                  {/* Hover Inspect Overlay */}
                  <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-20 backdrop-blur-xs">
                    <span className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-bold text-xs font-mono flex items-center gap-1.5 shadow-lg">
                      <Eye className="w-3.5 h-3.5" />
                      <span>Inspect 3D & Checkout</span>
                    </span>
                  </div>
                </div>

                {/* Card Info Body */}
                <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-1">
                      <span className="text-emerald-400/90">{model.category}</span>
                      <div className="flex items-center gap-1 text-amber-400">
                        <Star className="w-3 h-3 fill-amber-400" />
                        <span>{model.rating.toFixed(1)}</span>
                      </div>
                    </div>

                    <h3 className="text-sm font-bold text-white group-hover:text-emerald-300 transition-colors line-clamp-1">
                      {model.title}
                    </h3>

                    <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                      {model.description}
                    </p>
                  </div>

                  {/* Print Stats Readout */}
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span>{model.estimatedPrintTimeHours}h</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <Scale className="w-3 h-3 text-slate-500" />
                      <span>{model.weightGrams}g</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: filamentSpec.color }} />
                      <span className="text-slate-300">{model.filamentType}</span>
                    </div>
                  </div>

                  {/* Creator Tag & Download count */}
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <img
                        src={model.creator.avatar}
                        alt={model.creator.name}
                        className="w-5 h-5 rounded-full object-cover border border-slate-700"
                      />
                      <span className="text-xs text-slate-300 font-medium truncate max-w-[110px]">
                        {model.creator.name}
                      </span>
                      {model.creator.verified && (
                        <ShieldCheck className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      )}
                    </div>

                    <div className="flex items-center gap-1 text-[11px] font-mono text-slate-400">
                      <Download className="w-3 h-3" />
                      <span>{model.downloadsCount.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
