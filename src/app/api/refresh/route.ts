import { getFeed, runIngest } from "@/lib/ingest";
import { offlineCaptureGone } from "@/lib/offline-http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const gone = offlineCaptureGone();
  if (gone) return gone;
  await runIngest();
  const feed = getFeed();
  return Response.json(feed, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
