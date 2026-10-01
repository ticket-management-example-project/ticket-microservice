import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { DOMAIN_EVENT_CONSUMER } from 'src/shared/config/services';
import {
  DomainEventConsumer,
  DomainEventMessage,
} from 'src/shared/kafka/domain-event-consumer.port';
import { ApplyTicketTriageCommand } from '../application/apply-ticket-triage.command';
import {
  TicketPriority,
  TicketRouting,
} from '../domain/events/ticket-triaged.event';

export const TRIAGE_DECISION_EVENTS_TOPIC = 'tm.triagedecision.events';
const HANDLED_EVENT_TYPE = 'TicketTriaged';
const VALID_ROUTED_TO: TicketRouting[] = ['human_queue', 'auto_resolution'];
const VALID_PRIORITY: TicketPriority[] = ['alta', 'media'];

interface TicketTriagedEnvelope {
  correlationId?: string;
  data?: {
    ticketId?: string;
    categoryId?: string | null;
    priority?: TicketPriority | null;
    suggestedAgentId?: string | null;
    routedTo?: TicketRouting;
  };
}

/**
 * `ticket-microservice`'s first Kafka consumer (spec Code Map: "no tiene
 * ningún consumer Kafka propio todavía, este será el primero"). Subscribes
 * to `agent-microservice`'s outbox topic (`tm.triagedecision.events`,
 * routed by `aggregate_type='triagedecision'`) and dispatches
 * `ApplyTicketTriageCommand` for every `TicketTriaged` message. Same shape as
 * `infra-microservice`'s `OrganizationCreatedConsumer` -- including the
 * "missing eventType header -> assume the only known event type" fallback,
 * which is safe here for the SAME reason it was safe there: `TriageDecision`
 * has exactly one lifecycle event today.
 */
@Injectable()
export class TicketTriagedConsumer implements OnModuleInit {
  private readonly logger = new Logger(TicketTriagedConsumer.name);

  constructor(
    @Inject(DOMAIN_EVENT_CONSUMER)
    private readonly consumer: DomainEventConsumer,
    private readonly commandBus: CommandBus,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.consumer.subscribe(TRIAGE_DECISION_EVENTS_TOPIC, (message) =>
      this.handle(message),
    );
  }

  private async handle(message: DomainEventMessage): Promise<void> {
    if (message.eventType && message.eventType !== HANDLED_EVENT_TYPE) {
      return; // Some other TriageDecision lifecycle event, if one is ever added.
    }
    if (!message.eventType) {
      this.logger.warn(
        'Kafka message missing "eventType" header on "tm.triagedecision.events"; assuming TicketTriaged (only known producer/event type today)',
      );
    }

    const envelope = message.value as TicketTriagedEnvelope | null;
    const data = envelope?.data;
    const ticketId = data?.ticketId ?? envelope?.correlationId;
    const routedTo = data?.routedTo;

    if (!ticketId || !routedTo) {
      this.logger.warn(
        `Skipping malformed TicketTriaged message: ${JSON.stringify(message.value)}`,
      );
      return;
    }

    // Defense in depth: `Ticket.onTicketTriagedEvent()`'s status derivation
    // trusts `routedTo` completely, so an unknown value must never reach it
    // -- same "skip and log" treatment as any other malformed message,
    // never a silent fallback to either routing outcome here.
    if (!VALID_ROUTED_TO.includes(routedTo)) {
      this.logger.warn(
        `Skipping TicketTriaged message with unknown routedTo "${routedTo}" for ticket ${ticketId}`,
      );
      return;
    }
    if (data?.priority != null && !VALID_PRIORITY.includes(data.priority)) {
      this.logger.warn(
        `Skipping TicketTriaged message with unknown priority "${data.priority}" for ticket ${ticketId}`,
      );
      return;
    }

    await this.commandBus.execute(
      new ApplyTicketTriageCommand(
        ticketId,
        data?.categoryId ?? null,
        data?.priority ?? null,
        data?.suggestedAgentId ?? null,
        routedTo,
      ),
    );
  }
}
