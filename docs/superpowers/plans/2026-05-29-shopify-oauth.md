# Shopify OAuth Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `ShopifyModule` that handles the full OAuth install flow — merchant clicks install, completes the Shopify handshake, and gets a JWT + registered webhook in one shot.

**Architecture:** Three new files (`shopify.service.ts`, `shopify.controller.ts`, `shopify.module.ts`) under `src/shopify/`. The service owns all Shopify API calls and the nonce store. The controller owns the two public routes (`GET /shopify/install` and `GET /shopify/callback`). `ShopifyModule` imports `MerchantsModule` (for `MerchantsService`) and uses `DataSource` + `JwtService` directly, same pattern as `AuthService`.

**Tech Stack:** NestJS, TypeORM `DataSource` (transactions), `@nestjs/jwt`, native `fetch` (Node 18+), `crypto` (built-in), `bcrypt` (already installed)

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/shopify/shopify.service.ts` | Nonce store, HMAC validation, Shopify API calls, merchant upsert |
| Create | `src/shopify/shopify.service.spec.ts` | Unit tests for service |
| Create | `src/shopify/shopify.controller.ts` | `install` + `callback` route handlers |
| Create | `src/shopify/shopify.module.ts` | Module wiring |
| Modify | `src/app.module.ts` | Import `ShopifyModule` |
| Modify | `backend/.env.example` | Add `APP_URL` |

---

## Task 1: ShopifyService — nonce management and URL building

**Files:**
- Create: `src/shopify/shopify.service.ts`
- Create: `src/shopify/shopify.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/shopify/shopify.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ShopifyService } from './shopify.service';
import { JwtService } from '@nestjs/jwt';
import { getDataSourceToken } from '@nestjs/typeorm';

const mockDataSource = { transaction: jest.fn() };
const mockJwtService = { sign: jest.fn().mockReturnValue('mock-jwt') };

describe('ShopifyService — nonce', () => {
  let service: ShopifyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShopifyService,
        { provide: JwtService, useValue: mockJwtService },
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
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
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd backend && npm test -- --testPathPattern=shopify.service --no-coverage
```
Expected: `Cannot find module './shopify.service'`

- [ ] **Step 3: Implement the service skeleton**

Create `src/shopify/shopify.service.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
cd backend && npm test -- --testPathPattern=shopify.service --no-coverage
```
Expected: all 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/shopify/shopify.service.ts backend/src/shopify/shopify.service.spec.ts
git commit -m "feat(shopify): add ShopifyService with nonce management and install URL builder"
```

---

## Task 2: ShopifyService — HMAC validation and Shopify API calls

**Files:**
- Modify: `src/shopify/shopify.service.ts` (add 3 methods)
- Modify: `src/shopify/shopify.service.spec.ts` (add test blocks)

- [ ] **Step 1: Add failing tests**

Append to `src/shopify/shopify.service.spec.ts` (inside the file, after the existing describe block):

```typescript
describe('ShopifyService — HMAC validation', () => {
  let service: ShopifyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShopifyService,
        { provide: JwtService, useValue: mockJwtService },
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();
    service = module.get<ShopifyService>(ShopifyService);
    process.env.SHOPIFY_API_SECRET = 'testsecret';
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
      providers: [
        ShopifyService,
        { provide: JwtService, useValue: mockJwtService },
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();
    service = module.get<ShopifyService>(ShopifyService);
    process.env.SHOPIFY_API_KEY = 'testkey';
    process.env.SHOPIFY_API_SECRET = 'testsecret';
    process.env.APP_URL = 'https://api.example.com';
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
```

- [ ] **Step 2: Run tests — verify new ones fail**

```bash
cd backend && npm test -- --testPathPattern=shopify.service --no-coverage
```
Expected: new tests fail with `service.validateCallbackHmac is not a function`

- [ ] **Step 3: Add the three methods to ShopifyService**

Add after `buildInstallUrl` in `src/shopify/shopify.service.ts`:

```typescript
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
    return digest === hmac;
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
```

- [ ] **Step 4: Run tests — verify all pass**

```bash
cd backend && npm test -- --testPathPattern=shopify.service --no-coverage
```
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/shopify/shopify.service.ts backend/src/shopify/shopify.service.spec.ts
git commit -m "feat(shopify): add HMAC validation, token exchange, and webhook registration"
```

---

## Task 3: ShopifyService — merchant upsert and JWT issuance

**Files:**
- Modify: `src/shopify/shopify.service.ts` (add `upsertMerchant`)
- Modify: `src/shopify/shopify.service.spec.ts` (add test block)

- [ ] **Step 1: Add failing tests**

Append to `src/shopify/shopify.service.spec.ts`:

```typescript
describe('ShopifyService — upsertMerchant', () => {
  let service: ShopifyService;
  let mockManager: any;

  beforeEach(async () => {
    const existingMerchant = {
      id: 'merch-uuid',
      shopifyStoreName: 'existing.myshopify.com',
      shopifyAccessToken: 'old-token',
    };
    const existingUser = {
      id: 'user-uuid',
      email: 'admin@existing.myshopify.com',
      merchantId: 'merch-uuid',
      role: 'owner',
    };

    const merchantRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    const userRepo = {
      findOne: jest.fn().mockResolvedValue(existingUser),
      create: jest.fn(),
      save: jest.fn(),
    };

    mockManager = {
      getRepository: jest.fn((entity) => {
        if (entity.name === 'Merchant') return merchantRepo;
        return userRepo;
      }),
    };

    mockDataSource.transaction.mockImplementation((cb: any) =>
      cb(mockManager),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShopifyService,
        { provide: JwtService, useValue: mockJwtService },
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();
    service = module.get<ShopifyService>(ShopifyService);
  });

  it('updates token for existing merchant and returns jwt', async () => {
    const merchantRepo = mockManager.getRepository({ name: 'Merchant' });
    merchantRepo.findOne.mockResolvedValue({
      id: 'merch-uuid',
      shopifyAccessToken: 'old-token',
    });
    merchantRepo.save.mockResolvedValue({});

    const result = await service.upsertMerchant(
      'existing.myshopify.com',
      'new-token',
    );
    expect(merchantRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ shopifyAccessToken: 'new-token' }),
    );
    expect(result.merchantId).toBe('merch-uuid');
    expect(result.jwt).toBe('mock-jwt');
  });

  it('creates merchant + user for new install', async () => {
    const merchantRepo = mockManager.getRepository({ name: 'Merchant' });
    const userRepo = mockManager.getRepository({ name: 'User' });

    merchantRepo.findOne.mockResolvedValue(null);
    merchantRepo.create.mockReturnValue({ shopifyStoreName: 'new.myshopify.com' });
    merchantRepo.save.mockResolvedValue({ id: 'new-merch-uuid' });
    userRepo.create.mockReturnValue({ email: 'admin@new.myshopify.com' });
    userRepo.save.mockResolvedValue({});
    userRepo.findOne.mockResolvedValue({
      id: 'new-user-uuid',
      email: 'admin@new.myshopify.com',
      merchantId: 'new-merch-uuid',
      role: 'owner',
    });

    const result = await service.upsertMerchant('new.myshopify.com', 'shpat_new');
    expect(merchantRepo.create).toHaveBeenCalled();
    expect(userRepo.create).toHaveBeenCalled();
    expect(result.merchantId).toBe('new-merch-uuid');
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
cd backend && npm test -- --testPathPattern=shopify.service --no-coverage
```
Expected: `service.upsertMerchant is not a function`

- [ ] **Step 3: Add `upsertMerchant` to ShopifyService**

Add after `registerWebhook` in `src/shopify/shopify.service.ts`:

```typescript
  async upsertMerchant(
    shop: string,
    accessToken: string,
  ): Promise<{ merchantId: string; jwt: string }> {
    return this.dataSource.transaction(async (manager) => {
      const merchantRepo = manager.getRepository(Merchant);
      const userRepo = manager.getRepository(User);

      let merchant = await merchantRepo.findOne({
        where: { shopifyStoreName: shop },
      });

      if (merchant) {
        merchant.shopifyAccessToken = accessToken;
        merchant.webhookStatus = 'installed';
        await merchantRepo.save(merchant);
      } else {
        const created = merchantRepo.create({
          shopifyStoreName: shop,
          shopifyAccessToken: accessToken,
          whatsappPhoneNumber: '',
          apiKey: randomUUID(),
          apiSecret: '',
          isActive: true,
          webhookStatus: 'installed',
        });
        merchant = await merchantRepo.save(created);

        const passwordHash = await bcrypt.hash(randomUUID(), 10);
        const user = userRepo.create({
          email: `admin@${shop}`,
          passwordHash,
          merchantId: merchant.id,
          role: 'owner',
        });
        await userRepo.save(user);
      }

      const user = await userRepo.findOne({
        where: { merchantId: merchant.id },
      });

      const jwt = this.jwtService.sign({
        sub: user!.id,
        merchantId: merchant.id,
        email: user!.email,
        role: user!.role,
      });

      return { merchantId: merchant.id, jwt };
    });
  }
```

- [ ] **Step 4: Run all shopify service tests**

```bash
cd backend && npm test -- --testPathPattern=shopify.service --no-coverage
```
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/shopify/shopify.service.ts backend/src/shopify/shopify.service.spec.ts
git commit -m "feat(shopify): add merchant upsert with User creation and JWT issuance"
```

---

## Task 4: ShopifyController and module wiring

**Files:**
- Create: `src/shopify/shopify.controller.ts`
- Create: `src/shopify/shopify.module.ts`
- Modify: `src/app.module.ts`
- Modify: `backend/.env.example`

- [ ] **Step 1: Create the controller**

Create `src/shopify/shopify.controller.ts`:

```typescript
import {
  Controller,
  Get,
  Query,
  Res,
  BadRequestException,
  ForbiddenException,
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

    if (!this.shopifyService.validateNonce(state)) {
      throw new BadRequestException('Invalid or expired state');
    }

    if (!this.shopifyService.validateCallbackHmac(query)) {
      throw new ForbiddenException('Invalid HMAC signature');
    }

    const accessToken = await this.shopifyService.exchangeToken(shop, code);
    const { merchantId, jwt } = await this.shopifyService.upsertMerchant(
      shop,
      accessToken,
    );
    await this.shopifyService.registerWebhook(shop, accessToken, merchantId);

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    return res.redirect(
      `${frontendUrl}/install/success?token=${jwt}&merchantId=${merchantId}`,
    );
  }
}
```

- [ ] **Step 2: Create the module**

Create `src/shopify/shopify.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ShopifyService } from './shopify.service';
import { ShopifyController } from './shopify.controller';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'secret',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  providers: [ShopifyService],
  controllers: [ShopifyController],
})
export class ShopifyModule {}
```

- [ ] **Step 3: Import ShopifyModule in AppModule**

In `src/app.module.ts`, add the import alongside the other modules:

```typescript
// Add to imports at top of file:
import { ShopifyModule } from './shopify/shopify.module';

// Add ShopifyModule to the imports array in @Module:
    ShopifyModule,
```

- [ ] **Step 4: Update .env.example**

In `backend/.env.example`, add:

```
APP_URL=http://localhost:3000
```

- [ ] **Step 5: Run the full test suite to check for regressions**

```bash
cd backend && npm test --no-coverage
```
Expected: all existing tests pass, no new failures

- [ ] **Step 6: Verify TypeScript compiles cleanly**

```bash
cd backend && npm run build
```
Expected: exits with code 0, no errors in `src/shopify/`

- [ ] **Step 7: Commit**

```bash
git add backend/src/shopify/shopify.controller.ts backend/src/shopify/shopify.module.ts backend/src/app.module.ts backend/.env.example
git commit -m "feat(shopify): wire ShopifyController and ShopifyModule, add APP_URL env var"
```

---

## Task 5: Manual end-to-end smoke test

No code changes — verify the two routes respond correctly with a running server.

- [ ] **Step 1: Start the server**

```bash
cd backend && npm run start:dev
```
Wait for `Application is running on: http://localhost:3000`

- [ ] **Step 2: Test the install route rejects bad shop params**

```bash
curl -v "http://localhost:3000/shopify/install"
```
Expected: `400 Bad Request` — `Invalid shop parameter`

```bash
curl -v "http://localhost:3000/shopify/install?shop=evil.com"
```
Expected: `400 Bad Request`

- [ ] **Step 3: Test install route redirects for valid shop**

```bash
curl -v "http://localhost:3000/shopify/install?shop=mystore.myshopify.com"
```
Expected: `302` redirect to `https://mystore.myshopify.com/admin/oauth/authorize?client_id=...&scope=read_checkouts...`

- [ ] **Step 4: Test callback rejects missing/bad state**

```bash
curl -v "http://localhost:3000/shopify/callback?shop=mystore.myshopify.com&code=abc&state=badnonce&hmac=badhash"
```
Expected: `400 Bad Request` — `Invalid or expired state`

- [ ] **Step 5: Commit smoke test confirmation (optional note commit)**

```bash
git commit --allow-empty -m "chore: shopify oauth routes verified via manual smoke test"
```
