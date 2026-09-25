import { CryptoTrackingTokenProvider } from './tracking-token.provider';

describe('CryptoTrackingTokenProvider', () => {
  it('issue() returns a 32-hex-char opaque token (128 bits of entropy)', () => {
    const provider = new CryptoTrackingTokenProvider({} as any);

    const token = provider.issue('ticket-1');

    expect(token).toMatch(/^[0-9a-f]{32}$/);
  });

  it('issue() never returns the same token twice in practice', () => {
    const provider = new CryptoTrackingTokenProvider({} as any);

    const a = provider.issue('ticket-1');
    const b = provider.issue('ticket-1');

    expect(a).not.toBe(b);
  });

  it('verify() resolves the aggregateId when the projection finds the token', async () => {
    const projection = {
      findByTrackingToken: jest.fn().mockResolvedValue({ id: 'ticket-1' }),
    };
    const provider = new CryptoTrackingTokenProvider(projection as any);

    await expect(provider.verify('abc')).resolves.toBe('ticket-1');
    expect(projection.findByTrackingToken).toHaveBeenCalledWith('abc');
  });

  it('verify() resolves null (never throws) when no Ticket matches the token', async () => {
    const projection = {
      findByTrackingToken: jest.fn().mockResolvedValue(null),
    };
    const provider = new CryptoTrackingTokenProvider(projection as any);

    await expect(provider.verify('missing')).resolves.toBeNull();
  });
});
