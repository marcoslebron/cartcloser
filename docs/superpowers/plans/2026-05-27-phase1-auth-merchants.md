# Phase 1: Auth + Merchants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build AuthModule (register/login with JWT) and complete MerchantsModule (service, controller, API key guard), plus wire CartsModule so the app compiles.

**Architecture:** A `@Global()` AuthModule provides JwtAuthGuard everywhere without circular imports. ApiKeyGuard lives in MerchantsModule (uses MerchantsService directly). AuthModule imports MerchantsModule to create merchants during registration. A separate UsersModule holds the User entity and UsersService.

**Tech Stack:** NestJS, TypeORM, PostgreSQL, passport-jwt, passport-local, bcrypt, class-validator

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `backend/src/main.ts` | Modify | Add ValidationPipe globally |
| `backend/src/users/user.entity.ts` | Create | User DB schema |
| `backend/src/users/users.service.ts` | Create | findByEmail, findById, create |
| `backend/src/users/users.module.ts` | Create | Wires User repository |
| `backend/src/merchants/merchants.service.ts` | Create | findById, findByApiKey, getMerchantConfig, updateConfig, create |
| `backend/src/merchants/dto/update-merchant.dto.ts` | Create | Validated DTO for PATCH /merchants/me |
| `backend/src/merchants/guards/api-key.guard.ts` | Create | Validates x-api-key header |
| `backend/src/merchants/merchants.controller.ts` | Create | GET/PATCH /merchants/me, GET /merchants/:id/config |
| `backend/src/merchants/merchants.module.ts` | Create | Wires merchants; exports MerchantsService + ApiKeyGuard |
| `backend/src/carts/carts.module.ts` | Create | Wires existing CartsService + WebhooksController |
| `backend/src/auth/dto/register.dto.ts` | Create | Validated registration payload |
| `backend/src/auth/dto/login.dto.ts` | Create | Validated login payload |
| `backend/src/auth/strategies/jwt.strategy.ts` | Create | Passport JWT strategy |
| `backend/src/auth/strategies/local.strategy.ts` | Create | Passport local (email+password) strategy |
| `backend/src/auth/guards/jwt-auth.guard.ts` | Create | Extends AuthGuard('jwt') |
| `backend/src/auth/guards/local-auth.guard.ts` | Create | Extends AuthGuard('local') |
| `backend/src/auth/auth.service.ts` | Create | validateUser, login, register (transaction) |
| `backend/src/auth/auth.controller.ts` | Create | POST /auth/register, POST /auth/login |
| `backend/src/auth/auth.module.ts` | Create | @Global(), registers JWT + Passport, exports JwtAuthGuard |

---

### Task 1: Install bcrypt and enable ValidationPipe

**Files:**
- Modify: `backend/package.json` (via npm install)
- Modify: `backend/src/main.ts`

- [ ] **Step 1: Install bcrypt**

Run from `backend/`:
```bash
npm install bcrypt
npm install --save-dev @types/bcrypt
```

Expected output: `added N packages`

- [ ] **Step 2: Update main.ts to add ValidationPipe**

Replace `backend/src/main.ts` with:
```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const allowedOrigins = [
    'http://localhost:3001',
    'http://localhost:5678',
    'http://n8n:5678',
  ];

  if (process.env.FRONTEND_URL) {
    allowedOrigins.push(process.env.FRONTEND_URL);
  }

  app.enableCors({ origin: allowedOrigins, credentials: true });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 CartCloser API running on http://localhost:${port}`);
  console.log(`📊 Database: ${process.env.DB_NAME || 'cartcloser'}`);
  console.log(`🔄 n8n: ${process.env.N8N_WEBHOOK_BASE_URL || 'http://localhost:5678'}`);
}

bootstrap();
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/main.ts backend/package.json backend/package-lock.json
git commit -m "feat: install bcrypt and enable global ValidationPipe"
```

---

### Task 2: User entity + UsersModule

**Files:**
- Create: `backend/src/users/user.entity.ts`
- Create: `backend/src/users/users.service.ts`
- Create: `backend/src/users/users.service.spec.ts`
- Create: `backend/src/users/users.module.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/users/users.service.spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { User } from './user.entity';

const mockUser = {
  id: 'user-uuid',
  email: 'test@store.com',
  passwordHash: '$2b$10$hashedpassword',
  merchantId: 'merchant-uuid',
  role: 'owner',
};

const mockRepo = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  createQueryBuilder: jest.fn(() => ({
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(mockUser),
  })),
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: mockRepo },
      ],
    }).compile();
    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  describe('findByEmail', () => {
    it('returns user with passwordHash selected', async () => {
      const result = await service.findByEmail('test@store.com');
      expect(result?.email).toBe('test@store.com');
      expect(result?.passwordHash).toBeDefined();
    });
  });

  describe('findById', () => {
    it('returns user by id', async () => {
      mockRepo.findOne.mockResolvedValue(mockUser);
      const result = await service.findById('user-uuid');
      expect(result?.id).toBe('user-uuid');
    });

    it('returns null when not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      const result = await service.findById('bad-id');
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('hashes password before saving', async () => {
      const saved = { ...mockUser };
      mockRepo.create.mockReturnValue(saved);
      mockRepo.save.mockResolvedValue(saved);

      const result = await service.create({ email: 'test@store.com', password: 'plaintext' }, 'merchant-uuid');

      const createCall = mockRepo.create.mock.calls[0][0];
      expect(createCall.passwordHash).not.toBe('plaintext');
      expect(createCall.passwordHash).toMatch(/^\$2b\$/);
      expect(result.merchantId).toBe('merchant-uuid');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `backend/`:
```bash
npm test -- --testPathPattern="users.service.spec" --no-coverage
```

Expected: FAIL — `Cannot find module './users.service'`

- [ ] **Step 3: Create User entity**

Create `backend/src/users/user.entity.ts`:
```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Merchant } from '../merchants/merchants.entity';

@Entity('users')
@Index(['email'], { unique: true })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column({ type: 'text', select: false })
  passwordHash!: string;

  @Column()
  merchantId!: string;

  @ManyToOne(() => Merchant, { onDelete: 'CASCADE' })
  merchant!: Merchant;

  @Column({ type: 'varchar', length: 20, default: 'owner' })
  role!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
```

- [ ] **Step 4: Create UsersService**

Create `backend/src/users/users.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email })
      .getOne();
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  async create(
    data: { email: string; password: string },
    merchantId: string,
  ): Promise<User> {
    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = this.usersRepository.create({
      email: data.email,
      passwordHash,
      merchantId,
      role: 'owner',
    });
    return this.usersRepository.save(user);
  }
}
```

- [ ] **Step 5: Create UsersModule**

Create `backend/src/users/users.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { UsersService } from './users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npm test -- --testPathPattern="users.service.spec" --no-coverage
```

Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add backend/src/users/
git commit -m "feat: add User entity and UsersModule"
```

---

### Task 3: MerchantsService + DTO

**Files:**
- Create: `backend/src/merchants/merchants.service.ts`
- Create: `backend/src/merchants/merchants.service.spec.ts`
- Create: `backend/src/merchants/dto/update-merchant.dto.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/merchants/merchants.service.spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { MerchantsService } from './merchants.service';
import { Merchant } from './merchants.entity';

const mockMerchant = {
  id: 'merchant-uuid',
  shopifyStoreName: 'test-store.myshopify.com',
  apiKey: 'api-key-123',
  isActive: true,
  messageTemplate: 'Hello ${cartTotal}',
  defaultDiscountPercent: 15,
  whatsappPhoneNumber: '+1234567890',
  whatsappPhoneNumberId: 'phone-id',
};

const mockRepo = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

describe('MerchantsService', () => {
  let service: MerchantsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MerchantsService,
        { provide: getRepositoryToken(Merchant), useValue: mockRepo },
      ],
    }).compile();
    service = module.get<MerchantsService>(MerchantsService);
    jest.clearAllMocks();
  });

  describe('findByApiKey', () => {
    it('returns merchant for valid active key', async () => {
      mockRepo.findOne.mockResolvedValue(mockMerchant);
      const result = await service.findByApiKey('api-key-123');
      expect(result?.id).toBe('merchant-uuid');
      expect(mockRepo.findOne).toHaveBeenCalledWith({
        where: { apiKey: 'api-key-123', isActive: true },
      });
    });

    it('returns null for invalid key', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      const result = await service.findByApiKey('bad-key');
      expect(result).toBeNull();
    });
  });

  describe('getMerchantConfig', () => {
    it('returns config fields', async () => {
      mockRepo.findOne.mockResolvedValue(mockMerchant);
      const config = await service.getMerchantConfig('merchant-uuid');
      expect(config).toEqual({
        messageTemplate: 'Hello ${cartTotal}',
        defaultDiscountPercent: 15,
        whatsappPhoneNumber: '+1234567890',
        whatsappPhoneNumberId: 'phone-id',
      });
    });

    it('throws NotFoundException when merchant not found', async () => {
      mockRepo.findOne.mockResolvedValue(null);
      await expect(service.getMerchantConfig('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateConfig', () => {
    it('applies partial updates and saves', async () => {
      const merchant = { ...mockMerchant };
      mockRepo.findOne.mockResolvedValue(merchant);
      mockRepo.save.mockResolvedValue({ ...merchant, defaultDiscountPercent: 20 });

      const result = await service.updateConfig('merchant-uuid', { defaultDiscountPercent: 20 });
      expect(result.defaultDiscountPercent).toBe(20);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --testPathPattern="merchants.service.spec" --no-coverage
```

Expected: FAIL — `Cannot find module './merchants.service'`

- [ ] **Step 3: Create UpdateMerchantDto**

Create `backend/src/merchants/dto/update-merchant.dto.ts`:
```typescript
import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';

export class UpdateMerchantDto {
  @IsOptional()
  @IsString()
  whatsappPhoneNumber?: string;

  @IsOptional()
  @IsString()
  messageTemplate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  defaultDiscountPercent?: number;

  @IsOptional()
  @IsString()
  whatsappPhoneNumberId?: string;
}
```

- [ ] **Step 4: Create MerchantsService**

Create `backend/src/merchants/merchants.service.ts`:
```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Merchant } from './merchants.entity';
import { UpdateMerchantDto } from './dto/update-merchant.dto';

@Injectable()
export class MerchantsService {
  constructor(
    @InjectRepository(Merchant)
    private merchantsRepository: Repository<Merchant>,
  ) {}

  async findById(merchantId: string): Promise<Merchant | null> {
    return this.merchantsRepository.findOne({ where: { id: merchantId } });
  }

  async getMerchantById(merchantId: string): Promise<Merchant | null> {
    return this.findById(merchantId);
  }

  async findByApiKey(apiKey: string): Promise<Merchant | null> {
    return this.merchantsRepository.findOne({ where: { apiKey, isActive: true } });
  }

  async getMerchantConfig(merchantId: string) {
    const merchant = await this.merchantsRepository.findOne({ where: { id: merchantId } });
    if (!merchant) throw new NotFoundException('Merchant not found');
    return {
      messageTemplate: merchant.messageTemplate,
      defaultDiscountPercent: merchant.defaultDiscountPercent,
      whatsappPhoneNumber: merchant.whatsappPhoneNumber,
      whatsappPhoneNumberId: merchant.whatsappPhoneNumberId,
    };
  }

  async updateConfig(merchantId: string, dto: UpdateMerchantDto): Promise<Merchant> {
    const merchant = await this.findById(merchantId);
    if (!merchant) throw new NotFoundException('Merchant not found');
    Object.assign(merchant, dto);
    return this.merchantsRepository.save(merchant);
  }

  async create(data: {
    shopifyStoreName: string;
    whatsappPhoneNumber: string;
    apiKey: string;
  }): Promise<Merchant> {
    const merchant = this.merchantsRepository.create({
      ...data,
      shopifyAccessToken: '',
      apiSecret: '',
      isActive: true,
    });
    return this.merchantsRepository.save(merchant);
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- --testPathPattern="merchants.service.spec" --no-coverage
```

Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/src/merchants/merchants.service.ts backend/src/merchants/merchants.service.spec.ts backend/src/merchants/dto/
git commit -m "feat: add MerchantsService and UpdateMerchantDto"
```

---

### Task 4: ApiKeyGuard + MerchantsController + MerchantsModule

**Files:**
- Create: `backend/src/merchants/guards/api-key.guard.ts`
- Create: `backend/src/merchants/guards/api-key.guard.spec.ts`
- Create: `backend/src/merchants/merchants.controller.ts`
- Create: `backend/src/merchants/merchants.module.ts`

- [ ] **Step 1: Write the failing guard test**

Create `backend/src/merchants/guards/api-key.guard.spec.ts`:
```typescript
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';

const mockMerchantsService = {
  findByApiKey: jest.fn(),
};

function makeContext(apiKey?: string) {
  const request = { headers: apiKey ? { 'x-api-key': apiKey } : {}, merchant: undefined };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    _request: request,
  } as unknown as ExecutionContext;
}

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;

  beforeEach(() => {
    guard = new ApiKeyGuard(mockMerchantsService as any);
    jest.clearAllMocks();
  });

  it('throws UnauthorizedException when no api key header', async () => {
    await expect(guard.canActivate(makeContext())).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when key is invalid', async () => {
    mockMerchantsService.findByApiKey.mockResolvedValue(null);
    await expect(guard.canActivate(makeContext('bad-key'))).rejects.toThrow(UnauthorizedException);
  });

  it('returns true and attaches merchant when key is valid', async () => {
    const merchant = { id: 'merchant-uuid', apiKey: 'valid-key', isActive: true };
    mockMerchantsService.findByApiKey.mockResolvedValue(merchant);
    const ctx = makeContext('valid-key');
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect((ctx as any)._request.merchant).toEqual(merchant);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --testPathPattern="api-key.guard.spec" --no-coverage
```

Expected: FAIL — `Cannot find module './api-key.guard'`

- [ ] **Step 3: Create ApiKeyGuard**

Create `backend/src/merchants/guards/api-key.guard.ts`:
```typescript
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { MerchantsService } from '../merchants.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private merchantsService: MerchantsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];

    if (!apiKey) {
      throw new UnauthorizedException('API key required');
    }

    const merchant = await this.merchantsService.findByApiKey(apiKey);
    if (!merchant) {
      throw new UnauthorizedException('Invalid API key');
    }

    request.merchant = merchant;
    return true;
  }
}
```

- [ ] **Step 4: Run guard tests to verify they pass**

```bash
npm test -- --testPathPattern="api-key.guard.spec" --no-coverage
```

Expected: PASS (3 tests)

- [ ] **Step 5: Create MerchantsController**

Create `backend/src/merchants/merchants.controller.ts`:
```typescript
import { Controller, Get, Patch, Body, Param, Req, UseGuards } from '@nestjs/common';
import { MerchantsService } from './merchants.service';
import { UpdateMerchantDto } from './dto/update-merchant.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiKeyGuard } from './guards/api-key.guard';

@Controller('merchants')
export class MerchantsController {
  constructor(private merchantsService: MerchantsService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(@Req() req: any) {
    return this.merchantsService.findById(req.user.merchantId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  async updateMe(@Req() req: any, @Body() dto: UpdateMerchantDto) {
    return this.merchantsService.updateConfig(req.user.merchantId, dto);
  }

  @UseGuards(ApiKeyGuard)
  @Get(':merchantId/config')
  async getConfig(@Param('merchantId') merchantId: string) {
    return this.merchantsService.getMerchantConfig(merchantId);
  }
}
```

- [ ] **Step 6: Create MerchantsModule**

Create `backend/src/merchants/merchants.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Merchant } from './merchants.entity';
import { MerchantsService } from './merchants.service';
import { MerchantsController } from './merchants.controller';
import { ApiKeyGuard } from './guards/api-key.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Merchant])],
  providers: [MerchantsService, ApiKeyGuard],
  controllers: [MerchantsController],
  exports: [MerchantsService, ApiKeyGuard],
})
export class MerchantsModule {}
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/merchants/guards/ backend/src/merchants/merchants.controller.ts backend/src/merchants/merchants.module.ts
git commit -m "feat: add ApiKeyGuard, MerchantsController, and MerchantsModule"
```

---

### Task 5: CartsModule (wires existing files)

**Files:**
- Create: `backend/src/carts/carts.module.ts`

The controller (`WebhooksController`) and service (`CartsService`) already exist; this task wires them into a module.

- [ ] **Step 1: Create CartsModule**

Create `backend/src/carts/carts.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cart } from './carts.entity';
import { CartsService } from './carts.service';
import { WebhooksController } from './carts.controller';
import { MerchantsModule } from '../merchants/merchants.module';

@Module({
  imports: [TypeOrmModule.forFeature([Cart]), MerchantsModule],
  providers: [CartsService],
  controllers: [WebhooksController],
  exports: [CartsService],
})
export class CartsModule {}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/carts/carts.module.ts
git commit -m "feat: add CartsModule to wire existing controller and service"
```

---

### Task 6: Auth DTOs + Strategies + Guards

**Files:**
- Create: `backend/src/auth/dto/register.dto.ts`
- Create: `backend/src/auth/dto/login.dto.ts`
- Create: `backend/src/auth/strategies/jwt.strategy.ts`
- Create: `backend/src/auth/strategies/local.strategy.ts`
- Create: `backend/src/auth/guards/jwt-auth.guard.ts`
- Create: `backend/src/auth/guards/local-auth.guard.ts`

- [ ] **Step 1: Create RegisterDto**

Create `backend/src/auth/dto/register.dto.ts`:
```typescript
import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  shopifyStoreName!: string;

  @IsString()
  whatsappPhoneNumber!: string;
}
```

- [ ] **Step 2: Create LoginDto**

Create `backend/src/auth/dto/login.dto.ts`:
```typescript
import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}
```

- [ ] **Step 3: Create JwtStrategy**

Create `backend/src/auth/strategies/jwt.strategy.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') || 'dev-secret',
    });
  }

  async validate(payload: any) {
    return {
      userId: payload.sub,
      merchantId: payload.merchantId,
      email: payload.email,
      role: payload.role,
    };
  }
}
```

- [ ] **Step 4: Create LocalStrategy**

Create `backend/src/auth/strategies/local.strategy.ts`:
```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from '../auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({ usernameField: 'email' });
  }

  async validate(email: string, password: string) {
    const user = await this.authService.validateUser(email, password);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    return user;
  }
}
```

- [ ] **Step 5: Create JwtAuthGuard**

Create `backend/src/auth/guards/jwt-auth.guard.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

- [ ] **Step 6: Create LocalAuthGuard**

Create `backend/src/auth/guards/local-auth.guard.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {}
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/auth/
git commit -m "feat: add auth DTOs, JWT/local strategies, and guards"
```

---

### Task 7: AuthService + AuthController + AuthModule

**Files:**
- Create: `backend/src/auth/auth.service.ts`
- Create: `backend/src/auth/auth.service.spec.ts`
- Create: `backend/src/auth/auth.controller.ts`
- Create: `backend/src/auth/auth.module.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/auth/auth.service.spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

const mockUsersService = {
  findByEmail: jest.fn(),
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('jwt-token'),
};

const mockManager = {
  getRepository: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

const mockDataSource = {
  transaction: jest.fn((cb: (manager: any) => any) => cb(mockManager)),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();
    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('validateUser', () => {
    it('returns null when user not found', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      const result = await service.validateUser('test@store.com', 'password');
      expect(result).toBeNull();
    });

    it('returns null when password is wrong', async () => {
      const hash = await bcrypt.hash('correct', 10);
      mockUsersService.findByEmail.mockResolvedValue({ id: '1', passwordHash: hash });
      const result = await service.validateUser('test@store.com', 'wrong');
      expect(result).toBeNull();
    });

    it('returns user when credentials are valid', async () => {
      const hash = await bcrypt.hash('correct', 10);
      const user = { id: '1', email: 'test@store.com', passwordHash: hash };
      mockUsersService.findByEmail.mockResolvedValue(user);
      const result = await service.validateUser('test@store.com', 'correct');
      expect(result?.id).toBe('1');
    });
  });

  describe('login', () => {
    it('returns accessToken and merchantId', async () => {
      const user = { id: 'user-1', merchantId: 'merchant-1', email: 'a@b.com', role: 'owner' };
      const result = await service.login(user);
      expect(result.accessToken).toBe('jwt-token');
      expect(result.merchantId).toBe('merchant-1');
    });
  });

  describe('register', () => {
    it('throws ConflictException when email already exists', async () => {
      mockUsersService.findByEmail.mockResolvedValue({ id: 'existing' });
      await expect(
        service.register({ email: 'a@b.com', password: 'pass1234', shopifyStoreName: 'store', whatsappPhoneNumber: '+1' }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates merchant and user in a transaction and returns JWT', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      const savedMerchant = { id: 'merchant-1' };
      const savedUser = { id: 'user-1', merchantId: 'merchant-1', email: 'a@b.com', role: 'owner' };

      mockManager.create
        .mockReturnValueOnce(savedMerchant)
        .mockReturnValueOnce(savedUser);
      mockManager.save
        .mockResolvedValueOnce(savedMerchant)
        .mockResolvedValueOnce(savedUser);
      mockManager.getRepository.mockReturnValue({ create: mockManager.create, save: mockManager.save });

      const result = await service.register({
        email: 'a@b.com',
        password: 'pass1234',
        shopifyStoreName: 'test-store',
        whatsappPhoneNumber: '+1234567890',
      });

      expect(result.accessToken).toBe('jwt-token');
      expect(result.merchantId).toBe('merchant-1');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --testPathPattern="auth.service.spec" --no-coverage
```

Expected: FAIL — `Cannot find module './auth.service'`

- [ ] **Step 3: Create AuthService**

Create `backend/src/auth/auth.service.ts`:
```typescript
import { Injectable, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { UsersService } from '../users/users.service';
import { Merchant } from '../merchants/merchants.entity';
import { User } from '../users/user.entity';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private dataSource: DataSource,
  ) {}

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.usersService.findByEmail(email);
    if (!user) return null;
    const valid = await bcrypt.compare(password, user.passwordHash);
    return valid ? user : null;
  }

  async login(user: any) {
    const payload = {
      sub: user.id,
      merchantId: user.merchantId,
      email: user.email,
      role: user.role,
    };
    return {
      accessToken: this.jwtService.sign(payload),
      merchantId: user.merchantId,
    };
  }

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already registered');

    return this.dataSource.transaction(async (manager) => {
      const merchantRepo = manager.getRepository(Merchant);
      const userRepo = manager.getRepository(User);

      const merchant = merchantRepo.create({
        shopifyStoreName: dto.shopifyStoreName,
        whatsappPhoneNumber: dto.whatsappPhoneNumber,
        apiKey: randomUUID(),
        shopifyAccessToken: '',
        apiSecret: '',
        isActive: true,
      });
      const savedMerchant = await merchantRepo.save(merchant);

      const passwordHash = await bcrypt.hash(dto.password, 10);
      const user = userRepo.create({
        email: dto.email,
        passwordHash,
        merchantId: savedMerchant.id,
        role: 'owner',
      });
      const savedUser = await userRepo.save(user);

      const payload = {
        sub: savedUser.id,
        merchantId: savedMerchant.id,
        email: savedUser.email,
        role: savedUser.role,
      };
      return {
        accessToken: this.jwtService.sign(payload),
        merchantId: savedMerchant.id,
      };
    });
  }
}
```

- [ ] **Step 4: Create AuthController**

Create `backend/src/auth/auth.controller.ts`:
```typescript
import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Req() req: any) {
    return this.authService.login(req.user);
  }
}
```

- [ ] **Step 5: Create AuthModule**

Create `backend/src/auth/auth.module.ts`:
```typescript
import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { UsersModule } from '../users/users.module';
import { MerchantsModule } from '../merchants/merchants.module';

@Global()
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') || 'dev-secret',
        signOptions: {
          expiresIn: config.get<string>('JWT_EXPIRES_IN') || '7d',
        },
      }),
      inject: [ConfigService],
    }),
    UsersModule,
    MerchantsModule,
  ],
  providers: [AuthService, JwtStrategy, LocalStrategy, JwtAuthGuard, LocalAuthGuard],
  controllers: [AuthController],
  exports: [JwtAuthGuard, PassportModule],
})
export class AuthModule {}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npm test -- --testPathPattern="auth.service.spec" --no-coverage
```

Expected: PASS (5 tests)

- [ ] **Step 7: Run full build to verify compilation**

Run from `backend/`:
```bash
npm run build
```

Expected: `Successfully compiled` with no TypeScript errors. If errors appear, check that all import paths match the file structure above.

- [ ] **Step 8: Commit**

```bash
git add backend/src/auth/auth.service.ts backend/src/auth/auth.service.spec.ts backend/src/auth/auth.controller.ts backend/src/auth/auth.module.ts
git commit -m "feat: add AuthService, AuthController, and AuthModule — completes Phase 1"
```

---

## Phase 1 Verification

Start services and run these manually (requires `.env` to be configured):

```bash
# From project root
docker-compose up -d

# Register a new merchant
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@mystore.com","password":"password123","shopifyStoreName":"mystore.myshopify.com","whatsappPhoneNumber":"+1234567890"}'
# Expected: { "accessToken": "eyJ...", "merchantId": "uuid" }

# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@mystore.com","password":"password123"}'
# Expected: { "accessToken": "eyJ...", "merchantId": "uuid" }

# Get merchant profile (replace TOKEN and MERCHANT_ID)
curl http://localhost:3000/merchants/me \
  -H "Authorization: Bearer TOKEN"
# Expected: merchant object

# Get merchant config via API key (for n8n)
curl http://localhost:3000/merchants/MERCHANT_ID/config \
  -H "x-api-key: API_KEY_FROM_REGISTER_RESPONSE"
# Expected: { messageTemplate, defaultDiscountPercent, whatsappPhoneNumber, whatsappPhoneNumberId }
```
