import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, RmqContext } from '@nestjs/microservices';
import { promisify } from 'util';

const sleep = promisify(setTimeout);

@Controller()
export class AppController {
  @EventPattern('message')
  async handler(data: string, @Ctx() context: RmqContext) {
    console.log('#### Start handle Event');
    await sleep(5000);
    console.log('##### End handle Event');
    try {
      context.getChannelRef().ack(context.getMessage());
    } catch {
      console.log('Error in ack message');
    }
  }
}
