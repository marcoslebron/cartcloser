import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cart } from './carts.entity';
import { CartsService } from './carts.service';
import { WebhooksController } from './carts.controller';
import { MerchantsModule } from '../merchants/merchants.module';

@Module({
  imports: [TypeOrmModule.forFeature([Cart]), MerchantsModule],
  providers: [CartsService],
  controllers: [WebhooksController],
  exports: [CartsService],
})
export class CartsModule {}
