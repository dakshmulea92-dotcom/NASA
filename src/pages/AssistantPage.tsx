import React from 'react';
import { useLunar } from '../context/LunarContext.tsx';
import { LunaAiPanel } from '../components/LunaAiPanel.tsx';
import { formatCoordPair } from '../utils/coordinateFormat.ts';

export const AssistantPage: React.FC = () => {
  const { selectedCoord, assessment, illumination, settings } = useLunar();

  return (
    <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-5 h-[calc(100vh-140px)] min-h-[540px]">
      <div className="lg:col-span-4 bg-[#0B1120] border border-slate-800 rounded-md p-4 space-y-4 overflow-y-auto">
        <div>
          <div className="text-xs font-mono text-cyan-400">GROUNDED TELEMETRY CONTEXT</div>
          <h2 className="text-base font-display font-bold text-slate-100 mt-0.5">
            Live Telemetry Supplied to LUNA AI
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            LUNA AI reads only verified application datasets and explicitly flags missing NASA measurements.
          </p>
        </div>

        <div className="bg-[#060911] border border-slate-800 rounded p-3 space-y-1.5 text-xs font-mono">
          <div className="text-slate-400">ACTIVE COORDINATE</div>
          <div className="text-slate-100 font-sans font-semibold">{selectedCoord.name}</div>
          <div className="text-cyan-300">{formatCoordPair(selectedCoord, settings.coordinateFormat)}</div>
        </div>

        <div className="bg-[#060911] border border-slate-800 rounded p-3 space-y-1.5 text-xs font-mono">
          <div className="text-slate-400">LOLA TERRAIN SNAPSHOT</div>
          <div>Dataset: {assessment?.dem.datasetUsed.datasetId || 'Pending'}</div>
          <div>Mean Elev: {assessment?.dem.meanElevationM.toFixed(1) ?? '---'} m</div>
          <div>Mean / P95 Slope: {assessment?.dem.meanSlopeDeg.toFixed(2) ?? '---'}° / {assessment?.dem.p95SlopeDeg.toFixed(2) ?? '---'}°</div>
          <div>Suitability: {assessment ? `${assessment.scores.overallScore}/100 (${assessment.classification})` : '---'}</div>
        </div>

        <div className="bg-[#060911] border border-slate-800 rounded p-3 space-y-1.5 text-xs font-mono">
          <div className="text-slate-400">DE421 ILLUMINATION SNAPSHOT</div>
          <div>Status: {illumination?.current.shadowStatus ?? '---'}</div>
          <div>Solar Elevation: {illumination?.current.solarElevationDeg.toFixed(2) ?? '---'}°</div>
          <div>30-Day Sunlit: {illumination?.sunlitPercentage ?? '---'}%</div>
        </div>

        <div className="text-[11px] text-slate-400 leading-relaxed border-t border-slate-800 pt-3">
          Modular AI Provider Architecture: Server-side provider interface (`GeminiAiProvider` via `@google/genai`) allows swapping LLM backends without modifying frontend modules.
        </div>
      </div>

      <div className="lg:col-span-8 min-h-0">
        <LunaAiPanel />
      </div>
    </div>
  );
};
