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
