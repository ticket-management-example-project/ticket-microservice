import { InvalidTrackingTokenException } from '../domain/exceptions/invalid-tracking-token.exception';
import { GetTicketByTokenHandler } from './get-ticket-by-token.handler';
import { GetTicketByTokenQuery } from './get-ticket-by-token.query';

describe('GetTicketByTokenHandler', () => {
  const makeHandler = (overrides?: {
    ticket?: {
      id: string;
      tenantId: string;
      subject: string;
      description: string;
      status: string;
    } | null;
  }) => {
    const projection = {
      findByTrackingToken: jest.fn().mockResolvedValue(
        overrides?.ticket !== undefined
          ? overrides.ticket
          : {
              id: '1',
              tenantId: 't-1',
              subject: 'Asunto',
              description: 'Descripción',
              status: 'open',
              trackingToken: 'abc123',
              createdAt: '2026-01-01T00:00:00.000Z',
            },
      ),
    };

    return {
      handler: new GetTicketByTokenHandler(projection as any),
      projection,
    };
  };

  it('returns the Ticket state and an empty chatThread for a valid token, via a single projection lookup', async () => {
    const { handler, projection } = makeHandler();

    const result = await handler.execute(new GetTicketByTokenQuery('abc123'));

    expect(result).toEqual({
      id: '1',
      tenantId: 't-1',
      subject: 'Asunto',
      description: 'Descripción',
      status: 'open',
      chatThread: [],
    });
    expect(projection.findByTrackingToken).toHaveBeenCalledWith('abc123');
    expect(projection.findByTrackingToken).toHaveBeenCalledTimes(1);
  });

  it('throws InvalidTrackingTokenException via the SAME single lookup when the token resolves to no Ticket', async () => {
    const { handler, projection } = makeHandler({ ticket: null });

    await expect(
      handler.execute(new GetTicketByTokenQuery('missing')),
    ).rejects.toBeInstanceOf(InvalidTrackingTokenException);
    expect(projection.findByTrackingToken).toHaveBeenCalledTimes(1);
  });

  it('never distinguishes "invalid" from "not found" -- both paths throw the exact same error shape after the same number of lookups', async () => {
    const { handler: validHandler, projection: validProjection } =
      makeHandler();
    const { handler: missingHandler, projection: missingProjection } =
      makeHandler({
        ticket: null,
      });

    const missingError = await missingHandler
      .execute(new GetTicketByTokenQuery('malformed'))
      .catch((e) => e);
    await validHandler.execute(new GetTicketByTokenQuery('abc123'));

    expect(missingError).toBeInstanceOf(InvalidTrackingTokenException);
    // Same lookup count on both the valid and the invalid/unknown path --
    // no extra DB round-trip that would let a caller infer validity from
    // timing (see handler's doc comment).
    expect(validProjection.findByTrackingToken).toHaveBeenCalledTimes(1);
    expect(missingProjection.findByTrackingToken).toHaveBeenCalledTimes(1);
  });
});
