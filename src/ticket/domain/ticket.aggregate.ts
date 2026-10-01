import { AggregateRoot } from '@nestjs/cqrs';
import { InvalidTicketException } from './exceptions/invalid-ticket.exception';
import { TicketAlreadyLinkedException } from './exceptions/ticket-already-linked.exception';
import { TicketCreatedEvent } from './events/ticket-created.event';
import { TicketTrackingTokenIssuedEvent } from './events/ticket-tracking-token-issued.event';
import { TicketRequesterLinkedEvent } from './events/ticket-requester-linked.event';
import {
  TicketPriority,
  TicketRouting,
  TicketTriagedEvent,
} from './events/ticket-triaged.event';

/**
 * `'queued'`/`'auto_resolving'` are Story 5.1's two triage-routing outcomes
 * (`applyTriage()`) -- `'queued'` still renders as the `open` status-pill
 * variant until a human agent claims it (Story 5.2, `progress`); the UI never
 * surfaces either of these two literally (Never: "no se toca la UI de
 * cola/triage" -- Story 5.2). `'auto_resolving'` is Epic 6's entry point.
 */
export type TicketStatus = 'open' | 'queued' | 'auto_resolving';

const MAX_SUBJECT_LENGTH = 300;
const MAX_DESCRIPTION_LENGTH = 10000;
/** Mirrors `ticket_read_model.contact_email`'s `VARCHAR(255)` column width. */
const MAX_CONTACT_EMAIL_LENGTH = 255;
/** Same shape as `client-gateway`'s DTOs' `@IsEmail()` (loose defense in
 * depth, not RFC 5322-exact) -- this domain guard only matters when
 * `create_ticket` is invoked directly over NATS, bypassing the DTO. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  private _contactEmail: string | null;
  private _categoryId: string | null;
  private _priority: TicketPriority | null;
  private _suggestedAgentId: string | null;
  private _routedTo: TicketRouting | null;

  static create(props: {
    id: string;
    tenantId: string;
    subject: string;
    description: string;
    /** Story 3.2: optional, never blocks creation when absent/empty (spec
     * Boundaries & Constraints). Format is validated ONLY when present. */
    contactEmail?: string | null;
  }): Ticket {
    const ticket = new Ticket();
    const subject = props.subject?.trim();
    const description = props.description?.trim();
    const contactEmail = props.contactEmail?.trim() || null;

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
    if (contactEmail && contactEmail.length > MAX_CONTACT_EMAIL_LENGTH) {
      throw new InvalidTicketException(
        `contactEmail must not exceed ${MAX_CONTACT_EMAIL_LENGTH} characters`,
      );
    }
    if (contactEmail && !EMAIL_PATTERN.test(contactEmail)) {
      throw new InvalidTicketException('contactEmail must be a valid email');
    }

    ticket.apply(
      new TicketCreatedEvent(
        props.id,
        props.tenantId,
        subject,
        description,
        new Date().toISOString(),
        contactEmail,
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
    /** Story 3.2: optional -- `LinkTicketToAccountHandler` (this method's
     * only caller today) doesn't touch contactEmail, so it seeds `null` when
     * omitted rather than requiring every call site to plumb it through. */
    contactEmail?: string | null;
    /** Story 5.1: optional, like `contactEmail` -- `LinkTicketToAccountHandler`
     * (today's only caller) never touches triage fields, so every one of
     * these seeds `null` when omitted rather than requiring that call site to
     * plumb them through. */
    categoryId?: string | null;
    priority?: TicketPriority | null;
    suggestedAgentId?: string | null;
    routedTo?: TicketRouting | null;
  }): Ticket {
    const ticket = new Ticket();
    ticket._id = props.id;
    ticket._tenantId = props.tenantId;
    ticket._subject = props.subject;
    ticket._description = props.description;
    ticket._status = props.status;
    ticket._trackingToken = props.trackingToken;
    ticket._requesterId = props.requesterId;
    ticket._contactEmail = props.contactEmail ?? null;
    ticket._categoryId = props.categoryId ?? null;
    ticket._priority = props.priority ?? null;
    ticket._suggestedAgentId = props.suggestedAgentId ?? null;
    ticket._routedTo = props.routedTo ?? null;
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

  /**
   * Applies Epic 5's automatic triage decision onto this Ticket (Story 5.1)
   * -- category/priority/agente sugerido plus the routing outcome
   * (`'human_queue'` cola de agentes, o `'auto_resolution'` Epic 6).
   * Idempotency against at-least-once Kafka redelivery of `TicketTriaged` is
   * enforced BEFORE this is ever called (see
   * `TicketProjection.claimTriage()`'s atomic `WHERE routed_to IS NULL`
   * guard, `ApplyTicketTriageHandler`'s only caller of this method) -- this
   * method itself carries no further guard, same division of responsibility
   * as `linkToAccount()`/`claimRequester()`.
   */
  applyTriage(props: {
    categoryId: string | null;
    priority: TicketPriority | null;
    suggestedAgentId: string | null;
    routedTo: TicketRouting;
    occurredAt: string;
  }): void {
    this.apply(
      new TicketTriagedEvent(
        this._id,
        props.categoryId,
        props.priority,
        props.suggestedAgentId,
        props.routedTo,
        props.occurredAt,
      ),
    );
  }

  onTicketCreatedEvent(event: TicketCreatedEvent) {
    this._id = event.aggregateId;
    this._tenantId = event.tenantId;
    this._subject = event.subject;
    this._description = event.description;
    this._status = 'open';
    this._trackingToken = null;
    this._requesterId = null;
    this._contactEmail = event.contactEmail ?? null;
    this._categoryId = null;
    this._priority = null;
    this._suggestedAgentId = null;
    this._routedTo = null;
  }

  onTicketTrackingTokenIssuedEvent(event: TicketTrackingTokenIssuedEvent) {
    this._trackingToken = event.token;
  }

  onTicketRequesterLinkedEvent(event: TicketRequesterLinkedEvent) {
    this._requesterId = event.requesterId;
  }

  onTicketTriagedEvent(event: TicketTriagedEvent) {
    this._categoryId = event.categoryId;
    this._priority = event.priority;
    this._suggestedAgentId = event.suggestedAgentId;
    this._routedTo = event.routedTo;
    // Explicit on the MORE consequential state (`auto_resolution` -> Epic
    // 6's entry point) rather than defaulting to it -- an unknown/malformed
    // `routedTo` (should never happen: `TicketTriagedConsumer` validates it
    // before dispatching `ApplyTicketTriageCommand`) falls back to the safer
    // `'queued'` (human queue), never silently to auto-resolution.
    this._status =
      event.routedTo === 'auto_resolution' ? 'auto_resolving' : 'queued';
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

  get contactEmail(): string | null {
    return this._contactEmail;
  }

  get categoryId(): string | null {
    return this._categoryId;
  }

  get priority(): TicketPriority | null {
    return this._priority;
  }

  get suggestedAgentId(): string | null {
    return this._suggestedAgentId;
  }

  get routedTo(): TicketRouting | null {
    return this._routedTo;
  }
}
