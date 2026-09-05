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

  if (stare >= 8 && !recent("wave") && !recent("glare")) {
    return Math.random() < 0.55 ? { action: "wave" } : { action: "glare" };
  }

  if (pose === "sit" && recent("sit")) {
    return { action: "stand" };
  }

  if (chair && pose !== "sit" && !recent("sit") && Math.random() < 0.35) {
    return { action: "sit", target: chair.id };
  }

  if (pose === "idle") {
    if (Math.random() < 0.45) return { action: "idle" };
    return { action: "walk_to" };
  }

  return { action: "idle" };
}
