import type { Plan, Snapshot } from "./schema";

export function dummyThink(snapshot: Snapshot): Plan {
  const pose = snapshot.character.pose;
  const last = snapshot.lastActions;
  const recent = (action: string) => last.slice(-5).includes(action);
  const chair = snapshot.objects.find((o) => o.affordances.includes("sit"));
  const stare = snapshot.user.stareSeconds ?? 0;

  if (snapshot.user.poked) {
    return { action: "glare" };
  }

  if (pose === "sit") {
    if (!recent("stand") && Math.random() < 0.08) return { action: "stand" };
    const pick = Math.random();
    if (pick < 0.65) return { action: "still" };
    if (pick < 0.8) return { action: "fidget" };
    if (pick < 0.9) return { action: "look_at_user" };
    return { action: "idle" };
  }

  if (chair && pose !== "sit" && !recent("sit") && Math.random() < 0.1) {
    return { action: "sit", target: chair.id };
  }

  if (stare >= 10 && !recent("look_at_user") && Math.random() < 0.2) {
    return { action: "look_at_user" };
  }

  if (pose === "idle" || pose === "still" || pose === "look") {
    const pick = Math.random();
    if (pick < 0.65) return { action: "still" };
    if (pick < 0.78) return { action: "fidget" };
    if (pick < 0.86) return { action: "look_at_user" };
    if (pick < 0.91) return { action: "emote" };
    if (pick < 0.96) return { action: "idle" };
    return { action: "walk_to" };
  }

  return { action: "still" };
}
