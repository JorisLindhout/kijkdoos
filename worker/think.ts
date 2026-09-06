import { dummyThink } from "../src/brain/dummy";
import { isActionName, type Plan, type Snapshot } from "../src/brain/schema";

type Env = {
  BRAIN: "dummy" | "ollama" | "cf";
  OLLAMA_URL: string;
};

const SYSTEM = `You are the director of a silent shoebox resident. Reply with JSON only:
{"action":"...","target":"...","mood":"...","say":"..."}
action must be one of: idle, still, fidget, walk_to, sit, stand, wave, glare, look_at_user, emote.
target must be an id from the snapshot objects list, or omitted.
Never invent objects. Prefer one action. Do not narrate.`;

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
  if (env.BRAIN === "ollama") {
    try {
      return await ollamaThink(env, snapshot);
    } catch {
      return dummyThink(snapshot);
    }
  }
  return dummyThink(snapshot);
}

async function ollamaThink(env: Env, snapshot: Snapshot): Promise<Plan> {
  const response = await fetch(`${env.OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama3.1:8b-instruct",
      stream: false,
      format: "json",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: JSON.stringify(snapshot) },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error("ollama failed");
  }
  const data = (await response.json()) as { message?: { content?: string } };
  const parsed = JSON.parse(data.message?.content ?? "{}") as Partial<Plan>;
  if (!parsed.action || !isActionName(parsed.action)) {
    throw new Error("bad plan");
  }
  return {
    action: parsed.action,
    target: parsed.target,
    mood: parsed.mood,
    say: parsed.say,
  };
}
