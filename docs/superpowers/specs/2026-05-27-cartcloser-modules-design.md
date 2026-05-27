# CartCloser — Missing Modules Design

**Date:** 2026-05-27
**Scope:** AuthModule, UsersModule, MerchantsModule (complete), MessagesModule (complete), AnalyticsModule
**Approach:** Two phases — Phase 1: Auth + Merchants. Phase 2: Messages + Analytics.

---

## Context

The CartCloser backend has a solid foundation: CartsModule is complete, all three entities exist, Docker Compose is working, and JWT/passport deps are already installed. Four modules are missing or partial. This spec defines exactly what gets built and how.

---

## Phase 1: Auth + Merchants

### User Entity

**File:** `src/users/user.entity.ts`

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | auto-generated |
| email | VARCHAR UNIQUE | login identifier |
| passwordHash | VARCHAR | `select: false` |
| merchantId | UUID FK | references `merchants.id` |
| role | enum `owner\|staff` | default `owner` |
| createdAt | TIMESTAMP | |
| updatedAt | TIMESTAMP | |

Index on `(email)` for login lookups.

### AuthModule

**Files:**
- `src/auth/auth.module.ts`
- `src/auth/auth.service.ts`
- `src/auth/auth.controller.ts`
- `src/auth/strategies/jwt.strategy.ts`
- `src/auth/strategies/local.strategy.ts`
- `src/auth/guards/jwt-auth.guard.ts`
- `src/auth/dto/register.dto.ts`
- `src/auth/dto/login.dto.ts`
- `src/users/user.entity.ts`
- `src/users/users.module.ts`
- `src/users/users.service.ts`

**Endpoints:**

| Method | Path | Auth | Body | Returns |
|--------|------|------|------|---------|
| POST | `/auth/register` | none | `RegisterDto` | `{ accessToken, merchantId }` |
| POST | `/auth/login` | none | `LoginDto` | `{ accessToken, merchantId }` |

**RegisterDto:**
```typescript
email: string        // IsEmail
password: string     // MinLength(8)
shopifyStoreName: string
whatsappPhoneNumber: string
```

**LoginDto:**
```typescript
email: string
password: string
```

**Registration flow:**
1. Check email not already taken
2. Hash password with `bcrypt` (rounds: 10)
3. Open TypeORM transaction:
   - Create `Merchant` (generate `apiKey` via `uuid()`, set `isActive: true`)
   - Create `User` linked to `merchantId`, role `owner`
4. Sign and return JWT

**JWT payload:** `{ sub: userId, merchantId, email, role }`
**JWT config:** secret from `JWT_SECRET` env var, expires `JWT_EXPIRES_IN` (default `7d`)

**JwtAuthGuard:** validates Bearer token, attaches `req.user = { userId, merchantId, email, role }` to request.

**ApiKeyGuard:** lives in `MerchantsModule` (not AuthModule) to avoid a circular dependency — it injects `MerchantsService` directly. Reads `x-api-key` header, attaches merchant to request. Returns 401 if key not found or merchant inactive. `MerchantsModule` exports it so other modules can use it.

**UsersService methods:**
- `findByEmail(email)` — for login (must use `.addSelect('passwordHash')`)
- `findById(id)` — for JWT strategy validation
- `create(data, merchantId)` — called from AuthService during registration

### MerchantsModule

**Files:**
- `src/merchants/merchants.service.ts`
- `src/merchants/merchants.controller.ts`
- `src/merchants/merchants.module.ts`
- `src/merchants/guards/api-key.guard.ts`
- `src/merchants/dto/update-merchant.dto.ts`

**Endpoints:**

| Method | Path | Guard | Purpose |
|--------|------|-------|---------|
| GET | `/merchants/me` | JwtAuthGuard | Get own merchant profile |
| PATCH | `/merchants/me` | JwtAuthGuard | Update config |
| GET | `/merchants/:merchantId/config` | ApiKeyGuard | n8n config fetch |

`merchantId` for `me` routes always comes from `req.user.merchantId` (JWT claim), never the URL.

**UpdateMerchantDto:**
```typescript
whatsappPhoneNumber?: string
messageTemplate?: string
defaultDiscountPercent?: number   // @Min(1) @Max(100)
whatsappPhoneNumberId?: string
```

**MerchantsService methods:**
- `findById(merchantId)` — generic lookup
- `findByApiKey(apiKey)` — used by ApiKeyGuard
- `getMerchantConfig(merchantId)` — returns `{ messageTemplate, defaultDiscountPercent, whatsappPhoneNumber, whatsappPhoneNumberId }`
- `updateConfig(merchantId, dto)` — partial update via `Object.assign`

`MerchantsModule` exports `MerchantsService` and `ApiKeyGuard` (needed by AuthModule during registration and by any route using API key auth).

---

## Phase 2: Messages + Analytics

### MessagesModule

**Files:**
- `src/messages/messages.service.ts`
- `src/messages/messages.module.ts`

No new controller. Messages are created/updated via CartsController. Dashboard reads via AnalyticsModule.

**MessagesService methods:**
- `createMessage(data: { merchantId, cartId, phoneNumber, messageText })` — creates `pending` message
- `updateStatus(twilioSid, status, errorMessage?)` — delivery status webhook handler (future)
- `getMessagesByCart(cartId)` — all messages for a cart
- `getStatsByMerchant(merchantId)` — counts grouped by status: `{ sent, delivered, read, failed, pending }`

`MessagesModule` exports `MessagesService`.

### AnalyticsModule

**Files:**
- `src/analytics/analytics.service.ts`
- `src/analytics/analytics.controller.ts`
- `src/analytics/analytics.module.ts`

**Endpoint:**

| Method | Path | Guard | Purpose |
|--------|------|-------|---------|
| GET | `/analytics/dashboard` | JwtAuthGuard | Full dashboard data |

`merchantId` from `req.user.merchantId`.

**Response shape:**
```typescript
{
  summary: {
    totalAbandoned: number,
    totalContacted: number,
    totalRecovered: number,
    recoveryRate: number,           // (recovered / abandoned) * 100
    totalRecoveredRevenue: number,
    totalAbandonedRevenue: number,
  },
  messages: {
    sent: number,
    delivered: number,
    read: number,
    failed: number,
  },
  dailyBreakdown: Array<{           // last 30 days, one entry per day
    date: string,                   // "YYYY-MM-DD"
    abandoned: number,
    recovered: number,
    recoveredRevenue: number,
  }>,
  revenueTrend: Array<{             // last 30 days
    date: string,
    recoveredRevenue: number,
  }>,
  topCustomers: Array<{             // top 10 by cartTotal DESC
    customerEmail: string,
    customerName: string,
    cartTotal: number,
    status: string,
  }>,
}
```

**AnalyticsService** injects:
- `CartsRepository` directly (via `@InjectRepository(Cart)`) for daily breakdown and top customers via QueryBuilder
- `MessagesService` for message counts

`dailyBreakdown` uses `DATE_TRUNC('day', abandoned_at)` with `GROUP BY` over the last 30 days (PostgreSQL syntax). `topCustomers` is a simple `ORDER BY cart_total DESC LIMIT 10`.

---

## Dependency Graph

```
UsersModule ──────────────────────────────────┐
                                               ↓
MerchantsModule ──→ AuthModule ──→ app.module.ts
     ↓ (exports ApiKeyGuard)   ↓ (exports JwtAuthGuard)
     └──────────────────────────────────────────┘
                     used by feature modules
              (CartsModule / MessagesModule / AnalyticsModule)
```

`AuthModule` imports `MerchantsModule` (to create merchants during registration). `MerchantsModule` does NOT import `AuthModule` — `ApiKeyGuard` lives inside `MerchantsModule` and uses `MerchantsService` directly, avoiding circular deps.

---

## app.module.ts Changes

`AuthModule` must be imported before other feature modules since guards depend on it. `PassportModule` and `JwtModule` are registered inside `AuthModule` (not globally) to keep concerns scoped.

Add `bcrypt` to dependencies (`npm install bcrypt @types/bcrypt`).

Enable `ValidationPipe` globally in `main.ts` so `class-validator` decorators on DTOs are enforced:
```typescript
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
```

---

## Verification

**Phase 1:**
```bash
# Register a merchant
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@store.com","password":"password123","shopifyStoreName":"test-store","whatsappPhoneNumber":"+1234567890"}'

# Login
curl -X POST http://localhost:3000/auth/login \
  -d '{"email":"test@store.com","password":"password123"}'

# Get merchant config (used by n8n)
curl http://localhost:3000/merchants/{merchantId}/config \
  -H "x-api-key: {apiKey}"
```

**Phase 2:**
```bash
# Dashboard
curl http://localhost:3000/analytics/dashboard \
  -H "Authorization: Bearer {jwt}"
```

Both phases: `npm run build` must succeed with zero TypeScript errors.
