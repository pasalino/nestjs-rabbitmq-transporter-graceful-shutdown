const amqplib = require('amqplib');
const { v4: uuidv4 } = require('uuid');

const QUEUE = 'messages';

const bootstrap = async () => {
  const conn = await amqplib.connect('amqp://localhost');

  const ch2 = await conn.createChannel();
  const message = {
    pattern: 'message',
    data: uuidv4(),
  };

  ch2.sendToQueue(QUEUE, Buffer.from(JSON.stringify(message)));
  console.log('Messages sent.');
  await ch2.close();
  await conn.close();
};

bootstrap();
