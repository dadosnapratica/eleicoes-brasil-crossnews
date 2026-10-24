import { requestCrossing } from "@/lib/ingest";
import { offlineCaptureGone } from "@/lib/offline-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Fire-and-forget: Cloudflare will 524 if we wait for Ollama batches. */
export async function POST() {
  const gone = offlineCaptureGone();
  if (gone) return gone;
  const feed = requestCrossing();
  return Response.json(feed, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
