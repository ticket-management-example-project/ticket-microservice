import { TicketCreatedEvent } from '../domain/events/ticket-created.event';
import { TicketTrackingTokenIssuedEvent } from '../domain/events/ticket-tracking-token-issued.event';
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

  it('handle(TicketCreated) inserts the read-model row inside a transaction, with a NULL tracking_token', async () => {
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
});
