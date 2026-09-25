import { CreateTicketCommand } from './application/create-ticket.command';
import { GetTicketByTokenQuery } from './application/get-ticket-by-token.query';
import { TicketController } from './ticket.controller';

describe('TicketController', () => {
  const makeController = () => {
    const commandBus = {
      execute: jest.fn().mockResolvedValue({
        id: '1',
        tenantId: 't-1',
        subject: 'Asunto',
        description: 'Descripción',
        status: 'open',
        trackingToken: 'abc123',
      }),
    };
    const queryBus = {
      execute: jest.fn().mockResolvedValue({
        id: '1',
        tenantId: 't-1',
        subject: 'Asunto',
        description: 'Descripción',
        status: 'open',
        chatThread: [],
      }),
    };
    return {
      controller: new TicketController(commandBus as any, queryBus as any),
      commandBus,
      queryBus,
    };
  };

  it('create_ticket dispatches CreateTicketCommand with the DTO fields and returns the handler result', async () => {
    const { controller, commandBus } = makeController();

    const result = await controller.createTicket({
      tenantSlug: 'soporte',
      subject: 'Asunto',
      description: 'Descripción',
      correlationId: 'corr-1',
    });

    expect(commandBus.execute).toHaveBeenCalledWith(
      new CreateTicketCommand('soporte', 'Asunto', 'Descripción', 'corr-1'),
    );
    expect(result).toEqual({
      id: '1',
      tenantId: 't-1',
      subject: 'Asunto',
      description: 'Descripción',
      status: 'open',
      trackingToken: 'abc123',
    });
  });

  it('get_ticket_by_token dispatches GetTicketByTokenQuery with the token', async () => {
    const { controller, queryBus } = makeController();

    const result = await controller.getTicketByToken({ token: 'abc123' });

    expect(queryBus.execute).toHaveBeenCalledWith(
      new GetTicketByTokenQuery('abc123'),
    );
    expect(result.chatThread).toEqual([]);
  });
});
