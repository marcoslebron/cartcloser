import { Controller, Get, Patch, Body, Param, Req, UseGuards } from '@nestjs/common';
import { MerchantsService } from './merchants.service';
import { UpdateMerchantDto } from './dto/update-merchant.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiKeyGuard } from './guards/api-key.guard';

@Controller('merchants')
export class MerchantsController {
  constructor(private merchantsService: MerchantsService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(@Req() req: any) {
    return this.merchantsService.findById(req.user.merchantId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  async updateMe(@Req() req: any, @Body() dto: UpdateMerchantDto) {
    return this.merchantsService.updateConfig(req.user.merchantId, dto);
  }

  @UseGuards(ApiKeyGuard)
  @Get(':merchantId/config')
  async getConfig(@Param('merchantId') merchantId: string) {
    return this.merchantsService.getMerchantConfig(merchantId);
  }
}
