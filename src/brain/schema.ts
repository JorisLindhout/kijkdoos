/** Verbs the body can do without a scene object. */
export const SELF_ACTIONS = [
  "idle",
  "still",
  "fidget",
  "walk_to",
  "stand",
  "wave",
  "glare",
  "look_at_user",
  "emote",
] as const;

/** Verbs objects advertise. Plan.target must be the object that offers them. */
export const OBJECT_VERBS = ["sit", "push", "move", "kick", "light_on", "light_off"] as const;

export const ACTIONS = [...SELF_ACTIONS, ...OBJECT_VERBS] as const;

export type Mood = "shy" | "angry" | "happy" | "calm";

/** Consecutive visits under 30s needed for peak anger (far-away kick). */
export const PEAK_SHORT_STREAK = 2;
/** Failed moves this visit that also count as peak anger. */
export const PEAK_FAIL_COUNT = 3;

export function isPeakAngerState(
  mood: string | undefined,
  shortStreak: number,
  failCount: number,
) {
  return failCount >= PEAK_FAIL_COUNT || (mood === "angry" && shortStreak >= PEAK_SHORT_STREAK);
}

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

/** One issued plan. Target is only for object verbs. */
export type PlanTrace = {
  action: ActionName;
  target?: string;
};

export type Snapshot = {
  sceneVersion: number;
  objects: CatalogObject[];
  character: {
    pose: string;
    seated?: boolean;
    mood?: string;
    energy?: number;
    pos: [number, number, number];
  };
  lastActions: PlanTrace[];
  user: {
    stareSeconds?: number;
    poked?: boolean;
  };
  mood?: Mood;
  visitCount?: number;
  lightOn?: boolean;
  visitSummary?: VisitSummary;
  failedActions?: PlanTrace[];
  trappedChair?: boolean;
  backBlocked?: boolean;
  chairInReach?: boolean;
  failCount?: number;
  badChairPoses?: { u: number; v: number; yaw: number }[];
};

export type Plan = {
  action: ActionName;
  target?: string;
  mood?: string;
  say?: string;
};

export function planTrace(action: ActionName, target?: string): PlanTrace {
  return target ? { action, target } : { action };
}

export function isActionName(value: string): value is ActionName {
  return (ACTIONS as readonly string[]).includes(value);
}

export function isSelfAction(value: string): boolean {
  return (SELF_ACTIONS as readonly string[]).includes(value);
}

export function isObjectVerb(value: string): boolean {
  return (OBJECT_VERBS as readonly string[]).includes(value);
}

/** Physical verbs the chair offers right now. Personality does not belong here. */
export function chairAffordances(facts: {
  seated: boolean;
  near: boolean;
  trapped: boolean;
  backBlocked: boolean;
  peakAnger: boolean;
}): string[] {
  if (facts.seated) return [];
  const verbs: string[] = ["sit"];
  if ((facts.trapped || facts.backBlocked) && facts.near) verbs.push("kick");
  else {
    verbs.push("push", "move");
  }
  if (facts.peakAnger && !verbs.includes("kick")) verbs.push("kick");
  return verbs;
}

export function lampAffordances(lightOn: boolean): string[] {
  return lightOn ? ["light_off"] : ["light_on"];
}

export function offerings(
  objects: CatalogObject[],
  verb: string,
  target?: string,
): CatalogObject[] {
  return objects.filter(
    (object) => (!target || object.id === target) && object.affordances.includes(verb),
  );
}

/** Unique match, or the named target. Does not guess among several objects. */
export function offering(
  objects: CatalogObject[],
  verb: string,
  target?: string,
): CatalogObject | undefined {
  const matches = offerings(objects, verb, target);
  if (target) return matches[0];
  return matches.length === 1 ? matches[0] : undefined;
}

export function normalizePlan(raw: { action: string; target?: string }): Plan | null {
  if (!isActionName(raw.action)) return null;
  if (isObjectVerb(raw.action)) {
    return { action: raw.action, target: raw.target };
  }
  return { action: raw.action };
}

export function withObjectTarget(plan: Plan, objects: CatalogObject[]): Plan {
  if (!isObjectVerb(plan.action) || plan.target) return plan;
  const object = offering(objects, plan.action);
  return object ? { ...plan, target: object.id } : plan;
}

export function isAdvertisedPlan(plan: Plan, snapshot: Snapshot): boolean {
  if (plan.action === "stand") return !!snapshot.character.seated;
  if (isSelfAction(plan.action)) return !plan.target;
  if (!plan.target) return false;
  return !!offering(snapshot.objects, plan.action, plan.target);
}

export function tracesOf(entries: Array<PlanTrace | string> | undefined): PlanTrace[] {
  if (!entries) return [];
  return entries.map((entry) => {
    if (typeof entry !== "string") return entry;
    const cut = entry.indexOf(":");
    if (cut <= 0 || !isActionName(entry.slice(0, cut))) {
      return { action: (isActionName(entry) ? entry : "idle") as ActionName };
    }
    return { action: entry.slice(0, cut) as ActionName, target: entry.slice(cut + 1) };
  });
}

export function recentPlan(
  entries: Array<PlanTrace | string> | undefined,
  action: string,
  target?: string,
  window = 5,
) {
  return tracesOf(entries)
    .slice(-window)
    .some((entry) => entry.action === action && (!target || entry.target === target));
}

export function failedPlan(
  entries: Array<PlanTrace | string> | undefined,
  action: string,
  target?: string,
) {
  return tracesOf(entries).some(
    (entry) => entry.action === action && (!entry.target || !target || entry.target === target),
  );
}
