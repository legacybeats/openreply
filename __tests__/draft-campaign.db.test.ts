import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "../app/generated/prisma/client";

const state = vi.hoisted(() => ({
  db: undefined as unknown as import("../app/generated/prisma/client").PrismaClient,
  getUserMedia: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({ get prisma() { return state.db; } }));
vi.mock("@/lib/auth", () => ({ getCurrentWorkspaceId: async () => "workspace" }));
vi.mock("@/lib/workspace-access", () => ({
  canManageWorkspace: () => true,
  getCurrentWorkspaceContext: async () => ({ workspaceId: "workspace", role: "OWNER" }),
}));
vi.mock("@/lib/instagram/provider", () => ({
  hasInstagramCredentials: () => true,
  createInstagramContext: async () => ({}),
  getUserMedia: state.getUserMedia,
}));
import { POST } from "../app/api/automations/route";
import { attachPendingNextReels } from "../lib/automation/attach-next-reel";

const databaseUrl = process.env.TEST_DATABASE_URL;
const schema = `draft_campaign_${randomBytes(4).toString("hex")}`;
const createdAt = new Date("2026-01-01");
const reel = { id: "new-reel", timestamp: "2026-01-02T00:00:00Z", media_product_type: "REELS", permalink: "https://example.test/reel" };
let sql: Client;

describe.skipIf(!databaseUrl)("paused campaign behavior on real PostgreSQL", () => {
  beforeAll(async () => {
    sql = new Client({ connectionString: databaseUrl });
    await sql.connect();
    await sql.query(`CREATE SCHEMA "${schema}"`);
    await sql.query(`SET search_path TO "${schema}"`);
    const root = path.join(__dirname, "..", "prisma", "migrations");
    const dirs = readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
    for (const dir of dirs) await sql.query(readFileSync(path.join(root, dir.name, "migration.sql"), "utf8"));
    state.db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }, { schema }) });
    await state.db.user.create({ data: { id: "owner", email: "draft@example.test" } });
    await state.db.workspace.create({ data: { id: "workspace", name: "Test", ownerId: "owner" } });
    await state.db.instagramAccount.create({ data: { id: "account", workspaceId: "workspace", instagramId: "synthetic", username: "wavgrind", accessToken: "synthetic-unused" } });
  }, 60_000);
  afterAll(async () => {
    await state.db?.$disconnect();
    if (sql) { await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await sql.end(); }
  });
  beforeEach(async () => {
    await state.db.automation.deleteMany();
    state.getUserMedia.mockReset().mockResolvedValue([reel]);
  });

  async function campaign(id: string, isActive: boolean) {
    return state.db.automation.create({ data: { id, workspaceId: "workspace", instagramAccountId: "account", name: id, keywords: ["flip"], dmMessage: "Draft", pendingNextReel: true, isActive, createdAt } });
  }

  it("creates a paused campaign with its public report disabled", async () => {
    const response = await POST(new NextRequest("https://example.test/api/automations", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Draft", instagramAccountId: "account", pendingNextReel: true, keywords: ["flip"], dmMessage: "Draft" }),
    }));
    expect(response.status).toBe(201);
    const saved = await state.db.automation.findFirstOrThrow();
    expect(saved).toMatchObject({ isActive: false, reportShareEnabled: false, postId: null, pendingNextReel: true });
    expect(await attachPendingNextReels()).toMatchObject({ checked: 0, bound: 0 });
    expect(state.getUserMedia).not.toHaveBeenCalled();
  });

  it("binds an active campaign while leaving a paused draft unbound", async () => {
    await campaign("active", true);
    await campaign("draft", false);
    expect(await attachPendingNextReels()).toMatchObject({ checked: 1, bound: 1 });
    expect(await state.db.automation.findUniqueOrThrow({ where: { id: "active" } })).toMatchObject({ postId: reel.id, pendingNextReel: false });
    expect(await state.db.automation.findUniqueOrThrow({ where: { id: "draft" } })).toMatchObject({ postId: null, pendingNextReel: true });
  });

  it("does not bind a campaign paused while its media request is running", async () => {
    await campaign("active", true);
    state.getUserMedia.mockImplementation(async () => {
      await state.db.automation.update({ where: { id: "active" }, data: { isActive: false } });
      return [reel];
    });
    expect(await attachPendingNextReels()).toMatchObject({ checked: 1, bound: 0 });
    expect(await state.db.automation.findUniqueOrThrow({ where: { id: "active" } })).toMatchObject({ postId: null, pendingNextReel: true });
  });
});
