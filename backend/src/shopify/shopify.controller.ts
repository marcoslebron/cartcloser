import {
  Controller,
  Get,
  Query,
  Res,
  BadRequestException,
  ForbiddenException,
  BadGatewayException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Response } from 'express';
import { ShopifyService } from './shopify.service';

@Controller('shopify')
export class ShopifyController {
  constructor(private shopifyService: ShopifyService) {}

  @Get('install')
  install(@Query('shop') shop: string, @Res() res: Response) {
    if (!shop || !/^[a-zA-Z0-9-]+\.myshopify\.com$/.test(shop)) {
      throw new BadRequestException('Invalid shop parameter');
    }
    const nonce = this.shopifyService.generateNonce();
    const url = this.shopifyService.buildInstallUrl(shop, nonce);
    return res.redirect(url);
  }

  @Get('callback')
  async callback(
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ) {
    const { shop, code, state } = query;

    if (!this.shopifyService.validateCallbackHmac(query)) {
      throw new ForbiddenException('Invalid HMAC signature');
    }

    if (!this.shopifyService.validateNonce(state)) {
      throw new BadRequestException('Invalid or expired state');
    }

    try {
      const accessToken = await this.shopifyService.exchangeToken(shop, code);
      const { merchantId, jwt } = await this.shopifyService.upsertMerchant(shop, accessToken);

      // Register webhook — failure is non-fatal; merchant can retry from settings
      try {
        await this.shopifyService.registerWebhook(shop, accessToken, merchantId);
      } catch (webhookErr) {
        console.error(
          `[SHOPIFY] Webhook registration failed for ${shop} — merchant will need to retry: ${webhookErr instanceof Error ? webhookErr.message : webhookErr}`,
        );
      }

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
      return res.redirect(
        `${frontendUrl}/install/success?token=${jwt}&merchantId=${merchantId}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'OAuth install failed';
      if (message.includes('Token exchange failed')) {
        throw new BadGatewayException('Failed to obtain Shopify access token');
      }
      throw new InternalServerErrorException('OAuth install failed');
    }
  }
}
