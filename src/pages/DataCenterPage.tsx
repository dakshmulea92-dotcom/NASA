import React, { useEffect, useState } from 'react';
import { Database, ExternalLink, RefreshCw, Trash2 } from 'lucide-react';
import type { DatasetMetadata } from '../types/lunar.ts';
import { useLunar } from '../context/LunarContext.tsx';

interface DatasetsResponse {
  datasets: DatasetMetadata[];
  cacheStats: {
    cachedDemWindows: number;
    cachedTiles: number;
    cachedWeatherFiles: number;
    totalCacheSizeKb: number;
  };
}

export const DataCenterPage: React.FC = () => {
  const { pushNotification } = useLunar();
  const [data, setData] = useState<DatasetsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  const loadDatasets = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/datasets');
      const json = (await res.json()) as DatasetsResponse;
      setData(json);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDatasets();
  }, []);

  const handleClearCache = async () => {
    setClearing(true);
    try {
      const res = await fetch('/api/datasets/clear-cache', { method: 'POST' });
      const result = (await res.json()) as { deletedFiles: number };
      pushNotification('info', `Cleared ${result.deletedFiles} cached NASA crop/tile files.`);
      await loadDatasets();
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header & Cache Stats */}
      <div className="bg-[#0B1120] border border-slate-800 rounded-md p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-mono text-cyan-400">SCIENTIFIC DATA PROVENANCE & TILE CACHE</div>
          <h2 className="text-xl font-display font-bold text-slate-100">
            NASA Data & Research Center
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Regional HTTP Byte-Range cropping and WMTS tile caching prevent redundant multi-gigabyte global downloads.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={loadDatasets}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Status
          </button>
          <button
            onClick={handleClearCache}
            disabled={clearing}
            className="px-3 py-2 bg-rose-950/60 hover:bg-rose-900/70 border border-rose-800/60 text-xs text-rose-200 rounded flex items-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {clearing ? 'Clearing...' : 'Clear Regional Cache'}
          </button>
        </div>
      </div>

      {/* Cache KPI Row */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-mono">
          <div className="bg-[#0B1120] border border-slate-800 rounded-md p-4">
            <div className="text-slate-400">CACHED LOLA DEM WINDOWS</div>
            <div className="text-2xl font-bold text-slate-100 mt-1">{data.cacheStats.cachedDemWindows}</div>
          </div>
          <div className="bg-[#0B1120] border border-slate-800 rounded-md p-4">
            <div className="text-slate-400">CACHED MOON TREK TILES</div>
            <div className="text-2xl font-bold text-slate-100 mt-1">{data.cacheStats.cachedTiles}</div>
          </div>
          <div className="bg-[#0B1120] border border-slate-800 rounded-md p-4">
            <div className="text-slate-400">NASA POWER REANALYSIS FILES</div>
            <div className="text-2xl font-bold text-slate-100 mt-1">{data.cacheStats.cachedWeatherFiles}</div>
          </div>
          <div className="bg-[#0B1120] border border-slate-800 rounded-md p-4">
            <div className="text-slate-400">DISK CACHE FOOTPRINT</div>
            <div className="text-2xl font-bold text-cyan-300 mt-1">{data.cacheStats.totalCacheSizeKb} KB</div>
          </div>
        </div>
      )}

      {/* Dataset Catalog Table */}
      <div className="bg-[#0B1120] border border-slate-800 rounded-md overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center gap-2">
          <Database className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-slate-100">
            Active NASA Datasets & Resource Provenance
          </h3>
        </div>

        <div className="divide-y divide-slate-800/80">
          {data?.datasets.map((ds) => (
            <div key={ds.id} className="p-4 space-y-2 text-xs">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-semibold text-sm text-slate-100">{ds.name}</div>
                  <div className="font-mono text-[11px] text-cyan-300">
                    {ds.source} · {ds.datasetId}
                  </div>
                </div>
                <div className="flex items-center gap-3 font-mono text-[11px]">
                  <span
                    className={
                      ds.status === 'cached'
                        ? 'text-emerald-400'
                        : ds.status === 'partial'
                        ? 'text-cyan-300'
                        : 'text-slate-400'
                    }
                  >
                    Download: {ds.status.toUpperCase()} · Processing: {ds.processingStatus.toUpperCase()}
                  </span>
                  <a
                    href={ds.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-300 hover:text-cyan-300 flex items-center gap-1"
                  >
                    Source <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              <p className="text-slate-300">{ds.description}</p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1 font-mono text-[11px] text-slate-400">
                <div>Resolution: {ds.spatialResolution}</div>
                <div>Units: {ds.units}</div>
                <div>Size: {ds.fileSize}</div>
                <div>Observation Period: {ds.observationPeriod}</div>
                <div className="md:col-span-2">CRS: {ds.crs}</div>
              </div>
              <div className="text-[11px] text-slate-500">Methodology: {ds.methodology}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
