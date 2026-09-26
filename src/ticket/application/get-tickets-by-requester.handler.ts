import { Injectable, Logger } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { TenantNotFoundException } from '../domain/exceptions/tenant-not-found.exception';
import { TenantServiceUnavailableException } from '../domain/exceptions/tenant-service-unavailable.exception';
import { TenantClient } from '../infrastructure/tenant.client';
import { TicketProjection } from '../infrastructure/ticket.projection';
import { GetTicketsByRequesterQuery } from './get-tickets-by-requester.query';

export interface TicketSummary {
  id: string;
  subject: string;
  description: string;
  status: string;
  trackingToken: string | null;
  createdAt: string;
}

/**
 * `client-gateway`'s `GET t/:tenantSlug/my-tickets` NATS handler (Story
 * 2.2). Resolves `tenantSlug` -> `tenantId` the same way `CreateTicketHandler`
 * does (NATS `find_tenant_by_slug`, `tenant-microservice`), then lists every
 * Ticket linked to `requesterId` scoped to that SAME Tenant --
 * `TicketProjection.findByRequesterId` filters by `(tenant_id, requester_id)`
 * together, so a Requester authenticated on one Tenant's portal never sees
 * Tickets linked to the same Clerk account on a DIFFERENT Tenant (I/O
 * matrix: "Ver histórico cross-Tenant").
 */
@Injectable()
@QueryHandler(GetTicketsByRequesterQuery)
export class GetTicketsByRequesterHandler
  implements IQueryHandler<GetTicketsByRequesterQuery, TicketSummary[]>
{
  private readonly logger = new Logger(GetTicketsByRequesterHandler.name);

  constructor(
    private readonly tenantClient: TenantClient,
    private readonly projection: TicketProjection,
  ) {}

  async execute(query: GetTicketsByRequesterQuery): Promise<TicketSummary[]> {
    if (query.gatewayCorrelationId) {
      this.logger.log(
        `get_tickets_by_requester gatewayCorrelationId=${query.gatewayCorrelationId} tenantSlug=${query.tenantSlug}`,
      );
    }

    let tenant: Awaited<ReturnType<TenantClient['findTenantBySlug']>>;
    try {
      tenant = await this.tenantClient.findTenantBySlug(query.tenantSlug);
    } catch (error) {
      throw new TenantServiceUnavailableException(query.tenantSlug, error);
    }

    if (!tenant) {
      throw new TenantNotFoundException(query.tenantSlug);
    }

    const tickets = await this.projection.findByRequesterId(
      query.requesterId,
      tenant.id,
    );

    return tickets.map((ticket) => ({
      id: ticket.id,
      subject: ticket.subject,
      description: ticket.description,
      status: ticket.status,
      trackingToken: ticket.trackingToken,
      createdAt: ticket.createdAt,
    }));
  }
}
