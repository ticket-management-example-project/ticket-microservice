import { InvalidTicketException } from './exceptions/invalid-ticket.exception';
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
});
