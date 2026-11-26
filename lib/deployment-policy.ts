// WavGrind's private pilot. These switches are deliberately off unless an
// operator changes server configuration after Luke approves the exact action.
export const ALLOWED_INSTAGRAM_USERNAMES = ["wavgrind", "legacybeats"] as const;
const BLOCKED_INSTAGRAM_ID = "17841447591603859";

export function isAllowedInstagramAccount(account: { id: string; username?: string }) {
  return account.id !== BLOCKED_INSTAGRAM_ID &&
    ALLOWED_INSTAGRAM_USERNAMES.some(name => name === account.username?.toLowerCase());
}

export function areMetaConnectionsEnabled() {
  return process.env.META_CONNECTIONS_ENABLED === "true";
}

export function assertOutboundEnabled() {
  if (process.env.OUTBOUND_MESSAGES_ENABLED !== "true") {
    throw new Error("Outbound messaging is disabled pending approval");
  }
}
