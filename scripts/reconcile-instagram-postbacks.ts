/** Server-only repair of an EXISTING approved account subscription. Read-only
 * by default; --apply adds the missing button field. No send API, credentials
 * output, other-app writes, account grants or historical inbox reads. */
import { existsSync } from "node:fs";
import { prisma } from "@/lib/db/client";
import { createInstagramContext } from "@/lib/instagram/context";
import { getMetaGraphApiVersion } from "@/lib/env";
import { isAllowedInstagramAccount } from "@/lib/deployment-policy";
import { INSTAGRAM_WEBHOOK_FIELDS } from "@/lib/meta/webhook-fields";

const APP_ID = "1900442214463518";
const approved = new Set<string>(INSTAGRAM_WEBHOOK_FIELDS);
type Subscription = { id: string; subscribed_fields?: string[] };

async function main() {
  if (!existsSync("/run/secrets/openreply_app")) throw new Error("server-only");
  // This repair is solely for the active WavGrind manual test. Legacy Beats
  // and all other accounts are not queried or changed by this script.
  const accounts = await prisma.instagramAccount.findMany({
    where: { username: "wavgrind", provider: "META" },
  });
  if (accounts.length !== 1) throw new Error("account-count");
  const account = accounts[0];
  if (!isAllowedInstagramAccount({ id: account.instagramId, username: account.username }) ||
      !/^\d+$/.test(account.instagramId)) throw new Error("account-scope");
  const context = await createInstagramContext(account);
  if (context.provider !== "META") throw new Error("provider");
  const accessToken = context.accessToken;
  const host = context.unifiedLogin ? "graph.facebook.com" : "graph.instagram.com";
  const endpoint = `https://${host}/${getMetaGraphApiVersion()}/${account.instagramId}/subscribed_apps`;

  async function request(apply = false) {
    const response = await fetch(endpoint, {
      method: apply ? "POST" : "GET",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      ...(apply ? { body: JSON.stringify({ subscribed_fields: INSTAGRAM_WEBHOOK_FIELDS }) } : {}),
    });
    const data = await response.json() as { data?: Subscription[]; success?: boolean; error?: { code?: number } };
    if (!response.ok || data.error) {
      console.log(JSON.stringify({ account: "wavgrind", httpStatus: response.status, metaCode: data.error?.code ?? null }));
      throw new Error("provider-request");
    }
    return data;
  }

  async function current() {
    const data = await request();
    const subscription = data.data?.find(item => item.id === APP_ID);
    if (!subscription) throw new Error("existing-subscription-missing");
    const fields = subscription.subscribed_fields;
    if (!Array.isArray(fields) || fields.some(field => !approved.has(field))) {
      throw new Error("unexpected-existing-fields");
    }
    return new Set(fields);
  }

  const before = await current();
  console.log(JSON.stringify({ account: "wavgrind", fields: [...before].sort(), buttonEventsReady: before.has("messaging_postbacks") }));
  if (!process.argv.includes("--apply")) return;
  if (!before.has("comments") || !before.has("messages")) throw new Error("unexpected-base-fields");
  if (!before.has("messaging_postbacks")) {
    if ((await request(true)).success !== true) throw new Error("subscription-not-confirmed");
  }
  const after = await current();
  if (after.size !== approved.size || [...approved].some(field => !after.has(field))) throw new Error("readback-mismatch");
  console.log(JSON.stringify({ account: "wavgrind", fields: [...after].sort(), verified: true, messagesSent: 0 }));
}

main().catch((error: unknown) => {
  // Never emit error objects: fetch/database errors may contain credentials.
  const safeReasons = new Set(["server-only", "account-count", "account-scope", "provider", "provider-request", "existing-subscription-missing", "unexpected-existing-fields", "unexpected-base-fields", "subscription-not-confirmed", "readback-mismatch"]);
  const reason = error instanceof Error && safeReasons.has(error.message) ? error.message : "internal-error";
  console.error(`Subscription check/repair failed (${reason}); no credential details displayed.`);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
