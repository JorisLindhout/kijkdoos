import type { Plan, Snapshot } from "./schema";

const REARRANGE = new Set(["push_chair", "move_chair", "kick_chair"]);
const LAMP = new Set(["light_on", "light_off"]);

export function dummyThink(snapshot: Snapshot): Plan {
  const pose = snapshot.character.pose;
  const last = snapshot.lastActions;
  const failed = new Set(snapshot.failedActions ?? []);
  const recent = (action: string) => last.slice(-5).includes(action);
  const skipped = (action: string) => failed.has(action);
  const chair = snapshot.objects.find((o) => o.affordances.includes("sit"));
  const stare = snapshot.user.stareSeconds ?? 0;
  const mood = snapshot.mood ?? snapshot.character.mood ?? "calm";
  const summary = snapshot.visitSummary;
  const lightOn = snapshot.lightOn ?? true;
  const standing = pose !== "sit";
  const shy = mood === "shy";
  const angry = mood === "angry";
  const happy = mood === "happy";
  const angryStreak = (summary?.shortStreak ?? 0) >= 3;
  const failCount = snapshot.failCount ?? 0;
  const peakAnger = (angry && angryStreak) || failCount >= 5;
  const darkHabit = summary?.darkHabit ?? false;
  const neverSat = summary?.neverSatLast10 ?? false;
  const pokedOften = (summary?.pokeRateLast10 ?? 0) >= 3;
  const rearranged = last
    .slice(-6)
    .some((action) => REARRANGE.has(action) && !failed.has(action));
  const lampRecent = last.slice(-4).some((action) => LAMP.has(action) && !failed.has(action));

  if (snapshot.user.poked) {
    return { action: "glare" };
  }

  if (standing && (snapshot.trappedChair || snapshot.backBlocked)) {
    if (!skipped("kick_chair")) return { action: "kick_chair" };
    if (!skipped("push_chair")) return { action: "push_chair" };
    return { action: "still" };
  }

  if (standing && peakAnger && !skipped("kick_chair") && !recent("kick_chair") && Math.random() < 0.04) {
    return { action: "kick_chair" };
  }

  if (standing && !lampRecent) {
    const lamp = lampPlan({ lightOn, angry, happy, angryStreak, darkHabit });
    if (lamp && !skipped(lamp.action)) return lamp;
  }

  if (standing && !rearranged && !shy && Math.random() < 0.02) {
    const canPush = !skipped("push_chair");
    const canMove = !skipped("move_chair");
    if (canPush && canMove) return { action: Math.random() < 0.5 ? "push_chair" : "move_chair" };
    if (canPush) return { action: "push_chair" };
    if (canMove) return { action: "move_chair" };
  }

  if (pose === "sit") {
    if (!recent("stand") && Math.random() < (angry ? 0.04 : 0.08)) return { action: "stand" };
    const pick = Math.random();
    const stillCut = angry || angryStreak ? 0.72 : 0.65;
    if (pick < stillCut) return { action: "still" };
    if (pick < stillCut + 0.12) return { action: "fidget" };
    if (pick < stillCut + 0.22) return { action: "look_at_user" };
    return { action: "idle" };
  }

  const sitChance = neverSat ? 0.03 : shy ? 0.06 : 0.1;
  if (chair && pose !== "sit" && !recent("sit") && Math.random() < sitChance) {
    return { action: "sit", target: chair.id };
  }

  const lookChance = neverSat ? 0.32 : stare >= 10 && !recent("look_at_user") ? 0.2 : 0.08;
  if (!recent("look_at_user") && Math.random() < lookChance) {
    return { action: "look_at_user" };
  }

  if (pose === "idle" || pose === "still" || pose === "look") {
    const pick = Math.random();
    const glareBoost = pokedOften || angry || angryStreak || failCount >= 3 ? 0.08 : 0;
    const waveCut = shy || pokedOften ? 0 : 0.03;
    const stillCut = neverSat ? 0.74 : angry || angryStreak || failCount >= 3 ? 0.72 : 0.65;
    if (pick < stillCut) return { action: "still" };
    if (pick < stillCut + 0.1) return { action: "fidget" };
    if (pick < stillCut + 0.18) return { action: "look_at_user" };
    if (glareBoost && pick < stillCut + 0.18 + glareBoost) return { action: "glare" };
    if (pick < stillCut + 0.22 + glareBoost) return { action: "emote" };
    if (waveCut && pick < stillCut + 0.22 + glareBoost + waveCut) return { action: "wave" };
    if (pick < stillCut + 0.28 + glareBoost + waveCut) return { action: "idle" };
    return { action: "walk_to" };
  }

  return { action: "still" };
}

function lampPlan(opts: {
  lightOn: boolean;
  angry: boolean;
  happy: boolean;
  angryStreak: boolean;
  darkHabit: boolean;
}): Plan | null {
  const bias = opts.angry || opts.angryStreak || opts.darkHabit ? 1.6 : 1;
  if (Math.random() >= 0.02 * bias) return null;
  if (opts.happy) {
    if (!opts.lightOn && Math.random() < 0.75) return { action: "light_on" };
    return null;
  }
  if (opts.angry || opts.angryStreak || opts.darkHabit) {
    if (opts.lightOn) return { action: "light_off" };
    return Math.random() < 0.75 ? { action: "light_off" } : { action: "light_on" };
  }
  return { action: opts.lightOn ? "light_off" : "light_on" };
}
