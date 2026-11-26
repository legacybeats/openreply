# WavGrind private OpenReply deployment

This supersedes the earlier `.env`/Compose proposal in `NOTES.md`. Luke's 26 November 2026 instructions require credentials only in the server's secret store and no public launch or DMs without his OK.

## Locations and configuration

- Mac: `/Users/luke/Documents/GitHub/WavGrindOpenReply`.
- Existing fork: `https://github.com/legacybeats/openreply`; review branch `codex/openreply-hardening-20261126`, based on `luke-fixes` at `f00b3e8`.
- Hetzner: `2.29.58.59`, source at `/opt/openreply-review`. The original `/opt/openreply` checkout and `SETUP_READY` are preserved.
- Single-node Docker Swarm supplies encrypted secrets. No additional paid services are provisioned; Postgres and Redis use the already purchased server.
- `docker-stack.private.yml` publishes **no ports**. Web, worker, cron, Postgres and Redis run inside the stack.
- `ALLOWED_EMAILS=legacy@legacybeats.com`; sender `OpenReply <legacy@legacybeats.com>` (Luke confirmed both in this chat).
- `LOGIN_EMAIL_ENABLED=false`, `META_CONNECTIONS_ENABLED=false`, `OUTBOUND_MESSAGES_ENABLED=false`.
- Prospective URL from the earlier setup notes: `https://2-29-58-59.sslip.io`. This is configuration only until a reverse proxy and certificate are approved and enabled.

## Secrets

`scripts/bootstrap-private-secrets.py` generates database, Redis, authentication, encryption, cron and webhook values **on the server**, piping them directly into Docker secret creation. It refuses an existing installation. Never run it on a Mac or write its generated values to disk.

Secrets are named `openreply_app_v1`, `openreply_postgres_v1`, `openreply_redis_v1`. The app secret contains JSON; `scripts/secret-entrypoint.mjs` reads its memory-backed mount and starts the app with values in process memory. It never prints the values. Database and Redis services receive only their own password secret. Service specs and the source archive have no secret values. Do not run `printenv`, read `/run/secrets` into chat, dump inspect output indiscriminately, or save provider credentials in `.env`.

Later, enter Resend and Meta credentials directly into the server secret store through a private operator session, using hidden input and stdin. Rotate by creating a new version of the app secret and updating service references; never overwrite local configuration with secrets. Provider credentials and Instagram grants have not been set up by this deployment.

## Build and start (server operator)

1. Inspect the existing server, branch, source archive and secret names. Do not replace another session's deployment.
2. Initialize a single-node Swarm if inactive. Bind its manager listener to loopback; keep cluster ports blocked externally. Suppress `swarm init` output because it includes join credentials.
3. Run the bootstrap only on a fresh installation. Validate `docker stack config -c docker-stack.private.yml` without printing resolved secrets.
4. `docker build -t openreply-app:review .` then `docker stack deploy --resolve-image never -c docker-stack.private.yml openreply`.
5. Inspect service status, call `/api/health` from inside the web container, verify all four statuses, confirm zero connected accounts/campaigns, and scan public ports externally.

A successful HTTP connection alone is not a health pass: the Docker health probe requires status 200; the endpoint returns 503 on dependency failure/stuck queue/stale heartbeat and bounds dependency checks to three seconds. The body exposes only status strings.

## Gates before any public pilot

1. Luke approves opening the admin site on a confirmed hostname; configure and verify HTTPS then. This is separate from permission to send DMs.
2. Verify `legacybeats.com` in Resend, privately install a sending key, then enable login email only after approval. Luke initiates the actual login email test. Do not change marketing email platforms.
3. Inspect the current Meta app configuration and existing webhook consumer before making changes. The handoff names WavGrind Ad Runner (`1900442214463518`). Obtain comments/messages permissions and the correct Unified Login configuration. Do not overwrite another system's callback.
4. Only after setup approval enable account connections. Unified grants are filtered to `wavgrind` and `legacybeats` before profile lookups/subscriptions; the Sonix ID is blocked as well. No Sonix setup, data pulls, or subscriptions.
5. Confirm `flip` is unused in ManyChat; get the exact approved DM, link, target post and pilot scope. Create only a paused @wavgrind campaign with whole-word `flip`; leave public replies and inbound-DM triggers off. The create/import API defaults to paused, but explicit UI settings still need checking.
6. Review the saved campaign and obtain Luke's explicit send/launch OK before enabling any outbound switch or campaign. @legacybeats is connection-only in this pilot. ManyChat retains every existing keyword.

## Verification and remaining limitations

Local tests mock all outbound delivery. Database/Redis integration suites require isolated test schemas/Redis DB; they must not run against customer data. The deployment itself has no connected accounts, provider credentials or approved campaign copy. SMTP was removed to eliminate unused vulnerable dependencies; this fork supports Resend login only. The `effect` override is a patched compatible v3 release for Prisma's config dependency.

No public HTTPS or real email/Meta/DM end-to-end pass can be claimed until the above setup and approvals are complete. The server has no purchased backup service; do not add a paid backup or resize it without Luke's OK.
