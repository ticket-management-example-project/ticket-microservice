import { InvalidTicketException } from '../domain/exceptions/invalid-ticket.exception';
import { TenantNotFoundException } from '../domain/exceptions/tenant-not-found.exception';
import { TenantServiceUnavailableException } from '../domain/exceptions/tenant-service-unavailable.exception';
import { CreateTicketCommand } from './create-ticket.command';
import { CreateTicketHandler } from './create-ticket.handler';

describe('CreateTicketHandler', () => {
  const makeHandler = (overrides?: {
    tenant?: {
      id: string;
      organizationId: string;
      name: string;
      slug: string;
      status: string;
    } | null;
    tenantClientError?: unknown;
    token?: string;
  }) => {
    const tenantClient = {
      findTenantBySlug: overrides?.tenantClientError
        ? jest.fn().mockRejectedValue(overrides.tenantClientError)
        : jest.fn().mockResolvedValue(
            overrides?.tenant !== undefined
              ? overrides.tenant
              : {
                  id: 't-1',
                  organizationId: 'org-1',
                  name: 'Soporte',
                  slug: 'soporte',
                  status: 'active',
                },
          ),
    };
    const eventsRepository = {
      append: jest.fn().mockResolvedValue({ id: '9999999999999999', seqNo: 1 }),
    };
    const projection = { handle: jest.fn().mockResolvedValue(undefined) };
    const publisher = { mergeObjectContext: (aggregate: unknown) => aggregate };
    const trackingTokenProvider = {
      issue: jest.fn().mockReturnValue(overrides?.token ?? 'abc123'),
      verify: jest.fn(),
    };
    const snowflake = { nextId: jest.fn().mockReturnValue('9999999999999999') };
    const prisma = {
      $transaction: jest.fn((work: (tx: unknown) => Promise<unknown>) =>
        work({}),
      ),
    };

    const handler = new CreateTicketHandler(
      tenantClient as any,
      eventsRepository as any,
      projection as any,
      publisher as any,
      trackingTokenProvider as any,
      snowflake as any,
      prisma as any,
    );

    return {
      handler,
      tenantClient,
      eventsRepository,
      projection,
      trackingTokenProvider,
      snowflake,
      prisma,
    };
  };

  it('creates the Ticket open, persists TicketCreated + TicketTrackingTokenIssued, and returns the token', async () => {
    const { handler, eventsRepository, projection, trackingTokenProvider } =
      makeHandler();

    const result = await handler.execute(
      new CreateTicketCommand(
        'soporte',
        'No puedo iniciar sesión',
        'Me pide un código que nunca llega',
      ),
    );

    expect(result).toEqual({
      id: '9999999999999999',
      tenantId: 't-1',
      subject: 'No puedo iniciar sesión',
      description: 'Me pide un código que nunca llega',
      status: 'open',
      trackingToken: 'abc123',
      contactEmail: null,
    });

    expect(trackingTokenProvider.issue).toHaveBeenCalledWith(
      '9999999999999999',
    );

    expect(eventsRepository.append).toHaveBeenCalledTimes(2);
    const [createdCall, tokenIssuedCall] = eventsRepository.append.mock.calls;
    expect(createdCall[0]).toMatchObject({
      aggregateId: '9999999999999999',
      aggregateType: 'ticket',
      eventType: 'TicketCreated',
    });
    expect(createdCall[0].payload.correlationId).toBe('9999999999999999');
    expect(tokenIssuedCall[0]).toMatchObject({
      aggregateId: '9999999999999999',
      aggregateType: 'ticket',
      eventType: 'TicketTrackingTokenIssued',
    });
    expect(tokenIssuedCall[0].payload.data).toMatchObject({ token: 'abc123' });

    expect(projection.handle).toHaveBeenCalledTimes(2);
  });

  it('persists a captured contactEmail on the TicketCreated event/envelope', async () => {
    const { handler, eventsRepository } = makeHandler();

    const result = await handler.execute(
      new CreateTicketCommand(
        'soporte',
        'Asunto',
        'Descripción',
        undefined,
        'maria@example.com',
      ),
    );

    expect(result.contactEmail).toBe('maria@example.com');
    const [createdCall] = eventsRepository.append.mock.calls;
    expect(createdCall[0].payload.data.contactEmail).toBe('maria@example.com');
  });

  it('throws TENANT_NOT_FOUND and persists nothing when the slug does not resolve to a Tenant', async () => {
    const { handler, eventsRepository, projection } = makeHandler({
      tenant: null,
    });

    await expect(
      handler.execute(
        new CreateTicketCommand('missing-slug', 'Asunto', 'Descripción'),
      ),
    ).rejects.toBeInstanceOf(TenantNotFoundException);
    expect(eventsRepository.append).not.toHaveBeenCalled();
    expect(projection.handle).not.toHaveBeenCalled();
  });

  it('wraps a find_tenant_by_slug RPC failure in a typed TenantServiceUnavailableException', async () => {
    const { handler, eventsRepository } = makeHandler({
      tenantClientError: new Error('NATS timeout'),
    });

    await expect(
      handler.execute(
        new CreateTicketCommand('soporte', 'Asunto', 'Descripción'),
      ),
    ).rejects.toBeInstanceOf(TenantServiceUnavailableException);
    expect(eventsRepository.append).not.toHaveBeenCalled();
  });

  it('rejects an empty subject before persisting anything, even for a resolved Tenant', async () => {
    const { handler, eventsRepository } = makeHandler();

    await expect(
      handler.execute(new CreateTicketCommand('soporte', '   ', 'Descripción')),
    ).rejects.toBeInstanceOf(InvalidTicketException);
    expect(eventsRepository.append).not.toHaveBeenCalled();
  });

  it('rejects an empty description before persisting anything', async () => {
    const { handler, eventsRepository } = makeHandler();

    await expect(
      handler.execute(new CreateTicketCommand('soporte', 'Asunto', '   ')),
    ).rejects.toBeInstanceOf(InvalidTicketException);
    expect(eventsRepository.append).not.toHaveBeenCalled();
  });

  it('logs gatewayCorrelationId when the gateway supplies one', async () => {
    const { handler } = makeHandler();
    const logSpy = jest.spyOn(
      (handler as unknown as { logger: { log: (msg: string) => void } }).logger,
      'log',
    );

    await handler.execute(
      new CreateTicketCommand(
        'soporte',
        'Asunto',
        'Descripción',
        'gw-correlation-123',
      ),
    );

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('gw-correlation-123'),
    );
  });
});
