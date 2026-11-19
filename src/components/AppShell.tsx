import React, { useState } from 'react';
import {
  Activity,
  Bell,
  Bot,
  Compass,
  Cpu,
  Database,
  Earth,
  Film,
  Globe,
  Layers,
  MapPin,
  Menu,
  Navigation,
  Rocket,
  Settings,
  Sparkles,
  Sun,
  Thermometer,
  X,
} from 'lucide-react';
import { useLunar } from '../context/LunarContext.tsx';
import type { PageId } from '../types/lunar.ts';
import { formatCoordPair } from '../utils/coordinateFormat.ts';
import { CoordinateModal } from './CoordinateModal.tsx';
import { LunaAiPanel } from './LunaAiPanel.tsx';
import { VideoAnimatorModal } from './VideoAnimatorModal.tsx';

interface NavGroup {
  label: string;
  items: Array<{ id: PageId; label: string; icon: React.ComponentType<{ className?: string }> }>;
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Navigation & Terrain',
    items: [
      { id: 'command-center', label: 'Mission Command Center', icon: Activity },
      { id: 'lunar-explorer', label: 'Lunar Explorer', icon: Globe },
      { id: 'landing-site', label: 'Landing Site Intelligence', icon: Compass },
      { id: 'terrain', label: 'Terrain Intelligence', icon: Layers },
    ],
  },
  {
    label: 'Environment & Earth',
    items: [
      { id: 'environment', label: 'Lunar Environmental Explorer', icon: Thermometer },
      { id: 'illumination', label: 'Sunlight & Illumination', icon: Sun },
      { id: 'earth-explorer', label: 'Earth Explorer', icon: Earth },
    ],
  },
  {
    label: 'Simulation & Planning',
    items: [
      { id: 'mission-planner', label: 'Mission Planner', icon: Rocket },
      { id: 'simulator', label: 'Autonomous Landing Simulator', icon: Cpu },
      { id: 'rover', label: 'Rover Explorer', icon: Navigation },
    ],
  },
  {
    label: 'Intelligence & System',
    items: [
      { id: 'assistant', label: 'AI Mission Assistant', icon: Bot },
      { id: 'data-center', label: 'Data & Research Center', icon: Database },
      { id: 'settings', label: 'Settings', icon: Settings },
    ],
  },
];

export const AppShell: React.FC<{ children: React.ReactNode; onOpenCover?: () => void }> = ({
  children,
  onOpenCover,
}) => {
  const {
    activePage,
    setActivePage,
    selectedCoord,
    assessment,
    loadingAnalysis,
    settings,
    notifications,
    clearNotifications,
    setCoordModalOpen,
    aiDrawerOpen,
    setAiDrawerOpen,
    setVideoModalOpen,
  } = useLunar();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  const activeNavLabel =
    NAV_GROUPS.flatMap((g) => g.items).find((i) => i.id === activePage)?.label || 'Command Center';

  return (
    <div className="min-h-screen bg-[#070514] text-slate-100 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 bg-[#0B081D] border-r border-indigo-900/60 flex-col">
        <div className="px-4 py-4 border-b border-indigo-900/60 space-y-2">
          <div className="font-display font-bold text-base tracking-tight text-white">
            ARC LUNA — LUNASIGHT
          </div>
          {onOpenCover && (
            <button
              type="button"
              onClick={onOpenCover}
              className="w-full px-2.5 py-1.5 rounded bg-[#141033] hover:bg-violet-600/25 border border-indigo-800/70 text-[11px] font-medium text-amber-300 flex items-center justify-between transition-colors"
            >
              <span>Mission Cover &amp; Overview</span>
              <Sparkles className="w-3 h-3" />
            </button>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-5">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="px-2.5 mb-1.5 text-[11px] font-medium text-indigo-300/60">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = activePage === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActivePage(item.id)}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left text-xs transition-colors whitespace-nowrap ${
                        active
                          ? 'bg-gradient-to-r from-amber-500/20 via-orange-500/15 to-violet-500/15 text-amber-300 font-semibold border border-amber-400/40'
                          : 'text-slate-300 hover:bg-[#141033] hover:text-white border border-transparent'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-amber-300' : 'text-indigo-300/70'}`} />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-indigo-900/60 text-[11px] font-mono text-slate-400 space-y-1">
          <div>Active Dataset: {assessment?.dem.datasetUsed.datasetId.split(' ')[0] || 'LDEM_4'}</div>
          <div>Mode: {settings.lightweightMode ? 'Lightweight Render' : 'Full Resolution'}</div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div className="w-72 bg-[#0B081D] border-r border-indigo-900/70 flex flex-col h-full">
            <div className="px-4 py-3 border-b border-indigo-900/70 flex items-center justify-between">
              <span className="font-display font-bold text-sm text-white">ARC LUNA — LUNASIGHT</span>
              <button onClick={() => setMobileMenuOpen(false)} className="p-1.5 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            {onOpenCover && (
              <div className="px-3 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onOpenCover();
                  }}
                  className="w-full px-3 py-2 rounded bg-[#141033] border border-indigo-800/70 text-xs font-medium text-amber-300 flex items-center justify-between"
                >
                  <span>Mission Cover &amp; Overview</span>
                  <Sparkles className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <nav className="flex-1 overflow-y-auto p-3 space-y-4">
              {NAV_GROUPS.map((group) => (
                <div key={group.label} className="space-y-1">
                  <div className="px-2 text-[11px] text-indigo-300/60">{group.label}</div>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = activePage === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          setActivePage(item.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded text-xs ${
                          active
                            ? 'bg-amber-500/20 text-amber-300 font-semibold'
                            : 'text-slate-300 hover:bg-[#141033]'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>
          </div>
          <div className="flex-1 bg-black/60" onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Telemetry Bar */}
        <header className="h-14 shrink-0 bg-[#0B081D]/95 border-b border-indigo-900/60 px-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 text-slate-300 hover:text-white rounded border border-indigo-800/70"
              aria-label="Open navigation menu"
            >
              <Menu className="w-4 h-4" />
            </button>
            <h1 className="font-display text-sm sm:text-base font-bold text-white truncate">
              {activeNavLabel}
            </h1>
            {loadingAnalysis && (
              <span className="text-xs font-mono text-amber-300 whitespace-nowrap shrink-0">
                Loading LOLA DEM...
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {/* Active Coordinate Selector */}
            <button
              onClick={() => setCoordModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#141033] hover:bg-[#1b1645] border border-indigo-800/70 text-xs transition-colors whitespace-nowrap shrink-0"
            >
              <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="hidden sm:inline text-slate-200 max-w-[160px] truncate">
                {selectedCoord.name || 'Custom Target'}
              </span>
              <span className="font-mono text-teal-300 tabular-nums">
                {formatCoordPair(selectedCoord, settings.coordinateFormat)}
              </span>
            </button>

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen((v) => !v)}
                className="p-2 rounded-md bg-[#141033] hover:bg-[#1b1645] border border-indigo-800/70 text-slate-200 relative"
                aria-label="Mission notifications"
              >
                <Bell className="w-4 h-4" />
                {notifications.length > 0 && (
                  <span className="absolute -top-1 -right-1 text-[10px] font-mono bg-amber-500 text-slate-950 font-bold px-1 rounded">
                    {notifications.length}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-[#0E0A24] border border-indigo-800/70 rounded-md shadow-xl z-40 overflow-hidden">
                  <div className="px-3 py-2 border-b border-indigo-900/60 flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-200">Mission Log</span>
                    <button
                      onClick={clearNotifications}
                      className="text-slate-400 hover:text-slate-200"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="max-h-64 overflow-y-auto divide-y divide-indigo-950">
                    {notifications.length === 0 ? (
                      <div className="p-3 text-xs text-slate-500">No events logged yet.</div>
                    ) : (
                      notifications.map((n) => (
                        <div key={n.id} className="p-2.5 text-xs space-y-0.5">
                          <div className="font-mono text-[10px] text-slate-500">{n.time}</div>
                          <div className="text-slate-200">{n.message}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Animate Photo / 3D Video Studio */}
            <button
              onClick={() => setVideoModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[#141033] hover:bg-[#1b1645] border border-indigo-800/70 text-amber-300 transition-colors whitespace-nowrap shrink-0"
            >
              <Film className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Animate Video</span>
            </button>

            {/* Contextual LUNA AI Drawer Button */}
            <button
              onClick={() => setAiDrawerOpen(!aiDrawerOpen)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                aiDrawerOpen
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-semibold'
                  : 'bg-[#141033] hover:bg-[#1b1645] border border-indigo-800/70 text-teal-300'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>LUNA AI</span>
            </button>
          </div>
        </header>

        {/* Page Body */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>

      {/* Contextual LUNA AI Slide-Over Drawer */}
      {aiDrawerOpen && activePage !== 'assistant' && (
        <aside className="fixed inset-y-0 right-0 z-40 w-full max-w-md bg-[#070514] border-l border-indigo-900/70 p-3 flex flex-col shadow-2xl">
          <div className="flex justify-end mb-2">
            <button
              onClick={() => setAiDrawerOpen(false)}
              className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 rounded flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              Close Drawer
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <LunaAiPanel compact />
          </div>
        </aside>
      )}

      <CoordinateModal />
      <VideoAnimatorModal />
    </div>
  );
};
