import type { Plan, Snapshot } from "./schema";

export async function requestPlan(snapshot: Snapshot): Promise<Plan | null> {
  try {
    const response = await fetch("/api/think", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snapshot),
    });
    if (!response.ok) return null;
    return (await response.json()) as Plan;
  } catch {
    return null;
  }
}
