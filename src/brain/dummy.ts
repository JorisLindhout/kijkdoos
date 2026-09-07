import {
  isPeakAngerState,
  offering,
  PEAK_SHORT_STREAK,
  type Plan,
  type Snapshot,
} from "./schema";

const PEAK_KICK = 0.12;

const REARRANGE = new Set(["push", "move", "kick"]);
const LAMP = new Set(["light_on", "light_off"]);

export function dummyThink(snapshot: Snapshot): Plan {
  const pose = snapshot.character.pose;
  const last = snapshot.lastActions;
  const failed = new Set(snapshot.failedActions ?? []);
  const recent = (action: string) => last.slice(-5).includes(action);
  const skipped = (action: string) => failed.has(action);
  const use = (verb: string) => offering(snapshot.objects, verb);
  const stare = snapshot.user.stareSeconds ?? 0;
  const mood = snapshot.mood ?? snapshot.character.mood ?? "calm";
  const summary = snapshot.visitSummary;
  const standing = !(snapshot.character.seated ?? pose === "sit");
  const shy = mood === "shy";
  const angry = mood === "angry";
  const happy = mood === "happy";
  const angryStreak = (summary?.shortStreak ?? 0) >= PEAK_SHORT_STREAK;
  const failCount = snapshot.failCount ?? 0;
  const peakAnger = isPeakAngerState(mood, summary?.shortStreak ?? 0, failCount);
  const darkHabit = summary?.darkHabit ?? false;
  const neverSat = summary?.neverSatLast10 ?? false;
  const pokedOften = (summary?.pokeRateLast10 ?? 0) >= 3;
  const rearranged = last
    .slice(-6)
    .some((action) => REARRANGE.has(action) && !failed.has(action));
  const lampRecent = last.slice(-4).some((action) => LAMP.has(action) && !failed.has(action));
  const chairKick = use("kick");
  const chairPush = use("push");
  const chairMove = use("move");
  const chairSit = use("sit");
  const lampOn = use("light_on");
  const lampOff = use("light_off");

  if (snapshot.user.poked) {
    return { action: "glare" };
  }

  if (standing && chairKick && (snapshot.trappedChair || snapshot.backBlocked) && snapshot.chairInReach) {
    return { action: "kick", target: chairKick.id };
  }

  if (standing && chairKick && peakAnger && !skipped("kick") && !recent("kick") && Math.random() < PEAK_KICK) {
    return { action: "kick", target: chairKick.id };
  }

  if (standing && !lampRecent) {
    const lamp = lampPlan({
      on: lampOn,
      off: lampOff,
      angry,
      happy,
      angryStreak,
      darkHabit,
    });
    if (lamp && !skipped(lamp.action)) return lamp;
  }

  if (standing && !rearranged && !shy && Math.random() < 0.02) {
    const push = chairPush && !skipped("push") ? chairPush : null;
    const move = chairMove && !skipped("move") ? chairMove : null;
    if (push && move) {
      return Math.random() < 0.5
        ? { action: "push", target: push.id }
        : { action: "move", target: move.id };
    }
    if (push) return { action: "push", target: push.id };
    if (move) return { action: "move", target: move.id };
  }

  if (snapshot.character.seated || pose === "sit") {
    if (!recent("stand") && Math.random() < (angry ? 0.04 : 0.08)) return { action: "stand" };
    const pick = Math.random();
    const stillCut = angry || angryStreak ? 0.72 : 0.65;
    if (pick < stillCut) return { action: "still" };
    if (pick < stillCut + 0.12) return { action: "fidget" };
    if (pick < stillCut + 0.22) return { action: "look_at_user" };
    return { action: "idle" };
  }

  const sitChance = neverSat ? 0.03 : shy ? 0.06 : 0.1;
  if (chairSit && !recent("sit") && Math.random() < sitChance) {
    return { action: "sit", target: chairSit.id };
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
  on: { id: string } | undefined;
  off: { id: string } | undefined;
  angry: boolean;
  happy: boolean;
  angryStreak: boolean;
  darkHabit: boolean;
}): Plan | null {
  const bias = opts.angry || opts.angryStreak || opts.darkHabit ? 1.6 : 1;
  if (Math.random() >= 0.02 * bias) return null;
  if (opts.happy) {
    if (opts.on && Math.random() < 0.75) return { action: "light_on", target: opts.on.id };
    return null;
  }
  if (opts.angry || opts.angryStreak || opts.darkHabit) {
    if (opts.off) return { action: "light_off", target: opts.off.id };
    if (opts.on) return { action: "light_on", target: opts.on.id };
    return null;
  }
  if (opts.off) return { action: "light_off", target: opts.off.id };
  if (opts.on) return { action: "light_on", target: opts.on.id };
  return null;
}
