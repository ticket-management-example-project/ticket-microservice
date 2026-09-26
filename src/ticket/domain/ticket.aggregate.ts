import { AggregateRoot } from '@nestjs/cqrs';
import { InvalidTicketException } from './exceptions/invalid-ticket.exception';
import { TicketAlreadyLinkedException } from './exceptions/ticket-already-linked.exception';
import { TicketCreatedEvent } from './events/ticket-created.event';
import { TicketTrackingTokenIssuedEvent } from './events/ticket-tracking-token-issued.event';
import { TicketRequesterLinkedEvent } from './events/ticket-requester-linked.event';

export type TicketStatus = 'open';

const MAX_SUBJECT_LENGTH = 300;
const MAX_DESCRIPTION_LENGTH = 10000;

/**
 * `Ticket` aggregate root -- `ticket-microservice`'s first real aggregate
 * (Story 2.1), calco of `tenant-microservice`'s `Tenant`
 * (`AggregateRoot`, `static create()`, `on{Event}` hydrator). Event-sourced:
 * all state mutation happens via `apply()`.
 *
 * Two lifecycle events on the SAME aggregate/event stream: `create()`
 * (`TicketCreated`) and `issueTrackingToken()` (`TicketTrackingTokenIssued`,
 * the `TrackingTokenProvider` port's own event -- spec Boundaries &
 * Constraints: "persistido como evento propio del agregado Ticket, no tabla
 * aparte"). No async triage step here -- the aggregate leaves `open`
 * immediately; Epic 5 consumes `TicketCreated` later, out of process.
 */
export class Ticket extends AggregateRoot {
  private _id: string;
  private _tenantId: string;
  private _subject: string;
  private _description: string;
  private _status: TicketStatus;
  private _trackingToken: string | null;
  private _requesterId: string | null;

  static create(props: {
    id: string;
    tenantId: string;
    subject: string;
    description: string;
  }): Ticket {
    const ticket = new Ticket();
    const subject = props.subject?.trim();
    const description = props.description?.trim();

    if (!subject) {
      throw new InvalidTicketException('subject must not be empty');
    }
    if (subject.length > MAX_SUBJECT_LENGTH) {
      throw new InvalidTicketException(
        `subject must not exceed ${MAX_SUBJECT_LENGTH} characters`,
      );
    }
    if (!description) {
      throw new InvalidTicketException('description must not be empty');
    }
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      throw new InvalidTicketException(
        `description must not exceed ${MAX_DESCRIPTION_LENGTH} characters`,
      );
    }

    ticket.apply(
      new TicketCreatedEvent(
        props.id,
        props.tenantId,
        subject,
        description,
        new Date().toISOString(),
      ),
    );
    return ticket;
  }

  /** `TrackingTokenProvider.issue()` calls this once, immediately after
   * `create()`, in the same `CreateTicketHandler` transaction -- see spec
   * Design Notes for the port contract. */
  issueTrackingToken(token: string): void {
    this.apply(
      new TicketTrackingTokenIssuedEvent(
        this._id,
        token,
        new Date().toISOString(),
      ),
    );
  }

  /**
   * Reconstitutes a Ticket from its current `ticket_read_model` row, WITHOUT
   * emitting any event -- same "read the current row instead of replaying
   * `events`" criterion as `tenant-microservice`'s `TenantAgent` aggregate
   * (see `AcceptTenantAgentHandler`'s doc comment): `ticket_read_model` is
   * this aggregate's query source of truth, so a fresh instance is seeded
   * from it per mutating command rather than via `loadFromHistory()`. Used
   * by `LinkTicketToAccountHandler` to seed `linkToAccount()`'s starting
   * `_requesterId`.
   */
  static hydrate(props: {
    id: string;
    tenantId: string;
    subject: string;
    description: string;
    status: TicketStatus;
    trackingToken: string | null;
    requesterId: string | null;
  }): Ticket {
    const ticket = new Ticket();
    ticket._id = props.id;
    ticket._tenantId = props.tenantId;
    ticket._subject = props.subject;
    ticket._description = props.description;
    ticket._status = props.status;
    ticket._trackingToken = props.trackingToken;
    ticket._requesterId = props.requesterId;
    return ticket;
  }

  /**
   * Story 2.2: links this Ticket to a Requester's lightweight Clerk account
   * (`requesterId` = Clerk's `sub` claim). Same `apply()`/`on{Event}` shape
   * as `issueTrackingToken()`, plus the domain guard the spec assigns to
   * THIS method (Boundaries & Constraints):
   *  - already linked to the SAME `requesterId` -> idempotent, returns
   *    `false`, `TicketRequesterLinkedEvent` is never reapplied.
   *  - already linked to a DIFFERENT `requesterId` -> throws
   *    `TicketAlreadyLinkedException`, nothing is applied.
   *  - not yet linked -> applies `TicketRequesterLinkedEvent`, returns
   *    `true`.
   */
  linkToAccount(requesterId: string): boolean {
    if (this._requesterId === requesterId) {
      return false;
    }
    if (this._requesterId) {
      throw new TicketAlreadyLinkedException();
    }
    this.apply(
      new TicketRequesterLinkedEvent(
        this._id,
        requesterId,
        new Date().toISOString(),
      ),
    );
    return true;
  }

  onTicketCreatedEvent(event: TicketCreatedEvent) {
    this._id = event.aggregateId;
    this._tenantId = event.tenantId;
    this._subject = event.subject;
    this._description = event.description;
    this._status = 'open';
    this._trackingToken = null;
    this._requesterId = null;
  }

  onTicketTrackingTokenIssuedEvent(event: TicketTrackingTokenIssuedEvent) {
    this._trackingToken = event.token;
  }

  onTicketRequesterLinkedEvent(event: TicketRequesterLinkedEvent) {
    this._requesterId = event.requesterId;
  }

  get id(): string {
    return this._id;
  }

  get tenantId(): string {
    return this._tenantId;
  }

  get subject(): string {
    return this._subject;
  }

  get description(): string {
    return this._description;
  }

  get status(): TicketStatus {
    return this._status;
  }

  get trackingToken(): string | null {
    return this._trackingToken;
  }

  get requesterId(): string | null {
    return this._requesterId;
  }
}
