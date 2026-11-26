# Direct Instagram Login

This optional connection mode uses Meta's Instagram Login endpoints. Meta now
labels it legacy but still supported. It is an alternative diagnostic route;
enabling it does not prove incoming webhook delivery works.

Set `META_LOGIN_MODE=INSTAGRAM` only after the Instagram app's credentials,
redirect and webhook are ready. `META_CONNECTIONS_ENABLED` must also be true.
The existing `META_LOGIN_CONFIG_ID` can remain in the secret store for rollback.
Removing the mode override returns new connections to Unified Login. Each
existing account continues to use its own saved login mode and token until
reconnected; this does not change all accounts at once.

The direct route requests only `instagram_business_basic`,
`instagram_business_manage_comments`, and `instagram_business_manage_messages`.
It does not request publishing, insights, ads or Pages access. The same account
allowlist and global outbound gate apply. OAuth state is bound to the selected
login mode; restart an in-flight login after changing modes.

For the private deployment, the operator can install the Instagram app secret
with the existing hidden-input installer, selecting `instagram` and the
approved non-secret app ID. The installer preserves other provider credentials
and does not select a login mode or enable sending. Never run its input step
through an agent-recorded terminal. The webhook helper's
`--login-mode instagram` selects the Instagram app instead of the parent Meta
app; it is read-only without `--apply` and refuses to replace another consumer.

Before a user reconnects, verify the correct app ID, exact redirect URL, callback
and three subscribed fields, accepted tester role, installed secret (presence
only), all campaigns paused and every outbound gate false. The user completes
Instagram sign-in and consent. Verify the existing account row was updated,
its token is encrypted, expiry is recorded and its login mode is INSTAGRAM.
Then verify a real incoming notification with sending still off. Automated
campaign testing and production activation require their own approval.

Sources:
- https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login
- https://developers.chatwoot.com/self-hosted/configuration/features/integrations/instagram-via-instagram-business-login
