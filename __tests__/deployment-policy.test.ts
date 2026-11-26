import { afterEach, describe, expect, it, vi } from "vitest";
import { areMetaConnectionsEnabled, isAllowedInstagramAccount } from "@/lib/deployment-policy";
import { isLoginEmailEnabled } from "@/lib/env";
import * as sends from "@/lib/instagram/send-messages";
import { sendPrivateReply as sendMetaReply } from "@/lib/meta/client";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("private deployment policy", () => {
  it("permits only the two approved accounts and always excludes Sonix", () => {
    expect(isAllowedInstagramAccount({ id: "1", username: "WavGrind" })).toBe(true);
    expect(isAllowedInstagramAccount({ id: "2", username: "legacybeats" })).toBe(true);
    expect(isAllowedInstagramAccount({ id: "3", username: "sonix.audio" })).toBe(false);
    expect(isAllowedInstagramAccount({ id: "17841447591603859", username: "wavgrind" })).toBe(false);
    expect(isAllowedInstagramAccount({ id: "4" })).toBe(false);
  });

  it("keeps Meta connections and login email off by default", () => {
    vi.stubEnv("META_CONNECTIONS_ENABLED", undefined);
    vi.stubEnv("LOGIN_EMAIL_ENABLED", undefined);
    expect(areMetaConnectionsEnabled()).toBe(false);
    expect(isLoginEmailEnabled()).toBe(false);
    vi.stubEnv("LOGIN_EMAIL_ENABLED", "true");
    vi.stubEnv("RESEND_API_KEY", "");
    expect(isLoginEmailEnabled()).toBe(false);
  });

  it.each([undefined, "false", "1", "TRUE"])("blocks every send before fetch when switch is %s", async flag => {
    vi.stubEnv("OUTBOUND_MESSAGES_ENABLED", flag);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const common = {
      context: { provider: "META" as const, accessToken: "test", instagramId: "test", unifiedLogin: true },
      instagramAccountId: "test", commentId: "test", userId: "test", message: "test",
      text: "test", buttonTitle: "test", payload: "test", buttons: [],
    };
    for (const send of Object.values(sends)) {
      await expect(send(common)).rejects.toThrow("disabled pending approval");
      await expect(send({ ...common, context: { provider: "ZERNIO", apiKey: "test", accountId: "test", instagramId: "test" } })).rejects.toThrow("disabled pending approval");
    }
    await expect(sendMetaReply("test", "test", "test", "test")).rejects.toThrow("disabled pending approval");
    expect(fetch).not.toHaveBeenCalled();
  });
});
