import fs from 'fs';
import path from 'path';
import type { LunarCoordinate, MissionPlan } from '../src/types/lunar.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const MISSIONS_FILE = path.join(DATA_DIR, 'missions.json');
const LOCATIONS_FILE = path.join(DATA_DIR, 'saved_locations.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function loadMissions(): MissionPlan[] {
  ensureDataDir();
  if (!fs.existsSync(MISSIONS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(MISSIONS_FILE, 'utf-8')) as MissionPlan[];
  } catch {
    return [];
  }
}

export function saveMission(plan: MissionPlan): MissionPlan[] {
  ensureDataDir();
  const list = loadMissions();
  const idx = list.findIndex((m) => m.id === plan.id);
  if (idx >= 0) list[idx] = plan;
  else list.unshift(plan);
  fs.writeFileSync(MISSIONS_FILE, JSON.stringify(list, null, 2));
  return list;
}

export function deleteMission(id: string): MissionPlan[] {
  ensureDataDir();
  const list = loadMissions().filter((m) => m.id !== id);
  fs.writeFileSync(MISSIONS_FILE, JSON.stringify(list, null, 2));
  return list;
}

export function loadSavedLocations(): LunarCoordinate[] {
  ensureDataDir();
  if (!fs.existsSync(LOCATIONS_FILE)) {
    return [
      {
        lat: -89.68,
        lon: 129.2,
        name: 'Shackleton Rim (Artemis Focus)',
        regionType: 'Polar Highland Ridge',
        source: 'NASA LRO LOLA',
      },
      {
        lat: 0.67408,
        lon: 23.47297,
        name: 'Apollo 11 — Tranquility Base',
        regionType: 'Basaltic Mare Plain',
        source: 'NASA Apollo Archive',
      },
    ];
  }
  try {
    return JSON.parse(fs.readFileSync(LOCATIONS_FILE, 'utf-8')) as LunarCoordinate[];
  } catch {
    return [];
  }
}

export function saveLocationList(list: LunarCoordinate[]): LunarCoordinate[] {
  ensureDataDir();
  fs.writeFileSync(LOCATIONS_FILE, JSON.stringify(list, null, 2));
  return list;
}
