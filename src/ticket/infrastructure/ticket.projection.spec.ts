import { TicketCreatedEvent } from '../domain/events/ticket-created.event';
import { TicketTrackingTokenIssuedEvent } from '../domain/events/ticket-tracking-token-issued.event';
import { TicketRequesterLinkedEvent } from '../domain/events/ticket-requester-linked.event';
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
      createdAt: '2026-01-01T00:00:00.000Z',
    });
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
});
