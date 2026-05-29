import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';

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
}
