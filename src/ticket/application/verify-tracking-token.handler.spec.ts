import { VerifyTrackingTokenQuery } from './verify-tracking-token.query';
import { VerifyTrackingTokenHandler } from './verify-tracking-token.handler';

describe('VerifyTrackingTokenHandler', () => {
  it('resolves a valid token to its ticketId', async () => {
    const trackingTokenProvider = {
      issue: jest.fn(),
      verify: jest.fn().mockResolvedValue('1'),
    };
    const handler = new VerifyTrackingTokenHandler(
      trackingTokenProvider as any,
    );

    const result = await handler.execute(
      new VerifyTrackingTokenQuery('abc123'),
    );

    expect(trackingTokenProvider.verify).toHaveBeenCalledWith('abc123');
    expect(result).toEqual({ ticketId: '1' });
  });

  it('returns { ticketId: null } (never throws) for an unknown/malformed token', async () => {
    const trackingTokenProvider = {
      issue: jest.fn(),
      verify: jest.fn().mockResolvedValue(null),
    };
    const handler = new VerifyTrackingTokenHandler(
      trackingTokenProvider as any,
    );

    await expect(
      handler.execute(new VerifyTrackingTokenQuery('unknown')),
    ).resolves.toEqual({ ticketId: null });
  });
});
