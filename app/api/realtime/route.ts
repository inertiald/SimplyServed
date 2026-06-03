import { getSubscriber } from "@/lib/redis";
import { neighborhoodCellsAround } from "@/lib/h3";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Server-Sent Events stream of new posts in the requested H3 cells, plus
 * personal notifications for the signed-in user. Pure Next.js + Redis pub/sub.
 *
 *   GET /api/realtime?h3=cell  (or ?lat=&lng=&ring=1)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const h3 = searchParams.get("h3");
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const ring = Number(searchParams.get("ring") ?? "1");

  let cells: string[] = [];
  if (h3) {
    cells = h3.split(",").filter(Boolean);
  } else if (lat && lng) {
    const latN = Number(lat);
    const lngN = Number(lng);
    if (!Number.isNaN(latN) && !Number.isNaN(lngN)) {
      cells = neighborhoodCellsAround(latN, lngN, Math.min(Math.max(ring, 0), 4));
    }
  }

  const session = await getSessionUser();
  const channels = [
    ...cells.map((c) => `vibe:h3:${c}`),
    ...(session ? [`notify:user:${session.id}`, `notify:provider:${session.id}`] : []),
  ];

  const sub = getSubscriber().duplicate();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          // controller may be closed; ignore.
        }
      };

      // Heartbeat to keep proxies from killing the stream.
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          /* ignore */
        }
      }, 25_000);

      try {
        if (channels.length > 0) {
          await sub.connect().catch(() => undefined);
          if (sub.status === "ready") {
            await sub.subscribe(...channels);
            sub.on("message", (channel, message) => {
              send("message", { channel, payload: safeParse(message) });
            });
          }
        }
        send("ready", { channels, ts: Date.now() });
      } catch (err) {
        send("error", { message: (err as Error).message });
      }

      const close = () => {
        clearInterval(heartbeat);
        sub.disconnect();
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      };
      request.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
