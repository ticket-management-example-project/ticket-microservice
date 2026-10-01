import { ApplyTicketTriageCommand } from './apply-ticket-triage.command';
import { ApplyTicketTriageHandler } from './apply-ticket-triage.handler';

describe('ApplyTicketTriageHandler', () => {
  const baseTicket = {
    id: '1',
    tenantId: 't-1',
    subject: 'Asunto',
    description: 'Descripción',
    status: 'open',
    trackingToken: 'abc123',
    requesterId: null as string | null,
    contactEmail: null as string | null,
  };

  const makeHandler = (overrides?: {
    findByIdResult?: typeof baseTicket | null;
    claimed?: boolean;
  }) => {
    const projection = {
      findById: jest
        .fn()
        .mockResolvedValue(
          overrides?.findByIdResult !== undefined
            ? overrides.findByIdResult
            : baseTicket,
        ),
      claimTriage: jest.fn().mockResolvedValue(overrides?.claimed ?? true),
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

    const handler = new ApplyTicketTriageHandler(
      eventsRepository as any,
      projection as any,
      publisher as any,
      prisma as any,
    );

    return { handler, projection, eventsRepository };
  };

  const command = new ApplyTicketTriageCommand(
    '1',
    'cat-1',
    'alta',
    'agent-1',
    'auto_resolution',
  );

  it('applies the triage via the atomic claim and persists TicketTriaged', async () => {
    const { handler, projection, eventsRepository } = makeHandler();

    await handler.execute(command);

    expect(projection.claimTriage).toHaveBeenCalledWith(
      '1',
      {
        categoryId: 'cat-1',
        priority: 'alta',
        suggestedAgentId: 'agent-1',
        routedTo: 'auto_resolution',
        status: 'auto_resolving',
      },
      expect.any(String),
      expect.anything(),
    );
    expect(eventsRepository.append).toHaveBeenCalledTimes(1);
    expect(eventsRepository.append).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateId: '1',
        aggregateType: 'ticket',
        eventType: 'TicketTriaged',
      }),
      expect.anything(),
    );
  });

  it('derives status "queued" when routed to the human queue', async () => {
    const { handler, projection } = makeHandler();
    const humanQueueCommand = new ApplyTicketTriageCommand(
      '1',
      null,
      null,
      null,
      'human_queue',
    );

    await handler.execute(humanQueueCommand);

    expect(projection.claimTriage).toHaveBeenCalledWith(
      '1',
      expect.objectContaining({ routedTo: 'human_queue', status: 'queued' }),
      expect.any(String),
      expect.anything(),
    );
  });

  it('logs and skips (no throw) when the ticket id is unknown', async () => {
    const { handler, projection, eventsRepository } = makeHandler({
      findByIdResult: null,
    });

    await expect(handler.execute(command)).resolves.toBeUndefined();
    expect(projection.claimTriage).not.toHaveBeenCalled();
    expect(eventsRepository.append).not.toHaveBeenCalled();
  });

  it('is idempotent: skips persisting when the atomic claim loses (already triaged -- redelivery)', async () => {
    const { handler, eventsRepository } = makeHandler({ claimed: false });

    await expect(handler.execute(command)).resolves.toBeUndefined();
    expect(eventsRepository.append).not.toHaveBeenCalled();
  });
});
