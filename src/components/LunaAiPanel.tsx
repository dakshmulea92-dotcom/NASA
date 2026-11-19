import React, { useState } from 'react';
import { Send, Bot, AlertTriangle } from 'lucide-react';
import { useLunar } from '../context/LunarContext.tsx';

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

const EXAMPLE_PROMPTS = [
  'Analyze the selected lunar coordinate using current LOLA telemetry.',
  'Explain the sunlight and horizon shadow conditions at this coordinate.',
  'What terrain uncertainties remain at this LOLA resolution?',
  'Compare South Pole Shackleton Rim vs Apollo 11 Mare Tranquillitatis.',
];

export const LunaAiPanel: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { activePage, selectedCoord, assessment, illumination, missions } = useLunar();
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: 'assistant',
      content:
        'LUNA AI online. Ask about the active target terrain, LOLA DEM resolution, slope safety scores, solar illumination windows, or mission planning assumptions. All responses cite active NASA telemetry.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const nextMessages: ChatMsg[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);
    setErrorMsg(null);

    const context = {
      activePage,
      coordinate: selectedCoord,
      terrainSummary: assessment
        ? {
            datasetId: assessment.dem.datasetUsed.datasetId,
            spatialResolution: assessment.dem.datasetUsed.spatialResolution,
            dataAvailable: assessment.dem.dataAvailable,
            minElevationM: assessment.dem.minElevationM,
            maxElevationM: assessment.dem.maxElevationM,
            meanElevationM: assessment.dem.meanElevationM,
            meanSlopeDeg: assessment.dem.meanSlopeDeg,
            p95SlopeDeg: assessment.dem.p95SlopeDeg,
            maxSlopeDeg: assessment.dem.maxSlopeDeg,
            rmsRoughnessM: assessment.dem.rmsRoughnessM,
            overallScore: assessment.scores.overallScore,
            classification: assessment.classification,
            rejectionReasons: assessment.rejectionReasons,
            uncertaintyMeters: assessment.dem.uncertaintyMeters,
            maxHorizonAngleDeg: assessment.horizon.maxHorizonAngleDeg,
            skyVisibilityFactor: assessment.horizon.skyVisibilityFactor,
            nearbyCraters: assessment.dem.detectedCraters.slice(0, 5),
          }
        : null,
      illuminationSummary: illumination
        ? {
            requestedUtc: illumination.requestedUtc,
            solarElevationDeg: illumination.current.solarElevationDeg,
            solarAzimuthDeg: illumination.current.solarAzimuthDeg,
            shadowStatus: illumination.current.shadowStatus,
            sunlitPercentage30d: illumination.sunlitPercentage,
            peakSunlightUtc: illumination.peakSunlightUtc,
            nextSunriseUtc: illumination.nextSunriseUtc,
            isLikelyPsr: illumination.isLikelyPsr,
            source: illumination.source,
          }
        : null,
      activeMission: missions[0]
        ? {
            name: missions[0].name,
            type: missions[0].missionType,
            target: missions[0].targetCoordinate,
            totalDeltaVMs: missions[0].calculations.totalDeltaVMs,
          }
        : null,
    };

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages, context }),
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok || !data.reply) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply! }]);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Unable to reach LUNA AI backend. Verify GEMINI_API_KEY configuration.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0B1120] border border-slate-800 rounded-md overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-slate-100">LUNA AI Scientific Assistant</span>
        </div>
        <span className="text-[11px] font-mono text-slate-400">Grounded in Active Telemetry</span>
      </div>

      {/* Quick prompts */}
      <div className="px-3 py-2 border-b border-slate-800/80 flex flex-wrap gap-1.5 bg-[#080d18]">
        {(compact ? EXAMPLE_PROMPTS.slice(0, 2) : EXAMPLE_PROMPTS).map((prompt) => (
          <button
            key={prompt}
            onClick={() => sendMessage(prompt)}
            disabled={loading}
            className="text-left text-[11px] px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-300 transition-colors"
          >
            {prompt}
          </button>
        ))}
      </div>

      {/* Transcript */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`rounded p-3 text-xs leading-relaxed whitespace-pre-wrap ${
              m.role === 'user'
                ? 'bg-cyan-950/40 border border-cyan-800/60 text-slate-100 ml-6'
                : 'bg-[#060911] border border-slate-800 text-slate-200 mr-4'
            }`}
          >
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">
              {m.role === 'user' ? 'Operator' : 'LUNA AI'}
            </div>
            {m.content}
          </div>
        ))}
        {loading && (
          <div className="text-xs font-mono text-cyan-300 px-2">
            Analyzing active NASA LOLA & ephemeris context...
          </div>
        )}
        {errorMsg && (
          <div className="flex items-start gap-2 text-xs text-amber-300 bg-amber-950/40 border border-amber-800/60 p-3 rounded">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage(input);
        }}
        className="p-3 border-t border-slate-800 flex items-center gap-2 bg-[#080d18]"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask LUNA AI about terrain, illumination, craters, or mission math..."
          className="flex-1 bg-[#060911] border border-slate-700 rounded px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-slate-950 font-semibold text-xs rounded flex items-center gap-1.5 transition-colors"
        >
          <Send className="w-3.5 h-3.5" />
          Send
        </button>
      </form>
    </div>
  );
};
