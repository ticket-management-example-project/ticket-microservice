import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import { NATS_SERVICE } from 'src/shared/config/services';

export interface TenantRecord {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  status: string;
}

const RPC_TIMEOUT_MS = 5000;

/**
 * Calls `tenant-microservice`'s `find_tenant_by_slug` NATS command (Story
 * 2.1) to resolve the public portal's `slug` URL segment to a `tenantId`.
 * This is the domain-level enforcement of "a Ticket cannot exist without a
 * live Tenant behind its slug": it runs here, inside `CreateTicketHandler`,
 * so the invariant holds even if `create_ticket` is invoked directly over
 * NATS, bypassing `client-gateway` -- same reasoning as
 * `tenant-microservice`'s own `OrganizationClient`.
 */
@Injectable()
export class TenantClient {
  constructor(@Inject(NATS_SERVICE) private readonly client: ClientProxy) {}

  async findTenantBySlug(slug: string): Promise<TenantRecord | null> {
    return firstValueFrom(
      this.client
        .send<TenantRecord | null>({ cmd: 'find_tenant_by_slug' }, { slug })
        .pipe(timeout(RPC_TIMEOUT_MS)),
    );
  }
}
