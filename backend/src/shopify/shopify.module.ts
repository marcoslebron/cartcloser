import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ShopifyService } from './shopify.service';
import { ShopifyController } from './shopify.controller';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'changeme',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  providers: [ShopifyService],
  controllers: [ShopifyController],
})
export class ShopifyModule {}
