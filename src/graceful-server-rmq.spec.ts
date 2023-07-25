import { ServerRMQ } from '@nestjs/microservices';
import { GracefulServerRMQ } from './graceful-server-rmq';

describe('GracefulServerRMQ', () => {
  let server: GracefulServerRMQ;

  beforeEach(() => {
    server = new GracefulServerRMQ({});
  });

  it('should Server Extends ServerRMQ"', () => {
    expect(server instanceof ServerRMQ).toBeTruthy();
  });

  describe('close', () => {
    const rmqServer = { close: jest.fn() };
    const rabbitChannel = { cancel: jest.fn() };
    const rmqChannel = {
      close: jest.fn(),
      removeSetup: jest.fn().mockImplementation((_, callback) => {
        callback(rabbitChannel);
      }),
    };

    const closeSpy = jest.spyOn(ServerRMQ.prototype, 'close');

    beforeEach(() => {
      (server as any).server = rmqServer;
      (server as any).channel = rmqChannel;
      (server as any).waitingEndingHandlersTimeoutMs = 0;
      closeSpy.mockClear();
      rabbitChannel.cancel.mockClear();
    });

    it("should doesn't call 'removeChannel' if channel is null", async () => {
      expect((server as any).closing).toEqual(false);
      (server as any).channel = null;
      await server.close();
      expect((server as any).closing).toEqual(true);
      expect(rmqChannel.removeSetup).not.toBeCalled();
      expect(rabbitChannel.cancel).not.toBeCalledTimes(1);
      expect(closeSpy).toBeCalledTimes(1);
    });

    it("should call 'removeChannel' if channel is created", async () => {
      expect((server as any).closing).toEqual(false);
      await server.close();
      expect((server as any).closing).toEqual(true);
      expect(rmqChannel.removeSetup).toBeCalled();
      expect(rabbitChannel.cancel).toBeCalledTimes(1);
      expect(closeSpy).toBeCalledTimes(1);
      expect(rmqChannel.removeSetup.mock.invocationCallOrder[0]).toBeLessThan(
        closeSpy.mock.invocationCallOrder[0],
      );
    });

    it('should cancel consumer on closing server before the channel closing', async () => {
      (server as any).consumerTag = 'SPECIFIC_CONSUMER_TAG';
      expect((server as any).closing).toEqual(false);
      await server.close();
      expect((server as any).closing).toEqual(true);
      expect(rmqChannel.removeSetup).toBeCalled();
      expect(rabbitChannel.cancel).toBeCalledTimes(1);
      expect(rabbitChannel.cancel).toBeCalledWith('SPECIFIC_CONSUMER_TAG');
      expect(closeSpy).toBeCalledTimes(1);
      expect(rabbitChannel.cancel.mock.invocationCallOrder[0]).toBeLessThan(
        closeSpy.mock.invocationCallOrder[0],
      );
      expect(rabbitChannel.cancel.mock.invocationCallOrder[0]).toBeGreaterThan(
        rmqChannel.removeSetup.mock.invocationCallOrder[0],
      );
      expect(rmqChannel.removeSetup.mock.invocationCallOrder[0]).toBeLessThan(
        closeSpy.mock.invocationCallOrder[0],
      );
    });

    it('should wait end of pending handler before closing channel', (done) => {
      (server as any).consumerTag = 'SPECIFIC_CONSUMER_TAG';
      (server as any).runningMessages = 1;
      expect((server as any).closing).toEqual(false);
      server.close().then(() => {
        expect(closeSpy).toBeCalledTimes(1);
        done();
      });
      (server as any).runningMessages = 0;
      expect(closeSpy).toBeCalledTimes(0);
    });

    it('should raise timeout if there are long pending handler', (done) => {
      (server as any).consumerTag = 'SPECIFIC_CONSUMER_TAG';
      (server as any).runningMessages = 1;
      (server as any).waitingEndingHandlersTimeoutMs = 20;
      expect((server as any).closing).toEqual(false);
      server.close().then(() => {
        expect(closeSpy).toBeCalledTimes(1);
        done();
      });
      expect(closeSpy).toBeCalledTimes(0);
    });
  });

  describe('handleMessage', () => {
    const createMessage = (payload) => ({
      content: {
        toString: () => JSON.stringify(payload),
      },
      properties: { correlationId: 1 },
    });

    it('should call base "handleMessage" and subscribe +1 messageHandler in execution', async () => {
      const message = createMessage({ pattern: '', data: '' });
      const handleMessageSpy = jest
        .spyOn(ServerRMQ.prototype, 'handleMessage')
        .mockImplementation(async () => {
          expect((server as any).runningMessages).toEqual(1);
        });

      expect((server as any).runningMessages).toEqual(0);

      await server.handleMessage(message, '');
      expect(handleMessageSpy).toBeCalledWith(message, '');
      expect((server as any).runningMessages).toEqual(0);
    });

    it('should call base "handleMessage" with rejection and subscribe +1 messageHandler in execution', async () => {
      const message = createMessage({ pattern: '', data: '' });
      const handleMessageSpy = jest
        .spyOn(ServerRMQ.prototype, 'handleMessage')
        .mockImplementationOnce(async () => {
          expect((server as any).runningMessages).toEqual(1);
          return Promise.reject('Error');
        });

      expect((server as any).runningMessages).toEqual(0);
      await expect(server.handleMessage(message, '')).rejects.toEqual('Error');
      expect(handleMessageSpy).toBeCalledWith(message, '');
      expect((server as any).runningMessages).toEqual(0);
    });
  });

  describe('setupChannel', () => {
    const queue = 'test';
    const queueOptions = {};
    const isGlobalPrefetchCount = true;
    const prefetchCount = 10;

    let channel: any = {};

    beforeEach(() => {
      (server as any)['queue'] = queue;
      (server as any)['queueOptions'] = queueOptions;
      (server as any)['isGlobalPrefetchCount'] = isGlobalPrefetchCount;
      (server as any)['prefetchCount'] = prefetchCount;

      channel = {
        assertQueue: jest.fn(() => ({})),
        prefetch: jest.fn(),
        consume: jest
          .fn()
          .mockImplementation(() => ({ consumerTag: 'CONSUMER_TAG' })),
      };
    });

    it('should call "assertQueue" with queue and queue options', async () => {
      await server.setupChannel(channel, () => null);
      expect(channel.assertQueue).toBeCalledWith(queue, queueOptions);
    });

    it('should call "prefetch" with prefetchCount and "isGlobalPrefetchCount"', async () => {
      await server.setupChannel(channel, () => null);
      expect(channel.prefetch).toBeCalledWith(
        prefetchCount,
        isGlobalPrefetchCount,
      );
    });

    it('should call "consumeChannel" method', async () => {
      await server.setupChannel(channel, () => null);
      expect(channel.consume).toBeCalled();
    });

    it('should call "resolve" function', async () => {
      const resolve = jest.fn();
      await server.setupChannel(channel, resolve);
      expect(resolve).toBeCalled();
    });

    it("should doesn't call anything is the server is in closing state", async () => {
      const resolve = jest.fn();
      (server as any).closing = true;
      await server.setupChannel(channel, resolve);
      expect(channel.assertQueue).not.toBeCalled();
      expect(channel.prefetch).not.toBeCalled();
      expect(channel.consume).not.toBeCalled();
      expect(resolve).not.toBeCalled();
    });

    it('should setup set right consumerTag', async () => {
      const resolve = jest.fn();
      expect((server as any).consumerTag).toBeNull();
      await server.setupChannel(channel, resolve);
      expect(channel.assertQueue).toBeCalled();
      expect(channel.prefetch).toBeCalled();
      expect(channel.consume).toBeCalled();
      expect(resolve).toBeCalled();
      expect((server as any).consumerTag).toEqual('CONSUMER_TAG');
    });
  });
});
