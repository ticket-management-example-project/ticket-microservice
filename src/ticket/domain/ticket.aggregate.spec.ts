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
});
