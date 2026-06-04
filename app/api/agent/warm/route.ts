import { NextResponse } from "next/server";
import { chat } from "@/lib/ollama";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const startedAt = Date.now();
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 45_000);
  try {
    await chat({
      temperature: 0,
      signal: ctrl.signal,
      messages: [
        {
          role: "system",
          content: "Warm the model cache. Respond with a single token.",
        },
        { role: "user", content: "ok" },
      ],
    });
    console.info(
      JSON.stringify({
        kind: "agent.warm",
        ok: true,
        durationMs: Date.now() - startedAt,
      }),
    );
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.warn(
      JSON.stringify({
        kind: "agent.warm",
        ok: false,
        durationMs: Date.now() - startedAt,
        error: (err as Error).message,
      }),
    );
    return NextResponse.json(
      { ok: false, error: "Model warm-up unavailable" },
      { status: 503 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
