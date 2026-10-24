import { getFeed } from "@/lib/ingest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const feed = getFeed();
  return Response.json(
    { generatedAt: feed.generatedAt, sources: feed.sources },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
