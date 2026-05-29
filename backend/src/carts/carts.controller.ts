import { Controller, Post, Get, Body, Param, Headers, HttpException, HttpStatus, UseGuards, Req } from '@nestjs/common';
import { CartsService } from './carts.service';
import { MerchantsService } from '../merchants/merchants.service';
import { ApiKeyGuard } from '../merchants/guards/api-key.guard';
import * as crypto from 'crypto';

@Controller('webhooks')
export class WebhooksController {
  constructor(
    private cartsService: CartsService,
    private merchantsService: MerchantsService,
  ) {}

  /**
   * Shopify webhook: checkout.abandoned
   * POST /webhooks/shopify/:merchantId
   */
  @Post('shopify/:merchantId')
  async handleShopifyWebhook(
    @Param('merchantId') merchantId: string,
    @Body() webhookData: any,
    @Headers('x-shopify-hmac-sha256') hmacHeader: string,
  ) {
    console.log(`[WEBHOOK] Received from merchant: ${merchantId}`);

    // Validate merchant exists
    const merchant = await this.merchantsService.getMerchantById(merchantId);
    if (!merchant) {
      throw new HttpException('Merchant not found', HttpStatus.NOT_FOUND);
    }

    // Validate webhook signature
    const payload = JSON.stringify(webhookData);
    const hash = crypto
      .createHmac('sha256', process.env.SHOPIFY_API_SECRET || '')
      .update(payload, 'utf8')
      .digest('base64');

    if (hash !== hmacHeader) {
      console.error('Invalid webhook signature');
      throw new HttpException('Invalid signature', HttpStatus.UNAUTHORIZED);
    }

    // Create cart
    const cart = await this.cartsService.createAbandonedCart(
      merchantId,
      webhookData,
    );

    console.log(`[CART CREATED] ${cart.id} for merchant ${merchantId}`);

    // Trigger n8n workflow
    await this.triggerN8nWorkflow(merchantId, cart);

    return {
      success: true,
      cartId: cart.id,
      message: 'Webhook processed successfully',
    };
  }

  /**
   * Internal: Call n8n workflow
   */
  private async triggerN8nWorkflow(merchantId: string, cart: any) {
    try {
      const payload = {
        merchantId,
        cartId: cart.id,
        customerPhone: cart.customerPhone,
        customerEmail: cart.customerEmail,
        cartTotal: cart.cartTotal,
        cartItems: cart.cartItems,
        checkoutUrl: cart.checkoutUrl,
      };

      console.log('[N8N] Triggering workflow with:', {
        merchantId,
        cartId: cart.id,
      });

      const response = await fetch(
        `${process.env.N8N_WEBHOOK_BASE_URL || 'http://n8n:5678'}/webhook/process-abandoned-cart`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        console.error(`[N8N ERROR] Status: ${response.status}`);
        return;
      }

      console.log('[N8N] Workflow triggered successfully');
    } catch (error) {
      console.error('[N8N ERROR]', error);
      // Don't throw - webhook already processed
    }
  }
}

@UseGuards(ApiKeyGuard)
@Controller('carts')
export class CartsController {
  constructor(private cartsService: CartsService) {}

  @Get(':id')
  async getCart(@Param('id') id: string) {
    const cart = await this.cartsService.getCart(id);
    if (!cart) throw new HttpException('Cart not found', HttpStatus.NOT_FOUND);
    return cart;
  }

  @Post(':id/message-sent')
  async messageSent(@Param('id') id: string) {
    await this.cartsService.markMessageSent(id);
    return { success: true };
  }

  @Post(':id/recovered')
  async recovered(@Param('id') id: string, @Body() body: { amount?: number }) {
    await this.cartsService.markRecovered(id, body?.amount);
    return { success: true };
  }
}
