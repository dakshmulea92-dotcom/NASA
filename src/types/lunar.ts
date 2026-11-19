export type PageId =
  | 'command-center'
  | 'lunar-explorer'
  | 'landing-site'
  | 'terrain'
  | 'environment'
  | 'illumination'
  | 'earth-explorer'
  | 'mission-planner'
  | 'simulator'
  | 'rover'
  | 'assistant'
  | 'data-center'
  | 'settings';

export interface LunarCoordinate {
  lat: number; // -90 to +90 degrees
  lon: number; // -180 to +180 degrees (East positive)
  name?: string;
  regionType?: string;
  source?: string;
}

export interface DatasetMetadata {
  id: string;
  source: string;
  datasetId: string;
  name: string;
  description: string;
  spatialResolution: string;
  units: string;
  observationPeriod: string;
  crs: string;
  sourceUrl: string;
  methodology: string;
  fileSize: string;
  status: 'cached' | 'available' | 'partial' | 'unavailable';
  processingStatus: 'ready' | 'on-demand' | 'idle';
  localPath?: string;
}

export interface DemGridResult {
  centerLat: number;
  centerLon: number;
  radiusKm: number;
  gridSize: number; // N x N
  cellSizeMeters: number;
  projection: 'SIMPLE CYLINDRICAL' | 'POLAR STEREOGRAPHIC';
  elevationsMeters: number[][]; // N x N relative to 1737.4 km
  slopesDeg: number[][]; // N x N computed via Horn's 3x3 method
  minElevationM: number;
  maxElevationM: number;
  meanElevationM: number;
  elevationRangeM: number;
  meanSlopeDeg: number;
  maxSlopeDeg: number;
  p95SlopeDeg: number;
  rmsRoughnessM: number;
  triMeters: number; // Terrain Ruggedness Index
  detectedCraters: DetectedCrater[];
  coveragePercent: number;
  uncertaintyMeters: number;
  datasetUsed: DatasetMetadata;
  methodologyNotes: string[];
  dataAvailable: boolean;
  unavailableReason?: string;
}

export interface DetectedCrater {
  name: string;
  lat: number;
  lon: number;
  diameterKm: number;
  measuredDepthM: number | null;
  distanceFromTargetKm: number;
  origin: 'NASA/IAU Gazetteer + LOLA DEM' | 'DEM Depression Detection';
  depthNote: string;
}

export interface HorizonBin {
  azimuthDeg: number;
  horizonAngleDeg: number;
  ridgeDistanceKm: number;
  ridgeElevationM: number;
  obstructed: boolean;
}

export interface HorizonAnalysis {
  targetLat: number;
  targetLon: number;
  targetElevationM: number;
  maxHorizonAngleDeg: number;
  minHorizonAngleDeg: number;
  meanHorizonAngleDeg: number;
  skyVisibilityFactor: number; // 0 to 1
  obstructedDirections: string[];
  bins: HorizonBin[];
  datasetId: string;
  methodology: string;
}

export interface SuitabilityWeights {
  slope: number;
  roughness: number;
  craterClearance: number;
  elevationStability: number;
  dataCoverage: number;
}

export interface LandingSiteAssessment {
  coordinate: LunarCoordinate;
  dem: DemGridResult;
  horizon: HorizonAnalysis;
  scores: {
    elevationScore: number;
    slopeScore: number;
    roughnessScore: number;
    craterSafetyScore: number;
    dataConfidenceScore: number;
    overallScore: number;
  };
  classification: 'SUITABLE' | 'CONDITIONAL' | 'UNSUITABLE' | 'INSUFFICIENT DATA';
  rejectionReasons: string[];
  scientificReasoning: string[];
  uncertaintyIndicators: string[];
  weightsUsed: SuitabilityWeights;
}

export interface SolarEphemerisPoint {
  utcIso: string;
  subSolarLatDeg: number;
  subSolarLonDeg: number;
  solarElevationDeg: number;
  solarAzimuthDeg: number;
  solarIncidenceDeg: number;
  terrainHorizonAngleDeg: number;
  isDirectSunlight: boolean;
  shadowStatus: 'DIRECT SUNLIGHT' | 'TERRAIN SHADOWED' | 'LUNAR NIGHT';
  earthSunDistanceAu: number;
}

export interface IlluminationAnalysis {
  coordinate: LunarCoordinate;
  requestedUtc: string;
  periodHours: number;
  current: SolarEphemerisPoint;
  timeline: SolarEphemerisPoint[];
  sunlitHoursInPeriod: number;
  sunlitPercentage: number;
  nextSunriseUtc: string | null;
  nextSunsetUtc: string | null;
  peakSunlightUtc: string | null;
  peakSolarElevationDeg: number;
  isLikelyPsr: boolean;
  methodology: string;
  source: string;
}

export interface LaunchFacility {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  operator: string;
  isNasaFacility: boolean;
  timezone: string;
  cityLabel: string;
  elevationM: number;
  officialSource: string;
  sourceUrl: string;
  description: string;
  supportedAzimuths: string;
}

export interface NasaPowerWeather {
  facilityId: string;
  available: boolean;
  unavailableReason?: string;
  source: string;
  datasetId: string;
  sourceUrl: string;
  observationWindow: string;
  isHistoricalClimatology: true;
  limitationNotice: string;
  latestDate: string | null;
  metrics: {
    tempC: number | null;
    tempMaxC: number | null;
    tempMinC: number | null;
    windSpeed10mMs: number | null;
    windSpeed50mMs: number | null;
    precipitationMmDay: number | null;
    solarIrradianceKwhM2: number | null;
    clearSkyIrradianceKwhM2: number | null;
    relHumidityPct: number | null;
    surfacePressureKpa: number | null;
  };
  dailySeries: Array<{
    date: string;
    tempC: number | null;
    windMs: number | null;
    wind50mMs: number | null;
    precipMm: number | null;
    irradiance: number | null;
    clearSkyIrradiance: number | null;
  }>;
}

export interface NasaEonetEvent {
  id: string;
  title: string;
  category: string;
  dateUtc: string;
  lat: number;
  lon: number;
  link: string;
  magnitudeValue?: number | null;
  magnitudeUnit?: string | null;
}

export interface NasaEonetResponse {
  available: boolean;
  source: string;
  datasetId: string;
  sourceUrl: string;
  fetchedUtc: string;
  events: NasaEonetEvent[];
  unavailableReason?: string;
}

export interface NasaDonkiEvent {
  id: string;
  type: 'SEP' | 'FLR';
  beginTimeUtc: string;
  peakTimeUtc?: string | null;
  classType?: string | null;
  instruments: string[];
  link: string;
}

export interface NasaDonkiSummary {
  available: boolean;
  source: string;
  datasetId: string;
  sourceUrl: string;
  observationWindow: string;
  events: NasaDonkiEvent[];
  unavailableReason?: string;
}

export interface MissionPlan {
  id: string;
  createdAt: string;
  name: string;
  missionType: 'Robotic Lander' | 'Crewed Artemis-Class' | 'Rover Traverse' | 'Polar Prospecting';
  launchFacilityId: string;
  targetCoordinate: LunarCoordinate;
  landingDateUtc: string;
  durationDays: number;
  spacecraftConfig: 'Lightweight Lander (1,500 kg)' | 'Medium Cargo Lander (4,500 kg)' | 'Human Landing System Class';
  deployRover: boolean;
  minSunlitPctRequired: number;
  objectives: string;
  calculations: {
    earthMoonMeanDistanceKm: number;
    assumedTransitHours: number;
    deltaVLeoToTliMs: number;
    deltaVLoiMs: number;
    deltaVDescentMs: number;
    totalDeltaVMs: number;
    lunarSurfaceGravityMs2: number;
    formulasAndAssumptions: string[];
  };
  assessmentSummary?: {
    overallScore: number;
    classification: string;
    meanSlopeDeg: number;
    maxSlopeDeg: number;
    elevationM: number;
    sunlitPercentage: number;
  };
  uncertainties: string[];
  sources: string[];
}

export interface AppSettings {
  lightweightMode: boolean;
  coordinateFormat: 'signed' | 'east360';
  unitSystem: 'metric';
  suitabilityWeights: SuitabilityWeights;
}
