# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run inside `backend/` unless using Docker.

```bash
# Local development (requires Node 18+)
npm run start:dev       # Hot-reload dev server on :3000
npm run build           # Compile TypeScript to dist/
npm run lint            # ESLint with auto-fix
npm run format          # Prettier format

# Tests
npm test                # Run Jest unit tests
npm run test:watch      # Watch mode
npm run test:cov        # Coverage report

# Database migrations (TypeORM)
npm run migration:create -- -n MigrationName
npm run migration:run
npm run migration:revert

# Docker (preferred for local dev — starts Postgres, n8n, Redis, backend)
docker-compose up -d
docker-compose logs -f backend
docker-compose ps
```

> In development, TypeORM `synchronize: true` is set — no manual migrations needed.

## Architecture

```
Shopify Stores → NestJS API (:3000) → PostgreSQL (:5432)
                      ↓
               n8n Workflows (:5678)
                      ↓
            Twilio WhatsApp API
```

**Multi-tenant model**: each Shopify store is one `Merchant`. Every DB query must filter by `merchantId` — no cross-merchant data visibility.

**Data flow for cart recovery**:
1. Shopify POSTs to `/webhooks/shopify/:merchantId` (HMAC-validated)
2. Backend creates a `Cart` record and POSTs cart data to n8n webhook
3. n8n fetches merchant config via `GET /merchants/:merchantId/config`
4. n8n sends WhatsApp via Twilio, then POSTs to `/carts/:id/message-sent`

## Module Status

| Module | Status | Notes |
|--------|--------|-------|
| CartsModule | ✅ Complete | Webhook handler, HMAC validation, cart tracking |
| MerchantsModule | 🟡 Partial | Entity done; service/controller/module.ts missing |
| MessagesModule | 🟡 Partial | Entity done; service/module.ts missing |
| AuthModule | ❌ Missing | JWT auth — deps already installed (`@nestjs/jwt`, `passport-jwt`) |
| AnalyticsModule | ❌ Missing | Dashboard stats |

## Code Patterns

Follow these exact patterns from existing code:

**Service** — see `src/carts/carts.service.ts`:
```typescript
@Injectable()
export class ExampleService {
  constructor(
    @InjectRepository(Entity)
    private repo: Repository<Entity>,
  ) {}
}
```

**Controller** — see `src/carts/carts.controller.ts`:
```typescript
@Controller('example')
export class ExampleController {
  constructor(private exampleService: ExampleService) {}
}
```

**Module file** — required for every module, wires everything together:
```typescript
@Module({
  imports: [TypeOrmModule.forFeature([Entity])],
  providers: [ExampleService],
  controllers: [ExampleController],
  exports: [ExampleService],
})
export class ExampleModule {}
```

Path alias `@/*` maps to `src/*` (configured in tsconfig.json).

## Key Implementation Notes

- `select: false` columns (e.g., `shopifyAccessToken`, `apiSecret`) must be explicitly selected with `.addSelect()` when needed
- `messageTemplate` supports `${cartTotal}`, `${discountPercent}`, `${link}` placeholders
- Cart status flow: `abandoned` → `contacted` → `recovered` | `expired`
- Message status flow: `pending` → `sent` → `delivered` | `read` | `failed`
- CORS is pre-configured for `localhost:3001` (frontend) and `localhost:5678` (n8n)
- Redis is in docker-compose but not yet wired to application code

## Environment Variables

Copy `backend/.env.example` to `backend/.env`. Required groups:
- `DB_*` — PostgreSQL connection
- `JWT_SECRET` — auth signing key
- `SHOPIFY_API_KEY` / `SHOPIFY_API_SECRET` — webhook HMAC validation
- `TWILIO_*` — WhatsApp sending
- `N8N_WEBHOOK_BASE_URL` — where to trigger n8n (default: `http://localhost:5678`)
