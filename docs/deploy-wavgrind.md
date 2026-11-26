# WavGrind OpenReply deployment

This supersedes the earlier `.env`/Compose proposal in `NOTES.md`. Luke's 26 November 2026 instructions require credentials only in the server's secret store and no public launch or DMs without his OK.

## Locations and configuration

- Mac: `/Users/luke/Documents/GitHub/WavGrindOpenReply`.
- Existing fork: `https://github.com/legacybeats/openreply`; review branch `codex/openreply-hardening-20261126`, based on `luke-fixes` at `f00b3e8`.
- Hetzner: `2.29.58.59`, source at `/opt/openreply-review`. The original `/opt/openreply` checkout and `SETUP_READY` are preserved.
- Single-node Docker Swarm supplies encrypted secrets. No additional paid services are provisioned; Postgres and Redis use the already purchased server.
- `docker-stack.private.yml` publishes **no ports**. Web, worker, cron, Postgres and Redis run inside the stack.
- `ALLOWED_EMAILS=legacy@legacybeats.com`; sender `OpenReply <legacy@legacybeats.com>` (Luke confirmed both in this chat).
- `LOGIN_EMAIL_ENABLED=false`, `META_CONNECTIONS_ENABLED=false`, `OUTBOUND_MESSAGES_ENABLED=false`.
- Luke approved the HTTPS admin site after reviewing the private deployment. URL: `https://2-29-58-59.sslip.io/login`. The `docker-stack.https.yml` overlay adds Caddy on TCP 80/443; app, database, Redis and Swarm ports stay private.

## Secrets

`scripts/bootstrap-private-secrets.py` generates database, Redis, authentication, encryption, cron and webhook values **on the server**, piping them directly into Docker secret creation. It refuses an existing installation. Never run it on a Mac or write its generated values to disk.

Secrets are named `openreply_app_v1`, `openreply_postgres_v1`, `openreply_redis_v1`. The app secret contains JSON; `scripts/secret-entrypoint.mjs` reads its memory-backed mount and starts the app with values in process memory. It never prints the values. Database and Redis services receive only their own password secret. Service specs and the source archive have no secret values. Do not run `printenv`, read `/run/secrets` into chat, dump inspect output indiscriminately, or save provider credentials in `.env`.

Later, enter Resend and Meta credentials directly into the server secret store through a private operator session, using hidden input and stdin. Rotate by creating a new version of the app secret and updating service references; never overwrite local configuration with secrets. Provider credentials and Instagram grants have not been set up by this deployment.

`scripts/install-provider-secret.py resend` (or `meta --config-id <non-secret-ID>`) prepares this flow for an interactive root terminal on the server. Luke enters the credential twice into hidden prompts. It captures the current secret only in server process memory, creates a new encrypted Docker secret and rotates web/worker/cron. It does not enable any sending or connection gate. Do not run the input step in an agent-recorded terminal. After any rotation, export `APP_SECRET_NAME` from `/var/lib/openreply/app-secret-name` before every stack redeploy; that file contains only a version name. If interrupted after the name is saved, deploy the stack with that pointer to finish the rotation, then verify service health. Old encrypted secret versions remain for recovery.

## Build and start (server operator)

1. Inspect the existing server, branch, source archive and secret names. Do not replace another session's deployment.
2. Initialize a single-node Swarm if inactive. Bind its manager listener to loopback; keep cluster ports blocked externally. Suppress `swarm init` output because it includes join credentials.
3. Run the bootstrap only on a fresh installation. Validate `docker stack config -c docker-stack.private.yml` without printing resolved secrets.
4. `docker build -t openreply-app:review .` then `docker stack deploy --resolve-image never -c docker-stack.private.yml openreply`.
5. Inspect service status, call `/api/health` from inside the web container, verify all four statuses, confirm zero connected accounts/campaigns, and scan public ports externally.

A successful HTTP connection alone is not a health pass: the Docker health probe requires status 200; the endpoint returns 503 on dependency failure/stuck queue/stale heartbeat and bounds dependency checks to three seconds. The body exposes only status strings.

## HTTPS and certificate persistence

`deploy/Caddyfile` redirects the entry page to sign-in and proxies the app. TLS validation, login HTTP 200, HTTP-to-HTTPS 308, and health HTTP 200 were verified externally on 26 November. The health response contains only four dependency status strings.

Certificate keys and ACME account state live in Caddy's memory-backed `/data`. `scripts/caddy-secret-state.py init` creates an empty encrypted Docker secret; after certificate issuance, `snapshot` captures the state in memory, creates a versioned Docker secret, and rotates the Caddy service to restore that state on restart. The pointer `/var/lib/openreply/tls-secret-name` contains only the secret NAME. The script never writes secret values to regular files or logs. Old encrypted versions remain for recovery.

The installed `openreply-tls-state.timer` snapshots after boot and every 12 hours to preserve renewals. Check its last service result after upgrades. Before a stack redeploy, set `CADDY_STATE_SECRET` to the name in that server pointer, then deploy both stack files together. Do not redeploy an old TLS secret or expose Docker's manager port. A snapshot rotates Caddy only when its canonical persistent state changes, which can briefly interrupt HTTPS on this single-node deployment.

After the approved login-mail setup is enabled, also include `docker-stack.login.yml`. It enables login email on the web service only; Meta connections and outbound delivery remain off. Always read `APP_SECRET_NAME` from the current server pointer before deploying, especially after Luke has privately installed another provider credential. Never redeploy while his installer is running. Docker configs are immutable, so use a new Caddy config name when its source file changes.

## Gates before any public pilot

1. HTTPS admin approval and deployment are complete. This is separate from permission to send DMs.
2. `legacybeats.com` and its three Resend DNS records are verified. Luke approved sender setup; the sending-only key form is prepared for this domain alone. Private credential entry is pending, then login mail can be enabled. Luke initiates the actual login email test. Do not change marketing email platforms.
3. WavGrind Ad Runner (`1900442214463518`) now has the approved `OpenReply private pilot` configuration, ID `1041549725640172`: Instagram accounts only; `instagram_basic`, `instagram_manage_comments`, `instagram_manage_messages`; 60-day system-user tokens. Meta marks it Instagram Login Compatible and the callback `https://2-29-58-59.sslip.io/api/instagram/callback` is saved. Comments access is Ready for testing; no formal App Review submission made. Meta app-secret entry and webhook registration remain pending. The Instagram webhook callback was empty when inspected; recheck before registering and do not overwrite another system's consumer. Renew/reconnect before token expiry after the first account connection.
4. Only after setup approval enable account connections. Unified grants are filtered to `wavgrind` and `legacybeats` before profile lookups/subscriptions; the Sonix ID is blocked as well. No Sonix setup, data pulls, or subscriptions.
5. Confirm `flip` is unused in ManyChat; get the exact approved DM, target post and pilot scope. Luke chose `https://wavgrind.com/pages/morpho-gold` as the destination (live page verified HTTP 200). Create only a paused @wavgrind campaign with whole-word `flip`; leave public replies and inbound-DM triggers off. The create/import API defaults to paused, but explicit UI settings still need checking.
6. Review the saved campaign and obtain Luke's explicit send/launch OK before enabling any outbound switch or campaign. @legacybeats is connection-only in this pilot. ManyChat retains every existing keyword.

## Verification and remaining limitations

Local tests mock all outbound delivery. Database/Redis integration suites require isolated test schemas/Redis DB; they must not run against customer data. The deployment itself has no connected accounts, provider credentials or approved campaign copy. SMTP was removed to eliminate unused vulnerable dependencies; this fork supports Resend login only. The `effect` override is a patched compatible v3 release for Prisma's config dependency.

HTTPS has passed; real email/Meta/DM end-to-end checks remain pending setup and approvals. The server has no purchased backup service; do not add a paid backup or resize it without Luke's OK.
