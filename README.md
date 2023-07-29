# NestJs RabbitMQ Custom Transporter with the graceful shutdown 🦁 🐰 🚛

A Custom Transporter for NestJS Microservices based on RabbitMQ broker with graceful shutdown.

## 💻 Motivation

Using NestJS Microservices, you would want to have the opportunity to handle messages and ensure the associated handlers finish before the server shutdown.

In the current NestJS RabbitMQ Microservice transport implementation, the framework does execute the message handle but doesn’t take care of it in case of the server shutdown. In case of a shutdown, the handler interrupts its execution without waiting for its finish.

This is because NestJS doesn’t preserve refs about current handler executions. [Here](https://github.com/nestjs/nest/blob/67d4656623c7dc50f2cfd8d5e963678bcbf77959/packages/microservices/server/server-rmq.ts#L38) is the Nest implementation.

If you use an orchestrator (for instance K8s), you could face continuous shutdowns during the application life for various reasons (scaling, reallocation, deployment). More in general, you could face application shutdown and I think you want to close your Microservice gracefully, ending all handlers before the application exit.

## 👷‍♂️ How to GracefulServerRMQ works

The GracefulServerRMQ Custom Transporter uses all features of ServerRMQ of NestJS, in fact, it externs this class. 

To achieve the graceful shutdown without losing any execution, the custom implementation overrides the `handleMessage` method by adding a counter of the current executions. This counter allows the Custom Transporter to wait for all handlers before closing Rabbit Channel and Connection.

At the server closing (when the `close` method will be invoked):

- At first, the Server cancels the RabbitMQ consumer associated with Channel. In this way, the server will not receive any new messages present in the queue.
    - To make consumer cancellation possible, GracefulServerRMQ override the method `setupChannel` adding the storing of [consumerTag](https://amqp-node.github.io/amqplib/channel_api.html#channel_consume) of the consumer.
- The `close` method waiting for the handler counter will be 0 (nothing in execution) or a timeout happens.
- At this point, the method closes the RabbitMQ channel and connection using the base implementation.
- In the end, the application could exit graceful.

### 📝 References

The ServerRMQ uses https://github.com/jwalton/node-amqp-connection-manager in order to manage connection and channel in RabbitMQ

If you want to enter in deep on Custom Transporter of NestJS you can read the following documentation https://docs.nestjs.com/microservices/custom-transport

## ✏️ How to use this example

To use this example you should have installed:

- 🐬 Docker
- 🪢 Node 16+

Follow the steps:

1. Clone the repository
2. Install dependencies `npm i` (normally I use pnpm and then I use `pnpm i`)
3. Run the RabbiMQ instance with `docker compose up -d`
4. Run NestJS instance with `npm start`
5. Open another terminal and run send message script `npm send:message`. In this way, the server instance runs a long execution (you can see the `Start handle Event`)
6. Before the end of the long execution noticed by `End handle Event`click `z`button on NestJS instance terminal (you should see the execution of shutdown noticed by `RUNNING SHUT DOWN`message)
7. At this point, if you run graceful shutdown with `SIGTERM` before the end of long execution, you shouldn’t see the end of the process but you should wait the end of execution and at the and you should see those complete logs:

```bash
#### Start handle Event
RUNNING SHUT DOWN
SIGTERM
##### End handle Event
Exiting...
```

As you can see, the shutdown runs it’s execution, after that, the server waiting the execution of handler and in the end the process end graceful `Exiting…`

### ⚠️ Notice

In order to make the example more usable, I use some assumptions:

1. The server consume messages in queue once a time with `prefetchCount: 1` option.
2. The ack of message is send to Rabbit at the and of execution, using `noAck: false` option and the ack method in the`app.controller.ts` file.
3. The `z` button is a sugar command use to send `SIGTERM`to the server, you can see the implementation at the and of `main.ts`.
4. I use custom handler of `SIGTERM` but you can use `enableShutdownHooks` instead

## 🏗️ How to implement GracefulServerRMQ in your application

To use this implementation you can copy the `graceful-server-rmq.ts`in your application.

Implement you Microservice using GracefulServerRMQ as strategy:

```typescript
const app = await NestFactory.createMicroservice(AppModule, {
    strategy: new GracefulServerRMQ({
      urls: ['amqp://localhost'],
      queue: 'messages',
      waitingEndingHandlersTimeoutMs: 30000, //0 for disable timeout
      prefetchCount: 1,
      noAck: false,
    }),
  });
```

You can use all option of [ServerRMQ](https://docs.nestjs.com/microservices/rabbitmq) and in addition the GracefulServerRMQ expose those options:

| Param | Description | Type | Dafault |
| --- | --- | --- | --- |
| waitingEndingHandlersIntervalMs | The time between two checks of the handlers in execution. Should be reasonably small | number | 5000 |
| waitingEndingHandlersTimeoutMs | Timeout of pending executions, after which the server is shut down anyway and considers the executions to be finished. Use 0to disable | number | 500 |

Enable the `enableShutdownHooks` or close the app directly in `SIGTERM` handler. See this example!

Enjoy 😉

🚀 ***As soon as possible I'll do a library 📚.***

## 💉 How to test

Run `npm test` 

## 💬 Contribute

Contributions welcome! 

## Licence

MIT
