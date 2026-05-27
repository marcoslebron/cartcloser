import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Message } from './messages.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Message])],
  providers: [],
  exports: [],
})
export class MessagesModule {}
