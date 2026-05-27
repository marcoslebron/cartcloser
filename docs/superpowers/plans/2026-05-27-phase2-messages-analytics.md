# Phase 2: Messages + Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete MessagesModule (service + module) and build AnalyticsModule (full dashboard endpoint with summary, daily breakdown, revenue trend, top customers, and message stats).

**Architecture:** MessagesService provides per-merchant message stats consumed by AnalyticsService. AnalyticsService uses QueryBuilder directly on the Cart repository for time-series queries. JwtAuthGuard (globally exported from AuthModule in Phase 1) protects the analytics endpoint.

**Tech Stack:** NestJS, TypeORM QueryBuilder, PostgreSQL (`DATE_TRUNC`)

**Prerequisite:** Phase 1 must be complete and `npm run build` passes before starting this phase.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `backend/src/messages/messages.service.ts` | Create | createMessage, updateStatus, getMessagesByCart, getStatsByMerchant |
| `backend/src/messages/messages.module.ts` | Create | Wires Message repository; exports MessagesService |
| `backend/src/analytics/analytics.service.ts` | Create | Aggregates cart + message data for dashboard |
| `backend/src/analytics/analytics.controller.ts` | Create | GET /analytics/dashboard |
| `backend/src/analytics/analytics.module.ts` | Create | Wires analytics; imports CartsModule + MessagesModule |

---

### Task 1: MessagesService + MessagesModule

**Files:**
- Create: `backend/src/messages/messages.service.ts`
- Create: `backend/src/messages/messages.service.spec.ts`
- Create: `backend/src/messages/messages.module.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/messages/messages.service.spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MessagesService } from './messages.service';
import { Message } from './messages.entity';

const mockMessages = [
  { id: '1', status: 'sent', merchantId: 'merchant-1', cartId: 'cart-1' },
  { id: '2', status: 'delivered', merchantId: 'merchant-1', cartId: 'cart-1' },
  { id: '3', status: 'failed', merchantId: 'merchant-1', cartId: 'cart-2' },
  { id: '4', status: 'read', merchantId: 'merchant-1', cartId: 'cart-2' },
];

const mockRepo = {
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  createQueryBuilder: jest.fn(),
};

describe('MessagesService', () => {
  let service: MessagesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        { provide: getRepositoryToken(Message), useValue: mockRepo },
      ],
    }).compile();
    service = module.get<MessagesService>(MessagesService);
    jest.clearAllMocks();
  });

  describe('createMessage', () => {
    it('creates a message with pending status', async () => {
      const data = { merchantId: 'm1', cartId: 'c1', phoneNumber: '+1', messageText: 'Hello' };
      const created = { ...data, status: 'pending', id: 'msg-1' };
      mockRepo.create.mockReturnValue(created);
      mockRepo.save.mockResolvedValue(created);

      const result = await service.createMessage(data);
      expect(mockRepo.create).toHaveBeenCalledWith({ ...data, status: 'pending' });
      expect(result.status).toBe('pending');
    });
  });

  describe('getMessagesByCart', () => {
    it('returns messages for a cart ordered by sentAt', async () => {
      mockRepo.find.mockResolvedValue(mockMessages.slice(0, 2));
      const result = await service.getMessagesByCart('cart-1');
      expect(result).toHaveLength(2);
      expect(mockRepo.find).toHaveBeenCalledWith({
        where: { cartId: 'cart-1' },
        order: { sentAt: 'ASC' },
      });
    });
  });

  describe('updateStatus', () => {
    it('updates message status and error message', async () => {
      const msg = { id: 'msg-1', status: 'pending', twilioMessageSid: 'SM123' };
      mockRepo.findOne.mockResolvedValue(msg);
      mockRepo.save.mockResolvedValue({ ...msg, status: 'failed', errorMessage: 'timeout' });

      const result = await service.updateStatus('SM123', 'failed', 'timeout');
      expect(result?.status).toBe('failed');
      expect(result?.errorMessage).toBe('timeout');
    });

    it('returns null when twilioSid not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      const result = await service.updateStatus('bad-sid', 'failed');
      expect(result).toBeNull();
    });
  });

  describe('getStatsByMerchant', () => {
    it('returns status counts grouped correctly', async () => {
      const qb = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { status: 'sent', count: '3' },
          { status: 'delivered', count: '2' },
          { status: 'read', count: '1' },
          { status: 'failed', count: '1' },
        ]),
      };
      mockRepo.createQueryBuilder.mockReturnValue(qb);

      const stats = await service.getStatsByMerchant('merchant-1');
      expect(stats.sent).toBe(3);
      expect(stats.delivered).toBe(2);
      expect(stats.read).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.pending).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `backend/`:
```bash
npm test -- --testPathPattern="messages.service.spec" --no-coverage
```

Expected: FAIL — `Cannot find module './messages.service'`

- [ ] **Step 3: Create MessagesService**

Create `backend/src/messages/messages.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message } from './messages.entity';

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private messagesRepository: Repository<Message>,
  ) {}

  async createMessage(data: {
    merchantId: string;
    cartId: string;
    phoneNumber: string;
    messageText: string;
  }): Promise<Message> {
    const message = this.messagesRepository.create({ ...data, status: 'pending' });
    return this.messagesRepository.save(message);
  }

  async updateStatus(
    twilioSid: string,
    status: string,
    errorMessage?: string,
  ): Promise<Message | null> {
    const message = await this.messagesRepository.findOne({
      where: { twilioMessageSid: twilioSid },
    });
    if (!message) return null;
    message.status = status;
    if (errorMessage) message.errorMessage = errorMessage;
    return this.messagesRepository.save(message);
  }

  async getMessagesByCart(cartId: string): Promise<Message[]> {
    return this.messagesRepository.find({
      where: { cartId },
      order: { sentAt: 'ASC' },
    });
  }

  async getStatsByMerchant(merchantId: string): Promise<{
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    pending: number;
  }> {
    const rows = await this.messagesRepository
      .createQueryBuilder('msg')
      .select('msg.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('msg.merchantId = :merchantId', { merchantId })
      .groupBy('msg.status')
      .getRawMany();

    const counts: Record<string, number> = { sent: 0, delivered: 0, read: 0, failed: 0, pending: 0 };
    for (const row of rows) {
      if (row.status in counts) {
        counts[row.status] = parseInt(row.count, 10);
      }
    }
    return counts as { sent: number; delivered: number; read: number; failed: number; pending: number };
  }
}
```

- [ ] **Step 4: Create MessagesModule**

Create `backend/src/messages/messages.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Message } from './messages.entity';
import { MessagesService } from './messages.service';

@Module({
  imports: [TypeOrmModule.forFeature([Message])],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- --testPathPattern="messages.service.spec" --no-coverage
```

Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/src/messages/messages.service.ts backend/src/messages/messages.service.spec.ts backend/src/messages/messages.module.ts
git commit -m "feat: add MessagesService and MessagesModule"
```

---

### Task 2: AnalyticsService

**Files:**
- Create: `backend/src/analytics/analytics.service.ts`
- Create: `backend/src/analytics/analytics.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/analytics/analytics.service.spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AnalyticsService } from './analytics.service';
import { Cart } from '../carts/carts.entity';
import { MessagesService } from '../messages/messages.service';

const mockCartsRepo = {
  count: jest.fn(),
  createQueryBuilder: jest.fn(),
};

const mockMessagesService = {
  getStatsByMerchant: jest.fn(),
};

function makeQb(rawResult: any) {
  const qb = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue(rawResult),
    getRawMany: jest.fn().mockResolvedValue(rawResult),
    getMany: jest.fn().mockResolvedValue(rawResult),
  };
  return qb;
}

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: getRepositoryToken(Cart), useValue: mockCartsRepo },
        { provide: MessagesService, useValue: mockMessagesService },
      ],
    }).compile();
    service = module.get<AnalyticsService>(AnalyticsService);
    jest.clearAllMocks();
  });

  describe('getDashboard', () => {
    it('returns complete dashboard shape', async () => {
      mockCartsRepo.count
        .mockResolvedValueOnce(100)  // totalAbandoned
        .mockResolvedValueOnce(20)   // totalContacted
        .mockResolvedValueOnce(30);  // totalRecovered

      mockCartsRepo.createQueryBuilder
        .mockReturnValueOnce(makeQb({ total: '5000.00' }))   // abandonedRevenue
        .mockReturnValueOnce(makeQb({ total: '1500.00' }))   // recoveredRevenue
        .mockReturnValueOnce(makeQb([]))                      // dailyBreakdown
        .mockReturnValueOnce(makeQb([]));                     // topCustomers

      mockMessagesService.getStatsByMerchant.mockResolvedValue({
        sent: 50, delivered: 40, read: 20, failed: 5, pending: 2,
      });

      const result = await service.getDashboard('merchant-1');

      expect(result.summary.totalAbandoned).toBe(100);
      expect(result.summary.totalRecovered).toBe(30);
      expect(result.summary.recoveryRate).toBe(30);
      expect(result.summary.totalRecoveredRevenue).toBe(1500);
      expect(result.messages.sent).toBe(50);
      expect(result.messages.failed).toBe(5);
      expect(Array.isArray(result.dailyBreakdown)).toBe(true);
      expect(Array.isArray(result.topCustomers)).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --testPathPattern="analytics.service.spec" --no-coverage
```

Expected: FAIL — `Cannot find module './analytics.service'`

- [ ] **Step 3: Create AnalyticsService**

Create `backend/src/analytics/analytics.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cart } from '../carts/carts.entity';
import { MessagesService } from '../messages/messages.service';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Cart)
    private cartsRepository: Repository<Cart>,
    private messagesService: MessagesService,
  ) {}

  async getDashboard(merchantId: string) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [totalAbandoned, totalContacted, totalRecovered] = await Promise.all([
      this.cartsRepository.count({ where: { merchantId, status: 'abandoned' } }),
      this.cartsRepository.count({ where: { merchantId, status: 'contacted' } }),
      this.cartsRepository.count({ where: { merchantId, status: 'recovered' } }),
    ]);

    const abandonedRevenueRow = await this.cartsRepository
      .createQueryBuilder('cart')
      .select('COALESCE(SUM(cart.cartTotal), 0)', 'total')
      .where('cart.merchantId = :merchantId', { merchantId })
      .andWhere('cart.status = :status', { status: 'abandoned' })
      .getRawOne();

    const recoveredRevenueRow = await this.cartsRepository
      .createQueryBuilder('cart')
      .select('COALESCE(SUM(cart.recoveredAmount), 0)', 'total')
      .where('cart.merchantId = :merchantId', { merchantId })
      .andWhere('cart.status = :status', { status: 'recovered' })
      .getRawOne();

    const totalAbandonedRevenue = parseFloat(abandonedRevenueRow?.total ?? '0');
    const totalRecoveredRevenue = parseFloat(recoveredRevenueRow?.total ?? '0');
    const recoveryRate = totalAbandoned > 0 ? Math.round((totalRecovered / totalAbandoned) * 100) : 0;

    const dailyRows = await this.cartsRepository
      .createQueryBuilder('cart')
      .select("DATE_TRUNC('day', cart.abandonedAt)", 'date')
      .addSelect("COUNT(CASE WHEN cart.status = 'abandoned' THEN 1 END)", 'abandoned')
      .addSelect("COUNT(CASE WHEN cart.status = 'recovered' THEN 1 END)", 'recovered')
      .addSelect(
        "COALESCE(SUM(CASE WHEN cart.status = 'recovered' THEN cart.recoveredAmount ELSE 0 END), 0)",
        'recoveredRevenue',
      )
      .where('cart.merchantId = :merchantId', { merchantId })
      .andWhere('cart.abandonedAt >= :since', { since: thirtyDaysAgo })
      .groupBy("DATE_TRUNC('day', cart.abandonedAt)")
      .orderBy("DATE_TRUNC('day', cart.abandonedAt)", 'ASC')
      .getRawMany();

    const dailyBreakdown = dailyRows.map((row) => ({
      date: row.date ? new Date(row.date).toISOString().split('T')[0] : null,
      abandoned: parseInt(row.abandoned, 10) || 0,
      recovered: parseInt(row.recovered, 10) || 0,
      recoveredRevenue: parseFloat(row.recoveredRevenue) || 0,
    }));

    const revenueTrend = dailyBreakdown.map((d) => ({
      date: d.date,
      recoveredRevenue: d.recoveredRevenue,
    }));

    const topCustomers = await this.cartsRepository
      .createQueryBuilder('cart')
      .select([
        'cart.customerEmail',
        'cart.customerName',
        'cart.cartTotal',
        'cart.status',
      ])
      .where('cart.merchantId = :merchantId', { merchantId })
      .orderBy('cart.cartTotal', 'DESC')
      .take(10)
      .getMany();

    const messageStats = await this.messagesService.getStatsByMerchant(merchantId);

    return {
      summary: {
        totalAbandoned,
        totalContacted,
        totalRecovered,
        recoveryRate,
        totalRecoveredRevenue,
        totalAbandonedRevenue,
      },
      messages: {
        sent: messageStats.sent,
        delivered: messageStats.delivered,
        read: messageStats.read,
        failed: messageStats.failed,
      },
      dailyBreakdown,
      revenueTrend,
      topCustomers: topCustomers.map((c) => ({
        customerEmail: c.customerEmail,
        customerName: c.customerName,
        cartTotal: Number(c.cartTotal),
        status: c.status,
      })),
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- --testPathPattern="analytics.service.spec" --no-coverage
```

Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add backend/src/analytics/analytics.service.ts backend/src/analytics/analytics.service.spec.ts
git commit -m "feat: add AnalyticsService with full dashboard data aggregation"
```

---

### Task 3: AnalyticsController + AnalyticsModule

**Files:**
- Create: `backend/src/analytics/analytics.controller.ts`
- Create: `backend/src/analytics/analytics.module.ts`

- [ ] **Step 1: Create AnalyticsController**

Create `backend/src/analytics/analytics.controller.ts`:
```typescript
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('analytics')
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @UseGuards(JwtAuthGuard)
  @Get('dashboard')
  async getDashboard(@Req() req: any) {
    return this.analyticsService.getDashboard(req.user.merchantId);
  }
}
```

- [ ] **Step 2: Create AnalyticsModule**

Create `backend/src/analytics/analytics.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cart } from '../carts/carts.entity';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { MessagesModule } from '../messages/messages.module';

@Module({
  imports: [TypeOrmModule.forFeature([Cart]), MessagesModule],
  providers: [AnalyticsService],
  controllers: [AnalyticsController],
})
export class AnalyticsModule {}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/analytics/analytics.controller.ts backend/src/analytics/analytics.module.ts
git commit -m "feat: add AnalyticsController and AnalyticsModule"
```

---

### Task 4: Verify Full Build + Test Endpoints

**Files:** None created. Verification only.

- [ ] **Step 1: Run all tests**

Run from `backend/`:
```bash
npm test -- --no-coverage
```

Expected: All test suites pass. No failures.

- [ ] **Step 2: Build TypeScript**

```bash
npm run build
```

Expected: `Successfully compiled` with zero errors.

- [ ] **Step 3: Start services**

Run from project root:
```bash
docker-compose up -d
docker-compose logs -f backend
```

Wait until you see: `CartCloser API running on http://localhost:3000`

- [ ] **Step 4: Register + get analytics (end-to-end test)**

```bash
# 1. Register
RESPONSE=$(curl -s -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@mystore.com","password":"password123","shopifyStoreName":"mystore.myshopify.com","whatsappPhoneNumber":"+1234567890"}')
echo $RESPONSE
# Expected: {"accessToken":"eyJ...","merchantId":"uuid"}

# 2. Extract token (copy from output above)
TOKEN="eyJ..."  # paste your token here

# 3. Hit dashboard
curl -s http://localhost:3000/analytics/dashboard \
  -H "Authorization: Bearer $TOKEN" | python -m json.tool
# Expected: JSON with summary, messages, dailyBreakdown, revenueTrend, topCustomers keys
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: Phase 2 complete — MessagesModule and AnalyticsModule fully implemented"
```
