import { TenantNotFoundException } from '../domain/exceptions/tenant-not-found.exception';
import { TenantServiceUnavailableException } from '../domain/exceptions/tenant-service-unavailable.exception';
import { GetTicketsByRequesterHandler } from './get-tickets-by-requester.handler';
import { GetTicketsByRequesterQuery } from './get-tickets-by-requester.query';

describe('GetTicketsByRequesterHandler', () => {
  const makeHandler = (overrides?: {
    tenant?: { id: string; slug: string } | null;
    tenantClientError?: unknown;
    tickets?: Array<{
      id: string;
      subject: string;
      description: string;
      status: string;
      trackingToken: string | null;
      createdAt: string;
    }>;
  }) => {
    const tenantClient = {
      findTenantBySlug: overrides?.tenantClientError
        ? jest.fn().mockRejectedValue(overrides.tenantClientError)
        : jest
            .fn()
            .mockResolvedValue(
              overrides?.tenant !== undefined
                ? overrides.tenant
                : { id: 't-1', slug: 'soporte' },
            ),
    };
    const projection = {
      findByRequesterId: jest.fn().mockResolvedValue(overrides?.tickets ?? []),
    };

    return {
      handler: new GetTicketsByRequesterHandler(
        tenantClient as any,
        projection as any,
      ),
      tenantClient,
      projection,
    };
  };

  it('resolves the tenantSlug and lists tickets scoped to (tenantId, requesterId)', async () => {
    const { handler, tenantClient, projection } = makeHandler({
      tickets: [
        {
          id: '1',
          subject: 'Asunto',
          description: 'Descripción',
          status: 'open',
          trackingToken: 'abc123',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    const result = await handler.execute(
      new GetTicketsByRequesterQuery('soporte', 'user_1'),
    );

    expect(tenantClient.findTenantBySlug).toHaveBeenCalledWith('soporte');
    expect(projection.findByRequesterId).toHaveBeenCalledWith('user_1', 't-1');
    expect(result).toEqual([
      {
        id: '1',
        subject: 'Asunto',
        description: 'Descripción',
        status: 'open',
        trackingToken: 'abc123',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
  });

  it('throws TenantNotFoundException when the slug does not resolve to a Tenant', async () => {
    const { handler, projection } = makeHandler({ tenant: null });

    await expect(
      handler.execute(new GetTicketsByRequesterQuery('missing', 'user_1')),
    ).rejects.toBeInstanceOf(TenantNotFoundException);
    expect(projection.findByRequesterId).not.toHaveBeenCalled();
  });

  it('wraps a find_tenant_by_slug RPC failure in TenantServiceUnavailableException', async () => {
    const { handler } = makeHandler({
      tenantClientError: new Error('NATS timeout'),
    });

    await expect(
      handler.execute(new GetTicketsByRequesterQuery('soporte', 'user_1')),
    ).rejects.toBeInstanceOf(TenantServiceUnavailableException);
  });

  it('returns an empty list when the Requester has no Tickets in this Tenant', async () => {
    const { handler } = makeHandler({ tickets: [] });

    const result = await handler.execute(
      new GetTicketsByRequesterQuery('soporte', 'user_1'),
    );

    expect(result).toEqual([]);
  });

  it('logs gatewayCorrelationId when the gateway supplies one', async () => {
    const { handler } = makeHandler();
    const logSpy = jest.spyOn(
      (handler as unknown as { logger: { log: (msg: string) => void } }).logger,
      'log',
    );

    await handler.execute(
      new GetTicketsByRequesterQuery('soporte', 'user_1', 'gw-correlation-123'),
    );

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('gw-correlation-123'),
    );
  });
});
