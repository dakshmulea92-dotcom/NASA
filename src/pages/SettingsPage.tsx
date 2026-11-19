import React from 'react';
import { Cpu, RotateCcw, Sliders } from 'lucide-react';
import { useLunar } from '../context/LunarContext.tsx';
import { DEFAULT_SUITABILITY_WEIGHTS } from '../data/lunarCatalog.ts';

export const SettingsPage: React.FC = () => {
  const { settings, updateSettings, updateWeights, refreshAnalysis } = useLunar();
  const w = settings.suitabilityWeights;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-[#0B1120] border border-slate-800 rounded-md p-5">
        <div className="text-xs font-mono text-cyan-400">WORKSTATION PERFORMANCE & CALIBRATION</div>
        <h2 className="text-xl font-display font-bold text-slate-100">Application Settings</h2>
        <p className="text-xs text-slate-400 mt-1">
          Configure GPU resource budgeting, coordinate display convention, and landing-site assessment weights.
        </p>
      </div>

      {/* Performance Optimization */}
      <div className="bg-[#0B1120] border border-slate-800 rounded-md p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-cyan-400" />
          Hardware & Resource Optimization
        </h3>

        <label className="flex items-start justify-between gap-4 p-3.5 bg-[#060911] border border-slate-800 rounded cursor-pointer">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-slate-100">
              Lightweight Performance Mode (Recommended for Integrated GPUs / Software WebGL)
            </div>
            <div className="text-xs text-slate-400">
              Caps Three.js pixel ratio at 1.0, disables WebGL antialiasing & shadow maps, and queries fast local LDEM_4.IMG without remote PDS byte-range streaming.
            </div>
          </div>
          <input
            type="checkbox"
            checked={settings.lightweightMode}
            onChange={(e) => updateSettings({ lightweightMode: e.target.checked })}
            className="mt-1 w-4 h-4 accent-cyan-500"
          />
        </label>

        <div className="flex items-center justify-between p-3.5 bg-[#060911] border border-slate-800 rounded">
          <div>
            <div className="text-xs font-semibold text-slate-100">Longitude Display Format</div>
            <div className="text-xs text-slate-400">
              Choose signed [-180°, +180°] or NASA PDS positive-east [0°, 360°] notation.
            </div>
          </div>
          <select
            value={settings.coordinateFormat}
            onChange={(e) =>
              updateSettings({ coordinateFormat: e.target.value as 'signed' | 'east360' })
            }
            className="bg-[#0B1120] border border-slate-700 rounded px-3 py-1.5 text-xs font-mono text-slate-100"
          >
            <option value="signed">Signed [-180°..+180°]</option>
            <option value="east360">Positive East [0°..360°]</option>
          </select>
        </div>
      </div>

      {/* Scoring Weights */}
      <div className="bg-[#0B1120] border border-slate-800 rounded-md p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            Landing Suitability Weighting Methodology
          </h3>
          <button
            onClick={() => updateWeights(DEFAULT_SUITABILITY_WEIGHTS)}
            className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restore NASA Baseline Weights
          </button>
        </div>

        <div className="space-y-3 text-xs">
          {[
            { key: 'slope' as const, label: 'Terrain Slope Weight (Horn 3x3)' },
            { key: 'roughness' as const, label: 'Surface Roughness Weight (RMS & TRI)' },
            { key: 'craterClearance' as const, label: 'Crater Proximity & Clearance Weight' },
            { key: 'elevationStability' as const, label: 'Elevation Relief Stability Weight' },
            { key: 'dataCoverage' as const, label: 'Dataset Resolution & Coverage Confidence Weight' },
          ].map((item) => (
            <label key={item.key} className="block space-y-1">
              <div className="flex justify-between font-mono text-slate-300">
                <span>{item.label}</span>
                <span className="text-cyan-300">{Math.round(w[item.key] * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={0.6}
                step={0.05}
                value={w[item.key]}
                onChange={(e) => updateWeights({ [item.key]: Number(e.target.value) })}
                className="w-full accent-cyan-500"
              />
            </label>
          ))}
        </div>

        <button
          onClick={refreshAnalysis}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-semibold text-xs rounded"
        >
          Recompute Active Site Assessment
        </button>
      </div>
    </div>
  );
};
