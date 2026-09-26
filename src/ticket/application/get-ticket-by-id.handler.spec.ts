import { GetTicketByIdQuery } from './get-ticket-by-id.query';
import { GetTicketByIdHandler } from './get-ticket-by-id.handler';

describe('GetTicketByIdHandler', () => {
  it('resolves a Ticket by its aggregate id, omitting trackingToken/requesterId', async () => {
    const projection = {
      findById: jest.fn().mockResolvedValue({
        id: '1',
        tenantId: 't-1',
        subject: 'Asunto',
        description: 'Descripción',
        status: 'open',
        trackingToken: 'abc123',
        requesterId: null,
      }),
    };
    const handler = new GetTicketByIdHandler(projection as any);

    const result = await handler.execute(new GetTicketByIdQuery('1'));

    expect(projection.findById).toHaveBeenCalledWith('1');
    expect(result).toEqual({
      id: '1',
      tenantId: 't-1',
      subject: 'Asunto',
      description: 'Descripción',
      status: 'open',
    });
  });

  it('returns null (never throws) for an unknown id', async () => {
    const projection = { findById: jest.fn().mockResolvedValue(null) };
    const handler = new GetTicketByIdHandler(projection as any);

    await expect(
      handler.execute(new GetTicketByIdQuery('missing')),
    ).resolves.toBeNull();
  });
});
