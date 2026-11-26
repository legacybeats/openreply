import { describe, expect, it } from 'vitest';
import { summarizeWebhookReceipt } from '@/lib/meta/webhook-diagnostics';

describe('webhook receipt metadata', () => {
  it('counts direct, changes and standby envelopes without retaining private data', () => {
    const summary = summarizeWebhookReceipt({ object:'instagram', entry:[{
      id:'private-account-id',
      changes:[{field:'comments',value:{text:'private comment'}},{field:'messaging_postbacks',value:{postback:{payload:'private payload'}}}],
      messaging:[{sender:{id:'private-sender'},message:{text:'private text'},postback:{payload:'private payload'},read:{watermark:123}}],
      standby:[{message:{text:'private standby text'}}],
    }] });
    expect(summary).toEqual({object:'instagram',entries:1,comments:1,postbacks:1,postbacksInChanges:1,messages:1,reads:1,standby:1});
    expect(JSON.stringify(summary)).not.toContain('private');
  });
  it.each([null,42,'secret-string',{object:'secret-string',entry:[null,{messaging:42,changes:'secret-string'}]}])('handles malformed bodies without echoing data: %j', payload => {
    expect(() => summarizeWebhookReceipt(payload)).not.toThrow();
    expect(JSON.stringify(summarizeWebhookReceipt(payload))).not.toContain('secret-string');
  });
  it('distinguishes the Page envelope without treating it as Instagram', () => {
    expect(summarizeWebhookReceipt({object:'page',entry:[]}).object).toBe('page');
  });
});
