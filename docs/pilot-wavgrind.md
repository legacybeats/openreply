# Morpho pilot draft — not activated

Luke chose the live destination on 26 November 2026: https://wavgrind.com/pages/morpho-gold (HTTP 200, title “Morpho Gold Edition | WavGrind”). The separate producers.wavgrind.com review draft is not the destination.

- Account: @wavgrind only. Both approved accounts are connected; @legacybeats has no campaign.
- Proposed whole-word comment keyword: `flip`. On 26 November 2026, the WavGrind ManyChat workspace (`fb658568`) was checked read-only: all 33 listed automations loaded, 40 distinct comment/story trigger summaries inspected, no `flip` trigger and no general default reply configured. Instagram settings confirmed @wavgrind. Existing automations were unchanged. Recheck before launch if setup is delayed.
- Target: Luke chose the next new Morpho reel. The paused draft is waiting and has no bound post. Before launch, select that actual Morpho reel explicitly; do not activate a generic next-reel trigger after unrelated reels have appeared.
- Proposed DM: “Here's Morpho 👇”
- Proposed button: “Check out Morpho”, linking directly to the approved sales page above.
- Public replies and inbound-DM triggers: off.
- Saved campaign: `cmwxatc1i000022lfl62dgqay`, “Morpho — FLIP pilot (awaiting Morpho reel)”. Review: https://2-29-58-59.sslip.io/campaigns/cmwxatc1i000022lfl62dgqay .
- Campaign state: paused, `pendingNextReel=true`, `postId=null`, `matchAnyPost=false`, `matchAnyWord=false`. The deployed scheduler leaves paused drafts unbound, including a pause during its media lookup. Public report sharing is off.
- Database readback verified exactly one campaign on wavgrind, whole-word flip, the approved destination and button, no opening DM/follow gate/follow-up/public reply/inbound-DM trigger, and zero DM logs. The saved `{link}` token is stripped from button-message text when sending; it is not literal customer copy.
- Outbound switch: disabled. Exact copy and activation require Luke's OK.

ManyChat retains all current keywords. Do not connect or inspect Sonix Audio. No tracking parameters, sales-page edits or marketing-email changes are part of this pilot.

Validation on 26 November: production image `8de53f9` built and deployed to web/worker/cron; all six services healthy; health 200/four OK; public TCP 22/80/443 open and 3000/5432/6379/2377/7946 inaccessible. Typecheck and targeted lint pass, 46 relevant existing tests pass, and three new real-PostgreSQL regressions pass in an isolated schema with all Instagram calls mocked. Prior core verification was 465/465 tests and zero dependency vulnerabilities. Real account webhook receipt and DM delivery await the controlled approved pilot.
