import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ db: vi.fn(), ping: vi.fn(), counts: vi.fn(), worker: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: { $queryRaw: mocks.db } }));
vi.mock("@/lib/queue/client", () => ({ getRedisConnection: () => ({ ping: mocks.ping }), getDMQueue: () => ({ getJobCounts: mocks.counts }) }));
vi.mock("@/lib/ops/worker-health", () => ({ getWorkerHealth: mocks.worker }));
import { GET } from "@/app/api/health/route";

beforeEach(() => {
  mocks.db.mockResolvedValue([]);
  mocks.ping.mockResolvedValue("PONG");
  mocks.counts.mockResolvedValue({ waiting: 0, active: 0 });
  mocks.worker.mockResolvedValue({ healthy: true, heartbeat: { hostname: "private-host", pid: 123 } });
});

describe("health response", () => {
  it("reports only the four check statuses and disables caching", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok", checks: { database: "ok", redis: "ok", queue: "ok", worker: "ok" } });
  });
  it("returns 503 without leaking dependency errors", async () => {
    mocks.db.mockRejectedValue(new Error("postgres://private-credentials@host"));
    mocks.worker.mockRejectedValue(new Error("internal-host"));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "degraded", checks: { database: "error", redis: "ok", queue: "ok", worker: "error" } });
  });
  it("detects a stuck queue even with a fresh worker heartbeat", async () => {
    mocks.counts.mockResolvedValue({ waiting: 25, active: 0 });
    expect((await GET()).status).toBe(503);
  });
  it("times out an unresponsive dependency", async () => {
    vi.useFakeTimers();
    try {
      mocks.ping.mockReturnValue(new Promise(() => {}));
      const pending = GET();
      await vi.advanceTimersByTimeAsync(3000);
      expect((await pending).status).toBe(503);
    } finally { vi.useRealTimers(); }
  });
});
