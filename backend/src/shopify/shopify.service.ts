import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { randomBytes } from 'crypto';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { Merchant } from '../merchants/merchants.entity';
import { User } from '../users/user.entity';

@Injectable()
export class ShopifyService {
  private nonceStore = new Map<string, number>(); // nonce -> expiry ms
  private readonly NONCE_TTL = 10 * 60 * 1000; // 10 minutes

  constructor(
    @InjectDataSource() private dataSource: DataSource,
    private jwtService: JwtService,
  ) {}

  generateNonce(): string {
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
    const scopes = 'read_checkouts,read_customers';
    const redirectUri = encodeURIComponent(
      `${process.env.APP_URL}/shopify/callback`,
    );
    return (
      `https://${shop}/admin/oauth/authorize` +
      `?client_id=${process.env.SHOPIFY_API_KEY}` +
      `&scope=${scopes}` +
      `&redirect_uri=${redirectUri}` +
      `&state=${nonce}`
    );
  }
}
