import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({signature:vi.fn(),receipt:vi.fn(),process:vi.fn()}));
vi.mock('@/lib/db/client', () => ({prisma:{operationalEvent:{create:mocks.receipt}}}));
vi.mock('@/lib/meta/webhook', () => ({verifyWebhookSignature:mocks.signature}));
vi.mock('@/lib/queue/process-webhook', () => ({processInstagramWebhook:mocks.process}));
import { POST } from '@/app/api/webhook/route';
const payload = {object:'instagram',entry:[{id:'private-account',messaging:[{postback:{payload:'private-button'}}]}]};
const request = () => new NextRequest('https://example.test/api/webhook',{method:'POST',body:JSON.stringify(payload)});
beforeEach(()=>{vi.clearAllMocks();mocks.signature.mockReturnValue(true);mocks.receipt.mockResolvedValue({});mocks.process.mockResolvedValue(undefined);});
describe('webhook ingress diagnostics',()=>{
  it('records a metadata-only receipt even when processing excludes the account',async()=>{
    expect((await POST(request())).status).toBe(200);
    expect(mocks.receipt).toHaveBeenCalledWith({data:{source:'SYSTEM',level:'INFO',message:'Meta webhook received',payload:{object:'instagram',entries:1,comments:0,postbacks:1,postbacksInChanges:0,messages:0,reads:0,standby:0}}});
    expect(mocks.process).toHaveBeenCalledWith({payload,provider:'META'});
  });
  it('continues processing if diagnostic storage fails',async()=>{
    mocks.receipt.mockRejectedValue(new Error('internal-db-details'));
    expect((await POST(request())).status).toBe(200);
    expect(mocks.process).toHaveBeenCalledOnce();
  });
  it('does not process unauthenticated payloads',async()=>{
    mocks.signature.mockReturnValue(false);
    expect((await POST(request())).status).toBe(401);
    expect(mocks.process).not.toHaveBeenCalled();
  });
  it('records processing failure without storing exception details',async()=>{
    mocks.process.mockRejectedValue(new Error('private-credential'));
    const response=await POST(request());
    expect(response.status).toBe(500);
    expect(mocks.receipt.mock.calls[1][0].data.message).toBe('Meta webhook processing failed');
    expect(JSON.stringify(mocks.receipt.mock.calls)).not.toContain('private-credential');
    expect(JSON.stringify(await response.json())).not.toContain('private-credential');
  });
});
