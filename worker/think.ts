import { dummyThink } from "../src/brain/dummy";
import {
  ACTIONS,
  isActionName,
  isAdvertisedPlan,
  normalizePlan,
  withObjectTarget,
  type Plan,
  type Snapshot,
} from "../src/brain/schema";

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
  },
  required: ["action"],
};

const SYSTEM = `You are the director of a silent shoebox resident. Reply with JSON only:
{"action":"...","target":"..."}
Self actions (no target): idle, still, fidget, walk_to, stand, wave, glare, look_at_user, emote.
Object actions MUST use a verb from that object's affordances and set target to that object's id.
Never invent objects or verbs. Prefer one action. Do not narrate. Omit say, mood, and all other keys.
Default to still — he freezes more than he fidgets. Idle is a living weight-shift and should be rarer than still.
Rearrange (push, move, kick) and lamp (light_on, light_off) are rare unless kick is the only chair verb advertised.
failedActions are verbs that just failed in this room state. Do not pick them until the object state changes.
If kick is advertised, prefer it over still while trapped. Peak anger may pick kick when advertised even from across the room.
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
    const normalized = withObjectTarget(normalizePlan(plan) ?? plan, snapshot.objects);
    if (!isActionName(normalized.action)) {
      return Response.json({ error: "invalid action" }, { status: 400 });
    }
    if (!isAdvertisedPlan(normalized, snapshot)) {
      return Response.json({ action: "idle" });
    }

    return Response.json(normalized);
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
    max_tokens: 64,
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
  if (!rec || typeof rec.action !== "string") {
    throw new Error("bad plan");
  }
  const plan = normalizePlan({
    action: rec.action,
    target: typeof rec.target === "string" ? rec.target : undefined,
  });
  if (!plan) throw new Error("bad plan");
  return plan;
}

function unwrapAi(value: unknown): unknown {
  if (typeof value === "string") return parseJsonish(value);
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

/** Llama often returns truncated or quote-broken JSON. Keep the action if it is already there. */
function parseJsonish(text: string): unknown {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  const action = /"action"\s*:\s*"([a-z_]+)"/.exec(trimmed);
  if (!action) return trimmed;
  const target = /"target"\s*:\s*"([^"]*)"/.exec(trimmed);
  return target ? { action: action[1], target: target[1] } : { action: action[1] };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
