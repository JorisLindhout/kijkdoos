import type { Mood, VisitSummary } from "./brain/schema";
import {
  defaultChairUV,
  getBadChair,
  getChairUV,
  getLightOn,
  hydrateFurniture,
  type ChairUV,
} from "./scene/furniture";
import { type ShoeboxMetrics } from "./scene/shoebox";

const KEY = "kijkdoos.visit.v1";
const LOG_CAP = 40;
const SHORT_MS = 30_000;
const LONG_MS = 120_000;

export type { Mood, VisitSummary };

export type VisitRow = {
  endedAt: number;
  durationMs: number;
  poked: boolean;
  maxStareS: number;
  sat: boolean;
  lightOn: boolean;
  mood: Mood;
};

type Save = {
  chair: ChairUV;
  lightOn: boolean;
  log: VisitRow[];
  badChair: ChairUV[];
};

export type LiveVisit = {
  startedAt: number;
  mood: Mood;
  poked: boolean;
  maxStareS: number;
  sat: boolean;
};

let live: LiveVisit | null = null;

function emptySave(metrics?: ShoeboxMetrics): Save {
  return {
    chair: metrics ? defaultChairUV(metrics) : { u: 0.82, v: 0.78, yaw: (-60 * Math.PI) / 180 },
    lightOn: true,
    log: [],
    badChair: [],
  };
}

function loadSave(metrics?: ShoeboxMetrics): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptySave(metrics);
    const parsed = JSON.parse(raw) as Partial<Save>;
    return {
      chair: parsed.chair ?? emptySave(metrics).chair,
      lightOn: parsed.lightOn ?? true,
      log: Array.isArray(parsed.log) ? parsed.log.slice(-LOG_CAP) : [],
      badChair: Array.isArray(parsed.badChair) ? parsed.badChair.slice(-LOG_CAP) : [],
    };
  } catch {
    return emptySave(metrics);
  }
}

function writeSave(save: Save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* quota */
  }
}

export function moodFromLog(log: VisitRow[]): Mood {
  if (log.length === 0) return "shy";
  const last = log[log.length - 1];
  const lastFive = log.slice(-5);
  if (last.durationMs < SHORT_MS) return "angry";
  if (lastFive.filter((row) => row.durationMs >= LONG_MS).length >= 3) return "happy";
  if (last.durationMs >= LONG_MS) return "happy";
  return "calm";
}

export function summarizeLog(log: VisitRow[]): VisitSummary {
  const last10 = log.slice(-10);
  const last5 = log.slice(-5);
  let shortStreak = 0;
  for (let i = log.length - 1; i >= 0; i -= 1) {
    if (log[i].durationMs < SHORT_MS) shortStreak += 1;
    else break;
  }
  return {
    visitCount: log.length,
    shortStreak,
    longInLastFive: last5.filter((row) => row.durationMs >= LONG_MS).length,
    neverSatLast10: last10.length > 0 && last10.every((row) => !row.sat),
    pokeRateLast10: last10.filter((row) => row.poked).length,
    darkHabit: last5.filter((row) => !row.lightOn).length >= 3,
    lastDurationsMs: log.slice(-5).map((row) => row.durationMs),
  };
}

export function hydrateVisit(metrics: ShoeboxMetrics): { mood: Mood; summary: VisitSummary } {
  if (live) return { mood: live.mood, summary: summarizeLog(loadSave(metrics).log) };
  const save = loadSave(metrics);
  hydrateFurniture(
    { chair: save.chair, lightOn: save.lightOn, badChair: save.badChair },
    metrics,
  );
  const mood = moodFromLog(save.log);
  live = {
    startedAt: Date.now(),
    mood,
    poked: false,
    maxStareS: 0,
    sat: false,
  };
  return { mood, summary: summarizeLog(save.log) };
}

export function noteVisitPoke() {
  if (live) live.poked = true;
}

export function noteVisitSit() {
  if (live) live.sat = true;
}

export function noteVisitStare(seconds: number) {
  if (live) live.maxStareS = Math.max(live.maxStareS, seconds);
}

export function getLiveMood(): Mood {
  return live?.mood ?? "shy";
}

export function getVisitSummary(): VisitSummary {
  return summarizeLog(loadSave().log);
}

export function endVisit() {
  if (!live) return;
  const durationMs = Math.max(0, Date.now() - live.startedAt);
  const save = loadSave();
  save.chair = getChairUV();
  save.lightOn = getLightOn();
  save.badChair = getBadChair();
  save.log.push({
    endedAt: Date.now(),
    durationMs,
    poked: live.poked,
    maxStareS: live.maxStareS,
    sat: live.sat,
    lightOn: save.lightOn,
    mood: live.mood,
  });
  save.log = save.log.slice(-LOG_CAP);
  writeSave(save);
  live = null;
}

export function persistFurnitureNow() {
  const save = loadSave();
  save.chair = getChairUV();
  save.lightOn = getLightOn();
  save.badChair = getBadChair();
  writeSave(save);
}
