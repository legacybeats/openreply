/** Receipt metadata only: never persist IDs, message text, button payloads,
 * signatures or arbitrary provider strings in operational diagnostics. */
export function summarizeWebhookReceipt(payload: unknown) {
  const record = (value: unknown): Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown> : {};
  const items = (value: unknown) => Array.isArray(value) ? value : [];
  const root = record(payload);
  const entries = items(root.entry);
  let comments = 0, postbacks = 0, messages = 0, reads = 0, standby = 0;
  let postbacksInChanges = 0, messagesInChanges = 0, readsInChanges = 0;
  for (const rawEntry of entries) {
    const entry = record(rawEntry);
    for (const rawChange of items(entry.changes)) {
      const change = record(rawChange);
      if (change.field === 'comments') comments++;
      if (change.field === 'messaging_postbacks') postbacksInChanges++;
      if (change.field === 'messages') messagesInChanges++;
      if (change.field === 'messaging_seen') readsInChanges++;
    }
    for (const rawMessage of items(entry.messaging)) {
      const message = record(rawMessage);
      if (message.postback) postbacks++;
      if (message.message) messages++;
      if (message.read) reads++;
    }
    standby += items(entry.standby).length;
  }
  return {
    object: root.object === 'instagram' ? 'instagram' : root.object === 'page' ? 'page' : 'other',
    entries: entries.length, comments, postbacks, postbacksInChanges,
    messages, messagesInChanges, reads, readsInChanges, standby,
  };
}
