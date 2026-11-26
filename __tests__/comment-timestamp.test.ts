import { afterEach, describe, expect, it, vi } from "vitest";
import { getCommentTimestamp } from "@/lib/meta/client";

afterEach(() => vi.unstubAllGlobals());
describe("comment creation metadata", () => {
  it.each([false, true])("uses the account's host, bounded GET and header auth (unified=%s)", async (unifiedLogin) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "comment", timestamp: "2026-11-27T00:00:01Z" })));
    vi.stubGlobal("fetch", fetcher);
    expect(await getCommentTimestamp({ accessToken: "test-only", unifiedLogin }, "comment")).toBe("2026-11-27T00:00:01Z");
    const [url, init] = fetcher.mock.calls[0];
    expect(url.hostname).toBe(unifiedLogin ? "graph.facebook.com" : "graph.instagram.com");
    expect(url.searchParams.get("fields")).toBe("id,timestamp");
    expect(url.searchParams.has("access_token")).toBe(false);
    expect(init.headers.Authorization).toBe("Bearer test-only");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
  it.each([{ id: "different", timestamp: "2026-11-27T00:00:01Z" }, { id: "comment" }])("rejects incomplete or mismatched metadata", async (body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body))));
    expect(await getCommentTimestamp("test-only", "comment")).toBeNull();
  });
});
