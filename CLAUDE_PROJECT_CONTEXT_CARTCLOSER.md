# CartCloser - Claude Project Context

## Project Overview

**Name:** CartCloser SaaS
**Type:** Multi-tenant Shopify integration for abandoned cart recovery
**Status:** MVP Development (40% complete)
**Tech Stack:** NestJS, TypeORM, PostgreSQL, n8n, Twilio WhatsApp

---

## Mission

Automatically recover abandoned shopping carts by sending personalized WhatsApp messages with dynamic discounts to customers, increasing e-commerce revenue by 20-30%.

---

## Core Architecture

### System Components

```
┌─────────────────────────────────────────────┐
│        Shopify Stores (Multi-tenant)        │
└──────────────┬──────────────────────────────┘
               │ Webhook: checkout.abandoned
               ▼
┌──────────────────────────────────────────────┐
│      NestJS Backend API (Port 3000)          │
│  - Multi-tenant architecture (merchantId)    │
│  - Receives & validates Shopify webhooks     │
│  - Creates cart records in PostgreSQL        │
│  - Triggers n8n workflows                    │
└──────────────┬───────────────────────────────┘
               │ HTTP POST /webhook/process-abandoned-cart
               ▼
┌──────────────────────────────────────────────┐
│      n8n Workflow Engine (Port 5678)         │
│  - Gets merchant config from backend         │
│  - Generates personalized message            │
│  - Sends via Twilio WhatsApp                 │
│  - Logs result back to backend               │
└──────────────┬───────────────────────────────┘
               │ HTTP POST /carts/{id}/message-sent
               ▼
┌──────────────────────────────────────────────┐
│    PostgreSQL Database (Port 5432)           │
│  - merchants (multi-tenant separation)       │
│  - carts (abandoned cart data)               │
│  - messages (WhatsApp message logs)          │
└──────────────────────────────────────────────┘
```

---

## Database Schema

### merchants table
```sql
- id (UUID, PK)
- shopifyStoreName (VARCHAR UNIQUE)
- shopifyAccessToken (TEXT, encrypted)
- whatsappPhoneNumber (VARCHAR)
- messageTemplate (TEXT) - "Hi! You left ${cartTotal}..."
- defaultDiscountPercent (INT) - e.g., 15
- apiKey (VARCHAR UNIQUE) - For API auth
- apiSecret (TEXT, encrypted)
- isActive (BOOLEAN)
- createdAt, updatedAt (TIMESTAMP)
```

### carts table
```sql
- id (UUID, PK)
- merchantId (UUID, FK)
- shopifyCheckoutId (VARCHAR)
- customerEmail (VARCHAR)
- customerPhone (VARCHAR)
- cartTotal (DECIMAL 10,2)
- cartItems (JSON)
- status (abandoned|contacted|recovered|expired)
- discountCode (VARCHAR)
- discountPercent (INT)
- messagesSent (INT) - Track retry count
- lastMessageSentAt (TIMESTAMP)
- recoveredAt (TIMESTAMP)
- createdAt, abandonedAt (TIMESTAMP)
```

### messages table
```sql
- id (UUID, PK)
- merchantId (UUID, FK)
- cartId (UUID, FK)
- phoneNumber (VARCHAR)
- messageText (TEXT)
- status (pending|sent|delivered|read|failed)
- twilioMessageSid (VARCHAR)
- sentAt, updatedAt (TIMESTAMP)
```

---

## Key Features

### ✅ Complete
- Multi-tenant architecture (isolated by merchantId)
- Shopify webhook integration (HMAC validation)
- PostgreSQL schema with proper indexing
- NestJS project structure
- Basic n8n workflow JSON
- Docker Compose setup (PostgreSQL, n8n, backend, Redis)
- TypeORM entities and services

### ⚠️ In Progress
- NestJS modules (AuthModule, MerchantsModule mostly done)
- API endpoints for dashboard
- Twilio WhatsApp integration (needs credentials setup)
- n8n workflow UI (needs manual creation in n8n)

### ❌ Not Started
- Frontend React dashboard
- Authentication (login/register)
- Payment processing
- Admin panel
- Advanced analytics
- Email fallback
- SMS support
- A/B testing
- Unit tests
- Integration tests

---

## Multi-Tenant Flow

### How it handles multiple Shopify stores:

```
Store 1 (mystore1.myshopify.com)
├─ Merchant UUID: merchant-uuid-111
├─ Message: "Completa con 15% OFF"
└─ WhatsApp: +15551234567

Store 2 (mystore2.myshopify.com)
├─ Merchant UUID: merchant-uuid-222
├─ Message: "Come back! 10% OFF"
└─ WhatsApp: +15559876543

Single n8n workflow handles BOTH:
1. Webhook receives merchantId in URL: /webhooks/shopify/merchant-uuid-111
2. Backend saves cart with merchantId
3. Backend calls n8n with merchantId in JSON
4. n8n fetches merchant-specific config: GET /merchants/merchant-uuid-111/config
5. n8n uses that merchant's template, discount, WhatsApp number
```

---

## API Endpoints (Implemented)

### Webhooks
- `POST /webhooks/shopify/:merchantId` - Receives abandoned checkout

### Cart Operations (in progress)
- `GET /carts/:id` - Get cart details
- `POST /carts/:id/message-sent` - Log message sent
- `POST /carts/:id/recovered` - Mark as recovered
- `GET /carts/stats/dashboard` - Get analytics

### Merchant Operations (partially done)
- `GET /merchants/:merchantId/config` - Get merchant settings
- `PATCH /merchants/:merchantId/config` - Update settings
- (Still needed: POST /merchants, GET /merchants/list, etc.)

---

## Configuration Files

### environment (.env)
```
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=cartcloser

SHOPIFY_API_KEY=xxx
SHOPIFY_API_SECRET=xxx

TWILIO_ACCOUNT_SID=xxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_PHONE=+1234567890

JWT_SECRET=your-secret-key
N8N_WEBHOOK_BASE_URL=http://localhost:5678
```

### docker-compose.yml
- PostgreSQL 15 (volume: postgres_data)
- n8n latest (volume: n8n_data)
- NestJS backend (builds from Dockerfile)
- Redis 7 (optional, for caching)

---

## Project Structure

```
cartcloser-saas/
├── backend/
│   ├── src/
│   │   ├── main.ts                    # Entry point
│   │   ├── app.module.ts              # Main module
│   │   ├── merchants/
│   │   │   ├── merchants.entity.ts   # ✅ Done
│   │   │   ├── merchants.service.ts  # 🟡 Partial
│   │   │   └── merchants.controller.ts # 🟡 Partial
│   │   ├── carts/
│   │   │   ├── carts.entity.ts       # ✅ Done
│   │   │   ├── carts.service.ts      # ✅ Done
│   │   │   ├── carts.controller.ts   # ✅ Done (webhooks)
│   │   │   └── carts.module.ts       # 🟡 Partial
│   │   ├── messages/
│   │   │   ├── messages.entity.ts    # ✅ Done
│   │   │   ├── messages.service.ts   # 🟡 Partial
│   │   │   └── messages.module.ts    # ❌ Missing
│   │   ├── analytics/
│   │   │   ├── analytics.service.ts  # ❌ Missing
│   │   │   └── analytics.module.ts   # ❌ Missing
│   │   └── auth/
│   │       ├── auth.service.ts       # ❌ Missing
│   │       ├── auth.controller.ts    # ❌ Missing
│   │       ├── jwt.strategy.ts       # ❌ Missing
│   │       └── auth.module.ts        # ❌ Missing
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   └── .env.example
├── n8n-workflows/
│   ├── process-abandoned-cart.json  # ✅ JSON ready
│   └── README.md
├── frontend/                         # ❌ Not started
│   └── (React dashboard)
├── docker-compose.yml                # ✅ Done
├── README.md                         # ✅ Done
└── .gitignore
```

---

## Development Status by Component

### Backend (NestJS) - 40% Complete

**What Works:**
- Project structure
- TypeORM setup with PostgreSQL
- Cart entity, service, controller
- Shopify webhook receiver (HMAC validation)
- n8n workflow trigger
- Multi-tenant data isolation

**Missing:**
- Complete AuthModule (JWT, login/register)
- Complete MerchantsModule (create/update merchant)
- AnalyticsModule (stats endpoints)
- Proper error handling
- Input validation (class-validator)
- Tests (Jest)
- Logging
- API documentation (Swagger)

### n8n Workflow - 80% Complete

**Ready:**
- JSON structure defined
- All 6 nodes planned
- Data flow documented
- Logic correct

**Needs:**
- Manual creation in n8n UI (can't auto-create)
- Twilio credentials setup
- Testing in live environment
- Production URL configuration

### Database - 100% Complete

**Done:**
- Schema designed for multi-tenant
- Proper indexing
- Relationships defined
- Migration strategy (TypeORM synchronize)

### Docker - 100% Complete

**Done:**
- docker-compose.yml with all services
- Dockerfile for backend
- Service networking configured

---

## Known Issues

### 1. npm ci vs npm install (FIXED)
- ❌ Issue: Docker build failing with "npm ci requires package-lock.json"
- ✅ Fix: Changed Dockerfile to use `npm install --legacy-peer-deps`
- Status: Updated in latest ZIP

### 2. Incomplete Modules
- ❌ AuthModule not implemented
- ❌ MerchantsModule only has entity
- ❌ AnalyticsModule missing
- Status: Need implementation

### 3. Missing Endpoints
- ❌ POST /merchants (create)
- ❌ PATCH /merchants/:id/config (update)
- ❌ GET /carts/stats/:merchantId (analytics)
- Status: Need implementation

### 4. n8n Setup
- ❌ Workflow can't be auto-created in n8n
- ❌ Manual creation needed in UI
- Status: Documentation complete, needs manual setup

---

## Running the Project

### Local Development
```bash
cd cartcloser-saas

# Setup environment
cp backend/.env.example backend/.env

# Start all services
docker-compose up -d

# Access:
# API:  http://localhost:3000
# n8n:  http://localhost:5678
# DB:   localhost:5432
```

### Building
```bash
# Backend
cd backend
npm install
npm run build

# Docker
docker-compose build backend
```

---

## Next Development Priorities

### Priority 1: Complete Backend (Weeks 1-2)
1. [ ] AuthModule (JWT, register, login)
2. [ ] Complete MerchantsModule
3. [ ] AnalyticsModule
4. [ ] Input validation with class-validator
5. [ ] Error handling middleware
6. [ ] Logging (Winston or Pino)

### Priority 2: n8n Setup (Week 1)
1. [ ] Create workflow manually in n8n UI
2. [ ] Set up Twilio credentials
3. [ ] Test end-to-end
4. [ ] Create mock merchant data for testing

### Priority 3: Testing (Weeks 2-3)
1. [ ] Unit tests for services
2. [ ] Integration tests for webhooks
3. [ ] Jest configuration
4. [ ] Test database seeding

### Priority 4: Frontend (Weeks 3-4)
1. [ ] React dashboard
2. [ ] Merchant login
3. [ ] Stats/analytics view
4. [ ] Settings/config page

### Priority 5: Production (Week 4+)
1. [ ] API documentation (Swagger)
2. [ ] Error tracking (Sentry)
3. [ ] Monitoring (DataDog)
4. [ ] CI/CD pipeline (GitHub Actions)
5. [ ] Heroku deployment
6. [ ] Shopify App Store submission

---

## How to Ask Claude for Help

### For Bug Fixes
```
"CartCloser Docker build failing on npm install. 
Can you analyze the Dockerfile and fix the npm ci error?"

Claude will:
1. Read Dockerfile
2. Understand the multi-container setup
3. Suggest using npm install --legacy-peer-deps
4. Update Dockerfile
```

### For Code Generation
```
"Generate the missing AuthModule for CartCloser NestJS backend.
It needs: register, login, JWT strategy, guards.
Follow the pattern of CartsModule."

Claude will:
1. Reference existing CartsModule
2. Create auth.service.ts, auth.controller.ts, auth.module.ts
3. Implement JWT validation
4. Add decorators and guards
```

### For Architecture Questions
```
"How should the multi-tenant isolation work in CartCloser?
We have 100+ Shopify stores."

Claude will:
1. Explain merchantId-based isolation
2. Show database query patterns
3. Discuss security implications
4. Suggest indexing strategy
```

---

## Key Contacts & Resources

### Technology Docs
- NestJS: https://docs.nestjs.com
- TypeORM: https://typeorm.io
- n8n: https://docs.n8n.io
- Shopify API: https://shopify.dev
- Twilio: https://www.twilio.com/docs

### Services
- Shopify Partner: https://partners.shopify.com
- Twilio Console: https://www.twilio.com/console
- Anthropic Claude: https://console.anthropic.com

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Code Complete | 40% | 100% |
| Tests | 0% | 80% |
| API Endpoints | 6 | 15+ |
| Supported Merchants | 1 | 100+ |
| Message Delivery Rate | TBD | 95%+ |
| Cart Recovery Rate | TBD | 25%+ |

---

**Last Updated:** May 27, 2026
**Next Review:** After backend completion
**Owner:** Marcos (Full Stack Developer)
