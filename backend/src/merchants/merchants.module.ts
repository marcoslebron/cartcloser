import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Merchant } from './merchants.entity';
import { MerchantsService } from './merchants.service';
import { MerchantsController } from './merchants.controller';
import { ApiKeyGuard } from './guards/api-key.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Merchant])],
  providers: [MerchantsService, ApiKeyGuard],
  controllers: [MerchantsController],
  exports: [MerchantsService, ApiKeyGuard],
})
export class MerchantsModule {}
