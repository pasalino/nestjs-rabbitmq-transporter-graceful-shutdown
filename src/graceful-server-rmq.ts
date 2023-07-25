import { RmqOptions, ServerRMQ } from '@nestjs/microservices';
import { Channel } from 'amqp-connection-manager';
import { promisify } from 'node:util';

const sleep = promisify(setTimeout);

export type GracefulRmqOptions = RmqOptions['options'] & {
  waitingEndingHandlersTimeoutMs?: number;
  waitingEndingHandlersIntervalMs?: number;
};

const RMQ_DEFAULT_WAITING_ENDING_HANDLERS_TIMEOUT_MS = 5000;
const RMQ_DEFAULT_WAITING_ENDING_HANDLERS_INTERVAL_MS = 500;

export class GracefulServerRMQ extends ServerRMQ {
  protected runningMessages = 0;
  protected closing = false;
  protected consumerTag: string | null = null;
  protected readonly waitingEndingHandlersTimeoutMs: number;
  protected readonly waitingEndingHandlersIntervalMs: number;

  constructor(protected readonly options: GracefulRmqOptions) {
    super(options);

    this.waitingEndingHandlersTimeoutMs =
      this.getOptionsProp(this.options, 'waitingEndingHandlersTimeoutMs') ||
      RMQ_DEFAULT_WAITING_ENDING_HANDLERS_TIMEOUT_MS;
    this.waitingEndingHandlersIntervalMs =
      this.getOptionsProp(this.options, 'waitingEndingHandlersIntervalMs') ||
      RMQ_DEFAULT_WAITING_ENDING_HANDLERS_INTERVAL_MS;
  }

  public async setupChannel(channel: Channel, callback: () => void) {
    if (this.closing) {
      return;
    }

    if (!this.queueOptions.noAssert) {
      await channel.assertQueue(this.queue, this.queueOptions);
    }
    await channel.prefetch(this.prefetchCount, this.isGlobalPrefetchCount);

    const { consumerTag } = await channel.consume(
      this.queue,
      (msg: Record<string, any>) => this.handleMessage(msg, channel),
      {
        noAck: this.noAck,
      },
    );

    this.consumerTag = consumerTag;

    callback();
  }

  protected async waitingHandlers() {
    while (this.runningMessages > 0) {
      await sleep(this.waitingEndingHandlersIntervalMs);
    }
  }

  public async handleMessage(
    message: Record<string, any>,
    channel: Channel,
  ): Promise<void> {
    this.runningMessages++;
    return super.handleMessage(message, channel).finally(() => {
      this.runningMessages--;
    });
  }

  async close(): Promise<void> {
    this.closing = true;

    if (this.channel) {
      await this.channel.removeSetup(undefined, (channel: Channel) =>
        channel.cancel(this.consumerTag),
      );
    }
    this.consumerTag = null;

    await Promise.race([
      this.waitingHandlers(),
      this.waitingEndingHandlersTimeoutMs > 0 &&
        sleep(this.waitingEndingHandlersTimeoutMs),
    ]);

    this.runningMessages = 0;
    super.close();
  }
}
