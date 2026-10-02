import { Injectable } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { TicketProjection } from '../infrastructure/ticket.projection';
import { ListTicketsByTenantQuery } from './list-tickets-by-tenant.query';

export interface QueueTicket {
  id: string;
  subject: string;
  description: string;
  status: string;
  categoryId: string | null;
  priority: string | null;
  suggestedAgentId: string | null;
  triageReview: string | null;
  createdAt: string;
}

/**
 * Story 5.2: the human queue of ONE Tenant (`open` + `queued`, never
 * `auto_resolving`), newest first. The caller (`client-gateway`) has
 * already verified Tenant membership; `trackingToken`/`requesterId`/
 * `contactEmail` are deliberately NOT part of this shape.
 */
@Injectable()
@QueryHandler(ListTicketsByTenantQuery)
export class ListTicketsByTenantHandler
  implements IQueryHandler<ListTicketsByTenantQuery, QueueTicket[]>
{
  constructor(private readonly projection: TicketProjection) {}

  async execute(query: ListTicketsByTenantQuery): Promise<QueueTicket[]> {
    const tickets = await this.projection.findQueueByTenant(query.tenantId);
    return tickets.map((ticket) => ({
      id: ticket.id,
      subject: ticket.subject,
      description: ticket.description,
      status: ticket.status,
      categoryId: ticket.categoryId,
      priority: ticket.priority,
      suggestedAgentId: ticket.suggestedAgentId,
      triageReview: ticket.triageReview,
      createdAt: ticket.createdAt,
    }));
  }
}
