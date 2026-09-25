import { of, throwError } from 'rxjs';
import { TenantClient } from './tenant.client';

describe('TenantClient', () => {
  const makeClient = (response: unknown = null) => {
    const client = { send: jest.fn().mockReturnValue(of(response)) };
    return {
      client,
      tenantClient: new TenantClient(client as any),
    };
  };

  it('sends {cmd: "find_tenant_by_slug"} with the exact {slug} payload shape', async () => {
    const { client, tenantClient } = makeClient({
      id: 't-1',
      organizationId: 'org-1',
      name: 'Soporte',
      slug: 'soporte',
      status: 'active',
    });

    await tenantClient.findTenantBySlug('soporte');

    expect(client.send).toHaveBeenCalledWith(
      { cmd: 'find_tenant_by_slug' },
      { slug: 'soporte' },
    );
  });

  it('returns null as-is when no Tenant has that slug', async () => {
    const { tenantClient } = makeClient(null);

    await expect(tenantClient.findTenantBySlug('missing')).resolves.toBeNull();
  });

  it('propagates a transport failure so the caller can wrap it in a typed exception', async () => {
    const client = {
      send: jest.fn().mockReturnValue(throwError(() => new Error('NATS down'))),
    };
    const tenantClient = new TenantClient(client as any);

    await expect(tenantClient.findTenantBySlug('soporte')).rejects.toThrow(
      'NATS down',
    );
  });
});
