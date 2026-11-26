import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockPrisma, mockExchange } = vi.hoisted(() => ({
  mockPrisma: {
    workspaceMember: { findFirst: vi.fn() },
    instagramAccount: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    operationalEvent: { create: vi.fn() },
  },
  mockExchange: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "user" } })),
}));
vi.mock("@/lib/workspace-access", () => ({ canManageWorkspace: () => true }));
vi.mock("@/lib/instagram-accounts", () => ({
  canConnectInstagramAccount: vi.fn(async () => ({ allowed: true })),
}));
vi.mock("@/lib/meta/oauth", () => ({
  verifyOAuthState: () => ({ workspaceId: "workspace", ts: Date.now() }),
  exchangeCodeForToken: mockExchange,
  encryptToken: (value: string) => `enc:${value}`,
}));

import { GET } from "../app/api/instagram/callback/route";

const fetchMock = vi.fn();
function respond(body: unknown) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status: 200 })
  );
}
function callback() {
  return GET(
    new NextRequest("https://app.test/api/instagram/callback?code=c&state=s")
  );
}
const urls = () => fetchMock.mock.calls.map(([url]) => String(url));

beforeEach(() => {
  vi.clearAllMocks();
  // Drop queued responses too, so one test's leftovers never feed the next.
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NEXTAUTH_URL", "https://app.test");
  vi.stubEnv("META_CONNECTIONS_ENABLED", "true");
  vi.stubEnv("META_LOGIN_MODE", "");
  mockPrisma.workspaceMember.findFirst.mockResolvedValue({ role: "OWNER" });
  mockPrisma.instagramAccount.findUnique.mockResolvedValue(null);
  mockPrisma.operationalEvent.create.mockResolvedValue({});
});
afterEach(() => vi.unstubAllEnvs());

describe("Instagram OAuth callback", () => {
  it("blocks legacy login before any token exchange or account lookup", async () => {
    vi.stubEnv("META_LOGIN_CONFIG_ID", "");
    expect((await callback()).status).toBe(403);
    expect(mockExchange).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("blocks callbacks while connections are disabled", async () => {
    vi.stubEnv("META_CONNECTIONS_ENABLED", "false");
    vi.stubEnv("META_LOGIN_CONFIG_ID", "config");
    expect((await callback()).status).toBe(403);
    expect(mockExchange).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps direct Instagram callbacks blocked by the global connection gate", async () => {
    vi.stubEnv("META_LOGIN_MODE", "INSTAGRAM");
    vi.stubEnv("META_CONNECTIONS_ENABLED", "false");
    expect((await callback()).status).toBe(403);
    expect(mockExchange).not.toHaveBeenCalled();
  });

  it("reconnects the same approved account through Instagram Login without creating a duplicate", async () => {
    vi.stubEnv("META_LOGIN_MODE", "INSTAGRAM");
    vi.stubEnv("META_LOGIN_CONFIG_ID", "retained-config");
    vi.stubEnv("INSTAGRAM_APP_SECRET", "test-only-secret");
    mockExchange.mockResolvedValue({ accessToken: "short", userId: "scoped" });
    mockPrisma.instagramAccount.findUnique.mockResolvedValue({ id: "existing-account" });
    mockPrisma.instagramAccount.updateMany.mockResolvedValue({ count: 1 });
    respond({ access_token: "long", expires_in: 5184000 });
    respond({ id: "scoped", user_id: "professional", username: "wavgrind" });
    respond({ success: true });
    expect((await callback()).headers.get("location")).toBe("https://app.test/dashboard?connected=true");
    expect(urls().every(url => url.startsWith("https://graph.instagram.com/"))).toBe(true);
    expect(urls()[2]).toMatch(/\/professional\/subscribed_apps$/);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).subscribed_fields.sort()).toEqual(["comments", "messages", "messaging_postbacks"].sort());
    expect(mockPrisma.instagramAccount.updateMany).toHaveBeenCalledWith({where:{id:"existing-account",workspaceId:"workspace",provider:"META"},data:expect.objectContaining({accessToken:"enc:long",metaLogin:"INSTAGRAM",webhookSubscribed:true})});
    expect(mockPrisma.instagramAccount.create).not.toHaveBeenCalled();
  });

  it("does not subscribe or save an unapproved direct Instagram account", async () => {
    vi.stubEnv("META_LOGIN_MODE", "INSTAGRAM");
    vi.stubEnv("INSTAGRAM_APP_SECRET", "test-only-secret");
    mockExchange.mockResolvedValue({ accessToken: "short", userId: "scoped" });
    respond({ access_token: "long", expires_in: 5184000 });
    respond({ id:"scoped", user_id:"17841447591603859", username:"sonix.audio" });
    expect((await callback()).headers.get("location")).toContain("instagram=already_connected");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mockPrisma.instagramAccount.create).not.toHaveBeenCalled();
    expect(mockPrisma.instagramAccount.updateMany).not.toHaveBeenCalled();
  });

  it("connects only approved accounts from a mixed Unified grant, on graph.facebook.com", async () => {
    vi.stubEnv("META_LOGIN_CONFIG_ID", "config");
    vi.stubEnv("META_APP_ID", "app");
    vi.stubEnv("FACEBOOK_APP_SECRET", "secret");
    mockExchange.mockResolvedValue({ accessToken: "suat", userId: "" });
    respond({ data: { expires_at: 0 } });
    respond({ data: [{ id: "ig1", username: "wavgrind" }, { id: "17841447591603859", username: "sonix.audio" }, { id: "ig2", username: "legacybeats" }, { id: "unknown" }] });
    respond({ id: "ig1", username: "wavgrind" });
    respond({ success: true });
    respond({ id: "ig2", username: "legacybeats" });
    respond({ success: true });

    const response = await callback();

    expect(response.headers.get("location")).toBe(
      "https://app.test/dashboard?connected=true"
    );
    expect(urls().every((url) => url.startsWith("https://graph.facebook.com/"))).toBe(true);
    expect(urls()[0]).toContain("/debug_token?");
    expect(urls()[0]).toContain("access_token=app%7Csecret");
    expect(urls()[1]).toContain("/me/assigned_instagram_accounts?");
    expect(urls()[2]).toContain("/ig1?");
    expect(urls()[2]).not.toContain("user_id");
    expect(urls()[3]).toMatch(/\/ig1\/subscribed_apps$/);
    expect(urls()[4]).toContain("/ig2?");
    expect(mockPrisma.instagramAccount.create).toHaveBeenCalledTimes(2);
    expect(urls().some(url => url.includes("17841447591603859") || url.includes("/unknown"))).toBe(false);
    expect(mockPrisma.instagramAccount.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        instagramId: "ig2",
        username: "legacybeats",
        accessToken: "enc:suat",
        metaLogin: "UNIFIED",
        // A token that never expires stores no expiry.
        tokenExpiresAt: null,
        webhookSubscribed: true,
      }),
    });
  });

  it("moves an existing Instagram Login account to Unified login when it reconnects", async () => {
    vi.stubEnv("META_LOGIN_CONFIG_ID", "config");
    vi.stubEnv("META_APP_ID", "app");
    vi.stubEnv("FACEBOOK_APP_SECRET", "secret");
    mockExchange.mockResolvedValue({ accessToken: "suat", userId: "" });
    mockPrisma.instagramAccount.findUnique.mockResolvedValue({ id: "row" });
    mockPrisma.instagramAccount.updateMany.mockResolvedValue({ count: 1 });
    respond({ data: { expires_at: 1_900_000_000 } });
    respond({ data: [{ id: "ig1", username: "wavgrind" }] });
    respond({ id: "ig1", username: "wavgrind" });
    respond({ success: true });

    await callback();

    expect(mockPrisma.instagramAccount.updateMany).toHaveBeenCalledWith({
      where: { id: "row", workspaceId: "workspace", provider: "META" },
      data: expect.objectContaining({
        metaLogin: "UNIFIED",
        accessToken: "enc:suat",
        tokenExpiresAt: new Date(1_900_000_000 * 1000),
      }),
    });
  });

  it("explains a Unified login that granted no Instagram account", async () => {
    vi.stubEnv("META_LOGIN_CONFIG_ID", "config");
    vi.stubEnv("META_APP_ID", "app");
    vi.stubEnv("FACEBOOK_APP_SECRET", "secret");
    mockExchange.mockResolvedValue({ accessToken: "suat", userId: "" });
    respond({ data: { expires_at: 0 } });
    respond({ data: [] });

    const response = await callback();

    expect(response.headers.get("location")).toContain("instagram=failed");
    expect(decodeURIComponent(response.headers.get("location")!)).toContain(
      "business_management"
    );
    expect(mockPrisma.instagramAccount.create).not.toHaveBeenCalled();
  });
});
