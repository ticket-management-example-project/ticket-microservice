import {
  TRIAGE_DECISION_EVENTS_TOPIC,
  TicketTriagedConsumer,
} from './ticket-triaged.consumer';

describe('TicketTriagedConsumer', () => {
  const makeConsumer = () => {
    const domainEventConsumer = {
      subscribe: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      isConnected: jest.fn().mockReturnValue(true),
    };
    const commandBus = { execute: jest.fn().mockResolvedValue(undefined) };
    const consumer = new TicketTriagedConsumer(
      domainEventConsumer as any,
      commandBus as any,
    );
    return { consumer, domainEventConsumer, commandBus };
  };

  const getHandler = async (
    domainEventConsumer: ReturnType<typeof makeConsumer>['domainEventConsumer'],
    consumer: TicketTriagedConsumer,
  ) => {
    await consumer.onModuleInit();
    expect(domainEventConsumer.subscribe).toHaveBeenCalledWith(
      TRIAGE_DECISION_EVENTS_TOPIC,
      expect.any(Function),
    );
    return domainEventConsumer.subscribe.mock.calls[0][1];
  };

  it('subscribes to tm.triagedecision.events on module init', async () => {
    const { consumer, domainEventConsumer } = makeConsumer();
    await consumer.onModuleInit();
    expect(domainEventConsumer.subscribe).toHaveBeenCalledWith(
      TRIAGE_DECISION_EVENTS_TOPIC,
      expect.any(Function),
    );
  });

  it('dispatches ApplyTicketTriageCommand for a TicketTriaged message', async () => {
    const { consumer, domainEventConsumer, commandBus } = makeConsumer();
    const handler = await getHandler(domainEventConsumer, consumer);

    await handler({
      eventType: 'TicketTriaged',
      key: '1',
      value: {
        correlationId: '1',
        data: {
          ticketId: '1',
          categoryId: 'cat-1',
          priority: 'alta',
          suggestedAgentId: 'agent-1',
          routedTo: 'auto_resolution',
        },
      },
    });

    expect(commandBus.execute).toHaveBeenCalledTimes(1);
    const [command] = commandBus.execute.mock.calls[0];
    expect(command).toMatchObject({
      ticketId: '1',
      categoryId: 'cat-1',
      priority: 'alta',
      suggestedAgentId: 'agent-1',
      routedTo: 'auto_resolution',
    });
  });

  it('handles a degraded TicketTriaged message (every field null except routedTo)', async () => {
    const { consumer, domainEventConsumer, commandBus } = makeConsumer();
    const handler = await getHandler(domainEventConsumer, consumer);

    await handler({
      eventType: 'TicketTriaged',
      key: '1',
      value: {
        correlationId: '1',
        data: {
          ticketId: '1',
          categoryId: null,
          priority: null,
          suggestedAgentId: null,
          routedTo: 'human_queue',
        },
      },
    });

    expect(commandBus.execute).toHaveBeenCalledTimes(1);
    const [command] = commandBus.execute.mock.calls[0];
    expect(command).toMatchObject({
      routedTo: 'human_queue',
      categoryId: null,
    });
  });

  it('processes a message with no eventType header (assumes TicketTriaged, only known event type today)', async () => {
    const { consumer, domainEventConsumer, commandBus } = makeConsumer();
    const handler = await getHandler(domainEventConsumer, consumer);

    await handler({
      eventType: undefined,
      key: '1',
      value: {
        correlationId: '1',
        data: { ticketId: '1', routedTo: 'human_queue' },
      },
    });

    expect(commandBus.execute).toHaveBeenCalledTimes(1);
  });

  it('skips a malformed message (missing routedTo) without throwing', async () => {
    const { consumer, domainEventConsumer, commandBus } = makeConsumer();
    const handler = await getHandler(domainEventConsumer, consumer);

    await expect(
      handler({
        eventType: 'TicketTriaged',
        key: '1',
        value: { correlationId: '1', data: { ticketId: '1' } },
      }),
    ).resolves.toBeUndefined();
    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('skips a message with an unknown routedTo value without throwing', async () => {
    const { consumer, domainEventConsumer, commandBus } = makeConsumer();
    const handler = await getHandler(domainEventConsumer, consumer);

    await expect(
      handler({
        eventType: 'TicketTriaged',
        key: '1',
        value: {
          correlationId: '1',
          data: { ticketId: '1', routedTo: 'bogus_route' },
        },
      }),
    ).resolves.toBeUndefined();
    expect(commandBus.execute).not.toHaveBeenCalled();
  });

  it('skips a message with an unknown priority value without throwing', async () => {
    const { consumer, domainEventConsumer, commandBus } = makeConsumer();
    const handler = await getHandler(domainEventConsumer, consumer);

    await expect(
      handler({
        eventType: 'TicketTriaged',
        key: '1',
        value: {
          correlationId: '1',
          data: {
            ticketId: '1',
            routedTo: 'human_queue',
            priority: 'urgentissimo',
          },
        },
      }),
    ).resolves.toBeUndefined();
    expect(commandBus.execute).not.toHaveBeenCalled();
  });
});
