import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as crypto from 'crypto';

@Injectable()
export class ShopifyService {
  private nonceStore = new Map<string, number>(); // nonce -> expiry ms
  private readonly NONCE_TTL = 10 * 60 * 1000; // 10 minutes
  private readonly SCOPES = 'read_checkouts,read_customers';

  private sweepExpiredNonces(): void {
    const now = Date.now();
    for (const [key, expiry] of this.nonceStore.entries()) {
      if (now >= expiry) this.nonceStore.delete(key);
    }
  }

  generateNonce(): string {
    this.sweepExpiredNonces();
    const nonce = randomBytes(16).toString('hex');
    this.nonceStore.set(nonce, Date.now() + this.NONCE_TTL);
    return nonce;
  }

  validateNonce(nonce: string): boolean {
    const expiry = this.nonceStore.get(nonce);
    if (!expiry) return false;
    this.nonceStore.delete(nonce);
    return Date.now() < expiry;
  }

  buildInstallUrl(shop: string, nonce: string): string {
    if (!process.env.SHOPIFY_API_KEY || !process.env.APP_URL) {
      throw new Error('SHOPIFY_API_KEY and APP_URL env vars are required');
    }

    if (!/^[a-zA-Z0-9-]+\.myshopify\.com$/.test(shop)) {
      throw new Error('Invalid shop domain');
    }

    const redirectUri = encodeURIComponent(
      `${process.env.APP_URL}/shopify/callback`,
    );
    return (
      `https://${shop}/admin/oauth/authorize` +
      `?client_id=${process.env.SHOPIFY_API_KEY}` +
      `&scope=${this.SCOPES}` +
      `&redirect_uri=${redirectUri}` +
      `&state=${nonce}`
    );
  }

  validateCallbackHmac(query: Record<string, string>): boolean {
    const { hmac, ...rest } = query;
    const message = Object.keys(rest)
      .sort()
      .map((k) => `${k}=${rest[k]}`)
      .join('&');
    const digest = crypto
      .createHmac('sha256', process.env.SHOPIFY_API_SECRET || '')
      .update(message)
      .digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmac ?? ''));
    } catch {
      return false;
    }
  }

  async exchangeToken(shop: string, code: string): Promise<string> {
    const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        code,
      }),
    });
    if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
    const data = (await res.json()) as { access_token: string };
    return data.access_token;
  }

  async registerWebhook(
    shop: string,
    accessToken: string,
    merchantId: string,
  ): Promise<void> {
    const res = await fetch(
      `https://${shop}/admin/api/2024-01/webhooks.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({
          webhook: {
            topic: 'checkouts/create',
            address: `${process.env.APP_URL}/webhooks/shopify/${merchantId}`,
            format: 'json',
          },
        }),
      },
    );
    if (!res.ok) {
      console.error(`[SHOPIFY] Webhook registration failed: ${res.status}`);
    }
  }
}
