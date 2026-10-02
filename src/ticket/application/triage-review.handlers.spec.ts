import { InvalidTicketException } from '../domain/exceptions/invalid-ticket.exception';
import { TicketNotFoundException } from '../domain/exceptions/ticket-not-found.exception';
import { TenantServiceUnavailableException } from '../domain/exceptions/tenant-service-unavailable.exception';
import { TriageOptionNotAvailableException } from '../domain/exceptions/triage-option-not-available.exception';
import { ConfirmTicketTriageCommand } from './confirm-ticket-triage.command';
import { ConfirmTicketTriageHandler } from './confirm-ticket-triage.handler';
import { CorrectTicketTriageCommand } from './correct-ticket-triage.command';
import { CorrectTicketTriageHandler } from './correct-ticket-triage.handler';
import { ListTicketsByTenantHandler } from './list-tickets-by-tenant.handler';
import { ListTicketsByTenantQuery } from './list-tickets-by-tenant.query';

const queuedTicket = {
  id: '1',
  tenantId: 't-1',
  subject: 'Asunto',
  description: 'Descripción',
  status: 'queued',
  trackingToken: 'abc123',
  requesterId: null as string | null,
  contactEmail: null as string | null,
  categoryId: 'cat-1' as string | null,
  priority: 'alta' as string | null,
  suggestedAgentId: 'agent-1' as string | null,
  routedTo: 'human_queue' as string | null,
  triageReview: null as string | null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const makeInfra = (ticket: typeof queuedTicket | null = queuedTicket) => {
  const projection = {
    findById: jest.fn().mockResolvedValue(ticket),
    claimTriageConfirmation: jest.fn().mockResolvedValue(true),
    writeTriageCorrection: jest.fn().mockResolvedValue(true),
    findQueueByTenant: jest.fn().mockResolvedValue(ticket ? [ticket] : []),
  };
  const eventsRepository = {
    append: jest.fn().mockResolvedValue({ id: '9', seqNo: 3 }),
  };
  const publisher = {
    mergeObjectContext: (aggregate: any) => {
      aggregate.commit = jest.fn();
      return aggregate;
    },
  };
  const prisma = {
    $transaction: jest.fn((work: (tx: unknown) => Promise<unknown>) =>
      work({}),
    ),
  };
  return { projection, eventsRepository, publisher, prisma };
};

describe('ConfirmTicketTriageHandler', () => {
  const make = (ticket?: typeof queuedTicket | null) => {
    const infra = makeInfra(ticket);
    const handler = new ConfirmTicketTriageHandler(
      infra.eventsRepository as any,
      infra.projection as any,
      infra.publisher as any,
      infra.prisma as any,
    );
    return { handler, ...infra };
  };
  const command = new ConfirmTicketTriageCommand('1', 'user_1');

  it('confirms the suggestion: atomic claim + TicketTriageConfirmed appended', async () => {
    const { handler, projection, eventsRepository } = make();

    await expect(handler.execute(command)).resolves.toBe(true);

    expect(projection.claimTriageConfirmation).toHaveBeenCalledTimes(1);
    expect(eventsRepository.append).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateId: '1',
        eventType: 'TicketTriageConfirmed',
      }),
      expect.anything(),
    );
  });

  it('is idempotent: an already-reviewed ticket appends nothing', async () => {
    const { handler, projection, eventsRepository } = make({
      ...queuedTicket,
      triageReview: 'confirmed',
    });

    await expect(handler.execute(command)).resolves.toBe(false);

    expect(projection.claimTriageConfirmation).not.toHaveBeenCalled();
    expect(eventsRepository.append).not.toHaveBeenCalled();
  });

  it('loses a concurrent race gracefully: claim returns false -> no event', async () => {
    const { handler, projection, eventsRepository } = make();
    projection.claimTriageConfirmation.mockResolvedValue(false);

    await expect(handler.execute(command)).resolves.toBe(false);

    expect(eventsRepository.append).not.toHaveBeenCalled();
  });

  it('degraded triage (no suggestion) cannot be confirmed', async () => {
    const { handler, eventsRepository } = make({
      ...queuedTicket,
      categoryId: null,
      priority: null,
      suggestedAgentId: null,
    });

    await expect(handler.execute(command)).rejects.toBeInstanceOf(
      InvalidTicketException,
    );
    expect(eventsRepository.append).not.toHaveBeenCalled();
  });

  it('a ticket still open (triage not applied yet) can be reviewed too', async () => {
    const { handler, eventsRepository } = make({ ...queuedTicket, status: 'open' });

    await expect(handler.execute(command)).resolves.toBe(true);
    expect(eventsRepository.append).toHaveBeenCalledTimes(1);
  });

  it('rejects a ticket that is not in the human queue (auto_resolving)', async () => {
    const { handler } = make({ ...queuedTicket, status: 'auto_resolving' });

    await expect(handler.execute(command)).rejects.toBeInstanceOf(
      InvalidTicketException,
    );
  });

  it('throws TicketNotFoundException for an unknown ticket', async () => {
    const { handler } = make(null);

    await expect(handler.execute(command)).rejects.toBeInstanceOf(
      TicketNotFoundException,
    );
  });
});

describe('CorrectTicketTriageHandler', () => {
  const tenantClient = {
    listCategories: jest.fn(),
    listAgents: jest.fn(),
  };
  const make = (ticket?: typeof queuedTicket | null) => {
    const infra = makeInfra(ticket);
    tenantClient.listCategories.mockReset().mockResolvedValue([
      { id: 'cat-1', isActive: true },
      { id: 'cat-2', isActive: true },
      { id: 'cat-off', isActive: false },
    ]);
    tenantClient.listAgents.mockReset().mockResolvedValue([
      { id: 'agent-1', status: 'active' },
      { id: 'agent-2', status: 'active' },
      { id: 'agent-inv', status: 'invited' },
    ]);
    const handler = new CorrectTicketTriageHandler(
      infra.eventsRepository as any,
      infra.projection as any,
      tenantClient as any,
      infra.publisher as any,
      infra.prisma as any,
    );
    return { handler, ...infra };
  };
  const correction = (over: Partial<CorrectTicketTriageCommand> = {}) =>
    Object.assign(
      new CorrectTicketTriageCommand('1', 'cat-2', 'media', 'agent-2', 'user_1'),
      over,
    );

  it('applies a correction: writes the read model and appends TicketTriageCorrected', async () => {
    const { handler, projection, eventsRepository } = make();

    await expect(handler.execute(correction())).resolves.toBe(true);

    expect(projection.writeTriageCorrection).toHaveBeenCalledWith(
      '1',
      { categoryId: 'cat-2', priority: 'media', suggestedAgentId: 'agent-2' },
      expect.any(String),
      expect.anything(),
    );
    expect(eventsRepository.append).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'TicketTriageCorrected' }),
      expect.anything(),
    );
  });

  it('allows correcting a ticket that is still open (no triage yet)', async () => {
    const { handler, eventsRepository } = make({
      ...queuedTicket,
      status: 'open',
      categoryId: null,
      priority: null,
      suggestedAgentId: null,
    });

    await expect(handler.execute(correction())).resolves.toBe(true);
    expect(eventsRepository.append).toHaveBeenCalledTimes(1);
  });

  it('loses a write race gracefully: writeTriageCorrection false -> no event, returns false', async () => {
    const { handler, projection, eventsRepository } = make();
    projection.writeTriageCorrection.mockResolvedValue(false);

    await expect(handler.execute(correction())).resolves.toBe(false);
    expect(eventsRepository.append).not.toHaveBeenCalled();
  });

  it('allows correcting a degraded triage (all null) and removing the agent', async () => {
    const { handler, eventsRepository } = make({
      ...queuedTicket,
      categoryId: null,
      priority: null,
      suggestedAgentId: null,
    });

    await expect(
      handler.execute(correction({ suggestedAgentId: null })),
    ).resolves.toBe(true);
    expect(eventsRepository.append).toHaveBeenCalledTimes(1);
    expect(tenantClient.listAgents).not.toHaveBeenCalled();
  });

  it('is idempotent: same values already corrected appends nothing', async () => {
    const { handler, eventsRepository } = make({
      ...queuedTicket,
      categoryId: 'cat-2',
      priority: 'media',
      suggestedAgentId: 'agent-2',
      triageReview: 'corrected',
    });

    await expect(handler.execute(correction())).resolves.toBe(false);
    expect(eventsRepository.append).not.toHaveBeenCalled();
  });

  it('re-correcting after a confirmation is allowed', async () => {
    const { handler } = make({ ...queuedTicket, triageReview: 'confirmed' });

    await expect(handler.execute(correction())).resolves.toBe(true);
  });

  it('rejects an inactive or foreign category with nothing persisted', async () => {
    const { handler, projection, eventsRepository } = make();

    await expect(
      handler.execute(correction({ categoryId: 'cat-off' })),
    ).rejects.toBeInstanceOf(TriageOptionNotAvailableException);
    await expect(
      handler.execute(correction({ categoryId: 'cat-other-tenant' })),
    ).rejects.toBeInstanceOf(TriageOptionNotAvailableException);
    expect(projection.writeTriageCorrection).not.toHaveBeenCalled();
    expect(eventsRepository.append).not.toHaveBeenCalled();
  });

  it('rejects a non-active or unknown agent', async () => {
    const { handler } = make();

    await expect(
      handler.execute(correction({ suggestedAgentId: 'agent-inv' })),
    ).rejects.toBeInstanceOf(TriageOptionNotAvailableException);
    await expect(
      handler.execute(correction({ suggestedAgentId: 'ghost' })),
    ).rejects.toBeInstanceOf(TriageOptionNotAvailableException);
  });

  it('rejects an invalid priority at the domain', async () => {
    const { handler } = make();

    await expect(
      handler.execute(correction({ priority: 'urgente' as any })),
    ).rejects.toBeInstanceOf(InvalidTicketException);
  });

  it('surfaces tenant-microservice being unreachable as TenantServiceUnavailableException', async () => {
    const { handler } = make();
    tenantClient.listCategories.mockRejectedValue(new Error('timeout'));

    await expect(handler.execute(correction())).rejects.toBeInstanceOf(
      TenantServiceUnavailableException,
    );
  });

  it('throws TicketNotFoundException for an unknown ticket', async () => {
    const { handler } = make(null);

    await expect(handler.execute(correction())).rejects.toBeInstanceOf(
      TicketNotFoundException,
    );
  });
});

describe('ListTicketsByTenantHandler', () => {
  it('lists the Tenant queue without tracking token / requester / contact email', async () => {
    const { projection } = makeInfra();
    const handler = new ListTicketsByTenantHandler(projection as any);

    const result = await handler.execute(new ListTicketsByTenantQuery('t-1'));

    expect(projection.findQueueByTenant).toHaveBeenCalledWith('t-1');
    expect(result).toEqual([
      {
        id: '1',
        subject: 'Asunto',
        description: 'Descripción',
        status: 'queued',
        categoryId: 'cat-1',
        priority: 'alta',
        suggestedAgentId: 'agent-1',
        triageReview: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
  });

  it('returns an empty list for a Tenant with no tickets', async () => {
    const { projection } = makeInfra(null);
    const handler = new ListTicketsByTenantHandler(projection as any);

    await expect(
      handler.execute(new ListTicketsByTenantQuery('t-1')),
    ).resolves.toEqual([]);
  });
});
