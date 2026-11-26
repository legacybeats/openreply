import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { getDMQueue, getRedisConnection } from "@/lib/queue/client";
import { getWorkerHealth } from "@/lib/ops/worker-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Bound dependency checks and expose statuses only, never exception messages,
// queue counts, hostnames, process IDs, or heartbeat timestamps.
async function check(run: () => Promise<boolean>): Promise<"ok" | "error"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const healthy = await Promise.race([
      Promise.resolve().then(run),
      new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), 3000); }),
    ]);
    return healthy ? "ok" : "error";
  } catch {
    return "error";
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  const [database, redis, queue, worker] = await Promise.all([
    check(async () => { await prisma.$queryRaw`SELECT 1`; return true; }),
    check(async () => (await getRedisConnection().ping()) === "PONG"),
    check(async () => {
      const counts = await getDMQueue().getJobCounts("waiting", "active");
      const configured = Number(process.env.HEALTH_STUCK_QUEUE_WAITING ?? 25);
      const threshold = Number.isFinite(configured) && configured > 0 ? configured : 25;
      return (counts.waiting ?? 0) < threshold || (counts.active ?? 0) > 0;
    }),
    check(async () => (await getWorkerHealth()).healthy),
  ]);
  const checks = { database, redis, queue, worker };
  const healthy = Object.values(checks).every(status => status === "ok");
  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", checks },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
