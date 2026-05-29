import { Test, TestingModule } from '@nestjs/testing';
import { ShopifyService } from './shopify.service';
import * as crypto from 'crypto';

describe('ShopifyService — nonce', () => {
  let service: ShopifyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ShopifyService],
    }).compile();
    service = module.get<ShopifyService>(ShopifyService);
  });

  it('generateNonce returns a hex string and stores it', () => {
    const nonce = service.generateNonce();
    expect(nonce).toMatch(/^[a-f0-9]{32}$/);
    expect(service.validateNonce(nonce)).toBe(true);
  });

  it('validateNonce deletes nonce after use (replay protection)', () => {
    const nonce = service.generateNonce();
    service.validateNonce(nonce);
    expect(service.validateNonce(nonce)).toBe(false);
  });

  it('validateNonce returns false for unknown nonce', () => {
    expect(service.validateNonce('notreal')).toBe(false);
  });

  it('buildInstallUrl returns correct Shopify OAuth URL', () => {
    process.env.SHOPIFY_API_KEY = 'testkey';
    process.env.APP_URL = 'https://api.example.com';
    const url = service.buildInstallUrl('mystore.myshopify.com', 'abc123');
    expect(url).toContain('mystore.myshopify.com/admin/oauth/authorize');
    expect(url).toContain('client_id=testkey');
    expect(url).toContain('state=abc123');
    expect(url).toContain('read_checkouts');
    expect(url).toContain('read_customers');
  });

  afterEach(() => {
    delete process.env.SHOPIFY_API_KEY;
    delete process.env.APP_URL;
  });

  it('validateNonce returns false for expired nonce', () => {
    const realNow = Date.now;
    Date.now = () => 0; // freeze time at 0 to generate nonce with expiry at TTL ms
    const nonce = service.generateNonce();
    Date.now = () => 999_999_999_999; // jump far into the future
    expect(service.validateNonce(nonce)).toBe(false);
    Date.now = realNow; // restore
  });
});

describe('ShopifyService — HMAC validation', () => {
  let service: ShopifyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ShopifyService],
    }).compile();
    service = module.get<ShopifyService>(ShopifyService);
    process.env.SHOPIFY_API_SECRET = 'testsecret';
  });

  afterEach(() => {
    delete process.env.SHOPIFY_API_SECRET;
  });

  it('validateCallbackHmac returns true for valid hmac', () => {
    const params = { shop: 'mystore.myshopify.com', code: 'abc', state: 'nonce1' };
    const message = 'code=abc&shop=mystore.myshopify.com&state=nonce1';
    const hmac = crypto
      .createHmac('sha256', 'testsecret')
      .update(message)
      .digest('hex');
    expect(service.validateCallbackHmac({ ...params, hmac })).toBe(true);
  });

  it('validateCallbackHmac returns false for tampered params', () => {
    expect(
      service.validateCallbackHmac({
        shop: 'evil.myshopify.com',
        code: 'abc',
        state: 'nonce1',
        hmac: 'badhash',
      }),
    ).toBe(false);
  });
});

describe('ShopifyService — Shopify API calls', () => {
  let service: ShopifyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ShopifyService],
    }).compile();
    service = module.get<ShopifyService>(ShopifyService);
    process.env.SHOPIFY_API_KEY = 'testkey';
    process.env.SHOPIFY_API_SECRET = 'testsecret';
    process.env.APP_URL = 'https://api.example.com';
  });

  afterEach(() => {
    delete process.env.SHOPIFY_API_KEY;
    delete process.env.SHOPIFY_API_SECRET;
    delete process.env.APP_URL;
  });

  it('exchangeToken POSTs to Shopify and returns access_token', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'shpat_abc123' }),
    } as any);

    const token = await service.exchangeToken('mystore.myshopify.com', 'authcode');
    expect(token).toBe('shpat_abc123');
    expect(fetch).toHaveBeenCalledWith(
      'https://mystore.myshopify.com/admin/oauth/access_token',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('exchangeToken throws if Shopify returns non-OK', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400 } as any);
    await expect(
      service.exchangeToken('mystore.myshopify.com', 'badcode'),
    ).rejects.toThrow('Token exchange failed');
  });

  it('registerWebhook POSTs to Shopify webhooks API', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true } as any);
    await service.registerWebhook('mystore.myshopify.com', 'shpat_abc', 'merchant-uuid');
    expect(fetch).toHaveBeenCalledWith(
      'https://mystore.myshopify.com/admin/api/2024-01/webhooks.json',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
