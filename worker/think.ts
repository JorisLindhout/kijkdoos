import { dummyThink } from "../src/brain/dummy";
import { ACTIONS, isActionName, type Plan, type Snapshot } from "../src/brain/schema";

type Env = {
  BRAIN: "dummy" | "cf";
  AI: AiBinding;
};

type AiBinding = {
  run(
    model: string,
    inputs: {
      messages: { role: string; content: string }[];
      max_tokens?: number;
      temperature?: number;
      response_format?: {
        type: "json_schema";
        json_schema: Record<string, unknown>;
      };
    },
  ): Promise<unknown>;
};

const MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";

const PLAN_JSON_SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: [...ACTIONS] },
    target: { type: "string" },
    mood: { type: "string" },
    say: { type: "string" },
  },
  required: ["action"],
};

const SYSTEM = `You are the director of a silent shoebox resident. Reply with JSON only:
{"action":"...","target":"...","mood":"...","say":"..."}
action must be one of: idle, still, fidget, walk_to, sit, stand, wave, glare, look_at_user, emote, push_chair, move_chair, kick_chair, light_on, light_off.
target must be an id from the snapshot objects list, or omitted.
Never invent objects. Prefer one action. Do not narrate.
Snapshot mood, visitCount, lightOn, visitSummary, failCount, backBlocked, and trappedChair are facts. Rearrange and lamp actions are rare.
failedActions are plans that just failed in this room state. Do not pick them until the chair, lamp, or sit state changes.
backBlocked means he cannot stand behind the chair. Pick kick_chair from the wall-facing side so the chair slides away from him into the room, then push_chair or move_chair. Never pick move_chair while trappedChair or backBlocked.
If trappedChair is set, keep picking kick_chair until he can walk again. Do not pick still while trapped.
At peak anger (mood angry with shortStreak 3+, or failCount 5+) he may kick_chair even if the chair is not stuck.
A high failCount means he is frustrated; prefer glare, still, and kick_chair; do not keep repeating the same failed rearrange.
badChairPoses are chair floor poses that pinned him against a wall. Do not move the chair back to those poses.`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname !== "/api/think") {
      return new Response("Not found", { status: 404 });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    let snapshot: Snapshot;
    try {
      snapshot = (await request.json()) as Snapshot;
    } catch {
      return Response.json({ error: "invalid json" }, { status: 400 });
    }

    const plan = await think(env, snapshot);
    if (!isActionName(plan.action)) {
      return Response.json({ error: "invalid action" }, { status: 400 });
    }

    const ids = new Set(snapshot.objects.map((o) => o.id));
    if (plan.target && !ids.has(plan.target)) {
      return Response.json({ action: "idle" });
    }

    return Response.json(plan);
  },
};

async function think(env: Env, snapshot: Snapshot): Promise<Plan> {
  if (env.BRAIN === "cf") {
    try {
      return await cfThink(env, snapshot);
    } catch (err) {
      console.error("cf think failed", err);
      return dummyThink(snapshot);
    }
  }
  return dummyThink(snapshot);
}

async function cfThink(env: Env, snapshot: Snapshot): Promise<Plan> {
  const data = await env.AI.run(MODEL, {
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: JSON.stringify(snapshot) },
    ],
    max_tokens: 128,
    temperature: 0.4,
    response_format: {
      type: "json_schema",
      json_schema: PLAN_JSON_SCHEMA,
    },
  });
  return parsePlan(data);
}

function parsePlan(value: unknown): Plan {
  const rec = asRecord(unwrapAi(value));
  if (!rec || typeof rec.action !== "string" || !isActionName(rec.action)) {
    throw new Error("bad plan");
  }
  return {
    action: rec.action,
    target: typeof rec.target === "string" ? rec.target : undefined,
    mood: typeof rec.mood === "string" ? rec.mood : undefined,
    say: typeof rec.say === "string" ? rec.say : undefined,
  };
}

function unwrapAi(value: unknown): unknown {
  if (typeof value === "string") {
    return JSON.parse(value);
  }
  const rec = asRecord(value);
  if (!rec) return value;
  if (typeof rec.action === "string") return rec;
  if ("response" in rec) return unwrapAi(rec.response);
  const choices = rec.choices;
  if (Array.isArray(choices)) {
    const message = asRecord(asRecord(choices[0])?.message);
    if (message && "content" in message) return unwrapAi(message.content);
  }
  return value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
