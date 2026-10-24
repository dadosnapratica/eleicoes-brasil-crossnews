import { Dashboard } from "@/components/Dashboard";
import { getFeed } from "@/lib/ingest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default function Home() {
  const initialFeed = getFeed();
  return <Dashboard initialFeed={initialFeed} />;
}
