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
