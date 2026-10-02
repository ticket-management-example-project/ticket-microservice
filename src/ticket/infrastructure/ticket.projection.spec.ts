import { TicketCreatedEvent } from '../domain/events/ticket-created.event';
import { TicketTrackingTokenIssuedEvent } from '../domain/events/ticket-tracking-token-issued.event';
import { TicketRequesterLinkedEvent } from '../domain/events/ticket-requester-linked.event';
import { TicketTriagedEvent } from '../domain/events/ticket-triaged.event';
import { TicketTriageConfirmedEvent } from '../domain/events/ticket-triage-confirmed.event';
import { TicketTriageCorrectedEvent } from '../domain/events/ticket-triage-corrected.event';
import { TicketProjection } from './ticket.projection';

describe('TicketProjection', () => {
  const createdEvent = new TicketCreatedEvent(
    '1',
    't-1',
    'No puedo iniciar sesión',
    'Me pide un código que nunca llega',
    '2026-01-01T00:00:00.000Z',
  );
  const tokenIssuedEvent = new TicketTrackingTokenIssuedEvent(
    '1',
    'abc123',
    '2026-01-01T00:00:01.000Z',
  );
  const requesterLinkedEvent = new TicketRequesterLinkedEvent(
    '1',
    'user_1',
    '2026-01-01T00:00:02.000Z',
  );

  const makePrisma = () => {
    const txClient = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const prisma = {
      $transaction: jest.fn(
        async (work: (tx: typeof txClient) => Promise<void>) => work(txClient),
      ),
      $queryRaw: jest.fn().mockResolvedValue([]),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    return { prisma, txClient };
  };

  it('handle(TicketCreated) inserts the read-model row inside a transaction, with a NULL tracking_token/contact_email', async () => {
    const { prisma, txClient } = makePrisma();
    const projection = new TicketProjection(prisma as any);

    await projection.handle(createdEvent);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(txClient.$executeRaw).toHaveBeenCalledTimes(1);
    const [sqlFragment] = txClient.$executeRaw.mock.calls[0];
    expect(sqlFragment.strings.join('')).toContain(
      'INSERT INTO ticket_read_model',
    );
    expect(sqlFragment.values).toEqual([
      '1',
      't-1',
      'No puedo iniciar sesión',
      'Me pide un código que nunca llega',
      null,
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
    ]);
  });

  it('handle(TicketCreated) persists a captured contactEmail', async () => {
    const { prisma, txClient } = makePrisma();
    const projection = new TicketProjection(prisma as any);
    const createdWithEmail = new TicketCreatedEvent(
      '1',
      't-1',
      'No puedo iniciar sesión',
      'Me pide un código que nunca llega',
      '2026-01-01T00:00:00.000Z',
      'maria@example.com',
    );

    await projection.handle(createdWithEmail);

    const [sqlFragment] = txClient.$executeRaw.mock.calls[0];
    expect(sqlFragment.values).toEqual([
      '1',
      't-1',
      'No puedo iniciar sesión',
      'Me pide un código que nunca llega',
      'maria@example.com',
      '2026-01-01T00:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
    ]);
  });

  it('handle(TicketCreated) runs directly on the supplied client without opening a new transaction', async () => {
    const { prisma, txClient } = makePrisma();
    const projection = new TicketProjection(prisma as any);

    await projection.handle(createdEvent, txClient);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(txClient.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('handle(TicketTrackingTokenIssued) updates tracking_token for the matching id', async () => {
    const { prisma, txClient } = makePrisma();
    const projection = new TicketProjection(prisma as any);

    await projection.handle(tokenIssuedEvent);

    expect(txClient.$executeRaw).toHaveBeenCalledTimes(1);
    const [sqlFragment] = txClient.$executeRaw.mock.calls[0];
    expect(sqlFragment.strings.join('')).toContain('UPDATE ticket_read_model');
    expect(sqlFragment.values).toEqual([
      'abc123',
      '2026-01-01T00:00:01.000Z',
      '1',
    ]);
  });

  it('findById maps snake_case columns to camelCase', async () => {
    const { prisma } = makePrisma();
    prisma.$queryRaw = jest.fn().mockResolvedValue([
      {
        id: '1',
        tenant_id: 't-1',
        subject: 'Asunto',
        description: 'Descripción',
        status: 'open',
        tracking_token: 'abc123',
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ]);
    const projection = new TicketProjection(prisma as any);

    const result = await projection.findById('1');

    expect(result).toEqual({
      id: '1',
      tenantId: 't-1',
      subject: 'Asunto',
      description: 'Descripción',
      status: 'open',
      trackingToken: 'abc123',
      requesterId: undefined,
      contactEmail: null,
      categoryId: null,
      priority: null,
      suggestedAgentId: null,
      routedTo: null,
      triageReview: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('findById converts populated category_id/suggested_agent_id BigInts to strings', async () => {
    const { prisma } = makePrisma();
    prisma.$queryRaw = jest.fn().mockResolvedValue([
      {
        id: '1',
        tenant_id: 't-1',
        subject: 'Asunto',
        description: 'Descripción',
        status: 'auto_resolving',
        tracking_token: 'abc123',
        category_id: 123n,
        priority: 'alta',
        suggested_agent_id: 456n,
        routed_to: 'auto_resolution',
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ]);
    const projection = new TicketProjection(prisma as any);

    const result = await projection.findById('1');

    expect(result?.categoryId).toBe('123');
    expect(result?.priority).toBe('alta');
    expect(result?.suggestedAgentId).toBe('456');
    expect(result?.routedTo).toBe('auto_resolution');
  });

  it('findById returns null when no row matches', async () => {
    const { prisma } = makePrisma();
    prisma.$queryRaw = jest.fn().mockResolvedValue([]);
    const projection = new TicketProjection(prisma as any);

    await expect(projection.findById('missing')).resolves.toBeNull();
  });

  it('findByTrackingToken resolves the Ticket for a valid token', async () => {
    const { prisma } = makePrisma();
    prisma.$queryRaw = jest.fn().mockResolvedValue([
      {
        id: '1',
        tenant_id: 't-1',
        subject: 'Asunto',
        description: 'Descripción',
        status: 'open',
        tracking_token: 'abc123',
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ]);
    const projection = new TicketProjection(prisma as any);

    const result = await projection.findByTrackingToken('abc123');

    expect(result?.id).toBe('1');
  });

  it('findByTrackingToken returns null for an unknown token', async () => {
    const { prisma } = makePrisma();
    prisma.$queryRaw = jest.fn().mockResolvedValue([]);
    const projection = new TicketProjection(prisma as any);

    await expect(projection.findByTrackingToken('unknown')).resolves.toBeNull();
  });

  it('handle(TicketRequesterLinked) updates requester_id for the matching id', async () => {
    const { prisma, txClient } = makePrisma();
    const projection = new TicketProjection(prisma as any);

    await projection.handle(requesterLinkedEvent);

    expect(txClient.$executeRaw).toHaveBeenCalledTimes(1);
    const [sqlFragment] = txClient.$executeRaw.mock.calls[0];
    expect(sqlFragment.strings.join('')).toContain('UPDATE ticket_read_model');
    expect(sqlFragment.values).toEqual([
      'user_1',
      '2026-01-01T00:00:02.000Z',
      '1',
    ]);
  });

  it('claimRequester runs an atomic UPDATE guarded by requester_id IS NULL, and returns true when it matches a row', async () => {
    const { txClient } = makePrisma();
    txClient.$executeRaw = jest.fn().mockResolvedValue(1);
    const projection = new TicketProjection({} as any);

    const claimed = await projection.claimRequester(
      '1',
      'user_1',
      '2026-01-01T00:00:02.000Z',
      txClient,
    );

    expect(claimed).toBe(true);
    const [sqlFragment] = txClient.$executeRaw.mock.calls[0];
    expect(sqlFragment.strings.join('')).toContain('UPDATE ticket_read_model');
    expect(sqlFragment.strings.join('')).toContain('requester_id IS NULL');
    expect(sqlFragment.values).toEqual([
      'user_1',
      '2026-01-01T00:00:02.000Z',
      '1',
    ]);
  });

  it('claimRequester returns false when no row matches (already linked to someone)', async () => {
    const { txClient } = makePrisma();
    txClient.$executeRaw = jest.fn().mockResolvedValue(0);
    const projection = new TicketProjection({} as any);

    const claimed = await projection.claimRequester(
      '1',
      'user_1',
      '2026-01-01T00:00:02.000Z',
      txClient,
    );

    expect(claimed).toBe(false);
  });

  it('findById includes requesterId, null when never linked', async () => {
    const { prisma } = makePrisma();
    prisma.$queryRaw = jest.fn().mockResolvedValue([
      {
        id: '1',
        tenant_id: 't-1',
        subject: 'Asunto',
        description: 'Descripción',
        status: 'open',
        tracking_token: 'abc123',
        requester_id: null,
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ]);
    const projection = new TicketProjection(prisma as any);

    const result = await projection.findById('1');

    expect(result?.requesterId).toBeNull();
  });

  it('findByRequesterId filters by BOTH requesterId and tenantId', async () => {
    const { prisma } = makePrisma();
    const queryRaw = jest.fn().mockResolvedValue([
      {
        id: '1',
        tenant_id: 't-1',
        subject: 'Asunto',
        description: 'Descripción',
        status: 'open',
        tracking_token: 'abc123',
        requester_id: 'user_1',
        created_at: '2026-01-01T00:00:00.000Z',
      },
    ]);
    prisma.$queryRaw = queryRaw;
    const projection = new TicketProjection(prisma as any);

    const result = await projection.findByRequesterId('user_1', 't-1');

    expect(result).toEqual([
      {
        id: '1',
        tenantId: 't-1',
        subject: 'Asunto',
        description: 'Descripción',
        status: 'open',
        trackingToken: 'abc123',
        requesterId: 'user_1',
        contactEmail: null,
        categoryId: null,
        priority: null,
        suggestedAgentId: null,
        routedTo: null,
        triageReview: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    const [sqlFragment] = queryRaw.mock.calls[0];
    expect(sqlFragment.values).toEqual(['user_1', 't-1']);
    // Regression guard: the WHERE clause must AND both columns together --
    // an accidental OR or a dropped tenant_id filter would break the I/O
    // matrix's "Ver histórico cross-Tenant" isolation while still passing a
    // values-only assertion.
    const sql = sqlFragment.strings.join('');
    expect(sql).toContain('WHERE requester_id = ');
    expect(sql).toContain('AND tenant_id = ');
    expect(sql).not.toContain(' OR ');
  });

  it('findByRequesterId returns an empty array when nothing matches', async () => {
    const { prisma } = makePrisma();
    prisma.$queryRaw = jest.fn().mockResolvedValue([]);
    const projection = new TicketProjection(prisma as any);

    await expect(
      projection.findByRequesterId('user_missing', 't-1'),
    ).resolves.toEqual([]);
  });

  it('handle(TicketTriaged) updates the triage fields and derives status "auto_resolving"', async () => {
    const { prisma, txClient } = makePrisma();
    const projection = new TicketProjection(prisma as any);
    const triagedEvent = new TicketTriagedEvent(
      '1',
      'cat-1',
      'alta',
      'agent-1',
      'auto_resolution',
      '2026-01-01T00:00:03.000Z',
    );

    await projection.handle(triagedEvent);

    expect(txClient.$executeRaw).toHaveBeenCalledTimes(1);
    const [sqlFragment] = txClient.$executeRaw.mock.calls[0];
    expect(sqlFragment.strings.join('')).toContain('UPDATE ticket_read_model');
    expect(sqlFragment.values).toEqual([
      'cat-1',
      'alta',
      'agent-1',
      'auto_resolution',
      'auto_resolving',
      '2026-01-01T00:00:03.000Z',
      '1',
    ]);
  });

  it('handle(TicketTriaged) derives status "queued" when routed to the human queue', async () => {
    const { prisma, txClient } = makePrisma();
    const projection = new TicketProjection(prisma as any);
    const triagedEvent = new TicketTriagedEvent(
      '1',
      null,
      null,
      null,
      'human_queue',
      '2026-01-01T00:00:03.000Z',
    );

    await projection.handle(triagedEvent);

    const [sqlFragment] = txClient.$executeRaw.mock.calls[0];
    expect(sqlFragment.values).toEqual([
      null,
      null,
      null,
      'human_queue',
      'queued',
      '2026-01-01T00:00:03.000Z',
      '1',
    ]);
  });

  it('claimTriage runs an atomic UPDATE guarded by routed_to IS NULL, and returns true when it matches a row', async () => {
    const { txClient } = makePrisma();
    txClient.$executeRaw = jest.fn().mockResolvedValue(1);
    const projection = new TicketProjection({} as any);

    const claimed = await projection.claimTriage(
      '1',
      {
        categoryId: 'cat-1',
        priority: 'alta',
        suggestedAgentId: 'agent-1',
        routedTo: 'auto_resolution',
        status: 'auto_resolving',
      },
      '2026-01-01T00:00:03.000Z',
      txClient,
    );

    expect(claimed).toBe(true);
    const [sqlFragment] = txClient.$executeRaw.mock.calls[0];
    expect(sqlFragment.strings.join('')).toContain('UPDATE ticket_read_model');
    expect(sqlFragment.strings.join('')).toContain('routed_to IS NULL');
    expect(sqlFragment.values).toEqual([
      'cat-1',
      'alta',
      'agent-1',
      'auto_resolution',
      'auto_resolving',
      '2026-01-01T00:00:03.000Z',
      '1',
    ]);
  });

  it('claimTriage returns false when no row matches (already triaged -- redelivery)', async () => {
    const { txClient } = makePrisma();
    txClient.$executeRaw = jest.fn().mockResolvedValue(0);
    const projection = new TicketProjection({} as any);

    const claimed = await projection.claimTriage(
      '1',
      {
        categoryId: 'cat-1',
        priority: 'alta',
        suggestedAgentId: 'agent-1',
        routedTo: 'auto_resolution',
        status: 'auto_resolving',
      },
      '2026-01-01T00:00:03.000Z',
      txClient,
    );

    expect(claimed).toBe(false);
  });

  it('findQueueByTenant filters by tenant and only open/queued, newest first', async () => {
    const { prisma } = makePrisma();
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 7n,
        tenant_id: 1n,
        category_id: 4n,
        priority: 'alta',
        suggested_agent_id: null,
        routed_to: 'human_queue',
        triage_review: 'confirmed',
        subject: 'Asunto',
        description: 'Desc',
        status: 'queued',
        tracking_token: 'tok',
        requester_id: null,
        created_at: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);
    const projection = new TicketProjection(prisma as any);

    const result = await projection.findQueueByTenant('1');

    const [sqlFragment] = prisma.$queryRaw.mock.calls[0];
    const sql = sqlFragment.strings.join('');
    expect(sql).toContain("status IN ('open', 'queued')");
    expect(sql).toContain('ORDER BY created_at DESC');
    expect(sqlFragment.values).toEqual(['1']);
    expect(result[0]).toMatchObject({
      id: '7',
      categoryId: '4',
      triageReview: 'confirmed',
    });
  });

  it('claimTriageConfirmation is guarded to open/queued, suggested, never-reviewed rows', async () => {
    const { prisma, txClient } = makePrisma();
    const projection = new TicketProjection(prisma as any);

    const claimed = await projection.claimTriageConfirmation(
      '1',
      '2026-01-01T00:00:04.000Z',
      txClient,
    );

    const [sqlFragment] = txClient.$executeRaw.mock.calls[0];
    const sql = sqlFragment.strings.join('');
    expect(sql).toContain("status IN ('open', 'queued')");
    expect(sql).toContain('category_id IS NOT NULL');
    expect(sql).toContain('triage_review IS NULL');
    expect(claimed).toBe(true);
  });

  it('writeTriageCorrection is guarded to open/queued rows, marks triage_review and reports whether a row matched', async () => {
    const { prisma, txClient } = makePrisma();
    const projection = new TicketProjection(prisma as any);
    const props = { categoryId: 'cat-2', priority: 'media', suggestedAgentId: null };

    await expect(
      projection.writeTriageCorrection('1', props, '2026-01-01T00:00:05.000Z', txClient),
    ).resolves.toBe(true);
    const sql = txClient.$executeRaw.mock.calls[0][0].strings.join('');
    expect(sql).toContain("status IN ('open', 'queued')");
    expect(sql).toContain("triage_review = 'corrected'");

    txClient.$executeRaw.mockResolvedValueOnce(0);
    await expect(
      projection.writeTriageCorrection('1', props, '2026-01-01T00:00:05.000Z', txClient),
    ).resolves.toBe(false);
  });

  it('handle(TicketTriageConfirmed) delegates to the guarded confirmation claim', async () => {
    const { prisma, txClient } = makePrisma();
    const projection = new TicketProjection(prisma as any);

    await projection.handle(
      new TicketTriageConfirmedEvent('1', 'user_1', '2026-01-01T00:00:06.000Z'),
    );

    const [fragment] = txClient.$executeRaw.mock.calls[0];
    expect(fragment.strings.join('')).toContain("triage_review = 'confirmed'");
    expect(fragment.values).toContain('1');
  });

  it('handle(TicketTriageCorrected) writes the corrected values through the guarded write', async () => {
    const { prisma, txClient } = makePrisma();
    const projection = new TicketProjection(prisma as any);

    await projection.handle(
      new TicketTriageCorrectedEvent('1', 'cat-2', 'media', 'agent-2', 'user_1', '2026-01-01T00:00:07.000Z'),
    );

    const [fragment] = txClient.$executeRaw.mock.calls[0];
    expect(fragment.strings.join('')).toContain("triage_review = 'corrected'");
    expect(fragment.values).toEqual(
      expect.arrayContaining(['cat-2', 'media', 'agent-2', '1']),
    );
  });

  it('late TicketTriaged never overwrites a human review (claimTriage and handle keep reviewed fields, force queued)', async () => {
    const { prisma, txClient } = makePrisma();
    const projection = new TicketProjection(prisma as any);

    await projection.claimTriage(
      '1',
      { categoryId: 'c', priority: 'alta', suggestedAgentId: null, routedTo: 'auto_resolution', status: 'auto_resolving' },
      '2026-01-01T00:00:08.000Z',
      txClient,
    );
    await projection.handle(
      new TicketTriagedEvent('1', 'c', 'alta', null, 'auto_resolution', '2026-01-01T00:00:08.000Z'),
    );

    for (const [fragment] of txClient.$executeRaw.mock.calls) {
      const sql = fragment.strings.join('');
      expect(sql).toContain('WHEN triage_review IS NULL THEN');
      expect(sql).toContain("ELSE 'queued' END");
      expect(sql).toContain("ELSE 'human_queue' END");
    }
  });
});
