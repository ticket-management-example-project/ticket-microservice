import { CreateTicketCommand } from './application/create-ticket.command';
import { GetTicketByTokenQuery } from './application/get-ticket-by-token.query';
import { LinkTicketToAccountCommand } from './application/link-ticket-to-account.command';
import { GetTicketsByRequesterQuery } from './application/get-tickets-by-requester.query';
import { GetTicketByIdQuery } from './application/get-ticket-by-id.query';
import { VerifyTrackingTokenQuery } from './application/verify-tracking-token.query';
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

  it('link_ticket_to_account dispatches LinkTicketToAccountCommand with the token/requesterId/correlationId', async () => {
    const { controller, commandBus } = makeController();

    await controller.linkTicketToAccount({
      token: 'abc123',
      requesterId: 'user_1',
      correlationId: 'corr-1',
    });

    expect(commandBus.execute).toHaveBeenCalledWith(
      new LinkTicketToAccountCommand('abc123', 'user_1', 'corr-1'),
    );
  });

  it('get_tickets_by_requester dispatches GetTicketsByRequesterQuery with the tenantSlug/requesterId/correlationId', async () => {
    const { controller, queryBus } = makeController();

    await controller.getTicketsByRequester({
      tenantSlug: 'soporte',
      requesterId: 'user_1',
      correlationId: 'corr-2',
    });

    expect(queryBus.execute).toHaveBeenCalledWith(
      new GetTicketsByRequesterQuery('soporte', 'user_1', 'corr-2'),
    );
  });

  it('get_ticket_by_id dispatches GetTicketByIdQuery with the id/correlationId', async () => {
    const { controller, queryBus } = makeController();

    await controller.getTicketById({ id: '1', correlationId: 'corr-3' });

    expect(queryBus.execute).toHaveBeenCalledWith(
      new GetTicketByIdQuery('1', 'corr-3'),
    );
  });

  it('verify_tracking_token dispatches VerifyTrackingTokenQuery with the token', async () => {
    const { controller, queryBus } = makeController();

    await controller.verifyTrackingToken({ token: 'abc123' });

    expect(queryBus.execute).toHaveBeenCalledWith(
      new VerifyTrackingTokenQuery('abc123'),
    );
  });
});
