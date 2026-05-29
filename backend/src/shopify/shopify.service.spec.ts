import { Test, TestingModule } from '@nestjs/testing';
import { ShopifyService } from './shopify.service';

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
