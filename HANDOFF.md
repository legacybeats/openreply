# OpenReply build ownership — Codex on Mac, 26 November 2026

Current deployment and safety rules: [docs/deploy-wavgrind.md](docs/deploy-wavgrind.md). Read that before operating the server. `NOTES.md` is the preserved, untracked previous sandbox handoff and contains superseded `.env`/public-startup advice.

Luke asked this Codex chat to take over, fix the review findings, deploy on the already purchased Hetzner server and verify health/ports. He confirmed `legacy@legacybeats.com` for both allowed sign-in and login sender. No public launch, DMs or extra spending is approved. Only @wavgrind and @legacybeats may connect; Sonix is off limits. The proposed pilot is one new `flip` keyword on @wavgrind; ManyChat retains all existing keywords.

Local branch: `codex/openreply-hardening-20261126`, based on fork `legacybeats/openreply` branch `luke-fixes`, `f00b3e8`. Server working copy: `/opt/openreply-review`; original `/opt/openreply` is untouched. Existing setup SSH identity is outside this repo at `/Users/luke/openreply-ops/keys/openreply_ed25519`; use it without reading, copying or logging its contents.

Changes: patched Next.js/Auth.js and Prisma's transitive Effect dependency; removed unused Nodemailer/SMTP; mandatory email allowlist; default-off login email, Meta connection and outbound-message switches; account grant filtering before profile/subscription calls; paused campaign-create/import defaults; minimal bounded health response; Node 22 Docker build; encrypted Docker-secret deployment with no published ports. Relevant regression tests cover blocked sends across providers, allowlist behavior, mixed account grants excluding Sonix, and health failure/stuck-queue/timeouts.

Continue with the verification record in the vault's `Projects/OpenReply - NOW.md` and the dated Codex Mac session log. Any remaining Meta/Resend credentials go directly into the server secret store, never this repository or the brain. The next approval is public admin access/setup, then separately the exact pilot DM and activation.
