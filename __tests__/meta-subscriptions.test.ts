import { afterEach, describe, expect, it, vi } from "vitest";
import { subscribeInstagramAccountToWebhooks } from "../lib/meta/client";
import { parsePostbackEvents } from "../lib/meta/webhook";
import { readFileSync } from "node:fs";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("Instagram button notification subscriptions", () => {
  it.each([false, true])("subscribes button events for unified=%s without read-triggered delivery", async (unifiedLogin) => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal("fetch", fetchMock);
    await subscribeInstagramAccountToWebhooks("ig_test", { accessToken: "test-only", unifiedLogin });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain(unifiedLogin ? "graph.facebook.com" : "graph.instagram.com");
    expect(JSON.parse(options.body).subscribed_fields).toEqual(["comments", "messages", "messaging_postbacks"]);
    expect(parsePostbackEvents({ object: "instagram", entry: [{ id: "ig_test", time: 1, messaging: [{ sender: { id: "tester" }, postback: { mid: "tap_1", payload: "reveal:test_campaign:open" } }] }] })).toEqual([{ instagramAccountId: "ig_test", userId: "tester", mid: "tap_1", payload: "reveal:test_campaign:open" }]);
  });

  it("keeps the app-level callback subscription in step with account-level buttons", () => {
    const setup = readFileSync(new URL("../scripts/configure-meta-webhook.py", import.meta.url), "utf8");
    const fields = setup.match(/^FIELDS = \{(.+)\}$/m)?.[1].match(/"([a-z_]+)"/g)?.map(value => JSON.parse(value));
    expect(fields?.sort()).toEqual(["comments", "messages", "messaging_postbacks"]);
  });
});
