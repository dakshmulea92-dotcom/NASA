import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type {
  AppSettings,
  IlluminationAnalysis,
  LandingSiteAssessment,
  LunarCoordinate,
  MissionPlan,
  PageId,
  SuitabilityWeights,
} from '../types/lunar.ts';
import { DEFAULT_SUITABILITY_WEIGHTS, PRESET_LUNAR_SITES } from '../data/lunarCatalog.ts';

export interface AppNotification {
  id: string;
  time: string;
  level: 'info' | 'warning' | 'error';
  message: string;
}

interface LunarContextValue {
  activePage: PageId;
  setActivePage: (p: PageId) => void;
  selectedCoord: LunarCoordinate;
  setSelectedCoord: (coord: LunarCoordinate) => void;
  analysisRadiusKm: number;
  setAnalysisRadiusKm: (r: number) => void;
  analysisDateUtc: string;
  setAnalysisDateUtc: (iso: string) => void;
  assessment: LandingSiteAssessment | null;
  illumination: IlluminationAnalysis | null;
  loadingAnalysis: boolean;
  loadingIllumination: boolean;
  analysisError: string | null;
  refreshAnalysis: () => void;
  savedLocations: LunarCoordinate[];
  saveCurrentLocation: (label?: string) => Promise<void>;
  removeSavedLocation: (index: number) => Promise<void>;
  missions: MissionPlan[];
  saveMissionPlan: (plan: MissionPlan) => Promise<void>;
  removeMissionPlan: (id: string) => Promise<void>;
  settings: AppSettings;
  updateSettings: (patch: Partial<AppSettings>) => void;
  updateWeights: (patch: Partial<SuitabilityWeights>) => void;
  notifications: AppNotification[];
  pushNotification: (level: AppNotification['level'], message: string) => void;
  clearNotifications: () => void;
  coordModalOpen: boolean;
  setCoordModalOpen: (open: boolean) => void;
  aiDrawerOpen: boolean;
  setAiDrawerOpen: (open: boolean) => void;
  videoModalOpen: boolean;
  setVideoModalOpen: (open: boolean) => void;
  capturedSnapshot: string | null;
  setCapturedSnapshot: (dataUrl: string | null) => void;
}

const SETTINGS_STORAGE_KEY = 'arc_luna_settings_v1';

const defaultSettings: AppSettings = {
  lightweightMode: false,
  coordinateFormat: 'signed',
  unitSystem: 'metric',
  suitabilityWeights: DEFAULT_SUITABILITY_WEIGHTS,
};

function loadInitialSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      ...defaultSettings,
      ...parsed,
      suitabilityWeights: {
        ...DEFAULT_SUITABILITY_WEIGHTS,
        ...(parsed.suitabilityWeights ?? {}),
      },
    };
  } catch {
    return defaultSettings;
  }
}

const LunarContext = createContext<LunarContextValue | null>(null);

export const LunarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activePage, setActivePage] = useState<PageId>('command-center');
  const [selectedCoord, setSelectedCoordState] = useState<LunarCoordinate>({
    lat: PRESET_LUNAR_SITES[0].lat,
    lon: PRESET_LUNAR_SITES[0].lon,
    name: PRESET_LUNAR_SITES[0].name,
    regionType: PRESET_LUNAR_SITES[0].regionType,
    source: PRESET_LUNAR_SITES[0].source,
  });
  const [analysisRadiusKm, setAnalysisRadiusKm] = useState<number>(20);
  const [analysisDateUtc, setAnalysisDateUtc] = useState<string>(() => new Date().toISOString());

  const [assessment, setAssessment] = useState<LandingSiteAssessment | null>(null);
  const [illumination, setIllumination] = useState<IlluminationAnalysis | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState<boolean>(false);
  const [loadingIllumination, setLoadingIllumination] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const [savedLocations, setSavedLocations] = useState<LunarCoordinate[]>([]);
  const [missions, setMissions] = useState<MissionPlan[]>([]);
  const [settings, setSettings] = useState<AppSettings>(loadInitialSettings);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [coordModalOpen, setCoordModalOpen] = useState<boolean>(false);
  const [aiDrawerOpen, setAiDrawerOpen] = useState<boolean>(false);
  const [videoModalOpen, setVideoModalOpen] = useState<boolean>(false);
  const [capturedSnapshot, setCapturedSnapshot] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const abortRef = useRef<AbortController | null>(null);

  const pushNotification = useCallback((level: AppNotification['level'], message: string) => {
    setNotifications((prev) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        time: new Date().toISOString().slice(11, 19) + ' UTC',
        level,
        message,
      },
      ...prev.slice(0, 19),
    ]);
  }, []);

  const clearNotifications = useCallback(() => setNotifications([]), []);

  const setSelectedCoord = useCallback(
    (coord: LunarCoordinate) => {
      setSelectedCoordState(coord);
      pushNotification(
        'info',
        `Target updated: ${coord.name || 'Custom Coordinate'} (${coord.lat.toFixed(3)}°, ${coord.lon.toFixed(3)}°)`
      );
    },
    [pushNotification]
  );

  // Load persisted missions & saved locations on startup
  useEffect(() => {
    fetch('/api/missions')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.missions)) setMissions(d.missions);
      })
      .catch(() => {});

    fetch('/api/locations')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.locations)) setSavedLocations(d.locations);
      })
      .catch(() => {});
  }, []);

  // Synchronized NASA LOLA terrain + DE421 illumination refresh
  useEffect(() => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoadingAnalysis(true);
    setLoadingIllumination(true);
    setAnalysisError(null);

    const payload = {
      coordinate: selectedCoord,
      radiusKm: analysisRadiusKm,
      weights: settings.suitabilityWeights,
      fastMode: settings.lightweightMode,
    };

    fetch('/api/lunar/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Analysis HTTP ${res.status}`);
        return (await res.json()) as LandingSiteAssessment;
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setAssessment(data);
          setLoadingAnalysis(false);
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setAnalysisError(err instanceof Error ? err.message : 'LOLA terrain query failed.');
          setLoadingAnalysis(false);
        }
      });

    fetch('/api/lunar/illumination', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        coordinate: selectedCoord,
        dateUtc: analysisDateUtc,
        periodHours: 720,
        fastMode: settings.lightweightMode,
      }),
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Illumination HTTP ${res.status}`);
        return (await res.json()) as { illumination: IlluminationAnalysis };
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          setIllumination(data.illumination);
          setLoadingIllumination(false);
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setLoadingIllumination(false);
        }
      });

    return () => controller.abort();
  }, [
    selectedCoord,
    analysisRadiusKm,
    analysisDateUtc,
    settings.lightweightMode,
    settings.suitabilityWeights,
    refreshTick,
  ]);

  const refreshAnalysis = useCallback(() => setRefreshTick((t) => t + 1), []);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const updateWeights = useCallback((patch: Partial<SuitabilityWeights>) => {
    setSettings((prev) => {
      const next: AppSettings = {
        ...prev,
        suitabilityWeights: { ...prev.suitabilityWeights, ...patch },
      };
      try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const saveCurrentLocation = useCallback(
    async (label?: string) => {
      const entry: LunarCoordinate = {
        ...selectedCoord,
        name: label?.trim() || selectedCoord.name || `Site (${selectedCoord.lat.toFixed(2)}°, ${selectedCoord.lon.toFixed(2)}°)`,
        source: selectedCoord.source || 'User Selection / NASA LOLA',
      };
      const updated = [
        entry,
        ...savedLocations.filter(
          (l) => Math.abs(l.lat - entry.lat) > 0.001 || Math.abs(l.lon - entry.lon) > 0.001
        ),
      ];
      setSavedLocations(updated);
      await fetch('/api/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations: updated }),
      });
      pushNotification('info', `Saved coordinate: ${entry.name}`);
    },
    [selectedCoord, savedLocations, pushNotification]
  );

  const removeSavedLocation = useCallback(async (index: number) => {
    const updated = savedLocations.filter((_, idx) => idx !== index);
    setSavedLocations(updated);
    await fetch('/api/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations: updated }),
    });
  }, [savedLocations]);

  const saveMissionPlan = useCallback(
    async (plan: MissionPlan) => {
      const res = await fetch('/api/missions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plan),
      });
      const data = (await res.json()) as { missions: MissionPlan[] };
      if (Array.isArray(data.missions)) setMissions(data.missions);
      pushNotification('info', `Mission saved: ${plan.name}`);
    },
    [pushNotification]
  );

  const removeMissionPlan = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/missions/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = (await res.json()) as { missions: MissionPlan[] };
      if (Array.isArray(data.missions)) setMissions(data.missions);
      pushNotification('info', 'Mission removed from archive.');
    },
    [pushNotification]
  );

  return (
    <LunarContext.Provider
      value={{
        activePage,
        setActivePage,
        selectedCoord,
        setSelectedCoord,
        analysisRadiusKm,
        setAnalysisRadiusKm,
        analysisDateUtc,
        setAnalysisDateUtc,
        assessment,
        illumination,
        loadingAnalysis,
        loadingIllumination,
        analysisError,
        refreshAnalysis,
        savedLocations,
        saveCurrentLocation,
        removeSavedLocation,
        missions,
        saveMissionPlan,
        removeMissionPlan,
        settings,
        updateSettings,
        updateWeights,
        notifications,
        pushNotification,
        clearNotifications,
        coordModalOpen,
        setCoordModalOpen,
        aiDrawerOpen,
        setAiDrawerOpen,
        videoModalOpen,
        setVideoModalOpen,
        capturedSnapshot,
        setCapturedSnapshot,
      }}
    >
      {children}
    </LunarContext.Provider>
  );
};

export function useLunar(): LunarContextValue {
  const ctx = useContext(LunarContext);
  if (!ctx) throw new Error('useLunar must be used inside LunarProvider');
  return ctx;
}
