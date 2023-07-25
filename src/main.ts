import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as readline from 'node:readline';
import { GracefulServerRMQ } from './graceful-server-rmq';

async function bootstrap() {
  const app = await NestFactory.createMicroservice(AppModule, {
    strategy: new GracefulServerRMQ({
      urls: ['amqp://localhost'],
      queue: 'messages',
      waitingEndingHandlersTimeoutMs: 30000, //0 for disable timeout
      prefetchCount: 1,
      noAck: false,
    }),
  });

  await app.listen();

  process.addListener('SIGTERM', () => {
    console.log('SIGTERM');
    app
      .close()
      .then(() => {
        console.log('Exiting...');
        process.exit(0);
      })
      .catch((err) => {
        console.error(err);
        console.log('Exiting with error...');
        process.exit(1);
      });
  });
}

bootstrap();

//EXIT
readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);

process.stdin.on('keypress', (_, key) => {
  if (key && key.name == 'q') {
    console.log('RUNNING SHUT DOWN');
    process.kill(process.pid, 'SIGTERM');
  }
});
