import { InvalidTicketException } from './exceptions/invalid-ticket.exception';
import { TicketAlreadyLinkedException } from './exceptions/ticket-already-linked.exception';
import { Ticket } from './ticket.aggregate';

describe('Ticket', () => {
  it('creates an open Ticket from a valid subject/description', () => {
    const ticket = Ticket.create({
      id: '1',
      tenantId: 't-1',
      subject: '  No puedo iniciar sesión  ',
      description: '  Me pide un código que nunca llega  ',
    });

    expect(ticket.id).toBe('1');
    expect(ticket.tenantId).toBe('t-1');
    expect(ticket.subject).toBe('No puedo iniciar sesión');
    expect(ticket.description).toBe('Me pide un código que nunca llega');
    expect(ticket.status).toBe('open');
    expect(ticket.trackingToken).toBeNull();
    expect(ticket.contactEmail).toBeNull();
  });

  it('creates a Ticket with a captured contactEmail, trimmed', () => {
    const ticket = Ticket.create({
      id: '1',
      tenantId: 't-1',
      subject: 'Asunto',
      description: 'Descripción',
      contactEmail: '  maria@example.com  ',
    });

    expect(ticket.contactEmail).toBe('maria@example.com');
  });

  it('creates a Ticket with contactEmail null when omitted -- never blocks creation', () => {
    const ticket = Ticket.create({
      id: '1',
      tenantId: 't-1',
      subject: 'Asunto',
      description: 'Descripción',
    });

    expect(ticket.contactEmail).toBeNull();
  });

  it('rejects a malformed contactEmail', () => {
    expect(() =>
      Ticket.create({
        id: '1',
        tenantId: 't-1',
        subject: 'Asunto',
        description: 'Descripción',
        contactEmail: 'not-an-email',
      }),
    ).toThrow(InvalidTicketException);
  });

  it('rejects an empty subject', () => {
    expect(() =>
      Ticket.create({
        id: '1',
        tenantId: 't-1',
        subject: '   ',
        description: 'Descripción válida',
      }),
    ).toThrow(InvalidTicketException);
  });

  it('rejects an empty description', () => {
    expect(() =>
      Ticket.create({
        id: '1',
        tenantId: 't-1',
        subject: 'Asunto válido',
        description: '   ',
      }),
    ).toThrow(InvalidTicketException);
  });

  it('rejects a subject over the maximum length', () => {
    expect(() =>
      Ticket.create({
        id: '1',
        tenantId: 't-1',
        subject: 'a'.repeat(301),
        description: 'Descripción válida',
      }),
    ).toThrow(InvalidTicketException);
  });

  it('rejects a description over the maximum length', () => {
    expect(() =>
      Ticket.create({
        id: '1',
        tenantId: 't-1',
        subject: 'Asunto válido',
        description: 'a'.repeat(10001),
      }),
    ).toThrow(InvalidTicketException);
  });

  it('issueTrackingToken() sets the token on the same aggregate instance', () => {
    const ticket = Ticket.create({
      id: '1',
      tenantId: 't-1',
      subject: 'Asunto',
      description: 'Descripción',
    });

    ticket.issueTrackingToken('abc123');

    expect(ticket.trackingToken).toBe('abc123');
    // Creation fields are untouched by issuing the token.
    expect(ticket.status).toBe('open');
    expect(ticket.subject).toBe('Asunto');
  });

  it('a newly created Ticket has no requesterId', () => {
    const ticket = Ticket.create({
      id: '1',
      tenantId: 't-1',
      subject: 'Asunto',
      description: 'Descripción',
    });

    expect(ticket.requesterId).toBeNull();
  });

  describe('hydrate() + linkToAccount()', () => {
    const hydrateUnlinked = (requesterId: string | null = null) =>
      Ticket.hydrate({
        id: '1',
        tenantId: 't-1',
        subject: 'Asunto',
        description: 'Descripción',
        status: 'open',
        trackingToken: 'abc123',
        requesterId,
      });

    it('hydrate() sets trackingToken from its props instead of hardcoding null', () => {
      const ticket = hydrateUnlinked(null);

      expect(ticket.trackingToken).toBe('abc123');
    });

    it('links an unlinked Ticket to a Requester, applying TicketRequesterLinkedEvent', () => {
      const ticket = hydrateUnlinked(null);

      const linked = ticket.linkToAccount('user_1');

      expect(linked).toBe(true);
      expect(ticket.requesterId).toBe('user_1');
      expect(ticket.getUncommittedEvents()).toHaveLength(1);
    });

    it('is idempotent when already linked to the SAME requesterId -- no event reapplied', () => {
      const ticket = hydrateUnlinked('user_1');

      const linked = ticket.linkToAccount('user_1');

      expect(linked).toBe(false);
      expect(ticket.requesterId).toBe('user_1');
      expect(ticket.getUncommittedEvents()).toHaveLength(0);
    });

    it('throws TicketAlreadyLinkedException when linked to a DIFFERENT requesterId, leaving state untouched', () => {
      const ticket = hydrateUnlinked('user_1');

      expect(() => ticket.linkToAccount('user_2')).toThrow(
        TicketAlreadyLinkedException,
      );
      expect(ticket.requesterId).toBe('user_1');
      expect(ticket.getUncommittedEvents()).toHaveLength(0);
    });
  });

  describe('applyTriage()', () => {
    const hydrateUntriaged = () =>
      Ticket.hydrate({
        id: '1',
        tenantId: 't-1',
        subject: 'Asunto',
        description: 'Descripción',
        status: 'open',
        trackingToken: 'abc123',
        requesterId: null,
      });

    it('a newly created Ticket has no triage fields', () => {
      const ticket = Ticket.create({
        id: '1',
        tenantId: 't-1',
        subject: 'Asunto',
        description: 'Descripción',
      });

      expect(ticket.categoryId).toBeNull();
      expect(ticket.priority).toBeNull();
      expect(ticket.suggestedAgentId).toBeNull();
      expect(ticket.routedTo).toBeNull();
    });

    it('routed_to "auto_resolution" sets status to "auto_resolving"', () => {
      const ticket = hydrateUntriaged();

      ticket.applyTriage({
        categoryId: 'cat-1',
        priority: 'alta',
        suggestedAgentId: 'agent-1',
        routedTo: 'auto_resolution',
        occurredAt: '2026-01-01T00:00:03.000Z',
      });

      expect(ticket.categoryId).toBe('cat-1');
      expect(ticket.priority).toBe('alta');
      expect(ticket.suggestedAgentId).toBe('agent-1');
      expect(ticket.routedTo).toBe('auto_resolution');
      expect(ticket.status).toBe('auto_resolving');
      expect(ticket.getUncommittedEvents()).toHaveLength(1);
    });

    it('routed_to "human_queue" sets status to "queued"', () => {
      const ticket = hydrateUntriaged();

      ticket.applyTriage({
        categoryId: 'cat-1',
        priority: 'media',
        suggestedAgentId: null,
        routedTo: 'human_queue',
        occurredAt: '2026-01-01T00:00:03.000Z',
      });

      expect(ticket.routedTo).toBe('human_queue');
      expect(ticket.status).toBe('queued');
    });

    it('a degraded triage (every field null) still routes to the human queue', () => {
      const ticket = hydrateUntriaged();

      ticket.applyTriage({
        categoryId: null,
        priority: null,
        suggestedAgentId: null,
        routedTo: 'human_queue',
        occurredAt: '2026-01-01T00:00:03.000Z',
      });

      expect(ticket.categoryId).toBeNull();
      expect(ticket.priority).toBeNull();
      expect(ticket.suggestedAgentId).toBeNull();
      expect(ticket.routedTo).toBe('human_queue');
      expect(ticket.status).toBe('queued');
    });
  });

  describe('confirmTriage() / correctTriage() (Story 5.2)', () => {
    const hydrateQueued = (over: Record<string, unknown> = {}) =>
      Ticket.hydrate({
        id: '1',
        tenantId: 't-1',
        subject: 'Asunto',
        description: 'Descripción',
        status: 'queued',
        trackingToken: 'abc123',
        requesterId: null,
        categoryId: 'cat-1',
        priority: 'alta',
        suggestedAgentId: 'agent-1',
        routedTo: 'human_queue',
        ...over,
      });

    it('confirmTriage marks the ticket confirmed, keeping the suggested values', () => {
      const ticket = hydrateQueued();

      expect(ticket.confirmTriage('user_1')).toBe(true);

      expect(ticket.triageReview).toBe('confirmed');
      expect(ticket.categoryId).toBe('cat-1');
      expect(ticket.status).toBe('queued');
      expect(ticket.getUncommittedEvents()).toHaveLength(1);
    });

    it('confirmTriage is idempotent once reviewed', () => {
      const ticket = hydrateQueued({ triageReview: 'corrected' });

      expect(ticket.confirmTriage('user_1')).toBe(false);
      expect(ticket.getUncommittedEvents()).toHaveLength(0);
    });

    it('confirmTriage throws on a degraded triage (nothing to confirm)', () => {
      const ticket = hydrateQueued({ categoryId: null, priority: null });

      expect(() => ticket.confirmTriage('user_1')).toThrow(
        InvalidTicketException,
      );
    });

    it('both throw unless the ticket is queued', () => {
      const ticket = hydrateQueued({ status: 'auto_resolving' });

      expect(() => ticket.confirmTriage('user_1')).toThrow(
        InvalidTicketException,
      );
      expect(() =>
        ticket.correctTriage({
          categoryId: 'cat-2',
          priority: 'media',
          suggestedAgentId: null,
          reviewedBy: 'user_1',
        }),
      ).toThrow(InvalidTicketException);
    });

    it('correctTriage overwrites the three fields and marks corrected', () => {
      const ticket = hydrateQueued();

      expect(
        ticket.correctTriage({
          categoryId: 'cat-2',
          priority: 'media',
          suggestedAgentId: null,
          reviewedBy: 'user_1',
        }),
      ).toBe(true);

      expect(ticket.categoryId).toBe('cat-2');
      expect(ticket.priority).toBe('media');
      expect(ticket.suggestedAgentId).toBeNull();
      expect(ticket.triageReview).toBe('corrected');
    });

    it('correctTriage rejects an invalid priority and is idempotent for same values', () => {
      const ticket = hydrateQueued({ triageReview: 'corrected' });

      expect(() =>
        ticket.correctTriage({
          categoryId: 'cat-1',
          priority: 'baja' as any,
          suggestedAgentId: 'agent-1',
          reviewedBy: 'user_1',
        }),
      ).toThrow(InvalidTicketException);
      expect(
        ticket.correctTriage({
          categoryId: 'cat-1',
          priority: 'alta',
          suggestedAgentId: 'agent-1',
          reviewedBy: 'user_1',
        }),
      ).toBe(false);
      expect(ticket.getUncommittedEvents()).toHaveLength(0);
    });
  });
});
