import { InvalidTrackingTokenException } from '../domain/exceptions/invalid-tracking-token.exception';
import { TicketAlreadyLinkedException } from '../domain/exceptions/ticket-already-linked.exception';
import { LinkTicketToAccountCommand } from './link-ticket-to-account.command';
import { LinkTicketToAccountHandler } from './link-ticket-to-account.handler';

describe('LinkTicketToAccountHandler', () => {
  const baseTicket = {
    id: '1',
    tenantId: 't-1',
    subject: 'Asunto',
    description: 'Descripción',
    status: 'open',
    trackingToken: 'abc123',
    requesterId: null as string | null,
  };

  const makeHandler = (overrides?: {
    ticketId?: string | null;
    findByIdResults?: Array<typeof baseTicket | null>;
    claimed?: boolean;
  }) => {
    const trackingTokenProvider = {
      issue: jest.fn(),
      verify: jest
        .fn()
        .mockResolvedValue(
          overrides?.ticketId !== undefined ? overrides.ticketId : '1',
        ),
    };
    const findById = jest.fn();
    const results = overrides?.findByIdResults ?? [baseTicket];
    results.forEach((result) => findById.mockResolvedValueOnce(result));

    const projection = {
      findById,
      claimRequester: jest
        .fn()
        .mockResolvedValue(overrides?.claimed ?? true),
      handle: jest.fn().mockResolvedValue(undefined),
    };
    const eventsRepository = {
      append: jest.fn().mockResolvedValue({ id: '9999', seqNo: 2 }),
    };
    const publisher = { mergeObjectContext: (aggregate: unknown) => aggregate };
    const prisma = {
      $transaction: jest.fn((work: (tx: unknown) => Promise<unknown>) =>
        work({}),
      ),
    };

    const handler = new LinkTicketToAccountHandler(
      eventsRepository as any,
      projection as any,
      publisher as any,
      trackingTokenProvider as any,
      prisma as any,
    );

    return { handler, trackingTokenProvider, projection, eventsRepository };
  };

  it('links an unlinked Ticket via the atomic claim, persists TicketRequesterLinked, and returns the linked state', async () => {
    const { handler, trackingTokenProvider, projection, eventsRepository } =
      makeHandler({ claimed: true });

    const result = await handler.execute(
      new LinkTicketToAccountCommand('abc123', 'user_1'),
    );

    expect(trackingTokenProvider.verify).toHaveBeenCalledWith('abc123');
    expect(projection.claimRequester).toHaveBeenCalledWith(
      '1',
      'user_1',
      expect.any(String),
      expect.anything(),
    );
    expect(result).toEqual({
      id: '1',
      tenantId: 't-1',
      subject: 'Asunto',
      description: 'Descripción',
      status: 'open',
      requesterId: 'user_1',
    });

    expect(eventsRepository.append).toHaveBeenCalledTimes(1);
    expect(eventsRepository.append).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateId: '1',
        aggregateType: 'ticket',
        eventType: 'TicketRequesterLinked',
      }),
      expect.anything(),
    );
    // Only the initial lookup -- winning the claim never re-reads.
    expect(projection.findById).toHaveBeenCalledTimes(1);
  });

  it('throws InvalidTrackingTokenException, persisting nothing, when the token does not resolve', async () => {
    const { handler, eventsRepository, projection } = makeHandler({
      ticketId: null,
    });

    await expect(
      handler.execute(new LinkTicketToAccountCommand('missing', 'user_1')),
    ).rejects.toBeInstanceOf(InvalidTrackingTokenException);
    expect(projection.findById).not.toHaveBeenCalled();
    expect(projection.claimRequester).not.toHaveBeenCalled();
    expect(eventsRepository.append).not.toHaveBeenCalled();
  });

  it('throws InvalidTrackingTokenException when the resolved id has no projection row (defensive)', async () => {
    const { handler, eventsRepository, projection } = makeHandler({
      findByIdResults: [null],
    });

    await expect(
      handler.execute(new LinkTicketToAccountCommand('abc123', 'user_1')),
    ).rejects.toBeInstanceOf(InvalidTrackingTokenException);
    expect(projection.claimRequester).not.toHaveBeenCalled();
    expect(eventsRepository.append).not.toHaveBeenCalled();
  });

  it('is idempotent when the atomic claim loses to an EARLIER link to the SAME account -- re-reads instead of trusting the stale first read', async () => {
    const { handler, eventsRepository, projection } = makeHandler({
      // First read (pre-race) still shows unlinked; the claim then reports
      // it lost, and the re-read reveals it was already linked to the SAME
      // account by the time it ran.
      findByIdResults: [
        baseTicket,
        { ...baseTicket, requesterId: 'user_1' },
      ],
      claimed: false,
    });

    const result = await handler.execute(
      new LinkTicketToAccountCommand('abc123', 'user_1'),
    );

    expect(result.requesterId).toBe('user_1');
    expect(projection.findById).toHaveBeenCalledTimes(2);
    expect(eventsRepository.append).not.toHaveBeenCalled();
  });

  it('throws TicketAlreadyLinkedException when the atomic claim loses to a DIFFERENT account, persisting nothing', async () => {
    const { handler, eventsRepository, projection } = makeHandler({
      findByIdResults: [
        baseTicket,
        { ...baseTicket, requesterId: 'user_2' },
      ],
      claimed: false,
    });

    await expect(
      handler.execute(new LinkTicketToAccountCommand('abc123', 'user_1')),
    ).rejects.toBeInstanceOf(TicketAlreadyLinkedException);
    expect(projection.findById).toHaveBeenCalledTimes(2);
    expect(eventsRepository.append).not.toHaveBeenCalled();
  });
});
