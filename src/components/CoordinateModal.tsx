import React, { useState } from 'react';
import { Bookmark, Download, MapPin, Upload, X } from 'lucide-react';
import { useLunar } from '../context/LunarContext.tsx';
import { PRESET_LUNAR_SITES } from '../data/lunarCatalog.ts';
import { formatCoordPair, validateLunarCoordinate } from '../utils/coordinateFormat.ts';
import type { LunarCoordinate } from '../types/lunar.ts';

export const CoordinateModal: React.FC = () => {
  const {
    coordModalOpen,
    setCoordModalOpen,
    selectedCoord,
    setSelectedCoord,
    savedLocations,
    saveCurrentLocation,
    removeSavedLocation,
    settings,
  } = useLunar();

  const [latInput, setLatInput] = useState(String(selectedCoord.lat));
  const [lonInput, setLonInput] = useState(String(selectedCoord.lon));
  const [labelInput, setLabelInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!coordModalOpen) return null;

  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = Number(latInput);
    const lon = Number(lonInput);
    const check = validateLunarCoordinate(lat, lon);
    if (!check.valid || !check.normalized) {
      setErrorMsg(check.error || 'Invalid coordinate');
      return;
    }
    setErrorMsg(null);
    setSelectedCoord({
      lat: check.normalized.lat,
      lon: check.normalized.lon,
      name: labelInput.trim() || `Custom (${check.normalized.lat.toFixed(2)}°, ${check.normalized.lon.toFixed(2)}°)`,
      regionType: 'Custom Lunar Target',
      source: 'User Coordinate Entry (DE421)',
    });
    setCoordModalOpen(false);
  };

  const handleExportJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      crs: 'MEAN EARTH/POLAR AXIS OF DE421',
      activeCoordinate: selectedCoord,
      savedLocations,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'arc-luna-coordinates.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as {
          activeCoordinate?: LunarCoordinate;
          lat?: number;
          lon?: number;
          name?: string;
        };
        const candidate = parsed.activeCoordinate || parsed;
        if (typeof candidate.lat === 'number' && typeof candidate.lon === 'number') {
          const check = validateLunarCoordinate(candidate.lat, candidate.lon);
          if (check.valid && check.normalized) {
            setSelectedCoord({
              lat: check.normalized.lat,
              lon: check.normalized.lon,
              name: candidate.name || 'Imported Lunar Target',
              source: 'Imported JSON Coordinate',
            });
            setErrorMsg(null);
            setCoordModalOpen(false);
            return;
          }
        }
        setErrorMsg('Imported JSON does not contain valid lunar lat/lon fields.');
      } catch {
        setErrorMsg('Failed to parse JSON coordinate file.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="bg-[#0B1120] border border-slate-700 rounded-md w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Universal Lunar Coordinate Selector</h2>
            <p className="text-xs text-slate-400 font-mono">
              CRS: MEAN EARTH/POLAR AXIS OF DE421 · Active: {formatCoordPair(selectedCoord, settings.coordinateFormat)}
            </p>
          </div>
          <button
            onClick={() => setCoordModalOpen(false)}
            className="p-2 text-slate-400 hover:text-slate-100 rounded hover:bg-slate-800"
            aria-label="Close coordinate modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Manual Entry */}
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
              Manual Coordinate Input
            </h3>
            <form onSubmit={handleApplyCustom} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs text-slate-300">
                  Latitude (-90° to +90°)
                  <input
                    type="number"
                    step="0.0001"
                    value={latInput}
                    onChange={(e) => setLatInput(e.target.value)}
                    className="mt-1 w-full bg-[#060911] border border-slate-700 rounded px-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </label>
                <label className="block text-xs text-slate-300">
                  Longitude (-180°..180° or 0..360°)
                  <input
                    type="number"
                    step="0.0001"
                    value={lonInput}
                    onChange={(e) => setLonInput(e.target.value)}
                    className="mt-1 w-full bg-[#060911] border border-slate-700 rounded px-3 py-2 text-sm font-mono text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </label>
              </div>
              <label className="block text-xs text-slate-300">
                Target Label (optional)
                <input
                  type="text"
                  placeholder="e.g. Connecting Ridge Traverse Point"
                  value={labelInput}
                  onChange={(e) => setLabelInput(e.target.value)}
                  className="mt-1 w-full bg-[#060911] border border-slate-700 rounded px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </label>

              {errorMsg && (
                <div className="text-xs text-rose-400 bg-rose-950/40 border border-rose-800/60 px-3 py-2 rounded">
                  {errorMsg}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="submit"
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-semibold text-xs rounded transition-colors"
                >
                  Apply Coordinates
                </button>
                <button
                  type="button"
                  onClick={() => saveCurrentLocation(labelInput)}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded flex items-center gap-1.5"
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  Save Active
                </button>
              </div>
            </form>

            <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center gap-2">
              <button
                onClick={handleExportJson}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Export JSON
              </button>
              <label className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded flex items-center gap-1.5 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                Import JSON
                <input type="file" accept=".json" onChange={handleImportJson} className="hidden" />
              </label>
            </div>

            {/* Saved Locations */}
            <div className="pt-3 border-t border-slate-800 space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Saved Locations ({savedLocations.length})
              </h4>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {savedLocations.map((loc, idx) => (
                  <div
                    key={`${loc.lat}-${loc.lon}-${idx}`}
                    className="flex items-center justify-between gap-2 bg-[#060911] border border-slate-800 rounded px-2.5 py-1.5"
                  >
                    <button
                      onClick={() => {
                        setSelectedCoord(loc);
                        setCoordModalOpen(false);
                      }}
                      className="text-left flex-1 min-w-0"
                    >
                      <div className="text-xs font-medium text-slate-200 truncate">{loc.name}</div>
                      <div className="text-[11px] font-mono text-slate-400">
                        {formatCoordPair(loc, settings.coordinateFormat)}
                      </div>
                    </button>
                    <button
                      onClick={() => removeSavedLocation(idx)}
                      className="text-xs text-slate-500 hover:text-rose-400 px-1.5"
                      aria-label="Remove saved coordinate"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Official NASA Preset Sites */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
              Official NASA Reference & Candidate Sites
            </h3>
            <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
              {PRESET_LUNAR_SITES.map((site) => (
                <button
                  key={site.id}
                  onClick={() => {
                    setSelectedCoord({
                      lat: site.lat,
                      lon: site.lon,
                      name: site.name,
                      regionType: site.regionType,
                      source: site.source,
                    });
                    setCoordModalOpen(false);
                  }}
                  className="w-full text-left bg-[#060911] hover:bg-slate-900 border border-slate-800 hover:border-cyan-700/70 rounded p-2.5 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      {site.name}
                    </span>
                    <span className="text-[11px] font-mono text-slate-400 shrink-0">
                      {site.category}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-cyan-300/90 mt-1">
                    {formatCoordPair(site, settings.coordinateFormat)} · {site.nasaReference}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
