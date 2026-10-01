/**
 * Port for consuming domain events from Kafka. Calco of
 * `infra-microservice`'s port (the platform's reference Kafka consumer):
 * `kafkajs` itself must never be imported outside
 * `kafka-domain-event-consumer.adapter.ts`, every other file (the consumer
 * wiring, the command handlers) depends on this port instead.
 */
export interface DomainEventMessage {
  /** Debezium's Outbox Event Router routes ALL events for an aggregate_type
   * onto the same topic (e.g. every `triagedecision` lifecycle event lands
   * on `tm.triagedecision.events`), so the event's own type must travel
   * out-of-band to let consumers filter. Carried as a Kafka message header
   * (`eventType`) by the outbox connector config. May be `undefined` if the
   * header is missing (older/misconfigured producer) -- callers must decide
   * a safe fallback. */
  eventType?: string;
  key: string | null;
  value: Record<string, unknown> | null;
}

export type DomainEventHandler = (message: DomainEventMessage) => Promise<void>;

export interface DomainEventConsumer {
  /** Subscribes `handler` to every message on `topic`. Resolves once the
   * consumer is connected and running; message handling itself continues in
   * the background for the lifetime of the process. */
  subscribe(topic: string, handler: DomainEventHandler): Promise<void>;

  disconnect(): Promise<void>;

  /** Used by the `/health` Kafka indicator -- never a fixed `true`. */
  isConnected(): boolean;
}
