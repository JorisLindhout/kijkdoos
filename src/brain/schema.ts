export const ACTIONS = [
  "idle",
  "still",
  "fidget",
  "walk_to",
  "sit",
  "stand",
  "wave",
  "glare",
  "look_at_user",
  "emote",
  "push_chair",
  "move_chair",
  "light_on",
  "light_off",
] as const;

export type Mood = "shy" | "angry" | "happy" | "calm";

export type VisitSummary = {
  visitCount: number;
  shortStreak: number;
  longInLastFive: number;
  neverSatLast10: boolean;
  pokeRateLast10: number;
  darkHabit: boolean;
  lastDurationsMs: number[];
};

export type ActionName = (typeof ACTIONS)[number];

export type CatalogObject = {
  id: string;
  kind: string;
  affordances: string[];
  pos: [number, number, number];
  yaw?: number;
  seatHeight?: number;
};

export type Snapshot = {
  sceneVersion: number;
  objects: CatalogObject[];
  character: {
    pose: string;
    mood?: string;
    energy?: number;
    pos: [number, number, number];
  };
  lastActions: string[];
  user: {
    stareSeconds?: number;
    poked?: boolean;
  };
  mood?: Mood;
  visitCount?: number;
  lightOn?: boolean;
  visitSummary?: VisitSummary;
  failedActions?: string[];
  trappedChair?: boolean;
  badChairPoses?: { u: number; v: number; yaw: number }[];
};

export type Plan = {
  action: ActionName;
  target?: string;
  mood?: string;
  say?: string;
};

export function isActionName(value: string): value is ActionName {
  return (ACTIONS as readonly string[]).includes(value);
}
