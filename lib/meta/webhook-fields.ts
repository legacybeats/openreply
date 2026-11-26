// Opening-DM buttons emit messaging_postbacks, not ordinary messages.
// Keep this minimal: read receipts would also enable the read-to-reveal
// fallback, which is not part of WavGrind's approved button-only flows.
export const INSTAGRAM_WEBHOOK_FIELDS = [
  "comments",
  "messages",
  "messaging_postbacks",
] as const;
