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
