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
